# Что сделать владельцу: пошаговая инструкция

Код «Маяка» готов. Ниже — шаги, которые можете сделать только вы: у меня нет
доступа к вашим аккаунтам, и секреты (пароли, ключи) не должны проходить через
чат. Порядок важен: шаги 1–4 обязательны для синхронизации, шаг 5 — чтобы
получить установщики, шаг 6 — по желанию.

Правило для всех шагов: **пароль базы, строки подключения и сертификаты
вставляйте только в настройки Supabase, Vercel и GitHub — никогда в чат,
код или файлы репозитория.**

---

## Шаг 1. Влить ветку в `main`

Кнопка ручного запуска (Run workflow) у сборок и миграций появляется в GitHub
только для файлов в основной ветке репозитория
([документация GitHub](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/manually-run-a-workflow)).
Основная ветка репозитория — `main`, а вся работа сейчас в
`claude/new-session-kow5h4`.

1. Откройте https://github.com/gamoffvad/note → вкладка **Pull requests** →
   **New pull request**.
2. base: `main`, compare: `claude/new-session-kow5h4` → **Create pull request**.
3. **Merge pull request** → **Confirm merge**.

(Могу создать pull request сам — скажите.)

---

## Шаг 2. Проект Supabase — база данных и вход по почте

Подробности и ссылки на документацию Supabase — [supabase-setup.md](supabase-setup.md).

### 2.1. Создать проект

1. Зарегистрируйтесь на https://supabase.com **той почтой, на которую будете
   входить в «Маяк»**: встроенная почта Supabase отправляет письма только
   участникам команды проекта.
2. **New project** → имя `mayak` → придумайте **пароль базы** и сохраните его в
   менеджере паролей → выберите **регион** (ближайший к вам; от него зависит
   страна хранения заметок) → **Create new project**.

### 2.2. Ключ подписи входа

1. В настройках проекта откройте страницу **JWT signing keys** (Project Settings → JWT Keys).
2. Если там предлагают **Migrate JWT secret** — нажмите, затем **Rotate keys**.
   Нужен ключ ECC (P-256).
3. Проверка: откройте в браузере
   `https://<ref>.supabase.co/auth/v1/.well-known/jwks.json`
   (`<ref>` — идентификатор проекта из адреса панели). В ответе должен быть
   хотя бы один ключ в `"keys": [...]`.

### 2.3. Вход по коду из письма

1. **Authentication → Sign In / Providers → Email** — провайдер включён.
2. **Authentication → Email Templates → Magic link** (Magic link or OTP) —
   добавьте в текст письма строку:
   `<p>Код для входа в Маяк: {{ .Token }}</p>`
   и сохраните. Без `{{ .Token }}` кода в письме не будет.
3. **Authentication → URL Configuration → Site URL** —
   `https://mayak-pied-theta.vercel.app`.

### 2.4. Закрыть данные от публичного API Supabase

**Project Settings → Data API**: схему `mayak` в *Exposed schemas* **не
добавляйте**. Можно выключить Data API совсем: «Маяку» он не нужен.

### 2.5. Собрать значения для следующих шагов

| Что | Где в Supabase | Секрет? |
| --- | --- | --- |
| Project URL `https://<ref>.supabase.co` | кнопка **Connect** вверху панели | нет |
| Publishable key `sb_publishable_…` | кнопка **Connect** (или Project Settings → API Keys) | нет |
| Строка **Transaction pooler** (порт **6543**) | кнопка **Connect** вверху панели | **да** — содержит пароль |
| Строка **Session pooler** (порт **5432**) | кнопка **Connect** | **да** |
| Корневой сертификат SSL (файл `.crt`) | Project Settings → Database → раздел **SSL Configuration** → **Download Certificate** | нет, но хранить как секрет удобнее |

В строках подключения замените `[YOUR-PASSWORD]` на пароль базы из шага 2.1.

---

## Шаг 3. Создать таблицы (миграции) через GitHub

1. https://github.com/gamoffvad/note → **Settings → Secrets and variables →
   Actions** → вкладка **Secrets** → **New repository secret**. Добавьте два секрета:
   - `MIGRATION_DATABASE_URL` — строка **Session pooler** (порт 5432);
   - `DATABASE_CA_CERT` — всё содержимое файла сертификата, открытого в
     текстовом редакторе (от `-----BEGIN CERTIFICATE-----` до
     `-----END CERTIFICATE-----`).
2. Вкладка **Actions** → слева **«Миграции базы данных»** → **Run workflow** →
   **Run workflow**.
3. Через 1–2 минуты у запуска должна быть зелёная галочка, а в журнале шага
   «Миграции» — строка `Применены миграции: 0001_init, 0002_private_schema, 0003_sessions`.
4. Проверка в Supabase: **SQL Editor** → выполните
   `select has_table_privilege('anon', 'mayak.notes', 'select');` — должно быть `false`.

---

## Шаг 4. Vercel — сервер синхронизации

Проект `mayak`: https://vercel.com → проект **mayak** → **Settings**.

### 4.1. Переменные окружения

**Settings → Environment Variables** → для каждой строки: Key, Value,
окружения **Production** и **Preview**, **Save**.

| Key | Value | Sensitive |
| --- | --- | --- |
| `SUPABASE_URL` | `https://<ref>.supabase.co` | нет |
| `DATABASE_URL` | строка **Transaction pooler** (порт **6543**) | **да** |
| `DATABASE_CA_CERT` | содержимое файла сертификата | **да** |
| `DATABASE_POOL_MAX` | `1` | нет |

