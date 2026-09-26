import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Db } from "./db.ts";
import { withTransaction } from "./db.ts";

export const MIGRATIONS_DIR = fileURLToPath(new URL("../migrations/", import.meta.url));

/**
 * Применяет SQL-миграции по порядку имени файла, каждую в своей транзакции.
 * Повторный запуск пропускает уже применённые версии.
 */
export async function migrate(pool: Db, dir: string = MIGRATIONS_DIR): Promise<string[]> {
  await pool.query(
    "create table if not exists schema_migrations (version text primary key, applied_at timestamptz not null default now())",
  );
  const files = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort();
  const applied: string[] = [];
  for (const file of files) {
    const version = file.replace(/\.sql$/, "");
    const sql = await readFile(join(dir, file), "utf8");
    const didApply = await withTransaction(pool, async (client) => {
      // Блокировка исключает параллельный запуск миграций.
      await client.query("lock table schema_migrations in exclusive mode");
      const { rowCount } = await client.query("select 1 from schema_migrations where version = $1", [version]);
      if (rowCount) return false;
      await client.query(sql);
      await client.query("insert into schema_migrations(version) values ($1)", [version]);
      return true;
    });
    if (didApply) applied.push(version);
  }
  return applied;
}
