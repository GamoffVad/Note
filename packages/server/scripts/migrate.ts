import { createPool } from "../src/db.ts";
import { migrate } from "../src/migrate.ts";

/**
 * Миграции. Для Supabase используйте прямое подключение или session pooler
 * (порт 5432), а не transaction pooler: так рекомендует документация Supabase.
 * MIGRATION_DATABASE_URL имеет приоритет над DATABASE_URL.
 */
const url = process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL;
if (!url) {
  console.error("Задайте MIGRATION_DATABASE_URL или DATABASE_URL (см. .env.example)");
  process.exit(1);
}
const pool = createPool({ ...process.env, DATABASE_URL: url, DATABASE_POOL_MAX: "1" });
try {
  const applied = await migrate(pool);
  console.log(applied.length ? `Применены миграции: ${applied.join(", ")}` : "Новых миграций нет");
} finally {
  await pool.end();
}
