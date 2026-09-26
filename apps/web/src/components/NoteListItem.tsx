import { Badge, NoteCard, type Tone } from "@mayak/islands";
import { noteSyncState, type ConflictRecord, type LocalNote, type OutboxEntry } from "@mayak/sync";
import { formatRelativeDate, notePreview, noteTitle } from "../state/format.ts";
import { routeHref } from "../state/router.ts";

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

/** Карточка заметки в списке: заголовок, фрагмент, дата и тег; Enter открывает (ссылка). */
export function NoteListItem({ note, outbox, conflict, selected, showSyncState }: Props) {
  const state = noteSyncState(note, outbox, conflict);
  const badge = state === "conflict" || state === "failed" || showSyncState ? STATE_BADGE[state] : null;
  const tag = note.document.tags[0];
  const preview = notePreview(note.document);
  return (
    <NoteCard
      className="note-item"
      href={routeHref({ section: "notes", noteId: note.id })}
      data-note-id={note.id}
      selected={selected}
      pinned={note.document.pinned}
      title={noteTitle(note.document)}
      snippet={preview || undefined}
      meta={`${formatRelativeDate(note.updatedAt)}${tag ? ` · # ${tag}` : ""}`}
      badges={badge && <Badge tone={badge.tone}>{badge.label}</Badge>}
    />
  );
}
