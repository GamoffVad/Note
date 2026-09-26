import pg from "pg";
import { DevTokenAuthProvider } from "./auth.ts";
import type { Db } from "./db.ts";
import { createApiHandler } from "./http.ts";
import { migrate } from "./migrate.ts";
import { SyncService } from "./service.ts";

/**
 * Поддержка интеграционных тестов на настоящем PostgreSQL.
 * База берётся из TEST_DATABASE_URL; имя базы обязано содержать «test»,
 * потому что схема public пересоздаётся.
 */
export async function openTestDatabase(): Promise<Db | null> {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) return null;
  const name = new URL(url).pathname.slice(1);
  if (!name.includes("test")) throw new Error(`TEST_DATABASE_URL должна указывать на тестовую базу, а не «${name}»`);
  const pool = new pg.Pool({ connectionString: url, max: 20 });
  await pool.query("select 1");
  return pool;
}

export async function resetDatabase(pool: Db): Promise<void> {
  await pool.query("drop schema if exists public cascade; create schema public;");
  await migrate(pool);
}

export interface TestServer {
  service: SyncService;
  handler: (request: Request) => Promise<Response>;
  /** fetch, который обслуживается обработчиком в том же процессе, через настоящий HTTP-слой. */
  fetch: typeof fetch;
}

export function createTestServer(pool: Db): TestServer {
  const service = new SyncService(pool);
  const handler = createApiHandler({ service, auth: new DevTokenAuthProvider({ enabled: true }) });
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) =>
    handler(new Request(input, init))) as typeof fetch;
  return { service, handler, fetch: fetchImpl };
}
