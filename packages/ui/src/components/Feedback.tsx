import { useId, useState, type ReactNode } from "react";
import { cx } from "./util.ts";

export type Tone = "neutral" | "info" | "success" | "warning" | "danger";

/** Индикатор выполнения без процента (как NSProgressIndicator в стиле spinning). */
export function Spinner({ label, size = "regular" }: { label: string; size?: "small" | "regular" | "large" }) {
  return <span role="status" aria-label={label} className={cx("mk-spinner", `mk-spinner--${size}`)} />;
}

/** Полоса выполнения с процентом. */
export function ProgressBar({ label, value, max = 100 }: { label: string; value: number | null; max?: number }) {
  const percent = value === null ? null : Math.round((value / max) * 100);
  return (
    <div className="mk-progress">
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={value ?? undefined}
        aria-valuetext={percent === null ? "Выполняется" : `${percent}%`}
        className={cx("mk-progress__track", percent === null && "is-indeterminate")}
      >
        <div className="mk-progress__fill" style={percent === null ? undefined : { width: `${percent}%` }} />
      </div>
    </div>
  );
}

export function Badge({ children, tone = "neutral", className }: { children: ReactNode; tone?: Tone; className?: string }) {
  return <span className={cx("mk-badge", `mk-badge--${tone}`, className)}>{children}</span>;
}

interface BannerProps {
  tone?: Tone;
  icon?: ReactNode;
  children: ReactNode;
  actions?: ReactNode;
  /** alert — для ошибок и конфликтов, status — для спокойных сообщений. */
  role?: "alert" | "status";
}

/** Сообщение рядом с объектом: состояние, причина и следующее действие. */
export function Banner({ tone = "neutral", icon, children, actions, role }: BannerProps) {
  return (
    <div className={cx("mk-banner", `mk-banner--${tone}`)} role={role}>
      {icon && (
        <span className="mk-banner__icon" aria-hidden="true">
          {icon}
        </span>
      )}
      <div className="mk-banner__text">{children}</div>
      {actions && <div className="mk-banner__actions">{actions}</div>}
    </div>
  );
}

interface DisclosureProps {
  label: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
}

/** Раскрывающийся блок macOS: треугольник поворачивается, содержимое показывается ниже. */
export function Disclosure({ label, children, defaultOpen = false }: DisclosureProps) {
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();
  return (
    <div className={cx("mk-disclosure", open && "is-open")}>
      <button type="button" className="mk-disclosure__button" aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}>
        <svg viewBox="0 0 10 10" className="mk-disclosure__chevron" aria-hidden="true">
          <path d="M3.5 2 6.5 5 3.5 8" />
        </svg>
        {label}
      </button>
      <div id={id} className="mk-disclosure__content" hidden={!open}>
        {children}
      </div>
    </div>
  );
}
