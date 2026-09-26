import { useId, useRef, type KeyboardEvent, type PointerEvent } from "react";
import { cx } from "./util.ts";

interface SliderProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step?: number;
  /** Текст значения для диктора и подписи, например «17 px». */
  format?: (value: number) => string;
  showValue?: boolean;
  disabled?: boolean;
  className?: string;
}

/**
 * Ползунок «Островов»: дорожка, заполненная основным действием, круглая ручка с контуром.
 * Шаблон WAI-ARIA «slider»: стрелки ±шаг, PageUp/PageDown ±10 шагов, Home/End.
 */
export function Slider({ label, value, onChange, min, max, step = 1, format = String, showValue = true, disabled, className }: SliderProps) {
  const id = useId();
  const track = useRef<HTMLDivElement>(null);
  const clamp = (v: number) => Math.min(max, Math.max(min, Math.round((v - min) / step) * step + min));
  const percent = ((value - min) / (max - min)) * 100;

  const fromPointer = (event: PointerEvent) => {
    const rect = track.current!.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    onChange(clamp(min + ratio * (max - min)));
  };

  const onKeyDown = (event: KeyboardEvent) => {
    const big = step * Math.max(1, Math.round((max - min) / step / 10));
    const map: Record<string, number> = {
      ArrowRight: value + step,
      ArrowUp: value + step,
      ArrowLeft: value - step,
      ArrowDown: value - step,
      PageUp: value + big,
      PageDown: value - big,
      Home: min,
      End: max,
    };
    if (!(event.key in map)) return;
    event.preventDefault();
    onChange(clamp(map[event.key]!));
  };

  return (
    <div className={cx("isl-slider", disabled && "is-disabled", className)}>
      <div className="isl-slider__header">
        <span id={`${id}-label`} className="isl-field__label">
          {label}
        </span>
        {showValue && (
          <span className="isl-slider__value" aria-hidden="true">
            {format(value)}
          </span>
        )}
      </div>
      <div
        ref={track}
        className="isl-slider__track"
        onPointerDown={(e) => {
          if (disabled) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          fromPointer(e);
          (e.currentTarget.querySelector("[role=slider]") as HTMLElement | null)?.focus();
        }}
        onPointerMove={(e) => {
          if (!disabled && e.currentTarget.hasPointerCapture(e.pointerId)) fromPointer(e);
        }}
      >
        <div className="isl-slider__fill" style={{ width: `${percent}%` }} />
        <div
          role="slider"
          tabIndex={disabled ? -1 : 0}
          aria-labelledby={`${id}-label`}
          aria-valuemin={min}
          aria-valuemax={max}
          aria-valuenow={value}
          aria-valuetext={format(value)}
          aria-disabled={disabled || undefined}
          className="isl-slider__thumb"
          style={{ left: `${percent}%` }}
          onKeyDown={disabled ? undefined : onKeyDown}
        />
      </div>
    </div>
  );
}
