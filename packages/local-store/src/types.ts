/**
 * Локальное хранилище клиента (ТЗ, раздел 2): IndexedDB в браузере,
 * SQLite в native-клиентах. Интерфейс намеренно узкий: транзакция над
 * несколькими хранилищами «ключ → значение». Бизнес-правила синхронизации
 * живут в @mayak/sync и одинаковы для всех реализаций.
 *
 * Правило для реализаций и вызывающего кода: внутри транзакции ожидать
 * (await) только операции самой транзакции. Для IndexedDB любой посторонний
 * await (сеть, таймер) автоматически завершает транзакцию.
 */
export const STORE_NAMES = ["notes", "outbox", "conflicts", "shadows", "meta"] as const;
export type StoreName = (typeof STORE_NAMES)[number];

export interface LocalTx {
  get<T>(store: StoreName, key: string): Promise<T | undefined>;
  getAll<T>(store: StoreName): Promise<T[]>;
  put<T>(store: StoreName, key: string, value: T): Promise<void>;
  delete(store: StoreName, key: string): Promise<void>;
  clear(store: StoreName): Promise<void>;
}

export interface LocalStore {
  /** Транзакция только для чтения. */
  read<T>(fn: (tx: LocalTx) => Promise<T>): Promise<T>;
  /**
   * Атомарная запись: либо фиксируются все изменения, либо ни одного.
   * Промис разрешается только после commit.
   */
  write<T>(fn: (tx: LocalTx) => Promise<T>): Promise<T>;
  close(): void;
}

export class LocalWriteError extends Error {
  override readonly name = "LocalWriteError";
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
  }
}
