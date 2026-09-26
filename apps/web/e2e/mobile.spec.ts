import { expect, test } from "@playwright/test";
import { createNote, expectNoHorizontalScroll } from "./helpers.ts";

test("телефон: отдельные экраны списка и заметки, нижняя навигация, «Назад»", async ({ page }) => {
  await page.goto("/");
  const bottomNav = page.getByRole("navigation", { name: "Основные разделы" });
  await expect(bottomNav).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Основная навигация" })).toBeHidden();

  await createNote(page, "Мобильная", "Текст с телефона");
  await expect(page.getByRole("heading", { name: "Заметки", exact: true })).toBeHidden();
  // Нижняя навигация прячется только при открытой клавиатуре (окно заметно ниже),
  // а не от одного фокуса в поле: иначе нажатие кнопки после ввода сдвигало экран.
  const size = page.viewportSize()!;
  await page.getByLabel("Текст заметки").focus();
  await expect(bottomNav).toBeVisible();
  await page.setViewportSize({ width: size.width, height: Math.round(size.height * 0.55) });
  await expect(bottomNav).toBeHidden();
  await page.setViewportSize(size);
  await page.getByLabel("Текст заметки").blur();
  await expect(bottomNav).toBeVisible();

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

test("телефон: после ввода длинного тега кнопка «Задача» срабатывает с первого нажатия", async ({ page }) => {
  await page.goto("/");
  await createNote(page, "Теги", "Длинный текст ".repeat(40));
  await page.getByLabel("Добавить тег").fill("ОченьДлинныйТегБезПробеловДляПроверки");
  await page.getByLabel("Добавить тег").press("Enter");
  await page.getByRole("button", { name: "Задача", exact: true }).click();
  await expect(page.getByLabel("Текст задачи")).toBeFocused();
  await page.keyboard.type("Первая, вторая");
  await expect(page.getByLabel("Текст задачи")).toHaveValue("Первая, вторая");
  await expect(page.locator(".isl-token")).toHaveCount(1);
});

test("телефон: настройки — подпись и поле вплотную, без пустого места", async ({ page }) => {
  await page.goto("/#/settings");
  const label = page.getByText("Тема оформления", { exact: true }).first();
  const field = page.getByRole("combobox", { name: "Тема оформления" });
  const gap = (await field.boundingBox())!.y - ((await label.boundingBox())!.y + (await label.boundingBox())!.height);
  expect(gap).toBeLessThan(24);
});
