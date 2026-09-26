# План для Claude: подключить Supabase (выполняется в сессии с коннектором Supabase)

Владелец создал проект Supabase и подключил коннектор Supabase. Задача —
довести синхронизацию до рабочего состояния без участия владельца.
Секреты (пароли) не выводить в чат и не коммитить.

## 1. Проект

- Коннектор Supabase: список проектов → проект «Маяка» (если их несколько —
  спросить владельца, какой). Записать `ref`, регион, Project URL и
  publishable key (`sb_publishable_…`; если publishable нет — anon key).

## 2. Таблицы

- Применить по порядку `packages/server/migrations/0001_init.sql`,
  `0002_private_schema.sql`, `0003_sessions.sql` (apply_migration /
  execute_sql). Логика — как в `packages/server/src/migrate.ts`: схема
  `mayak`, затем запись версий в `mayak.schema_migrations`
  (`0001_init`, `0002_private_schema`, `0003_sessions`), чтобы
  `npm run db:migrate` в будущем не применял их повторно.
- Проверка: `select has_table_privilege('anon', 'mayak.notes', 'select')` → `false`;
  схема `mayak` не в Exposed schemas Data API.

## 3. Роль сервера

- Сгенерировать случайный пароль (32+ символа, только [A-Za-z0-9]) в среде
  выполнения, не показывая его в чате.
- `create role mayak_api login password '<пароль>' noinherit;`
  права: `usage` на схему `mayak`, `select, insert, update, delete` на все
  таблицы и `usage, select` на последовательности схемы `mayak`, плюс
  `alter default privileges` на будущие таблицы. Суперправа и владение
  таблицами не давать.
- Строка подключения через transaction pooler (порт 6543):
  `postgresql://mayak_api.<ref>:<пароль>@<pooler-host>:6543/postgres`.
  `<pooler-host>` взять из данных проекта (region → `aws-0-<region>.pooler.supabase.com`
  или `aws-1-…`; проверить по ответу API/журналам Vercel после развёртывания).

## 4. Vercel (проект `mayak`, `prj_XD1vamgZ6dKxjAmd3W1GG3b7zLyE`)

Переменные для Production и Preview:

| Key | Value | Тип |
| --- | --- | --- |
| `SUPABASE_URL` | Project URL | plain |
| `SUPABASE_PUBLISHABLE_KEY` | publishable key | plain |
| `DATABASE_URL` | строка из шага 3 | sensitive |
| `DATABASE_POOL_MAX` | `1` | plain |

`DATABASE_CA_CERT` не нужен: для адресов Supabase сервер использует
встроенный корневой сертификат (`packages/server/src/supabase-ca.ts`).
Затем новое production-развёртывание из `main` и проверка журналов
(get_runtime_logs): запрос без токена к `/api/v1/bootstrap` должен давать
401 `UNAUTHORIZED`, а не 503/500. Из среды Claude адреса `*.vercel.app` могут
быть закрыты сетевой политикой — тогда проверять по журналам Vercel.

## 5. Приложение

- Записать `supabaseUrl` и `supabasePublishableKey` в
  `apps/desktop/mayak.config.json` (публичные значения).
- Прогнать проверки (typecheck, vitest, Playwright, `cargo test`),
  закоммитить, влить в `main` через pull request (с разрешения владельца),
  дождаться сборки «Настольное приложение» в GitHub Actions и дать владельцу
  ссылку на установщики.

## 6. Что остаётся владельцу

- Строка `{{ .Token }}` в шаблоне письма Magic link (docs/owner-setup.md, п. 2),
  если коннектор не умеет менять шаблоны.
- Site URL в Authentication → URL Configuration можно оставить по умолчанию:
  приложение входит по коду, ссылка из письма не используется.
