import { useEffect, useRef, type ReactNode } from "react";
import { Icon } from "./Icon.tsx";

interface DialogProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
  actions?: ReactNode;
  wide?: boolean;
  /** Селектор элемента, который получает фокус при открытии. */
  initialFocus?: string;
}

/**
 * Модальный диалог на нативном <dialog>: фокус удерживается внутри, Esc
 * закрывает, после закрытия фокус возвращается к инициатору.
 */
export function Dialog({ title, onClose, children, actions, wide, initialFocus }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useRef(`dialog-${Math.random().toString(36).slice(2)}`).current;

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
      className={wide ? "dialog dialog-wide" : "dialog"}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        // Нажатие на подложку закрывает диалог.
        if (event.target === ref.current) onClose();
      }}
    >
      <div className="dialog-head">
        <h2 id={titleId}>{title}</h2>
        <button type="button" className="icon-button" onClick={onClose} aria-label="Закрыть">
          <Icon name="close" />
        </button>
      </div>
      <div className="dialog-body">{children}</div>
      {actions && <div className="dialog-actions">{actions}</div>}
    </dialog>
  );
}
