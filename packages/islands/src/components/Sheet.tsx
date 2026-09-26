import { useEffect, useId, useRef, type ReactNode } from "react";
import { cx } from "./util.ts";

interface SheetProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** Кнопки внизу: основная — последняя (справа на компьютере). */
  actions?: ReactNode;
  size?: "regular" | "wide";
  /** Селектор элемента, получающего фокус при открытии. */
  initialFocus?: string;
}

/**
 * Диалог «Островов»: поднятая поверхность с радиусом 24 px над затемнённым окном.
 * Построен на <dialog>: фокус удерживается внутри, Esc закрывает, после
 * закрытия фокус возвращается к инициатору.
 */
export function Sheet({ title, onClose, children, actions, size = "regular", initialFocus }: SheetProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const opener = document.activeElement as HTMLElement | null;
    dialog.showModal();
    const target = initialFocus ? dialog.querySelector<HTMLElement>(initialFocus) : null;
    target?.focus();
    return () => {
      if (dialog.open) dialog.close();
      if (opener?.isConnected) opener.focus();
    };
  }, [initialFocus]);

  return (
    <dialog
      ref={ref}
      className={cx("isl-sheet", size === "wide" && "isl-sheet--wide")}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === ref.current) onClose();
      }}
    >
      <div className="isl-sheet__body">
        <h2 id={titleId} className="isl-sheet__title isl-title3">
          {title}
        </h2>
        <div className="isl-sheet__content">{children}</div>
      </div>
      {actions && <div className="isl-sheet__actions">{actions}</div>}
    </dialog>
  );
}
