import type { ConflictRecord, LocalNote, OutboxEntry } from "./records.ts";
import type { SyncStatus } from "./engine.ts";

/**
 * Состояние отдельной заметки (компоненты Editor и NoteListItem).
 * «Сохранено на устройстве» и «Сохранено в облаке» — разные факты.
 */
export type NoteSyncState = "local-saved" | "syncing" | "cloud-saved" | "conflict" | "failed";

export function noteSyncState(
  note: LocalNote,
  outbox: OutboxEntry | undefined,
  conflict: ConflictRecord | undefined,
): NoteSyncState {
  if (conflict) return "conflict";
  if (outbox?.failure) return "failed";
  if (outbox?.sent) return "syncing";
  if (outbox || note.localVersion > note.syncedVersion) return "local-saved";
  return "cloud-saved";
}

export interface StatusText {
  text: string;
  /** Подсказка следующего действия; null — действие не требуется. */
  action: string | null;
  tone: "neutral" | "success" | "warning" | "danger";
}

/**
 * Тексты статуса синхронизации из DESIGN-SYSTEM.md, раздел 8.
 * Не показываем «Сохранено в облаке», пока в очереди есть изменения,
 * ошибки или конфликты.
 */
export function describeSyncStatus(status: SyncStatus, formatTime: (ms: number) => string = defaultTime): StatusText {
  if (status.conflictCount > 0) {
    return { text: "Найдены изменения с другого устройства", action: "Сравнить", tone: "warning" };
  }
  switch (status.state) {
    case "auth-required":
      return { text: "Войдите снова, чтобы продолжить синхронизацию", action: "Войти", tone: "warning" };
    case "forbidden":
      return { text: "Доступ этого устройства отозван. Изменения сохранены на устройстве", action: null, tone: "danger" };
    case "upgrade-required":
      return { text: "Обновите приложение, чтобы продолжить синхронизацию", action: null, tone: "warning" };
    case "offline":
      return { text: "Нет сети. Изменения сохранены на устройстве", action: null, tone: "neutral" };
    case "error":
      return status.lastError?.code === "LOCAL_WRITE"
        ? { text: "Не удалось сохранить на устройстве", action: "Экспортировать текст", tone: "danger" }
        : { text: "Не удалось синхронизировать. Локальная копия сохранена", action: "Повторить", tone: "danger" };
    case "syncing":
      return status.pendingCount > 0
        ? { text: `Синхронизация · ${pluralChanges(status.pendingCount)}`, action: "Посмотреть очередь", tone: "neutral" }
        : { text: "Синхронизация", action: null, tone: "neutral" };
    case "idle":
      break;
  }
  if (status.failedCount > 0) {
    return { text: "Не все изменения отправлены. Локальная копия сохранена", action: "Подробности", tone: "danger" };
  }
  if (status.pendingCount > 0) return { text: "Сохранено на устройстве", action: null, tone: "neutral" };
  if (status.lastSyncedAt !== null) {
    return { text: `Сохранено в облаке · ${formatTime(status.lastSyncedAt)}`, action: "Посмотреть устройства", tone: "success" };
  }
  return { text: "Сохранено на устройстве", action: null, tone: "neutral" };
}

export function pluralChanges(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  const word =
    mod10 === 1 && mod100 !== 11
      ? "изменение"
      : mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)
        ? "изменения"
        : "изменений";
  return `${n} ${word}`;
}

function defaultTime(ms: number): string {
  return new Date(ms).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}
