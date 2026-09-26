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

export interface ButtonLinkProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  variant?: ButtonVariant;
  size?: ControlSize;
  icon?: ReactNode;
}

/** Ссылка в виде кнопки-капсулы: переход по адресу, а не действие (например, «К списку заметок»). */
export const ButtonLink = forwardRef<HTMLAnchorElement, ButtonLinkProps>(function ButtonLink(
  { variant = "default", size = "regular", icon, className, children, ...rest },
  ref,
) {
  return (
    <a ref={ref} className={cx("mk-button", `mk-button--${variant}`, `mk-button--${size}`, className)} {...rest}>
      {icon}
      {children !== undefined && <span className="mk-button__label">{children}</span>}
    </a>
  );
});
