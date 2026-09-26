import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { chooseOption, createNote, expectNoHorizontalScroll } from "./helpers.ts";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Все заметки" })).toBeVisible();
});

test("заметка сохраняется на устройстве и переживает перезагрузку", async ({ page }) => {
  await expect(page.getByText("Запишите первую мысль")).toBeVisible();
  await createNote(page, "Планы на осень", "Собрать важное в одном месте.");
  await page.getByRole("button", { name: "Задача", exact: true }).click();
  await page.keyboard.type("Отправить материалы");
  await page.keyboard.press("Enter");
  await page.keyboard.type("Созвониться");
  await expect(page.locator(".save-state")).toHaveText("Сохранено на устройстве");
  await expect(page.getByRole("contentinfo")).toContainText("Сохранено на устройстве · синхронизация не настроена");

  await page.reload();
  await expect(page.getByLabel("Заголовок заметки")).toHaveValue("Планы на осень");
  await expect(page.getByLabel("Текст заметки")).toHaveValue("Собрать важное в одном месте.");
  await expect(page.getByLabel("Текст задачи")).toHaveCount(2);
  await expect(page.getByLabel("Текст задачи").nth(1)).toHaveValue("Созвониться");
  await expect(page.locator(".note-item")).toHaveCount(1);
});

test("Enter на пустой задаче завершает список, Backspace удаляет пустой блок", async ({ page }) => {
  await createNote(page, "Список");
  await page.getByRole("button", { name: "Задача", exact: true }).click();
  await page.keyboard.type("Первая");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter"); // пустая задача → текстовый блок
  await expect(page.getByLabel("Текст задачи")).toHaveCount(1);
  await expect(page.getByLabel("Текст заметки")).toHaveCount(2);
  await expect(page.getByLabel("Текст заметки").nth(1)).toBeFocused();
  await page.keyboard.press("Backspace");
  await expect(page.getByLabel("Текст заметки")).toHaveCount(1);
  await expect(page.getByLabel("Текст задачи")).toBeFocused();
});

test("отметка в разделе «Задачи» меняет задачу в исходной заметке", async ({ page }) => {
  const id = await createNote(page, "Дела");
  await page.getByRole("button", { name: "Задача", exact: true }).click();
  await page.keyboard.type("Купить билеты");
  await expect(page.locator(".save-state")).toHaveText("Сохранено на устройстве");

  await page.getByRole("navigation", { name: "Основная навигация" }).getByRole("link", { name: /Задачи/ }).click();
  await expect(page.getByRole("heading", { name: "Ваши задачи" })).toBeVisible();
  await page.getByRole("checkbox", { name: "Купить билеты" }).check();
  await expect(page.getByText("Всё сделано. Отличная работа.")).toBeVisible();

  await page.goto(`/#/notes/${id}`);
  await expect(page.getByRole("checkbox", { name: "Выполнено: Купить билеты" })).toBeChecked();
});

test("поиск, пустой результат и Esc", async ({ page }) => {
  await createNote(page, "Поездка", "Паспорт и билеты");
  await createNote(page, "Работа", "Отчёт");
  const search = page.getByLabel("Поиск заметок");
  await search.fill("паспорт");
  await expect(page.locator(".note-item")).toHaveCount(1);
  await expect(page.locator(".note-item")).toContainText("Поездка");
  await search.fill("жираф");
  await expect(page.getByText("Ничего не найдено по запросу «жираф»")).toBeVisible();
  await search.press("Escape");
  await expect(search).toHaveValue("");
  await expect(page.locator(".note-item")).toHaveCount(2);
});

test("теги фильтруют список", async ({ page }) => {
  await createNote(page, "Личная");
  await page.getByLabel("Добавить тег").fill("Личное");
  await page.getByLabel("Добавить тег").press("Enter");
  await createNote(page, "Рабочая");
  await expect(page.locator(".save-state")).toHaveText("Сохранено на устройстве");
  await page.getByRole("navigation", { name: "Теги" }).getByRole("link", { name: "Личное" }).click();
  await expect(page.getByRole("heading", { name: "# Личное" })).toBeVisible();
  await expect(page.locator(".note-item")).toHaveCount(1);
  await expect(page.locator(".note-item")).toContainText("Личная");
});

