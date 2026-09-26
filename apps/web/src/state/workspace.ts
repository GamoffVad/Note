import { newId, type Platform } from "@mayak/domain";
import { IndexedDbLocalStore, type LocalStore } from "@mayak/local-store";
import { HttpTransport, SyncEngine, SyncScheduler, type SyncTransport } from "@mayak/sync";

/**
 * Режим синхронизации устройства. Настоящая авторизация (Supabase) ещё не
 * подключена; «dev» — вход разработчика на локальный сервер без проверки
 * личности, и интерфейс так его и называет.
 */
export type SyncConfig = { mode: "local" } | { mode: "dev"; account: string; apiBase: string };

const CONFIG_KEY = "mayak.sync.v1";
/** Аккаунт, к которому привязано исходное локальное пространство «local». */
const LOCAL_OWNER_KEY = "mayak.localOwner.v1";
const META_DEVICE_ID = "deviceId";

export const DEFAULT_API_BASE = "/api/v1";

export function loadSyncConfig(): SyncConfig {
  try {
    const raw = JSON.parse(localStorage.getItem(CONFIG_KEY) ?? "null") as Partial<SyncConfig & { account: unknown }> | null;
    if (raw?.mode === "dev" && typeof raw.account === "string" && /^[A-Za-z0-9._@-]{1,64}$/.test(raw.account)) {
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
  let owner: string | null = null;
  try {
    owner = localStorage.getItem(LOCAL_OWNER_KEY);
    if (!owner) {
      localStorage.setItem(LOCAL_OWNER_KEY, config.account);
      owner = config.account;
    }
  } catch {
    owner = config.account;
  }
  return owner === config.account ? "local" : `acct:${config.account}`;
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
  if (!deviceId) {
    const created = newId();
    await store.write((tx) => tx.put("meta", META_DEVICE_ID, created));
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
