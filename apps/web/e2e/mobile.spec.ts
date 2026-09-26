import { expect, test } from "@playwright/test";
import { createNote, expectNoHorizontalScroll } from "./helpers.ts";

test("телефон: отдельные экраны списка и заметки, нижняя навигация, «Назад»", async ({ page }) => {
  await page.goto("/");
  const bottomNav = page.getByRole("navigation", { name: "Основные разделы" });
  await expect(bottomNav).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Основная навигация" })).toBeHidden();

  await createNote(page, "Мобильная", "Текст с телефона");
  await expect(page.getByRole("heading", { name: "Заметки", exact: true })).toBeHidden();
  // Во время ввода нижняя навигация не занимает место над клавиатурой.
  await page.getByLabel("Текст заметки").focus();
  await expect(bottomNav).toBeHidden();

  await page.getByRole("link", { name: "Заметки" }).first().click();
  await expect(page.getByRole("heading", { name: "Заметки", exact: true })).toBeVisible();
  await expect(bottomNav).toBeVisible();
  await page.locator(".note-item").click();
  await expect(page.getByLabel("Заголовок заметки")).toHaveValue("Мобильная");
  await page.goBack();
  await expect(page.getByRole("heading", { name: "Заметки", exact: true })).toBeVisible();

  await bottomNav.getByRole("link", { name: "Задачи" }).click();
  await expect(page.getByRole("heading", { name: "Задачи", exact: true })).toBeVisible();
  await expect(bottomNav.getByRole("link", { name: "Задачи" })).toHaveAttribute("aria-current", "page");
  await expectNoHorizontalScroll(page);
});

test("телефон: зоны нажатия не меньше 48 px в нижней навигации и у создания заметки", async ({ page }) => {
  await page.goto("/");
  // Сначала дождаться отрисовки: без этого замер мог пройти до загрузки приложения и не найти элементов.
  await expect(page.getByRole("navigation", { name: "Основные разделы" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Создать заметку" }).first()).toBeVisible();
  const boxes = await page.locator(".bottom-nav .nav, .list-header .new").evaluateAll((els) =>
    els.map((e) => e.getBoundingClientRect()).map((r) => Math.min(r.width, r.height)),
  );
  expect(boxes.length).toBe(5);
  // Android: 48 dp (DESIGN-SYSTEM «Острова идей», раздел 5).
  for (const size of boxes) expect(size).toBeGreaterThanOrEqual(48);
});
