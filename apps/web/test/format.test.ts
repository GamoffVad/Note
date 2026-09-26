import { describe, expect, it } from "vitest";
import { formatRelativeDate, notePreview, plural, safeFileName } from "../src/state/format.ts";
import { parseRoute, routeHref } from "../src/state/router.ts";

describe("форматирование", () => {
  const now = new Date(2026, 8, 26, 12, 0);

  it("относительные даты по-русски", () => {
    expect(formatRelativeDate(new Date(2026, 8, 26, 10, 42).toISOString(), now)).toBe("Сегодня, 10:42");
    expect(formatRelativeDate(new Date(2026, 8, 25, 19, 10).toISOString(), now)).toBe("Вчера, 19:10");
    expect(formatRelativeDate(new Date(2026, 8, 24, 8, 0).toISOString(), now)).toBe("24 сентября");
    expect(formatRelativeDate(new Date(2025, 0, 3).toISOString(), now)).toBe("3 января 2025");
  });

  it("склонение числительных", () => {
    expect([1, 2, 5, 11, 21, 22, 112].map((n) => plural(n, "заметка", "заметки", "заметок"))).toEqual([
      "заметка",
      "заметки",
      "заметок",
      "заметок",
      "заметка",
      "заметки",
      "заметок",
    ]);
  });

  it("безопасное имя файла: без путей, служебных символов и зарезервированных имён Windows", () => {
    expect(safeFileName("Отчёт: итоги", "md")).toBe("Отчёт итоги.md");
    expect(safeFileName("../../etc/passwd", "md")).toBe(".. .. etc passwd.md");
    expect(safeFileName("CON", "md")).toBe("Заметка.md");
    expect(safeFileName("   ", "md")).toBe("Заметка.md");
    expect(safeFileName("точка в конце. ", "md")).toBe("точка в конце.md");
  });

  it("фрагмент заметки для списка", () => {
    expect(notePreview({ title: "", blocks: [], tags: [], pinned: false })).toBe("Пустая заметка");
    expect(
      notePreview({
        title: "",
        blocks: [
          { id: "a", type: "task", text: "x", checked: true },
          { id: "b", type: "task", text: "y", checked: false },
        ],
        tags: [],
        pinned: false,
      }),
    ).toBe("Задачи: выполнено 1 из 2");
  });

  it("маршруты hash туда и обратно", () => {
    const id = "6f1c2a4e-1111-4222-8333-944455556666";
    expect(parseRoute(routeHref({ section: "notes", noteId: id }))).toEqual({ section: "notes", noteId: id, tag: null });
    expect(parseRoute(routeHref({ section: "notes", tag: "Личное дело" }))).toEqual({ section: "notes", noteId: null, tag: "Личное дело" });
    expect(parseRoute("#/неизвестно")).toMatchObject({ section: "notes" });
    expect(parseRoute("#/tasks")).toEqual({ section: "tasks", noteId: null, tag: null });
  });
});
