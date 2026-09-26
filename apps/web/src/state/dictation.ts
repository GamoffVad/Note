import { invoke } from "@tauri-apps/api/core";
import { isNativeApp } from "./native.ts";

/**
 * Голосовой ввод (design/VOICE-DICTATION.md): звук записывается здесь,
 * распознаёт его локальная модель Whisper в приложении (src-tauri/src/dictation.rs).
 * Язык — только русский. Аудио не сохраняется и никуда не отправляется.
 */

export const TARGET_RATE = 16_000;
/** Предел одной записи: дольше — распознавание займёт слишком много времени. */
export const MAX_SECONDS = 180;

export interface ModelStatus {
  model: string;
  installed: boolean;
  size: number;
}

export function dictationSupported(): boolean {
  return isNativeApp();
}

export function modelStatus(): Promise<ModelStatus> {
  return invoke<ModelStatus>("dictation_status", { model: null });
}

export async function downloadModel(model: string, onProgress: (received: number, total: number) => void): Promise<void> {
  const { listen } = await import("@tauri-apps/api/event");
  const unlisten = await listen<{ received: number; total: number }>("dictation-download", (e) =>
    onProgress(e.payload.received, e.payload.total),
  );
  try {
    await invoke("dictation_download", { model });
  } finally {
    unlisten();
  }
}

export const cancelDownload = () => invoke("dictation_cancel_download");
export const cancelTranscription = () => invoke("dictation_cancel");

export function transcribe(model: string, samples: Float32Array): Promise<string> {
  // Сырое тело запроса: без преобразования в JSON (секунда звука — 64 КБ).
  const bytes = new Uint8Array(samples.buffer, samples.byteOffset, samples.byteLength);
  return invoke<string>("dictation_transcribe", bytes, { headers: { "x-mayak-model": model } });
}

/** Понижение частоты до 16 кГц: усреднение по окну (сглаживание) и линейная интерполяция. */
export function resample(input: Float32Array, fromRate: number, toRate = TARGET_RATE): Float32Array {
  if (fromRate === toRate) return input;
  const ratio = fromRate / toRate;
  const length = Math.floor(input.length / ratio);
  const out = new Float32Array(length);
  const half = Math.max(0, Math.floor(ratio / 2));
  for (let i = 0; i < length; i++) {
    const center = i * ratio;
    const start = Math.max(0, Math.floor(center) - half);
    const end = Math.min(input.length - 1, Math.floor(center) + half);
    let sum = 0;
    for (let j = start; j <= end; j++) sum += input[j]!;
    out[i] = sum / (end - start + 1);
  }
  return out;
}

export type RecorderError = "denied" | "no-microphone" | "unavailable";

export interface Recording {
  /** Останавливает запись (микрофон освобождается сразу) и отдаёт звук 16 кГц. */
  stop(): Float32Array;
  /** Отмена: микрофон освобождается, звук отбрасывается. */
  cancel(): void;
  /** Уровень громкости последних отсчётов, 0–1 — для индикатора «слушаю». */
  level(): number;
  seconds(): number;
}

/** Запрашивает микрофон (разрешение — только после нажатия «Диктовать») и начинает запись. */
export async function startRecording(): Promise<Recording> {
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
  } catch (error) {
    const name = (error as DOMException)?.name;
    const code: RecorderError =
      name === "NotAllowedError" || name === "SecurityError" ? "denied" : name === "NotFoundError" || name === "OverconstrainedError" ? "no-microphone" : "unavailable";
    throw Object.assign(new Error(code), { code });
  }
  const context = new AudioContext();
  await context.audioWorklet.addModule("/audio-capture-worklet.js");
  const source = context.createMediaStreamSource(stream);
  const node = new AudioWorkletNode(context, "mayak-capture");
  const chunks: Float32Array[] = [];
  let total = 0;
  let last = 0;
  node.port.onmessage = (e: MessageEvent<Float32Array>) => {
    chunks.push(e.data);
    total += e.data.length;
    let sum = 0;
    for (const v of e.data) sum += v * v;
    last = Math.sqrt(sum / e.data.length);
  };
  source.connect(node);
  const release = () => {
    source.disconnect();
    node.port.onmessage = null;
    for (const track of stream.getTracks()) track.stop();
    void context.close();
  };
  return {
    stop() {
      release();
      const joined = new Float32Array(total);
      let offset = 0;
      for (const c of chunks) {
        joined.set(c, offset);
        offset += c.length;
      }
      chunks.length = 0;
      return resample(joined, context.sampleRate);
    },
    cancel() {
      release();
      chunks.length = 0;
    },
    level: () => Math.min(1, last * 4),
    seconds: () => total / context.sampleRate,
  };
}

/** Вставка распознанного текста: в позицию курсора, не удаляя выделение. */
export function insertAt(value: string, position: number, text: string): { value: string; caret: number } {
  const pos = Math.max(0, Math.min(position, value.length));
  const before = value.slice(0, pos);
  const after = value.slice(pos);
  const lead = before && !/\s$/.test(before) ? " " : "";
  const trail = after && !/^[\s.,!?;:]/.test(after) ? " " : "";
  const inserted = lead + text + trail;
  return { value: before + inserted + after, caret: pos + lead.length + text.length };
}
