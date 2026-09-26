import type { NoteDocument } from "@mayak/domain";

const MONTHS = [
  "января",
  "февраля",
  "марта",
  "апреля",
  "мая",
  "июня",
  "июля",
  "августа",
  "сентября",
  "октября",
  "ноября",
  "декабря",
];

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export function formatTime(ms: number | Date): string {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** «Сегодня, 10:42», «Вчера, 19:10», «24 сентября», «24 сентября 2025». */
export function formatRelativeDate(iso: string, now: Date = new Date()): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  if (sameDay(d, now)) return `Сегодня, ${formatTime(d)}`;
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (sameDay(d, yesterday)) return `Вчера, ${formatTime(d)}`;
  const base = `${d.getDate()} ${MONTHS[d.getMonth()]}`;
  return d.getFullYear() === now.getFullYear() ? base : `${base} ${d.getFullYear()}`;
}

export function noteTitle(doc: NoteDocument): string {
  return doc.title.trim() || "Без названия";
}

/** Короткий фрагмент для списка: первый текстовый блок или сводка задач. */
export function notePreview(doc: NoteDocument): string {
  const text = doc.blocks.find((b) => b.type === "markdown" && b.text.trim());
  if (text) {
    const line = text.text.replace(/\s+/g, " ").trim();
    return line.length > 120 ? `${line.slice(0, 119)}…` : line;
  }
  const tasks = doc.blocks.filter((b) => b.type === "task");
  if (tasks.length) {
    const done = tasks.filter((t) => t.type === "task" && t.checked).length;
    return `Задачи: выполнено ${done} из ${tasks.length}`;
  }
  return "Пустая заметка";
}

/** Текст для поиска: заголовок, блоки и теги. */
export function searchableText(doc: NoteDocument): string {
  return [doc.title, ...doc.blocks.map((b) => b.text), ...doc.tags].join("\n").toLocaleLowerCase("ru");
}

export function plural(n: number, one: string, few: string, many: string): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

/** Безопасное имя файла экспорта: без путей, управляющих символов и зарезервированных имён Windows. */
export function safeFileName(title: string, extension: string): string {
  let base = title
    .replace(/[\u0000-\u001f\u007f<>:"/\\|?*]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[. ]+$/, "")
    .slice(0, 80);
  if (!base || /^(con|prn|aux|nul|com\d|lpt\d)$/i.test(base)) base = "Заметка";
  return `${base}.${extension}`;
}

/** Скачивание через временную ссылку в документе: так браузер учитывает имя файла. */
export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.hidden = true;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
