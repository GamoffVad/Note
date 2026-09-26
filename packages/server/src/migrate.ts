import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Db } from "./db.ts";
import { withTransaction } from "./db.ts";

export const MIGRATIONS_DIR = fileURLToPath(new URL("../migrations/", import.meta.url));

/** Схема приложения; в Supabase её нельзя публиковать через Data API. */
export const APP_SCHEMA = "mayak";

/**
 * Применяет SQL-миграции по порядку имени файла, каждую в своей транзакции.
 * Повторный запуск пропускает уже применённые версии. Миграции выполняются
 * с search_path = mayak: неквалифицированные объекты создаются в закрытой схеме.
 * Для Supabase мигратор подключается напрямую или через session pooler.
 */
export async function migrate(pool: Db, dir: string = MIGRATIONS_DIR): Promise<string[]> {
  await pool.query(`create schema if not exists ${APP_SCHEMA}`);
  // Журнал миграций ранних версий лежал в public — переносим.
  await pool.query(
    `do $$ begin
       if to_regclass('public.schema_migrations') is not null and to_regclass('${APP_SCHEMA}.schema_migrations') is null then
         alter table public.schema_migrations set schema ${APP_SCHEMA};
       end if;
     end $$`,
  );
  await pool.query(
    `create table if not exists ${APP_SCHEMA}.schema_migrations (version text primary key, applied_at timestamptz not null default now())`,
  );
  const files = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort();
  const applied: string[] = [];
  for (const file of files) {
    const version = file.replace(/\.sql$/, "");
    const sql = await readFile(join(dir, file), "utf8");
    const didApply = await withTransaction(pool, async (client) => {
      // Блокировка исключает параллельный запуск миграций.
      await client.query(`set local search_path to ${APP_SCHEMA}`);
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
