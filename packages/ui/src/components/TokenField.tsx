import { useId, useState } from "react";
import { cx } from "./util.ts";

interface TokenFieldProps {
  label: string;
  tokens: string[];
  onChange: (tokens: string[]) => void;
  placeholder?: string;
  maxTokens?: number;
  maxLength?: number;
  readOnly?: boolean;
  prefix?: string;
  /** Доступное имя поля ввода; по умолчанию «Добавить: <подпись>». */
  inputLabel?: string;
  /** Доступное имя кнопки удаления жетона. */
  removeLabel?: (token: string) => string;
  className?: string;
}

/** Поле жетонов macOS (NSTokenField) для тегов: Enter или запятая добавляет, Backspace в пустом поле удаляет последний. */
export function TokenField({
  label,
  tokens,
  onChange,
  placeholder,
  maxTokens = 50,
  maxLength = 100,
  readOnly,
  prefix = "",
  inputLabel,
  removeLabel,
  className,
}: TokenFieldProps) {
  const id = useId();
  const [draft, setDraft] = useState("");
  const add = () => {
    const token = draft.trim().replace(/^#/, "").slice(0, maxLength);
    setDraft("");
    if (!token || tokens.includes(token) || tokens.length >= maxTokens) return;
    onChange([...tokens, token]);
  };
  return (
    <div className={cx("mk-tokens", className)} role="group" aria-labelledby={`${id}-label`}>
      <span id={`${id}-label`} className="mk-visually-hidden">
        {label}
      </span>
      {tokens.map((t) => (
        <span key={t} className="mk-token">
          <span className="mk-token__text">
            {prefix}
            {t}
          </span>
          {!readOnly && (
            <button type="button" className="mk-token__remove" aria-label={removeLabel ? removeLabel(t) : `Убрать «${t}»`} onClick={() => onChange(tokens.filter((x) => x !== t))}>
              <svg viewBox="0 0 10 10" aria-hidden="true">
                <path d="m2.5 2.5 5 5m0-5-5 5" />
              </svg>
            </button>
          )}
        </span>
      ))}
      {!readOnly && (
        <input
          className="mk-tokens__input"
          value={draft}
          placeholder={placeholder}
          aria-label={inputLabel ?? `Добавить: ${label.toLocaleLowerCase("ru")}`}
          maxLength={maxLength}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={add}
          onKeyDown={(e) => {
            if (e.nativeEvent.isComposing) return;
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              add();
            } else if (e.key === "Backspace" && !draft && tokens.length) {
              onChange(tokens.slice(0, -1));
            }
          }}
        />
      )}
    </div>
  );
}
