import { useId, type AnchorHTMLAttributes, type ReactNode } from "react";
import { cx } from "./util.ts";

/**
 * Группа настроек в стиле «Системных настроек» macOS: скруглённая карточка со строками.
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
      className={cx("mk-form-group", className)}
      aria-labelledby={title ? `${id}-title` : undefined}
      aria-label={title ? undefined : label}
      aria-describedby={description ? `${id}-description` : undefined}
    >
      {title && (
        <h3 id={`${id}-title`} className="mk-form-group__title mk-headline">
          {title}
        </h3>
      )}
      <div className="mk-form-group__card">{children}</div>
      {description && (
        <p id={`${id}-description`} className="mk-form-group__description mk-caption">
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
    <div className={cx("mk-form-row", stacked && "mk-form-row--stacked", className)}>
      {label !== undefined && (
        <div className="mk-form-row__label">
          <span>{label}</span>
          {hint && <span className="mk-caption">{hint}</span>}
        </div>
      )}
      <div className="mk-form-row__control">{children}</div>
    </div>
  );
}

interface SidebarItemProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  icon?: ReactNode;
  label: ReactNode;
  count?: number;
  selected?: boolean;
}

/** Строка боковой панели macOS: значок акцентного цвета, скруглённое выделение. */
export function SidebarItem({ icon, label, count, selected, className, ...rest }: SidebarItemProps) {
  return (
    <a className={cx("mk-sidebar-item", selected && "is-selected", className)} aria-current={selected ? "page" : undefined} {...rest}>
      {icon && (
        <span className="mk-sidebar-item__icon" aria-hidden="true">
          {icon}
        </span>
      )}
      <span className="mk-sidebar-item__label">{label}</span>
      {count !== undefined && <span className="mk-sidebar-item__count">{count}</span>}
    </a>
  );
}

export function SidebarSection({ title, children, label }: { title?: string; children: ReactNode; label: string }) {
  return (
    <nav className="mk-sidebar-section" aria-label={label}>
      {title && <div className="mk-sidebar-section__title">{title}</div>}
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
    <div className={cx("mk-empty", className)}>
      {icon && (
        <span className="mk-empty__icon" aria-hidden="true">
          {icon}
        </span>
      )}
      <Title className="mk-empty__title mk-title3">{title}</Title>
      {children && <p className="mk-empty__text mk-secondary">{children}</p>}
      {action}
    </div>
  );
}
