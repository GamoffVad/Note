import { useEffect, useState } from "react";
import type { TaskView } from "@mayak/domain";
import { routeHref } from "../state/router.ts";

interface Props {
  task: TaskView;
  onToggle: (checked: boolean) => void;
  showNoteLink?: boolean;
  pending?: boolean;
}

/** Задача: чекбокс меняет исходный блок заметки. Пробел переключает (нативно). */
export function TaskItem({ task, onToggle, showNoteLink, pending }: Props) {
  const id = `task-${task.noteId}-${task.blockId}`;
  // Отметка видна сразу; запись в локальную базу подтверждает её через мгновение.
  const [optimistic, setOptimistic] = useState<boolean | null>(null);
  useEffect(() => setOptimistic(null), [task.checked]);
  const checked = optimistic ?? task.checked;
  return (
    <div className="checkrow">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(e) => {
          setOptimistic(e.target.checked);
          onToggle(e.target.checked);
        }}
      />
      <label htmlFor={id}>{task.text.trim() || "Пустая задача"}</label>
      {pending && <span className="badge badge-local-saved">Не отправлено</span>}
      {showNoteLink && (
        <a className="task-note-link" href={routeHref({ section: "notes", noteId: task.noteId })}>
          Открыть заметку
        </a>
      )}
    </div>
  );
}
