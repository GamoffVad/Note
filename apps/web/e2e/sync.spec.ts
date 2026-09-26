import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { createNote } from "./helpers.ts";

/**
 * Два независимых браузера (отдельные IndexedDB) синхронизируются через
 * локальный API и PostgreSQL. Требует MAYAK_E2E_DATABASE_URL.
 */
test.skip(!process.env.MAYAK_E2E_DATABASE_URL, "MAYAK_E2E_DATABASE_URL не задана — синхронизация не проверяется");

async function device(browser: Browser, account: string): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "ru-RU" });
  const page = await context.newPage();
  await page.goto("/#/settings");
  await page.getByText("Режим разработчика", { exact: true }).click();
  await page.getByLabel("Имя аккаунта разработчика").fill(account);
  await page.getByRole("button", { name: "Подключить" }).click();
  await expect(page.getByRole("contentinfo")).toContainText(/Сохранено в облаке|Сохранено на устройстве/);
  await page.goto("/#/notes");
  return { context, page };
}

test("две копии приложения обмениваются заметками, задачами и конфликтами", async ({ browser }) => {
  const account = `e2e-${Date.now()}`;
  const a = await device(browser, account);
  const b = await device(browser, account);

  // A01: заметка с одного устройства появляется на другом.
  const id = await createNote(a.page, "Общая заметка", "Исходный текст");
  await a.page.getByRole("button", { name: "Задача", exact: true }).click();
  await a.page.keyboard.type("Отправить материалы");
  await expect(a.page.locator(".save-state")).toHaveText(/Сохранено в облаке/, { timeout: 15_000 });
  await b.page.bringToFront();
  await expect(b.page.locator(".note-item").filter({ hasText: "Общая заметка" })).toBeVisible({ timeout: 15_000 });

  // A09: отметка задачи на B видна на A.
  await b.page.goto("/#/tasks");
  await b.page.getByRole("checkbox", { name: "Отправить материалы" }).check();
  await a.page.bringToFront();
  await expect(a.page.getByRole("checkbox", { name: "Выполнено: Отправить материалы" })).toBeChecked({ timeout: 15_000 });

  // Устройства: оба браузера зарегистрированы.
  await a.page.goto("/#/devices");
  await expect(a.page.locator(".device")).toHaveCount(2);
  await expect(a.page.locator(".device").filter({ hasText: "это устройство" })).toHaveCount(1);

  // A04: правки без сети на двух устройствах → явный конфликт, «Сохранить обе».
  await a.context.setOffline(true);
  await b.context.setOffline(true);
  await a.page.goto(`/#/notes/${id}`);
  await a.page.getByLabel("Текст заметки").fill("Версия A");
  await expect(a.page.getByRole("contentinfo")).toContainText("Нет сети. Изменения сохранены на устройстве", { timeout: 15_000 });
  await b.page.goto(`/#/notes/${id}`);
  await b.page.getByLabel("Текст заметки").fill("Версия B");
  await expect(b.page.locator(".save-state")).toHaveText("Сохранено на устройстве");

  await a.context.setOffline(false);
  await a.page.bringToFront();
  await a.page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect(a.page.locator(".save-state")).toHaveText(/Сохранено в облаке/, { timeout: 30_000 });

  await b.context.setOffline(false);
  await b.page.bringToFront();
  await b.page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect(b.page.getByRole("alert").filter({ hasText: "Найдены изменения с другого устройства" })).toBeVisible({
    timeout: 30_000,
  });
  await b.page.getByRole("button", { name: "Сравнить" }).click();
  const dialog = b.page.getByRole("dialog", { name: "Найдены изменения с другого устройства" });
  await expect(dialog.getByText("Версия A")).toBeVisible();
  await expect(dialog.getByText("Версия B")).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Сохранить обе" })).toBeFocused();
  await dialog.getByRole("button", { name: "Сохранить обе" }).click();
  await expect(b.page.getByText("Копия, сохранённая при конфликте версий.")).toBeVisible();
  await expect(b.page.getByLabel("Текст заметки")).toHaveValue("Версия B");

  await a.page.bringToFront();
  await expect(a.page.locator(".note-item")).toHaveCount(2, { timeout: 30_000 });
  await a.page.goto(`/#/notes/${id}`);
  await expect(a.page.getByLabel("Текст заметки")).toHaveValue("Версия A");

  // История: версии на сервере, восстановление создаёт новую ревизию.
  await a.page.getByRole("button", { name: "История заметки" }).click();
  const history = a.page.getByRole("dialog", { name: "История заметки" });
  await expect(history.getByText(/Версия \d+ · текущая/)).toBeVisible();
  await history.getByRole("button", { name: "Восстановить" }).last().click();
  await expect(a.page.getByLabel("Текст заметки")).toHaveValue("Исходный текст", { timeout: 15_000 });

  await a.context.close();
  await b.context.close();
});
