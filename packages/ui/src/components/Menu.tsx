import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cx, useDismiss, usePopoverPosition, useTypeahead } from "./util.ts";

export type MenuEntry =
  | { type?: "item"; id: string; label: string; icon?: ReactNode; shortcut?: string; destructive?: boolean; disabled?: boolean; onSelect: () => void }
  | { type: "separator"; id: string };

interface MenuButtonProps {
  /** Доступное имя кнопки. */
  label: string;
  /** Содержимое кнопки (значок или текст). */
  trigger: ReactNode;
  items: MenuEntry[];
  align?: "start" | "end";
  buttonClassName?: string;
}

/**
 * Кнопка с выпадающим меню действий (pull-down) по шаблону WAI-ARIA «menu button».
 * Стрелки, Home/End и первые буквы перемещают, Enter выбирает, Esc закрывает
 * и возвращает фокус на кнопку.
 */
export function MenuButton({ label, trigger, items, align = "start", buttonClassName }: MenuButtonProps) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const button = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLUListElement>(null);
  const pos = usePopoverPosition(button, menu, open, align);
  const actionable = items.map((it, i) => (it.type !== "separator" && !it.disabled ? i : -1)).filter((i) => i >= 0);
  const labels = items.map((it) => (it.type === "separator" ? "" : it.label));
  const typeahead = useTypeahead(labels, (i) => actionable.includes(i) && setActive(i));

  useDismiss(open, [button, menu], () => setOpen(false));
  useEffect(() => {
    if (open) menu.current?.focus();
  }, [open]);

  const openAt = (index: number) => {
    setActive(index);
    setOpen(true);
  };
  const close = () => {
    setOpen(false);
    button.current?.focus();
  };
  const run = (index: number) => {
    const item = items[index];
    if (!item || item.type === "separator" || item.disabled) return;
    close();
    item.onSelect();
  };
  const step = (delta: number) => {
    const pos = actionable.indexOf(active);
    setActive(actionable[(pos + delta + actionable.length) % actionable.length]!);
  };

  const onMenuKey = (event: KeyboardEvent) => {
    const handled = ((): boolean => {
      switch (event.key) {
        case "ArrowDown":
          step(1);
          return true;
        case "ArrowUp":
          step(-1);
          return true;
        case "Home":
          setActive(actionable[0]!);
          return true;
        case "End":
          setActive(actionable[actionable.length - 1]!);
          return true;
        case "Enter":
        case " ":
          run(active);
          return true;
        case "Escape":
          close();
          return true;
        case "Tab":
          setOpen(false);
          return false;
        default:
          return typeahead(event.key, active);
      }
    })();
    if (handled) event.preventDefault();
  };

  return (
    <>
      <button
        ref={button}
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? `${id}-menu` : undefined}
        className={cx("mk-icon-button mk-icon-button--toolbar mk-icon-button--regular", buttonClassName)}
        onClick={() => (open ? setOpen(false) : openAt(actionable[0] ?? 0))}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            openAt(actionable[0] ?? 0);
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            openAt(actionable[actionable.length - 1] ?? 0);
          }
        }}
      >
        {trigger}
      </button>
      {open &&
        createPortal(
          <ul
            ref={menu}
            id={`${id}-menu`}
            role="menu"
            aria-label={label}
            tabIndex={-1}
            aria-activedescendant={`${id}-item-${active}`}
            className="mk-menu"
            style={pos ? { top: pos.top, left: pos.left, maxHeight: pos.maxHeight } : { visibility: "hidden" }}
            onKeyDown={onMenuKey}
          >
            {items.map((it, i) =>
              it.type === "separator" ? (
                <li key={it.id} role="separator" className="mk-menu__separator" />
              ) : (
                <li
                  key={it.id}
                  id={`${id}-item-${i}`}
                  role="menuitem"
                  aria-disabled={it.disabled || undefined}
                  className={cx("mk-menu__item", i === active && "is-active", it.destructive && "is-destructive", it.disabled && "is-disabled")}
                  onPointerEnter={() => !it.disabled && setActive(i)}
                  onClick={() => run(i)}
                >
                  <span className="mk-menu__icon" aria-hidden="true">
                    {it.icon}
                  </span>
                  <span className="mk-menu__label">{it.label}</span>
                  {it.shortcut && <kbd className="mk-menu__shortcut">{it.shortcut}</kbd>}
                </li>
              ),
            )}
          </ul>,
          document.body,
        )}
    </>
  );
}
