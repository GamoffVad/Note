import pg, { type Pool, type PoolClient } from "pg";
import { SUPABASE_ROOT_CA } from "./supabase-ca.ts";

export type Db = Pool;

export interface PoolEnv {
  DATABASE_URL?: string;
  /** Корневой сертификат сервера БД (PEM). С ним соединение шифруется и сервер проверяется. */
  DATABASE_CA_CERT?: string;
  /** Размер пула приложения; в serverless-функции Supabase рекомендует 1. */
  DATABASE_POOL_MAX?: string;
}

/**
 * Пул PostgreSQL. Для Supabase из serverless-функций используется shared
 * pooler в режиме transaction (порт 6543): prepared statements там не
 * поддерживаются, поэтому запросы не задают `name` — node-postgres тогда
 * их не готовит. Пул создаётся один раз на процесс.
 */
export function createPool(env: PoolEnv): Pool {
  if (!env.DATABASE_URL) throw new Error("Задайте DATABASE_URL");
  const max = Number(env.DATABASE_POOL_MAX ?? 10);
  if (!Number.isInteger(max) || max < 1) throw new Error("DATABASE_POOL_MAX должен быть целым числом ≥ 1");
  const config: pg.PoolConfig = { connectionString: env.DATABASE_URL, max, idleTimeoutMillis: 10_000 };
  const ca = serverCaFor(env);
  if (ca) {
    // Параметры sslmode из строки подключения перекрыли бы этот объект — убираем их.
    const url = new URL(env.DATABASE_URL);
    for (const key of ["sslmode", "sslrootcert", "sslcert", "sslkey", "uselibpqcompat"]) url.searchParams.delete(key);
    config.connectionString = url.toString();
    config.ssl = { ca, rejectUnauthorized: true };
  }
  return new pg.Pool(config);
}

/**
 * Сертификат для проверки сервера БД: DATABASE_CA_CERT, а для адресов Supabase
 * без него — встроенный корневой сертификат Supabase.
 */
export function serverCaFor(env: PoolEnv): string | null {
  if (env.DATABASE_CA_CERT) return env.DATABASE_CA_CERT.replace(/\\n/g, "\n");
  if (!env.DATABASE_URL) return null;
  const host = new URL(env.DATABASE_URL).hostname;
  return host.endsWith(".supabase.com") || host.endsWith(".supabase.co") ? SUPABASE_ROOT_CA : null;
}

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
