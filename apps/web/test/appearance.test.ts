import { describe, expect, it } from "vitest";
import {
  contrastRatio,
  DEFAULT_APPEARANCE,
  loadAppearance,
  lowContrastScopes,
  resolveDark,
  saveAppearance,
  STORAGE_KEY,
  SURFACES,
  validateAppearance,
  type StorageLike,
} from "../src/state/appearance.ts";

function memoryStorage(initial: Record<string, string> = {}): StorageLike & { data: Record<string, string> } {
  const data = { ...initial };
  return { data, getItem: (k) => data[k] ?? null, setItem: (k, v) => void (data[k] = v) };
}

describe("настройки оформления", () => {
  it("по умолчанию: светлая тема, интерфейс 16 px, редактор 17 px, толщина 400", () => {
    expect(loadAppearance(memoryStorage())).toEqual(DEFAULT_APPEARANCE);
    expect(DEFAULT_APPEARANCE).toMatchObject({ theme: "light", uiSize: 16, editorSize: 17, uiWeight: 400 });
  });

  it("заменяет повреждённые и выходящие за границы значения безопасными", () => {
    const v = validateAppearance({ theme: "neon", uiSize: 40, editorSize: 14, uiWeight: 450, editor: "mono", uiColor: "red" });
    expect(v).toMatchObject({ theme: "light", uiSize: 16, editorSize: 14, uiWeight: 400, editor: "mono", uiColor: "#182538" });
    expect(loadAppearance(memoryStorage({ [STORAGE_KEY]: "{битый json" }))).toEqual(DEFAULT_APPEARANCE);
  });

  it("мигрирует v1: прежний size становится размером редактора", () => {
    const v = loadAppearance(memoryStorage({ "mayak.appearance.v1": JSON.stringify({ theme: "dark", size: 20 }) }));
    expect(v).toMatchObject({ theme: "dark", editorSize: 20, uiSize: 16 });
  });

  it("сообщает, если сохранить не удалось", () => {
    const failing: StorageLike = {
      getItem: () => null,
      setItem: () => {
        throw new Error("QuotaExceededError");
      },
    };
    expect(saveAppearance(failing, DEFAULT_APPEARANCE)).toBe(false);
    const ok = memoryStorage();
    expect(saveAppearance(ok, DEFAULT_APPEARANCE)).toBe(true);
    expect(JSON.parse(ok.data[STORAGE_KEY]!)).toEqual(DEFAULT_APPEARANCE);
  });

  it("«Как в системе» следует системной теме", () => {
    expect(resolveDark("system", true)).toBe(true);
    expect(resolveDark("system", false)).toBe(false);
    expect(resolveDark("light", true)).toBe(false);
  });
});

describe("контраст", () => {
  it("совпадает с эталонными значениями WCAG", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 5);
    expect(contrastRatio("#ffffff", "#ffffff")).toBeCloseTo(1, 5);
  });

  it("основной и вторичный текст обеих тем не ниже 4.5:1 на всех поверхностях", () => {
    const secondary = { light: "#5a6a80", dark: "#a0aec5" };
    for (const theme of ["light", "dark"] as const) {
      const s = SURFACES[theme];
      for (const bg of [s.page, s.panel, s.navigation]) {
        expect(contrastRatio(s.text, bg)).toBeGreaterThanOrEqual(4.5);
        expect(contrastRatio(secondary[theme], bg)).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it("предупреждает о собственном цвете ниже 4.5:1 и не меняет выбор сам", () => {
    const pale = { ...DEFAULT_APPEARANCE, uiAuto: false, uiColor: "#dddddd", editorAuto: false, editorColor: "#222222" };
    expect(lowContrastScopes(pale, false)).toEqual(["ui"]);
    expect(lowContrastScopes(pale, true)).toEqual(["editor"]);
    expect(pale.uiColor).toBe("#dddddd");
  });
});
