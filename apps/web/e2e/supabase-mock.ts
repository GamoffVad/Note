import { readFileSync } from "node:fs";
import { expect, type Browser, type BrowserContext, type Page, type Request, type Route } from "@playwright/test";
import { importJWK, SignJWT, type JWK } from "jose";

/**
 * Имитация проекта Supabase для e2e: запросы к https://mayaktest.supabase.co
 * перехватываются, токены подписываются тестовым ключом (открытую часть API
 * получает как JWKS). Дополнительные пути (хранилище, таблицы) обрабатывает
 * extra — если вернул true, запрос обработан.
 */
export const SUPABASE = "https://mayaktest.supabase.co";
export const CODE = "123456";
const { privateJwk } = JSON.parse(readFileSync(new URL("./fixtures/supabase-test-key.json", import.meta.url), "utf8")) as {
  privateJwk: JWK;
};

/** Один пользователь Supabase на email, как в настоящем проекте. */
const users = new Map<string, string>();

export async function sessionFor(email: string) {
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

export type ExtraHandler = (route: Route, request: Request, path: string) => Promise<boolean>;

export async function device(
  browser: Browser,
  extra?: ExtraHandler,
): Promise<{ context: BrowserContext; page: Page; unexpected: string[] }> {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "ru-RU" });
  const unexpected: string[] = [];
  await context.route(`${SUPABASE}/**`, async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    // Тело читается как JSON только у запросов входа: файлы приходят составными (multipart).
    const body = path.startsWith("/auth/") ? (request.postDataJSON() as Record<string, string> | null) : null;
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
    if (extra && (await extra(route, request, path))) return;
    unexpected.push(`${request.method()} ${path}`);
    return route.fulfill({ status: 404, contentType: "application/json", body: "{}" });
  });
  const page = await context.newPage();
  await page.goto("/#/settings");
  return { context, page, unexpected };
}

export async function signIn(page: Page, email: string, code = CODE) {
  await page.goto("/#/settings");
  const section = page.getByRole("region", { name: "Аккаунт и синхронизация" });
  await section.getByLabel("Email").fill(email);
  await section.getByRole("button", { name: "Получить код" }).click();
  await expect(section.getByText(`Письмо отправлено на ${email}`)).toBeVisible();
  await section.getByLabel("Код из письма").fill(code);
  await section.getByRole("button", { name: "Войти" }).click();
}
