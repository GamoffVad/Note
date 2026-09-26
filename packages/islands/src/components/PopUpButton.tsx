import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cx, useDismiss, usePopoverPosition, useTypeahead } from "./util.ts";

export interface PopUpOption<T extends string | number> {
  value: T;
  label: string;
  /** Необязательное содержимое строки (например, образец шрифта). */
  render?: ReactNode;
  disabled?: boolean;
}

interface PopUpButtonProps<T extends string | number> {
  label: string;
  hideLabel?: boolean;
  value: T;
  onChange: (value: T) => void;
  options: Array<PopUpOption<T>>;
  size?: "small" | "regular";
  disabled?: boolean;
  className?: string;
  id?: string;
}

const CHEVRONS = (
  <svg viewBox="0 0 10 14" className="isl-popup__chevrons" aria-hidden="true">
    <path d="M2.5 5 5 2.5 7.5 5M2.5 9 5 11.5 7.5 9" />
  </svg>
);

/**
 * Выпадающий список «Островов» вместо системного <select>.
 * Шаблон WAI-ARIA «select-only combobox»: Enter/Пробел/↓ открывают список,
 * стрелки, Home/End и первые буквы перемещают, Enter выбирает, Esc закрывает.
 */
export function PopUpButton<T extends string | number>({
  label,
  hideLabel,
  value,
  onChange,
  options,
  size = "regular",
  disabled,
  className,
  id,
}: PopUpButtonProps<T>) {
  const auto = useId();
  const baseId = id ?? auto;
  const listId = `${baseId}-list`;
  const labelId = `${baseId}-label`;
  const [open, setOpen] = useState(false);
  const selectedIndex = Math.max(0, options.findIndex((o) => o.value === value));
  const [active, setActive] = useState(selectedIndex);
  const button = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const pos = usePopoverPosition(button, list, open);
  // В открытом списке буквы перемещают выделение, в закрытом — сразу меняют значение.
  const typeahead = useTypeahead(
    options.map((o) => o.label),
    (i) => {
      if (open) setActive(i);
      else if (!options[i]!.disabled) onChange(options[i]!.value);
    },
  );

  useDismiss(open, [button, list], () => setOpen(false));
  useEffect(() => {
    if (open) setActive(selectedIndex);
  }, [open, selectedIndex]);
  useEffect(() => {
    if (!open) return;
    list.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [open, active]);

  const move = (delta: number) => {
    let i = active;
    for (let step = 0; step < options.length; step++) {
      i = Math.min(options.length - 1, Math.max(0, i + delta));
      if (!options[i]!.disabled) break;
    }
    setActive(i);
  };

  const choose = (index: number) => {
    const option = options[index];
    if (!option || option.disabled) return;
    onChange(option.value);
    setOpen(false);
    button.current?.focus();
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (!open) {
      if (["Enter", " ", "ArrowDown", "ArrowUp"].includes(event.key)) {
        event.preventDefault();
        setOpen(true);
      } else if (typeahead(event.key, selectedIndex)) {
        event.preventDefault();
      }
      return;
    }
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        move(1);
        break;
      case "ArrowUp":
        event.preventDefault();
        move(-1);
        break;
      case "Home":
        event.preventDefault();
        setActive(options.findIndex((o) => !o.disabled));
        break;
      case "End":
        event.preventDefault();
        setActive(options.length - 1 - [...options].reverse().findIndex((o) => !o.disabled));
        break;
      case "Enter":
      case " ":
        event.preventDefault();
        choose(active);
        break;
      case "Escape":
        event.preventDefault();
        setOpen(false);
        break;
      case "Tab":
        setOpen(false);
        break;
      default:
        if (typeahead(event.key, active)) event.preventDefault();
    }
  };

  const current = options[selectedIndex];
  return (
    <div className={cx("isl-popup", className)}>
      <span id={labelId} className={cx("isl-field__label", hideLabel && "isl-visually-hidden")}>
        {label}
      </span>
      <button
        ref={button}
        id={baseId}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-labelledby={`${labelId} ${baseId}`}
        aria-activedescendant={open ? `${baseId}-opt-${active}` : undefined}
        disabled={disabled}
        className={cx("isl-popup__button", `isl-popup__button--${size}`)}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={onKeyDown}
      >
        <span className="isl-popup__value">{current?.label ?? "—"}</span>
        {CHEVRONS}
      </button>
      {open &&
        createPortal(
          <ul
            ref={list}
            id={listId}
            role="listbox"
            aria-labelledby={labelId}
            className="isl-menu isl-menu--listbox"
            style={
              pos
                ? { top: pos.top, left: pos.left, minWidth: pos.minWidth, maxHeight: pos.maxHeight }
                : { visibility: "hidden" }
            }
          >
            {options.map((o, i) => (
              <li
                key={String(o.value)}
                id={`${baseId}-opt-${i}`}
                data-index={i}
                role="option"
                aria-selected={o.value === value}
                aria-disabled={o.disabled || undefined}
                className={cx("isl-menu__item", i === active && "is-active", o.disabled && "is-disabled")}
                onPointerEnter={() => !o.disabled && setActive(i)}
                onPointerDown={(e) => e.preventDefault()}
                onClick={() => choose(i)}
              >
                <span className="isl-menu__check" aria-hidden="true">
                  {o.value === value ? "✓" : ""}
                </span>
                <span className="isl-menu__label">{o.render ?? o.label}</span>
              </li>
            ))}
          </ul>,
          document.body,
        )}
    </div>
  );
}
