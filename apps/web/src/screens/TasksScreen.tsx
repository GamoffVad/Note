import { projectTasks } from "@mayak/domain";
import { Button, EmptyState } from "@mayak/islands";
import { Icon } from "../components/Icon.tsx";
import { TaskItem } from "../components/TaskItem.tsx";
import { useMayak } from "../state/MayakContext.tsx";
import { noteTitle } from "../state/format.ts";
import { routeHref } from "../state/router.ts";
import { sortNotes, useCreateNote } from "./NotesList.tsx";

/** Общий список задач — проекция task-блоков; отметка меняет исходную заметку. */
export function TasksScreen() {
  const { notes, setTaskChecked } = useMayak();
  const create = useCreateNote();
  const groups = sortNotes(notes.filter((n) => !n.deleted))
    .map((note) => ({ note, tasks: projectTasks([note]) }))
    .filter((g) => g.tasks.length > 0);
  const open = groups.reduce((sum, g) => sum + g.tasks.filter((t) => !t.checked).length, 0);

  return (
    <article className="page">
      <header className="page-header">
        <h1 className="page-title">Задачи</h1>
        <p className="page-subtitle">По одному шагу</p>
      </header>
      {groups.length === 0 ? (
        <EmptyState
          title="Задач пока нет"
          icon={<Icon name="tasks" />}
          action={
            <Button variant="primary" onClick={() => void create(true)}>
              Создать заметку со списком
            </Button>
          }
        >
          Задачи появятся здесь, когда вы добавите список в заметку.
        </EmptyState>
      ) : (
        <>
          <p className="intro">{open ? `Осталось сделать: ${open}.` : "Всё сделано. Отличная работа."}</p>
          {groups.map(({ note, tasks }) => (
            <section key={note.id} className="task-group" aria-labelledby={`tg-${note.id}`}>
              <h2 id={`tg-${note.id}`} className="task-group__title isl-headline">
                <a href={routeHref({ section: "notes", noteId: note.id })}>{noteTitle(note.document)}</a>
              </h2>
              <div className="card task-group__card">
                {tasks.map((task) => (
                  <TaskItem
                    key={task.blockId}
                    task={task}
                    onToggle={(checked) => void setTaskChecked(task.noteId, task.blockId, checked)}
                  />
                ))}
              </div>
            </section>
          ))}
          <p className="explain">
            Отметки связаны с исходной заметкой: изменение здесь меняет ту же задачу в заметке и на других устройствах.
          </p>
        </>
      )}
    </article>
  );
}
