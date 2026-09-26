import { createServer } from "node:http";
import { Readable } from "node:stream";
import { authFromEnv } from "../src/auth.ts";
import { corsOriginsFromEnv, withCors } from "../src/cors.ts";
import { createPool } from "../src/db.ts";
import { createApiHandler } from "../src/http.ts";
import { SyncService } from "../src/service.ts";

/**
 * Локальный сервер API. Аутентификация по переменным окружения:
 * MAYAK_AUTH=supabase + SUPABASE_URL — проверка токенов Supabase Auth;
 * MAYAK_DEV_AUTH=1 — вход разработчика «Bearer dev:<имя>» без проверки личности.
 */
const port = Number(process.env.PORT ?? 8787);
const pool = createPool(process.env);
const auth = authFromEnv(process.env);
const handler = withCors(
  createApiHandler({
    service: new SyncService(pool),
    auth,
    log: (e) => console.log(`${e.status} ${e.route} ${e.ms}ms ${e.requestId}${e.error ? " " + e.error : ""}`),
  }),
  corsOriginsFromEnv(process.env),
);

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
}).listen(port, () => console.log(`Маяк API: http://localhost:${port}/api/v1 · вход: ${auth.constructor.name}`));
