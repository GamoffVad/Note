import { useEffect, useRef, useState } from "react";
import {
  Banner,
  Button,
  Checkbox,
  ColorWell,
  Disclosure,
  FormGroup,
  FormRow,
  PopUpButton,
  Sheet,
  Slider,
  Switch,
  TextField,
} from "@mayak/islands";
import { Icon } from "../components/Icon.tsx";
import { useAppearance } from "../state/AppearanceContext.tsx";
import { FONTS, lowContrastScopes, MAX_SIZE, MIN_SIZE, WEIGHTS, type FontFamily, type Scope, type ThemeChoice } from "../state/appearance.ts";
import { useMayak } from "../state/MayakContext.tsx";
import { downloadBlob, plural, safeFileName } from "../state/format.ts";
import { AUTH_LINK_ERROR_EVENT, AUTH_REDIRECT_URL, isNativeApp } from "../state/native.ts";
import { getSupabase, isValidEmail, normalizeOtp, supabaseConfigured } from "../state/supabase.ts";
import { DEFAULT_API_BASE, DEV_SYNC_ENABLED, type SyncConfig } from "../state/workspace.ts";

const THEMES: Array<{ value: ThemeChoice; label: string }> = [
  { value: "light", label: "Светлая" },
  { value: "dark", label: "Тёмная" },
  { value: "contrast", label: "Повышенная контрастность" },
  { value: "system", label: "Системная" },
];

const FONT_OPTIONS = (Object.keys(FONTS) as FontFamily[]).map((value) => ({
  value,
  label: FONTS[value].label,
  // Образец шрифта прямо в списке.
  render: <span style={{ fontFamily: FONTS[value].stack }}>{FONTS[value].label}</span>,
}));

const WEIGHT_OPTIONS = WEIGHTS.map((w) => ({ value: w.value as number, label: w.label }));

export function SettingsScreen() {
  return (
    <article className="page settings">
      <header className="page-header">
        <h1 className="page-title">Настройки</h1>
        <p className="page-subtitle">Маяк · настройки этого устройства</p>
      </header>
      <AppearanceSection />
      <SyncSection />
      <StorageSection />
    </article>
  );
}

function AppearanceSection() {
  const { appearance: a, theme, saved, update, reset } = useAppearance();
  const warnings = lowContrastScopes(a, theme);
  return (
    <section className="settings-section" aria-labelledby="appearance-title">
      <h2 id="appearance-title" className="settings-section__title">
        Внешний вид
      </h2>
      <p className="settings-section__intro">
        Выбор применяется сразу и сохраняется только на этом устройстве. Текст заметок не меняется.
      </p>
      <div className="settings-grid">
        <div className="settings-grid__controls">
          <FormGroup label="Тема">
            <FormRow label="Тема оформления">
              <PopUpButton hideLabel label="Тема оформления" value={a.theme} options={THEMES} onChange={(theme) => update({ theme })} />
            </FormRow>
          </FormGroup>
          <FontGroup scope="ui" title="Шрифт интерфейса" />
          <FontGroup scope="editor" title="Шрифт редактора" />
          {warnings.length > 0 && (
            <Banner tone="warning" role="status" icon={<Icon name="warning" />}>
              <p>
                Низкий контраст текста {warnings.map((s) => (s === "ui" ? "интерфейса" : "редактора")).join(" и ")}.
                Выберите более контрастный цвет или включите «Цвет из темы».
              </p>
            </Banner>
          )}
          <div className="settings-actions">
            <Button onClick={reset}>Сбросить оформление</Button>
            <p role="status" className="isl-caption">
              {saved === false
                ? "Сохранить не удалось: выбор действует только в текущем сеансе."
                : saved
                  ? "Оформление сохранено на устройстве."
                  : ""}
            </p>
          </div>
        </div>
        <div className="preview-card" role="group" aria-label="Предпросмотр">
          <p className="isl-headline">Предпросмотр заметки</p>
          <div className="preview-editor">
            <p className="preview-editor__title">Мысли под рукой</p>
            <p>Запишите идею, составьте план и вернитесь к нему на любом устройстве.</p>
            <Checkbox strike label="Подготовить материалы проекта" />
          </div>
          <p className="preview-ui">Так выглядят подписи интерфейса.</p>
          <Button variant="primary" tabIndex={-1} aria-hidden="true">
            Пример действия
          </Button>
        </div>
      </div>
    </section>
  );
}

