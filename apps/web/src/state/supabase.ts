import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { appSessionStorage, isNativeApp } from "./native.ts";

/**
 * Клиент Supabase Auth. URL проекта и публикуемый ключ (sb_publishable_…)
 * по документации Supabase можно встраивать в клиент; секретный ключ — никогда.
 * Сессия хранится библиотекой и обновляется ею же (docs/adr/0004-auth.md):
 * в браузере — в localStorage, в приложении — зашифрованной ключом из
 * системного хранилища секретов (native.ts).
 */
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

let client: SupabaseClient | null = null;

export function supabaseConfigured(): boolean {
  return Boolean(url && key);
}

export function getSupabase(): SupabaseClient | null {
  if (!url || !key) return null;
  const native = isNativeApp();
  client ??= createClient(url, key, {
    auth: {
      // PKCE: ссылка из письма работает, если открыть её в этом же браузере.
      // В приложении вход — только по коду из письма.
      flowType: "pkce",
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: !native,
      storageKey: "mayak.auth",
      ...(native ? { storage: appSessionStorage() } : {}),
    },
  });
  return client;
}

/** Код из письма: только цифры; длина задаётся в настройках проекта Supabase. */
export function normalizeOtp(input: string): string {
  return input.replace(/\D/g, "");
}

export function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}
