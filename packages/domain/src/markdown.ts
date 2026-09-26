import type { Block, NoteDocument } from "./document.ts";
import { newId } from "./ids.ts";

/**
 * Markdown — представление для экспорта, а не каноническое хранение.
 * Формат описан в docs/markdown-format.md.
 *
 * Экспорт:
 *   # Заголовок
 *   <пустая строка>
 *   блоки через пустую строку; подряд идущие задачи — по строке на задачу:
 *   - [ ] текст / - [x] текст
 *   вложение: [подпись](mayak-file:<fileId>)
 *
 * Импорт создаёт новые UUID блоков (ТЗ, раздел 3). Теги и закрепление
 * в Markdown не переносятся — для полной структуры есть JSON-архив.
 */
const TASK_RE = /^- \[( |x|X)\] ?(.*)$/;
const ATTACHMENT_RE = /^\[(.*)\]\(mayak-file:([0-9a-fA-F-]{36})\)$/;

export function toMarkdown(doc: NoteDocument): string {
  const parts: string[] = [];
  if (doc.title) parts.push(`# ${singleLine(doc.title)}`);
  let taskRun: string[] = [];
  const flushTasks = () => {
    if (taskRun.length) parts.push(taskRun.join("\n"));
    taskRun = [];
  };
  for (const block of doc.blocks) {
    if (block.type === "task") {
      taskRun.push(`- [${block.checked ? "x" : " "}] ${singleLine(block.text)}`);
      continue;
    }
    flushTasks();
    if (block.type === "markdown") parts.push(block.text);
    else parts.push(`[${escapeLabel(block.text)}](mayak-file:${block.fileId})`);
  }
  flushTasks();
  return parts.join("\n\n") + "\n";
}

export function fromMarkdown(markdown: string, idFactory: () => string = newId): NoteDocument {
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
  let title = "";
  let start = 0;
  while (start < lines.length && lines[start]!.trim() === "") start++;
  const first = lines[start];
  if (first !== undefined && first.startsWith("# ")) {
    title = first.slice(2).trim();
    start++;
  }

  const blocks: Block[] = [];
  let paragraph: string[] = [];
  const flushParagraph = () => {
    while (paragraph.length && paragraph[paragraph.length - 1]!.trim() === "") paragraph.pop();
    while (paragraph.length && paragraph[0]!.trim() === "") paragraph.shift();
    if (paragraph.length) blocks.push({ id: idFactory(), type: "markdown", text: paragraph.join("\n") });
    paragraph = [];
  };

  for (let i = start; i < lines.length; i++) {
    const line = lines[i]!;
    const task = TASK_RE.exec(line);
    if (task) {
      flushParagraph();
      blocks.push({ id: idFactory(), type: "task", text: task[2] ?? "", checked: task[1] !== " " });
      continue;
    }
    const attachment = ATTACHMENT_RE.exec(line);
    if (attachment && paragraph.every((l) => l.trim() === "")) {
      flushParagraph();
      blocks.push({
        id: idFactory(),
        type: "attachment",
        text: unescapeLabel(attachment[1] ?? ""),
        fileId: attachment[2]!.toLowerCase(),
      });
      continue;
    }
    if (line.trim() === "") {
      // Пустая строка разделяет абзацы-блоки.
      flushParagraph();
      continue;
    }
    paragraph.push(line);
  }
  flushParagraph();
  return { title, blocks, tags: [], pinned: false };
}

function singleLine(text: string): string {
  return text.replace(/\s*\n\s*/g, " ");
}

function escapeLabel(text: string): string {
  return singleLine(text).replace(/[\\\]]/g, (c) => `\\${c}`);
}

function unescapeLabel(text: string): string {
  return text.replace(/\\([\\\]])/g, "$1");
}