function FontGroup({ scope, title }: { scope: Scope; title: string }) {
  const { appearance: a, update } = useAppearance();
  const auto = a[`${scope}Auto`];
  return (
    <FormGroup title={title}>
      <FormRow label="Семейство">
        <PopUpButton hideLabel label="Семейство" value={a[scope]} options={FONT_OPTIONS} onChange={(family) => update({ [scope]: family })} />
      </FormRow>
      <FormRow stacked>
        <Slider
          label="Размер"
          value={a[`${scope}Size`]}
          min={MIN_SIZE}
          max={MAX_SIZE}
          format={(v) => `${v} px`}
          onChange={(size) => update({ [`${scope}Size`]: size })}
        />
      </FormRow>
      <FormRow label="Толщина">
        <PopUpButton
          hideLabel
          label="Толщина"
          value={a[`${scope}Weight`]}
          options={WEIGHT_OPTIONS}
          onChange={(weight) => update({ [`${scope}Weight`]: weight })}
        />
      </FormRow>
      <FormRow label="Цвет из темы" hint="Подстраивается под светлую и тёмную тему">
        <Switch
          checked={auto}
          label={<span className="isl-visually-hidden">Цвет из темы</span>}
          onChange={(value) => update({ [`${scope}Auto`]: value })}
        />
      </FormRow>
      <FormRow label="Свой цвет текста">
        <ColorWell
          hideLabel
          label="Свой цвет текста"
          value={a[`${scope}Color`]}
          disabled={auto}
          onChange={(hex) => update({ [`${scope}Color`]: hex })}
        />
      </FormRow>
    </FormGroup>
  );
}

function SyncSection() {
  const { workspace } = useMayak();
  return (
    <section className="settings-section" aria-labelledby="sync-title">
      <h2 id="sync-title" className="settings-section__title">
        Аккаунт и синхронизация
      </h2>
      {supabaseConfigured() ? (
        workspace.config.mode === "account" ? (
          <SignedIn email={workspace.config.email} />
        ) : (
          <SignInForm />
        )
      ) : (
        <p className="settings-section__intro">
          Вход через аккаунт не настроен в этой сборке: не заданы адрес проекта Supabase и публикуемый ключ. Заметки
          хранятся только на этом устройстве.
        </p>
      )}
      {DEV_SYNC_ENABLED && <DevSyncForm />}
    </section>
  );
}

function authErrorText(error: { status?: number; code?: string; message?: string } | null): string {
  if (!error) return "Не удалось выполнить запрос.";
  if (error.code === "over_email_send_rate_limit")
    return "Лимит писем исчерпан: встроенная почта Supabase отправляет лишь несколько писем в час. Подождите около часа или используйте код из уже пришедшего письма.";
  if (error.status === 429) return "Слишком много запросов. Подождите немного и повторите.";
  if (error.code === "otp_expired" || error.status === 403) return "Код неверный или устарел. Запросите новый.";
  if (error.status === 0 || /fetch|network/i.test(error.message ?? "")) return "Нет сети. Проверьте подключение и повторите.";
  return "Не удалось войти. Повторите позже.";
}

/** Не ждать сервер входа бесконечно: через 20 с — понятная ошибка вместо «Отправляем…». */
const AUTH_TIMEOUT_MS = 20_000;

async function withTimeout<T>(promise: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(Object.assign(new Error("Сервер входа не ответил за 20 секунд"), { name: "Timeout" })), AUTH_TIMEOUT_MS);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

/** Техническая строка для скриншота: по ней видно причину на конкретном устройстве. */
function errorDetail(error: unknown): string {
  if (!error || typeof error !== "object") return String(error);
  const e = error as { name?: string; message?: string; status?: number; code?: string };
  return [e.name, e.code, e.status, e.message].filter((x) => x !== undefined && x !== "").join(" · ");
}

