import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
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
