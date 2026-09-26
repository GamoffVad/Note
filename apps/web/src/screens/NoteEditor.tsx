import { useCallback, useEffect, useRef, useState } from "react";
import {
  documentsEqual,
  MAX_TAG_LENGTH,
  MAX_TAGS,
  newId,
  toMarkdown,
  type HistoryEntry,
  type NoteDocument,
} from "@mayak/domain";
import { LocalWriteError } from "@mayak/local-store";
import { noteSyncState, TransportError, type ConflictRecord, type LocalNote, type OutboxEntry } from "@mayak/sync";
import { ConflictDialog } from "../components/ConflictDialog.tsx";
import { Dialog } from "../components/Dialog.tsx";
import { Icon } from "../components/Icon.tsx";
import { SyncDialog } from "../components/SyncIndicator.tsx";
import { useToast } from "../components/Toast.tsx";
import { useAutoHeight } from "../components/useAutoHeight.ts";
import { useMayak } from "../state/MayakContext.tsx";
import { downloadBlob, formatRelativeDate, formatTime, noteTitle, safeFileName } from "../state/format.ts";
import { takeTitleFocus } from "../state/focus.ts";
import { navigate, routeHref } from "../state/router.ts";
import { BlockEditor } from "./BlockEditor.tsx";

/** Объединение нажатий перед локальной записью (ТЗ, раздел 4). */
const SAVE_DELAY_MS = 150;

interface Props {
  note: LocalNote;
  outbox: OutboxEntry | undefined;
  conflict: ConflictRecord | undefined;
}

type Panel = "conflict" | "history" | "sync" | "dictation" | null;

