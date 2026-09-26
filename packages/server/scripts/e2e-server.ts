import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import pg from "pg";
import { resetDatabase } from "../src/testing.ts";

/**
 * Сервер для сквозных тестов веб-клиента: пересоздаёт схему тестовой базы
 * (имя обязано содержать «test») и запускает локальный API.
 * E2E_JWKS_FILE + E2E_JWKS_PORT — раздача открытой части тестового ключа
 * как JWKS имитации Supabase Auth.
 */
const url = process.env.DATABASE_URL ?? "";
if (!new URL(url).pathname.includes("test")) {
  console.error("e2e-server работает только с тестовой базой (имя содержит «test»)");
  process.exit(1);
}
const pool = new pg.Pool({ connectionString: url });
await resetDatabase(pool);
await pool.end();

if (process.env.E2E_JWKS_FILE && process.env.E2E_JWKS_PORT) {
  const { privateJwk } = JSON.parse(readFileSync(process.env.E2E_JWKS_FILE, "utf8")) as { privateJwk: Record<string, string> };
  const { d: _private, ...publicJwk } = privateJwk;
  createServer((_, res) => {
    res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ keys: [publicJwk] }));
  }).listen(Number(process.env.E2E_JWKS_PORT), "127.0.0.1");
}

await import("./dev-server.ts");
