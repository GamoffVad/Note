import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";

export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

/** Значение, которым можно управлять снаружи или оставить внутренним. */
export function useControllable<T>(value: T | undefined, defaultValue: T, onChange?: (v: T) => void): [T, (v: T) => void] {
  const [inner, setInner] = useState(defaultValue);
  const controlled = value !== undefined;
  const current = controlled ? value : inner;
  const set = useCallback(
    (next: T) => {
      if (!controlled) setInner(next);
      onChange?.(next);
    },
    [controlled, onChange],
  );
  return [current, set];
}

/** Закрытие всплывающего слоя по нажатию вне его и якоря. */
export function useDismiss(open: boolean, refs: Array<RefObject<HTMLElement | null>>, onDismiss: () => void): void {
  const handler = useRef(onDismiss);
  handler.current = onDismiss;
  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      const target = event.target as Node;
      if (refs.some((r) => r.current?.contains(target))) return;
      handler.current();
    };
    document.addEventListener("pointerdown", onPointer, true);
    return () => document.removeEventListener("pointerdown", onPointer, true);
  }, [open, refs]);
}

export interface Position {
  top: number;
  left: number;
  minWidth: number;
  maxHeight: number;
  placement: "below" | "above";
}

/**
 * Положение всплывающего слоя у якоря: снизу, а если не помещается — сверху;
 * по горизонтали — в пределах окна. Пересчитывается при прокрутке и изменении окна.
 */
export function usePopoverPosition(
  anchor: RefObject<HTMLElement | null>,
  popover: RefObject<HTMLElement | null>,
  open: boolean,
  align: "start" | "end" = "start",
): Position | null {
  const [pos, setPos] = useState<Position | null>(null);
  useLayoutEffect(() => {
    if (!open) {
      setPos(null);
      return;
    }
    const update = () => {
      const a = anchor.current?.getBoundingClientRect();
      const p = popover.current;
      if (!a) return;
      const margin = 8;
      const gap = 4;
      const width = p?.offsetWidth ?? a.width;
      const height = p?.scrollHeight ?? 0;
      const below = window.innerHeight - a.bottom - gap - margin;
      const above = a.top - gap - margin;
      const placement = height <= below || below >= above ? "below" : "above";
      const maxHeight = Math.max(120, placement === "below" ? below : above);
      const shown = Math.min(height, maxHeight);
      let left = align === "end" ? a.right - Math.max(width, a.width) : a.left;
      left = Math.min(Math.max(margin, left), window.innerWidth - margin - Math.max(width, a.width));
      const top = placement === "below" ? a.bottom + gap : a.top - gap - shown;
      setPos({ top, left: Math.max(margin, left), minWidth: a.width, maxHeight, placement });
    };
    update();
    const raf = requestAnimationFrame(update);
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [open, anchor, popover, align]);
  return pos;
}

/** Поиск по первым буквам в списках и меню (type-ahead). */
export function useTypeahead(labels: string[], onMatch: (index: number) => void) {
  const buffer = useRef("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  return (key: string, from: number): boolean => {
    if (key.length !== 1 || key === " ") return false;
    buffer.current += key.toLocaleLowerCase("ru");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => (buffer.current = ""), 600);
    const n = labels.length;
    for (let i = 1; i <= n; i++) {
      const index = (from + (buffer.current.length === 1 ? i : i - 1) + n) % n;
      if (labels[index]!.toLocaleLowerCase("ru").startsWith(buffer.current)) {
        onMatch(index);
        return true;
      }
    }
    return false;
  };
}
