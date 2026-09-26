import { useCallback, useEffect, useRef, useState } from "react";
import { Banner, Button, ButtonLink, EmptyState, FileCard, IconButton, ProgressBar, useToast } from "@mayak/islands";
import { Icon } from "../components/Icon.tsx";
import { useMayak } from "../state/MayakContext.tsx";
import { formatRelativeDate, plural } from "../state/format.ts";
import { routeHref } from "../state/router.ts";
import { getSupabase } from "../state/supabase.ts";
import {
  daysLeft,
  deleteTransfer,
  formatSize,
  listTransfers,
  MAX_TRANSFER_BYTES,
  removeExpired,
  saveTransfer,
  sendFile,
  type Transfer,
} from "../state/transfers.ts";

/**
 * Файлы: передача между своими устройствами. Выбрали файл — он появился
 * здесь же на других устройствах этого аккаунта; там его можно сохранить.
 * Файл хранится 7 дней, затем удаляется.
 */
export function FilesScreen() {
  const { workspace } = useMayak();
  const config = workspace.config;
  const sb = getSupabase();
  const userId = config.mode === "account" ? config.userId : null;

  return (
    <article className="page files">
      <header className="page-header">
        <h1 className="page-title">Файлы</h1>
        <p className="page-subtitle">Передача между вашими устройствами · файл хранится 7 дней</p>
      </header>
      {sb && userId ? (
        <Transfers userId={userId} deviceName={workspace.deviceName} />
      ) : (
        <EmptyState
          title="Войдите, чтобы передавать файлы"
          icon={<Icon name="files" />}
          action={<ButtonLink href={routeHref({ section: "settings" })}>Войти по почте</ButtonLink>}
        >
          Файлы передаются между устройствами одного аккаунта. Войдите по почте в «Настройках» на обоих устройствах.
        </EmptyState>
      )}
    </article>
  );
}

function Transfers({ userId, deviceName }: { userId: string; deviceName: string }) {
  const sb = getSupabase()!;
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<Transfer[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setItems(await listTransfers(sb));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Список не загрузился");
    }
  }, [sb]);

  // Список обновляется при открытии, при возвращении в приложение и раз в 30 секунд.
  useEffect(() => {
    void removeExpired(sb, userId).catch(() => undefined).then(refresh);
    const timer = setInterval(() => void refresh(), 30_000);
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [sb, userId, refresh]);

  const send = async (files: FileList | null) => {
    for (const file of Array.from(files ?? [])) {
      if (file.size > MAX_TRANSFER_BYTES) {
        toast({ text: `«${file.name}» больше ${formatSize(MAX_TRANSFER_BYTES)} — такой файл не передать.`, tone: "error" });
        continue;
      }
      setSending(file.name);
      try {
        await sendFile(sb, userId, file, deviceName);
        toast({ text: `Отправлено: ${file.name}. Файл появится на других ваших устройствах.`, tone: "success" });
      } catch (e) {
        toast({ text: `Не отправлено: ${e instanceof Error ? e.message : "ошибка"}`, tone: "error" });
      }
    }
    setSending(null);
    if (input.current) input.current.value = "";
    void refresh();
  };

  const save = async (t: Transfer) => {
    setBusy(t.id);
    try {
      toast({ text: await saveTransfer(sb, userId, t), tone: "success" });
    } catch (e) {
      toast({ text: `Не сохранено: ${e instanceof Error ? e.message : "ошибка"}`, tone: "error" });
    }
    setBusy(null);
  };

  const remove = async (t: Transfer) => {
    setBusy(t.id);
    try {
      await deleteTransfer(sb, userId, t);
      setItems((list) => list?.filter((x) => x.id !== t.id) ?? null);
      toast({ text: `Удалено: ${t.name}` });
    } catch (e) {
      toast({ text: `Не удалено: ${e instanceof Error ? e.message : "ошибка"}`, tone: "error" });
    }
    setBusy(null);
  };

  return (
    <>
      <div className="files-send">
        {/* Системный выбор файла скрыт; открывается кнопкой «Отправить файл». */}
        <input ref={input} type="file" multiple hidden onChange={(e) => void send(e.target.files)} />
        <Button
          variant="primary"
          icon={<Icon name="plus" />}
          loading={sending !== null}
          loadingLabel="Отправляется…"
          onClick={() => input.current?.click()}
        >
          Отправить файл
        </Button>
        <p className="isl-caption">До {formatSize(MAX_TRANSFER_BYTES)} за файл</p>
      </div>
      {sending && (
        <div className="files-progress">
          <ProgressBar label={`Отправляется ${sending}`} value={null} />
        </div>
      )}
      {error && (
        <Banner tone="danger" role="alert" icon={<Icon name="warning" />} actions={<Button onClick={() => void refresh()}>Повторить</Button>}>
          <p>Список файлов не загрузился: {error}</p>
        </Banner>
      )}
      {items === null && !error ? (
        <p className="loading-line">Загружаем список…</p>
      ) : items && items.length === 0 ? (
        <EmptyState title="Файлов пока нет" icon={<Icon name="files" />}>
          Отправьте файл с этого устройства — он появится здесь же на других ваших устройствах.
        </EmptyState>
      ) : (
        <ul className="plain-list files-list" aria-label="Файлы для передачи">
          {items?.map((t) => {
            const left = daysLeft(t.expires_at);
            return (
              <li key={t.id}>
                <FileCard
                  icon={<Icon name="files" />}
                  name={t.name}
                  details={`${formatSize(t.size)} · ${t.device_name || "другое устройство"} · ${formatRelativeDate(t.created_at)}`}
                  status={left <= 0 ? "удаляется сегодня" : `удалится через ${left} ${plural(left, "день", "дня", "дней")}`}
                  action={
                    <span className="files-actions">
                      <Button size="small" icon={<Icon name="download" />} disabled={busy === t.id} onClick={() => void save(t)}>
                        Сохранить
                      </Button>
                      <IconButton
                        size="small"
                        variant="plain"
                        label={`Удалить ${t.name}`}
                        icon={<Icon name="trash" />}
                        disabled={busy === t.id}
                        onClick={() => void remove(t)}
                      />
                    </span>
                  }
                />
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
