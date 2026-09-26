import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { NoteDocument } from "@mayak/domain";
import { requestPersistentStorage } from "@mayak/local-store";
import type { ConflictChoice, ConflictRecord, LocalNote, OutboxEntry, SyncStatus } from "@mayak/sync";
import { accountConfig, errorDetail, reportAuthLink, signInWithLink } from "./authLink.ts";
import { isNativeApp, listenForAuthLinks, parseAuthLink } from "./native.ts";
import { navigate } from "./router.ts";
import { getSupabase } from "./supabase.ts";
import {
  loadSyncConfig,
  META_DEVICE_REVOKED,
  destroyNamespace,
  openWorkspace,
  saveSyncConfig,
  type SyncConfig,
  type Workspace,
} from "./workspace.ts";

export interface MayakState {
  workspace: Workspace;
  notes: LocalNote[];
  outbox: Map<string, OutboxEntry>;
  conflicts: Map<string, ConflictRecord>;
  status: SyncStatus;
  /** Браузер подтвердил постоянное хранилище; null — ещё не известно. */
  persisted: boolean | null;
  createNote(document?: NoteDocument): Promise<LocalNote>;
  editNote(id: string, document: NoteDocument): Promise<LocalNote>;
  setDeleted(id: string, deleted: boolean): Promise<LocalNote>;
  setTaskChecked(noteId: string, blockId: string, checked: boolean): Promise<LocalNote>;
  resolveConflict(noteId: string, choice: ConflictChoice): Promise<{ copyId: string | null }>;
  syncNow(): Promise<SyncStatus | null>;
  setSyncConfig(config: SyncConfig): void;
  /**
   * Выход из аккаунта на этом устройстве. wipe — удалить заметки аккаунта
   * с устройства (только если всё отправлено).
   */
  signOut(options: { wipe: boolean }): Promise<void>;
}

const Context = createContext<MayakState | null>(null);

export function useMayak(): MayakState {
  const value = useContext(Context);
  if (!value) throw new Error("useMayak вне MayakProvider");
  return value;
}

interface Snapshot {
  notes: LocalNote[];
  outbox: Map<string, OutboxEntry>;
  conflicts: Map<string, ConflictRecord>;
  status: SyncStatus;
}

