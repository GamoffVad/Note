import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

/** Каталог библиотеки @mayak/islands: доступность во всех темах, работа с клавиатуры, формы «Островов идей». */
test.beforeEach(async ({ page }) => {
  await page.goto("/catalog.html");
  await expect(page.getByRole("heading", { name: "Маяк · компоненты" })).toBeVisible();
});

test("каталог: axe без нарушений WCAG A/AA в светлой, тёмной и контрастной теме", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  for (const theme of ["Светлая", "Тёмная", "Контрастная"]) {
    await page.getByRole("radiogroup", { name: "Тема каталога" }).getByRole("radio", { name: theme }).click();
    await page.waitForTimeout(150);
    // Типы @axe-core/playwright собраны под более новую версию Playwright; объект страницы совместим.
    const result = await new AxeBuilder({ page: page as never }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
    expect(result.violations.map((v) => `${theme}: ${v.id} — ${v.nodes.map((n) => `${n.target.join(" ")} [${n.any[0]?.message ?? ""}]`).join("; ")}`)).toEqual([]);
  }
  expect(errors).toEqual([]);
});

test("каталог: группа панели инструментов и сегменты управляются с клавиатуры", async ({ page }) => {
  const group = page.getByRole("group", { name: "Действия с заметкой" });
  await expect(group.getByRole("button")).toHaveCount(3);
  await group.getByRole("button", { name: "История" }).focus();
  await expect(page.getByRole("tooltip")).toHaveText("История");

  const themes = page.getByRole("radiogroup", { name: "Тема каталога" });
  await themes.getByRole("radio", { name: "Светлая" }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(themes.getByRole("radio", { name: "Тёмная" })).toBeChecked();
  await expect(page.locator("html")).toHaveAttribute("data-mayak-theme", "dark");
});

test("каталог: формы и цвета «Островов идей» — из токенов дизайн-системы, без стекла", async ({ page }) => {
  const style = (selector: string) =>
    page
      .locator(selector)
      .first()
      .evaluate((el) => {
        const cs = getComputedStyle(el);
        return { filter: cs.backdropFilter, radius: parseFloat(cs.borderTopLeftRadius), background: cs.backgroundColor };
      });
  // Радиусы раздела 5: поле 8, кнопка 12, карточка 18.
  expect((await style(".isl-field__control")).radius).toBe(8);
  expect((await style(".isl-button--primary")).radius).toBe(12);
  expect((await style(".isl-note-card")).radius).toBe(18);
  // Основное действие — #155B61 в светлой теме, #83D5CC в тёмной.
  // Смена темы анимируется (150 мс) — значение проверяется после перехода.
  await expect.poll(async () => (await style(".isl-button--primary")).background).toBe("rgb(21, 91, 97)");
  await page.getByRole("radiogroup", { name: "Тема каталога" }).getByRole("radio", { name: "Тёмная" }).click();
  await expect.poll(async () => (await style(".isl-button--primary")).background).toBe("rgb(131, 213, 204)");
  // Размытия фона («стекла») нет ни у одного элемента.
  const blurred = await page.evaluate(() => [...document.querySelectorAll("*")].filter((el) => getComputedStyle(el).backdropFilter !== "none").length);
  expect(blurred).toBe(0);
});

test("каталог: стандартных элементов управления браузера нет — только собственные", async ({ page }) => {
  // Нет системных списков выбора, ползунков и выбора цвета.
  await expect(page.locator("select, input[type=range], input[type=color], input[type=date]")).toHaveCount(0);
  // Флажки и радиокнопки: системный элемент невидим, рисуется собственный.
  const natives = await page.locator("input[type=checkbox], input[type=radio]").evaluateAll((els) =>
    els.map((el) => ({ opacity: getComputedStyle(el).opacity, drawn: !!el.nextElementSibling?.className.match(/isl-(check__box|radio__circle)/) })),
  );
  expect(natives.length).toBeGreaterThan(0);
  for (const n of natives) expect(n).toEqual({ opacity: "0", drawn: true });
});

test("каталог: на ширине телефона нет горизонтальной прокрутки", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.waitForTimeout(150);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
});

test("каталог: у поля ввода одно кольцо фокуса — у обёртки, без рамки вложенного поля", async ({ page }) => {
  for (const name of ["Email", "Найти заметку"]) {
    const input = page.getByRole("textbox", { name }).first();
    await input.focus();
    await page.keyboard.press("End");
    const rings = await input.evaluate((el) => {
      const wrapper = el.closest(".isl-focus-within")!;
      return { input: getComputedStyle(el).outlineStyle, wrapper: getComputedStyle(wrapper).outlineStyle };
    });
    expect(rings, name).toEqual({ input: "none", wrapper: "solid" });
  }
});

test("каталог: у всех интерактивных элементов скруглены подсветка и контур фокуса", async ({ page }) => {
  const square = await page.evaluate(() =>
    [...document.querySelectorAll("a[href], button, input, textarea, [tabindex]:not([tabindex='-1'])")]
      .filter((el) => {
        const cs = getComputedStyle(el);
        return cs.display !== "none" && cs.opacity !== "0" && parseFloat(cs.borderTopLeftRadius) === 0;
      })
      .map((el) => `${el.tagName} ${el.className}`),
  );
  expect(square).toEqual([]);
});
