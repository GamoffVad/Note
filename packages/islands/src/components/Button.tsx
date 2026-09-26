import { forwardRef, type AnchorHTMLAttributes, type ButtonHTMLAttributes, type ReactNode } from "react";
import { cx } from "./util.ts";

export type ButtonVariant = "default" | "primary" | "destructive" | "plain";
export type ControlSize = "small" | "regular" | "large" | "xlarge";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ControlSize;
  icon?: ReactNode;
  /** Идёт операция: ширина сохраняется, повторное нажатие заблокировано. */
  loading?: boolean;
  loadingLabel?: string;
}

/**
 * Кнопка «Островов» (DESIGN-SYSTEM, раздел 6): 48 px на сенсорных экранах,
 * радиус 12 px. primary — заливка основным действием (одна на экран);
 * default — поднятая поверхность с контуром; plain — только текст.
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "default", size = "regular", icon, loading, loadingLabel, className, children, disabled, type = "button", ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cx("isl-button", `isl-button--${variant}`, `isl-button--${size}`, loading && "is-loading", className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? <span className="isl-spinner isl-spinner--inline" aria-hidden="true" /> : icon}
      {children !== undefined && <span className="isl-button__label">{loading && loadingLabel ? loadingLabel : children}</span>}
    </button>
  );
});

export interface ButtonLinkProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  variant?: ButtonVariant;
  size?: ControlSize;
  icon?: ReactNode;
}

/** Ссылка в виде кнопки: переход по адресу, а не действие (например, «К списку заметок»). */
export const ButtonLink = forwardRef<HTMLAnchorElement, ButtonLinkProps>(function ButtonLink(
  { variant = "default", size = "regular", icon, className, children, ...rest },
  ref,
) {
  return (
    <a ref={ref} className={cx("isl-button", `isl-button--${variant}`, `isl-button--${size}`, className)} {...rest}>
      {icon}
      {children !== undefined && <span className="isl-button__label">{children}</span>}
    </a>
  );
});
