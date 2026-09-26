# Дизайн-система «Маяк» 2.1 — стиль macOS 27 (Liquid Glass)

Все экраны всех версий приложения (Windows, macOS, Linux, Android, iOS) строятся
только из компонентов пакета `@mayak/ui`. Стандартные элементы браузера и системы
(`<select>`, `<input type="range">`, `<input type="color">`, видимые флажки,
всплывающие подсказки `title`) не используются: у каждого есть собственный
компонент в стиле последней версии macOS.

Живой каталог всех компонентов во всех состояниях: `apps/web/catalog.html`
(`npm run dev -w @mayak/web`, затем `/catalog.html`). Он же проверяется
автотестом `apps/web/e2e/catalog.spec.ts` (axe WCAG 2.2 AA в обеих темах,
клавиатура, стекло и повышенная контрастность).

## Источники

- Последняя версия — macOS 27: [developer.apple.com/macos](https://developer.apple.com/macos/)
  («What's new in macOS 27»).
- Язык оформления Liquid Glass:
  [Adopting Liquid Glass](https://developer.apple.com/documentation/technologyoverviews/adopting-liquid-glass),
  [Liquid Glass](https://developer.apple.com/documentation/technologyoverviews/liquid-glass).
- Цвета: [HIG · Color](https://developer.apple.com/design/human-interface-guidelines/color).
- Материалы: [HIG · Materials](https://developer.apple.com/design/human-interface-guidelines/materials).
- Шрифты SF: [developer.apple.com/fonts](https://developer.apple.com/fonts/).

## Что взято из Liquid Glass

| Правило Apple | Как сделано в `@mayak/ui` |
| --- | --- |
| Стекло — функциональный слой над содержимым; в слое содержимого не используется | Класс `.mk-glass` и токены `--glass-*` применяются только к кнопкам, панелям инструментов, меню, подсказкам, листам, боковой панели и уведомлениям. Карточки и списки заметок — непрозрачные |
| Кнопки и элементы управления — капсулы | `--radius-capsule`: кнопки, всплывающие кнопки, поиск, сегменты, цветовая ячейка, уведомления |
| Основное действие — «prominent» стекло с акцентом | `Button variant="primary"` |
| Новый размер extra large | `Button size="xlarge"`, `--control-h-xl: 44px` |
| Связанные действия панели — на общей стеклянной подложке | `ToolbarGroup` |
| Боковая панель парит над содержимым | `SidebarPanel` (отступ от краёв, `--radius-xl`) |
| Концентричные скругления | Пункт меню: радиус меню минус внутренний отступ |
| Ручки переключателей и ползунков становятся стеклянными при взаимодействии | `:active` у `Switch` и `Slider` |
| Более крупные радиусы листов, меню и окон; более высокие строки | `--radius-lg 18px`, `--radius-xl 24px`, `--row-h 44px` |
| Заголовки групп — обычным регистром | В `SidebarSection` и `FormGroup` нет капса |
| Эффект края прокрутки | `.mk-scroll-edge` |
| «Уменьшить прозрачность» и «Увеличить контраст» | `prefers-reduced-transparency` и `prefers-contrast: more` делают стекло непрозрачным |

## Осознанные отступления

1. **Цвета.** Системный синий HIG по умолчанию (#0088FF) на белом даёт контраст
   3.52:1 и не проходит WCAG 2.2 AA (4.5:1), поэтому используются значения HIG
   «Increased contrast» (синий #1E6EF4 и т. д.). Для текста на цветной подложке
   (значки, жетоны) — отдельные токены `--*-on-tint`, на ступень темнее.
2. **Стекло приближённое.** Настоящий Liquid Glass — системный материал с
   преломлением и динамической подсветкой; в веб-движке он имитируется через
   `backdrop-filter` (размытие + насыщенность), блик по верхней кромке и тонкую
   светлую границу.
3. **Шрифт.** Лицензия SF запрещает встраивание шрифта в приложения, поэтому
   используется системный стек: на macOS и iOS это и есть SF, на Windows —
   Segoe UI, на Linux и Android — системный шрифт.
4. **Сенсорные экраны.** При `pointer: coarse` высота элементов управления
   44 px и строк 52 px (минимальная зона нажатия HIG).

## Как веб-клиент использует библиотеку

`apps/web/src/main.tsx` подключает только `@mayak/ui/styles.css` и `src/styles/app.css`.
Прежние токены варианта 01 (`design/design-tokens.css`) приложением больше не
используются: цвета, радиусы, материалы и размеры берутся из `tokens.css`,
а `app.css` описывает лишь раскладку окна, редактор и списки.

| Место | Компоненты |
| --- | --- |
| Окно | `SidebarPanel` + `SidebarSection`/`SidebarItem` (парящая боковая панель), `ToolbarGroup` + `IconButton`/`IconLink` (стеклянные группы панели инструментов), нижняя навигация телефона — стеклянная капсула `.mk-glass` |
| Заметки | `SearchField`, `IconButton` «Создать заметку» с `Tooltip`, `Badge` для состояния синхронизации, `EmptyState` |
| Редактор | `Checkbox` у задач, `TokenField` для тегов, `Button` для вставки блоков, `Banner` для ошибок и конфликтов, `Badge` «Сохранено…» |
| Листы | `Sheet` вместо собственного диалога (конфликт, история, синхронизация, диктовка, выход, отзыв устройства) |
| Уведомления | `ToastProvider`/`useToast` |
| Настройки | `FormGroup`/`FormRow`, `PopUpButton` (тема, шрифт, толщина), `Slider` (размер), `Switch` («Цвет из темы»), `ColorWell` (свой цвет), `TextField` (вход), `Disclosure` («Режим разработчика») |

Настройки оформления пользователя (`state/appearance.ts`) связаны с токенами так:
`--ui-font`, `--ui-weight` и `--ui-size` читает `base.css` библиотеки (шрифт,
толщина и корневой размер — от него считаются все `rem`), `--ui-color`
подменяет `--text-primary` ниже `<body>`, а `--editor-*` применяются только
к тексту заметки, заголовку, задачам и предпросмотру.

Автотест `e2e/app.spec.ts` («на экранах нет стандартных элементов браузера»)
проверяет все разделы: нет `<select>`, `<input type="range|color|search">`,
`<details>`, атрибутов `title`, диалогов без `.mk-sheet` и видимых нативных
флажков и радиокнопок.

### Доработки библиотеки для приложения

- `ButtonLink` и `IconLink` — ссылки в виде кнопки-капсулы и кнопки панели
  инструментов (переход, а не действие; `aria-current` сохраняется).
- `FormGroup` — группа (`role="group"`), названная заголовком или `label`.
- `TokenField` — `inputLabel`, `removeLabel`, `className`.
- `ColorWell` — `hideLabel` для строк `FormRow` со своей подписью.
- `EmptyState` — `icon` и `as` (заголовок страницы `h1`).
- `Badge`, `FormRow` — `className`.
- `--mk-toast-offset` — приложение поднимает уведомления над своей нижней панелью.
