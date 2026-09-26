import { forwardRef, useMemo } from "react";
import { emptyDocument, newId } from "@mayak/domain";
import type { LocalNote } from "@mayak/sync";
import { Icon } from "../components/Icon.tsx";
import { NoteListItem } from "../components/NoteListItem.tsx";
import { SearchField } from "../components/SearchField.tsx";
import { useMayak } from "../state/MayakContext.tsx";
import { searchableText } from "../state/format.ts";
import { requestTitleFocus } from "../state/focus.ts";
import { navigate } from "../state/router.ts";

interface Props {
  selectedId: string | null;
  tag: string | null;
  query: string;
  onQuery: (value: string) => void;
}

export function sortNotes(notes: LocalNote[]): LocalNote[] {
  return [...notes].sort(
    (a, b) => Number(b.document.pinned) - Number(a.document.pinned) || b.updatedAt.localeCompare(a.updatedAt),
  );
}

export function useCreateNote() {
  const { createNote } = useMayak();
  return async (withTask = false) => {
    const doc = emptyDocument();
    doc.blocks = [withTask ? { id: newId(), type: "task", text: "", checked: false } : { id: newId(), type: "markdown", text: "" }];
    const note = await createNote(doc);
    requestTitleFocus(note.id);
    navigate({ section: "notes", noteId: note.id });
    return note;
  };
}

/** Колонка списка: создание, поиск, закреплённые и недавние заметки. */
export const NotesList = forwardRef<HTMLInputElement, Props>(function NotesList({ selectedId, tag, query, onQuery }, searchRef) {
  const { notes, outbox, conflicts, workspace } = useMayak();
  const create = useCreateNote();
  const q = query.trim().toLocaleLowerCase("ru");

  const visible = useMemo(() => {
    const alive = notes.filter((n) => !n.deleted && (!tag || n.document.tags.includes(tag)));
    return sortNotes(q ? alive.filter((n) => searchableText(n.document).includes(q)) : alive);
  }, [notes, tag, q]);
  const total = notes.filter((n) => !n.deleted).length;
  const pinned = visible.filter((n) => n.document.pinned);
  const recent = visible.filter((n) => !n.document.pinned);

  const renderItems = (items: LocalNote[]) =>
    items.map((note) => (
      <li key={note.id}>
        <NoteListItem
          note={note}
          outbox={outbox.get(note.id)}
          conflict={conflicts.get(note.id)}
          selected={note.id === selectedId}
          showSyncState={workspace.transport !== null}
        />
      </li>
    ));

  return (
    <section className="list" aria-label="Список заметок">
      <div className="list-header">
        <h2>{tag ? `# ${tag}` : "Все заметки"}</h2>
        <button type="button" className="new" onClick={() => void create()} aria-label="Создать заметку" title="Новая заметка (Ctrl+Alt+N)">
          <Icon name="plus" />
        </button>
      </div>
      <SearchField ref={searchRef} value={query} onChange={onQuery} />
      {tag && (
        <p className="filter-line">
          Показаны заметки с тегом «{tag}».{" "}
          <button type="button" className="link-button" onClick={() => navigate({ section: "notes" })}>
            Показать все
          </button>
        </p>
      )}

      {total === 0 ? (
        <div className="empty">
          <strong>Запишите первую мысль</strong>
          <p>Заметка сохранится на этом устройстве даже без интернета.</p>
          <button type="button" className="button primary" onClick={() => void create()}>
            Создать заметку
          </button>
        </div>
      ) : visible.length === 0 ? (
        <div className="empty">
          <strong>{q ? `Ничего не найдено по запросу «${query.trim()}»` : "Нет заметок с этим тегом"}</strong>
          <p>Попробуйте другое слово или сбросьте фильтры.</p>
          <button
            type="button"
            className="button"
            onClick={() => {
              onQuery("");
              if (tag) navigate({ section: "notes" });
            }}
          >
            Очистить поиск
          </button>
        </div>
      ) : (
        <>
          {q && (
            <p className="visually-hidden" role="status">
              Найдено: {visible.length}
            </p>
          )}
          {pinned.length > 0 && (
            <>
              <div className="list-label">Закреплённые</div>
              <ul className="note-list">{renderItems(pinned)}</ul>
            </>
          )}
          {recent.length > 0 && (
            <>
              <div className="list-label">{q ? "Результаты поиска" : "Недавние записи"}</div>
              <ul className="note-list">{renderItems(recent)}</ul>
            </>
          )}
        </>
      )}
    </section>
  );
});
