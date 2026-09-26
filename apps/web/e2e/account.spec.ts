import { readFileSync } from "node:fs";
import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { importJWK, SignJWT, type JWK } from "jose";
import { createNote } from "./helpers.ts";

/**
 * Вход через аккаунт Supabase без настоящего проекта: запросы к Auth-серверу
 * (https://mayaktest.supabase.co/auth/v1/*) перехватываются, а токены
 * подписываются тестовым ключом, открытую часть которого API получает как JWKS.
 * Проверяется вся цепочка: код из письма → сессия → проверка подписи в API →
 * синхронизация → отзыв устройства → повторный вход.
 */
test.skip(!process.env.MAYAK_E2E_DATABASE_URL, "MAYAK_E2E_DATABASE_URL не задана — вход через аккаунт не проверяется");

const SUPABASE = "https://mayaktest.supabase.co";
const CODE = "123456";
const { privateJwk } = JSON.parse(readFileSync(new URL("./fixtures/supabase-test-key.json", import.meta.url), "utf8")) as {
  privateJwk: JWK;
};

/** Один пользователь Supabase на email, как в настоящем проекте. */
const users = new Map<string, string>();

async function sessionFor(email: string) {
  let id = users.get(email);
  if (!id) {
    id = crypto.randomUUID();
    users.set(email, id);
  }
  const key = await importJWK(privateJwk, "ES256");
  const now = Math.floor(Date.now() / 1000);
  const accessToken = await new SignJWT({
    email,
    role: "authenticated",
    aal: "aal1",
    session_id: crypto.randomUUID(),
    is_anonymous: false,
  })
    .setProtectedHeader({ alg: "ES256", kid: privateJwk.kid!, typ: "JWT" })
    .setIssuer(`${SUPABASE}/auth/v1`)
    .setAudience("authenticated")
    .setSubject(id)
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .sign(key);
  return {
    access_token: accessToken,
    token_type: "bearer",
    expires_in: 3600,
    expires_at: now + 3600,
    refresh_token: crypto.randomUUID(),
    user: {
      id,
      aud: "authenticated",
      role: "authenticated",
      email,
      email_confirmed_at: new Date().toISOString(),
      app_metadata: { provider: "email", providers: ["email"] },
      user_metadata: {},
      created_at: new Date().toISOString(),
      is_anonymous: false,
    },
  };
}

async function device(browser: Browser): Promise<{ context: BrowserContext; page: Page; unexpected: string[] }> {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "ru-RU" });
  const unexpected: string[] = [];
  await context.route(`${SUPABASE}/**`, async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const body = request.postDataJSON() as Record<string, string> | null;
    if (request.method() === "POST" && path === "/auth/v1/otp") {
      return route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
    }
    if (request.method() === "POST" && path === "/auth/v1/verify") {
      if (body?.token !== CODE) {
        return route.fulfill({
          status: 403,
          contentType: "application/json",
          body: JSON.stringify({ error_code: "otp_expired", msg: "Token has expired or is invalid" }),
        });
      }
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(await sessionFor(body.email!)) });
    }
    if (request.method() === "POST" && path === "/auth/v1/logout") return route.fulfill({ status: 204 });
    unexpected.push(`${request.method()} ${path}`);
    return route.fulfill({ status: 404, contentType: "application/json", body: "{}" });
  });
  const page = await context.newPage();
  await page.goto("/#/settings");
  return { context, page, unexpected };
}

async function signIn(page: Page, email: string, code = CODE) {
  await page.goto("/#/settings");
  const section = page.getByRole("region", { name: "Аккаунт и синхронизация" });
  await section.getByLabel("Email").fill(email);
  await section.getByRole("button", { name: "Получить код" }).click();
  await expect(section.getByText(`Письмо отправлено на ${email}`)).toBeVisible();
  await section.getByLabel("Код из письма").fill(code);
  await section.getByRole("button", { name: "Войти" }).click();
}

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