Для личного использования достаточно одного проекта Supabase на оба окружения.

### 4.2. Открыть API для приложений

Сейчас у проекта включена **Vercel Authentication**: Vercel просит вход в
аккаунт Vercel раньше, чем запрос дойдёт до API, и приложения получают отказ.
Сам API пускает только запросы с токеном входа Supabase, поэтому эту защиту
можно снять:

**Settings → Deployment Protection → Vercel Authentication** → выключить →
**Save**
([документация Vercel](https://vercel.com/docs/deployment-protection/methods-to-protect-deployments/vercel-authentication)).

(Могу выключить сам через подключённый Vercel — скажите.)

### 4.3. Пересобрать и проверить

1. **Deployments** → последнее развёртывание → меню **⋯** → **Redeploy**.
2. Откройте `https://mayak-pied-theta.vercel.app/api/v1/bootstrap`.
   - `{"code":"UNAUTHORIZED",…}` (401) — **всё правильно**: сервер работает и ждёт вход.
   - `{"code":"SERVICE_UNAVAILABLE",…}` (503) — не заданы переменные из 4.1
     или не сделан Redeploy.
   - страница входа Vercel — не выключена защита из 4.2.

---

## Шаг 5. Собрать установщики и установить приложение

### 5.1. Параметры сборки

**GitHub → Settings → Secrets and variables → Actions** → вкладка
**Variables** (не Secrets) → **New repository variable**:

| Name | Value |
| --- | --- |
| `MAYAK_API_BASE` | `https://mayak-pied-theta.vercel.app/api/v1` |
| `MAYAK_SUPABASE_URL` | `https://<ref>.supabase.co` |
| `MAYAK_SUPABASE_PUBLISHABLE_KEY` | `sb_publishable_…` |

Это публичные значения: они встраиваются в приложение, секретов среди них нет.

### 5.2. Запустить сборку

**Actions** → **«Настольное приложение»** → **Run workflow**. Сборка
занимает 15–30 минут. Когда все задания зелёные — откройте запуск, внизу в
разделе **Artifacts** скачайте архив для своей системы.

### 5.3. Установка

- **Windows** — `.msi` или `…-setup.exe`. Пока установщик не подписан,
  SmartScreen покажет предупреждение: «Подробнее» → «Выполнить в любом случае».
- **macOS** — `.dmg`: перетащите «Mayak» в «Программы». При первом запуске
  macOS не даст открыть программу неизвестного разработчика: **Системные
  настройки → Конфиденциальность и безопасность → «Всё равно открыть»**
  ([справка Apple](https://support.apple.com/guide/mac-help/open-a-mac-app-from-an-unknown-developer-mh40616/mac)).
  Для Mac с Apple Silicon и Intel — разные архивы.
- **Linux** — `.deb`: `sudo apt install ./Mayak_0.1.0_amd64.deb`; или
  `.AppImage`: `chmod +x Mayak_*.AppImage` и запуск двойным щелчком.

### 5.4. Проверка синхронизации

1. На первом устройстве: **Настройки → Аккаунт и синхронизация** → ваша почта
   → «Получить код» → код из письма → «Войти».
2. Создайте заметку. Внизу окна должно появиться «Сохранено в облаке».
3. На втором устройстве войдите той же почтой — заметка появится.

---

## Шаг 6 (по желанию). Подпись установщиков

Без подписи приложение работает; подпись убирает предупреждения при первом
запуске.

### macOS — Apple Developer Program

По [документации Tauri](https://v2.tauri.app/distribute/sign/macos/): платный
аккаунт Apple Developer (99 $ в год) и компьютер Mac, на котором создаётся
запрос сертификата. С бесплатным аккаунтом нотаризация недоступна, и
предупреждение останется.

1. Вступите в Apple Developer Program: https://developer.apple.com/programs/.
2. На Mac создайте запрос сертификата (Связка ключей → Ассистент
   сертификатов → Запросить сертификат у бюро сертификации).
3. https://developer.apple.com/account/resources/certificates → **+** →
   **Developer ID Application** → загрузите запрос → скачайте `.cer` и
   откройте его (попадёт в Связку ключей).
4. В «Связке ключей» → «Мои сертификаты» → правой кнопкой по ключу →
   **Экспортировать** → файл `.p12` с паролем.
5. В Терминале: `openssl base64 -A -in certificate.p12 -out certificate-base64.txt`.
6. Для нотаризации создайте пароль приложения для Apple ID:
   https://account.apple.com → «Вход и безопасность» → «Пароли приложений».
7. В GitHub → **Secrets** добавьте: `APPLE_CERTIFICATE` (содержимое
   `certificate-base64.txt`), `APPLE_CERTIFICATE_PASSWORD`, `APPLE_ID`
   (почта Apple ID), `APPLE_PASSWORD` (пароль приложения), `APPLE_TEAM_ID`
   (Team ID со страницы Membership в аккаунте разработчика).
8. Напишите мне — я подключу эти секреты к сборке.

### Windows — сертификат подписи кода

Для личного использования **не нужен**. По
[документации Tauri](https://v2.tauri.app/distribute/sign/windows/) подпись
не обязательна для запуска. С 2024 года даже подписанная программа получает
предупреждение SmartScreen, пока у сертификата не накопится репутация.
Варианты, если всё же нужно: OV-сертификат от удостоверяющего центра или
Azure Artifact Signing. Напишите — подготовлю сборку под выбранный вариант.
