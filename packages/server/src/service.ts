import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import {
  checkDocument,
  DEFAULT_ACCOUNT_QUOTA_BYTES,
  MAX_BOOTSTRAP_PAGE,
  MAX_DOCUMENT_BYTES,
  MAX_MUTATIONS_PER_PUSH,
  MAX_PULL_PAGE,
  NoteMutationSchema,
  RegisterDeviceSchema,
  RestoreRequestSchema,
  stableStringify,
  type BootstrapResponse,
  type Change,
  type DeviceInfo,
  type HistoryResponse,
  type MutationResult,
  type NoteDocument,
  type NoteMutation,
  type PullResponse,
  type ServerNote,
} from "@mayak/domain";
import { decodeCursor, decodePageToken, encodeCursor, encodePageToken } from "./cursor.ts";
import { withTransaction, type Db } from "./db.ts";
import { ApiError } from "./errors.ts";

/** Проверенный контекст запроса: owner_id назначается сервером из сессии. */
export interface RequestContext {
  ownerId: string;
  deviceId: string;
  /** Сессия провайдера, если он её сообщает. */
  sessionId?: string | null;
}

interface NoteRow {
  id: string;
  revision: string;
  document: NoteDocument;
  deleted_at: Date | null;
  updated_at: Date;
}

export class SyncService {
  constructor(private readonly pool: Db) {}

  /** Проверка состояния: база доступна и таблицы Маяка на месте. */
  async ping(): Promise<void> {
    // Таблица, к которой у роли API есть доступ (к журналу миграций доступа нет).
    await this.pool.query("select 1 from mayak.users where false");
  }

  /** Находит или создаёт пользователя приложения по идентичности провайдера. */
  async resolveUser(authSubject: string): Promise<string> {
    const { rows } = await this.pool.query<{ id: string }>(
      `insert into mayak.users(auth_subject, quota_bytes) values ($1, $2)
       on conflict (auth_subject) do update set auth_subject = excluded.auth_subject
       returning id`,
      [authSubject, DEFAULT_ACCOUNT_QUOTA_BYTES],
    );
    const ownerId = rows[0]!.id;
    await this.pool.query("insert into mayak.sync_heads(owner_id) values ($1) on conflict do nothing", [ownerId]);
    return ownerId;
  }

  /** Сессия, отозванная вместе с устройством, больше не принимается. */
  async assertSessionActive(ownerId: string, sessionId: string | null): Promise<void> {
    if (!sessionId) return;
    const { rowCount } = await this.pool.query(
      "select 1 from mayak.revoked_sessions where owner_id = $1 and session_id = $2",
      [ownerId, sessionId],
    );
    if (rowCount) throw new ApiError("SESSION_REVOKED", "Доступ этого устройства отозван. Войдите снова");
  }

  async registerDevice(ownerId: string, input: unknown, sessionId: string | null = null): Promise<DeviceInfo> {
    const parsed = RegisterDeviceSchema.safeParse(input);
    if (!parsed.success) throw new ApiError("VALIDATION_FAILED", "Некорректные данные устройства");
    const { id, name, platform } = parsed.data;
    const { rows } = await this.pool.query<{ owner_id: string; revoked_at: Date | null }>(
      `insert into mayak.devices(owner_id, id, name, platform, last_seen_at, session_id) values ($1, $2, $3, $4, now(), $5)
       on conflict (id) do update set name = excluded.name, last_seen_at = now(), session_id = excluded.session_id
         where devices.owner_id = excluded.owner_id and devices.revoked_at is null
       returning owner_id, revoked_at`,
      [ownerId, id, name, platform, sessionId],
    );
    // Пустой результат: id занят другим аккаунтом или устройство отозвано.
    if (!rows.length) throw new ApiError("FORBIDDEN", "Это устройство нельзя зарегистрировать");
    return { id, name, platform, lastSeenAt: new Date().toISOString(), revokedAt: null, current: true };
  }