test("корзина: отмена удаления и восстановление", async ({ page }) => {
  await createNote(page, "Черновик");
  await page.getByRole("button", { name: "В корзину" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Заметка перемещена в корзину" })).toBeVisible();
  await page.getByRole("button", { name: "Отменить" }).click();
  await expect(page.locator(".note-item")).toHaveCount(1);

  await page.locator(".note-item").click();
  await page.getByRole("button", { name: "В корзину" }).click();
  await expect(page.locator(".note-item")).toHaveCount(0);
  await page.getByRole("link", { name: /Корзина/ }).click();
  await page.getByRole("button", { name: "Восстановить" }).click();
  await page.getByRole("link", { name: /^Заметки/ }).first().click();
  await expect(page.locator(".note-item")).toHaveCount(1);
});

test("сочетания клавиш: Ctrl+Alt+N и Ctrl+K", async ({ page }) => {
  await page.keyboard.press("Control+Alt+KeyN");
  await expect(page.getByLabel("Заголовок заметки")).toBeFocused();
  await page.keyboard.type("С клавиатуры");
  await page.keyboard.press("Control+KeyK");
  await expect(page.getByLabel("Поиск заметок")).toBeFocused();
  await expect(page.locator(".note-item")).toContainText("С клавиатуры");
});

test("экспорт заметки в Markdown", async ({ page }) => {
  await createNote(page, "Отчёт: итоги", "Первый абзац");
  await page.getByRole("button", { name: "Задача", exact: true }).click();
  await page.keyboard.type("Готово");
  await page.getByRole("checkbox", { name: "Выполнено: Готово" }).check();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Скачать как Markdown" }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe("Отчёт итоги.md");
  const content = await (await file.createReadStream()).toArray();
  expect(Buffer.concat(content).toString("utf8")).toBe("# Отчёт: итоги\n\nПервый абзац\n\n- [x] Готово\n");
});

test("в браузере нет кнопки «Диктовать»: диктовка работает через Wispr Flow в приложении", async ({ page }) => {
  await createNote(page, "Голос");
  await expect(page.getByRole("button", { name: "Текст" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Диктовать" })).toHaveCount(0);
});

test("внешний вид: тёмная тема и размер редактора сохраняются, сброс возвращает значения", async ({ page }) => {
  await page.getByRole("link", { name: "Настройки" }).first().click();
  await chooseOption(page, "Тема оформления", "Тёмная");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  // Ползунок библиотеки (role="slider"): стрелка вправо — шаг 1 px, с 17 до 22.
  const editorSize = page.getByRole("group", { name: "Шрифт редактора" }).getByRole("slider");
  await editorSize.focus();
  for (let i = 0; i < 5; i++) await editorSize.press("ArrowRight");
  await expect(editorSize).toHaveAttribute("aria-valuenow", "22");
  await expect(page.getByText("Оформление сохранено на устройстве.")).toBeVisible();
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  expect(await page.evaluate(() => document.documentElement.style.getPropertyValue("--editor-size"))).toBe("22px");

  await page.getByRole("button", { name: "Сбросить оформление" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  expect(await page.evaluate(() => document.documentElement.style.getPropertyValue("--editor-size"))).toBe("17px");
});

test("внешний вид: предупреждение о низком контрасте и повреждённые настройки", async ({ page }) => {
  await page.goto("/#/settings");
  const ui = page.getByRole("group", { name: "Шрифт интерфейса" });
  const auto = ui.getByRole("switch", { name: "Цвет из темы" });
  await auto.uncheck();
  await expect(auto).not.toBeChecked();
  // Цветовая ячейка: панель с образцами и полем HEX.
  await ui.getByRole("button", { name: /Свой цвет текста/ }).click();
  const panel = page.getByRole("dialog", { name: "Свой цвет текста" });
  await panel.getByLabel("HEX").fill("#dddddd");
  await panel.getByRole("button", { name: "Применить" }).click();
  await expect(panel).toBeHidden();
  await expect(ui.getByRole("button", { name: /Свой цвет текста/ })).toContainText("#DDDDDD");
  await expect(page.getByText(/Низкий контраст текста интерфейса/)).toBeVisible();

  await page.evaluate(() => localStorage.setItem("mayak.appearance.v2", "{испорчено"));
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(page.getByRole("combobox", { name: "Тема оформления" })).toContainText("Светлая");
});

test("тема «Как в системе» следует настройке ОС без перезагрузки", async ({ page }) => {
  await page.goto("/#/settings");
  await chooseOption(page, "Тема оформления", "Как в системе");
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.emulateMedia({ colorScheme: "light" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
});

for (const width of [320, 390, 768, 1280, 1440]) {
  test(`ширина ${width}px: без горизонтальной прокрутки`, async ({ page }) => {
    await createNote(page, "Очень длинное название заметки, которое не должно ломать раскладку экрана", "Текст ".repeat(80));
    await page.getByLabel("Добавить тег").fill("ОченьДлинныйТегБезПробеловДляПроверки");
    await page.getByLabel("Добавить тег").press("Enter");
    await page.setViewportSize({ width, height: 800 });
    for (const hash of ["", "#/notes", "#/tasks", "#/files", "#/devices", "#/trash", "#/settings"]) {
      if (hash) await page.goto(`/${hash}`);
      await page.waitForTimeout(100);
      await expectNoHorizontalScroll(page);
    }
  });
}

test("доступность: axe без нарушений WCAG A/AA на основных экранах в обеих темах", async ({ page }) => {
  await createNote(page, "Планы на осень", "Текст");
  await page.getByRole("button", { name: "Задача", exact: true }).click();
  await page.keyboard.type("Задача");
  for (const theme of ["light", "dark"]) {
    await page.evaluate((t) => localStorage.setItem("mayak.appearance.v2", JSON.stringify({ theme: t })), theme);
    for (const hash of ["#/notes", "#/tasks", "#/files", "#/devices", "#/trash", "#/settings"]) {
      await page.goto(`/${hash}`);
      await page.reload();
      await expect(page.locator("main")).toBeVisible();
      await page.waitForTimeout(150);
      // Типы @axe-core/playwright собраны под более новую версию Playwright; объект страницы совместим.
      const result = await new AxeBuilder({ page: page as never }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
      const summary = result.violations.map((v) => `${theme} ${hash}: ${v.id} — ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`);
      expect(summary).toEqual([]);
    }
  }
});

test("на экранах нет стандартных элементов браузера: только компоненты @mayak/ui", async ({ page }) => {
  await createNote(page, "Проверка элементов", "Текст");
  await page.getByRole("button", { name: "Задача", exact: true }).click();
  await page.keyboard.type("Задача");
  for (const hash of ["#/notes", "#/tasks", "#/files", "#/devices", "#/trash", "#/settings"]) {
    await page.goto(`/${hash}`);
    await expect(page.locator("main")).toBeVisible();
    const native = await page.evaluate(() =>
      [
        ...document.querySelectorAll(
          [
            "select",
            'input[type="range"]',
            'input[type="color"]',
            'input[type="search"]',
            "details",
            "summary",
            "body [title]",
            "dialog:not(.mk-sheet)",
            // Нативные флажки и радиокнопки допустимы только скрытыми внутри компонентов библиотеки.
            'input[type="checkbox"]:not(.mk-check__input)',
            'input[type="radio"]:not(.mk-radio__input)',
          ].join(", "),
        ),
      ].map((el) => el.outerHTML.slice(0, 80)),
    );
    expect(native, hash).toEqual([]);
  }
});

test("строгая CSP в сборке и отсутствие ошибок в консоли", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto("/");
  const csp = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute("content");
  expect(csp).toContain("script-src 'self' 'sha256-");
  expect(csp).not.toContain("unsafe-eval");
  await createNote(page, "Проверка");
  expect(errors).toEqual([]);
});
