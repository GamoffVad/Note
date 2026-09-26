import { useId, type AnchorHTMLAttributes, type ReactNode } from "react";
import { cx } from "./util.ts";

/**
 * Группа настроек: карточка «Островов» (радиус 18 px) со строками.
 * Семантика — группа (role="group"), названная заголовком или меткой label.
 */
export function FormGroup({
  title,
  label,
  description,
  children,
  className,
}: {
  title?: string;
  /** Доступное имя группы без видимого заголовка. */
  label?: string;
  description?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const id = useId();
  return (
    <div
      role="group"
      className={cx("isl-form-group", className)}
      aria-labelledby={title ? `${id}-title` : undefined}
      aria-label={title ? undefined : label}
      aria-describedby={description ? `${id}-description` : undefined}
    >
      {title && (
        <h3 id={`${id}-title`} className="isl-form-group__title isl-headline">
          {title}
        </h3>
      )}
      <div className="isl-form-group__card">{children}</div>
      {description && (
        <p id={`${id}-description`} className="isl-form-group__description isl-caption">
          {description}
        </p>
      )}
    </div>
  );
}

/** Строка группы: подпись слева, элемент управления справа; на узком экране — друг под другом. */
export function FormRow({
  label,
  hint,
  children,
  stacked,
  className,
}: {
  label?: ReactNode;
  hint?: ReactNode;
  children: ReactNode;
  stacked?: boolean;
  className?: string;
}) {
  return (
    <div className={cx("isl-form-row", stacked && "isl-form-row--stacked", className)}>
      {label !== undefined && (
        <div className="isl-form-row__label">
          <span>{label}</span>
          {hint && <span className="isl-caption">{hint}</span>}
        </div>
      )}
      <div className="isl-form-row__control">{children}</div>
    </div>
  );
}

interface SidebarItemProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  icon?: ReactNode;
  label: ReactNode;
  count?: number;
  selected?: boolean;
}

/** Раздел боковой навигации: выбранный — мягкая заливка, жирная подпись и aria-current. */
export function SidebarItem({ icon, label, count, selected, className, ...rest }: SidebarItemProps) {
  return (
    <a className={cx("isl-sidebar-item", selected && "is-selected", className)} aria-current={selected ? "page" : undefined} {...rest}>
      {icon && (
        <span className="isl-sidebar-item__icon" aria-hidden="true">
          {icon}
        </span>
      )}
      <span className="isl-sidebar-item__label">{label}</span>
      {count !== undefined && <span className="isl-sidebar-item__count">{count}</span>}
    </a>
  );
}

export function SidebarSection({ title, children, label }: { title?: string; children: ReactNode; label: string }) {
  return (
    <nav className="isl-sidebar-section" aria-label={label}>
      {title && <div className="isl-sidebar-section__title">{title}</div>}
      {children}
    </nav>
  );
}

/** Пустое состояние: что здесь будет и первое действие. */
export function EmptyState({
  title,
  children,
  action,
  icon,
  as: Title = "p",
  className,
}: {
  title: string;
  children?: ReactNode;
  action?: ReactNode;
  /** Крупный значок над заголовком (декоративный). */
  icon?: ReactNode;
  /** Элемент заголовка: на отдельной странице пустое состояние — её заголовок. */
  as?: "p" | "h1" | "h2" | "h3";
  className?: string;
}) {
  return (
    <div className={cx("isl-empty", className)}>
      {icon && (
        <span className="isl-empty__icon" aria-hidden="true">
          {icon}
        </span>
      )}
      <Title className="isl-empty__title isl-title3">{title}</Title>
      {children && <p className="isl-empty__text isl-secondary">{children}</p>}
      {action}
    </div>
  );
}
