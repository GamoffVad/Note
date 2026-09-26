import { invoke } from "@tauri-apps/api/core";
import type { KvBackend, KvOp, StoreName } from "@mayak/local-store";
import type { Platform } from "@mayak/domain";

/**
 * Интеграция с оболочкой Tauri 2 (apps/desktop). Один и тот же интерфейс
 * работает в браузере и в приложении; в приложении заметки хранятся в SQLite,
 * а ключ шифрования сессии — в системном хранилище секретов.
 */
export function isNativeApp(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

/** Платформа устройства для регистрации в API. */
export function nativePlatform(ua: string = navigator.userAgent): Platform {
  if (/Android/i.test(ua)) return "android";
  if (/iPhone|iPad|iPod/i.test(ua)) return "ios";
  if (/Windows/i.test(ua)) return "windows";
  if (/Mac OS X|Macintosh/i.test(ua)) return "macos";
  return "linux";
}

/** Хранилище заметок пространства в SQLite приложения (команды kv_* в src-tauri/src/lib.rs). */
export function sqliteBackend(ns: string): KvBackend {
  return {
    get: (store: StoreName, key: string) => invoke<string | null>("kv_get", { ns, store, key }),
    getAll: (store: StoreName) => invoke<Array<[string, string]>>("kv_all", { ns, store }),
    commit: (ops: KvOp[]) => invoke<void>("kv_commit", { ns, ops }),
  };
}

/** Удаляет все заметки пространства с устройства. */
export function dropSqliteNamespace(ns: string): Promise<void> {
  return invoke<void>("kv_drop", { ns });
}

// ─── Сессия входа ─────────────────────────────────────────────────────────

/** Хранилище, которое принимает клиент Supabase Auth (auth.storage). */
export interface AsyncStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

const ENC_PREFIX = "mayak.enc.";

function toBase64(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

function fromBase64(text: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(atob(text), (c) => c.charCodeAt(0));
}

export async function importSessionKey(hex: string): Promise<CryptoKey> {
  if (!/^[0-9a-f]{64}$/i.test(hex)) throw new Error("Некорректный ключ сессии");
  const raw = new Uint8Array(hex.match(/../g)!.map((h) => parseInt(h, 16)));
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
}

/**
 * Хранилище сессии, зашифрованное AES-GCM ключом из системного хранилища
 * секретов. Имя записи входит в дополнительные данные: зашифрованное значение
 * нельзя подставить под другим именем.
 */
export function encryptedStorage(key: CryptoKey, storage: Pick<Storage, "getItem" | "setItem" | "removeItem">): AsyncStorage {
  return {
    async getItem(name) {
      const stored = storage.getItem(ENC_PREFIX + name);
      if (!stored) return null;
      try {
        const { iv, ct } = JSON.parse(stored) as { iv: string; ct: string };
        const plain = await crypto.subtle.decrypt(
          { name: "AES-GCM", iv: fromBase64(iv), additionalData: new TextEncoder().encode(name) },
          key,
          fromBase64(ct),
        );
        return new TextDecoder().decode(plain);
      } catch {
        // Ключ сменился или запись повреждена: сессии нет, нужно войти снова.
        storage.removeItem(ENC_PREFIX + name);
        return null;
      }
    },
    async setItem(name, value) {
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const ct = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv, additionalData: new TextEncoder().encode(name) },
        key,
        new TextEncoder().encode(value),
      );
      storage.setItem(ENC_PREFIX + name, JSON.stringify({ iv: toBase64(iv), ct: toBase64(new Uint8Array(ct)) }));
    },
    async removeItem(name) {
      storage.removeItem(ENC_PREFIX + name);
    },
  };
}

let sessionStorageAdapter: Promise<AsyncStorage | null> | null = null;

/**
 * Хранилище сессии для приложения. Если системное хранилище секретов
 * недоступно (например, в Linux без Secret Service), сессия хранится как в
 * браузере — в хранилище окна без шифрования.
 */
export function nativeSessionStorage(): Promise<AsyncStorage | null> {
  // Не дольше 3 с: если система не ответит, вход не должен зависнуть.
  const key = Promise.race([
    invoke<string>("session_key"),
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error("session_key: нет ответа за 3 с")), 3000)),
  ]);
  sessionStorageAdapter ??= key
    .then(importSessionKey)
    .then((key) => encryptedStorage(key, localStorage))
    .catch((error: unknown) => {
      console.warn("Хранилище секретов недоступно, сессия хранится без шифрования", error);
      return null;
    });
  return sessionStorageAdapter;
}

