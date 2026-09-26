import { describe, expect, it } from "vitest";
import { SyncScheduler, type SyncEngine, type SyncStatus } from "../src/index.ts";

function status(patch: Partial<SyncStatus> = {}): SyncStatus {
  return {
    state: "idle",
    pendingCount: 0,
    conflictCount: 0,
    failedCount: 0,
    lastSyncedAt: 0,
    lastError: null,
    nextRetryAt: null,
    receivedInLastCycle: 0,
    ...patch,
  };
}

function harness(results: SyncStatus[]) {
  const timers: Array<{ fn: () => void; ms: number }> = [];
  let calls = 0;
  const engine = {
    syncOnce: async () => results[Math.min(calls++, results.length - 1)]!,
  } as unknown as SyncEngine;
  const scheduler = new SyncScheduler(engine, {
    activeIntervalMs: 3_000,
    idleIntervalMs: 45_000,
    idleAfterQuietCycles: 2,
    now: () => 0,
    setTimer: (fn, ms) => {
      timers.push({ fn, ms });
      return timers.length;
    },
    clearTimer: () => undefined,
  });
  const runNext = async () => {
    const timer = timers.at(-1)!;
    timer.fn();
    await new Promise((r) => setTimeout(r, 0));
  };
  return { scheduler, timers, runNext, calls: () => calls };
}

describe("SyncScheduler", () => {
  it("сразу синхронизирует, затем опрашивает и уходит в режим простоя после тихих циклов", async () => {
    const h = harness([status()]);
    h.scheduler.start();
    expect(h.timers.at(-1)!.ms).toBe(0);
    await h.runNext();
    expect(h.timers.at(-1)!.ms).toBe(3_000);
    await h.runNext();
    expect(h.timers.at(-1)!.ms).toBe(45_000);
    h.scheduler.trigger(); // фокус окна или локальная правка
    expect(h.timers.at(-1)!.ms).toBe(0);
  });

  it("полученные изменения сбрасывают режим простоя; повтор не раньше nextRetryAt", async () => {
    const h = harness([status(), status({ receivedInLastCycle: 2 }), status({ state: "offline", nextRetryAt: 8_000 })]);
    h.scheduler.start();
    await h.runNext();
    await h.runNext();
    expect(h.timers.at(-1)!.ms).toBe(3_000);
    await h.runNext();
    expect(h.timers.at(-1)!.ms).toBe(8_000);
  });

  it("останавливается, когда нужна реакция пользователя", async () => {
    const h = harness([status({ state: "auth-required" })]);
    h.scheduler.start();
    await h.runNext();
    expect(h.timers).toHaveLength(1);
    expect(h.calls()).toBe(1);
  });
});
