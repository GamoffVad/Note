import { useState } from "react";
import { Banner, Button, Sheet } from "@mayak/ui";
import { describeSyncStatus, pluralChanges, type StatusText } from "@mayak/sync";
import { useMayak } from "../state/MayakContext.tsx";
import { formatTime } from "../state/format.ts";
import { navigate } from "../state/router.ts";
import { Icon, type IconName } from "./Icon.tsx";

export function useSyncText(): StatusText & { icon: IconName } {
  const { status, workspace } = useMayak();
  if (!workspace.transport) {
    if (status.conflictCount > 0) return { ...describeSyncStatus(status, formatTime), icon: "warning" };
    return { text: "Сохранено на устройстве · синхронизация не настроена", action: null, tone: "neutral", icon: "check" };
  }
  const text = describeSyncStatus(status, formatTime);
  const icon: IconName =
    status.state === "offline" ? "cloudOff" : text.tone === "success" ? "check" : text.tone === "neutral" ? "sync" : "warning";
  return { ...text, icon };
}

/** Строка состояния внизу окна; по нажатию — подробности и повтор. */
export function SyncFooter() {
  const [open, setOpen] = useState(false);
  const text = useSyncText();
  return (
    <>
      <button type="button" className={`sync-status tone-${text.tone}`} onClick={() => setOpen(true)}>
        <Icon name={text.icon} size={14} />
        <span>{text.text}</span>
      </button>
      {open && <SyncDialog onClose={() => setOpen(false)} />}
    </>
  );
}

export function SyncDialog({ onClose }: { onClose: () => void }) {
  const { status, workspace, outbox, conflicts, notes, syncNow } = useMayak();
  const text = useSyncText();
  const [busy, setBusy] = useState(false);
  const failed = [...outbox.values()].filter((e) => e.failure);
  const titleOf = (id: string) => notes.find((n) => n.id === id)?.document.title.trim() || "Без названия";
  const connected = workspace.transport !== null;
  const toSettings = () => {
    onClose();
    navigate({ section: "settings" });
  };

  return (
    <Sheet
      title="Состояние синхронизации"
      onClose={onClose}
      actions={
        <>
          <Button onClick={onClose}>Закрыть</Button>
          {!connected && (
            <Button variant="primary" onClick={toSettings}>
              Настроить
            </Button>
          )}
          {connected && (status.state === "auth-required" || status.state === "forbidden") && (
            <Button variant="primary" onClick={toSettings}>
              Войти
            </Button>
          )}
          {connected && status.state !== "auth-required" && status.state !== "forbidden" && (
            <Button
              variant="primary"
              loading={busy}
              loadingLabel="Синхронизируем…"
              onClick={async () => {
                setBusy(true);
                await syncNow();
                setBusy(false);
              }}
            >
              Повторить сейчас
            </Button>
          )}
        </>
      }
    >
      <Banner tone={text.tone} icon={<Icon name={text.icon} />}>
        <strong>{text.text}</strong>
      </Banner>
      <dl className="facts">
        <dt>Это устройство</dt>
        <dd>{workspace.deviceName}</dd>
        <dt>Режим</dt>
        <dd>
          {workspace.config.mode === "account"
            ? `Аккаунт ${workspace.config.email}`
            : workspace.config.mode === "dev"
              ? `Локальный сервер разработки · «${workspace.config.account}»`
              : "Только на этом устройстве"}
        </dd>
        <dt>Не отправлено</dt>
        <dd>{status.pendingCount ? pluralChanges(status.pendingCount) : "нет"}</dd>
        <dt>Конфликты</dt>
        <dd>{conflicts.size || "нет"}</dd>
        {connected && (
          <>
            <dt>Последний обмен</dt>
            <dd>{status.lastSyncedAt ? formatTime(status.lastSyncedAt) : "ещё не было"}</dd>
          </>
        )}
        {status.nextRetryAt && (
          <>
            <dt>Следующая попытка</dt>
            <dd>{formatTime(status.nextRetryAt)}</dd>
          </>
        )}
      </dl>
      {failed.length > 0 && (
        <>
          <h3 className="mk-headline">Не удалось отправить</h3>
          <ul className="plain-list">
            {failed.map((entry) => (
              <li key={entry.entityId}>
                <strong>{titleOf(entry.entityId)}</strong>
                <br />
                <span className="mk-secondary">{entry.failure!.message}. Текст сохранён на устройстве.</span>
              </li>
            ))}
          </ul>
        </>
      )}
      {!connected && (
        <p className="mk-secondary">
          Заметки хранятся в браузере этого устройства. Чтобы продолжать работу на другом устройстве, нужна
          синхронизация с аккаунтом.
        </p>
      )}
    </Sheet>
  );
}
