import { useState } from "react";
import { toMarkdown, type NoteDocument } from "@mayak/domain";
import type { ConflictChoice, ConflictRecord, LocalNote } from "@mayak/sync";
import { useMayak } from "../state/MayakContext.tsx";
import { formatRelativeDate } from "../state/format.ts";
import { navigate } from "../state/router.ts";
import { Dialog } from "./Dialog.tsx";
import { useToast } from "./Toast.tsx";

interface Props {
  note: LocalNote;
  conflict: ConflictRecord;
  onClose: () => void;
}

/** Сравнение версий. «Сохранить обе» — безопасное действие по умолчанию. */
export function ConflictDialog({ note, conflict, onClose }: Props) {
  const { resolveConflict } = useMayak();
  const toast = useToast();
  const [saving, setSaving] = useState<ConflictChoice | null>(null);
  const server = conflict.server;

  const choose = async (choice: ConflictChoice) => {
    setSaving(choice);
    try {
      const { copyId } = await resolveConflict(note.id, choice);
      onClose();
      if (copyId) {
        toast({ text: "Обе версии сохранены: ваша — отдельной заметкой", tone: "success" });
        navigate({ section: "notes", noteId: copyId });
      } else {
        toast({ text: choice === "mine" ? "Оставлена ваша версия" : "Оставлена версия с другого устройства", tone: "success" });
      }
    } catch {
      setSaving(null);
      toast({ text: "Не удалось сохранить выбор. Обе версии остались на устройстве", tone: "error" });
    }
  };

  return (
    <Dialog
      title="Найдены изменения с другого устройства"
      onClose={onClose}
      wide
      initialFocus="[data-default]"
      actions={
        <>
          <button type="button" className="button" disabled={saving !== null} onClick={() => choose("theirs")}>
            {saving === "theirs" ? "Сохраняем…" : "Взять с другого устройства"}
          </button>
          <button type="button" className="button" disabled={saving !== null} onClick={() => choose("mine")}>
            {saving === "mine" ? "Сохраняем…" : "Оставить мою"}
          </button>
          <button
            type="button"
            className="button primary"
            data-default
            aria-busy={saving === "both"}
            disabled={saving !== null}
            onClick={() => choose("both")}
          >
            {saving === "both" ? "Сохраняем…" : "Сохранить обе"}
          </button>
        </>
      }
    >
      <p>
        Эту заметку изменили на двух устройствах. Ничего не потеряно: выберите версию или сохраните обе — ваша станет
        отдельной заметкой.
      </p>
      <div className="compare">
        <Version label="Моя версия" hint={`изменена ${formatRelativeDate(note.updatedAt)}`} document={note.document} deleted={note.deleted} />
        {server ? (
          <Version
            label="С другого устройства"
            hint={`изменена ${formatRelativeDate(server.updatedAt)}`}
            document={server.document}
            deleted={server.deleted}
          />
        ) : (
          <section className="version">
            <h3>С другого устройства</h3>
            <p className="muted">Заметка окончательно удалена на сервере.</p>
          </section>
        )}
      </div>
    </Dialog>
  );
}

function Version({ label, hint, document, deleted }: { label: string; hint: string; document: NoteDocument; deleted: boolean }) {
  return (
    <section className="version">
      <h3>{label}</h3>
      <p className="muted small">
        {hint}
        {deleted && " · в корзине"}
      </p>
      <pre className="version-text">{toMarkdown(document)}</pre>
    </section>
  );
}
