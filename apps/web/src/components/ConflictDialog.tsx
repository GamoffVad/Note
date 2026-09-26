import { useState } from "react";
import { Button, Sheet, useToast } from "@mayak/islands";
import { toMarkdown, type NoteDocument } from "@mayak/domain";
import type { ConflictChoice, ConflictRecord, LocalNote } from "@mayak/sync";
import { useMayak } from "../state/MayakContext.tsx";
import { formatRelativeDate } from "../state/format.ts";
import { navigate } from "../state/router.ts";

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
    <Sheet
      title="Найдены изменения с другого устройства"
      onClose={onClose}
      size="wide"
      initialFocus="[data-default]"
      actions={
        <>
          <Button disabled={saving !== null} loading={saving === "theirs"} loadingLabel="Сохраняем…" onClick={() => choose("theirs")}>
            Взять с другого устройства
          </Button>
          <Button disabled={saving !== null} loading={saving === "mine"} loadingLabel="Сохраняем…" onClick={() => choose("mine")}>
            Оставить мою
          </Button>
          <Button
            variant="primary"
            data-default
            disabled={saving !== null}
            loading={saving === "both"}
            loadingLabel="Сохраняем…"
            onClick={() => choose("both")}
          >
            Сохранить обе
          </Button>
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
            <h3 className="isl-headline">С другого устройства</h3>
            <p className="isl-secondary">Заметка окончательно удалена на сервере.</p>
          </section>
        )}
      </div>
    </Sheet>
  );
}

function Version({ label, hint, document, deleted }: { label: string; hint: string; document: NoteDocument; deleted: boolean }) {
  return (
    <section className="version">
      <h3 className="isl-headline">{label}</h3>
      <p className="isl-caption">
        {hint}
        {deleted && " · в корзине"}
      </p>
      <pre className="version-text">{toMarkdown(document)}</pre>
    </section>
  );
}
