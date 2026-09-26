import { LocalWriteError, STORE_NAMES, type LocalStore, type LocalTx, type StoreName } from "./types.ts";

const DB_VERSION = 1;

/**
 * Хранилище браузера/PWA на IndexedDB. У каждого аккаунта отдельная база:
 * при смене аккаунта кэш предыдущего не показывается (ТЗ, раздел 3).
 */
export class IndexedDbLocalStore implements LocalStore {
  private constructor(private readonly db: IDBDatabase) {}

  static async open(namespace: string, factory: IDBFactory = globalThis.indexedDB): Promise<IndexedDbLocalStore> {
    if (!factory) throw new LocalWriteError("IndexedDB недоступна в этой среде");
    const request = factory.open(`mayak:${namespace}`, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      for (const name of STORE_NAMES) {
        if (!db.objectStoreNames.contains(name)) db.createObjectStore(name);
      }
    };
    const db = await promisify(request);
    return new IndexedDbLocalStore(db);
  }

  read<T>(fn: (tx: LocalTx) => Promise<T>): Promise<T> {
    return this.run("readonly", fn);
  }

  write<T>(fn: (tx: LocalTx) => Promise<T>): Promise<T> {
    return this.run("readwrite", fn);
  }

  close(): void {
    this.db.close();
  }

  private async run<T>(mode: IDBTransactionMode, fn: (tx: LocalTx) => Promise<T>): Promise<T> {
    const transaction = this.db.transaction([...STORE_NAMES], mode, { durability: "strict" });
    const completed = new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onabort = () =>
        reject(new LocalWriteError("Не удалось записать изменения на устройство", { cause: transaction.error }));
      transaction.onerror = (event) => event.preventDefault();
    });
    // Не даём unhandled rejection, если fn бросит раньше, чем мы дождёмся completed.
    completed.catch(() => undefined);
    let result: T;
    try {
      result = await fn(new IdbTx(transaction));
    } catch (error) {
      try {
        transaction.abort();
      } catch {
        // Транзакция уже завершена.
      }
      throw error;
    }
    await completed;
    return result;
  }
}

class IdbTx implements LocalTx {
  constructor(private readonly tx: IDBTransaction) {}

  get<T>(store: StoreName, key: string): Promise<T | undefined> {
    return promisify(this.tx.objectStore(store).get(key)) as Promise<T | undefined>;
  }

  async getAll<T>(store: StoreName): Promise<T[]> {
    return (await promisify(this.tx.objectStore(store).getAll())) as T[];
  }

  async put<T>(store: StoreName, key: string, value: T): Promise<void> {
    await promisify(this.tx.objectStore(store).put(value, key));
  }

  async delete(store: StoreName, key: string): Promise<void> {
    await promisify(this.tx.objectStore(store).delete(key));
  }

  async clear(store: StoreName): Promise<void> {
    await promisify(this.tx.objectStore(store).clear());
  }
}

function promisify<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Запрос постоянного хранилища браузера (ТЗ, раздел 8). Возвращает фактический
 * результат; false означает, что браузер может очистить данные сайта.
 */
export async function requestPersistentStorage(): Promise<boolean> {
  const storage = globalThis.navigator?.storage;
  if (!storage?.persist) return false;
  if (await storage.persisted()) return true;
  return storage.persist();
}
