import { Badge, type Tone } from "@mayak/ui";
import { noteSyncState, type ConflictRecord, type LocalNote, type OutboxEntry } from "@mayak/sync";
import { formatRelativeDate, notePreview, noteTitle } from "../state/format.ts";
import { routeHref } from "../state/router.ts";
import { Icon } from "./Icon.tsx";

/** Состояние синхронизации заметки: подпись и тон значка. */
const STATE_BADGE: Record<ReturnType<typeof noteSyncState>, { label: string; tone: Tone } | null> = {
  "local-saved": { label: "Не отправлено", tone: "neutral" },
  syncing: { label: "Отправляется", tone: "info" },
  conflict: { label: "Конфликт версий", tone: "warning" },
  failed: { label: "Ошибка отправки", tone: "danger" },
  "cloud-saved": null,
};

interface Props {
  note: LocalNote;
  outbox: OutboxEntry | undefined;
  conflict: ConflictRecord | undefined;
  selected: boolean;
  showSyncState: boolean;
}

/** Элемент списка заметок: скруглённое выделение, Enter открывает (ссылка). */
export function NoteListItem({ note, outbox, conflict, selected, showSyncState }: Props) {
  const state = noteSyncState(note, outbox, conflict);
  const badge = state === "conflict" || state === "failed" || showSyncState ? STATE_BADGE[state] : null;
  const tag = note.document.tags[0];
  return (
    <a
      className={`note-item${selected ? " selected" : ""}`}
      href={routeHref({ section: "notes", noteId: note.id })}
      aria-current={selected ? "page" : undefined}
      data-note-id={note.id}
    >
      <strong className="note-item__title">
        {note.document.pinned && (
          <span className="note-item__pin">
            <Icon name="pin" size={14} />
            <span className="mk-visually-hidden">Закреплена. </span>
          </span>
        )}
        <span>{noteTitle(note.document)}</span>
      </strong>
      <span className="note-item__preview">{notePreview(note.document)}</span>
      <small className="note-item__meta">
        <span>
          {formatRelativeDate(note.updatedAt)}
          {tag ? ` · ${tag}` : ""}
        </span>
        {badge && <Badge tone={badge.tone}>{badge.label}</Badge>}
      </small>
    </a>
  );
}
