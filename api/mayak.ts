import { authFromEnv, corsOriginsFromEnv, createApiHandler, createPool, SyncService, withCors } from "@mayak/server";

/**
 * Vercel Function для /api/v1/*. vercel.json перезаписывает /api/v1/:path*
 * на /api/mayak, а Vercel передаёт захваченный остаток пути параметром
 * `path`; здесь исходный путь восстанавливается.
 * Пул и обработчик создаются один раз на экземпляр функции (рекомендация
 * Supabase для serverless: пул размером 1).
 */
let handler: ((request: Request) => Promise<Response>) | null = null;

function configurationError(): string | null {
  const env = process.env;
  const modes = (env.MAYAK_AUTH ?? "supabase").split(",").map((m) => m.trim());
  // Вход разработчика без проверки личности на Vercel запрещён в любом окружении.
  if (modes.includes("dev")) return "MAYAK_AUTH=dev недопустим на Vercel";
  if (!env.DATABASE_URL) return "не задан DATABASE_URL";
  if (!env.SUPABASE_URL) return "не задан SUPABASE_URL";
  return null;
}

function getHandler(): (request: Request) => Promise<Response> {
  handler ??= createApiHandler({
    service: new SyncService(createPool({ ...process.env, DATABASE_POOL_MAX: process.env.DATABASE_POOL_MAX ?? "1" })),
    auth: authFromEnv(process.env),
    // Журнал без содержимого заметок, токенов и имён файлов.
    log: (e) => console.log(JSON.stringify(e)),
  });
  return handler;
}

/** Все ответы, включая 503 «не настроено», — с CORS для приложений Tauri. */
const serve = withCors(handle, corsOriginsFromEnv(process.env));

export default {
  fetch: serve,
};

async function handle(request: Request): Promise<Response> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith("/api/v1/")) {
    const rest = url.searchParams.get("path") ?? "";
    url.searchParams.delete("path");
    url.pathname = `/api/v1/${rest.replace(/^\/+/, "")}`;
  }
  const problem = configurationError();
  if (problem) {
    console.error(`Маяк API не настроен: ${problem}`);
    return Response.json(
      {
        code: "SERVICE_UNAVAILABLE",
        message: "Синхронизация на сервере ещё не настроена",
        retryable: true,
        requestId: crypto.randomUUID(),
      },
      { status: 503, headers: { "cache-control": "no-store", "retry-after": "300" } },
    );
  }
  const hasBody = request.method !== "GET" && request.method !== "HEAD";
  const forwarded = new Request(url, {
    method: request.method,
    headers: request.headers,
    body: hasBody ? request.body : undefined,
    duplex: "half",
  } as RequestInit);
  return getHandler()(forwarded);
}
