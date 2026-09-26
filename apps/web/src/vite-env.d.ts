/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string;
  readonly VITE_API_BASE?: string;
  /** "1" — показать режим разработчика (вход без проверки личности на локальный сервер). */
  readonly VITE_DEV_SYNC?: string;
}
