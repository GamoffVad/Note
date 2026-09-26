/**
 * Детерминированная сериализация JSON: ключи объектов сортируются.
 * Нужна для хэша тела мутации (идемпотентность) и сравнения снимков.
 */
export function stableStringify(value: unknown): string {
  return JSON.stringify(normalize(value));
}

function normalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalize);
  if (value !== null && typeof value === "object") {
    const source = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(source).sort()) {
      const v = source[key];
      if (v !== undefined) out[key] = normalize(v);
    }
    return out;
  }
  return value;
}

/** Размер строки в байтах UTF-8. */
export function utf8ByteLength(text: string): number {
  return new TextEncoder().encode(text).byteLength;
}
