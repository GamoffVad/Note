import { z } from "zod";
import { NoteDocumentSchema } from "./document.ts";
import { MAX_MUTATIONS_PER_PUSH, PROTOCOL_VERSION } from "./limits.ts";

/**
 * Контракт /api/v1 для синхронизации заметок (ТЗ, раздел 6).
 * Протокол описан в docs/adr/0002-sync.md.
 */

/**
 * Мутация несёт полный снимок заметки: документ и признак «в корзине».
 * baseRevision — серверная ревизия, на которой основано изменение (0 — новая заметка).
 */
export const NoteMutationSchema = z.object({
  mutationId: z.uuid(),
  entity: z.literal("note"),
  entityId: z.uuid(),
  baseRevision: z.number().int().nonnegative(),
  operation: z.literal("upsert"),
  document: NoteDocumentSchema,
  deleted: z.boolean(),
});
export type NoteMutation = z.infer<typeof NoteMutationSchema>;

export const PushRequestSchema = z.object({
  protocolVersion: z.literal(PROTOCOL_VERSION),
  deviceId: z.uuid(),
  mutations: z.array(z.unknown()).min(1).max(MAX_MUTATIONS_PER_PUSH),
});
export type PushRequest = {
  protocolVersion: typeof PROTOCOL_VERSION;
  deviceId: string;
  mutations: NoteMutation[];
};

/** Серверное состояние заметки, которое видят клиенты. */
export const ServerNoteSchema = z.object({
  id: z.uuid(),
  revision: z.number().int().positive(),
  document: NoteDocumentSchema,
  deleted: z.boolean(),
  updatedAt: z.string(),
});
export type ServerNote = z.infer<typeof ServerNoteSchema>;

export type MutationResult =
  | { mutationId: string; status: "applied"; revision: number; seq: number }
  | { mutationId: string; status: "conflict"; server: ServerNote | null; serverRevision: number }
  | { mutationId: string; status: "rejected"; code: ErrorCode; message: string; retryable: false };

export interface PushResponse {
  results: MutationResult[];
}

/** Событие журнала изменений владельца. */
export interface Change {
  seq: number;
  entity: "note";
  entityId: string;
  revision: number;
  /** mutationId, породивший изменение: клиент узнаёт свои правки после потерянного ответа. */
  mutationId: string | null;
  note: ServerNote;
}

export interface PullResponse {
  changes: Change[];
  nextCursor: string;
  hasMore: boolean;
}

export interface BootstrapResponse {
  notes: ServerNote[];
  /** Курсор, с которого нужно продолжить pull после загрузки всех страниц. */
  highWaterCursor: string;
  /** Передать в следующий запрос страницы; null — страниц больше нет. */
  nextAfter: string | null;
  limits: {
    maxDocumentBytes: number;
    maxMutationsPerPush: number;
    maxPullPage: number;
    quotaBytes: number;
  };
}

export interface HistoryEntry {
  versionId: string;
  revision: number;
  document: ServerNote["document"];
  deleted: boolean;
  createdAt: string;
  sourceDeviceId: string | null;
}

export interface HistoryResponse {
  versions: HistoryEntry[];
  nextBefore: number | null;
}

export const RestoreRequestSchema = z.object({
  versionId: z.uuid(),
  baseRevision: z.number().int().nonnegative(),
  mutationId: z.uuid(),
});
export type RestoreRequest = z.infer<typeof RestoreRequestSchema>;

export const RegisterDeviceSchema = z.object({
  id: z.uuid(),
  name: z.string().min(1).max(100),
  platform: z.enum(["windows", "macos", "linux", "android", "ios", "web"]),
});
export type RegisterDevice = z.infer<typeof RegisterDeviceSchema>;
export type Platform = RegisterDevice["platform"];

export interface DeviceInfo {
  id: string;
  name: string;
  platform: Platform;
  lastSeenAt: string | null;
  revokedAt: string | null;
  current: boolean;
}

export const ERROR_CODES = [
  "VALIDATION_FAILED",
  "PAYLOAD_TOO_LARGE",
  "UNAUTHORIZED",
  "SESSION_REVOKED",
  "FORBIDDEN",
  "DEVICE_REVOKED",
  "DEVICE_NOT_REGISTERED",
  "NOT_FOUND",
  "REVISION_CONFLICT",
  "IDEMPOTENCY_MISMATCH",
  "ENTITY_PURGED",
  "CURSOR_EXPIRED",
  "INVALID_CURSOR",
  "UPGRADE_REQUIRED",
  "RATE_LIMITED",
  "SERVICE_UNAVAILABLE",
  "INTERNAL",
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

/** Тело ошибки API: без токенов, SQL и содержимого заметок. */
export interface ApiErrorBody {
  code: ErrorCode;
  message: string;
  retryable: boolean;
  requestId: string;
  details?: Record<string, unknown>;
}

export const HEADER_DEVICE = "x-mayak-device";
export const HEADER_PROTOCOL = "x-mayak-protocol";
