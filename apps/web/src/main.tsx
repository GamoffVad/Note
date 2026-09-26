import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
// Токены, базовые стили и компоненты @mayak/islands («Острова идей») — единственный источник цветов, радиусов и размеров.
import "@mayak/islands/styles.css";
import "./styles/app.css";
import { Button, EmptyState, Spinner, ToastProvider } from "@mayak/islands";
import { App } from "./App.tsx";
import { AppearanceProvider } from "./state/AppearanceContext.tsx";
import { MayakProvider } from "./state/MayakContext.tsx";

function Startup({ error }: { error: Error | null }) {
  return (
    <main className="startup" aria-busy={!error}>
      {error ? (
        <EmptyState
          as="h1"
          title="Не удалось открыть хранилище браузера"
          action={
            <Button variant="primary" onClick={() => location.reload()}>
              Повторить
            </Button>
          }
        >
          Маяк хранит заметки в IndexedDB. Возможно, браузер запрещает хранение данных сайта (например, в приватном
          режиме) или хранилище повреждено.
        </EmptyState>
      ) : (
        <p className="startup__loading">
          <Spinner label="Открываем заметки" /> <span aria-hidden="true">Открываем заметки…</span>
        </p>
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
