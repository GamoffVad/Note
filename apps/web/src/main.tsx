import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "../../../design/design-tokens.css";
import "./styles/app.css";
import { App } from "./App.tsx";
import { ToastProvider } from "./components/Toast.tsx";
import { AppearanceProvider } from "./state/AppearanceContext.tsx";
import { MayakProvider } from "./state/MayakContext.tsx";

function Startup({ error }: { error: Error | null }) {
  return (
    <main className="startup" aria-busy={!error}>
      {error ? (
        <>
          <h1>Не удалось открыть хранилище браузера</h1>
          <p>
            Маяк хранит заметки в IndexedDB. Возможно, браузер запрещает хранение данных сайта (например, в приватном
            режиме) или хранилище повреждено.
          </p>
          <button type="button" className="button primary" onClick={() => location.reload()}>
            Повторить
          </button>
        </>
      ) : (
        <p>Открываем заметки…</p>
      )}
    </main>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AppearanceProvider>
      <ToastProvider>
        <MayakProvider fallback={(error) => <Startup error={error} />}>
          <App />
        </MayakProvider>
      </ToastProvider>
    </AppearanceProvider>
  </StrictMode>,
);
