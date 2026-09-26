//! Настольное приложение «Маяк» на Tauri 2: интерфейс — сборка apps/web,
//! заметки — в SQLite на устройстве, ключ сессии — в системном хранилище секретов.

mod dictation;
mod secrets;
mod store;

use store::{Op, Store};
use dictation::Dictation;
use tauri::{AppHandle, Manager, State};

#[tauri::command]
fn kv_get(state: State<'_, Store>, ns: String, store: String, key: String) -> Result<Option<String>, String> {
    state.get(&ns, &store, &key)
}

#[tauri::command]
fn kv_all(state: State<'_, Store>, ns: String, store: String) -> Result<Vec<(String, String)>, String> {
    state.all(&ns, &store)
}

#[tauri::command]
fn kv_commit(state: State<'_, Store>, ns: String, ops: Vec<Op>) -> Result<(), String> {
    state.commit(&ns, &ops)
}

#[tauri::command]
fn kv_drop(state: State<'_, Store>, ns: String) -> Result<(), String> {
    state.drop_namespace(&ns)
}

#[tauri::command]
fn session_key() -> Result<String, String> {
    secrets::session_key()
}

// ─── Голосовой ввод ──────────────────────────────────────────────────────

/// WebKitGTK по умолчанию отключает getUserMedia и отклоняет запросы без
/// обработчика. Разрешаем только микрофон и только странице самого приложения;
/// запись начинается лишь по нажатию «Диктовать».
#[cfg(target_os = "linux")]
fn enable_microphone_on_linux(app: &tauri::App) {
    use webkit2gtk::glib::prelude::*;
    use webkit2gtk::{PermissionRequestExt, SettingsExt, UserMediaPermissionRequest, UserMediaPermissionRequestExt, WebViewExt};
    let Some(window) = app.get_webview_window("main") else { return };
    let _ = window.with_webview(|webview| {
        let view = webview.inner();
        if let Some(settings) = WebViewExt::settings(&view) {
            settings.set_enable_media_stream(true);
        }
        view.connect_permission_request(|view, request| {
            let own_page = view.uri().is_some_and(|uri| uri.starts_with("tauri://localhost") || uri.starts_with("http://localhost:5173"));
            match request.downcast_ref::<UserMediaPermissionRequest>() {
                Some(media) if own_page && media.is_for_audio_device() && !media.is_for_video_device() => {
                    request.allow();
                    true
                }
                _ => false,
            }
        });
    });
}

#[tauri::command]
fn dictation_status(app: AppHandle, model: Option<String>) -> Result<dictation::Status, String> {
    dictation::status(&app, model.as_deref().unwrap_or(dictation::default_model()))
}

#[tauri::command]
async fn dictation_download(app: AppHandle, state: State<'_, Dictation>, model: String) -> Result<(), String> {
    dictation::download(app.clone(), &state, &model).await
}

#[tauri::command]
fn dictation_cancel_download(state: State<'_, Dictation>) {
    dictation::cancel_download(&state);
}

#[tauri::command]
fn dictation_delete_model(app: AppHandle, state: State<'_, Dictation>, model: String) -> Result<(), String> {
    dictation::delete_model(&app, &state, &model)
}

/// Тело запроса — отсчёты f32 LE (16 кГц, моно), модель — в заголовке x-mayak-model.
#[tauri::command]
async fn dictation_transcribe(
    app: AppHandle,
    state: State<'_, Dictation>,
    request: tauri::ipc::Request<'_>,
) -> Result<String, String> {
    let tauri::ipc::InvokeBody::Raw(bytes) = request.body() else {
        return Err("Ожидались аудиоданные".into());
    };
    let samples = dictation::samples_from_bytes(bytes)?;
    let model = request
        .headers()
        .get("x-mayak-model")
        .and_then(|v| v.to_str().ok())
        .unwrap_or(dictation::default_model())
        .to_string();
    dictation::transcribe(app.clone(), &state, &model, samples).await
}

#[tauri::command]
fn dictation_cancel(state: State<'_, Dictation>) {
    dictation::cancel_transcribe(&state);
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    #[allow(unused_mut)]
    let mut builder = tauri::Builder::default();
    // Одно окно на компьютер: повторный запуск (так Windows и Linux открывают
    // ссылку из письма) передаёт ссылку уже открытому приложению и поднимает окно.
    // Плагин должен быть зарегистрирован первым (документация Tauri).
    #[cfg(desktop)]
    {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.show();
                let _ = window.set_focus();
            }
        }));
    }
    builder
        .plugin(tauri_plugin_deep_link::init())
        .setup(|app| {
            // Windows и Linux: схема ссылок регистрируется при установке; в Linux
            // (AppImage) и при разработке в Windows — ещё и при запуске.
            // Сбой регистрации (нет ~/.local/share/applications или
            // update-desktop-database) не должен мешать запуску: без неё не
            // работает только вход по ссылке, вход по коду остаётся.
            #[cfg(any(target_os = "linux", all(debug_assertions, windows)))]
            {
                use tauri_plugin_deep_link::DeepLinkExt;
                if let Err(error) = app.deep_link().register_all() {
                    eprintln!("Маяк: не удалось зарегистрировать ссылки входа: {error}");
                }
            }
            let dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&dir)?;
            let store = Store::open(&dir.join("mayak.sqlite3")).map_err(std::io::Error::other)?;
            app.manage(store);
            app.manage(Dictation::default());
            #[cfg(target_os = "linux")]
            enable_microphone_on_linux(app);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            kv_get,
            kv_all,
            kv_commit,
            kv_drop,
            session_key,
            dictation_status,
            dictation_download,
            dictation_cancel_download,
            dictation_delete_model,
            dictation_transcribe,
            dictation_cancel
        ])
        .run(tauri::generate_context!())
        .expect("не удалось запустить приложение «Маяк»");
}