/** Синхронно создаваемое хранилище для клиента Supabase: ждёт ключ при первом обращении. */
export function appSessionStorage(): AsyncStorage {
  const ready = nativeSessionStorage();
  return {
    async getItem(name) {
      const secure = await ready;
      return secure ? secure.getItem(name) : localStorage.getItem(name);
    },
    async setItem(name, value) {
      const secure = await ready;
      if (secure) await secure.setItem(name, value);
      else localStorage.setItem(name, value);
    },
    async removeItem(name) {
      const secure = await ready;
      if (secure) await secure.removeItem(name);
      localStorage.removeItem(name);
    },
  };
}

// ─── Вход по ссылке из письма ────────────────────────────────────────────

/** Адрес возврата из письма: ссылка открывает приложение (плагин deep-link Tauri). */
export const AUTH_REDIRECT_URL = "io.github.gamoffvad.mayak://login-callback";

/**
 * Куда ведёт ссылка из письма входа. На Android — на страницу сайта
 * (server-site/auth/callback): Supabase переводит браузер на адрес со схемой
 * приложения без нажатия, и браузер телефона такой переход не выполнял —
 * вход подтверждался, а приложение не открывалось (журнал Supabase Auth: /verify
 * 303 без последующего /token). Страница открывает приложение кнопкой.
 * На компьютере — сразу в приложение.
 */
export function authEmailRedirect(platform = nativePlatform(), apiBase = import.meta.env.VITE_API_BASE): string {
  if (platform !== "android" || !apiBase || !/^https:\/\//.test(apiBase)) return AUTH_REDIRECT_URL;
  return `${new URL(apiBase).origin}/auth/callback/`;
}

/** Событие окна с текстом ошибки входа по ссылке — его показывает форма входа. */
export const AUTH_LINK_ERROR_EVENT = "mayak:auth-link-error";

/** Разбор ссылки возврата: код PKCE в параметрах или ошибка Supabase Auth. */
export function parseAuthLink(url: string): { code: string } | { error: string } | null {
  if (!url.startsWith(AUTH_REDIRECT_URL)) return null;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  const params = new URLSearchParams(parsed.search);
  for (const [k, v] of new URLSearchParams(parsed.hash.replace(/^#/, ""))) params.set(k, v);
  const code = params.get("code");
  if (code) return { code };
  const error = params.get("error_description") ?? params.get("error");
  return error ? { error } : null;
}

/** Слушает ссылки, которыми открыто приложение: при запуске и во время работы. */
export async function listenForAuthLinks(onUrl: (url: string) => void): Promise<() => void> {
  const { getCurrent, onOpenUrl } = await import("@tauri-apps/plugin-deep-link");
  (await getCurrent())?.forEach(onUrl);
  return onOpenUrl((urls) => urls.forEach(onUrl));
}

/**
 * fetch для сетевых запросов приложения (вход Supabase, синхронизация).
 * На Android запрос выполняется в Rust (команда native_fetch, src-tauri/src/net.rs)
 * и ответ приходит целиком: во встроенном WebView POST к внешнему серверу не
 * уходит (в журнале Supabase — только OPTIONS), а у модуля Tauri HTTP ответ не
 * доходил до интерфейса — вход обрывался по таймауту при ответе сервера 200.
 * На компьютере и в браузере — обычный fetch.
 */
export function appFetch(): typeof fetch {
  if (isNativeApp() && nativePlatform() === "android") return nativeFetch;
  return globalThis.fetch.bind(globalThis);
}

const NULL_BODY = new Set([101, 103, 204, 205, 304]);

async function nativeFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const request = new Request(input, init);
  const body = request.method === "GET" || request.method === "HEAD" ? null : await request.text();
  const response = await invoke<{ status: number; headers: Array<[string, string]>; body: string }>("native_fetch", {
    request: { method: request.method, url: request.url, headers: [...request.headers.entries()], body },
  });
  return new Response(NULL_BODY.has(response.status) ? null : response.body, {
    status: response.status,
    headers: response.headers,
  });
}
