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
    tauri::Builder::default()
        .setup(|app| {
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
