import {
  backoffDelay,
  checkDocument,
  emptyDocument,
  MAX_MUTATIONS_PER_PUSH,
  MAX_PUSH_BODY_BYTES,
  newId,
  projectTasks,
  PROTOCOL_VERSION,
  setTaskChecked,
  stableStringify,
  utf8ByteLength,
  type ErrorCode,
  type MutationResult,
  type NoteDocument,
  type NoteMutation,
  type Platform,
  type ServerNote,
  type TaskView,
} from "@mayak/domain";
import { LocalWriteError, type LocalStore, type LocalTx } from "@mayak/local-store";
import {
  META_CURSOR,
  META_DEVICE_REGISTERED,
  META_LAST_SYNC,
  type ConflictRecord,
  type LocalNote,
  type OutboxEntry,
  type ShadowRecord,
} from "./records.ts";
import { TransportError, type SyncTransport } from "./transport.ts";

export type SyncState =
  | "idle"
  | "syncing"
  | "offline"
  | "error"
  | "auth-required"
  | "forbidden"
  | "upgrade-required";

export interface SyncStatus {
  state: SyncState;
  /** Изменения, ещё не подтверждённые сервером (без окончательно отклонённых). */
  pendingCount: number;
  conflictCount: number;
  failedCount: number;
  /** Время последнего успешного обмена по часам устройства. */
  lastSyncedAt: number | null;
  lastError: { code: string; message: string } | null;
  nextRetryAt: number | null;
  /** Сколько серверных изменений получено в последнем цикле. */
  receivedInLastCycle: number;
}

export type ConflictChoice = "mine" | "theirs" | "both";

export interface SyncEngineOptions {
  store: LocalStore;
  transport: SyncTransport;
  device: { id: string; name: string; platform: Platform };
  /** Часы устройства: влияют только на расписание повторов и подписи, не на порядок изменений. */
  now?: () => number;
  random?: () => number;
}

type Listener = () => void;

/**
 * Клиентский движок синхронизации (ТЗ, раздел 4; docs/adr/0002-sync.md).
 *
 * Правка применяется локально одной транзакцией вместе с outbox — только
 * после commit можно показывать «Сохранено на устройстве». Отправка и
 * получение идут через SyncTransport и никогда не удаляют неотправленные
 * локальные изменения.
 */
export class SyncEngine {
  private readonly store: LocalStore;
  private readonly transport: SyncTransport;
  private readonly now: () => number;
  private readonly random: () => number;
  private readonly listeners = new Set<Listener>();
  private inflight: Promise<SyncStatus> | null = null;
  private status: SyncStatus = {
    state: "idle",
    pendingCount: 0,
    conflictCount: 0,
    failedCount: 0,
    lastSyncedAt: null,
    lastError: null,
    nextRetryAt: null,
    receivedInLastCycle: 0,
  };
  private received = 0;

  constructor(private readonly options: SyncEngineOptions) {
    this.store = options.store;
    this.transport = options.transport;
    this.now = options.now ?? Date.now;
    this.random = options.random ?? Math.random;
  }

  // ─── Чтение ────────────────────────────────────────────────────────────

  getNote(id: string): Promise<LocalNote | undefined> {
    return this.store.read((tx) => tx.get<LocalNote>("notes", id));
  }

  listNotes(): Promise<LocalNote[]> {
    return this.store.read((tx) => tx.getAll<LocalNote>("notes"));
  }

  async listTasks(): Promise<TaskView[]> {
    return projectTasks(await this.listNotes());
  }

  getOutbox(): Promise<OutboxEntry[]> {
    return this.store.read((tx) => tx.getAll<OutboxEntry>("outbox"));
  }

  getConflicts(): Promise<ConflictRecord[]> {
    return this.store.read((tx) => tx.getAll<ConflictRecord>("conflicts"));
  }

