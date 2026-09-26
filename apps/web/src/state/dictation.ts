import { invoke } from "@tauri-apps/api/core";
import { isNativeApp, nativePlatform } from "./native.ts";

/**
 * Диктовка на компьютере — через Wispr Flow (https://wisprflow.ai): кнопка
 * «Диктовать» ставит курсор в поле и нажимает сочетание Wispr Flow для записи
 * без удержания (src-tauri/src/wispr.rs); текст вставляет Wispr Flow.
 */

export type DictationOutcome = "sent" | "needs_permission" | "unsupported";

export const WISPR_URL = "https://wisprflow.ai";

/**
 * Как работает «Диктовать»: на Android — встроенное распознавание телефона
 * (state/speech.ts), на Windows и macOS — Wispr Flow. В браузере и в Linux
 * диктовки нет: там нет ни моста к распознаванию, ни Wispr Flow.
 */
export function dictationMode(): "speech" | "wispr" | null {
  if (!isNativeApp()) return null;
  const platform = nativePlatform();
  if (platform === "android" || platform === "ios") return "speech";
  if (platform === "windows" || platform === "macos") return "wispr";
  return null;
}

/** Включает запись Wispr Flow; на телефоне достаточно курсора в поле. */
export async function startWispr(): Promise<DictationOutcome> {
  const platform = nativePlatform();
  if (platform !== "windows" && platform !== "macos") return "unsupported";
  return invoke<DictationOutcome>("wispr_start");
}

/** Короткая подсказка после нажатия: что произойдёт и что делать, если ничего не произошло. */
export function dictationHint(outcome: DictationOutcome): string {
  if (outcome === "needs_permission") {
    return "Разрешите «Маяку» управление: Системные настройки → Конфиденциальность и безопасность → Универсальный доступ. Затем нажмите «Диктовать» ещё раз.";
  }
  return "Говорите — Wispr Flow вставит текст. Если запись не началась, установите Wispr Flow и войдите в него.";
}

const HINT_KEY = "mayak.dictation.hints";

/** Подсказку показываем первые три раза и всегда, когда нужно действие пользователя. */
export function shouldShowHint(outcome: DictationOutcome): boolean {
  if (outcome === "needs_permission") return true;
  try {
    const shown = Number(localStorage.getItem(HINT_KEY) ?? "0");
    if (shown >= 3) return false;
    localStorage.setItem(HINT_KEY, String(shown + 1));
  } catch {
    // Хранилище недоступно — просто показываем подсказку.
  }
  return true;
}