/** Вход по email: письмо с кодом (или ссылкой для этого браузера). Пароль не нужен. */
function SignInForm() {
  const { setSyncConfig, status, workspace } = useMayak();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"email" | "code">("email");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<string | null>(null);
  const codeRef = useRef<HTMLInputElement>(null);
  const pending = status.pendingCount + status.failedCount;

  // Ошибка входа по ссылке из письма (приложение, MayakContext).
  useEffect(() => {
    const onError = (e: Event) => setError((e as CustomEvent<string>).detail);
    window.addEventListener(AUTH_LINK_ERROR_EVENT, onError);
    return () => window.removeEventListener(AUTH_LINK_ERROR_EVENT, onError);
  }, []);

  const requestCode = async () => {
    const supabase = getSupabase();
    if (!supabase) return;
    setBusy(true);
    setError(null);
    setDetail(null);
    let e: Parameters<typeof authErrorText>[0] = null;
    try {
      ({ error: e } = await withTimeout(
        supabase.auth.signInWithOtp({
          email: email.trim(),
          // В приложении ссылка из письма открывает «Маяк» (deep link) и выполняет вход.
          options: {
            shouldCreateUser: true,
            emailRedirectTo: isNativeApp() ? AUTH_REDIRECT_URL : `${location.origin}${location.pathname}`,
          },
        }),
      ));
    } catch (thrown) {
      setBusy(false);
      setDetail(errorDetail(thrown));
      return setError(
        (thrown as Error)?.name === "Timeout"
          ? "Сервер входа не ответил за 20 секунд. Проверьте интернет и повторите."
          : "Не удалось отправить письмо. Повторите позже.",
      );
    }
    setBusy(false);
    if (e) {
      setDetail(errorDetail(e));
      return setError(authErrorText(e));
    }
    setStep("code");
    requestAnimationFrame(() => codeRef.current?.focus());
  };

  const verify = async () => {
    const supabase = getSupabase();
    if (!supabase) return;
    setBusy(true);
    setError(null);
    const { data, error: e } = await supabase.auth.verifyOtp({ email: email.trim(), token: normalizeOtp(code), type: "email" });
    setBusy(false);
    if (e || !data.session) return setError(authErrorText(e));
    setSyncConfig({ mode: "account", userId: data.session.user.id, email: data.session.user.email ?? email.trim() });
  };

  return (
    <>
      <p className="settings-section__intro">
        Войдите по email, чтобы заметки синхронизировались между вашими устройствами.
        {workspace.config.mode === "local" && pending > 0 && " Заметки, созданные на этом устройстве, будут отправлены в аккаунт."}
      </p>
      {step === "email" ? (
        <form
          className="card form-card"
          onSubmit={(e) => {
            e.preventDefault();
            if (isValidEmail(email)) void requestCode();
          }}
        >
          <TextField
            id="auth-email"
            label="Email"
            type="email"
            autoComplete="email"
            inputMode="email"
            placeholder="name@example.com"
            value={email}
            error={error}
            onChange={(e) => setEmail(e.target.value)}
          />
          <div className="form-actions">
            <Button type="submit" variant="primary" disabled={!isValidEmail(email)} loading={busy} loadingLabel="Отправляем…">
              Получить код
            </Button>
          </div>
        </form>
      ) : (
        <form
          className="card form-card"
          onSubmit={(e) => {
            e.preventDefault();
            if (normalizeOtp(code).length >= 6) void verify();
          }}
        >
          <p role="status">
            Письмо отправлено на <strong>{email.trim()}</strong>.{" "}
            {isNativeApp()
              ? "Откройте ссылку из письма на этом компьютере — «Маяк» откроется и выполнит вход. Если в письме есть код, можно ввести его здесь."
              : "Введите код из письма или откройте ссылку из него в этом же браузере."}
          </p>
          <TextField
            ref={codeRef}
            id="auth-code"
            label="Код из письма"
            inputMode="numeric"
            autoComplete="one-time-code"
            value={code}
            error={error}
            onChange={(e) => setCode(e.target.value)}
          />
          <div className="form-actions">
            <Button type="submit" variant="primary" disabled={normalizeOtp(code).length < 6} loading={busy} loadingLabel="Проверяем…">
              Войти
            </Button>
            <Button
              onClick={() => {
                setStep("email");
                setCode("");
                setError(null);
              }}
            >
              Другой email
            </Button>
          </div>
        </form>
      )}
      {detail && <p className="isl-caption settings-note">Подробности для разработчика: {detail}</p>}
      <p className="isl-caption settings-note">
        Вход обслуживает Supabase Auth: он хранит ваш email и отправляет письма. Сквозного шифрования нет.
      </p>
    </>
  );
}

