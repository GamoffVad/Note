import { type AnchorHTMLAttributes, type ReactNode } from "react";
import { cx } from "./util.ts";

/** Группа настроек в стиле «Системных настроек» macOS: скруглённая карточка со строками. */
export function FormGroup({ title, description, children }: { title?: string; description?: ReactNode; children: ReactNode }) {
  return (
    <section className="mk-form-group" aria-label={title}>
      {title && <h3 className="mk-form-group__title mk-headline">{title}</h3>}
      <div className="mk-form-group__card">{children}</div>
      {description && <p className="mk-form-group__description mk-caption">{description}</p>}
    </section>
  );
}

/** Строка группы: подпись слева, элемент управления справа; на узком экране — друг под другом. */
export function FormRow({ label, hint, children, stacked }: { label?: ReactNode; hint?: ReactNode; children: ReactNode; stacked?: boolean }) {
  return (
    <div className={cx("mk-form-row", stacked && "mk-form-row--stacked")}>
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
export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="mk-empty">
      <p className="mk-empty__title mk-title3">{title}</p>
      {children && <p className="mk-empty__text mk-secondary">{children}</p>}
      {action}
    </div>
  );
}
