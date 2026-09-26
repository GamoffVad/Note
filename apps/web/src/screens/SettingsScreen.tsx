import { useId, useState } from "react";
import { Dialog } from "../components/Dialog.tsx";
import { useAppearance } from "../state/AppearanceContext.tsx";
import { FONTS, lowContrastScopes, MAX_SIZE, MIN_SIZE, WEIGHTS, type FontFamily, type Scope } from "../state/appearance.ts";
import { useMayak } from "../state/MayakContext.tsx";
import { downloadBlob, plural, safeFileName } from "../state/format.ts";
import { DEFAULT_API_BASE, type SyncConfig } from "../state/workspace.ts";

export function SettingsScreen() {
  return (
    <article className="sheet settings">
      <div className="eyebrow accent">Маяк · настройки этого устройства</div>
      <h1 className="page-title">Настройки</h1>
      <AppearanceSection />
      <SyncSection />
      <StorageSection />
    </article>
  );
}

function AppearanceSection() {
  const { appearance: a, dark, saved, update, reset } = useAppearance();
  const warnings = lowContrastScopes(a, dark);
  return (
    <section className="settings-section" aria-labelledby="appearance-title">
      <h2 id="appearance-title">Внешний вид</h2>
      <p className="muted">Выбор применяется сразу и сохраняется только на этом устройстве. Текст заметок не меняется.</p>
      <div className="settings-grid">
        <div>
          <label className="field-label" htmlFor="theme">
            Тема оформления
          </label>
          <select id="theme" value={a.theme} onChange={(e) => update({ theme: e.target.value as typeof a.theme })}>
            <option value="light">Тихая ясность / Светлая</option>
            <option value="dark">Тихая ясность / Тёмная</option>
            <option value="system">Как в системе</option>
          </select>
          <FontFieldset scope="ui" legend="Шрифт интерфейса" />
          <FontFieldset scope="editor" legend="Шрифт редактора" />
          <button type="button" className="button" onClick={reset}>
            Сбросить оформление
          </button>
          <p role="status" className="muted small">
            {saved === false
              ? "Сохранить не удалось: выбор действует только в текущем сеансе."
              : saved
                ? "Оформление сохранено на устройстве."
                : ""}
          </p>
          {warnings.length > 0 && (
            <p role="status" className="warning-text">
              Низкий контраст текста {warnings.map((s) => (s === "ui" ? "интерфейса" : "редактора")).join(" и ")}.
              Выберите более контрастный цвет или включите «Цвет из темы».
            </p>
          )}
        </div>
        <div className="preview-card" aria-label="Предпросмотр">
          <div className="eyebrow">Предпросмотр заметки</div>
          <div className="preview-editor">
            <h3>Мысли под рукой</h3>
            <p>Запишите идею, составьте план и вернитесь к нему на любом устройстве.</p>
            <label className="checkrow">
              <input type="checkbox" /> <span>Подготовить материалы проекта</span>
            </label>
          </div>
          <p className="preview-ui">Так выглядят подписи интерфейса.</p>
          <button type="button" className="button primary" tabIndex={-1} aria-hidden="true">
            Пример действия
          </button>
        </div>
      </div>
    </section>
  );
}

function FontFieldset({ scope, legend }: { scope: Scope; legend: string }) {
  const { appearance: a, update } = useAppearance();
  const id = useId();
  const family = a[scope];
  const size = a[`${scope}Size`];
  const weight = a[`${scope}Weight`];
  const auto = a[`${scope}Auto`];
  const color = a[`${scope}Color`];
  return (
    <fieldset>
      <legend>{legend}</legend>
      <label className="field-label" htmlFor={`${id}-family`}>
        Семейство
      </label>
      <select id={`${id}-family`} value={family} onChange={(e) => update({ [scope]: e.target.value as FontFamily })}>
        {Object.entries(FONTS).map(([value, f]) => (
          <option key={value} value={value}>
            {f.label}
          </option>
        ))}
      </select>
      <label className="field-label" htmlFor={`${id}-size`}>
        Размер: <output htmlFor={`${id}-size`}>{size}</output> px
      </label>
      <input
        id={`${id}-size`}
        type="range"
        min={MIN_SIZE}
        max={MAX_SIZE}
        step={1}
        value={size}
        onChange={(e) => update({ [`${scope}Size`]: Number(e.target.value) })}
      />
      <label className="field-label" htmlFor={`${id}-weight`}>
        Толщина
      </label>
      <select id={`${id}-weight`} value={weight} onChange={(e) => update({ [`${scope}Weight`]: Number(e.target.value) })}>
        {WEIGHTS.map((w) => (
          <option key={w.value} value={w.value}>
            {w.label}
          </option>
        ))}
      </select>
      <label className="checkline">
        <input type="checkbox" checked={auto} onChange={(e) => update({ [`${scope}Auto`]: e.target.checked })} /> Цвет из
        темы
      </label>
      <label className="field-label" htmlFor={`${id}-color`}>
        Свой цвет текста
      </label>
      <input
        id={`${id}-color`}
        type="color"
        value={color}
        disabled={auto}
        onChange={(e) => update({ [`${scope}Color`]: e.target.value.toLowerCase() })}
      />
    </fieldset>
  );
}

