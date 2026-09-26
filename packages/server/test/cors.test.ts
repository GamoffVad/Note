import { describe, expect, it } from "vitest";
import { corsOriginsFromEnv, withCors } from "../src/index.ts";

const handler = withCors(async () => Response.json({ ok: true }, { status: 401, headers: { "retry-after": "30" } }));

function req(method: string, origin: string | null) {
  const headers = new Headers();
  if (origin) headers.set("origin", origin);
  return new Request("https://api.example.com/api/v1/bootstrap", { method, headers });
}

describe("CORS для приложений Tauri", () => {
  it.each(["tauri://localhost", "http://tauri.localhost"])("предварительный запрос от %s разрешён", async (origin) => {
    const res = await handler(req("OPTIONS", origin));
    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-origin")).toBe(origin);
    expect(res.headers.get("access-control-allow-headers")).toContain("x-mayak-device");
    expect(res.headers.get("access-control-allow-headers")).toContain("authorization");
    expect(res.headers.get("access-control-allow-credentials")).toBeNull();
  });

  it("ответ API получает заголовки CORS и сохраняет статус и тело", async () => {
    const res = await handler(req("GET", "tauri://localhost"));
    expect(res.status).toBe(401);
    expect(res.headers.get("access-control-allow-origin")).toBe("tauri://localhost");
    expect(res.headers.get("access-control-expose-headers")).toBe("retry-after");
    expect(await res.json()).toEqual({ ok: true });
  });

  it("чужой сайт не получает разрешения", async () => {
    expect((await handler(req("OPTIONS", "https://evil.example"))).status).toBe(403);
    const res = await handler(req("GET", "https://evil.example"));
    expect(res.headers.get("access-control-allow-origin")).toBeNull();
    expect(res.headers.get("vary")).toContain("Origin");
    expect((await handler(req("GET", null))).headers.get("access-control-allow-origin")).toBeNull();
  });

  it("дополнительные источники из MAYAK_CORS_ORIGINS", async () => {
    const extra = withCors(async () => new Response(null, { status: 204 }), corsOriginsFromEnv({ MAYAK_CORS_ORIGINS: " http://localhost:1420 , " }));
    expect((await extra(req("OPTIONS", "http://localhost:1420"))).status).toBe(204);
    expect((await extra(req("OPTIONS", "tauri://localhost"))).status).toBe(204);
  });
});
