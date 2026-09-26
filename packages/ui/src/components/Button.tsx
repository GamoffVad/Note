import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { cx } from "./util.ts";

export type ButtonVariant = "default" | "primary" | "destructive" | "plain";
export type ControlSize = "small" | "regular" | "large";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ControlSize;
  icon?: ReactNode;
  /** Идёт операция: ширина сохраняется, повторное нажатие заблокировано. */
  loading?: boolean;
  loadingLabel?: string;
}

/**
 * Кнопка macOS (push button). primary — кнопка по умолчанию с заливкой
 * акцентом; default — светлая кнопка с тенью; plain — без рамки.
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "default", size = "regular", icon, loading, loadingLabel, className, children, disabled, type = "button", ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cx("mk-button", `mk-button--${variant}`, `mk-button--${size}`, loading && "is-loading", className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? <span className="mk-spinner mk-spinner--inline" aria-hidden="true" /> : icon}
      {children !== undefined && <span className="mk-button__label">{loading && loadingLabel ? loadingLabel : children}</span>}
    </button>
  );
});