export function NoteEditor({ note, outbox, conflict }: Props) {
  const { editNote, setDeleted, workspace } = useMayak();
  const toast = useToast();
  const [draft, setDraft] = useState<NoteDocument>(note.document);
  const [dirty, setDirty] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [panel, setPanel] = useState<Panel>(null);
  const draftRef = useRef(draft);
  const dirtyRef = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const readOnly = note.deleted;
  const editRef = useRef(editNote);
  editRef.current = editNote;

  const flush = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    if (!dirtyRef.current) return;
    const doc = draftRef.current;
    try {
      await editRef.current(note.id, doc);
      if (draftRef.current === doc) {
        dirtyRef.current = false;
        setDirty(false);
      }
      setSaveError(false);
    } catch (error) {
      // Ложного «сохранено» нет: черновик остаётся в редакторе и помечен ошибкой.
      setSaveError(true);
      if (!(error instanceof LocalWriteError)) console.error("Ошибка сохранения заметки");
    }
  }, [note.id]);

  const change = (next: NoteDocument) => {
    draftRef.current = next;
    dirtyRef.current = true;
    setDraft(next);
    setDirty(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush(), SAVE_DELAY_MS);
  };

  // Изменение с другого устройства применяется, только если нет несохранённого набора.
  useEffect(() => {
    if (dirtyRef.current) return;
    if (!documentsEqual(note.document, draftRef.current)) {
      draftRef.current = note.document;
      setDraft(note.document);
    }
  }, [note.document]);

  // Запись при уходе со страницы, скрытии вкладки и закрытии заметки; Ctrl/Cmd+S.
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === "hidden") void flush();
    };
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === "s") {
        event.preventDefault();
        void flush().then(() => toast({ text: "Сохранено на устройстве", tone: "success" }));
      }
    };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", onHide);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", onHide);
      window.removeEventListener("keydown", onKey);
      void flush();
    };
  }, [flush, toast]);

  const state = noteSyncState(note, outbox, conflict);
  const connected = workspace.transport !== null;
  const statusText = saveError
    ? "Не сохранено на устройстве"
    : dirty
      ? "Сохраняем на устройстве…"
      : state === "conflict"
        ? "Конфликт версий"
        : state === "failed"
          ? `Не отправлено: ${outbox?.failure?.message ?? "ошибка"}`
          : state === "syncing"
            ? "Сохранено на устройстве · отправляется"
            : state === "local-saved" || !connected
              ? "Сохранено на устройстве"
              : `Сохранено в облаке${note.cloudSavedAt ? ` · ${formatTime(new Date(note.cloudSavedAt))}` : ""}`;

  const exportMarkdown = () => {
    const blob = new Blob([toMarkdown(draftRef.current)], { type: "text/markdown;charset=utf-8" });
    downloadBlob(blob, safeFileName(noteTitle(draftRef.current), "md"));
  };

  const moveToTrash = async () => {
    await flush();
    await setDeleted(note.id, true);
    navigate({ section: "notes" }, { replace: true });
    toast({
      text: "Заметка перемещена в корзину",
      action: { label: "Отменить", run: () => void setDeleted(note.id, false) },
    });
  };

  return (
    <>
      <div className="editor-toolbar">
        <a className="mobile-back" href={routeHref({ section: "notes" })}>
          <Icon name="back" /> Заметки
        </a>
        <span className="crumb">Все заметки / {noteTitle(draft)}</span>
        <div className="tools">
          {!readOnly && (
            <button
              type="button"
              className="icon-button"
              aria-pressed={draft.pinned}
              aria-label={draft.pinned ? "Открепить заметку" : "Закрепить заметку"}
              title={draft.pinned ? "Открепить" : "Закрепить"}
              onClick={() => change({ ...draftRef.current, pinned: !draftRef.current.pinned })}
            >
              <Icon name="pin" />
            </button>
          )}
          <button type="button" className="icon-button" aria-label="Скачать как Markdown" title="Скачать .md" onClick={exportMarkdown}>
            <Icon name="download" />
          </button>
          <button type="button" className="icon-button" aria-label="История заметки" title="История" onClick={() => setPanel("history")}>
            <Icon name="history" />
          </button>
          {!readOnly && (
            <button type="button" className="icon-button" aria-label="В корзину" title="В корзину" onClick={() => void moveToTrash()}>
              <Icon name="trash" />
            </button>
          )}
          <button type="button" className="icon-button" aria-label="Состояние синхронизации" title="Синхронизация" onClick={() => setPanel("sync")}>
            <Icon name="sync" />
          </button>
        </div>
      </div>

      <article className="sheet">
        {saveError && (
          <div className="banner banner-danger" role="alert">
            <Icon name="warning" />
            <p>
              Не удалось сохранить на устройстве. Текст остаётся в редакторе — скачайте его, чтобы не потерять.
            </p>
            <button type="button" className="button" onClick={exportMarkdown}>
              Скачать текст
            </button>
            <button type="button" className="button" onClick={() => void flush()}>
              Повторить
            </button>
          </div>
        )}
        {conflict && (
          <div className="banner banner-warning" role="alert">
            <Icon name="warning" />
            <p>Найдены изменения с другого устройства. Ваша версия сохранена на этом устройстве.</p>
            <button type="button" className="button primary" onClick={() => setPanel("conflict")}>
              Сравнить
            </button>
          </div>
        )}
        {note.deleted && (
          <div className="banner" role="status">
            <Icon name="trash" />
            <p>Заметка в корзине. Восстановите её, чтобы редактировать.</p>
            <button type="button" className="button primary" onClick={() => void setDeleted(note.id, false)}>
              Восстановить
            </button>
          </div>
        )}
        {draft.conflictOf && (
          <p className="origin-note">
            <Icon name="warning" size={16} /> Копия, сохранённая при конфликте версий.{" "}
            <a href={routeHref({ section: "notes", noteId: draft.conflictOf })}>Открыть исходную заметку</a>
          </p>
        )}

        <div className="eyebrow accent">Место для ваших мыслей</div>
        <TitleField
          noteId={note.id}
          value={draft.title}
          readOnly={readOnly}
          onChange={(title) => change({ ...draftRef.current, title })}
        />
        <div className="byline">
          <span>{formatRelativeDate(note.updatedAt)}</span>
          <TagEditor
            tags={draft.tags}
            readOnly={readOnly}
            onChange={(tags) => change({ ...draftRef.current, tags })}
          />
          <span>Markdown</span>
          <span className={`save-state state-${saveError ? "failed" : dirty ? "dirty" : state}`}>{statusText}</span>
        </div>

        <BlockEditor
          blocks={draft.blocks}
          readOnly={readOnly}
          onChange={(blocks) => change({ ...draftRef.current, blocks })}
          onDictate={() => setPanel("dictation")}
        />
      </article>

      {panel === "conflict" && conflict && <ConflictDialog note={note} conflict={conflict} onClose={() => setPanel(null)} />}
      {panel === "history" && <HistoryDialog note={note} pending={dirty || !!outbox || !!conflict} onClose={() => setPanel(null)} />}
      {panel === "sync" && <SyncDialog onClose={() => setPanel(null)} />}
      {panel === "dictation" && <DictationDialog onClose={() => setPanel(null)} />}
    </>
  );
}

function TitleField(props: { noteId: string; value: string; readOnly: boolean; onChange: (v: string) => void }) {
  const { noteId, value, readOnly, onChange } = props;
  const ref = useRef<HTMLTextAreaElement>(null);
  useAutoHeight(ref, value);
  useEffect(() => {
    if (takeTitleFocus(noteId)) ref.current?.focus();
  }, [noteId]);
  return (
    <h1 className="title">
      <textarea
        ref={ref}
        rows={1}
        value={value}
        readOnly={readOnly}
        placeholder="Без названия"
        aria-label="Заголовок заметки"
        maxLength={500}
        data-title-field
        onChange={(e) => onChange(e.target.value.replace(/\n/g, " "))}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.nativeEvent.isComposing) {
            // Enter переводит к тексту заметки, а не вставляет перенос.
            e.preventDefault();
            e.currentTarget.closest(".sheet")?.querySelector<HTMLElement>("[data-field]")?.focus();
          }
        }}
      />
    </h1>
  );
}

