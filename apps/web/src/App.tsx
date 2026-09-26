import { useEffect, useMemo, useRef, useState } from "react";
import { projectTasks } from "@mayak/domain";
import { ButtonLink, EmptyState, IconButton, IconLink, SidebarItem, SidebarPanel, SidebarSection, ToolbarGroup } from "@mayak/ui";
import { BrandMark, Icon, type IconName } from "./components/Icon.tsx";
import { SyncFooter } from "./components/SyncIndicator.tsx";
import { useMayak } from "./state/MayakContext.tsx";
import { formatTime, noteTitle } from "./state/format.ts";
import { navigate, routeHref, useRoute, type Route, type Section } from "./state/router.ts";
import { DevicesScreen } from "./screens/DevicesScreen.tsx";
import { FilesScreen } from "./screens/FilesScreen.tsx";
import { NoteEditor } from "./screens/NoteEditor.tsx";
import { NotesList, sortNotes, useCreateNote } from "./screens/NotesList.tsx";
import { SettingsScreen } from "./screens/SettingsScreen.tsx";
import { TasksScreen } from "./screens/TasksScreen.tsx";
import { TrashScreen } from "./screens/TrashScreen.tsx";

const MAIN_SECTIONS: Array<{ section: Section; label: string; icon: IconName }> = [
  { section: "notes", label: "Заметки", icon: "notes" },
  { section: "tasks", label: "Задачи", icon: "tasks" },
  { section: "files", label: "Файлы", icon: "files" },
  { section: "devices", label: "Устройства", icon: "devices" },
];

const SECTION_TITLE: Record<Section, string> = {
  notes: "Заметки",
  tasks: "Задачи",
  files: "Файлы",
  devices: "Устройства",
  trash: "Корзина",
  settings: "Настройки",
};

/** Телефон — до 700 px: отдельные экраны списка и заметки, нижняя навигация. */
const wideScreen = typeof matchMedia === "function" ? matchMedia("(min-width: 701px)") : null;

