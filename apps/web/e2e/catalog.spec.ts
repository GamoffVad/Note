import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

/** Каталог компонентов @mayak/ui: доступность в обеих темах и работа с клавиатуры. */
test.beforeEach(async ({ page }) => {
  await page.goto("/catalog.html");
  await expect(page.getByRole("heading", { name: "Маяк · компоненты" })).toBeVisible();
});

test("каталог: axe без нарушений WCAG A/AA в светлой и тёмной теме", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  for (const theme of ["Светлая", "Тёмная"]) {
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
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
});

test("каталог: стекло размывает фон и становится непрозрачным при повышенной контрастности", async ({ page }) => {
  const style = (selector: string) =>
    page
      .locator(selector)
      .first()
      .evaluate((el) => {
        const cs = getComputedStyle(el);
        return { filter: cs.backdropFilter, radius: parseFloat(cs.borderTopLeftRadius) };
      });
  expect((await style(".mk-toolbar-group")).filter).toContain("blur");
  expect((await style(".mk-sidebar-panel")).filter).toContain("blur");
  // Кнопки — капсулы (HIG «Buttons», macOS 27).
  expect((await style(".mk-button--primary")).radius).toBeGreaterThan(100);

  await page.emulateMedia({ contrast: "more" });
  expect((await style(".mk-toolbar-group")).filter).toBe("none");
});

test("каталог: у поля ввода одно кольцо фокуса — у обёртки, без рамки вложенного поля", async ({ page }) => {
  for (const name of ["Email", "Найти заметку"]) {
    const input = page.getByRole("textbox", { name }).first();
    await input.focus();
    await page.keyboard.press("End");
    const rings = await input.evaluate((el) => {
      const wrapper = el.closest(".mk-focus-within")!;
      return { input: getComputedStyle(el).outlineStyle, wrapper: getComputedStyle(wrapper).outlineStyle };
    });
    expect(rings, name).toEqual({ input: "none", wrapper: "solid" });
  }
});
