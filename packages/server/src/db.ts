import type { Pool, PoolClient } from "pg";

export type Db = Pool;

/** Выполняет fn в транзакции; ответ возвращается только после COMMIT. */
export async function withTransaction<T>(pool: Db, fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    const result = await fn(client);
    await client.query("commit");
    return result;
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
