import { useRef, type KeyboardEvent, type ReactNode } from "react";
import { cx } from "./util.ts";

export interface Segment<T extends string> {
  value: T;
  label: ReactNode;
  /** Доступное имя, если в сегменте только значок. */
  ariaLabel?: string;
  disabled?: boolean;
}

interface SegmentedControlProps<T extends string> {
  label: string;
  value: T;
  onChange: (value: T) => void;
  segments: Array<Segment<T>>;
  size?: "small" | "regular";
  className?: string;
}

/**
 * Сегментированный элемент macOS для взаимоисключающего выбора.
 * Семантика радиогруппы: Tab попадает на выбранный сегмент, стрелки выбирают соседний.
 */
export function SegmentedControl<T extends string>({ label, value, onChange, segments, size = "regular", className }: SegmentedControlProps<T>) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const enabled = segments.map((s, i) => (s.disabled ? -1 : i)).filter((i) => i >= 0);
  const selectedIndex = segments.findIndex((s) => s.value === value && !s.disabled);
  // Если ничего не выбрано, в порядок Tab попадает первый доступный сегмент.
  const tabbable = selectedIndex >= 0 ? selectedIndex : enabled[0];

  const onKey = (event: KeyboardEvent, index: number) => {
    const pos = enabled.indexOf(index);
    let next: number | undefined;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") next = enabled[(pos + 1) % enabled.length];
    else if (event.key === "ArrowLeft" || event.key === "ArrowUp") next = enabled[(pos - 1 + enabled.length) % enabled.length];
    else if (event.key === "Home") next = enabled[0];
    else if (event.key === "End") next = enabled[enabled.length - 1];
    if (next === undefined) return;
    event.preventDefault();
    onChange(segments[next]!.value);
    refs.current[next]?.focus();
  };

  return (
    <div role="radiogroup" aria-label={label} className={cx("mk-segmented", `mk-segmented--${size}`, className)}>
      {segments.map((s, i) => {
        const selected = s.value === value;
        return (
          <button
            key={s.value}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={s.ariaLabel}
            tabIndex={i === tabbable ? 0 : -1}
            disabled={s.disabled}
            className={cx("mk-segmented__item", selected && "is-selected")}
            onClick={() => onChange(s.value)}
            onKeyDown={(e) => onKey(e, i)}
          >
            {s.label}
          </button>
        );
      })}
    </div>
  );
}
