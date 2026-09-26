import { Button, EmptyState, useToast } from "@mayak/islands";
import { Icon } from "../components/Icon.tsx";
import { useMayak } from "../state/MayakContext.tsx";
import { formatRelativeDate, notePreview, noteTitle } from "../state/format.ts";
import { navigate, routeHref } from "../state/router.ts";

export function TrashScreen() {
  const { notes, setDeleted } = useMayak();
  const toast = useToast();
  const deleted = notes.filter((n) => n.deleted).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

  return (
    <article className="page">
      <header className="page-header">
        <h1 className="page-title">Корзина</h1>
        <p className="page-subtitle">Ничего не пропадает сразу</p>
      </header>
      {deleted.length === 0 ? (
        <EmptyState title="Корзина пуста" icon={<Icon name="trash" />}>
          Удалённые заметки хранятся здесь, пока вы их не восстановите.
        </EmptyState>
      ) : (
        <ul className="card trash-list">
          {deleted.map((note) => (
            <li key={note.id} className="trash-item">
              <div className="trash-item__text">
                <a href={routeHref({ section: "notes", noteId: note.id })}>
                  <strong>{noteTitle(note.document)}</strong>
                </a>
                <span className="isl-caption">
                  Удалена {formatRelativeDate(note.updatedAt).toLocaleLowerCase("ru")} · {notePreview(note.document)}
                </span>
              </div>
              <Button
                size="small"
                icon={<Icon name="restore" />}
                onClick={async () => {
                  await setDeleted(note.id, false);
                  toast({
                    text: "Заметка восстановлена",
                    tone: "success",
                    action: { label: "Открыть", run: () => navigate({ section: "notes", noteId: note.id }) },
                  });
                }}
              >
                Восстановить
              </Button>
            </li>
          ))}
        </ul>
      )}
      <p className="explain">
        Удаление и восстановление синхронизируются как обычные изменения. Окончательное удаление и автоматическая
        очистка корзины пока не реализованы.
      </p>
    </article>
  );
}
