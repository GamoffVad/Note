import type { HTMLAttributes, ReactNode } from "react";
import { cx } from "./util.ts";

export interface ToolbarGroupProps extends HTMLAttributes<HTMLDivElement> {
  /** Доступное имя группы для чтения с экрана. */
  label: string;
  children: ReactNode;
}

/**
 * Группа кнопок панели инструментов на общей стеклянной капсуле:
 * в macOS 27 связанные действия панели объединяются на одной подложке Liquid Glass.
 */
export function ToolbarGroup({ label, children, className, ...rest }: ToolbarGroupProps) {
  return (
    <div role="group" aria-label={label} className={cx("mk-toolbar-group mk-glass", className)} {...rest}>
      {children}
    </div>
  );
}

/** Боковая панель в слое Liquid Glass: парит над содержимым с отступом от краёв окна. */
export function SidebarPanel({ children, className, ...rest }: HTMLAttributes<HTMLElement> & { children: ReactNode }) {
  return (
    <aside className={cx("mk-sidebar-panel", className)} {...rest}>
      {children}
    </aside>
  );
}
