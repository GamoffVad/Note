import type { SyncEngine } from "./engine.ts";

export interface SchedulerOptions {
  /** Интервал активного приложения: 2–5 с (ТЗ, раздел 2). */
  activeIntervalMs?: number;
  /** Интервал простоя: 30–60 с. */
  idleIntervalMs?: number;
  /** Сколько тихих циклов подряд до перехода в режим простоя. */
  idleAfterQuietCycles?: number;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
  now?: () => number;
}

/**
 * Планировщик синхронизации активного приложения: polling с переходом в
 * режим простоя и немедленный цикл при фокусе, восстановлении сети и
 * локальной правке. Фоновая работа мобильных ОС не обещается: гарантирована
 * синхронизация при следующем открытии.
 */
export class SyncScheduler {
  private timer: unknown = null;
  private quietCycles = 0;
  private running = false;
  private readonly active: number;
  private readonly idle: number;
  private readonly idleAfter: number;
  private readonly setTimer: (fn: () => void, ms: number) => unknown;
  private readonly clearTimer: (handle: unknown) => void;
  private readonly now: () => number;

  constructor(
    private readonly engine: SyncEngine,
    options: SchedulerOptions = {},
  ) {
    this.active = options.activeIntervalMs ?? 3_000;
    this.idle = options.idleIntervalMs ?? 45_000;
    this.idleAfter = options.idleAfterQuietCycles ?? 10;
    this.setTimer = options.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
    this.clearTimer = options.clearTimer ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>));
    this.now = options.now ?? Date.now;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.trigger();
  }

  stop(): void {
    this.running = false;
    if (this.timer !== null) this.clearTimer(this.timer);
    this.timer = null;
  }

  /** Фокус окна, восстановление сети, локальная правка — синхронизировать сейчас. */
  trigger(): void {
    this.quietCycles = 0;
    this.schedule(0);
  }

  private schedule(ms: number): void {
    if (!this.running) return;
    if (this.timer !== null) this.clearTimer(this.timer);
    this.timer = this.setTimer(() => void this.tick(), ms);
  }

  private async tick(): Promise<void> {
    this.timer = null;
    const status = await this.engine.syncOnce();
    if (!this.running) return;
    if (status.state === "auth-required" || status.state === "forbidden" || status.state === "upgrade-required") {
      // Нужна реакция пользователя; повтор по таймеру не поможет.
      return;
    }
    const quiet = status.state === "idle" && status.pendingCount === 0 && status.receivedInLastCycle === 0;
    this.quietCycles = quiet ? this.quietCycles + 1 : 0;
    let delay = this.quietCycles >= this.idleAfter ? this.idle : this.active;
    if (status.nextRetryAt !== null) delay = Math.max(delay, status.nextRetryAt - this.now());
    this.schedule(delay);
  }
}
