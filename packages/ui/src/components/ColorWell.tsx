import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cx, useDismiss, usePopoverPosition } from "./util.ts";

/** Образцы: системные цвета HIG (повышенный контраст) и оттенки текста. */
export const COLOR_SWATCHES: Array<{ value: string; name: string }> = [
  { value: "#1d1d1f", name: "Графитовый" },
  { value: "#48484a", name: "Тёмно-серый" },
  { value: "#6c6c70", name: "Серый" },
  { value: "#1e6ef4", name: "Синий" },
  { value: "#564ade", name: "Индиго" },
  { value: "#b02fc2", name: "Фиолетовый" },
  { value: "#e7124d", name: "Розовый" },
  { value: "#e9152d", name: "Красный" },
  { value: "#c55300", name: "Оранжевый" },
  { value: "#a16a00", name: "Жёлтый" },
  { value: "#008932", name: "Зелёный" },
  { value: "#008198", name: "Бирюзовый" },
  { value: "#f5f5f7", name: "Светлый" },
  { value: "#aeaeb2", name: "Светло-серый" },
  { value: "#5cb8ff", name: "Голубой" },
  { value: "#fedf43", name: "Лимонный" },
];

const HEX = /^#[0-9a-f]{6}$/i;

interface ColorWellProps {
  label: string;
  /** Подпись скрыта визуально (например, в строке FormRow со своей подписью), но доступна диктору. */
  hideLabel?: boolean;
  value: string;
  onChange: (hex: string) => void;
  disabled?: boolean;
  className?: string;
}

/**
 * Цветовая ячейка macOS (color well) вместо системного выбора цвета:
 * по нажатию — панель с образцами и полем HEX.
 */
export function ColorWell({ label, hideLabel, value, onChange, disabled, className }: ColorWellProps) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value);
  const button = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const pos = usePopoverPosition(button, panel, open);
  useDismiss(open, [button, panel], () => setOpen(false));
  useEffect(() => setDraft(value), [value]);
  useEffect(() => {
    if (!open) return;
    panel.current?.querySelector<HTMLElement>('[aria-checked="true"], [role="radio"]')?.focus();
  }, [open]);

  const close = () => {
    setOpen(false);
    button.current?.focus();
  };
  const valid = HEX.test(draft);
  const name = COLOR_SWATCHES.find((s) => s.value === value.toLowerCase())?.name;

  return (
    <div className={cx("mk-colorwell", className)}>
      <span id={`${id}-label`} className={cx("mk-field__label", hideLabel && "mk-visually-hidden")}>
        {label}
      </span>
      <button
        ref={button}
        type="button"
        aria-labelledby={`${id}-label ${id}-value`}
        aria-haspopup="dialog"
        aria-expanded={open}
        disabled={disabled}
        className="mk-colorwell__button"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="mk-colorwell__swatch" style={{ background: value }} aria-hidden="true" />
        <span id={`${id}-value`} className="mk-colorwell__text">
          {name ? `${name} · ${value.toUpperCase()}` : value.toUpperCase()}
        </span>
      </button>
      {open &&
        createPortal(
          <div
            ref={panel}
            role="dialog"
            aria-label={label}
            className="mk-popover mk-colorwell__panel"
            style={pos ? { top: pos.top, left: pos.left } : { visibility: "hidden" }}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.preventDefault();
                close();
              }
            }}
          >
            <div role="radiogroup" aria-label="Образцы" className="mk-colorwell__grid">
              {COLOR_SWATCHES.map((s, i) => {
                const selected = s.value === value.toLowerCase();
                return (
                  <button
                    key={s.value}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    aria-label={s.name}
                    tabIndex={selected || (i === 0 && !COLOR_SWATCHES.some((c) => c.value === value.toLowerCase())) ? 0 : -1}
                    className={cx("mk-colorwell__chip", selected && "is-selected")}
                    style={{ background: s.value }}
                    onClick={() => {
                      onChange(s.value);
                      close();
                    }}
                    onKeyDown={(e) => {
                      const cols = 8;
                      const delta = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: cols, ArrowUp: -cols }[e.key];
                      if (delta === undefined) return;
                      e.preventDefault();
                      const next = (i + delta + COLOR_SWATCHES.length) % COLOR_SWATCHES.length;
                      (e.currentTarget.parentElement!.children[next] as HTMLElement).focus();
                    }}
                  />
                );
              })}
            </div>
            <form
              className="mk-colorwell__hex"
              onSubmit={(e) => {
                e.preventDefault();
                if (!valid) return;
                onChange(draft.toLowerCase());
                close();
              }}
            >
              <label htmlFor={`${id}-hex`} className="mk-field__label">
                HEX
              </label>
              <div className="mk-field__control mk-focus-within">
                <input
                  id={`${id}-hex`}
                  className="mk-field__input"
                  value={draft}
                  maxLength={7}
                  spellCheck={false}
                  aria-invalid={!valid || undefined}
                  onChange={(e) => setDraft(e.target.value.startsWith("#") ? e.target.value : `#${e.target.value}`)}
                />
              </div>
              <button type="submit" className="mk-button mk-button--default mk-button--small" disabled={!valid}>
                <span className="mk-button__label">Применить</span>
              </button>
            </form>
          </div>,
          document.body,
        )}
    </div>
  );
}
