import { cloneElement, useEffect, useId, useRef, useState, type ReactElement } from "react";
import { createPortal } from "react-dom";

interface TooltipProps {
  label: string;
  children: ReactElement<Record<string, unknown>>;
  /** Задержка появления при наведении, мс. */
  delay?: number;
}

/**
 * Подсказка вместо системной (атрибут title). Появляется при наведении и
 * фокусе с клавиатуры, скрывается по Esc; связана через aria-describedby.
 * Подсказка не единственный способ узнать действие: у кнопок есть доступное имя.
 */
export function Tooltip({ label, children, delay = 600 }: TooltipProps) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const anchor = useRef<HTMLElement | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = (immediate: boolean) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setOpen(true), immediate ? 0 : delay);
  };
  const hide = () => {
    if (timer.current) clearTimeout(timer.current);
    setOpen(false);
  };

  useEffect(() => {
    if (!open) return;
    const a = anchor.current?.getBoundingClientRect();
    if (a) setPos({ top: a.bottom + 6, left: a.left + a.width / 2 });
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && hide();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);

  const props = children.props as Record<string, unknown>;
  const chain =
    (name: string, fn: (e: unknown) => void) =>
    (e: unknown) => {
      (props[name] as ((e: unknown) => void) | undefined)?.(e);
      fn(e);
    };

  return (
    <>
      {cloneElement(children, {
        // React 19: ref дочернего элемента — обычный prop; сохраняем его и добавляем свой.
        ref: (node: HTMLElement | null) => {
          anchor.current = node;
          const own = props.ref as ((n: HTMLElement | null) => void) | { current: HTMLElement | null } | null | undefined;
          if (typeof own === "function") own(node);
          else if (own) own.current = node;
        },
        "aria-describedby": open ? id : undefined,
        onPointerEnter: chain("onPointerEnter", () => show(false)),
        onPointerLeave: chain("onPointerLeave", hide),
        onFocus: chain("onFocus", (e) => {
          const el = (e as FocusEvent).target as HTMLElement;
          if (el.matches(":focus-visible")) show(true);
        }),
        onBlur: chain("onBlur", hide),
        onPointerDown: chain("onPointerDown", hide),
      })}
      {open &&
        pos &&
        createPortal(
          <div role="tooltip" id={id} className="mk-tooltip" style={{ top: pos.top, left: pos.left }}>
            {label}
          </div>,
          document.body,
        )}
    </>
  );
}
