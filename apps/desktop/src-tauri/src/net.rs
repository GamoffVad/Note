//! Сетевые запросы приложения на Android (вход Supabase, синхронизация).
//!
//! Во встроенном WebView POST к внешнему серверу не уходит (в журнале
//! Supabase — только предварительные OPTIONS), а у модуля Tauri HTTP ответ
//! на Android не доходил до интерфейса: сервер отвечал 200, вход всё равно
//! обрывался по таймауту. Здесь запрос выполняется целиком в Rust и ответ
//! возвращается одним вызовом — без потокового чтения тела.

use serde::{Deserialize, Serialize};
use std::time::Duration;

#[derive(Deserialize)]
pub struct Request {
    method: String,
    url: String,
    headers: Vec<(String, String)>,
    body: Option<String>,
}

#[derive(Serialize)]
pub struct Response {
    status: u16,
    headers: Vec<(String, String)>,
    body: String,
}

/// Разрешены только проект Supabase и сервер Маяка на Vercel, только https.
pub fn allowed(url: &str) -> bool {
    let Some(rest) = url.strip_prefix("https://") else { return false };
    let host = rest.split(['/', '?', '#']).next().unwrap_or("");
    !host.contains(['@', ':']) && (host.ends_with(".supabase.co") || host.ends_with(".vercel.app"))
}

pub async fn fetch(request: Request) -> Result<Response, String> {
    if !allowed(&request.url) {
        return Err("Адрес не разрешён".into());
    }
    let method = reqwest::Method::from_bytes(request.method.as_bytes()).map_err(|_| "Неизвестный метод")?;
    let client = reqwest::Client::builder()
        .connect_timeout(Duration::from_secs(10))
        .timeout(Duration::from_secs(30))
        .build()
        .map_err(|e| e.to_string())?;
    let mut builder = client.request(method, &request.url);
    for (name, value) in &request.headers {
        // Эти заголовки выставляет сам клиент.
        if matches!(name.to_ascii_lowercase().as_str(), "host" | "content-length" | "connection") {
            continue;
        }
        builder = builder.header(name, value);
    }
    if let Some(body) = request.body {
        builder = builder.body(body);
    }
    let response = builder.send().await.map_err(|e| format!("Нет связи с сервером: {e}"))?;
    let status = response.status().as_u16();
    let headers = response
        .headers()
        .iter()
        .filter_map(|(k, v)| v.to_str().ok().map(|v| (k.to_string(), v.to_string())))
        .collect();
    let body = response.text().await.map_err(|e| format!("Ответ не прочитан: {e}"))?;
    Ok(Response { status, headers, body })
}

#[cfg(test)]
mod tests {
    use super::allowed;

    #[test]
    fn only_project_hosts() {
        assert!(allowed("https://abc.supabase.co/auth/v1/otp?redirect_to=x"));
        assert!(allowed("https://mayak-pied-theta.vercel.app/api/v1/sync"));
        assert!(!allowed("http://abc.supabase.co/auth/v1/otp"));
        assert!(!allowed("https://evil.com/?x=.supabase.co"));
        assert!(!allowed("https://abc.supabase.co@evil.com/"));
        assert!(!allowed("https://supabase.co.evil.com/"));
    }
}