export function MayakProvider({ children, fallback }: { children: ReactNode; fallback: (error: Error | null) => ReactNode }) {
  const [config, setConfig] = useState<SyncConfig>(loadSyncConfig);
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [openError, setOpenError] = useState<Error | null>(null);
  const [persisted, setPersisted] = useState<boolean | null>(null);
  const kickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;
    let ws: Workspace | null = null;
    setSnapshot(null);
    openWorkspace(config)
      .then((opened) => {
        if (cancelled) return opened.close();
        ws = opened;
        setWorkspace(opened);
      })
      .catch((error: Error) => setOpenError(error));
    return () => {
      cancelled = true;
      ws?.close();
    };
  }, [config]);

  const connectAccount = useCallback((next: SyncConfig) => {
    setConfig((current) => {
      if (current.mode === "account" && next.mode === "account" && current.userId === next.userId) return current;
      saveSyncConfig(next);
      return next;
    });
  }, []);

  // Вход по ссылке из письма (PKCE): библиотека обменивает код на сессию при загрузке.
  useEffect(() => {
    const supabase = getSupabase();
    if (!supabase) return;
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" && session) connectAccount(accountConfig(session));
    });
    return () => data.subscription.unsubscribe();
  }, [connectAccount]);

  // Приложение: ссылка из письма открывает «Маяк» с кодом входа (PKCE).
  // Ход и результат входа видны в «Настройках»; аккаунт подключается сразу
  // по результату обмена кода, не дожидаясь события SIGNED_IN.
  useEffect(() => {
    const supabase = getSupabase();
    if (!supabase || !isNativeApp()) return;
    let stop: (() => void) | null = null;
    let cancelled = false;
    const handled = new Set<string>();
    void listenForAuthLinks((url) => {
      const link = parseAuthLink(url);
      if (!link || handled.has(url)) return;
      handled.add(url);
      if (!location.hash.startsWith("#/settings")) navigate({ section: "settings" });
      if ("error" in link) {
        return reportAuthLink({
          state: "error",
          text: "Ссылка из письма устарела или уже использована. Запросите новое письмо.",
          detail: link.error,
        });
      }
      reportAuthLink({ state: "pending", text: "Выполняем вход по ссылке из письма…" });
      signInWithLink(supabase, link.code)
        .then((next) => {
          reportAuthLink({ state: "done" });
          connectAccount(next);
        })
        .catch((error: unknown) =>
          reportAuthLink({ state: "error", text: "Не удалось войти по ссылке. Запросите новое письмо.", detail: errorDetail(error) }),
        );
    })
      .then((unlisten) => (cancelled ? unlisten() : (stop = unlisten)))
      .catch((error: unknown) => console.warn("Ссылки для входа недоступны", error));
    return () => {
      cancelled = true;
      stop?.();
    };
  }, [connectAccount]);

  useEffect(() => {
    requestPersistentStorage()
      .then(setPersisted)
      .catch(() => setPersisted(false));
  }, []);

  // Перечитываем локальную базу после каждого события движка; события внутри
  // одной задачи объединяются.
  useEffect(() => {
    if (!workspace) return;
    const { engine, store } = workspace;
    let scheduled = false;
    let alive = true;
    const reload = async () => {
      scheduled = false;
      const data = await store.read(async (tx) => ({
        notes: await tx.getAll<LocalNote>("notes"),
        outbox: await tx.getAll<OutboxEntry>("outbox"),
        conflicts: await tx.getAll<ConflictRecord>("conflicts"),
      }));
      if (!alive) return;
      const status = engine.getStatus();
      const code = status.lastError?.code;
      if (code === "DEVICE_REVOKED" || code === "SESSION_REVOKED") {
        // После нового входа устройство зарегистрируется заново (workspace.ts).
        await store.write((tx) => tx.put("meta", META_DEVICE_REVOKED, true)).catch(() => undefined);
      }
      setSnapshot({
        notes: data.notes,
        outbox: new Map(data.outbox.map((e) => [e.entityId, e])),
        conflicts: new Map(data.conflicts.map((c) => [c.noteId, c])),
        status: engine.getStatus(),
      });
    };
    const schedule = () => {
      if (scheduled) return;
      scheduled = true;
      setTimeout(() => void reload(), 0);
    };
    const unsubscribe = engine.subscribe(schedule);
    void reload();
    return () => {
      alive = false;
      unsubscribe();
    };
  }, [workspace]);

  // Планировщик: polling активной вкладки, немедленный цикл при фокусе и сети.
  useEffect(() => {
    const scheduler = workspace?.scheduler;
    if (!scheduler) return;
    scheduler.start();
    const trigger = () => scheduler.trigger();
    const onVisibility = () => {
      if (document.visibilityState === "visible") scheduler.trigger();
    };
    window.addEventListener("focus", trigger);
    window.addEventListener("online", trigger);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      scheduler.stop();
      window.removeEventListener("focus", trigger);
      window.removeEventListener("online", trigger);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [workspace]);

  /** После локальной правки — синхронизация чуть позже, чтобы не отправлять каждое нажатие. */
  const kick = useCallback(() => {
    const scheduler = workspace?.scheduler;
    if (!scheduler) return;
    if (kickTimer.current) clearTimeout(kickTimer.current);
    kickTimer.current = setTimeout(() => scheduler.trigger(), 800);
  }, [workspace]);

  const value = useMemo<MayakState | null>(() => {
    if (!workspace || !snapshot) return null;
    const { engine } = workspace;
    const after = <T,>(promise: Promise<T>) => promise.finally(kick);
    return {
      workspace,
      ...snapshot,
      persisted,
      createNote: (document) => after(engine.createNote(document)),
      editNote: (id, document) => after(engine.editNote(id, document)),
      setDeleted: (id, deleted) => after(engine.setDeleted(id, deleted)),
      setTaskChecked: (noteId, blockId, checked) => after(engine.setTaskChecked(noteId, blockId, checked)),
      resolveConflict: (noteId, choice) => after(engine.resolveConflict(noteId, choice)),
      syncNow: async () => (workspace.transport ? engine.syncOnce() : null),
      setSyncConfig: (next) => {
        saveSyncConfig(next);
        setConfig(next);
      },
      signOut: async ({ wipe }) => {
        const supabase = getSupabase();
        // Только эта сессия: выход на одном устройстве не должен выкидывать остальные.
        if (supabase && workspace.config.mode === "account") await supabase.auth.signOut({ scope: "local" });
        const namespace = workspace.namespace;
        if (wipe) {
          // Сначала закрываем и удаляем базу, потом открываем пространство заново:
          // иначе новое подключение заблокировало бы удаление той же базы.
          workspace.close();
          await destroyNamespace(namespace);
        }
        saveSyncConfig({ mode: "local" });
        setConfig({ mode: "local" });
      },
    };
  }, [workspace, snapshot, persisted, kick]);

  if (!value) return <>{fallback(openError)}</>;
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
