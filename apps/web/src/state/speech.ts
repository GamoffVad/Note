/**
 * Диктовка на телефоне: встроенное распознавание Android (MayakSpeech.kt в
 * src-tauri/gen/android). Мост — window.MayakSpeech, события — window.__mayakSpeech.
 */

export type SpeechEvent =
  | { type: "partial"; text: string }
  | { type: "final"; text: string }
  | { type: "listening"; value: boolean }
  | { type: "error"; code: string };

interface Bridge {
  available(): boolean;
  start(): void;
  stop(): void;
}

declare global {
  interface Window {
    MayakSpeech?: Bridge;
    __mayakSpeech?: (json: string) => void;
  }
}

export function speechBridge(): Bridge | null {
  const bridge = typeof window === "undefined" ? undefined : window.MayakSpeech;
  if (!bridge) return null;
  try {
    return bridge.available() ? bridge : null;
  } catch {
    return null;
  }
}

/** Подписка на события распознавания; возвращает отписку. Одновременно — один слушатель. */
export function onSpeech(handler: (event: SpeechEvent) => void): () => void {
  const listener = (json: string) => {
    try {
      handler(JSON.parse(json) as SpeechEvent);
    } catch {
      // Неизвестный формат — пропускаем.
    }
  };
  window.__mayakSpeech = listener;
  return () => {
    if (window.__mayakSpeech === listener) delete window.__mayakSpeech;
  };
}

/** Склеивает фразы через пробел, без двойных пробелов. */
export function joinPhrases(...parts: string[]): string {
  return parts
    .map((p) => p.trim())
    .filter(Boolean)
    .join(" ");
}

/**
 * Текст поля во время диктовки: исходный текст до курсора, продиктованное
 * (готовые фразы и текущая, ещё уточняемая) и текст после курсора.
 * Продиктованное отделяется пробелами от соседнего текста.
 */
export function composeDictation(before: string, spoken: string, after: string): { text: string; caret: number } {
  if (!spoken) return { text: before + after, caret: before.length };
  const lead = before && !/\s$/.test(before) ? " " : "";
  const tail = after && !/^[\s.,!?;:)]/.test(after) ? " " : "";
  const head = before + lead + spoken;
  return { text: head + tail + after, caret: head.length };
}

export function speechErrorText(code: string): string {
  switch (code) {
    case "permission":
      return "Нет доступа к микрофону. Разрешите его «Маяку» в настройках Android.";
    case "unavailable":
      return "На телефоне нет службы распознавания речи. Установите или включите приложение Google.";
    case "network":
      return "Распознавание недоступно без интернета. Подключитесь к сети или скачайте русский язык для распознавания без сети.";
    case "audio":
      return "Микрофон занят другим приложением.";
    default:
      return "Не удалось распознать речь. Попробуйте ещё раз.";
  }
}
