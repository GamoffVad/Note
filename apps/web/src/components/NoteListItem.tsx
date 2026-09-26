import { noteSyncState, type ConflictRecord, type LocalNote, type OutboxEntry } from "@mayak/sync";
import { formatRelativeDate, notePreview, noteTitle } from "../state/format.ts";
import { routeHref } from "../state/router.ts";
import { Icon } from "./Icon.tsx";

const STATE_LABEL = {
  "local-saved": "Не отправлено",
  syncing: "Отправляется",
  conflict: "Конфликт версий",
  failed: "Ошибка отправки",
  "cloud-saved": null,
} as const;

interface Props {
  note: LocalNote;
  outbox: OutboxEntry | undefined;
  conflict: ConflictRecord | undefined;
  selected: boolean;
  showSyncState: boolean;
}

/** Элемент списка заметок: выделение цветом и полосой, Enter открывает (ссылка). */
export function NoteListItem({ note, outbox, conflict, selected, showSyncState }: Props) {
  const state = noteSyncState(note, outbox, conflict);
  const label = state === "conflict" || state === "failed" || showSyncState ? STATE_LABEL[state] : null;
  const tag = note.document.tags[0];
  return (
    <a
      className={`note-item${selected ? " selected" : ""}`}
      href={routeHref({ section: "notes", noteId: note.id })}
      aria-current={selected ? "page" : undefined}
      data-note-id={note.id}
    >
      <strong>
        {note.document.pinned && (
          <span className="pin" title="Закреплена">
            <Icon name="pin" size={14} />
            <span className="visually-hidden">Закреплена. </span>
          </span>
        )}
        {noteTitle(note.document)}
      </strong>
      <p>{notePreview(note.document)}</p>
      <small>
        {formatRelativeDate(note.updatedAt)}
        {tag ? ` · ${tag}` : ""}
        {label && <span className={`badge badge-${state}`}>{label}</span>}
      </small>
    </a>
  );
}
