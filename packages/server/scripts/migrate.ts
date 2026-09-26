import pg from "pg";
import { migrate } from "../src/migrate.ts";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("Задайте DATABASE_URL (см. .env.example)");
  process.exit(1);
}
const pool = new pg.Pool({ connectionString: url });
try {
  const applied = await migrate(pool);
  console.log(applied.length ? `Применены миграции: ${applied.join(", ")}` : "Новых миграций нет");
} finally {
  await pool.end();
}
