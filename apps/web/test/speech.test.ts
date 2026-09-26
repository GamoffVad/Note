import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { composeDictation, joinPhrases, onSpeech, speechBridge, type SpeechEvent } from "../src/state/speech.ts";

describe("диктовка на телефоне", () => {
  // Тесты идут без браузера: window — пустой объект.
  beforeEach(() => vi.stubGlobal("window", {}));
  afterEach(() => vi.unstubAllGlobals());

  it("склеивает фразы через один пробел", () => {
    expect(joinPhrases("", " привет ", "", "мир")).toBe("привет мир");
  });

  it("вставляет текст в позицию курсора с пробелами по краям", () => {
    expect(composeDictation("Список:", "молоко хлеб", "")).toEqual({ text: "Список: молоко хлеб", caret: 19 });
    expect(composeDictation("Начало ", "середина", "конец")).toEqual({ text: "Начало середина конец", caret: 15 });
    expect(composeDictation("", "первое слово", "")).toEqual({ text: "первое слово", caret: 12 });
  });

  it("не ставит пробел перед знаком препинания после курсора", () => {
    expect(composeDictation("Купить ", "молоко", ", хлеб").text).toBe("Купить молоко, хлеб");
  });

  it("пока ничего не распознано, текст не меняется", () => {
    expect(composeDictation("до", "", "после")).toEqual({ text: "допосле", caret: 2 });
  });

  it("мост есть, только если распознавание доступно на телефоне", () => {
    expect(speechBridge()).toBeNull();
    window.MayakSpeech = { available: () => false, start: vi.fn(), stop: vi.fn() };
    expect(speechBridge()).toBeNull();
    window.MayakSpeech = { available: () => true, start: vi.fn(), stop: vi.fn() };
    expect(speechBridge()).toBe(window.MayakSpeech);
  });

  it("передаёт события и отписывается", () => {
    const events: SpeechEvent[] = [];
    const off = onSpeech((e) => events.push(e));
    window.__mayakSpeech?.(JSON.stringify({ type: "partial", text: "при" }));
    window.__mayakSpeech?.("не json");
    window.__mayakSpeech?.(JSON.stringify({ type: "final", text: "привет" }));
    off();
    expect(window.__mayakSpeech).toBeUndefined();
    expect(events).toEqual([
      { type: "partial", text: "при" },
      { type: "final", text: "привет" },
    ]);
  });
});
