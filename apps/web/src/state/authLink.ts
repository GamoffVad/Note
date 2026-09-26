import type { Session, SupabaseClient } from "@supabase/supabase-js";
import type { SyncConfig } from "./workspace.ts";

/**
 * Вход по ссылке из письма в приложении: ход и результат видны в «Настройках».
 * Состояние хранится здесь, а не только в событии: ссылка может прийти, пока
 * открыт другой экран, и форма входа появляется уже после события.
 */
export type AuthLinkStatus =
  | { state: "pending"; text: string }
  | { state: "error"; text: string; detail?: string }
  | { state: "done" };

export const AUTH_LINK_EVENT = "mayak:auth-link";

let current: AuthLinkStatus | null = null;

export function authLinkStatus(): AuthLinkStatus | null {
  return current;
}

export function reportAuthLink(status: AuthLinkStatus | null): void {
  current = status;
  window.dispatchEvent(new CustomEvent(AUTH_LINK_EVENT, { detail: status }));
}

/** Техническая строка для скриншота: по ней видно причину на конкретном устройстве. */
export function errorDetail(error: unknown): string {
  if (!error || typeof error !== "object") return String(error);
  const e = error as { name?: string; message?: string; status?: number; code?: string };
  return [e.name, e.code, e.status, e.message].filter((x) => x !== undefined && x !== "").join(" · ");
}

export function accountConfig(session: Session): SyncConfig {
  return { mode: "account", userId: session.user.id, email: session.user.email ?? "" };
}

export const LINK_TIMEOUT_MS = 20_000;

/**
 * Обменивает код из ссылки на сессию. Возвращает настройку аккаунта — её
 * применяют сразу, не дожидаясь события SIGNED_IN библиотеки.
 */
export async function signInWithLink(supabase: SupabaseClient, code: string, timeoutMs = LINK_TIMEOUT_MS): Promise<SyncConfig> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(Object.assign(new Error(`нет ответа за ${timeoutMs / 1000} с`), { name: "Timeout" })), timeoutMs);
  });
  try {
    const { data, error } = await Promise.race([supabase.auth.exchangeCodeForSession(code), timeout]);
    if (error) throw error;
    if (!data.session) throw new Error("сервер не вернул сессию");
    return accountConfig(data.session);
  } finally {
    clearTimeout(timer);
  }
}
