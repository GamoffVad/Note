import { LocalWriteError, STORE_NAMES, type LocalStore, type LocalTx, type StoreName } from "./types.ts";

type Tables = Record<StoreName, Map<string, unknown>>;

/**
 * «Диск» для MemoryLocalStore. Переживает пересоздание хранилища, поэтому
 * тесты могут имитировать аварийное закрытие процесса: новый экземпляр
 * видит только зафиксированные транзакции.
 */
export class MemoryBacking {
  readonly tables: Tables;
  /** Следующая фиксация завершится ошибкой (имитация сбоя диска). */
  failNextCommit = false;

  constructor() {
    this.tables = Object.fromEntries(STORE_NAMES.map((n) => [n, new Map()])) as Tables;
  }
}

/** Хранилище в памяти для тестов и для работы без постоянного хранилища. */
export class MemoryLocalStore implements LocalStore {
  private queue: Promise<unknown> = Promise.resolve();
  private closed = false;

  constructor(readonly backing: MemoryBacking = new MemoryBacking()) {}

  read<T>(fn: (tx: LocalTx) => Promise<T>): Promise<T> {
    this.assertOpen();
    return fn(new OverlayTx(this.backing.tables, null));
  }

  write<T>(fn: (tx: LocalTx) => Promise<T>): Promise<T> {
    this.assertOpen();
    // Записи сериализуются, как readwrite-транзакции IndexedDB/SQLite.
    const run = this.queue.then(async () => {
      const overlay = new Map<string, Map<string, unknown>>();
      const tx = new OverlayTx(this.backing.tables, overlay);
      const result = await fn(tx);
      tx.finish();
      if (this.closed) throw new LocalWriteError("Хранилище закрыто до фиксации транзакции");
      if (this.backing.failNextCommit) {
        this.backing.failNextCommit = false;
        throw new LocalWriteError("Не удалось записать изменения на устройство");
      }
      for (const [store, changes] of overlay) {
        const table = this.backing.tables[store as StoreName];
        for (const [key, value] of changes) {
          if (value === DELETED) table.delete(key);
          else table.set(key, value);
        }
      }
      return result;
    });
    this.queue = run.catch(() => undefined);
    return run;
  }

  /** Имитирует аварийное закрытие: незафиксированные транзакции теряются. */
  close(): void {
    this.closed = true;
  }

  private assertOpen() {
    if (this.closed) throw new LocalWriteError("Хранилище закрыто");
  }
}

const DELETED = Symbol("deleted");

class OverlayTx implements LocalTx {
  private done = false;

  constructor(
    private readonly tables: Tables,
    private readonly overlay: Map<string, Map<string, unknown>> | null,
  ) {}

  finish() {
    this.done = true;
  }

  async get<T>(store: StoreName, key: string): Promise<T | undefined> {
    this.assertActive();
    const changes = this.overlay?.get(store);
    if (changes?.has(key)) {
      const v = changes.get(key);
      return v === DELETED ? undefined : (structuredClone(v) as T);
    }
    const v = this.tables[store].get(key);
    return v === undefined ? undefined : (structuredClone(v) as T);
  }

  async getAll<T>(store: StoreName): Promise<T[]> {
    this.assertActive();
    const changes = this.overlay?.get(store);
    const merged = new Map<string, unknown>(this.tables[store]);
    if (changes) {
      for (const [key, value] of changes) {
        if (value === DELETED) merged.delete(key);
        else merged.set(key, value);
      }
    }
    return [...merged.keys()].sort().map((k) => structuredClone(merged.get(k)) as T);
  }

  async put<T>(store: StoreName, key: string, value: T): Promise<void> {
    this.assertWritable();
    this.ensureStore(store).set(key, structuredClone(value));
  }

  async delete(store: StoreName, key: string): Promise<void> {
    this.assertWritable();
    this.ensureStore(store).set(key, DELETED);
  }

  async clear(store: StoreName): Promise<void> {
    this.assertWritable();
    const changes = this.ensureStore(store);
    // Удаляем всё, что было в таблице, и всё, что добавлено в этой транзакции.
    for (const key of this.tables[store].keys()) changes.set(key, DELETED);
    for (const key of changes.keys()) changes.set(key, DELETED);
  }

  private assertWritable() {
    this.assertActive();
    if (!this.overlay) throw new LocalWriteError("Запись в транзакции только для чтения");
  }

  private ensureStore(store: StoreName): Map<string, unknown> {
    let changes = this.overlay!.get(store);
    if (!changes) {
      changes = new Map();
      this.overlay!.set(store, changes);
    }
    return changes;
  }

  private assertActive() {
    if (this.done) throw new LocalWriteError("Транзакция уже завершена");
  }
}
