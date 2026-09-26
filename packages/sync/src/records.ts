import type { ErrorCode, NoteDocument, ServerNote } from "@mayak/domain";

/** Заметка в локальной базе устройства. */
export interface LocalNote {
  id: string;
  document: NoteDocument;
  deleted: boolean;
  /** Последняя известная ревизия сервера; 0 — заметка ещё не принята сервером. */
  serverRevision: number;
  /** Счётчик локальных правок. */
  localVersion: number;
  /** localVersion, который подтверждён сервером. */
  syncedVersion: number;
  /** Время локальной правки по часам устройства — только для отображения. */
  updatedAt: string;
  /** Время подтверждения сервером по часам устройства — для «Сохранено в облаке · 10:42». */
  cloudSavedAt: string | null;
}

/**
 * Не больше одной записи outbox на объект (ТЗ, раздел 4). Пока запись не
 * отправлялась (sent = false), новые правки заменяют её снимок. После первой
 * отправки запись неизменна: повторяется тот же mutationId с тем же телом.
 * Правки, сделанные после отправки, уходят следующей мутацией после ack.
 */
export interface OutboxEntry {
  entityId: string;
  mutationId: string;
  baseRevision: number;
  document: NoteDocument;
  deleted: boolean;
  localVersion: number;
  sent: boolean;
  attempts: number;
  nextAttemptAt: number;
  createdAt: number;
  /** Сервер окончательно отклонил изменение; нужна реакция пользователя. */
  failure: { code: ErrorCode; message: string } | null;
}

/** Обнаруженный конфликт: локальная версия остаётся в LocalNote, серверная — здесь. */
export interface ConflictRecord {
  noteId: string;
  /** null — сервер не знает заметку (например, она окончательно удалена). */
  server: ServerNote | null;
  serverRevision: number;
  detectedAt: string;
}

/** Серверный снимок, пришедший, пока у заметки есть неотправленные правки. */
export interface ShadowRecord {
  noteId: string;
  note: ServerNote;
}

export const META_CURSOR = "cursor";
export const META_DEVICE_REGISTERED = "deviceRegistered";
export const META_LAST_SYNC = "lastSyncAt";
