import { invoke } from "@tauri-apps/api/core";
import { isNativeApp, nativePlatform } from "./native.ts";

/**
 * Диктовка через Wispr Flow (https://wisprflow.ai). Своего распознавания нет:
 * кнопка «Диктовать» ставит курсор в поле, а на компьютере ещё и нажимает
 * сочетание Wispr Flow для записи без удержания (src-tauri/src/wispr.rs).
 * Текст вставляет Wispr Flow. На Android его кнопка появляется над клавиатурой,
 * когда курсор стоит в поле. В Linux Wispr Flow нет.
 */

export type DictationOutcome = "sent" | "needs_permission" | "unsupported";

export const WISPR_URL = "https://wisprflow.ai";

/** Где кнопка «Диктовать» имеет смысл. */
export function dictationAvailable(): boolean {
  if (!isNativeApp()) return false;
  return nativePlatform() !== "linux";
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
  if (nativePlatform() === "android") {
    return "Нажмите кнопку Wispr Flow над клавиатурой. Если её нет — установите Wispr Flow из Google Play.";
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