function SignedIn({ email }: { email: string }) {
  const { status, signOut } = useMayak();
  const [confirm, setConfirm] = useState(false);
  const [wipe, setWipe] = useState(false);
  const pending = status.pendingCount + status.failedCount + status.conflictCount;
  const sessionLost = status.state === "auth-required" || status.state === "forbidden";

  return (
    <>
      <p className="settings-section__intro">
        Вы вошли как <strong>{email}</strong>. Заметки синхронизируются между устройствами этого аккаунта.
      </p>
      {sessionLost && (
        <Banner tone="warning" role="alert" icon={<Icon name="warning" />}>
          <p>
            {status.lastError?.code === "DEVICE_REVOKED" || status.lastError?.code === "SESSION_REVOKED"
              ? "Доступ этого устройства отозван с другого устройства. Изменения сохранены здесь; войдите снова, чтобы продолжить синхронизацию."
              : "Сессия завершилась. Изменения сохранены на устройстве; войдите снова, чтобы продолжить синхронизацию."}
          </p>
        </Banner>
      )}
      {sessionLost && <SignInForm />}
      <div className="form-actions">
        <Button onClick={() => setConfirm(true)}>Выйти на этом устройстве</Button>
      </div>
      {confirm && (
        <Sheet
          title="Выйти из аккаунта?"
          onClose={() => setConfirm(false)}
          actions={
            <>
              <Button onClick={() => setConfirm(false)}>Отмена</Button>
              <Button
                variant="primary"
                onClick={async () => {
                  setConfirm(false);
                  await signOut({ wipe: wipe && pending === 0 });
                }}
              >
                Выйти
              </Button>
            </>
          }
        >
          {pending > 0 ? (
            <p role="alert">
              {pending} {plural(pending, "изменение ещё не отправлено", "изменения ещё не отправлены", "изменений ещё не отправлено")}.
              Они останутся на этом устройстве и уйдут, когда вы снова войдёте. Чтобы сохранить копию сейчас, скачайте
              архив в разделе «Хранилище и экспорт».
            </p>
          ) : (
            <p>Все изменения отправлены. Выход завершит сессию только на этом устройстве.</p>
          )}
          <Checkbox
            label="Удалить заметки этого аккаунта с устройства"
            checked={wipe}
            disabled={pending > 0}
            onChange={(e) => setWipe(e.target.checked)}
          />
          {pending > 0 && <p className="isl-caption">Удаление недоступно, пока есть неотправленные изменения.</p>}
        </Sheet>
      )}
    </>
  );
}

/** Режим разработчика: локальный сервер, вход по имени без проверки личности. */
function DevSyncForm() {
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
    <div className="dev-sync">
      <Disclosure label="Режим разработчика" defaultOpen={config.mode === "dev"}>
        {config.mode === "dev" && (
          <p>
            Подключено к серверу разработки <code>{config.apiBase}</code> как «{config.account}».
          </p>
        )}
        <Banner tone="warning" icon={<Icon name="warning" />}>
          <p>
            Подключение к локальному серверу Маяка по имени, <strong>без пароля и проверки личности</strong>. Только для
            разработки; не используйте его для личных данных.
          </p>
        </Banner>
        <form
          className="card form-card"
          onSubmit={(e) => {
            e.preventDefault();
            if (valid) apply({ mode: "dev", account, apiBase: apiBase.trim() || DEFAULT_API_BASE });
          }}
        >
          <TextField
            id="dev-account"
            label="Имя аккаунта разработчика"
            autoComplete="off"
            hint="Латиница, цифры, «.», «_», «@», «-». На втором устройстве введите то же имя."
            value={account}
            onChange={(e) => setAccount(e.target.value.trim())}
          />
          <TextField id="dev-api" label="Адрес API" value={apiBase} onChange={(e) => setApiBase(e.target.value)} />
          <div className="form-actions">
            <Button type="submit" variant="primary" disabled={!valid}>
              {config.mode === "dev" ? "Переподключить" : "Подключить"}
            </Button>
            {config.mode === "dev" && <Button onClick={() => apply({ mode: "local" })}>Отключить синхронизацию</Button>}
          </div>
        </form>
      </Disclosure>
      {confirm && (
        <Sheet
          title="Есть неотправленные изменения"
          onClose={() => setConfirm(null)}
          actions={
            <>
              <Button onClick={() => setConfirm(null)}>Отмена</Button>
              <Button
                variant="primary"
                onClick={() => {
                  setSyncConfig(confirm);
                  setConfirm(null);
                }}
              >
                Продолжить
              </Button>
            </>
          }
        >
          <p>
            {pending} {plural(pending, "изменение не отправлено", "изменения не отправлены", "изменений не отправлено")}.
            Они останутся на этом устройстве и уйдут, когда вы снова подключитесь к этому аккаунту.
          </p>
        </Sheet>
      )}
    </div>
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
      <h2 id="storage-title" className="settings-section__title">
        Хранилище и экспорт
      </h2>
      <FormGroup
        label="Хранилище"
        description="JSON-архив сохраняет структуру, теги и идентификаторы. Импорт появится позже."
      >
        <FormRow
          label={`На этом устройстве: ${alive} ${plural(alive, "заметка", "заметки", "заметок")}`}
          hint={
            isNativeApp()
              ? "Заметки хранятся в базе приложения на этом устройстве."
              : persisted === true
              ? "Браузер подтвердил постоянное хранилище."
              : persisted === false
                ? "Браузер не подтвердил постоянное хранилище и может очистить данные сайта при нехватке места. Регулярно делайте экспорт или включите синхронизацию."
                : undefined
          }
        >
          <Button icon={<Icon name="download" />} onClick={exportJson}>
            Скачать все заметки (JSON)
          </Button>
        </FormRow>
      </FormGroup>
    </section>
  );
}
