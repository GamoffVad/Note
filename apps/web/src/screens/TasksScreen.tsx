import { projectTasks } from "@mayak/domain";
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
    <article className="sheet">
      <div className="eyebrow accent">По одному шагу</div>
      <h1 className="page-title">Ваши задачи</h1>
      {groups.length === 0 ? (
        <div className="empty-page">
          <p className="intro">Задачи появятся здесь, когда вы добавите список в заметку.</p>
          <button type="button" className="button primary" onClick={() => void create(true)}>
            Создать заметку со списком
          </button>
        </div>
      ) : (
        <>
          <p className="intro">{open ? `Осталось сделать: ${open}.` : "Всё сделано. Отличная работа."}</p>
          {groups.map(({ note, tasks }) => (
            <section key={note.id} className="task-group" aria-labelledby={`tg-${note.id}`}>
              <h3 id={`tg-${note.id}`}>
                <a href={routeHref({ section: "notes", noteId: note.id })}>{noteTitle(note.document)}</a>
              </h3>
              {tasks.map((task) => (
                <TaskItem
                  key={task.blockId}
                  task={task}
                  onToggle={(checked) => void setTaskChecked(task.noteId, task.blockId, checked)}
                />
              ))}
            </section>
          ))}
          <p className="cloud-explain">
            Отметки связаны с исходной заметкой: изменение здесь меняет ту же задачу в заметке и на других устройствах.
          </p>
        </>
      )}
    </article>
  );
}
