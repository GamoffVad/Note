import type { HTMLAttributes, ReactNode } from "react";
import { cx } from "./util.ts";

export interface ToolbarGroupProps extends HTMLAttributes<HTMLDivElement> {
  /** Доступное имя группы для чтения с экрана. */
  label: string;
  children: ReactNode;
}

/** Группа кнопок панели: связанные действия стоят рядом на общей спокойной подложке. */
export function ToolbarGroup({ label, children, className, ...rest }: ToolbarGroupProps) {
  return (
    <div role="group" aria-label={label} className={cx("isl-toolbar-group", className)} {...rest}>
      {children}
    </div>
  );
}

/** Боковая панель навигации: поверхность panel во всю высоту окна, отделена границей. */
export function SidebarPanel({ children, className, ...rest }: HTMLAttributes<HTMLElement> & { children: ReactNode }) {
  return (
    <aside className={cx("isl-sidebar-panel", className)} {...rest}>
      {children}
    </aside>
  );
}
