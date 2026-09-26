import { forwardRef, useId, type ButtonHTMLAttributes, type ReactNode } from "react";
import { cx } from "./util.ts";

export interface SwitchProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onChange" | "value"> {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: ReactNode;
  size?: "mini" | "regular";
}

/**
 * Переключатель «Островов»: капсула с круглой ручкой; включён — заливка
 * акцентом. Роль switch, Пробел и Enter переключают.
 */
export const Switch = forwardRef<HTMLButtonElement, SwitchProps>(function Switch(
  { checked, onChange, label, size = "regular", className, id, disabled, ...rest },
  ref,
) {
  const auto = useId();
  const switchId = id ?? auto;
  const labelId = `${switchId}-label`;
  return (
    <span className={cx("isl-switch-row", className)}>
      {label !== undefined && (
        <span id={labelId} className="isl-switch-row__label" onClick={() => !disabled && onChange(!checked)}>
          {label}
        </span>
      )}
      <button
        ref={ref}
        id={switchId}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-labelledby={label !== undefined ? labelId : undefined}
        disabled={disabled}
        className={cx("isl-switch", `isl-switch--${size}`)}
        onClick={() => onChange(!checked)}
        {...rest}
      >
        <span className="isl-switch__thumb" aria-hidden="true" />
      </button>
    </span>
  );
});
