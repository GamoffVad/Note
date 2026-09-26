import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { cx } from "./util.ts";

export interface ToastMessage {
  text: string;
  tone?: "info" | "success" | "error";
  action?: { label: string; run: () => void };
}

const Context = createContext<(message: ToastMessage) => void>(() => undefined);

export function useToast() {
  return useContext(Context);
}

/**
 * Короткие уведомления с необязательной отменой, объявляются через
 * role="status". Ошибки важных операций дополнительно показываются рядом с объектом.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState<(ToastMessage & { id: number }) | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const show = useCallback((next: ToastMessage) => setMessage({ ...next, id: Date.now() }), []);

  useEffect(() => {
    if (!message) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setMessage(null), message.action ? 7000 : 4000);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [message]);

  return (
    <Context.Provider value={show}>
      {children}
      <div className="isl-toast-region" role="status" aria-live="polite">
        {message && (
          <div className={cx("isl-toast", `isl-toast--${message.tone ?? "info"}`)} key={message.id}>
            <span>{message.text}</span>
            {message.action && (
              <button
                type="button"
                className="isl-toast__action"
                onClick={() => {
                  message.action!.run();
                  setMessage(null);
                }}
              >
                {message.action.label}
              </button>
            )}
          </div>
        )}
      </div>
    </Context.Provider>
  );
}