  getStatus(): SyncStatus {
    return { ...this.status };
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  // ─── Локальные правки ─────────────────────────────────────────────────

  /** Создаёт заметку локально; сеть не нужна. */
  async createNote(document: NoteDocument = emptyDocument(), id: string = newId()): Promise<LocalNote> {
    assertValid(document);
    const note = await this.store.write(async (tx) => {
      if (await tx.get("notes", id)) throw new Error(`Заметка ${id} уже существует`);
      const created: LocalNote = {
        id,
        document,
        deleted: false,
        serverRevision: 0,
        localVersion: 1,
        syncedVersion: 0,
        updatedAt: new Date(this.now()).toISOString(),
        cloudSavedAt: null,
      };
      await tx.put("notes", id, created);
      await this.enqueue(tx, created);
      return created;
    });
    await this.afterLocalChange();
    return note;
  }

  /** Сохраняет новый документ заметки. Промис разрешается после локального commit. */
  editNote(id: string, document: NoteDocument): Promise<LocalNote> {
    assertValid(document);
    return this.updateLocal(id, (note) => ({ ...note, document }));
  }

  /** Перемещение в корзину и восстановление из неё — обычная синхронизируемая правка. */
  setDeleted(id: string, deleted: boolean): Promise<LocalNote> {
    return this.updateLocal(id, (note) => ({ ...note, deleted }));
  }

  /** Отметка задачи меняет исходный task-блок заметки. */
  setTaskChecked(noteId: string, blockId: string, checked: boolean): Promise<LocalNote> {
    return this.updateLocal(noteId, (note) => ({ ...note, document: setTaskChecked(note.document, blockId, checked) }));
  }

  private async updateLocal(id: string, change: (note: LocalNote) => LocalNote): Promise<LocalNote> {
    const note = await this.store.write(async (tx) => {
      const current = await tx.get<LocalNote>("notes", id);
      if (!current) throw new Error(`Заметка ${id} не найдена`);
      const next: LocalNote = {
        ...change(current),
        localVersion: current.localVersion + 1,
        updatedAt: new Date(this.now()).toISOString(),
      };
      await tx.put("notes", id, next);
      await this.enqueue(tx, next);
      return next;
    });
    await this.afterLocalChange();
    return note;
  }

  /** Ставит правку в outbox в той же транзакции, что и запись заметки. */
  private async enqueue(tx: LocalTx, note: LocalNote): Promise<void> {
    // Пока конфликт не решён, правки копятся локально и не отправляются.
    if (await tx.get("conflicts", note.id)) return;
    const entry = await tx.get<OutboxEntry>("outbox", note.id);
    if (!entry) {
      await tx.put<OutboxEntry>("outbox", note.id, {
        entityId: note.id,
        mutationId: newId(),
        baseRevision: note.serverRevision,
        document: note.document,
        deleted: note.deleted,
        localVersion: note.localVersion,
        sent: false,
        attempts: 0,
        nextAttemptAt: 0,
        createdAt: this.now(),
        failure: null,
      });
    } else if (!entry.sent) {
      await tx.put<OutboxEntry>("outbox", note.id, {
        ...entry,
        document: note.document,
        deleted: note.deleted,
        localVersion: note.localVersion,
        // Новая правка может исправить причину отказа (например, размер).
        failure: null,
        nextAttemptAt: entry.failure ? 0 : entry.nextAttemptAt,
      });
    }
    // Иначе запись уже отправлялась и неизменна; правка уйдёт после ack.
  }

  // ─── Синхронизация ────────────────────────────────────────────────────

  /**
   * Один цикл: регистрация устройства (однажды), push всей готовой очереди,
   * затем pull до конца журнала. Параллельные вызовы объединяются.
   */
  syncOnce(): Promise<SyncStatus> {
    if (!this.inflight) {
      this.inflight = this.runSync().finally(() => {
        this.inflight = null;
      });
    }
    return this.inflight;
  }

  private async runSync(): Promise<SyncStatus> {
    this.received = 0;
    this.setStatus({ state: "syncing" });
    try {
      await this.ensureRegistered();
      // Push до pull: сервер быстрее узнаёт о локальных правках, а pull
      // затем приносит изменения других устройств поверх подтверждённых.
      while (await this.pushBatch()) {
        // Отправляем, пока есть готовые записи.
      }
      await this.pullAll();
      await this.store.write((tx) => tx.put("meta", META_LAST_SYNC, this.now()));
      this.setStatus({ state: "idle", lastSyncedAt: this.now(), lastError: null, nextRetryAt: null });
    } catch (error) {
      await this.handleSyncError(error);
    }
    this.status.receivedInLastCycle = this.received;
    await this.refreshCounts();
    return this.getStatus();
  }

  private async ensureRegistered(): Promise<void> {
    const registered = await this.store.read((tx) => tx.get<boolean>("meta", META_DEVICE_REGISTERED));
    if (registered) return;
    await this.transport.registerDevice(this.options.device);
    await this.store.write((tx) => tx.put("meta", META_DEVICE_REGISTERED, true));
  }

  /** Отправляет один пакет. Возвращает true, если стоит попробовать следующий. */
  private async pushBatch(): Promise<boolean> {
    const now = this.now();
    // Выбор и отметка sent — одна транзакция: параллельная правка не изменит
    // уже выбранную запись, а после сбоя мы знаем, что тело могло уйти на сервер.
    const batch = await this.store.write(async (tx) => {
      const entries = (await tx.getAll<OutboxEntry>("outbox"))
        .filter((e) => !e.failure && e.nextAttemptAt <= now)
        .sort((a, b) => a.createdAt - b.createdAt);
      const selected: OutboxEntry[] = [];
      let bytes = 512;
      for (const entry of entries) {
        if (selected.length >= MAX_MUTATIONS_PER_PUSH) break;
        const size = utf8ByteLength(stableStringify(toMutation(entry)));
        const check = checkDocument(entry.document);
        if (!check.ok) {
          await tx.put<OutboxEntry>("outbox", entry.entityId, {
            ...entry,
            failure: {
              code: check.reason === "too-large" ? "PAYLOAD_TOO_LARGE" : "VALIDATION_FAILED",
              message: check.reason === "too-large" ? "Заметка больше 1 MiB и не может быть отправлена" : check.message,
            },
          });
          continue;
        }
        if (bytes + size > MAX_PUSH_BODY_BYTES) break;
        bytes += size;
        const marked = { ...entry, sent: true };
        await tx.put("outbox", entry.entityId, marked);
        selected.push(marked);
      }
      return selected;
    });
    if (!batch.length) return false;

    let results: MutationResult[];
    try {
      const response = await this.transport.push({
        protocolVersion: PROTOCOL_VERSION,
        deviceId: this.options.device.id,
        mutations: batch.map(toMutation),
      });
      results = response.results;
    } catch (error) {
      await this.scheduleRetry(batch, error);
      throw error;
    }

    const byId = new Map(results.map((r) => [r.mutationId, r]));
    const missing = batch.filter((entry) => !byId.has(entry.mutationId));
    // Нет результата — повторим тот же mutationId позже, а не в этом же цикле.
    if (missing.length) await this.scheduleRetry(missing, null);
    for (const entry of batch) {
      const result = byId.get(entry.mutationId);
      if (!result) continue;
      await this.store.write(async (tx) => {
        if (result.status === "applied") await this.applyAck(tx, entry.entityId, entry.mutationId, result.revision);
        else if (result.status === "conflict") await this.recordConflict(tx, entry, result.server, result.serverRevision);
        else await this.markFailure(tx, entry, result.code, result.message);
      });
    }
    this.notify();
    return batch.length > 0;
  }

  private async scheduleRetry(batch: OutboxEntry[], error: unknown): Promise<void> {
    const retryAfterMs = error instanceof TransportError ? error.retryAfterMs : undefined;
    const permanent = error instanceof TransportError && isPermanentForBatch(error);
    await this.store.write(async (tx) => {
      for (const sent of batch) {
        const entry = await tx.get<OutboxEntry>("outbox", sent.entityId);
        if (!entry || entry.mutationId !== sent.mutationId) continue;
        if (permanent && error instanceof TransportError) {
          await tx.put<OutboxEntry>("outbox", entry.entityId, {
            ...entry,
            failure: { code: error.code as ErrorCode, message: error.message },
          });
          continue;
        }
        if (error instanceof TransportError && isSessionError(error)) continue;
        const attempts = entry.attempts + 1;
        await tx.put<OutboxEntry>("outbox", entry.entityId, {
          ...entry,
          attempts,
          nextAttemptAt: this.now() + backoffDelay(attempts, retryAfterMs, this.random),
        });
      }
    });
  }

  /**
   * Подтверждение сервера. Вызывается и для ответа push, и когда pull принёс
   * наше же изменение после потерянного ответа (тот же mutationId).
   */
  private async applyAck(tx: LocalTx, noteId: string, mutationId: string, revision: number): Promise<void> {
    const entry = await tx.get<OutboxEntry>("outbox", noteId);
    if (!entry || entry.mutationId !== mutationId) return; // Уже обработано.
    const note = await tx.get<LocalNote>("notes", noteId);
    await tx.delete("outbox", noteId);
    if (!note) return;
    let next: LocalNote = {
      ...note,
      serverRevision: revision,
      syncedVersion: entry.localVersion,
      cloudSavedAt: new Date(this.now()).toISOString(),
    };
    const shadow = await tx.get<ShadowRecord>("shadows", noteId);
    if (next.localVersion > entry.localVersion) {
      // Правки после отправки — следующая мутация на базе подтверждённой ревизии.
      // Если сервер уже ушёл дальше (shadow), она получит 409 и явный конфликт.
      await this.enqueue(tx, next);
    } else if (shadow && shadow.note.revision > revision) {
      // Пока ждали ack, другое устройство изменило заметку; локальных правок нет.
      next = fromServer(shadow.note, next);
      await tx.delete("shadows", noteId);
    }
    if (shadow && shadow.note.revision <= revision) await tx.delete("shadows", noteId);
    await tx.put("notes", noteId, next);
  }

  private async recordConflict(
    tx: LocalTx,
    sent: OutboxEntry,
    server: ServerNote | null,
    serverRevision: number,
  ): Promise<void> {
    const entry = await tx.get<OutboxEntry>("outbox", sent.entityId);
    if (!entry || entry.mutationId !== sent.mutationId) return;
    await tx.delete("outbox", sent.entityId);
    await tx.delete("shadows", sent.entityId);
    await tx.put<ConflictRecord>("conflicts", sent.entityId, {
      noteId: sent.entityId,
      server,
      serverRevision,
      detectedAt: new Date(this.now()).toISOString(),
    });
  }

  private async markFailure(tx: LocalTx, sent: OutboxEntry, code: ErrorCode, message: string): Promise<void> {
    const entry = await tx.get<OutboxEntry>("outbox", sent.entityId);
    if (!entry || entry.mutationId !== sent.mutationId) return;
    await tx.put<OutboxEntry>("outbox", sent.entityId, { ...entry, failure: { code, message } });
  }

  private async pullAll(): Promise<void> {
    let cursor = await this.store.read((tx) => tx.get<string>("meta", META_CURSOR));
    if (!cursor) {
      await this.fullResync();
      return;
    }
    for (;;) {
      let page;
      try {
        page = await this.transport.pull(cursor);
      } catch (error) {
        if (error instanceof TransportError && error.code === "CURSOR_EXPIRED") {
          await this.fullResync();
          return;
        }
        throw error;
      }
      const nextCursor = page.nextCursor;
      // Применение страницы и продвижение курсора — одна транзакция.
      await this.store.write(async (tx) => {
        for (const change of page.changes) await this.applyRemote(tx, change.note, change.mutationId);
        await tx.put("meta", META_CURSOR, nextCursor);
      });
      cursor = nextCursor;
      this.received += page.changes.length;
      if (page.changes.length) this.notify();
      if (!page.hasMore) return;
    }
  }

  /** Применяет серверное состояние, не перезаписывая неотправленные локальные правки. */
  private async applyRemote(tx: LocalTx, server: ServerNote, mutationId: string | null): Promise<void> {
    const outbox = await tx.get<OutboxEntry>("outbox", server.id);
    if (outbox?.sent && mutationId !== null && outbox.mutationId === mutationId) {
      await this.applyAck(tx, server.id, mutationId, server.revision);
      return;
    }
    const conflict = await tx.get<ConflictRecord>("conflicts", server.id);
    if (conflict) {
      if (server.revision > conflict.serverRevision) {
        await tx.put<ConflictRecord>("conflicts", server.id, { ...conflict, server, serverRevision: server.revision });
      }
      return;
    }
    const note = await tx.get<LocalNote>("notes", server.id);
    if (note && server.revision <= note.serverRevision) return; // Уже известно.
    if (outbox || (note && note.localVersion > note.syncedVersion)) {
      const shadow = await tx.get<ShadowRecord>("shadows", server.id);
      if (!shadow || shadow.note.revision < server.revision) {
        await tx.put<ShadowRecord>("shadows", server.id, { noteId: server.id, note: server });
      }
      return;
    }
    await tx.put("notes", server.id, fromServer(server, note));
  }

  /**
   * Полная загрузка снимка (первый запуск или 410 CURSOR_EXPIRED). Страницы
   * собираются во временную область, затем одной транзакцией атомарно
   * заменяют локальное состояние. Outbox, конфликты и неотправленные правки
   * сохраняются.
   */
  private async fullResync(): Promise<void> {
    const staged: ServerNote[] = [];
    let token: string | null = null;
    let highWater: string | null = null;
    do {
      const page = await this.transport.bootstrap(token);
      highWater ??= page.highWaterCursor;
      staged.push(...page.notes);
      token = page.nextAfter;
    } while (token);
    const serverIds = new Set(staged.map((n) => n.id));
    await this.store.write(async (tx) => {
      for (const note of staged) await this.applyRemote(tx, note, null);
      // Заметки, известные серверу раньше и исчезнувшие из снимка, окончательно
      // удалены. Неотправленные правки и конфликты не трогаем.
      for (const local of await tx.getAll<LocalNote>("notes")) {
        if (serverIds.has(local.id) || local.serverRevision === 0) continue;
        const pending =
          (await tx.get("outbox", local.id)) ||
          (await tx.get("conflicts", local.id)) ||
          local.localVersion > local.syncedVersion;
        if (!pending) await tx.delete("notes", local.id);
      }
      await tx.put("meta", META_CURSOR, highWater!);
    });
    this.received += staged.length;
    this.notify();
  }

  // ─── Конфликты ────────────────────────────────────────────────────────

  /**
   * «Моя версия» — новая мутация поверх актуальной серверной ревизии.
   * «С другого устройства» — локальная версия заменяется серверной.
   * «Сохранить обе» — локальная версия становится новой заметкой (безопасный
   * вариант по умолчанию), оригинал получает серверную версию.
   */
  async resolveConflict(noteId: string, choice: ConflictChoice): Promise<{ copyId: string | null }> {
    const result = await this.store.write(async (tx) => {
      const conflict = await tx.get<ConflictRecord>("conflicts", noteId);
      const note = await tx.get<LocalNote>("notes", noteId);
      if (!conflict || !note) throw new Error("Конфликт не найден");
      await tx.delete("conflicts", noteId);
      let copyId: string | null = null;

      if (choice === "mine") {
        const next = { ...note, serverRevision: conflict.serverRevision };
        await tx.put("notes", noteId, next);
        await this.enqueue(tx, next);
        return { copyId };
      }

      if (choice === "both") {
        copyId = newId();
        const copy: LocalNote = {
          id: copyId,
          document: { ...note.document, conflictOf: noteId },
          deleted: false,
          serverRevision: 0,
          localVersion: 1,
          syncedVersion: 0,
          updatedAt: new Date(this.now()).toISOString(),
          cloudSavedAt: null,
        };
        await tx.put("notes", copyId, copy);
        await this.enqueue(tx, copy);
      }

      // «theirs» и оригинал при «both» получают серверную версию.
      if (conflict.server) await tx.put("notes", noteId, fromServer(conflict.server, note));
      else await tx.delete("notes", noteId);
      return { copyId };
    });
    await this.afterLocalChange();
    return result;
  }

  // ─── Состояние ────────────────────────────────────────────────────────

  private async handleSyncError(error: unknown): Promise<void> {
    if (error instanceof LocalWriteError) {
      this.setStatus({ state: "error", lastError: { code: "LOCAL_WRITE", message: error.message } });
      return;
    }
    if (!(error instanceof TransportError)) {
      this.setStatus({ state: "error", lastError: { code: "INTERNAL", message: "Не удалось синхронизировать" } });
      return;
    }
    const lastError = { code: error.code, message: error.message };
    if (error.code === "DEVICE_NOT_REGISTERED") {
      // Сервер не знает устройство: зарегистрируемся заново в следующем цикле.
      await this.store.write((tx) => tx.delete("meta", META_DEVICE_REGISTERED));
    }
    if (error.status === 401) this.setStatus({ state: "auth-required", lastError });
    else if (error.status === 403) this.setStatus({ state: "forbidden", lastError });
    else if (error.status === 426) this.setStatus({ state: "upgrade-required", lastError });
    else if (error.status === 0) this.setStatus({ state: "offline", lastError });
    else this.setStatus({ state: "error", lastError });
  }

  private async refreshCounts(): Promise<void> {
    const { outbox, conflicts } = await this.store.read(async (tx) => ({
      outbox: await tx.getAll<OutboxEntry>("outbox"),
      conflicts: await tx.getAll<ConflictRecord>("conflicts"),
    }));
    const waiting = outbox.filter((e) => !e.failure);
    const nextRetryAt = waiting.length ? Math.min(...waiting.map((e) => e.nextAttemptAt)) : null;
    this.setStatus({
      pendingCount: waiting.length,
      failedCount: outbox.length - waiting.length,
      conflictCount: conflicts.length,
      nextRetryAt: nextRetryAt && nextRetryAt > this.now() ? nextRetryAt : null,
    });
  }

  private async afterLocalChange(): Promise<void> {
    await this.refreshCounts();
    this.notify();
  }

  private setStatus(patch: Partial<SyncStatus>): void {
    this.status = { ...this.status, ...patch };
    this.notify();
  }

  private notify(): void {
    for (const listener of this.listeners) listener();
  }
}

function toMutation(entry: OutboxEntry): NoteMutation {
  return {
    mutationId: entry.mutationId,
    entity: "note",
    entityId: entry.entityId,
    baseRevision: entry.baseRevision,
    operation: "upsert",
    document: entry.document,
    deleted: entry.deleted,
  };
}

function fromServer(server: ServerNote, local: LocalNote | undefined): LocalNote {
  const localVersion = local?.localVersion ?? 0;
  return {
    id: server.id,
    document: server.document,
    deleted: server.deleted,
    serverRevision: server.revision,
    localVersion,
    syncedVersion: localVersion,
    updatedAt: server.updatedAt,
    cloudSavedAt: local?.cloudSavedAt ?? null,
  };
}

function assertValid(document: NoteDocument): void {
  const check = checkDocument(document);
  // Слишком большой документ сохраняем локально, отказ будет в outbox —
  // текст пользователя не теряется. Нарушение схемы — ошибка программы.
  if (!check.ok && check.reason === "invalid") throw new Error(`Некорректный документ: ${check.message}`);
}

function isSessionError(error: TransportError): boolean {
  return error.status === 401 || error.status === 403 || error.status === 426;
}

/** Ошибки запроса целиком, которые не исправит повтор того же тела. */
function isPermanentForBatch(error: TransportError): boolean {
  return error.status === 400 || error.status === 413 || error.status === 422;
}
