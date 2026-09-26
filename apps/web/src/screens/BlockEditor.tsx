import { useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { useAutoHeight } from "../components/useAutoHeight.ts";
import { newId, type Block } from "@mayak/domain";
import { Icon } from "../components/Icon.tsx";

interface Props {
  blocks: Block[];
  onChange: (blocks: Block[]) => void;
  readOnly: boolean;
  onDictate: () => void;
}

type FocusRequest = { id: string; at: "start" | "end" } | null;

/**
 * Редактор блоков (docs/adr/0003-editor.md): текстовый блок — растущее поле,
 * задача — чекбокс и однострочное поле. Каждый элемент привязан к id блока,
 * поэтому при наборе блоки не пересоздаются.
 */
export function BlockEditor({ blocks, onChange, readOnly, onDictate }: Props) {
  const [focus, setFocus] = useState<FocusRequest>(null);
  const root = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!focus) return;
    const field = root.current?.querySelector<HTMLTextAreaElement>(
      `[data-block-id="${focus.id}"] [data-field]`,
    );
    if (field) {
      field.focus();
      const pos = focus.at === "start" ? 0 : field.value.length;
      field.setSelectionRange(pos, pos);
    }
    setFocus(null);
  }, [focus]);

  const replace = (id: string, patch: Partial<Block>) =>
    onChange(blocks.map((b) => (b.id === id ? ({ ...b, ...patch } as Block) : b)));

  const insertAfter = (id: string | null, block: Block) => {
    const index = id === null ? blocks.length - 1 : blocks.findIndex((b) => b.id === id);
    const next = [...blocks];
    next.splice(index + 1, 0, block);
    onChange(next);
    setFocus({ id: block.id, at: "start" });
  };

  const remove = (id: string) => {
    const index = blocks.findIndex((b) => b.id === id);
    const previous = blocks.slice(0, index).reverse().find((b) => b.type !== "attachment");
    onChange(blocks.filter((b) => b.id !== id));
    if (previous) setFocus({ id: previous.id, at: "end" });
  };

  const onTaskKey = (event: KeyboardEvent<HTMLTextAreaElement>, block: Block) => {
    if (event.nativeEvent.isComposing) return; // IME: не мешаем составлению символов
    if (event.key === "Enter") {
      event.preventDefault();
      if (!block.text.trim()) {
        // Enter на пустой задаче завершает список.
        onChange(blocks.map((b) => (b.id === block.id ? { id: b.id, type: "markdown", text: "" } : b)));
        setFocus({ id: block.id, at: "start" });
      } else {
        insertAfter(block.id, { id: newId(), type: "task", text: "", checked: false });
      }
    } else if (event.key === "Backspace" && event.currentTarget.value === "") {
      event.preventDefault();
      remove(block.id);
    }
  };

  const onTextKey = (event: KeyboardEvent<HTMLTextAreaElement>, block: Block) => {
    if (event.nativeEvent.isComposing) return;
    if (event.key === "Backspace" && event.currentTarget.value === "" && blocks.length > 1) {
      event.preventDefault();
      remove(block.id);
    }
  };

  return (
    <div className="blocks" ref={root}>
      {blocks.map((block) => {
        if (block.type === "markdown") {
          return (
            <div className="block block-text" data-block-id={block.id} key={block.id}>
              <AutoTextarea
                value={block.text}
                readOnly={readOnly}
                ariaLabel="Текст заметки"
                placeholder={blocks.length === 1 ? "Запишите мысль…" : ""}
                onChange={(text) => replace(block.id, { text })}
                onKeyDown={(e) => onTextKey(e, block)}
              />
            </div>
          );
        }
        if (block.type === "task") {
          const id = `block-${block.id}`;
          return (
            <div className="block checkrow block-task" data-block-id={block.id} key={block.id}>
              <input
                id={id}
                type="checkbox"
                checked={block.checked}
                disabled={readOnly}
                onChange={(e) => replace(block.id, { checked: e.target.checked })}
                aria-label={block.text.trim() ? `Выполнено: ${block.text}` : "Выполнено"}
              />
              <AutoTextarea
                className="task-input"
                value={block.text}
                readOnly={readOnly}
                placeholder="Новая задача"
                ariaLabel="Текст задачи"
                // Задача — одна строка: переносы из вставленного текста заменяются пробелом.
                onChange={(text) => replace(block.id, { text: text.replace(/\s*\n\s*/g, " ") })}
                onKeyDown={(e) => onTaskKey(e, block)}
              />
              {!readOnly && (
                <button type="button" className="icon-button small remove" aria-label="Удалить задачу" onClick={() => remove(block.id)}>
                  <Icon name="close" size={16} />
                </button>
              )}
            </div>
          );
        }
        return (
          <div className="attachment" data-block-id={block.id} key={block.id}>
            <span className="file-icon">
              <Icon name="files" />
            </span>
            <div>
              <strong>{block.text || "Вложение"}</strong>
              <small>Файлы появятся в следующей версии: содержимое пока недоступно</small>
            </div>
          </div>
        );
      })}
      {!readOnly && (
        <div className="block-actions">
          <button
            type="button"
            className="chip-button"
            onClick={() => insertAfter(null, { id: newId(), type: "markdown", text: "" })}
          >
            <Icon name="text" size={16} /> Текст
          </button>
          <button
            type="button"
            className="chip-button"
            onClick={() => insertAfter(null, { id: newId(), type: "task", text: "", checked: false })}
          >
            <Icon name="tasks" size={16} /> Задача
          </button>
          <button type="button" className="chip-button" onClick={onDictate}>
            <Icon name="mic" size={16} /> Диктовать
          </button>
        </div>
      )}
    </div>
  );
}

function AutoTextarea(props: {
  className?: string;
  value: string;
  readOnly: boolean;
  ariaLabel: string;
  placeholder: string;
  onChange: (value: string) => void;
  onKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useAutoHeight(ref, props.value);
  return (
    <textarea
      ref={ref}
      className={props.className}
      data-field
      rows={1}
      value={props.value}
      readOnly={props.readOnly}
      aria-label={props.ariaLabel}
      placeholder={props.placeholder}
      onChange={(e) => props.onChange(e.target.value)}
      onKeyDown={props.onKeyDown}
    />
  );
}