function TagEditor({ tags, readOnly, onChange }: { tags: string[]; readOnly: boolean; onChange: (tags: string[]) => void }) {
  const [input, setInput] = useState("");
  const add = () => {
    const tag = input.trim().replace(/^#/, "").slice(0, MAX_TAG_LENGTH);
    setInput("");
    if (!tag || tags.includes(tag) || tags.length >= MAX_TAGS) return;
    onChange([...tags, tag]);
  };
  return (
    <>
      {tags.map((tag) => (
        <span className="tag-chip" key={tag}>
          <span className="tag-text"># {tag}</span>
          {!readOnly && (
            <button type="button" aria-label={`Убрать тег ${tag}`} onClick={() => onChange(tags.filter((t) => t !== tag))}>
              <Icon name="close" size={12} />
            </button>
          )}
        </span>
      ))}
      {!readOnly && (
        <input
          className="tag-input"
          value={input}
          placeholder="+ тег"
          aria-label="Добавить тег"
          maxLength={MAX_TAG_LENGTH}
          onChange={(e) => setInput(e.target.value)}
          onBlur={add}
          onKeyDown={(e) => {
            if ((e.key === "Enter" || e.key === ",") && !e.nativeEvent.isComposing) {
              e.preventDefault();
              add();
            }
          }}
        />
      )}
    </>
  );
}

function HistoryDialog({ note, pending, onClose }: { note: LocalNote; pending: boolean; onClose: () => void }) {
  const { workspace, syncNow } = useMayak();
  const toast = useToast();
  const [versions, setVersions] = useState<HistoryEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [restoring, setRestoring] = useState<string | null>(null);
  const transport = workspace.transport;

  useEffect(() => {
    if (!transport || note.serverRevision === 0) return;
    transport
      .history(note.id)
      .then((r) => setVersions(r.versions))
      .catch((e: unknown) => setError(e instanceof TransportError && e.status === 0 ? "Нет сети. История хранится на сервере." : "Не удалось загрузить историю."));
  }, [transport, note.id, note.serverRevision]);

  const restore = async (entry: HistoryEntry) => {
    if (!transport) return;
    setRestoring(entry.versionId);
    try {
      await transport.restore(note.id, { versionId: entry.versionId, baseRevision: note.serverRevision, mutationId: newId() });
      await syncNow();
      toast({ text: `Восстановлена версия ${entry.revision}`, tone: "success" });
      onClose();
    } catch (e) {
      setRestoring(null);
      setError(
        e instanceof TransportError && e.status === 409
          ? "Заметку успели изменить на другом устройстве. Обновите историю и повторите."
          : "Не удалось восстановить версию.",
      );
    }
  };

  let body;
  if (!transport) body = <p>История версий хранится на сервере и появится после подключения синхронизации.</p>;
  else if (note.serverRevision === 0) body = <p>Заметка ещё не отправлена на сервер — версий пока нет.</p>;
  else if (error) body = <p role="alert">{error}</p>;
  else if (!versions) body = <p aria-busy="true">Загружаем историю…</p>;
  else
    body = (
      <ol className="history-list">
        {versions.map((v) => (
          <li key={v.versionId}>
            <div>
              <strong>
                Версия {v.revision}
                {v.revision === note.serverRevision && " · текущая"}
              </strong>
              <span className="muted small">
                {formatRelativeDate(v.createdAt)} · {v.document.title || "Без названия"}
                {v.deleted && " · в корзине"}
              </span>
            </div>
            {v.revision !== note.serverRevision && (
              <button
                type="button"
                className="button"
                disabled={pending || restoring !== null}
                aria-busy={restoring === v.versionId}
                onClick={() => void restore(v)}
              >
                {restoring === v.versionId ? "Восстанавливаем…" : "Восстановить"}
              </button>
            )}
          </li>
        ))}
      </ol>
    );

  return (
    <Dialog title="История заметки" onClose={onClose}>
      {body}
      {transport && pending && versions && (
        <p className="muted small">Восстановление станет доступно, когда изменения этой заметки будут отправлены.</p>
      )}
      <p className="muted small">Восстановление создаёт новую версию; прежние версии не удаляются.</p>
    </Dialog>
  );
}

function DictationDialog({ onClose }: { onClose: () => void }) {
  return (
    <Dialog title="Диктовка пока недоступна" onClose={onClose}>
      <p>
        Голосовой ввод на русском языке будет работать локально, без отправки аудио в облако. Движок распознавания
        (Whisper) в этой версии ещё не подключён, поэтому микрофон не включается.
      </p>
      <p className="muted">Текст можно вводить с клавиатуры или системной диктовкой вашего устройства.</p>
    </Dialog>
  );
}
