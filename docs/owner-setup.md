# Что сделать владельцу

Почти всё делает Claude. От вас — одно действие на минуту (п. 2).
Пароли и ключи никуда копировать не нужно.

## 1. Подключить Supabase к Claude — сделано

Коннектор подключён. Claude создал таблицы в схеме `mayak` проекта
`mayak` (регион eu-west-1), отдельную роль сервера `mayak_api` с доступом
только к таблицам Маяка и подключил базу к серверу на Vercel.

## 2. Разрешить ссылку входа в приложение

Бесплатная почта Supabase не позволяет менять текст писем, поэтому вход в
приложении — по ссылке из письма: она открывает «Маяк» и выполняет вход.
Supabase пускает ссылку только на разрешённые адреса
([документация Supabase](https://github.com/supabase/supabase/blob/master/apps/docs/content/guides/auth/native-mobile-deep-linking.mdx)):

1. Панель Supabase → проект **mayak** → **Authentication** → **URL Configuration**.
2. **Redirect URLs** → **Add URL** →
   `io.github.gamoffvad.mayak://**` → **Save**.
3. Для телефона там же **Add URL** →
   `https://mayak-pied-theta.vercel.app/auth/callback/` → **Save**.
   На Android ссылка из письма ведёт на эту страницу сайта, а она открывает
   приложение кнопкой «Открыть Маяк»: без нажатия браузер телефона приложение
   не открывал. Supabase пускает ссылку только на адреса из этого списка
   ([redirect-urls.mdx](https://github.com/supabase/supabase/blob/master/apps/docs/content/guides/auth/redirect-urls.mdx)).

Письмо открывайте на том же компьютере, где нажали «Получить код».

## Уже сделано

- Ветка влита в `main` (pull request GamoffVad/note#1).
- Защита Vercel Authentication снята: приложения могут обращаться к API.
  Сам API пускает только запросы с токеном входа.
- Сертификат базы Supabase встроен в сервер, отдельно задавать его не нужно.
- Ключ подписи входа (JWT signing keys) настраивать не нужно: сервер
  проверяет и новые, и старые токены Supabase.
- Адрес сервера для приложения записан в `apps/desktop/mayak.config.json`,
  переменные в GitHub задавать не нужно.

## По желанию: подпись установщиков

Без подписи приложение работает, но при первом запуске:
Windows — «Подробнее» → «Выполнить в любом случае»;
macOS — **Системные настройки → Конфиденциальность и безопасность →
«Всё равно открыть»**
([справка Apple](https://support.apple.com/guide/mac-help/open-a-mac-app-from-an-unknown-developer-mh40616/mac)).

Чтобы предупреждения не было на macOS, нужен платный аккаунт Apple Developer
(99 $ в год, [документация Tauri](https://v2.tauri.app/distribute/sign/macos/)).
Для Windows подпись для личного использования не нужна: даже с сертификатом
SmartScreen предупреждает, пока у него нет репутации
([документация Tauri](https://v2.tauri.app/distribute/sign/windows/)).
Если решите подписывать — скажите, Claude подготовит сборку.
