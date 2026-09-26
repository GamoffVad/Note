# Развёртывание на Vercel

Один проект Vercel в корне репозитория: только API синхронизации и страница-заглушка.
Интерфейс «Маяка» на Vercel не публикуется — он встроен в приложения
(см. [desktop.md](desktop.md)); Vercel и Supabase хранят и отдают только
общую базу заметок.

| Что | Где | Как собирается |
|---|---|---|
| Страница-заглушка | `server-site/index.html` | без сборки; объясняет, что здесь только API |
| API `/api/v1/*` | `api/mayak.ts` | `vercel.json` перезаписывает `/api/v1/:path*` на функцию; Vercel передаёт остаток пути параметром `path` |
| Общие пакеты | `packages/*/dist` | `npm run build:api` (tsc) — до трассировки функции |

Формат функции — `export default { fetch(request) }` из [документации Vercel Functions](https://vercel.com/docs/functions/functions-api-reference). Пакеты монорепозитория экспортируют исходники `.ts` по условию `source` (разработка, тесты) и скомпилированный `dist/*.js` по умолчанию (Node на Vercel).

Сборка проверена локально официальным CLI (`vercel build`, версия 60.1.3): собранная функция отвечает 503 без настроек, 401 без токена, а с токеном регистрирует устройство, принимает заметку и отдаёт историю.

## Поведение без настроек

Пока не заданы `DATABASE_URL` и `SUPABASE_URL`, API отвечает `503 SERVICE_UNAVAILABLE` («Синхронизация на сервере ещё не настроена»), а приложения работают только на устройстве. `MAYAK_AUTH=dev` на Vercel запрещён в любом окружении.

## Переменные окружения проекта

Значения и порядок получения — docs/supabase-setup.md.

| Переменная | Окружения | Тип |
|---|---|---|
| `SUPABASE_URL` | Production, Preview | plain |
| `DATABASE_URL` (transaction pooler, 6543) | Production, Preview | sensitive |
| `DATABASE_CA_CERT` (необязательно) | Production, Preview | sensitive; для адресов Supabase встроен корневой сертификат Supabase |
| `SUPABASE_PUBLISHABLE_KEY` | Production, Preview | plain; проверка токенов проектов со старой подписью HS256 через Supabase Auth |
| `DATABASE_POOL_MAX` = `1` | Production, Preview | plain |
| `MAYAK_CORS_ORIGINS` (необязательно) | Production, Preview | plain; источники сверх `tauri://localhost` и `http(s)://tauri.localhost` |

Для Preview лучше отдельный проект Supabase (ТЗ, раздел 9: staging и production раздельно). Параметры `VITE_*` для приложений задаются не здесь, а при их сборке (docs/desktop.md).

## Защита развёртываний

Приложения обращаются к API напрямую, поэтому Vercel Authentication не должна
закрывать адрес API: либо отключите её для production, либо подключите свой
домен (режим `all_except_custom_domains` его не закрывает). Сам API пускает
только запросы с токеном Supabase.

Миграции выполняются не при деплое, а отдельно: `MIGRATION_DATABASE_URL=… npm run db:migrate`.

## Регион функций

По умолчанию Vercel размещает функции в своём регионе по умолчанию. Функцию стоит держать рядом с базой Supabase: когда регион базы выбран, добавьте в `vercel.json` `"regions": ["<ближайший регион Vercel>"]` ([настройка регионов](https://vercel.com/docs/functions/configuring-functions/region)).

## Текущее развёртывание (26.09.2026)

- Проект Vercel `mayak` (`prj_XD1vamgZ6dKxjAmd3W1GG3b7zLyE`), связан с репозиторием `gamoffvad/note`.
- Развёртывание `dpl_9tPgccUhc1DND3ZwVn1ujiu4CtoD` из ветки `claude/new-session-kow5h4`, коммит `104ae9d`, статус READY, регион функций `iad1`. Vercel назначил ему цель production.
- Адреса: `mayak-pied-theta.vercel.app`, `mayak-gamoffvads-projects.vercel.app`, `mayak-git-claude-new-session-kow5h4-gamoffvads-projects.vercel.app`.
- Защита: Vercel Authentication, режим `all_except_custom_domains`.
- Переменные окружения ещё не заданы: API отвечает 503.
- С коммита, где `vercel.json` собирает только API, веб-клиент на Vercel больше не публикуется.
- Из среды разработки опубликованные адреса открыть не удалось (сетевая политика и область доступа подключения Vercel). Проверка в браузере: страница открывается, `/api/v1/bootstrap` отвечает 503 «Синхронизация на сервере ещё не настроена».