export function App() {
  const route = useRoute();
  const { notes, outbox, conflicts, workspace } = useMayak();
  const [query, setQuery] = useState("");
  const [drawer, setDrawer] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const create = useCreateNote();
  const selected = route.noteId ? notes.find((n) => n.id === route.noteId) : undefined;

  // На широком экране без выбранной заметки открываем последнюю, как в макете.
  useEffect(() => {
    if (route.section !== "notes" || route.noteId || !wideScreen?.matches) return;
    const first = sortNotes(notes.filter((n) => !n.deleted && (!route.tag || n.document.tags.includes(route.tag))))[0];
    if (first) navigate({ section: "notes", noteId: first.id, tag: route.tag }, { replace: true });
  }, [route, notes]);

  useEffect(() => setDrawer(false), [route.section, route.noteId, route.tag]);

  useEffect(() => {
    document.title = selected ? `${noteTitle(selected.document)} — Маяк` : `${SECTION_TITLE[route.section]} — Маяк`;
  }, [selected, route.section]);

  // Сочетания клавиш: Ctrl/Cmd+K — поиск, Ctrl/Cmd+Alt+N — новая заметка, Esc — закрыть меню.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const mod = event.ctrlKey || event.metaKey;
      if (mod && !event.altKey && event.key.toLowerCase() === "k") {
        event.preventDefault();
        if (route.section !== "notes" || (route.noteId && !wideScreen?.matches)) navigate({ section: "notes", tag: route.tag });
        requestAnimationFrame(() => searchRef.current?.focus());
      } else if (mod && event.altKey && event.code === "KeyN") {
        event.preventDefault();
        void create();
      } else if (event.key === "Escape" && drawer) {
        setDrawer(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [route, drawer, create]);

  const wide = route.section !== "notes";
  const showEditor = wide || route.noteId !== null;

  let content;
  if (route.section === "tasks") content = <TasksScreen />;
  else if (route.section === "files") content = <FilesScreen />;
  else if (route.section === "devices") content = <DevicesScreen />;
  else if (route.section === "trash") content = <TrashScreen />;
  else if (route.section === "settings") content = <SettingsScreen />;
  else if (selected)
    content = <NoteEditor key={selected.id} note={selected} outbox={outbox.get(selected.id)} conflict={conflicts.get(selected.id)} />;
  else if (route.noteId)
    content = (
      <div className="page page--center">
        <EmptyState
          as="h1"
          title="Заметка не найдена"
          icon={<Icon name="notes" />}
          action={<ButtonLink href={routeHref({ section: "notes" })}>К списку заметок</ButtonLink>}
        >
          Возможно, она была удалена окончательно или принадлежит другому аккаунту.
        </EmptyState>
      </div>
    );
  else
    content = (
      <div className="page page--center">
        <EmptyState as="h1" title="Начните здесь" icon={<BrandMark />}>
          Продолжите на любом устройстве. Выберите заметку в списке или создайте новую.
        </EmptyState>
      </div>
    );

  const modeLabel =
    workspace.config.mode === "dev"
      ? `Сервер разработки · ${workspace.config.account}`
      : workspace.config.mode === "account"
        ? workspace.config.email
        : "Только это устройство";

  return (
    <div className={`app${wide ? " view-wide" : ""}${showEditor ? " show-editor" : " show-list"}${drawer ? " drawer-open" : ""}`}>
      <a className="skip-link" href="#main">
        Перейти к содержимому
      </a>
      <header className="titlebar">
        <IconButton
          className="menu-button"
          label="Меню разделов"
          icon={<Icon name="menu" />}
          aria-expanded={drawer}
          aria-controls="sidebar"
          onClick={() => setDrawer((v) => !v)}
        />
        <a className="brand" href={routeHref({ section: "notes" })} aria-label="Маяк — все заметки">
          <BrandMark />
          <span aria-hidden="true">маяк</span>
        </a>
        <div className="titlebar__meta">
          <span className="mode-label">{modeLabel}</span>
          <ToolbarGroup label="Окно">
            <IconLink
              label="Настройки"
              icon={<Icon name="settings" />}
              href={routeHref({ section: "settings" })}
              aria-current={route.section === "settings" ? "page" : undefined}
            />
          </ToolbarGroup>
        </div>
      </header>

      <Sidebar route={route} />
      {drawer && <button type="button" className="drawer-backdrop" aria-label="Закрыть меню" onClick={() => setDrawer(false)} />}

      {route.section === "notes" && (
        <NotesList ref={searchRef} selectedId={route.noteId} tag={route.tag} query={query} onQuery={setQuery} />
      )}
      <main id="main" className="editor" tabIndex={-1}>
        {content}
      </main>

      <footer className="footer">
        <SyncFooter />
        <span className="footer-note">
          {workspace.config.mode === "dev"
            ? "Вход разработчика без проверки личности"
            : workspace.config.mode === "account"
              ? "Синхронизация через ваш аккаунт"
              : "Данные не покидают это устройство"}
        </span>
      </footer>

      <nav className="bottom-nav mk-glass" aria-label="Основные разделы">
        {MAIN_SECTIONS.map((item) => (
          <a
            key={item.section}
            href={routeHref({ section: item.section })}
            className={`nav${route.section === item.section ? " active" : ""}`}
            aria-current={route.section === item.section ? "page" : undefined}
          >
            <Icon name={item.icon} />
            <span>{item.label}</span>
          </a>
        ))}
      </nav>
    </div>
  );
}

function Sidebar({ route }: { route: Route }) {
  const { notes, status, workspace } = useMayak();
  const alive = useMemo(() => notes.filter((n) => !n.deleted), [notes]);
  const openTasks = useMemo(() => projectTasks(alive).filter((t) => !t.checked).length, [alive]);
  const tags = useMemo(() => [...new Set(alive.flatMap((n) => n.document.tags))].sort((a, b) => a.localeCompare(b, "ru")), [alive]);
  const trashCount = notes.length - alive.length;
  const counts: Partial<Record<Section, number>> = { notes: alive.length, tasks: openTasks };
  const connected = workspace.transport !== null;

  return (
    <SidebarPanel className="sidebar" id="sidebar" aria-label="Навигация">
      <div className="workspace">
        <span className="mk-headline">Моё пространство</span>
        <span className="mk-caption">Заметки всегда с вами</span>
      </div>
      <SidebarSection label="Основная навигация">
        {MAIN_SECTIONS.map((item) => (
          <SidebarItem
            key={item.section}
            href={routeHref({ section: item.section })}
            icon={<Icon name={item.icon} />}
            label={item.label}
            count={counts[item.section]}
            selected={route.section === item.section && !(item.section === "notes" && route.tag)}
          />
        ))}
      </SidebarSection>
      {tags.length > 0 && (
        <SidebarSection title="Теги" label="Теги">
          {tags.map((tag) => (
            <SidebarItem
              key={tag}
              href={routeHref({ section: "notes", tag })}
              icon={<Icon name="tag" />}
              label={tag}
              selected={route.tag === tag}
            />
          ))}
        </SidebarSection>
      )}
      <div className="sidebar__spacer" />
      <SidebarSection label="Дополнительно">
        <SidebarItem
          href={routeHref({ section: "trash" })}
          icon={<Icon name="trash" />}
          label="Корзина"
          count={trashCount > 0 ? trashCount : undefined}
          selected={route.section === "trash"}
        />
        <SidebarItem
          href={routeHref({ section: "settings" })}
          icon={<Icon name="settings" />}
          label="Настройки"
          selected={route.section === "settings"}
        />
      </SidebarSection>
      <div className="sync-card">
        {connected ? (
          <>
            <strong>На одной волне</strong>
            <p>
              {status.lastSyncedAt ? `Последний обмен — ${formatTime(status.lastSyncedAt)}` : "Обмена ещё не было"}
              <br />
              {status.pendingCount > 0 ? `Ждут отправки: ${status.pendingCount}` : "Очередь пуста"}
            </p>
          </>
        ) : (
          <>
            <strong>Только это устройство</strong>
            <p>Синхронизация не настроена</p>
            <ButtonLink size="small" href={routeHref({ section: "settings" })}>
              Настроить
            </ButtonLink>
          </>
        )}
      </div>
    </SidebarPanel>
  );
}
