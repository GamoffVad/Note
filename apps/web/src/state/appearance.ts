/**
 * Настройки внешнего вида (design/APPEARANCE-SETTINGS.md). Хранятся только на
 * этом устройстве и не синхронизируются; не влияют на текст заметок и экспорт.
 */
export type ThemeChoice = "light" | "dark" | "system";
export type FontFamily = "system" | "sans" | "serif" | "mono";
export type Scope = "ui" | "editor";

export interface Appearance {
  theme: ThemeChoice;
  ui: FontFamily;
  editor: FontFamily;
  uiSize: number;
  editorSize: number;
  uiWeight: number;
  editorWeight: number;
  uiAuto: boolean;
  editorAuto: boolean;
  uiColor: string;
  editorColor: string;
}

export const FONTS: Record<FontFamily, { label: string; stack: string }> = {
  system: {
    label: "Системный",
    stack: 'system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans", Arial, sans-serif',
  },
  sans: { label: "Arial / без засечек", stack: 'Arial, "Helvetica Neue", "Liberation Sans", "Noto Sans", sans-serif' },
  serif: { label: "Georgia / с засечками", stack: 'Georgia, "Times New Roman", "Liberation Serif", "Noto Serif", serif' },
  mono: {
    label: "Consolas / моноширинный",
    stack: 'Consolas, "SF Mono", Menlo, "Liberation Mono", "Noto Sans Mono", monospace',
  },
};

export const WEIGHTS = [
  { value: 300, label: "300 · Лёгкий" },
  { value: 400, label: "400 · Обычный" },
  { value: 500, label: "500 · Средний" },
  { value: 600, label: "600 · Полужирный" },
  { value: 700, label: "700 · Жирный" },
] as const;

export const MIN_SIZE = 14;
export const MAX_SIZE = 24;

export const DEFAULT_APPEARANCE: Appearance = {
  theme: "light",
  ui: "system",
  editor: "system",
  uiSize: 16,
  editorSize: 17,
  uiWeight: 400,
  editorWeight: 400,
  uiAuto: true,
  editorAuto: true,
  uiColor: "#182538",
  editorColor: "#182538",
};

export const STORAGE_KEY = "mayak.appearance.v2";
const LEGACY_KEY = "mayak.appearance.v1";

/** Повреждённые или неизвестные значения заменяются значениями по умолчанию. */
export function validateAppearance(data: unknown): Appearance {
  const result: Appearance = { ...DEFAULT_APPEARANCE };
  if (!data || typeof data !== "object") return result;
  const source = data as Record<string, unknown>;
  const out = result as unknown as Record<string, unknown>;
  for (const key of Object.keys(DEFAULT_APPEARANCE) as Array<keyof Appearance>) {
    const value = source[key];
    const ok =
      (key === "theme" && (value === "light" || value === "dark" || value === "system")) ||
      ((key === "ui" || key === "editor") && typeof value === "string" && Object.hasOwn(FONTS, value)) ||
      (key.endsWith("Size") && Number.isInteger(value) && (value as number) >= MIN_SIZE && (value as number) <= MAX_SIZE) ||
      (key.endsWith("Weight") && WEIGHTS.some((w) => w.value === value)) ||
      (key.endsWith("Auto") && typeof value === "boolean") ||
      (key.endsWith("Color") && typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value));
    if (ok) out[key] = key.endsWith("Color") ? (value as string).toLowerCase() : value;
  }
  return result;
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** Чтение с миграцией v1 (один размер `size` для редактора, как в макете). */
export function loadAppearance(storage: StorageLike | null): Appearance {
  if (!storage) return { ...DEFAULT_APPEARANCE };
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (raw) return validateAppearance(JSON.parse(raw));
    const legacy = storage.getItem(LEGACY_KEY);
    if (legacy) {
      const old = JSON.parse(legacy) as Record<string, unknown>;
      return validateAppearance({ ...old, editorSize: old.size });
    }
  } catch {
    // Повреждённое хранилище: безопасные значения по умолчанию.
  }
  return { ...DEFAULT_APPEARANCE };
}

/** Возвращает false, если сохранить не удалось: выбор действует только в текущем сеансе. */
export function saveAppearance(storage: StorageLike | null, value: Appearance): boolean {
  if (!storage) return false;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

/** Фактические поверхности тем (design-tokens.css). */
export const SURFACES = {
  light: { page: "#f4f7fb", panel: "#ffffff", navigation: "#edf2f8", text: "#182538" },
  dark: { page: "#101723", panel: "#16202e", navigation: "#111925", text: "#e4eaf4" },
} as const;

function luminance(hex: string): number {
  const [r, g, b] = (hex.match(/[0-9a-f]{2}/gi) ?? ["00", "00", "00"]).map((v) => {
    const c = parseInt(v, 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

/** Контраст по WCAG 2.x. */
export function contrastRatio(a: string, b: string): number {
  const x = luminance(a);
  const y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

/** Области, где собственный цвет даёт контраст ниже 4.5:1 хотя бы с одной поверхностью. */
export function lowContrastScopes(a: Appearance, dark: boolean): Scope[] {
  const s = dark ? SURFACES.dark : SURFACES.light;
  const result: Scope[] = [];
  if (!a.uiAuto && [s.page, s.panel, s.navigation].some((bg) => contrastRatio(a.uiColor, bg) < 4.5)) result.push("ui");
  if (!a.editorAuto && contrastRatio(a.editorColor, s.panel) < 4.5) result.push("editor");
  return result;
}

export function resolveDark(theme: ThemeChoice, systemDark: boolean): boolean {
  return theme === "dark" || (theme === "system" && systemDark);
}

/** Применяет оформление к корню документа через CSS-переменные. */
export function applyAppearance(root: HTMLElement, a: Appearance, dark: boolean): void {
  root.dataset.theme = dark ? "dark" : "light";
  root.style.colorScheme = dark ? "dark" : "light";
  const set = (name: string, value: string) => root.style.setProperty(name, value);
  set("--ui-font", FONTS[a.ui].stack);
  set("--ui-size", `${a.uiSize}px`);
  set("--ui-weight", String(a.uiWeight));
  set("--ui-color", a.uiAuto ? "var(--text-primary)" : a.uiColor);
  set("--editor-font", FONTS[a.editor].stack);
  set("--editor-size", `${a.editorSize}px`);
  set("--editor-weight", String(a.editorWeight));
  set("--editor-color", a.editorAuto ? "var(--text-primary)" : a.editorColor);
  const meta = root.ownerDocument.querySelector('meta[name="theme-color"]');
  meta?.setAttribute("content", dark ? SURFACES.dark.panel : SURFACES.light.panel);
}
