import { describe, expect, it } from "vitest";
import {
  backoffDelay,
  checkDocument,
  fromMarkdown,
  MAX_DOCUMENT_BYTES,
  newId,
  parseRetryAfter,
  projectTasks,
  setTaskChecked,
  stableStringify,
  toMarkdown,
  type NoteDocument,
} from "../src/index.ts";

function sampleDoc(): NoteDocument {
  return {
    title: "Планы на осень",
    blocks: [
      { id: newId(), type: "markdown", text: "Короткий план.\nВторая строка абзаца." },
      { id: newId(), type: "task", text: "Отправить материалы", checked: false },
      { id: newId(), type: "task", text: "Созвониться с командой", checked: true },
      { id: newId(), type: "attachment", fileId: newId(), text: "Материалы проекта.pdf" },
      { id: newId(), type: "markdown", text: "Итог: **важно** не забыть." },
    ],
    tags: ["Личное"],
    pinned: false,
  };
}

describe("документ", () => {
  it("принимает корректный документ", () => {
    expect(checkDocument(sampleDoc()).ok).toBe(true);
  });

  it("отклоняет повторяющиеся id блоков", () => {
    const doc = sampleDoc();
    doc.blocks[1] = { ...doc.blocks[1]!, id: doc.blocks[0]!.id } as NoteDocument["blocks"][number];
    const check = checkDocument(doc);
    expect(check.ok).toBe(false);
    expect(check.ok ? "" : check.reason).toBe("invalid");
  });

  it("отклоняет документ больше 1 MiB", () => {
    const doc = sampleDoc();
    doc.blocks.push({ id: newId(), type: "markdown", text: "я".repeat(MAX_DOCUMENT_BYTES / 2) });
    const check = checkDocument(doc);
    expect(check.ok ? "" : check.reason).toBe("too-large");
  });

  it("stableStringify не зависит от порядка ключей", () => {
    expect(stableStringify({ b: 1, a: { d: 2, c: [3, { f: 1, e: 2 }] } })).toBe(
      stableStringify({ a: { c: [3, { e: 2, f: 1 }], d: 2 }, b: 1 }),
    );
  });
});

describe("задачи — проекция блоков заметки", () => {
  it("общий список задач строится из task-блоков, заметки в корзине не участвуют", () => {
    const a = { id: newId(), document: sampleDoc(), deleted: false };
    const b = { id: newId(), document: sampleDoc(), deleted: true };
    const tasks = projectTasks([a, b]);
    expect(tasks).toHaveLength(2);
    expect(tasks.every((t) => t.noteId === a.id)).toBe(true);
  });

  it("A09: отметка меняет тот же блок, остальные блоки не пересоздаются", () => {
    const doc = sampleDoc();
    const task = doc.blocks[1]!;
    const next = setTaskChecked(doc, task.id, true);
    expect(next.blocks[1]).toEqual({ ...task, checked: true });
    expect(next.blocks.map((b) => b.id)).toEqual(doc.blocks.map((b) => b.id));
    expect(next.blocks[0]).toBe(doc.blocks[0]);
    expect(() => setTaskChecked(doc, doc.blocks[0]!.id, true)).toThrow();
  });
});

describe("Markdown", () => {
  it("экспортирует задачи как - [ ] / - [x], вложение как ссылку mayak-file", () => {
    const doc = sampleDoc();
    const md = toMarkdown(doc);
    expect(md).toContain("# Планы на осень\n");
    expect(md).toContain("- [ ] Отправить материалы\n- [x] Созвониться с командой");
    expect(md).toContain(`[Материалы проекта.pdf](mayak-file:${(doc.blocks[3] as { fileId: string }).fileId})`);
  });

  it("экспорт → импорт → экспорт даёт тот же Markdown; импорт создаёт новые id", () => {
    const doc = sampleDoc();
    const md = toMarkdown(doc);
    const imported = fromMarkdown(md);
    expect(toMarkdown(imported)).toBe(md);
    expect(imported.title).toBe(doc.title);
    expect(imported.blocks.map((b) => b.type)).toEqual(doc.blocks.map((b) => b.type));
    expect(imported.blocks.some((b, i) => b.id === doc.blocks[i]!.id)).toBe(false);
    expect(checkDocument(imported).ok).toBe(true);
  });

  it("не превращает перенос строки в тексте задачи в новый блок", () => {
    const doc: NoteDocument = {
      title: "",
      blocks: [{ id: newId(), type: "task", text: "первая\nвторая", checked: false }],
      tags: [],
      pinned: false,
    };
    expect(fromMarkdown(toMarkdown(doc)).blocks).toHaveLength(1);
  });
});

describe("повторы", () => {
  it("растут 1, 2, 4, 8 с и ограничены 60 с", () => {
    const max = (n: number) => backoffDelay(n, undefined, () => 0.999999);
    const min = (n: number) => backoffDelay(n, undefined, () => 0);
    expect([1, 2, 3, 4].map(max)).toEqual([1000, 2000, 4000, 8000]);
    expect(min(1)).toBe(500);
    expect(max(20)).toBe(60_000);
  });

  it("Retry-After имеет приоритет", () => {
    expect(backoffDelay(1, 30_000)).toBe(30_000);
    expect(parseRetryAfter("12")).toBe(12_000);
    expect(parseRetryAfter(new Date(10_000).toUTCString(), 4_000)).toBe(6_000);
    expect(parseRetryAfter(null)).toBeUndefined();
  });
});
