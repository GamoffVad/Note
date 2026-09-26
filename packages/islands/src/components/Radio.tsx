import { useId, type ReactNode } from "react";
import { cx } from "./util.ts";

export interface RadioOption<T extends string> {
  value: T;
  label: ReactNode;
  disabled?: boolean;
}

interface RadioGroupProps<T extends string> {
  label: string;
  value: T;
  onChange: (value: T) => void;
  options: Array<RadioOption<T>>;
  orientation?: "vertical" | "horizontal";
  className?: string;
}

/** Группа радиокнопок «Островов»: круг, выбранный — кольцо основного действия с точкой. */
export function RadioGroup<T extends string>({ label, value, onChange, options, orientation = "vertical", className }: RadioGroupProps<T>) {
  const name = useId();
  return (
    <fieldset className={cx("isl-radio-group", `isl-radio-group--${orientation}`, className)}>
      <legend className="isl-field__label">{label}</legend>
      {options.map((o) => {
        const id = `${name}-${o.value}`;
        return (
          <span key={o.value} className="isl-radio">
            <span className="isl-check__hit">
              <input
                id={id}
                type="radio"
                name={name}
                className="isl-radio__input"
                checked={o.value === value}
                disabled={o.disabled}
                onChange={() => onChange(o.value)}
              />
              <span className="isl-radio__circle" aria-hidden="true" />
            </span>
            <label htmlFor={id} className="isl-check__label">
              {o.label}
            </label>
          </span>
        );
      })}
    </fieldset>
  );
}
