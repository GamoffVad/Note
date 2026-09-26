//! Настольное приложение «Маяк» на Tauri 2: интерфейс — сборка apps/web,
//! заметки — в SQLite на устройстве, ключ сессии — в системном хранилище секретов.

mod secrets;
mod store;

use store::{Op, Store};
use tauri::{Manager, State};

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
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![kv_get, kv_all, kv_commit, kv_drop, session_key])
        .run(tauri::generate_context!())
        .expect("не удалось запустить приложение «Маяк»");
}