  /** Устройство должно принадлежать владельцу сессии и не быть отозванным. */
  async authorizeDevice(ownerId: string, deviceId: string, sessionId: string | null = null): Promise<void> {
    const { rows } = await this.pool.query<{ revoked_at: Date | null; session_id: string | null }>(
      "select revoked_at, session_id from mayak.devices where owner_id = $1 and id = $2",
      [ownerId, deviceId],
    );
    const device = rows[0];
    if (!device) throw new ApiError("DEVICE_NOT_REGISTERED", "Устройство не зарегистрировано");
    if (device.revoked_at) throw new ApiError("DEVICE_REVOKED", "Доступ этого устройства отозван");
    // Устройство привязано к последней сессии, с которой оно работало: её отзовём вместе с ним.
    await this.pool.query(
      `update mayak.devices set last_seen_at = now(), session_id = coalesce($3, session_id)
       where owner_id = $1 and id = $2
         and (last_seen_at is null or last_seen_at < now() - interval '1 minute' or session_id is distinct from coalesce($3, session_id))`,
      [ownerId, deviceId, sessionId],
    );
  }

  async listDevices(ctx: RequestContext): Promise<DeviceInfo[]> {
    const { rows } = await this.pool.query<{
      id: string;
      name: string;
      platform: DeviceInfo["platform"];
      last_seen_at: Date | null;
      revoked_at: Date | null;
    }>(
      `select id, name, platform, last_seen_at, revoked_at from mayak.devices
       where owner_id = $1 order by revoked_at nulls first, last_seen_at desc nulls last`,
      [ctx.ownerId],
    );
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      platform: r.platform,
      lastSeenAt: r.last_seen_at?.toISOString() ?? null,
      revokedAt: r.revoked_at?.toISOString() ?? null,
      current: r.id === ctx.deviceId,
    }));
  }

  /** Отзыв устройства закрывает и его сессию провайдера для нашего API. */
  async revokeDevice(ctx: RequestContext, deviceId: string): Promise<void> {
    await withTransaction(this.pool, async (client) => {
      const { rows } = await client.query<{ session_id: string | null }>(
        `update mayak.devices set revoked_at = coalesce(revoked_at, now())
         where owner_id = $1 and id = $2 returning session_id`,
        [ctx.ownerId, deviceId],
      );
      if (!rows[0]) throw new ApiError("NOT_FOUND", "Устройство не найдено");
      const sessionId = rows[0].session_id;
      if (sessionId && sessionId !== ctx.sessionId) {
        await client.query(
          "insert into mayak.revoked_sessions(owner_id, session_id) values ($1, $2) on conflict do nothing",
          [ctx.ownerId, sessionId],
        );
      }
    });
  }

  async push(ctx: RequestContext, rawMutations: unknown[]): Promise<MutationResult[]> {
    if (rawMutations.length > MAX_MUTATIONS_PER_PUSH) {
      throw new ApiError("PAYLOAD_TOO_LARGE", `Не больше ${MAX_MUTATIONS_PER_PUSH} изменений за запрос`);
    }
    const results: MutationResult[] = [];
    for (const raw of rawMutations) {
      const parsed = NoteMutationSchema.safeParse(raw);
      const mutationId = typeof (raw as { mutationId?: unknown })?.mutationId === "string"
        ? (raw as { mutationId: string }).mutationId
        : "";
      if (!parsed.success) {
        results.push(rejected(mutationId, "VALIDATION_FAILED", "Изменение не прошло проверку схемы"));
        continue;
      }
      const check = checkDocument(parsed.data.document);
      if (!check.ok) {
        results.push(
          check.reason === "too-large"
            ? rejected(mutationId, "PAYLOAD_TOO_LARGE", `Документ заметки больше ${MAX_DOCUMENT_BYTES} байт`)
            : rejected(mutationId, "VALIDATION_FAILED", "Документ заметки не прошёл проверку"),
        );
        continue;
      }
      results.push(await this.applyMutation(ctx, parsed.data));
    }
    return results;
  }

  /**
   * Одна мутация — одна транзакция. Блокировка строки sync_heads владельца
   * сериализует запись: seq выдаётся и фиксируется по порядку, поэтому
   * курсор не может «перепрыгнуть» ещё не зафиксированное изменение.
   */
  private async applyMutation(ctx: RequestContext, m: NoteMutation): Promise<MutationResult> {
    const requestHash = createHash("sha256").update(stableStringify(m)).digest("hex");
    return withTransaction(this.pool, async (client) => {
      const head = await client.query<{ last_seq: string }>(
        "select last_seq from mayak.sync_heads where owner_id = $1 for update",
        [ctx.ownerId],
      );
      if (!head.rows[0]) throw new Error("sync_heads отсутствует для владельца");
      const lastSeq = Number(head.rows[0].last_seq);

      const previous = await client.query<{ request_hash: string; result: MutationResult }>(
        "select request_hash, result from mayak.mutations where owner_id = $1 and mutation_id = $2",
        [ctx.ownerId, m.mutationId],
      );
      if (previous.rows[0]) {
        if (previous.rows[0].request_hash === requestHash) return previous.rows[0].result;
        return rejected(m.mutationId, "IDEMPOTENCY_MISMATCH", "Этот mutationId уже использован с другим телом");
      }

      const existing = await client.query<NoteRow>(
        `select id, revision, document, deleted_at, updated_at from mayak.notes
         where owner_id = $1 and id = $2 for update`,
        [ctx.ownerId, m.entityId],
      );
      const current = existing.rows[0];
      let revision: number;

      if (!current) {
        const purged = await client.query(
          "select 1 from mayak.purged_ids where owner_id = $1 and entity_type = 'note' and entity_id = $2",
          [ctx.ownerId, m.entityId],
        );
        if (purged.rowCount) {
          return rejected(m.mutationId, "ENTITY_PURGED", "Заметка окончательно удалена; создайте новую");
        }
        if (m.baseRevision !== 0) {
          return { mutationId: m.mutationId, status: "conflict", server: null, serverRevision: 0 };
        }
        revision = 1;
        await client.query(
          `insert into mayak.notes(owner_id, id, title, document, tags, pinned, revision, deleted_at)
           values ($1, $2, $3, $4, $5, $6, 1, case when $7::boolean then now() end)`,
          [ctx.ownerId, m.entityId, m.document.title, m.document, m.document.tags, m.document.pinned, m.deleted],
        );
      } else {
        const currentRevision = Number(current.revision);
        if (currentRevision !== m.baseRevision) {
          // Конфликт не меняет состояние и не сохраняется: повтор снова даст конфликт,
          // потому что серверная ревизия только растёт.
          return {
            mutationId: m.mutationId,
            status: "conflict",
            server: toServerNote(current),
            serverRevision: currentRevision,
          };
        }
        revision = currentRevision + 1;
        await client.query(
          `update mayak.notes set title = $3, document = $4, tags = $5, pinned = $6, revision = $7,
             deleted_at = case when $8::boolean then coalesce(deleted_at, now()) end,
             updated_at = now()
           where owner_id = $1 and id = $2`,
          [ctx.ownerId, m.entityId, m.document.title, m.document, m.document.tags, m.document.pinned, revision, m.deleted],
        );
      }

      const seq = lastSeq + 1;
      await client.query("update mayak.sync_heads set last_seq = $2 where owner_id = $1", [ctx.ownerId, seq]);
      const saved = await readNote(client, ctx.ownerId, m.entityId);
      await client.query(
        `insert into mayak.note_versions(owner_id, note_id, revision, snapshot, deleted, source_device_id)
         values ($1, $2, $3, $4, $5, $6)`,
        [ctx.ownerId, m.entityId, revision, m.document, m.deleted, ctx.deviceId],
      );
      await client.query(
        `insert into mayak.changes(owner_id, seq, entity_type, entity_id, revision, operation, mutation_id, payload)
         values ($1, $2, 'note', $3, $4, 'upsert', $5, $6)`,
        [ctx.ownerId, seq, m.entityId, revision, m.mutationId, saved],
      );
      const result: MutationResult = { mutationId: m.mutationId, status: "applied", revision, seq };
      await client.query(
        "insert into mayak.mutations(owner_id, mutation_id, request_hash, result) values ($1, $2, $3, $4)",
        [ctx.ownerId, m.mutationId, requestHash, result],
      );
      return result;
    });
  }

  async pull(ctx: RequestContext, cursor: string, limit = MAX_PULL_PAGE): Promise<PullResponse> {
    const { epoch, seq } = decodeCursor(cursor, ctx.ownerId);
    const pageSize = clampLimit(limit, MAX_PULL_PAGE);
    const head = await this.pool.query<{ epoch: number; retained_from_seq: string }>(
      "select epoch, retained_from_seq from mayak.sync_heads where owner_id = $1",
      [ctx.ownerId],
    );
    const h = head.rows[0];
    if (!h || h.epoch !== epoch || seq + 1 < Number(h.retained_from_seq)) {
      throw new ApiError("CURSOR_EXPIRED", "Журнал изменений устарел, нужна полная синхронизация");
    }
    const { rows } = await this.pool.query<{
      seq: string;
      entity_id: string;
      revision: string;
      mutation_id: string | null;
      payload: ServerNote;
    }>(
      `select seq, entity_id, revision, mutation_id, payload from mayak.changes
       where owner_id = $1 and seq > $2 order by seq limit $3`,
      [ctx.ownerId, seq, pageSize + 1],
    );
    const hasMore = rows.length > pageSize;
    const page = rows.slice(0, pageSize);
    const changes: Change[] = page.map((r) => ({
      seq: Number(r.seq),
      entity: "note",
      entityId: r.entity_id,
      revision: Number(r.revision),
      mutationId: r.mutation_id,
      note: r.payload,
    }));
    const lastSeq = changes.at(-1)?.seq ?? seq;
    await this.pool.query(
      `insert into mayak.device_cursors(owner_id, device_id, last_ack_seq) values ($1, $2, $3)
       on conflict (owner_id, device_id) do update set last_ack_seq = excluded.last_ack_seq, updated_at = now()`,
      [ctx.ownerId, ctx.deviceId, seq],
    );
    return { changes, nextCursor: encodeCursor(ctx.ownerId, epoch, lastSeq), hasMore };
  }

  /**
   * Снимок аккаунта постранично. high-water seq фиксируется до чтения первой
   * страницы: всё, что изменилось позже, клиент получит обычным pull.
   * Страницы могут содержать более новые ревизии — клиент применяет изменение,
   * только если его ревизия больше известной.
   */
  async bootstrap(ctx: RequestContext, pageToken: string | null, limit = MAX_BOOTSTRAP_PAGE): Promise<BootstrapResponse> {
    const pageSize = clampLimit(limit, MAX_BOOTSTRAP_PAGE);
    let after = "00000000-0000-0000-0000-000000000000";
    let epoch: number;
    let highWater: number;
    if (pageToken) {
      const token = decodePageToken(pageToken);
      after = token.a;
      epoch = token.e;
      highWater = token.h;
    } else {
      const head = await this.pool.query<{ epoch: number; last_seq: string }>(
        "select epoch, last_seq from mayak.sync_heads where owner_id = $1",
        [ctx.ownerId],
      );
      epoch = head.rows[0]!.epoch;
      highWater = Number(head.rows[0]!.last_seq);
    }
    const { rows } = await this.pool.query<NoteRow>(
      `select id, revision, document, deleted_at, updated_at from mayak.notes
       where owner_id = $1 and id > $2 order by id limit $3`,
      [ctx.ownerId, after, pageSize + 1],
    );
    const hasMore = rows.length > pageSize;
    const notes = rows.slice(0, pageSize).map(toServerNote);
    const quota = await this.pool.query<{ quota_bytes: string }>("select quota_bytes from mayak.users where id = $1", [
      ctx.ownerId,
    ]);
    return {
      notes,
      highWaterCursor: encodeCursor(ctx.ownerId, epoch, highWater),
      nextAfter: hasMore ? encodePageToken(notes.at(-1)!.id, epoch, highWater) : null,
      limits: {
        maxDocumentBytes: MAX_DOCUMENT_BYTES,
        maxMutationsPerPush: MAX_MUTATIONS_PER_PUSH,
        maxPullPage: MAX_PULL_PAGE,
        quotaBytes: Number(quota.rows[0]!.quota_bytes),
      },
    };
  }

  async history(ctx: RequestContext, noteId: string, before: number | null, limit = 50): Promise<HistoryResponse> {
    await this.assertNoteOwned(ctx.ownerId, noteId);
    const pageSize = clampLimit(limit, 100);
    const { rows } = await this.pool.query<{
      id: string;
      revision: string;
      snapshot: NoteDocument;
      deleted: boolean;
      created_at: Date;
      source_device_id: string | null;
    }>(
      `select id, revision, snapshot, deleted, created_at, source_device_id from mayak.note_versions
       where owner_id = $1 and note_id = $2 and ($3::bigint is null or revision < $3)
       order by revision desc limit $4`,
      [ctx.ownerId, noteId, before, pageSize + 1],
    );
    const hasMore = rows.length > pageSize;
    const versions = rows.slice(0, pageSize).map((r) => ({
      versionId: r.id,
      revision: Number(r.revision),
      document: r.snapshot,
      deleted: r.deleted,
      createdAt: r.created_at.toISOString(),
      sourceDeviceId: r.source_device_id,
    }));
    return { versions, nextBefore: hasMore ? versions.at(-1)!.revision : null };
  }

  /** Восстановление версии создаёт новую ревизию; конфликт обрабатывается как обычно. */
  async restore(ctx: RequestContext, noteId: string, input: unknown): Promise<MutationResult> {
    const parsed = RestoreRequestSchema.safeParse(input);
    if (!parsed.success) throw new ApiError("VALIDATION_FAILED", "Некорректный запрос восстановления");
    await this.assertNoteOwned(ctx.ownerId, noteId);
    const { rows } = await this.pool.query<{ snapshot: NoteDocument }>(
      "select snapshot from mayak.note_versions where owner_id = $1 and note_id = $2 and id = $3",
      [ctx.ownerId, noteId, parsed.data.versionId],
    );
    if (!rows[0]) throw new ApiError("NOT_FOUND", "Версия не найдена");
    return this.applyMutation(ctx, {
      mutationId: parsed.data.mutationId,
      entity: "note",
      entityId: noteId,
      baseRevision: parsed.data.baseRevision,
      operation: "upsert",
      document: rows[0].snapshot,
      deleted: false,
    });
  }

  private async assertNoteOwned(ownerId: string, noteId: string): Promise<void> {
    const { rowCount } = await this.pool.query("select 1 from mayak.notes where owner_id = $1 and id = $2", [
      ownerId,
      noteId,
    ]);
    // Одинаковый ответ для чужой и несуществующей заметки: существование не раскрывается.
    if (!rowCount) throw new ApiError("NOT_FOUND", "Заметка не найдена");
  }
}

async function readNote(client: PoolClient, ownerId: string, id: string): Promise<ServerNote> {
  const { rows } = await client.query<NoteRow>(
    "select id, revision, document, deleted_at, updated_at from mayak.notes where owner_id = $1 and id = $2",
    [ownerId, id],
  );
  return toServerNote(rows[0]!);
}

function toServerNote(row: NoteRow): ServerNote {
  return {
    id: row.id,
    revision: Number(row.revision),
    document: row.document,
    deleted: row.deleted_at !== null,
    updatedAt: row.updated_at.toISOString(),
  };
}

function rejected(
  mutationId: string,
  code: "VALIDATION_FAILED" | "PAYLOAD_TOO_LARGE" | "IDEMPOTENCY_MISMATCH" | "ENTITY_PURGED",
  message: string,
): MutationResult {
  return { mutationId, status: "rejected", code, message, retryable: false };
}

function clampLimit(limit: number, max: number): number {
  if (!Number.isFinite(limit) || limit < 1) return max;
  return Math.min(Math.floor(limit), max);
}
