import { forwardRef, type AnchorHTMLAttributes, type ButtonHTMLAttributes, type ReactNode } from "react";
import { Tooltip } from "./Tooltip.tsx";
import { cx } from "./util.ts";

export interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  /** Доступное имя и текст подсказки. */
  label: string;
  icon: ReactNode;
  /** Кнопка-переключатель (aria-pressed). */
  pressed?: boolean;
  variant?: "toolbar" | "plain";
  size?: "small" | "regular";
  /** Показывать подсказку при наведении. */
  tooltip?: boolean;
}

/** Кнопка панели инструментов macOS: только значок, подсказка и доступное имя. */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, icon, pressed, variant = "toolbar", size = "regular", tooltip = true, className, type = "button", ...rest },
  ref,
) {
  const button = (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      aria-pressed={pressed}
      className={cx("mk-icon-button", `mk-icon-button--${variant}`, `mk-icon-button--${size}`, className)}
      {...rest}
    >
      {icon}
    </button>
  );
  return tooltip ? <Tooltip label={label}>{button}</Tooltip> : button;
});

export interface IconLinkProps extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "children"> {
  /** Доступное имя и текст подсказки. */
  label: string;
  icon: ReactNode;
  variant?: "toolbar" | "plain";
  size?: "small" | "regular";
  tooltip?: boolean;
}

/** Ссылка панели инструментов: выглядит как IconButton, но ведёт на другой экран (aria-current сохраняется). */
export const IconLink = forwardRef<HTMLAnchorElement, IconLinkProps>(function IconLink(
  { label, icon, variant = "toolbar", size = "regular", tooltip = true, className, ...rest },
  ref,
) {
  const link = (
    <a ref={ref} aria-label={label} className={cx("mk-icon-button", `mk-icon-button--${variant}`, `mk-icon-button--${size}`, className)} {...rest}>
      {icon}
    </a>
  );
  return tooltip ? <Tooltip label={label}>{link}</Tooltip> : link;
});
