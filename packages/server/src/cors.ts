import { HEADER_DEVICE, HEADER_PROTOCOL } from "@mayak/domain";

/**
 * Источники страниц приложения Tauri 2: `tauri://localhost` на macOS и Linux,
 * `http://tauri.localhost` на Windows и Android (или https при useHttpsScheme).
 * Веб-страница на том же домене, что и API, в CORS не нуждается.
 */
export const TAURI_ORIGINS = ["tauri://localhost", "http://tauri.localhost", "https://tauri.localhost"];

const ALLOWED_METHODS = "GET, POST, DELETE";
const ALLOWED_HEADERS = ["authorization", "content-type", HEADER_DEVICE, HEADER_PROTOCOL].join(", ");

/**
 * CORS для приложений. Авторизация — заголовком Authorization (Bearer), без
 * cookies, поэтому Access-Control-Allow-Credentials не нужен. Источник
 * повторяется только из списка разрешённых; для остальных заголовков CORS нет,
 * и браузер не отдаст ответ чужой странице.
 */
export function withCors(
  handler: (request: Request) => Promise<Response>,
  allowedOrigins: readonly string[] = TAURI_ORIGINS,
): (request: Request) => Promise<Response> {
  const allowed = new Set(allowedOrigins);
  return async (request) => {
    const origin = request.headers.get("origin");
    const permitted = origin !== null && allowed.has(origin);
    if (request.method === "OPTIONS") {
      if (!permitted) return new Response(null, { status: 403, headers: { vary: "Origin" } });
      return new Response(null, {
        status: 204,
        headers: {
          "access-control-allow-origin": origin,
          "access-control-allow-methods": ALLOWED_METHODS,
          "access-control-allow-headers": ALLOWED_HEADERS,
          "access-control-max-age": "600",
          vary: "Origin",
        },
      });
    }
    const response = await handler(request);
    const headers = new Headers(response.headers);
    headers.append("vary", "Origin");
    if (permitted) {
      headers.set("access-control-allow-origin", origin);
      headers.set("access-control-expose-headers", "retry-after");
    }
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  };
}

/** Разрешённые источники: приложения Tauri и дополнительные из MAYAK_CORS_ORIGINS (через запятую). */
export function corsOriginsFromEnv(env: Record<string, string | undefined>): string[] {
  const extra = (env.MAYAK_CORS_ORIGINS ?? "")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);
  return [...TAURI_ORIGINS, ...extra];
}
