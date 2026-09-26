import { forwardRef, useMemo } from "react";
import { emptyDocument, newId } from "@mayak/domain";
import type { LocalNote } from "@mayak/sync";
import { Button, EmptyState, Hero, IconButton, IconLink, ScreenTitle, SearchField, SectionLabel, Tooltip } from "@mayak/islands";
import art from "@mayak/islands/art.webp";
import artSmall from "@mayak/islands/art-small.webp";
import { Icon } from "../components/Icon.tsx";
import { NoteListItem } from "../components/NoteListItem.tsx";
import { SyncFooter } from "../components/SyncIndicator.tsx";
import { useMayak } from "../state/MayakContext.tsx";
import { plural, searchableText } from "../state/format.ts";
import { requestTitleFocus } from "../state/focus.ts";
import { navigate, routeHref } from "../state/router.ts";

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

/**
 * Колонка списка («Острова идей»): заголовок экрана с действиями, поиск,
 * на телефоне — изображение-герой с числом записей, карточки заметок.
 */
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
      <ScreenTitle
        as="h2"
        className="list-header"
        actions={
          <>
            <Tooltip label="Новая заметка · Ctrl+Alt+N">
              <IconButton className="new" label="Создать заметку" tooltip={false} icon={<Icon name="plus" />} onClick={() => void create()} />
            </Tooltip>
            <IconLink className="phone-only" label="Настройки" icon={<Icon name="settings" />} href={routeHref({ section: "settings" })} />
          </>
        }
      >
        {tag ? `# ${tag}` : "Заметки"}
      </ScreenTitle>
      {/* Телефон: верхней панели нет — статус синхронизации под заголовком. */}
      <div className="phone-status">
        <SyncFooter />
      </div>
      <SearchField ref={searchRef} className="list-search" label="Поиск по заметкам" placeholder="Поиск по заметкам" value={query} onChange={onQuery} />
      {total > 0 && !q && !tag && (
        <Hero
          className="list-hero"
          src={artSmall}
          srcSet={`${artSmall} 960w, ${art} 1600w`}
          title={`${total} ${plural(total, "запись", "записи", "записей")}`}
          caption="Идеи на своей карте"
        />
      )}
      {tag && (
        <p className="filter-line isl-caption">
          Показаны заметки с тегом «{tag}».{" "}
          <Button variant="plain" size="small" onClick={() => navigate({ section: "notes" })}>
            Показать все
          </Button>
        </p>
      )}

      {total === 0 ? (
        <EmptyState
          title="Запишите первую мысль"
          action={
            <Button variant="primary" onClick={() => void create()}>
              Создать заметку
            </Button>
          }
        >
          Заметка сохранится на этом устройстве даже без интернета.
        </EmptyState>
      ) : visible.length === 0 ? (
        <EmptyState
          title={q ? `Ничего не найдено по запросу «${query.trim()}»` : "Нет заметок с этим тегом"}
          action={
            <Button
              onClick={() => {
                onQuery("");
                if (tag) navigate({ section: "notes" });
              }}
            >
              Очистить поиск
            </Button>
          }
        >
          Попробуйте другое слово или сбросьте фильтры.
        </EmptyState>
      ) : (
        <>
          {q && (
            <p className="isl-visually-hidden" role="status">
              Найдено: {visible.length}
            </p>
          )}
          {pinned.length > 0 && (
            <>
              <SectionLabel as="h3">Закреплённые</SectionLabel>
              <ul className="note-list">{renderItems(pinned)}</ul>
            </>
          )}
          {recent.length > 0 && (
            <>
              <SectionLabel as="h3">{q ? "Результаты поиска" : "Ваши записи"}</SectionLabel>
              <ul className="note-list">{renderItems(recent)}</ul>
            </>
          )}
        </>
      )}
    </section>
  );
});
