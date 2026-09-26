import { describe, expect, it } from "vitest";
import { AUTH_REDIRECT_URL, authEmailRedirect, encryptedStorage, importSessionKey, nativePlatform, parseAuthLink } from "../src/state/native.ts";

class MemoryStorage {
  readonly data = new Map<string, string>();
  getItem(k: string) {
    return this.data.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.data.set(k, v);
  }
  removeItem(k: string) {
    this.data.delete(k);
  }
}

const KEY_A = "a".repeat(64);
const KEY_B = "0123456789abcdef".repeat(4);

describe("сессия в приложении: шифрование ключом из хранилища секретов", () => {
  it("хранит только шифротекст и расшифровывает тем же ключом", async () => {
    const disk = new MemoryStorage();
    const store = encryptedStorage(await importSessionKey(KEY_A), disk);
    const session = JSON.stringify({ access_token: "eyJ.secret.token", refresh_token: "r-123" });
    await store.setItem("mayak.auth", session);
    const raw = disk.getItem("mayak.enc.mayak.auth")!;
    expect(raw).not.toContain("secret");
    expect(raw).not.toContain("r-123");
    expect(await store.getItem("mayak.auth")).toBe(session);
    // Каждое сохранение — новый вектор инициализации.
    await store.setItem("mayak.auth", session);
    expect(disk.getItem("mayak.enc.mayak.auth")).not.toBe(raw);
  });

  it("чужой ключ или подмена имени записи — сессии нет, повреждённая запись удаляется", async () => {
    const disk = new MemoryStorage();
    await encryptedStorage(await importSessionKey(KEY_A), disk).setItem("mayak.auth", "секрет");
    expect(await encryptedStorage(await importSessionKey(KEY_B), disk).getItem("mayak.auth")).toBeNull();
    expect(disk.getItem("mayak.enc.mayak.auth")).toBeNull();

    const store = encryptedStorage(await importSessionKey(KEY_A), disk);
    await store.setItem("mayak.auth", "секрет");
    disk.setItem("mayak.enc.other", disk.getItem("mayak.enc.mayak.auth")!);
    expect(await store.getItem("other")).toBeNull();
    await store.removeItem("mayak.auth");
    expect(await store.getItem("mayak.auth")).toBeNull();
  });

  it("отклоняет ключ неправильного формата", async () => {
    await expect(importSessionKey("short")).rejects.toThrow();
  });

  it("определяет платформу устройства", () => {
    expect(nativePlatform("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15")).toBe("macos");
    expect(nativePlatform("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Edg/140.0")).toBe("windows");
    expect(nativePlatform("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/605.1.15")).toBe("linux");
  });
});

describe("вход по ссылке из письма в приложении", () => {
  it("берёт код PKCE из ссылки возврата", () => {
    expect(parseAuthLink(`${AUTH_REDIRECT_URL}?code=abc-123`)).toEqual({ code: "abc-123" });
  });
  it("распознаёт ошибку Supabase Auth в параметрах и во фрагменте", () => {
    expect(parseAuthLink(`${AUTH_REDIRECT_URL}#error=access_denied&error_description=Email+link+is+invalid+or+has+expired`)).toEqual({
      error: "Email link is invalid or has expired",
    });
    expect(parseAuthLink(`${AUTH_REDIRECT_URL}?error=server_error`)).toEqual({ error: "server_error" });
  });
  it("игнорирует чужие ссылки и ссылки без кода", () => {
    expect(parseAuthLink("https://evil.example/login-callback?code=x")).toBeNull();
    expect(parseAuthLink("io.github.gamoffvad.mayak://other?code=x")).toBeNull();
    expect(parseAuthLink(AUTH_REDIRECT_URL)).toBeNull();
  });
});

describe("authEmailRedirect", () => {
  it("на Android ведёт на страницу сайта, которая открывает приложение кнопкой", () => {
    expect(authEmailRedirect("android", "https://mayak-pied-theta.vercel.app/api/v1")).toBe("https://mayak-pied-theta.vercel.app/auth/callback/");
  });
  it("на компьютере и без адреса сайта — сразу в приложение", () => {
    expect(authEmailRedirect("windows", "https://mayak-pied-theta.vercel.app/api/v1")).toBe(AUTH_REDIRECT_URL);
    expect(authEmailRedirect("macos", "https://mayak-pied-theta.vercel.app/api/v1")).toBe(AUTH_REDIRECT_URL);
    expect(authEmailRedirect("android", undefined)).toBe(AUTH_REDIRECT_URL);
    expect(authEmailRedirect("android", "/api/v1")).toBe(AUTH_REDIRECT_URL);
  });
});
