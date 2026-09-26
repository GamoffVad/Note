//! Голосовой ввод: локальное распознавание речи Whisper (whisper.cpp).
//!
//! Звук записывает интерфейс (микрофон через WebView), сюда приходят готовые
//! отсчёты: моно, 16 кГц, f32 little-endian. Распознавание всегда на русском.
//! Модель скачивается по явному действию пользователя, проверяется по SHA-256
//! и хранится в каталоге данных приложения (design/VOICE-DICTATION.md).
//! Аудио не сохраняется: буфер живёт только до конца распознавания.

use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};

use futures_util::StreamExt;
use serde::Serialize;
use sha2::{Digest, Sha256};
use tauri::{AppHandle, Emitter, Manager};
use tokio::io::AsyncWriteExt;
use whisper_rs::{FullParams, SamplingStrategy, WhisperContext, WhisperContextParameters};

/// Модель Whisper. SHA-256 посчитаны в CI (.github/workflows/model-hashes.yml),
/// SHA-1 сверены с whisper.cpp models/README.md.
pub struct ModelInfo {
    pub id: &'static str,
    file: &'static str,
    pub size: u64,
    sha256: &'static str,
}

pub const MODELS: [ModelInfo; 2] = [
    ModelInfo {
        id: "tiny",
        file: "ggml-tiny.bin",
        size: 77_691_713,
        sha256: "be07e048e1e599ad46341c8d2a135645097a538221678b7acdd1b1919c6e1b21",
    },
    ModelInfo {
        id: "small",
        file: "ggml-small.bin",
        size: 487_601_967,
        sha256: "1be3a9b2063867b937e64e2ec7483364a79917e157fa98c5d94b5c1fffea987b",
    },
];

const MODEL_URL: &str = "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/";

/// Модель по умолчанию: на телефонах tiny, на компьютерах small (утверждено в ТЗ).
pub fn default_model() -> &'static str {
    if cfg!(any(target_os = "android", target_os = "ios")) {
        "tiny"
    } else {
        "small"
    }
}

pub fn model(id: &str) -> Result<&'static ModelInfo, String> {
    MODELS.iter().find(|m| m.id == id).ok_or_else(|| format!("Неизвестная модель: {id}"))
}

#[derive(Default)]
pub struct Dictation {
    /// Загруженная модель: повторная загрузка с диска занимает секунды.
    context: Mutex<Option<(String, Arc<WhisperContext>)>>,
    cancel_download: AtomicBool,
    cancel_transcribe: Arc<AtomicBool>,
}

fn models_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?.join("models");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

