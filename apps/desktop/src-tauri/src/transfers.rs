//! Вкладка «Файлы»: передача файлов между своими устройствами через
//! приватное хранилище Supabase (supabase/migrations/…_transfers.sql).
//!
//! Файл идёт из интерфейса сюда двоичным телом запроса и отсюда — в
//! хранилище. Через WebView его не отправить: на Android POST из WebView не
//! доходит до сервера, а модуль HTTP передаёт тело массивом чисел в JSON —
//! для 50 МБ это слишком медленно. На компьютере полученный файл тоже
//! скачивается здесь и сохраняется в папку «Загрузки».

use std::path::{Path, PathBuf};

/// Разрешён только API хранилища Supabase и только корзина transfers.
fn check_url(url: &str, kind: &str) -> Result<(), String> {
    let rest = url.strip_prefix("https://").ok_or("Нужен адрес https")?;
    let (host, path) = rest.split_once('/').ok_or("Неверный адрес")?;
    if !host.ends_with(".supabase.co") || host.contains(['@', ':']) {
        return Err("Адрес не относится к Supabase".into());
    }
    if !path.starts_with(&format!("storage/v1/object/{kind}transfers/")) || path.contains("..") {
        return Err("Адрес не относится к корзине transfers".into());
    }
    Ok(())
}

fn header<'a>(request: &'a tauri::ipc::Request<'_>, name: &str) -> Result<&'a str, String> {
    request
        .headers()
        .get(name)
        .and_then(|v| v.to_str().ok())
        .ok_or_else(|| format!("Нет заголовка {name}"))
}

/// Отправляет файл (тело запроса) в хранилище. Заголовки: x-mayak-url — адрес
/// объекта, x-mayak-token — токен сессии, x-mayak-apikey — публикуемый ключ,
/// x-mayak-type — тип файла.
pub async fn upload(request: tauri::ipc::Request<'_>) -> Result<(), String> {
    let tauri::ipc::InvokeBody::Raw(bytes) = request.body() else {
        return Err("Ожидалось содержимое файла".into());
    };
    let url = header(&request, "x-mayak-url")?;
    check_url(url, "")?;
    let response = reqwest::Client::new()
        .post(url)
        .bearer_auth(header(&request, "x-mayak-token")?)
        .header("apikey", header(&request, "x-mayak-apikey")?)
        .header("content-type", header(&request, "x-mayak-type").unwrap_or("application/octet-stream"))
        .header("x-upsert", "false")
        .body(bytes.clone())
        .send()
        .await
        .map_err(|e| format!("Нет связи с хранилищем: {e}"))?;
    if response.status().is_success() {
        Ok(())
    } else {
        let status = response.status();
        let text = response.text().await.unwrap_or_default();
        Err(format!("Хранилище ответило {status}: {}", text.chars().take(300).collect::<String>()))
    }
}

/// Скачивает файл по подписанной ссылке и сохраняет в «Загрузки»; возвращает путь.
pub async fn save(dir: PathBuf, url: String, name: String) -> Result<String, String> {
    check_url(&url, "sign/")?;
    let response = reqwest::get(&url).await.map_err(|e| format!("Нет связи с хранилищем: {e}"))?;
    if !response.status().is_success() {
        return Err(format!("Хранилище ответило {}", response.status()));
    }
    let bytes = response.bytes().await.map_err(|e| format!("Файл не скачался: {e}"))?;
    std::fs::create_dir_all(&dir).map_err(|e| format!("Нет папки «Загрузки»: {e}"))?;
    let path = free_path(&dir, &safe_name(&name));
    std::fs::write(&path, &bytes).map_err(|e| format!("Не удалось сохранить файл: {e}"))?;
    Ok(path.display().to_string())
}

/// Имя без разделителей пути и управляющих символов; пустое — «Файл».
fn safe_name(name: &str) -> String {
    let cleaned: String = name
        .chars()
        .map(|c| if c.is_control() || matches!(c, '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|') { '_' } else { c })
        .collect();
    let trimmed = cleaned.trim().trim_matches('.').trim();
    if trimmed.is_empty() {
        "Файл".into()
    } else {
        trimmed.chars().take(200).collect()
    }
}

/// «отчёт.pdf», а если занято — «отчёт (1).pdf», «отчёт (2).pdf»…
fn free_path(dir: &Path, name: &str) -> PathBuf {
    let candidate = dir.join(name);
    if !candidate.exists() {
        return candidate;
    }
    let (stem, ext) = match name.rsplit_once('.') {
        Some((s, e)) if !s.is_empty() => (s, format!(".{e}")),
        _ => (name, String::new()),
    };
    (1..)
        .map(|i| dir.join(format!("{stem} ({i}){ext}")))
        .find(|p| !p.exists())
        .expect("бесконечный перебор")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_supabase_transfers_urls() {
        assert!(check_url("https://abc.supabase.co/storage/v1/object/transfers/u/f", "").is_ok());
        assert!(check_url("https://abc.supabase.co/storage/v1/object/sign/transfers/u/f?token=1", "sign/").is_ok());
        assert!(check_url("http://abc.supabase.co/storage/v1/object/transfers/u/f", "").is_err());
        assert!(check_url("https://evil.com/storage/v1/object/transfers/u/f", "").is_err());
        assert!(check_url("https://abc.supabase.co@evil.com/storage/v1/object/transfers/u", "").is_err());
        assert!(check_url("https://abc.supabase.co/storage/v1/object/avatars/u/f", "").is_err());
        assert!(check_url("https://abc.supabase.co/storage/v1/object/transfers/../x", "").is_err());
    }

    #[test]
    fn safe_names() {
        assert_eq!(safe_name("отчёт.pdf"), "отчёт.pdf");
        assert_eq!(safe_name("../../etc/passwd"), "_.._etc_passwd");
        assert_eq!(safe_name("a\\b:c?.txt"), "a_b_c_.txt");
        assert_eq!(safe_name("  ..  "), "Файл");
    }

    #[test]
    fn free_names() {
        let dir = tempfile::tempdir().unwrap();
        assert_eq!(free_path(dir.path(), "a.txt"), dir.path().join("a.txt"));
        std::fs::write(dir.path().join("a.txt"), "1").unwrap();
        assert_eq!(free_path(dir.path(), "a.txt"), dir.path().join("a (1).txt"));
        std::fs::write(dir.path().join("a (1).txt"), "1").unwrap();
        assert_eq!(free_path(dir.path(), "a.txt"), dir.path().join("a (2).txt"));
        assert_eq!(free_path(dir.path(), "README"), dir.path().join("README"));
    }
}
