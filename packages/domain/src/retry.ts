/**
 * Политика повторов (ТЗ, раздел 4): 1, 2, 4, 8 секунд и далее до 60 секунд,
 * с jitter; Retry-After сервера имеет приоритет.
 */
export const RETRY_BASE_MS = 1_000;
export const RETRY_MAX_MS = 60_000;

/**
 * @param attempt номер неудачной попытки, начиная с 1
 * @param random источник случайности [0, 1) — подменяется в тестах
 */
export function backoffDelay(attempt: number, retryAfterMs?: number, random: () => number = Math.random): number {
  if (retryAfterMs !== undefined && retryAfterMs >= 0) return Math.min(retryAfterMs, RETRY_MAX_MS * 10);
  const exp = Math.min(RETRY_BASE_MS * 2 ** Math.max(0, attempt - 1), RETRY_MAX_MS);
  // «Равный» jitter: половина задержки фиксирована, половина случайна.
  return Math.round(exp / 2 + (random() * exp) / 2);
}

/** Разбор заголовка Retry-After (секунды или HTTP-дата). */
export function parseRetryAfter(value: string | null, now: number = Date.now()): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
  const date = Date.parse(value);
  if (Number.isNaN(date)) return undefined;
  return Math.max(0, date - now);
}
