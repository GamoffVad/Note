import { Icon } from "../components/Icon.tsx";
import { useToast } from "../components/Toast.tsx";
import { useMayak } from "../state/MayakContext.tsx";
import { formatRelativeDate, notePreview, noteTitle } from "../state/format.ts";
import { navigate, routeHref } from "../state/router.ts";

export function TrashScreen() {
  const { notes, setDeleted } = useMayak();
  const toast = useToast();
  const deleted = notes.filter((n) => n.deleted).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

  return (
    <article className="sheet">
      <div className="eyebrow accent">Ничего не пропадает сразу</div>
      <h1 className="page-title">Корзина</h1>
      {deleted.length === 0 ? (
        <p className="intro">Корзина пуста.</p>
      ) : (
        <ul className="plain-list trash-list">
          {deleted.map((note) => (
            <li key={note.id} className="trash-item">
              <div>
                <a href={routeHref({ section: "notes", noteId: note.id })}>
                  <strong>{noteTitle(note.document)}</strong>
                </a>
                <span className="muted small">
                  Удалена {formatRelativeDate(note.updatedAt).toLocaleLowerCase("ru")} · {notePreview(note.document)}
                </span>
              </div>
              <button
                type="button"
                className="button"
                onClick={async () => {
                  await setDeleted(note.id, false);
                  toast({
                    text: "Заметка восстановлена",
                    tone: "success",
                    action: { label: "Открыть", run: () => navigate({ section: "notes", noteId: note.id }) },
                  });
                }}
              >
                <Icon name="restore" size={16} /> Восстановить
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="cloud-explain">
        Удаление и восстановление синхронизируются как обычные изменения. Окончательное удаление и автоматическая
        очистка корзины пока не реализованы.
      </p>
    </article>
  );
}
