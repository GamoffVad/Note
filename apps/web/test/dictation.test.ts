import { describe, expect, it } from "vitest";
import { insertAt, resample } from "../src/state/dictation.ts";

describe("диктовка: вставка текста", () => {
  it("вставляет в позицию курсора с пробелами по краям", () => {
    expect(insertAt("Купить хлеб", 6, "молоко и")).toEqual({ value: "Купить молоко и хлеб", caret: 15 });
    expect(insertAt("", 0, "Привет")).toEqual({ value: "Привет", caret: 6 });
    expect(insertAt("Итог", 4, "готово")).toEqual({ value: "Итог готово", caret: 11 });
  });
  it("не добавляет пробел перед знаком препинания и не выходит за границы", () => {
    expect(insertAt("Всё.", 3, "хорошо").value).toBe("Всё хорошо.");
    expect(insertAt("abc", 99, "x").value).toBe("abc x");
  });
});

describe("диктовка: понижение частоты до 16 кГц", () => {
  it("48 кГц → 16 кГц: втрое меньше отсчётов, постоянный сигнал сохраняется", () => {
    const input = new Float32Array(48_000).fill(0.5);
    const out = resample(input, 48_000);
    expect(out.length).toBe(16_000);
    expect(Math.abs(out[100]! - 0.5)).toBeLessThan(1e-6);
  });
  it("16 кГц не меняется", () => {
    const input = new Float32Array([0.1, 0.2]);
    expect(resample(input, 16_000)).toBe(input);
  });
});
