import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { errorDetail, signInWithLink } from "../src/state/authLink.ts";

const user = { id: "0aac1afe-ac52-4d65-bbcb-0a21527fdd62", email: "t@example.com" };
const client = (exchange: () => Promise<unknown>) => ({ auth: { exchangeCodeForSession: exchange } }) as unknown as SupabaseClient;

describe("signInWithLink", () => {
  it("по сессии из обмена кода сразу даёт настройку аккаунта", async () => {
    const sb = client(async () => ({ data: { session: { user } }, error: null }));
    await expect(signInWithLink(sb, "code")).resolves.toEqual({ mode: "account", userId: user.id, email: user.email });
  });

  it("ошибку сервера отдаёт с подробностями", async () => {
    const error = Object.assign(new Error("invalid flow state"), { name: "AuthApiError", status: 400, code: "flow_state_not_found" });
    const sb = client(async () => ({ data: { session: null }, error }));
    const thrown = await signInWithLink(sb, "code").catch((e: unknown) => e);
    expect(errorDetail(thrown)).toBe("AuthApiError · flow_state_not_found · 400 · invalid flow state");
  });

  it("не ждёт бесконечно, если обмен не завершился", async () => {
    const sb = client(() => new Promise(() => undefined));
    const thrown = await signInWithLink(sb, "code", 20).catch((e: unknown) => e);
    expect(errorDetail(thrown)).toBe("Timeout · нет ответа за 0.02 с");
  });
});
