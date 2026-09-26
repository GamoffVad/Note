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

/** Группа радиокнопок macOS: круг, выбранный — заливка акцентом и белая точка. */
export function RadioGroup<T extends string>({ label, value, onChange, options, orientation = "vertical", className }: RadioGroupProps<T>) {
  const name = useId();
  return (
    <fieldset className={cx("mk-radio-group", `mk-radio-group--${orientation}`, className)}>
      <legend className="mk-field__label">{label}</legend>
      {options.map((o) => {
        const id = `${name}-${o.value}`;
        return (
          <span key={o.value} className="mk-radio">
            <span className="mk-check__hit">
              <input
                id={id}
                type="radio"
                name={name}
                className="mk-radio__input"
                checked={o.value === value}
                disabled={o.disabled}
                onChange={() => onChange(o.value)}
              />
              <span className="mk-radio__circle" aria-hidden="true" />
            </span>
            <label htmlFor={id} className="mk-check__label">
              {o.label}
            </label>
          </span>
        );
      })}
    </fieldset>
  );
}
