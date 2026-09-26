import { createServer } from "node:http";
import { Readable } from "node:stream";
import pg from "pg";
import { DevTokenAuthProvider } from "../src/auth.ts";
import { createApiHandler } from "../src/http.ts";
import { SyncService } from "../src/service.ts";

/**
 * Локальный сервер API для разработки. Не для production: использует
 * DevTokenAuthProvider («Authorization: Bearer dev:<имя>»).
 */
const url = process.env.DATABASE_URL;
if (!url) {
  console.error("Задайте DATABASE_URL (см. .env.example)");
  process.exit(1);
}
const port = Number(process.env.PORT ?? 8787);
const pool = new pg.Pool({ connectionString: url });
const handler = createApiHandler({
  service: new SyncService(pool),
  auth: new DevTokenAuthProvider({ enabled: process.env.MAYAK_DEV_AUTH === "1", environment: process.env.NODE_ENV }),
  log: (e) => console.log(`${e.status} ${e.route} ${e.ms}ms ${e.requestId}${e.error ? " " + e.error : ""}`),
});

createServer(async (req, res) => {
  const body = req.method === "GET" || req.method === "HEAD" ? undefined : (Readable.toWeb(req) as ReadableStream);
  const request = new Request(`http://localhost:${port}${req.url}`, {
    method: req.method,
    headers: req.headers as Record<string, string>,
    body,
    duplex: "half",
  } as RequestInit);
  const response = await handler(request);
  res.writeHead(response.status, Object.fromEntries(response.headers));
  res.end(Buffer.from(await response.arrayBuffer()));
}).listen(port, () => console.log(`Маяк API: http://localhost:${port}/api/v1`));
