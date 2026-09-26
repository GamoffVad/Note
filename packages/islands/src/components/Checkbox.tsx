import { forwardRef, useEffect, useId, useImperativeHandle, useRef, type InputHTMLAttributes, type ReactNode } from "react";
import { cx } from "./util.ts";

export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "size"> {
  label?: ReactNode;
  /** Смешанное состояние (часть вложенных флажков отмечена). */
  mixed?: boolean;
  /** Зачеркнуть подпись, когда флажок отмечен (задачи). */
  strike?: boolean;
}

/**
 * Флажок «Островов»: скруглённый квадрат с контуром основного действия, при отметке — заливка и
 * галочка, в смешанном состоянии — дефис. Нативный input скрыт, но остаётся
 * источником семантики, клавиатуры (Пробел) и связи с подписью.
 */
export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox(
  { label, mixed = false, strike, className, id, ...rest },
  ref,
) {
  const auto = useId();
  const inputId = id ?? auto;
  const inner = useRef<HTMLInputElement>(null);
  useImperativeHandle(ref, () => inner.current!);
  useEffect(() => {
    if (inner.current) inner.current.indeterminate = mixed;
  }, [mixed]);
  return (
    <span className={cx("isl-check", strike && "isl-check--strike", className)}>
      <span className="isl-check__hit">
        <input ref={inner} id={inputId} type="checkbox" className="isl-check__input" {...rest} />
        <span className="isl-check__box" aria-hidden="true">
          <svg viewBox="0 0 12 12" className="isl-check__mark">
            <path d="M2.5 6.2 5 8.6 9.6 3.4" />
          </svg>
          <svg viewBox="0 0 12 12" className="isl-check__dash">
            <path d="M3 6h6" />
          </svg>
        </span>
      </span>
      {label !== undefined && (
        <label htmlFor={inputId} className="isl-check__label">
          {label}
        </label>
      )}
    </span>
  );
});