function SyncSection() {
  const { workspace, setSyncConfig, status } = useMayak();
  const config = workspace.config;
  const [account, setAccount] = useState(config.mode === "dev" ? config.account : "");
  const [apiBase, setApiBase] = useState(config.mode === "dev" ? config.apiBase : DEFAULT_API_BASE);
  const [confirm, setConfirm] = useState<SyncConfig | null>(null);
  const valid = /^[A-Za-z0-9._@-]{1,64}$/.test(account);
  const pending = status.pendingCount + status.failedCount + status.conflictCount;

  const apply = (next: SyncConfig) => {
    if (pending > 0) setConfirm(next);
    else setSyncConfig(next);
  };

  return (
    <section className="settings-section" aria-labelledby="sync-title">
      <h2 id="sync-title">Синхронизация</h2>
      {config.mode === "local" ? (
        <p>Сейчас заметки хранятся только в этом браузере.</p>
      ) : (
        <p>
          Подключено к серверу разработки <code>{config.apiBase}</code> как «{config.account}».
        </p>
      )}
      <div className="banner banner-warning">
        <p>
          Вход через аккаунт ещё не подключён. Здесь доступен только <strong>режим разработчика</strong>: подключение к
          локальному серверу Маяка по имени, без пароля и проверки личности. Не используйте его для личных данных на общем
          сервере.
        </p>
      </div>
      <form
        className="sync-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (valid) apply({ mode: "dev", account, apiBase: apiBase.trim() || DEFAULT_API_BASE });
        }}
      >
        <label className="field-label" htmlFor="dev-account">
          Имя аккаунта разработчика
        </label>
        <input
          id="dev-account"
          value={account}
          autoComplete="off"
          aria-describedby="dev-account-hint"
          onChange={(e) => setAccount(e.target.value.trim())}
        />
        <small id="dev-account-hint" className="muted">
          Латиница, цифры, «.», «_», «@», «-». На втором устройстве введите то же имя.
        </small>
        <label className="field-label" htmlFor="dev-api">
          Адрес API
        </label>
        <input id="dev-api" value={apiBase} onChange={(e) => setApiBase(e.target.value)} />
        <div className="form-actions">
          <button type="submit" className="button primary" disabled={!valid}>
            {config.mode === "dev" ? "Переподключить" : "Подключить"}
          </button>
          {config.mode === "dev" && (
            <button type="button" className="button" onClick={() => apply({ mode: "local" })}>
              Отключить синхронизацию
            </button>
          )}
        </div>
      </form>
      {confirm && (
        <Dialog
          title="Есть неотправленные изменения"
          onClose={() => setConfirm(null)}
          actions={
            <>
              <button type="button" className="button" onClick={() => setConfirm(null)}>
                Отмена
              </button>
              <button
                type="button"
                className="button primary"
                onClick={() => {
                  setSyncConfig(confirm);
                  setConfirm(null);
                }}
              >
                Продолжить
              </button>
            </>
          }
        >
          <p>
            {pending} {plural(pending, "изменение не отправлено", "изменения не отправлены", "изменений не отправлено")}.
            Они останутся на этом устройстве и уйдут, когда вы снова подключитесь к этому аккаунту.
          </p>
        </Dialog>
      )}
    </section>
  );
}

function StorageSection() {
  const { persisted, notes } = useMayak();
  const alive = notes.filter((n) => !n.deleted).length;
  const exportJson = () => {
    const archive = {
      format: "mayak-notes",
      version: 1,
      exportedAt: new Date().toISOString(),
      notes: notes.map((n) => ({ id: n.id, document: n.document, deleted: n.deleted, updatedAt: n.updatedAt })),
    };
    downloadBlob(
      new Blob([JSON.stringify(archive, null, 2)], { type: "application/json" }),
      safeFileName(`Маяк ${new Date().toISOString().slice(0, 10)}`, "json"),
    );
  };
  return (
    <section className="settings-section" aria-labelledby="storage-title">
      <h2 id="storage-title">Хранилище и экспорт</h2>
      <p>
        На этом устройстве: {alive} {plural(alive, "заметка", "заметки", "заметок")}.{" "}
        {persisted === true
          ? "Браузер подтвердил постоянное хранилище."
          : persisted === false
            ? "Браузер не подтвердил постоянное хранилище и может очистить данные сайта при нехватке места. Регулярно делайте экспорт или включите синхронизацию."
            : ""}
      </p>
      <button type="button" className="button" onClick={exportJson}>
        Скачать все заметки (JSON)
      </button>
      <p className="muted small">JSON-архив сохраняет структуру, теги и идентификаторы. Импорт появится позже.</p>
    </section>
  );
}
