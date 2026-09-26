# Настольное приложение «Маяк» (Tauri 2)

Приложение для Windows, macOS и Linux. Интерфейс — тот же код, что в
`apps/web`, собранный в режиме `desktop` и встроенный в программу; окно
показывает его системным движком (WebView2 в Windows, WKWebView в macOS,
WebKitGTK в Linux). Сервер на Vercel хранит только общую базу заметок
(Supabase Postgres) и API синхронизации; интерфейс с Vercel не загружается.

## Как устроено

| Что | Где хранится |
| --- | --- |
| Заметки, очередь отправки, конфликты | SQLite на устройстве: `mayak.sqlite3` в каталоге данных приложения (WAL, `synchronous = full`) |
| Ключ шифрования сессии входа | Системное хранилище секретов: Связка ключей macOS, Диспетчер учётных данных Windows, Secret Service в Linux |
| Сессия входа Supabase | Хранилище окна, зашифрованное AES-GCM этим ключом |
| Настройки оформления, режим синхронизации | Хранилище окна |

Каталог данных приложения (`identifier` = `io.github.gamoffvad.mayak`):
Linux — `~/.local/share/io.github.gamoffvad.mayak`, macOS —
`~/Library/Application Support/io.github.gamoffvad.mayak`, Windows —
`%APPDATA%\io.github.gamoffvad.mayak`.

Почему в хранилище секретов лежит только ключ, а не сама сессия: в Windows
секрет в Диспетчере учётных данных не больше 5×512 = 2560 байт
([CREDENTIALW, Microsoft](https://github.com/MicrosoftDocs/sdk-api/blob/docs/sdk-api-src/content/wincred/ns-wincred-credentialw.md)),
а сессия Supabase с токенами и профилем может быть больше.

Если хранилище секретов недоступно (например, Linux без Secret Service),
сессия хранится так же, как в браузере, — без шифрования.

Код:

- `apps/desktop/src-tauri/src/store.rs` — SQLite, команды `kv_get`, `kv_all`, `kv_commit`, `kv_drop`;
- `apps/desktop/src-tauri/src/secrets.rs` — ключ сессии, команда `session_key`;
- `packages/local-store/src/kv.ts` — `KvLocalStore`: транзакции движка синхронизации поверх команд;
- `apps/web/src/state/native.ts` — определение приложения, SQLite, шифрование сессии.

Вход в приложении — по коду из письма (ссылка из письма открывается в
браузере, а не в приложении).

## Сборка на своём компьютере

Нужны Node.js 22+, Rust (stable) и системные компоненты из
[документации Tauri](https://v2.tauri.app/start/prerequisites/):
Windows — Microsoft C++ Build Tools и WebView2 (есть в Windows 10/11);
macOS — Xcode или Command Line Tools; Linux — `libwebkit2gtk-4.1-dev`,
`build-essential`, `libssl-dev`, `libayatana-appindicator3-dev`, `librsvg2-dev`.

```sh
npm ci
# адрес API и проекта Supabase — те же, что для синхронизации
export VITE_API_BASE=https://<проект>.vercel.app/api/v1
export VITE_SUPABASE_URL=https://<ref>.supabase.co
export VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
npm run build -w @mayak/desktop      # установщики в apps/desktop/src-tauri/target/release/bundle
npm run dev -w @mayak/desktop        # режим разработки с горячей перезагрузкой
```

Без `VITE_API_BASE` приложение работает только на устройстве.

## Сборка в GitHub Actions

`.github/workflows/desktop.yml` собирает установщики для Windows (`.msi`,
`.exe`), macOS (`.dmg`, `.app`; Apple Silicon и Intel) и Linux (`.deb`,
`.rpm`, `.AppImage`) с помощью
[tauri-action](https://github.com/tauri-apps/tauri-action). Установщики
лежат в артефактах запуска (вкладка **Actions**); тег `desktop-v*` создаёт
черновик релиза с ними.

Параметры сборки задаются в **Settings → Secrets and variables → Actions →
Variables** репозитория: `MAYAK_API_BASE`, `MAYAK_SUPABASE_URL`,
`MAYAK_SUPABASE_PUBLISHABLE_KEY` (публикуемый ключ Supabase можно встраивать
в клиент; секретный — никогда).

## Подпись

Сборки пока не подписаны. Windows SmartScreen и macOS Gatekeeper покажут
предупреждение при первом запуске. Для подписи нужны учётные записи
разработчика: Apple Developer Program (подпись и нотаризация для macOS) и
сертификат подписи кода для Windows — их данные добавляются в секреты
репозитория, в код они не попадают.

## Проверки

- `cargo test` в `apps/desktop/src-tauri` — SQLite (атомарность, изоляция пространств, повторное открытие) и ключ сессии;
- `npx vitest run` — `KvLocalStore` проходит те же тесты, что IndexedDB и память; шифрование сессии;
- `apps/desktop/e2e/smoke.mjs` — настоящее окно через WebDriver
  ([tauri-driver](https://v2.tauri.app/develop/tests/webdriver/)): заметка
  переживает перезапуск и лежит в SQLite.

## Сервер и CORS

Страницы приложения открываются с `tauri://localhost` (macOS, Linux) и
`http://tauri.localhost` (Windows). API разрешает эти источники
(`packages/server/src/cors.ts`); дополнительные — переменной
`MAYAK_CORS_ORIGINS`. Авторизация — заголовком `Authorization`, cookies не
используются.
