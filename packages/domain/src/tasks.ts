import type { NoteDocument } from "./document.ts";

export interface TaskView {
  noteId: string;
  noteTitle: string;
  blockId: string;
  text: string;
  checked: boolean;
}

export interface NoteForTasks {
  id: string;
  document: NoteDocument;
  deleted: boolean;
}

/** Общий список задач — производная проекция task-блоков заметок. */
export function projectTasks(notes: Iterable<NoteForTasks>): TaskView[] {
  const tasks: TaskView[] = [];
  for (const note of notes) {
    if (note.deleted) continue;
    for (const block of note.document.blocks) {
      if (block.type !== "task") continue;
      tasks.push({
        noteId: note.id,
        noteTitle: note.document.title,
        blockId: block.id,
        text: block.text,
        checked: block.checked,
      });
    }
  }
  return tasks;
}

/**
 * Отметка задачи меняет исходный task-блок заметки (тот же id),
 * остальные блоки не пересоздаются.
 */
export function setTaskChecked(doc: NoteDocument, blockId: string, checked: boolean): NoteDocument {
  let found = false;
  const blocks = doc.blocks.map((block) => {
    if (block.id !== blockId) return block;
    if (block.type !== "task") throw new Error(`Блок ${blockId} не является задачей`);
    found = true;
    return { ...block, checked };
  });
  if (!found) throw new Error(`Задача ${blockId} не найдена в заметке`);
  return { ...doc, blocks };
}
