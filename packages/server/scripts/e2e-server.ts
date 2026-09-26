import pg from "pg";
import { resetDatabase } from "../src/testing.ts";

/**
 * Сервер для сквозных тестов веб-клиента: пересоздаёт схему тестовой базы
 * (имя обязано содержать «test») и запускает локальный API.
 */
const url = process.env.DATABASE_URL ?? "";
if (!new URL(url).pathname.includes("test")) {
  console.error("e2e-server работает только с тестовой базой (имя содержит «test»)");
  process.exit(1);
}
const pool = new pg.Pool({ connectionString: url });
await resetDatabase(pool);
await pool.end();
await import("./dev-server.ts");
