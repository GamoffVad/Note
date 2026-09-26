import { useCallback, useEffect, useState } from "react";
import type { DeviceInfo } from "@mayak/domain";
import { Badge, Banner, Button, Sheet, useToast } from "@mayak/ui";
import { Icon } from "../components/Icon.tsx";
import { Loading } from "../components/Loading.tsx";
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
    <article className="page">
      <header className="page-header page-header--actions">
        <div>
          <h1 className="page-title">Ваши устройства</h1>
          <p className="page-subtitle">Связь между устройствами</p>
        </div>
        {transport && (
          <Button onClick={load} aria-label="Обновить список устройств" icon={<Icon name="sync" />}>
            Обновить
          </Button>
        )}
      </header>
      <p className="intro">Мысли остаются с вами, даже когда меняется экран.</p>

      {!transport && (
        <>
          <ul className="card device-list">
            <li>
              <DeviceCard name={workspace.deviceName} detail="Это устройство · синхронизация не настроена" badge="Сейчас" />
            </li>
          </ul>
          <div className="explain">
            <h2 className="mk-headline">Второе устройство</h2>
            <p>
              Чтобы продолжить работу на другом устройстве, войдите в тот же аккаунт на обоих. Сейчас заметки хранятся
              только в этом браузере.
            </p>
            <Button variant="primary" onClick={() => navigate({ section: "settings" })}>
              Настроить синхронизацию
            </Button>
          </div>
        </>
      )}

      {transport && error && (
        <Banner tone="danger" role="alert" icon={<Icon name="warning" />} actions={<Button onClick={load}>Повторить</Button>}>
          <p>{error}</p>
        </Banner>
      )}
      {transport && !devices && !error && <Loading text="Загружаем устройства…" />}
      {transport && devices && (
        <ul className="card device-list">
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
        <div className="explain">
          <h2 className="mk-headline">Где хранятся данные</h2>
          <p>
            Заметки сохраняются на каждом устройстве и на сервере синхронизации. Отзыв устройства закрывает ему доступ к
            аккаунту, но не удаляет то, что уже сохранено на нём.
          </p>
        </div>
      )}

      {revoking && transport && (
        <Sheet
          title="Отозвать доступ устройства?"
          onClose={() => setRevoking(null)}
          actions={
            <>
              <Button onClick={() => setRevoking(null)}>Отмена</Button>
              <Button
                variant="destructive"
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
              </Button>
            </>
          }
        >
          <p>
            «{revoking.name}» больше не сможет синхронизироваться с аккаунтом. Заметки, уже сохранённые на нём, останутся
            там.
          </p>
        </Sheet>
      )}
    </article>
  );
}

function DeviceCard(props: { name: string; detail: string; badge: string | null; revoked?: boolean; onRevoke?: () => void }) {
  return (
    <div className={`device${props.revoked ? " revoked" : ""}`}>
      <span className="device__icon">
        <Icon name="devices" />
      </span>
      <div className="device__text">
        <strong>{props.name}</strong>
        <small className="mk-caption">{props.detail}</small>
      </div>
      {props.badge && <Badge tone="info">{props.badge}</Badge>}
      {props.revoked && <Badge>Отозвано</Badge>}
      {props.onRevoke && (
        <Button size="small" onClick={props.onRevoke}>
          Отозвать
        </Button>
      )}
    </div>
  );
}
