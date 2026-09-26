# Подключение Supabase

Инструкция для владельца. Все шаги выполняются в панели Supabase вашего аккаунта; код Маяка готов (ADR 0004). Источники — официальная документация Supabase (исходники в репозитории [supabase/supabase](https://github.com/supabase/supabase/blob/master/apps/docs/content/guides)).

## 1. Проект

1. Создайте проект и выберите регион — от него зависит страна хранения данных (ТЗ, раздел 2). Регион запишите в документацию развёртывания.
2. Сохраните пароль базы в менеджере паролей. В чат, код и репозиторий его не вставляйте.

## 2. Ключ подписи токенов

Маяк проверяет токены только асимметричными ключами (ES256/RS256) через JWKS.

- Страница **JWT signing keys** в настройках проекта. Если проект ещё на legacy JWT secret: *Migrate JWT secret* — Supabase импортирует старый секрет и создаст асимметричный standby-ключ; затем *Rotate keys*, чтобы новые токены подписывались им. Уже выданные токены остаются действительными до истечения. Supabase рекомендует эллиптическую кривую P-256 (ES256). Документация: [signing-keys.mdx](https://github.com/supabase/supabase/blob/master/apps/docs/content/guides/auth/signing-keys.mdx).
- Проверка: `https://<project-ref>.supabase.co/auth/v1/.well-known/jwks.json` должен вернуть хотя бы один ключ. Пустой список означает, что асимметричные ключи ещё не используются, и Маяк будет отвечать 401.

## 3. Вход по email

1. **Authentication → Sign In / Providers → Email:** провайдер включён.
2. Страница **Email Templates**, шаблон *Magic link or OTP*: добавьте в него код, например `<p>Код для входа в Маяк: {{ .Token }}</p>`. Без `{{ .Token }}` в письме будет только ссылка ([auth-email-passwordless.mdx](https://github.com/supabase/supabase/blob/master/apps/docs/content/guides/auth/auth-email-passwordless.mdx), [auth-email-templates.mdx](https://github.com/supabase/supabase/blob/master/apps/docs/content/guides/auth/auth-email-templates.mdx)).
3. Страница **URL Configuration** раздела Authentication: Site URL — адрес веб-клиента; в Redirect URLs добавьте его же (и `http://localhost:5173/` для разработки). Ссылка из письма работает только для адресов из списка ([redirect-urls.mdx](https://github.com/supabase/supabase/blob/master/apps/docs/content/guides/auth/redirect-urls.mdx)).
4. **Почта.** Встроенный SMTP Supabase отправляет письма только участникам команды проекта и с лимитом в час; он «не предназначен для production». Для личного использования владельцем этого достаточно; для других пользователей подключите свой SMTP ([auth-smtp.mdx](https://github.com/supabase/supabase/blob/master/apps/docs/content/guides/auth/auth-smtp.mdx)).

## 4. База данных

Таблицы Маяка создаются в схеме `mayak`. **Не добавляйте `mayak` в Exposed schemas** (API Settings): Data API не должен видеть эти таблицы. Миграция дополнительно отзывает права `anon`/`authenticated` и включает RLS ([securing-your-api.mdx](https://github.com/supabase/supabase/blob/master/apps/docs/content/guides/api/securing-your-api.mdx), [row-level-security.mdx](https://github.com/supabase/supabase/blob/master/apps/docs/content/guides/database/postgres/row-level-security.mdx)).

Маяк не обращается к данным через REST и GraphQL Supabase: библиотека используется только для входа. Поэтому Data API можно отключить совсем — **Integrations → Data API → Enable Data API** выключить ([securing-your-api.mdx](https://github.com/supabase/supabase/blob/master/apps/docs/content/guides/api/securing-your-api.mdx#disable-the-data-api)). После отключения проверьте, что вход по email работает.

Строки подключения берутся из кнопки **Connect** ([connecting-to-postgres.mdx](https://github.com/supabase/supabase/blob/master/apps/docs/content/guides/database/connecting-to-postgres.mdx)):

| Переменная | Что указать | Почему |
|---|---|---|
| `DATABASE_URL` | **Transaction pooler**, порт 6543 | Рекомендация Supabase для serverless-функций; prepared statements там не поддерживаются, и Маяк их не использует |
| `MIGRATION_DATABASE_URL` | **Session pooler** (5432) или Direct connection | Миграции — по прямому подключению или в session mode |
| `DATABASE_CA_CERT` | Содержимое корневого сертификата из Database Settings → SSL | С ним соединение шифруется и сервер проверяется (verify-full) |
| `DATABASE_POOL_MAX` | `1` для serverless, 5–10 для долгоживущего сервера | Рекомендация Supabase для serverless |

В строках подключения не указывайте `sslmode`, если задан `DATABASE_CA_CERT`: Маяк сам включит проверку сертификата.

## 5. Переменные окружения

Сервер (секреты только здесь):

```bash
MAYAK_AUTH=supabase
SUPABASE_URL=https://<project-ref>.supabase.co
DATABASE_URL=postgresql://postgres.<project-ref>:<пароль>@<pooler-host>:6543/postgres
MIGRATION_DATABASE_URL=postgresql://postgres.<project-ref>:<пароль>@<pooler-host>:5432/postgres
DATABASE_CA_CERT="-----BEGIN CERTIFICATE-----\n…\n-----END CERTIFICATE-----"
```

Веб-клиент (попадают в сборку, секретов нет):

```bash
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_…
```

Секретный ключ `sb_secret_…` Маяку сейчас не нужен.

## 6. Первый запуск

```bash
npm run db:migrate          # применит 0001–0003 в схему mayak
npm run dev:api             # API с проверкой токенов Supabase
npm run dev:web             # веб-клиент; «Настройки → Аккаунт и синхронизация»
```

Проверка после запуска: вход по коду на двух браузерах, заметка появляется на втором, отзыв одного устройства со второго закрывает ему синхронизацию. В SQL Editor Supabase: `select has_table_privilege('anon', 'mayak.notes', 'select');` должно вернуть `false`.
