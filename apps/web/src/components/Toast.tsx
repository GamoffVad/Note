import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";

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
 * Короткие сообщения с необязательной отменой. Объявляются через
 * role="status" (aria-live polite). Ошибки важных операций дополнительно
 * показываются рядом с объектом.
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
      <div className="toast-region" role="status" aria-live="polite">
        {message && (
          <div className={`toast toast-${message.tone ?? "info"}`} key={message.id}>
            <span>{message.text}</span>
            {message.action && (
              <button
                type="button"
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
