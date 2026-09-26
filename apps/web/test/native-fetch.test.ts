import { beforeEach, describe, expect, it, vi } from "vitest";

const invoke = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({ invoke: (...args: unknown[]) => invoke(...args) }));

describe("appFetch на Android: запрос выполняется в Rust (native_fetch)", () => {
  beforeEach(() => {
    invoke.mockReset();
    vi.stubGlobal("window", { __TAURI_INTERNALS__: {} });
    vi.stubGlobal("navigator", { userAgent: "Mozilla/5.0 (Linux; Android 16; wv)" });
  });

  it("передаёт метод, адрес, заголовки и тело и собирает ответ", async () => {
    invoke.mockResolvedValue({ status: 200, headers: [["content-type", "application/json"]], body: '{"ok":true}' });
    const { appFetch } = await import("../src/state/native.ts");
    const res = await appFetch()("https://abc.supabase.co/auth/v1/otp", {
      method: "POST",
      headers: { apikey: "k", "content-type": "application/json" },
      body: JSON.stringify({ email: "a@b.c" }),
    });
    expect(invoke).toHaveBeenCalledWith("native_fetch", {
      request: expect.objectContaining({ method: "POST", url: "https://abc.supabase.co/auth/v1/otp", body: '{"email":"a@b.c"}' }),
    });
    const sent = invoke.mock.calls[0]![1].request.headers as Array<[string, string]>;
    expect(sent).toContainEqual(["apikey", "k"]);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("GET без тела; 204 — пустой ответ", async () => {
    invoke.mockResolvedValue({ status: 204, headers: [], body: "" });
    const { appFetch } = await import("../src/state/native.ts");
    const res = await appFetch()("https://mayak-pied-theta.vercel.app/api/v1/health");
    expect(invoke.mock.calls[0]![1].request.body).toBeNull();
    expect(res.status).toBe(204);
    expect(res.body).toBeNull();
  });
});
