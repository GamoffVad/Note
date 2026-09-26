import { newId, type Platform } from "@mayak/domain";
import { IndexedDbLocalStore, type LocalStore } from "@mayak/local-store";
import { HttpTransport, SyncEngine, SyncScheduler, type SyncTransport } from "@mayak/sync";
import { getSupabase } from "./supabase.ts";

/**
 * Режим синхронизации устройства:
 * - local — только на этом устройстве;
 * - account — аккаунт Supabase Auth (вход по email);
 * - dev — вход разработчика на локальный сервер без проверки личности.
 */
export type SyncConfig =
  | { mode: "local" }
  | { mode: "account"; userId: string; email: string }
  | { mode: "dev"; account: string; apiBase: string };

const CONFIG_KEY = "mayak.sync.v1";
/** Аккаунт, к которому привязано исходное локальное пространство «local». */
const LOCAL_OWNER_KEY = "mayak.localOwner.v1";
const META_DEVICE_ID = "deviceId";
/** Сервер отозвал устройство или его сессию: при следующем входе нужен новый deviceId. */
export const META_DEVICE_REVOKED = "deviceRevoked";

export const DEFAULT_API_BASE = import.meta.env.VITE_API_BASE ?? "/api/v1";

/** Режим разработчика виден только в сборках для разработки и тестов. */
export const DEV_SYNC_ENABLED = import.meta.env.DEV || import.meta.env.VITE_DEV_SYNC === "1";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function loadSyncConfig(): SyncConfig {
  try {
    const raw = JSON.parse(localStorage.getItem(CONFIG_KEY) ?? "null") as Partial<SyncConfig & { account: unknown }> | null;
    const r = raw as Record<string, unknown> | null;
    if (r?.mode === "account" && typeof r.userId === "string" && UUID_RE.test(r.userId) && typeof r.email === "string") {
      return { mode: "account", userId: r.userId, email: r.email };
    }
    if (DEV_SYNC_ENABLED && raw?.mode === "dev" && typeof raw.account === "string" && /^[A-Za-z0-9._@-]{1,64}$/.test(raw.account)) {
      return { mode: "dev", account: raw.account, apiBase: typeof raw.apiBase === "string" ? raw.apiBase : DEFAULT_API_BASE };
    }
  } catch {
    // Повреждённая настройка: работаем только на устройстве.
  }
  return { mode: "local" };
}

export function saveSyncConfig(config: SyncConfig): void {
  try {
    localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
  } catch {
    // Без сохранения режим действует до перезагрузки.
  }
}

/**
 * Данные разных аккаунтов живут в разных базах. Заметки, созданные до первого
 * подключения, принадлежат первому подключённому аккаунту.
 */
export function namespaceFor(config: SyncConfig): string {
  if (config.mode === "local") return "local";
  const key = config.mode === "account" ? `supabase:${config.userId}` : config.account;
  let owner: string | null = null;
  try {
    owner = localStorage.getItem(LOCAL_OWNER_KEY);
    if (!owner) {
      localStorage.setItem(LOCAL_OWNER_KEY, key);
      owner = key;
    }
  } catch {
    owner = key;
  }
  return owner === key ? "local" : `acct:${key}`;
}

/** Забывает привязку пространства «local» к аккаунту (после удаления его данных с устройства). */
export function releaseNamespace(namespace: string): void {
  try {
    if (namespace === "local") localStorage.removeItem(LOCAL_OWNER_KEY);
  } catch {
    // Нечего освобождать.
  }
}

/** Авторизация для API в режиме аккаунта: только сессия того же пользователя. */
async function accountAuthorization(userId: string): Promise<string | null> {
  const supabase = getSupabase();
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  const session = data.session;
  // Сессия другого пользователя не должна отправлять заметки этого пространства.
  if (!session || session.user.id !== userId) return null;
  return `Bearer ${session.access_token}`;
}

export function detectOs(ua: string = navigator.userAgent): { label: string } {
  if (/Android/i.test(ua)) return { label: "Android" };
  if (/iPhone|iPad|iPod/i.test(ua)) return { label: "iOS" };
  if (/Windows/i.test(ua)) return { label: "Windows" };
  if (/Mac OS X|Macintosh/i.test(ua)) return { label: "macOS" };
  if (/Linux|X11/i.test(ua)) return { label: "Linux" };
  return { label: "неизвестная ОС" };
}

export interface Workspace {
  config: SyncConfig;
  namespace: string;
  store: LocalStore;
  engine: SyncEngine;
  deviceId: string;
  deviceName: string;
  platform: Platform;
  transport: HttpTransport | null;
  scheduler: SyncScheduler | null;
  close(): void;
}

/** Транспорт режима «только на устройстве»: engine.syncOnce() в этом режиме не вызывается. */
const offlineTransport: SyncTransport = {
  registerDevice: () => Promise.reject(new Error("Синхронизация не настроена")),
  bootstrap: () => Promise.reject(new Error("Синхронизация не настроена")),
  push: () => Promise.reject(new Error("Синхронизация не настроена")),
  pull: () => Promise.reject(new Error("Синхронизация не настроена")),
};

export async function openWorkspace(config: SyncConfig): Promise<Workspace> {
  const namespace = namespaceFor(config);
  const store = await IndexedDbLocalStore.open(namespace);
  let deviceId = await store.read((tx) => tx.get<string>("meta", META_DEVICE_ID));
  const revoked = await store.read((tx) => tx.get<boolean>("meta", META_DEVICE_REVOKED));
  if (!deviceId || revoked) {
    // Отозванное устройство после нового входа регистрируется заново под новым id.
    const created = newId();
    await store.write(async (tx) => {
      await tx.put("meta", META_DEVICE_ID, created);
      await tx.delete("meta", META_DEVICE_REVOKED);
      await tx.delete("meta", "deviceRegistered");
    });
    deviceId = created;
  }
  const deviceName = `Браузер · ${detectOs().label}`;
  const platform: Platform = "web";
  const transport =
    config.mode === "dev"
      ? new HttpTransport({
          baseUrl: config.apiBase,
          deviceId,
          getAuthorization: () => `Bearer dev:${config.account}`,
        })
      : config.mode === "account"
        ? new HttpTransport({ baseUrl: DEFAULT_API_BASE, deviceId, getAuthorization: () => accountAuthorization(config.userId) })
        : null;
  const engine = new SyncEngine({
    store,
    transport: transport ?? offlineTransport,
    device: { id: deviceId, name: deviceName, platform },
  });
  const scheduler = transport ? new SyncScheduler(engine) : null;
  return {
    config,
    namespace,
    store,
    engine,
    deviceId,
    deviceName,
    platform,
    transport,
    scheduler,
    close() {
      scheduler?.stop();
      store.close();
    },
  };
}
