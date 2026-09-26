import { useEffect, useState } from "react";
import type { TaskView } from "@mayak/domain";
import { Checkbox } from "@mayak/islands";

interface Props {
  task: TaskView;
  onToggle: (checked: boolean) => void;
}

/** Задача: флажок библиотеки меняет исходный блок заметки; Пробел переключает. */
export function TaskItem({ task, onToggle }: Props) {
  // Отметка видна сразу; запись в локальную базу подтверждает её через мгновение.
  const [optimistic, setOptimistic] = useState<boolean | null>(null);
  useEffect(() => setOptimistic(null), [task.checked]);
  const checked = optimistic ?? task.checked;
  return (
    <div className="task-row">
      <Checkbox
        id={`task-${task.noteId}-${task.blockId}`}
        strike
        checked={checked}
        label={task.text.trim() || "Пустая задача"}
        onChange={(e) => {
          setOptimistic(e.target.checked);
          onToggle(e.target.checked);
        }}
      />
    </div>
  );
}
