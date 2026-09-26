import { useCallback, useEffect, useState } from "react";
import type { DeviceInfo } from "@mayak/domain";
import { Dialog } from "../components/Dialog.tsx";
import { Icon } from "../components/Icon.tsx";
import { useToast } from "../components/Toast.tsx";
import { useMayak } from "../state/MayakContext.tsx";
import { formatRelativeDate } from "../state/format.ts";
import { navigate } from "../state/router.ts";

const PLATFORM: Record<DeviceInfo["platform"], string> = {
  windows: "Windows",
  macos: "macOS",
  linux: "Linux",
  android: "Android",
  ios: "iOS",
  web: "Браузер",
};

export function DevicesScreen() {
  const { workspace } = useMayak();
  const toast = useToast();
  const transport = workspace.transport;
  const [devices, setDevices] = useState<DeviceInfo[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [revoking, setRevoking] = useState<DeviceInfo | null>(null);

  const load = useCallback(() => {
    if (!transport) return;
    setError(null);
    transport
      .listDevices()
      .then(setDevices)
      .catch(() => setError("Не удалось получить список устройств. Проверьте сеть и повторите."));
  }, [transport]);
  useEffect(load, [load]);

  return (
    <article className="sheet">
      <div className="eyebrow accent">Связь между устройствами</div>
      <div className="page-heading">
        <h1 className="page-title">Ваши устройства</h1>
        {transport && (
          <button type="button" className="button" onClick={load} aria-label="Обновить список устройств">
            <Icon name="sync" size={16} /> Обновить
          </button>
        )}
      </div>
      <p className="intro">Мысли остаются с вами, даже когда меняется экран.</p>

      {!transport && (
        <>
          <DeviceCard name={workspace.deviceName} detail="Это устройство · синхронизация не настроена" badge="Сейчас" />
          <div className="cloud-explain">
            <strong>Второе устройство</strong>
            <br />
            Чтобы продолжить работу на другом устройстве, войдите в тот же аккаунт на обоих. Сейчас заметки хранятся только
            в этом браузере.
            <br />
            <button type="button" className="button" onClick={() => navigate({ section: "settings" })}>
              Настроить синхронизацию
            </button>
          </div>
        </>
      )}

      {transport && error && (
        <div className="banner banner-danger" role="alert">
          <p>{error}</p>
          <button type="button" className="button" onClick={load}>
            Повторить
          </button>
        </div>
      )}
      {transport && !devices && !error && <p aria-busy="true">Загружаем устройства…</p>}
      {transport && devices && (
        <ul className="plain-list">
          {devices.map((d) => (
            <li key={d.id}>
              <DeviceCard
                name={d.current ? `${d.name} · это устройство` : d.name}
                detail={
                  d.revokedAt
                    ? `${PLATFORM[d.platform]} · доступ отозван`
                    : `${PLATFORM[d.platform]} · ${d.lastSeenAt ? `последнее подключение: ${formatRelativeDate(d.lastSeenAt).toLocaleLowerCase("ru")}` : "ещё не подключалось"}`
                }
                badge={d.current ? "Сейчас" : null}
                revoked={!!d.revokedAt}
                onRevoke={d.current || d.revokedAt ? undefined : () => setRevoking(d)}
              />
            </li>
          ))}
        </ul>
      )}
      {transport && (
        <div className="cloud-explain">
          <strong>Где хранятся данные</strong>
          <br />
          Заметки сохраняются на каждом устройстве и на сервере синхронизации. Отзыв устройства закрывает ему доступ к
          аккаунту, но не удаляет то, что уже сохранено на нём.
        </div>
      )}

      {revoking && transport && (
        <Dialog
          title="Отозвать доступ устройства?"
          onClose={() => setRevoking(null)}
          actions={
            <>
              <button type="button" className="button" onClick={() => setRevoking(null)}>
                Отмена
              </button>
              <button
                type="button"
                className="button danger"
                onClick={async () => {
                  try {
                    await transport.revokeDevice(revoking.id);
                    toast({ text: `Доступ «${revoking.name}» отозван`, tone: "success" });
                    load();
                  } catch {
                    toast({ text: "Не удалось отозвать доступ", tone: "error" });
                  }
                  setRevoking(null);
                }}
              >
                Отозвать доступ
              </button>
            </>
          }
        >
          <p>
            «{revoking.name}» больше не сможет синхронизироваться с аккаунтом. Заметки, уже сохранённые на нём, останутся
            там.
          </p>
        </Dialog>
      )}
    </article>
  );
}

function DeviceCard(props: { name: string; detail: string; badge: string | null; revoked?: boolean; onRevoke?: () => void }) {
  return (
    <div className={`device${props.revoked ? " revoked" : ""}`}>
      <Icon name="devices" />
      <div>
        <strong>{props.name}</strong>
        <small>{props.detail}</small>
      </div>
      {props.badge && <span className="device-badge">{props.badge}</span>}
      {props.onRevoke && (
        <button type="button" className="button small" onClick={props.onRevoke}>
          Отозвать
        </button>
      )}
    </div>
  );
}