pub fn model_path(app: &AppHandle, m: &ModelInfo) -> Result<PathBuf, String> {
    Ok(models_dir(app)?.join(m.file))
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Status {
    pub model: &'static str,
    pub installed: bool,
    pub size: u64,
}

pub fn status(app: &AppHandle, id: &str) -> Result<Status, String> {
    let m = model(id)?;
    let path = model_path(app, m)?;
    // Размер совпадает только у полностью скачанного и проверенного файла.
    let installed = std::fs::metadata(&path).map(|md| md.len() == m.size).unwrap_or(false);
    Ok(Status { model: m.id, installed, size: m.size })
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct Progress {
    model: &'static str,
    received: u64,
    total: u64,
}

/// Скачивает модель во временный файл, считая SHA-256 на лету; при
/// несовпадении суммы файл удаляется и модель не устанавливается.
pub async fn download(app: AppHandle, state: &Dictation, id: &str) -> Result<(), String> {
    let m = model(id)?;
    let target = model_path(&app, m)?;
    let partial = target.with_extension("part");
    state.cancel_download.store(false, Ordering::SeqCst);

    let response = reqwest::get(format!("{MODEL_URL}{}", m.file))
        .await
        .map_err(|_| "Нет сети или сервер модели недоступен".to_string())?;
    if !response.status().is_success() {
        return Err(format!("Сервер модели ответил {}", response.status()));
    }
    let mut file = tokio::fs::File::create(&partial).await.map_err(|e| e.to_string())?;
    let mut hasher = Sha256::new();
    let mut received: u64 = 0;
    let mut last_emit: u64 = 0;
    let mut stream = response.bytes_stream();
    while let Some(chunk) = stream.next().await {
        if state.cancel_download.load(Ordering::SeqCst) {
            drop(file);
            let _ = tokio::fs::remove_file(&partial).await;
            return Err("cancelled".into());
        }
        let chunk = chunk.map_err(|_| "Загрузка прервалась. Проверьте сеть и повторите".to_string())?;
        hasher.update(&chunk);
        file.write_all(&chunk).await.map_err(|e| e.to_string())?;
        received += chunk.len() as u64;
        if received - last_emit >= 1_000_000 || received == m.size {
            last_emit = received;
            let _ = app.emit("dictation-download", Progress { model: m.id, received, total: m.size });
        }
    }
    file.flush().await.map_err(|e| e.to_string())?;
    drop(file);
    let digest: String = hasher.finalize().iter().map(|b| format!("{b:02x}")).collect();
    if received != m.size || digest != m.sha256 {
        let _ = tokio::fs::remove_file(&partial).await;
        return Err("Файл модели повреждён (контрольная сумма не совпала). Повторите загрузку".into());
    }
    tokio::fs::rename(&partial, &target).await.map_err(|e| e.to_string())?;
    Ok(())
}

pub fn cancel_download(state: &Dictation) {
    state.cancel_download.store(true, Ordering::SeqCst);
}

pub fn cancel_transcribe(state: &Dictation) {
    state.cancel_transcribe.store(true, Ordering::SeqCst);
}

pub fn delete_model(app: &AppHandle, state: &Dictation, id: &str) -> Result<(), String> {
    let m = model(id)?;
    state.context.lock().map_err(|e| e.to_string())?.take();
    let path = model_path(app, m)?;
    if path.exists() {
        std::fs::remove_file(path).map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Отсчёты f32 LE → Vec<f32>.
pub fn samples_from_bytes(bytes: &[u8]) -> Result<Vec<f32>, String> {
    if !bytes.len().is_multiple_of(4) {
        return Err("Некорректные аудиоданные".into());
    }
    Ok(bytes.chunks_exact(4).map(|c| f32::from_le_bytes([c[0], c[1], c[2], c[3]])).collect())
}

/// Распознаёт русскую речь. Выполняется в отдельном потоке: занимает секунды.
pub async fn transcribe(app: AppHandle, state: &Dictation, id: &str, samples: Vec<f32>) -> Result<String, String> {
    let m = model(id)?;
    // Меньше 0,3 с — не речь; whisper.cpp просит не меньше секунды — дополняем тишиной.
    if samples.len() < 16_000 * 3 / 10 {
        return Ok(String::new());
    }
    let context = {
        let mut guard = state.context.lock().map_err(|e| e.to_string())?;
        match guard.as_ref() {
            Some((loaded, ctx)) if loaded == m.id => ctx.clone(),
            _ => {
                let path = model_path(&app, m)?;
                if !status(&app, m.id)?.installed {
                    return Err("Модель распознавания не установлена".into());
                }
                let path = path.to_str().ok_or("Некорректный путь к модели")?.to_string();
                let ctx = Arc::new(
                    WhisperContext::new_with_params(&path, WhisperContextParameters::default())
                        .map_err(|e| format!("Не удалось загрузить модель: {e}"))?,
                );
                *guard = Some((m.id.to_string(), ctx.clone()));
                ctx
            }
        }
    };
    let cancel = state.cancel_transcribe.clone();
    cancel.store(false, Ordering::SeqCst);
    tauri::async_runtime::spawn_blocking(move || run(&context, samples, cancel))
        .await
        .map_err(|e| e.to_string())?
}

fn run(context: &WhisperContext, mut samples: Vec<f32>, cancel: Arc<AtomicBool>) -> Result<String, String> {
    if samples.len() < 16_000 {
        samples.resize(16_000 + 1_600, 0.0);
    }
    let mut state = context.create_state().map_err(|e| e.to_string())?;
    let mut params = FullParams::new(SamplingStrategy::Greedy { best_of: 1 });
    params.set_language(Some("ru"));
    params.set_translate(false);
    params.set_no_context(true);
    params.set_suppress_blank(true);
    params.set_print_special(false);
    params.set_print_progress(false);
    params.set_print_realtime(false);
    params.set_print_timestamps(false);
    let threads = std::thread::available_parallelism().map(|n| n.get()).unwrap_or(4).clamp(1, 8);
    params.set_n_threads(threads as i32);
    // Отмена распознавания. Не set_abort_callback_safe: в whisper-rs 0.16 его
    // переходник читает замыкание не того типа (Box<Box<dyn FnMut>> как F),
    // из-за чего распознавание сразу прерывается (whisper_full → −6).
    // Указатель на флаг живёт до конца функции: `cancel` держит Arc.
    unsafe extern "C" fn should_abort(user_data: *mut std::ffi::c_void) -> bool {
        // SAFETY: user_data — указатель на AtomicBool внутри Arc, живущего дольше вызова full().
        unsafe { (*(user_data as *const AtomicBool)).load(Ordering::SeqCst) }
    }
    // SAFETY: функция и указатель остаются действительными на всё время state.full().
    unsafe {
        params.set_abort_callback(Some(should_abort));
        params.set_abort_callback_user_data(Arc::as_ptr(&cancel) as *mut std::ffi::c_void);
    }
    state.full(params, &samples).map_err(|e| format!("Ошибка распознавания: {e}"))?;
    if cancel.load(Ordering::SeqCst) {
        return Err("cancelled".into());
    }
    let mut text = String::new();
    for segment in state.as_iter() {
        let part = segment.to_str_lossy().map_err(|e| e.to_string())?;
        text.push_str(&part);
    }
    Ok(clean(&text))
}

/// Убирает служебные пометки Whisper вида «[музыка]», «(смех)» и лишние пробелы.
pub fn clean(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    let mut depth = 0u32;
    for ch in text.chars() {
        match ch {
            '[' | '(' => depth += 1,
            ']' | ')' if depth > 0 => depth -= 1,
            _ if depth == 0 => out.push(ch),
            _ => {}
        }
    }
    out.split_whitespace().collect::<Vec<_>>().join(" ")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn clean_removes_annotations_and_spaces() {
        assert_eq!(clean(" Привет,  мир [музыка] (смех) и всё "), "Привет, мир и всё");
        assert_eq!(clean("[BLANK_AUDIO]"), "");
    }

    #[test]
    fn samples_roundtrip_and_validation() {
        let bytes: Vec<u8> = [0.5f32, -1.0].iter().flat_map(|v| v.to_le_bytes()).collect();
        assert_eq!(samples_from_bytes(&bytes).unwrap(), vec![0.5, -1.0]);
        assert!(samples_from_bytes(&[0, 1, 2]).is_err());
    }

    /// Настоящее распознавание: запускается в CI (задание «Распознавание речи»)
    /// с моделью и записью русской фразы: MAYAK_TEST_MODEL, MAYAK_TEST_WAV (16 кГц, моно).
    #[test]
    #[ignore]
    fn recognizes_russian_speech() {
        let model = std::env::var("MAYAK_TEST_MODEL").expect("MAYAK_TEST_MODEL");
        let wav = std::env::var("MAYAK_TEST_WAV").expect("MAYAK_TEST_WAV");
        let reader = hound::WavReader::open(wav).unwrap();
        assert_eq!(reader.spec().sample_rate, 16_000);
        let samples: Vec<f32> = reader.into_samples::<i16>().map(|s| s.unwrap() as f32 / 32768.0).collect();
        let ctx = WhisperContext::new_with_params(&model, WhisperContextParameters::default()).unwrap();
        let text = run(&ctx, samples, Arc::new(AtomicBool::new(false))).unwrap().to_lowercase();
        println!("Распознано: {text}");
        assert!(text.contains("провер"), "ожидалось слово «проверка»: {text}");
        assert!(text.contains("маяк"), "ожидалось слово «маяк»: {text}");
    }

    #[test]
    fn models_have_sha256_and_default_exists() {
        for m in &MODELS {
            assert_eq!(m.sha256.len(), 64);
        }
        assert!(model(default_model()).is_ok());
        assert!(model("large").is_err());
    }
}
