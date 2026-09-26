import { LocalWriteError, type LocalStore, type LocalTx, type StoreName } from "./types.ts";

/** Одна операция атомарной фиксации. value = null — удаление ключа. */
export type KvOp =
  | { op: "put"; store: StoreName; key: string; value: string }
  | { op: "delete"; store: StoreName; key: string }
  | { op: "clear"; store: StoreName };

/**
 * Постоянное хранилище «ключ → JSON-строка» вне JS: SQLite в настольном и
 * мобильном приложении (команды Rust через Tauri). commit применяет все
 * операции в одной транзакции SQLite — или ни одной.
 */
export interface KvBackend {
  get(store: StoreName, key: string): Promise<string | null>;
  /** Все пары хранилища в порядке ключей. */
  getAll(store: StoreName): Promise<Array<[key: string, value: string]>>;
  commit(ops: KvOp[]): Promise<void>;
  close?(): void;
}

const DELETED = Symbol("deleted");
type Overlay = Map<StoreName, { cleared: boolean; changes: Map<string, string | typeof DELETED> }>;

/**
 * LocalStore поверх KvBackend. Изменения транзакции копятся в памяти и
 * отправляются одной атомарной фиксацией; записи сериализуются, как
 * readwrite-транзакции IndexedDB. Значения хранятся как JSON: записи
 * синхронизации состоят только из строк, чисел, булевых значений, массивов
 * и объектов.
 */
export class KvLocalStore implements LocalStore {
  private queue: Promise<unknown> = Promise.resolve();
  private closed = false;

  constructor(private readonly backend: KvBackend) {}

  read<T>(fn: (tx: LocalTx) => Promise<T>): Promise<T> {
    this.assertOpen();
    return fn(new KvTx(this.backend, null));
  }

  write<T>(fn: (tx: LocalTx) => Promise<T>): Promise<T> {
    this.assertOpen();
    const run = this.queue.then(async () => {
      const overlay: Overlay = new Map();
      const tx = new KvTx(this.backend, overlay);
      const result = await fn(tx);
      tx.finish();
      if (this.closed) throw new LocalWriteError("Хранилище закрыто до фиксации транзакции");
      const ops = toOps(overlay);
      if (ops.length) {
        try {
          await this.backend.commit(ops);
        } catch (cause) {
          throw new LocalWriteError("Не удалось записать изменения на устройство", { cause });
        }
      }
      return result;
    });
    this.queue = run.catch(() => undefined);
    return run;
  }

  close(): void {
    this.closed = true;
    this.backend.close?.();
  }

  private assertOpen() {
    if (this.closed) throw new LocalWriteError("Хранилище закрыто");
  }
}

function toOps(overlay: Overlay): KvOp[] {
  const ops: KvOp[] = [];
  for (const [store, { cleared, changes }] of overlay) {
    if (cleared) ops.push({ op: "clear", store });
    for (const [key, value] of changes) {
      ops.push(value === DELETED ? { op: "delete", store, key } : { op: "put", store, key, value });
    }
  }
  return ops;
}

class KvTx implements LocalTx {
  private done = false;

  constructor(
    private readonly backend: KvBackend,
    private readonly overlay: Overlay | null,
  ) {}

  finish() {
    this.done = true;
  }

  async get<T>(store: StoreName, key: string): Promise<T | undefined> {
    this.assertActive();
    const entry = this.overlay?.get(store);
    if (entry?.changes.has(key)) {
      const v = entry.changes.get(key)!;
      return v === DELETED ? undefined : (JSON.parse(v) as T);
    }
    if (entry?.cleared) return undefined;
    const raw = await this.backend.get(store, key);
    return raw === null ? undefined : (JSON.parse(raw) as T);
  }

  async getAll<T>(store: StoreName): Promise<T[]> {
    this.assertActive();
    const entry = this.overlay?.get(store);
    if (!entry) return (await this.backend.getAll(store)).map(([, v]) => JSON.parse(v) as T);
    // В транзакции записи: слияние сохранённого с изменениями, порядок по ключу.
    const merged = new Map<string, string>();
    if (!entry.cleared) {
      for (const [key, value] of await this.backend.getAll(store)) merged.set(key, value);
    }
    for (const [key, value] of entry.changes) {
      if (value === DELETED) merged.delete(key);
      else merged.set(key, value);
    }
    return [...merged.keys()].sort().map((k) => JSON.parse(merged.get(k)!) as T);
  }

  async put<T>(store: StoreName, key: string, value: T): Promise<void> {
    this.assertWritable();
    this.entry(store).changes.set(key, JSON.stringify(value));
  }

  async delete(store: StoreName, key: string): Promise<void> {
    this.assertWritable();
    this.entry(store).changes.set(key, DELETED);
  }

  async clear(store: StoreName): Promise<void> {
    this.assertWritable();
    const entry = this.entry(store);
    entry.cleared = true;
    entry.changes.clear();
  }

  private entry(store: StoreName) {
    let entry = this.overlay!.get(store);
    if (!entry) {
      entry = { cleared: false, changes: new Map() };
      this.overlay!.set(store, entry);
    }
    return entry;
  }

  private assertWritable() {
    this.assertActive();
    if (!this.overlay) throw new LocalWriteError("Запись в транзакции только для чтения");
  }

  private assertActive() {
    if (this.done) throw new LocalWriteError("Транзакция уже завершена");
  }
}
