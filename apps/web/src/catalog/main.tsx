import { StrictMode, useEffect, useLayoutEffect, useState, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import "@mayak/ui/styles.css";
import "./catalog.css";
import {
  Badge,
  Banner,
  Button,
  ButtonLink,
  Checkbox,
  ColorWell,
  Disclosure,
  EmptyState,
  FormGroup,
  FormRow,
  IconButton,
  IconLink,
  MenuButton,
  PopUpButton,
  ProgressBar,
  RadioGroup,
  SearchField,
  SegmentedControl,
  Sheet,
  SidebarItem,
  SidebarPanel,
  SidebarSection,
  Slider,
  Spinner,
  Switch,
  TextArea,
  TextField,
  ToastProvider,
  TokenField,
  ToolbarGroup,
  useToast,
} from "@mayak/ui";
import { Icon } from "../components/Icon.tsx";

/**
 * Каталог компонентов: каждый компонент во всех состояниях из
 * docs/design-system.md, в светлой и тёмной теме. Страница — источник
 * истины для внешнего вида и для автотестов доступности.
 */
type Theme = "light" | "dark";

function Section({ id, title, children, note }: { id: string; title: string; children: ReactNode; note?: ReactNode }) {
  return (
    <section className="cat-section" aria-labelledby={id}>
      <h2 id={id} className="mk-title2">
        {title}
      </h2>
      {note && <p className="mk-caption cat-note">{note}</p>}
      <div className="cat-demo">{children}</div>
    </section>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="cat-row">
      <div className="cat-row__label mk-caption">{label}</div>
      <div className="cat-row__items">{children}</div>
    </div>
  );
}

const COLOR_TOKENS = [
  ["--text-primary", "Основной текст"],
  ["--text-secondary", "Вторичный текст"],
  ["--accent", "Акцент (заливка)"],
  ["--accent-text", "Акцент (текст)"],
  ["--danger-text", "Ошибка"],
  ["--success-text", "Успех"],
  ["--warning-text", "Внимание"],
  ["--bg-window", "Фон окна"],
  ["--bg-content", "Содержимое"],
  ["--bg-sidebar-solid", "Боковая панель"],
  ["--separator", "Разделитель"],
  ["--border-control", "Граница полей"],
] as const;

function luminance(rgb: string): number {
  const [r, g, b] = (rgb.match(/\d+(\.\d+)?/g) ?? ["0", "0", "0"]).slice(0, 3).map((v) => {
    const c = Number(v) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

function ColorTable({ theme }: { theme: Theme }) {
  const [rows, setRows] = useState<Array<{ token: string; name: string; value: string; ratio: string }>>([]);
  useEffect(() => {
    const probe = document.createElement("span");
    document.body.append(probe);
    const resolve = (token: string) => {
      probe.style.color = `var(${token})`;
      return getComputedStyle(probe).color;
    };
    const content = resolve("--bg-content");
    setRows(
      COLOR_TOKENS.map(([token, name]) => {
        const value = resolve(token);
        const a = luminance(value);
        const b = luminance(content);
        return { token, name, value, ratio: ((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)).toFixed(2) };
      }),
    );
    probe.remove();
  }, [theme]);
  return (
    <table className="cat-colors">
      <caption className="mk-visually-hidden">Цветовые токены и контраст с фоном содержимого</caption>
      <thead>
        <tr>
          <th scope="col">Образец</th>
          <th scope="col">Токен</th>
          <th scope="col">Значение</th>
          <th scope="col">Контраст к содержимому</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.token}>
            <td>
              <span className="cat-swatch" style={{ background: `var(${r.token})` }} aria-hidden="true" />
            </td>
            <td>
              {r.name}
              <br />
              <code>{r.token}</code>
            </td>
            <td>
              <code>{r.value}</code>
            </td>
            <td>{r.ratio}:1</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Catalog() {
  const [theme, setTheme] = useState<Theme>("light");
  const [query, setQuery] = useState("");
  const [checks, setChecks] = useState({ a: false, b: true });
  const [radio, setRadio] = useState<"notes" | "tasks" | "files">("notes");
  const [sw, setSw] = useState({ a: true, b: false });
  const [seg, setSeg] = useState<"light" | "dark" | "system">("light");
  const [font, setFont] = useState("system");
  const [weight, setWeight] = useState(400);
  const [size, setSize] = useState(17);
  const [color, setColor] = useState("#1d1d1f");
  const [tokens, setTokens] = useState(["Личное", "Работа"]);
  const [sheet, setSheet] = useState(false);
  const [progress, setProgress] = useState(40);
  const toast = useToast();

  // До эффектов дочерних компонентов: таблица цветов читает значения уже новой темы.
  useLayoutEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  return (
    <div className="cat">
      <header className="cat-header mk-material">
        <div>
          <h1 className="mk-large-title">Маяк · компоненты</h1>
          <p className="mk-secondary">Стиль macOS 27 · Liquid Glass · дизайн-система 2.1</p>
        </div>
        <SegmentedControl
          label="Тема каталога"
          value={theme}
          onChange={setTheme}
          segments={[
            { value: "light", label: "Светлая" },
            { value: "dark", label: "Тёмная" },
          ]}
        />
      </header>

      <main className="cat-main">
        <Section id="type" title="Типографика" note="Шкала текстовых стилей macOS (HIG «Typography»); подписи не мельче 12 px (ТЗ).">
          <p className="mk-large-title">Large Title · 26</p>
          <p className="mk-title1">Title 1 · 22</p>
          <p className="mk-title2">Title 2 · 17</p>
          <p className="mk-title3">Title 3 · 15</p>
          <p className="mk-headline">Headline · 13, полужирный</p>
          <p className="mk-body">Body · 13 — основной текст интерфейса</p>
          <p className="mk-callout">Callout · 12</p>
          <p className="mk-caption">Caption · 12 (в macOS 10 pt)</p>
        </Section>

        <Section id="colors" title="Цвета" note="Акцент и статусы — значения HIG «Increased contrast»; контраст считается по фактическому фону.">
          <ColorTable theme={theme} />
        </Section>

        <Section id="buttons" title="Кнопки">
          <Row label="Варианты">
            <Button variant="primary">Сохранить</Button>
            <Button>Отмена</Button>
            <Button variant="destructive">Удалить</Button>
            <Button variant="plain">Подробнее</Button>
            <Button icon={<Icon name="download" />}>Экспорт…</Button>
          </Row>
          <Row label="Размеры">
            <Button size="small">Маленькая</Button>
            <Button>Обычная</Button>
            <Button size="large" variant="primary">
              Крупная
            </Button>
            <Button size="xlarge" variant="primary">
              Очень крупная
            </Button>
          </Row>
          <Row label="Состояния">
            <Button disabled>Недоступна</Button>
            <Button variant="primary" disabled>
              Недоступна
            </Button>
            <Button variant="primary" loading loadingLabel="Сохраняем…">
              Сохранить
            </Button>
          </Row>
          <Row label="Ссылка-кнопка">
            <ButtonLink href="#buttons" icon={<Icon name="back" />}>
              К списку заметок
            </ButtonLink>
          </Row>
        </Section>

        <Section id="icon-buttons" title="Кнопки панели инструментов" note="Только значок: доступное имя и подсказка при наведении или фокусе.">
          <Row label="Обычные">
            <IconButton label="История" icon={<Icon name="history" />} />
            <IconButton label="Синхронизация" icon={<Icon name="sync" />} />
            <IconButton label="В корзину" icon={<Icon name="trash" />} />
          </Row>
          <Row label="Группа на стекле">
            <ToolbarGroup label="Действия с заметкой">
              <IconButton label="История" icon={<Icon name="history" />} />
              <IconButton label="Синхронизация" icon={<Icon name="sync" />} />
              <IconButton label="В корзину" icon={<Icon name="trash" />} />
            </ToolbarGroup>
          </Row>
          <Row label="Ссылка">
            <ToolbarGroup label="Окно">
              <IconLink label="Настройки" href="#icon-buttons" icon={<Icon name="settings" />} />
            </ToolbarGroup>
          </Row>
          <Row label="Нажата / недоступна">
            <IconButton label="Закрепить" icon={<Icon name="pin" />} pressed />
            <IconButton label="Скачать" icon={<Icon name="download" />} disabled />
          </Row>
          <Row label="Меню действий">
            <MenuButton
              label="Действия с заметкой"
              trigger={<Icon name="menu" />}
              items={[
                { id: "pin", label: "Закрепить", icon: <Icon name="pin" />, onSelect: () => toast({ text: "Закреплено" }) },
                { id: "md", label: "Скачать .md", icon: <Icon name="download" />, shortcut: "⌘S", onSelect: () => toast({ text: "Скачивание" }) },
                { id: "hist", label: "История", icon: <Icon name="history" />, disabled: true, onSelect: () => undefined },
                { id: "sep", type: "separator" },
                { id: "del", label: "В корзину", icon: <Icon name="trash" />, destructive: true, onSelect: () => toast({ text: "В корзине" }) },
              ]}
            />
          </Row>
        </Section>

        <Section id="fields" title="Текстовые поля">
          <div className="cat-grid">
            <TextField label="Email" type="email" placeholder="name@example.com" />
            <TextField label="Код из письма" hint="Шесть цифр из письма Supabase" inputMode="numeric" />
            <TextField label="С ошибкой" defaultValue="000" error="Код неверный или устарел" />
            <TextField label="Недоступно" defaultValue="Только чтение" disabled />
            <TextArea label="Многострочное" placeholder="Запишите мысль…" />
          </div>
          <Row label="Поиск">
            <div style={{ width: 260 }}>
              <SearchField label="Найти заметку" value={query} onChange={setQuery} />
            </div>
          </Row>
          <Row label="Жетоны">
            <TokenField label="Теги" tokens={tokens} onChange={setTokens} placeholder="+ тег" prefix="# " />
          </Row>
        </Section>

        <Section id="toggles" title="Флажки, радиокнопки, переключатели">
          <Row label="Флажки">
            <Checkbox label="Не отмечен" checked={checks.a} onChange={(e) => setChecks({ ...checks, a: e.target.checked })} />
            <Checkbox label="Отмечен" checked={checks.b} onChange={(e) => setChecks({ ...checks, b: e.target.checked })} />
            <Checkbox label="Смешанный" mixed checked={false} onChange={() => undefined} />
            <Checkbox label="Недоступен" disabled />
            <Checkbox label="Задача выполнена" strike defaultChecked />
          </Row>
          <Row label="Радиокнопки">
            <RadioGroup
              label="Раздел по умолчанию"
              value={radio}
              onChange={setRadio}
              orientation="horizontal"
              options={[
                { value: "notes", label: "Заметки" },
                { value: "tasks", label: "Задачи" },
                { value: "files", label: "Файлы", disabled: true },
              ]}
            />
          </Row>
          <Row label="Переключатели">
            <Switch label="Синхронизация" checked={sw.a} onChange={(v) => setSw({ ...sw, a: v })} />
            <Switch label="Мини" size="mini" checked={sw.b} onChange={(v) => setSw({ ...sw, b: v })} />
            <Switch label="Недоступен" checked={false} onChange={() => undefined} disabled />
          </Row>
        </Section>

        <Section id="choice" title="Выбор значения">
          <Row label="Сегменты">
            <SegmentedControl
              label="Тема"
              value={seg}
              onChange={setSeg}
              segments={[
                { value: "light", label: "Светлая" },
                { value: "dark", label: "Тёмная" },
                { value: "system", label: "Как в системе" },
              ]}
            />
          </Row>
          <div className="cat-grid">
            <PopUpButton
              label="Шрифт"
              value={font}
              onChange={setFont}
              options={[
                { value: "system", label: "Системный" },
                { value: "sans", label: "Arial / без засечек" },
                { value: "serif", label: "Georgia / с засечками" },
                { value: "mono", label: "Consolas / моноширинный" },
              ]}
            />
            <PopUpButton
              label="Толщина"
              value={weight}
              onChange={setWeight}
              options={[300, 400, 500, 600, 700].map((w) => ({ value: w, label: String(w) }))}
            />
            <PopUpButton label="Недоступна" value="a" onChange={() => undefined} options={[{ value: "a", label: "Единственный" }]} disabled />
            <Slider label="Размер текста" value={size} onChange={setSize} min={14} max={24} format={(v) => `${v} px`} />
            <Slider label="Недоступен" value={16} onChange={() => undefined} min={14} max={24} disabled />
            <ColorWell label="Цвет текста" value={color} onChange={setColor} />
          </div>
        </Section>

        <Section id="feedback" title="Сообщения и индикаторы">
          <div className="cat-stack">
            <Banner tone="info" icon={<Icon name="sync" />} role="status">
              Синхронизация · 2 изменения
            </Banner>
            <Banner tone="warning" icon={<Icon name="warning" />} actions={<Button variant="primary">Сравнить</Button>}>
              Найдены изменения с другого устройства.
            </Banner>
            <Banner tone="danger" icon={<Icon name="warning" />} actions={<Button>Повторить</Button>}>
              Не удалось сохранить на устройстве.
            </Banner>
          </div>
          <Row label="Значки">
            <Badge>Не отправлено</Badge>
            <Badge tone="info">Отправляется</Badge>
            <Badge tone="success">В облаке</Badge>
            <Badge tone="warning">Конфликт версий</Badge>
            <Badge tone="danger">Ошибка отправки</Badge>
          </Row>
          <Row label="Индикаторы">
            <Spinner label="Загрузка" />
            <div style={{ width: 200 }}>
              <ProgressBar label="Загрузка файла" value={progress} />
            </div>
            <Button size="small" onClick={() => setProgress((p) => (p >= 100 ? 0 : p + 20))}>
              +20%
            </Button>
            <div style={{ width: 160 }}>
              <ProgressBar label="Подготовка" value={null} />
            </div>
          </Row>
          <Row label="Уведомление и лист">
            <Button onClick={() => toast({ text: "Заметка перемещена в корзину", action: { label: "Отменить", run: () => undefined } })}>
              Показать уведомление
            </Button>
            <Button onClick={() => setSheet(true)}>Открыть лист…</Button>
          </Row>
        </Section>

        <Section id="layout" title="Группы, боковая панель, раскрытие">
          <div className="cat-grid cat-grid--wide">
            <FormGroup title="Внешний вид" description="Выбор сохраняется на этом устройстве.">
              <FormRow label="Тема">
                <SegmentedControl
                  label="Тема"
                  size="small"
                  value={seg}
                  onChange={setSeg}
                  segments={[
                    { value: "light", label: "Светлая" },
                    { value: "dark", label: "Тёмная" },
                    { value: "system", label: "Авто" },
                  ]}
                />
              </FormRow>
              <FormRow label="Цвет из темы" hint="Иначе — собственный цвет">
                <Switch size="mini" checked={sw.a} onChange={(v) => setSw({ ...sw, a: v })} label={<span className="mk-visually-hidden">Цвет из темы</span>} />
              </FormRow>
            </FormGroup>
            <SidebarPanel className="cat-sidebar" aria-label="Боковая панель">
              <SidebarSection label="Разделы">
                <SidebarItem href="#" icon={<Icon name="notes" />} label="Заметки" count={6} selected onClick={(e) => e.preventDefault()} />
                <SidebarItem href="#" icon={<Icon name="tasks" />} label="Задачи" count={3} onClick={(e) => e.preventDefault()} />
                <SidebarItem href="#" icon={<Icon name="files" />} label="Файлы" onClick={(e) => e.preventDefault()} />
              </SidebarSection>
              <SidebarSection title="Теги" label="Теги">
                <SidebarItem href="#" icon={<Icon name="tag" />} label="Личное" onClick={(e) => e.preventDefault()} />
              </SidebarSection>
            </SidebarPanel>
          </div>
          <Disclosure label="Режим разработчика">
            <p className="mk-secondary">Содержимое раскрывающегося блока.</p>
          </Disclosure>
          <EmptyState title="Запишите первую мысль" icon={<Icon name="notes" />} action={<Button variant="primary">Создать заметку</Button>}>
            Заметка сохранится на этом устройстве даже без интернета.
          </EmptyState>
        </Section>
      </main>

      {sheet && (
        <Sheet
          title="Выйти из аккаунта?"
          onClose={() => setSheet(false)}
          initialFocus="[data-default]"
          actions={
            <>
              <Button onClick={() => setSheet(false)}>Отмена</Button>
              <Button variant="primary" data-default onClick={() => setSheet(false)}>
                Выйти
              </Button>
            </>
          }
        >
          <p>Все изменения отправлены. Выход завершит сессию только на этом устройстве.</p>
          <Checkbox label="Удалить заметки этого аккаунта с устройства" />
        </Sheet>
      )}
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ToastProvider>
      <Catalog />
    </ToastProvider>
  </StrictMode>,
);
