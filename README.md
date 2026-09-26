# Маяк

Личное приложение для заметок, задач и файлов между своими устройствами: Windows, macOS, Linux, Android, iOS и браузер. Интерфейс и диктовка только на русском.

Дизайн-пакет и техническое задание лежат в [`design/`](design/README.md): ТЗ — [`design/SPECIFICATION.md`](design/SPECIFICATION.md), дизайн-система «01 / Тихая ясность» — [`design/DESIGN-SYSTEM.md`](design/DESIGN-SYSTEM.md).

## Состояние

Идёт **этап 1 ТЗ — технический прототип**. Готового приложения пока нет.

Сделано:

- доменная модель заметки из блоков со стабильными UUID, задачи как проекция блоков, экспорт и импорт Markdown;
- локальное хранилище с атомарными транзакциями: в памяти и на IndexedDB;
- клиентский движок синхронизации: outbox, идемпотентные повторы, pull по курсору, явные конфликты, полная ресинхронизация после 410;
- сервер API `/api/v1` на PostgreSQL: bootstrap, push, pull, история, восстановление версии, устройства и их отзыв;
- 53 автоматических теста, в том числе сквозные на настоящем PostgreSQL.

Не сделано: интерфейс, файлы и передача копий, диктовка, настройки оформления, настоящая авторизация (Supabase), SQLite и Tauri, развёртывание на Vercel. Постатейно — в [`docs/acceptance.md`](docs/acceptance.md).

## Структура

```text
packages/domain       типы, схемы (zod), лимиты, протокол, Markdown, задачи
packages/local-store  LocalStore: память, IndexedDB
packages/sync         SyncEngine, HttpTransport, планировщик, тексты статусов
packages/server       SyncService, HTTP-обработчик (Fetch API), миграции SQL
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
DATABASE_URL=postgres://…/mayak_dev MAYAK_DEV_AUTH=1 npm run dev:api
```

Пример запроса к локальному API:

```bash
curl -H 'authorization: Bearer dev:me' -H 'x-mayak-device: <uuid>' http://localhost:8787/api/v1/bootstrap
```

Устройство сначала регистрируется: `POST /api/v1/devices` с телом `{"id":"<uuid>","name":"Ноутбук","platform":"linux"}`.

`dev:` — вход только для разработки, без проверки личности, в production запрещён.

## Документы

- [ADR 0001 · Хранение](docs/adr/0001-storage.md)
- [ADR 0002 · Синхронизация](docs/adr/0002-sync.md)
- [ADR 0003 · Редактор](docs/adr/0003-editor.md) — предложено, требует проверки IME
- [Формат Markdown](docs/markdown-format.md)
- [Приёмочные сценарии](docs/acceptance.md)

## Безопасность

Сквозного шифрования нет: данные защищены TLS в передаче и средствами провайдеров. Провайдеры инфраструктуры могут иметь доступ к содержимому.
