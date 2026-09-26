# Маяк

Личное приложение для заметок, задач и файлов между своими устройствами: Windows, macOS, Linux, Android, iOS и браузер. Интерфейс и диктовка только на русском.

Дизайн-пакет и техническое задание лежат в [`design/`](design/README.md): ТЗ — [`design/SPECIFICATION.md`](design/SPECIFICATION.md), дизайн-система «01 / Тихая ясность» — [`design/DESIGN-SYSTEM.md`](design/DESIGN-SYSTEM.md).

## Состояние

Идёт **этап 1 ТЗ — технический прототип** и первая версия веб-клиента. Готового приложения пока нет.

Сделано:

- доменная модель заметки из блоков со стабильными UUID, задачи как проекция блоков, экспорт и импорт Markdown;
- локальное хранилище с атомарными транзакциями: в памяти и на IndexedDB;
- клиентский движок синхронизации: outbox, идемпотентные повторы, pull по курсору, явные конфликты, полная ресинхронизация после 410;
- сервер API `/api/v1` на PostgreSQL: bootstrap, push, pull, история, восстановление версии, устройства и их отзыв;
- веб-клиент `apps/web` по макету 01 «Тихая ясность»: заметки и редактор блоков, задачи, корзина, история версий, конфликты, устройства, настройки внешнего вида, светлая и тёмная темы, раскладки для компьютера, планшета и телефона;
- вход через Supabase Auth по email (код из письма или ссылка): сервер проверяет токены по JWKS проекта, отзыв устройства закрывает и его сессию; таблицы в закрытой схеме `mayak`, не видимой Data API Supabase — [ADR 0004](docs/adr/0004-auth.md), [инструкция по настройке](docs/supabase-setup.md);
- 80 модульных тестов (в том числе сквозные на PostgreSQL) и 23 браузерных теста Playwright, включая синхронизацию двух браузеров, вход через имитацию Supabase Auth и проверку доступности axe.

- развёртывание на Vercel: веб-клиент и функция API в одном проекте — [docs/deploy-vercel.md](docs/deploy-vercel.md);

Не сделано: создание проекта Supabase и проверка на живом проекте (нужен аккаунт владельца), файлы и передача копий, диктовка (кнопка честно сообщает о недоступности), SQLite и Tauri, импорт. Постатейно — в [`docs/acceptance.md`](docs/acceptance.md).

## Структура

```text
packages/domain       типы, схемы (zod), лимиты, протокол, Markdown, задачи
packages/local-store  LocalStore: память, IndexedDB
packages/sync         SyncEngine, HttpTransport, планировщик, тексты статусов
packages/server       SyncService, HTTP-обработчик (Fetch API), миграции SQL
apps/web              веб-клиент: React + Vite, IndexedDB, тесты Playwright
docs/adr              решения: хранение, синхронизация, редактор
design/               утверждённый дизайн-пакет и ТЗ
```

## Запуск

Нужны Node.js 22+ и PostgreSQL 13+ (проверялось на PostgreSQL 16).

```bash
npm install
cp .env.example .env            # и поправьте адреса баз
createdb mayak_dev && createdb mayak_test

npm run typecheck
TEST_DATABASE_URL=postgres://…/mayak_test npm test   # без TEST_DATABASE_URL серверные тесты пропускаются

DATABASE_URL=postgres://…/mayak_dev npm run db:migrate
DATABASE_URL=postgres://…/mayak_dev MAYAK_AUTH=dev MAYAK_DEV_AUTH=1 npm run dev:api
```

Пример запроса к локальному API:

```bash
curl -H 'authorization: Bearer dev:me' -H 'x-mayak-device: <uuid>' http://localhost:8787/api/v1/bootstrap
```

Устройство сначала регистрируется: `POST /api/v1/devices` с телом `{"id":"<uuid>","name":"Ноутбук","platform":"linux"}`.

`dev:` — вход только для разработки (`MAYAK_AUTH=dev MAYAK_DEV_AUTH=1`), без проверки личности, в production запрещён. С Supabase: `MAYAK_AUTH=supabase SUPABASE_URL=…` — см. [docs/supabase-setup.md](docs/supabase-setup.md).

### Веб-клиент

```bash
npm run dev:web                 # http://localhost:5173, запросы /api проксируются на :8787
npm run build:web               # сборка в apps/web/dist со строгой CSP
```

Без сервера клиент работает только на устройстве: заметки хранятся в IndexedDB браузера. С заданными `VITE_SUPABASE_URL` и `VITE_SUPABASE_PUBLISHABLE_KEY` в «Настройки → Аккаунт и синхронизация» появляется вход по email. Для проверки без Supabase: сборка с `VITE_DEV_SYNC=1`, `npm run dev:api` в режиме dev и подключение под одним именем в двух браузерах.

Браузерные тесты (Chromium уже должен быть установлен для Playwright):

```bash
npm run e2e                                                   # без синхронизации
MAYAK_E2E_DATABASE_URL=postgres://…/mayak_e2e_test npm run e2e  # плюс синхронизация и вход через имитацию Supabase Auth
```

## Документы

- [ADR 0001 · Хранение](docs/adr/0001-storage.md)
- [ADR 0002 · Синхронизация](docs/adr/0002-sync.md)
- [ADR 0003 · Редактор](docs/adr/0003-editor.md) — реализовано, требует проверки IME
- [ADR 0004 · Вход и сессии через Supabase Auth](docs/adr/0004-auth.md)
- [Подключение Supabase](docs/supabase-setup.md)
- [Развёртывание на Vercel](docs/deploy-vercel.md)
- [Формат Markdown](docs/markdown-format.md)
- [Приёмочные сценарии](docs/acceptance.md)

## Безопасность

Сквозного шифрования нет: данные защищены TLS в передаче и средствами провайдеров. Провайдеры инфраструктуры могут иметь доступ к содержимому.
