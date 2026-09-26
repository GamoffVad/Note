import { expect, test } from "@playwright/test";
import { createNote } from "./helpers.ts";
import { CODE, device, signIn } from "./supabase-mock.ts";

/**
 * Вход через аккаунт Supabase без настоящего проекта: запросы к Auth-серверу
 * (https://mayaktest.supabase.co/auth/v1/*) перехватываются, а токены
 * подписываются тестовым ключом, открытую часть которого API получает как JWKS.
 * Проверяется вся цепочка: код из письма → сессия → проверка подписи в API →
 * синхронизация → отзыв устройства → повторный вход.
 */
test.skip(!process.env.MAYAK_E2E_DATABASE_URL, "MAYAK_E2E_DATABASE_URL не задана — вход через аккаунт не проверяется");

test("вход по коду из письма, синхронизация, отзыв устройства и повторный вход", async ({ browser }) => {
  const email = `user-${Date.now()}@example.com`;
  const laptop = await device(browser);
  const phone = await device(browser);

  // Заметка, созданная до входа, уходит в аккаунт.
  await laptop.page.goto("/");
  await createNote(laptop.page, "Создана до входа", "Локальный текст");

  // Неверный код — понятная ошибка, вход не выполнен.
  await signIn(laptop.page, email, "000000");
  await expect(laptop.page.getByRole("alert").filter({ hasText: "Код неверный или устарел" })).toBeVisible();
  await laptop.page.getByLabel("Код из письма").fill(CODE);
  await laptop.page.getByRole("button", { name: "Войти" }).click();
  await expect(laptop.page.getByText(`Вы вошли как ${email}`)).toBeVisible();
  await expect(laptop.page.getByRole("banner")).toContainText(email);
  await expect(laptop.page.locator(".titlebar .sync-status")).toContainText("Сохранено в облаке", { timeout: 15_000 });

  await signIn(phone.page, email);
  await expect(phone.page.getByText(`Вы вошли как ${email}`)).toBeVisible();
  await phone.page.goto("/#/notes");
  await expect(phone.page.locator(".note-item").filter({ hasText: "Создана до входа" })).toBeVisible({ timeout: 15_000 });

  // Правка на телефоне видна на ноутбуке.
  await phone.page.locator(".note-item").filter({ hasText: "Создана до входа" }).click();
  await phone.page.getByLabel("Текст заметки").fill("Правка с телефона");
  await expect(phone.page.locator(".save-state")).toHaveText(/Сохранено в облаке/, { timeout: 15_000 });
  await laptop.page.goto("/#/notes");
  await expect(laptop.page.getByLabel("Текст заметки")).toHaveValue("Правка с телефона", { timeout: 15_000 });

  // Ноутбук отзывает телефон.
  await laptop.page.goto("/#/devices");
  await expect(laptop.page.locator(".device")).toHaveCount(2);
  await laptop.page.locator(".device").filter({ hasNotText: "это устройство" }).getByRole("button", { name: "Отозвать" }).click();
  await laptop.page.getByRole("dialog").getByRole("button", { name: "Отозвать доступ" }).click();
  await expect(laptop.page.locator(".device.revoked")).toHaveCount(1);

  // Телефон: правка остаётся на устройстве, синхронизация просит войти снова.
  await phone.page.goto("/#/notes");
  await phone.page.getByLabel("Текст заметки").fill("После отзыва");
  await phone.page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(phone.page.locator(".titlebar .sync-status")).toContainText(/Войдите снова|Доступ этого устройства отозван/, {
    timeout: 15_000,
  });
  await phone.page.goto("/#/settings");
  await expect(phone.page.getByRole("alert").filter({ hasText: "Доступ этого устройства отозван" })).toBeVisible();

  // Повторный вход: новая сессия и новое устройство; неотправленная правка уходит.
  await signIn(phone.page, email);
  await expect(phone.page.locator(".titlebar .sync-status")).toContainText("Сохранено в облаке", { timeout: 15_000 });
  await laptop.page.getByRole("button", { name: "Обновить список устройств" }).click();
  await expect(laptop.page.locator(".device")).toHaveCount(3);
  await laptop.page.goto("/#/notes");
  await expect(laptop.page.getByLabel("Текст заметки")).toHaveValue("После отзыва", { timeout: 15_000 });

  // Выход с удалением данных с устройства.
  await laptop.page.goto("/#/settings");
  await laptop.page.getByRole("button", { name: "Выйти на этом устройстве" }).click();
  const dialog = laptop.page.getByRole("dialog", { name: "Выйти из аккаунта?" });
  await expect(dialog.getByText("Все изменения отправлены.")).toBeVisible();
  await dialog.getByLabel("Удалить заметки этого аккаунта с устройства").check();
  await dialog.getByRole("button", { name: "Выйти" }).click();
  await expect(laptop.page.getByRole("banner")).toContainText("Только это устройство");
  await laptop.page.goto("/#/notes");
  await expect(laptop.page.getByText("Запишите первую мысль")).toBeVisible();
  expect(await laptop.page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith("mayak.auth")))).toEqual([]);

  expect([...laptop.unexpected, ...phone.unexpected]).toEqual([]);
  await laptop.context.close();
  await phone.context.close();
});
