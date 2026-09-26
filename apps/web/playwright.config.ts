import { defineConfig, devices } from "@playwright/test";

/**
 * Сквозные тесты веб-клиента в Chromium.
 * Тесты синхронизации запускают локальный API и требуют MAYAK_E2E_DATABASE_URL
 * (отдельная база, имя содержит «test»); без неё они пропускаются.
 */
const dbUrl = process.env.MAYAK_E2E_DATABASE_URL;
export const SUPABASE_URL = "https://mayaktest.supabase.co";
const apiPort = 8788;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:4174",
    trace: "retain-on-failure",
    locale: "ru-RU",
    // Без UTF-8 локали Chromium на Linux заменяет кириллическое имя скачиваемого файла на «download».
    launchOptions: { env: { ...process.env, LANG: "C.UTF-8", LC_ALL: "C.UTF-8" } },
  },
  projects: [
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
      testIgnore: /mobile\.spec\.ts/,
    },
    {
      name: "mobile",
      use: { ...devices["Pixel 7"], viewport: { width: 390, height: 844 } },
      testMatch: /mobile\.spec\.ts/,
    },
  ],
  webServer: [
    {
      command: "npx vite build && npx vite preview --port 4174 --strictPort",
      url: "http://localhost:4174",
      reuseExistingServer: false,
      env: {
        MAYAK_API_PROXY: `http://localhost:${apiPort}`,
        VITE_DEV_SYNC: "1",
        // Имитация проекта Supabase: запросы к нему перехватывает e2e/account.spec.ts.
        VITE_SUPABASE_URL: SUPABASE_URL,
        VITE_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_e2e_test",
      },
      timeout: 120_000,
    },
    ...(dbUrl
      ? [
          {
            command: "npx tsx ../../packages/server/scripts/e2e-server.ts",
            // 401 без сессии означает, что сервер готов.
            url: `http://localhost:${apiPort}/api/v1/bootstrap`,
            reuseExistingServer: false,
            env: {
              DATABASE_URL: dbUrl,
              PORT: String(apiPort),
              MAYAK_AUTH: "supabase,dev",
              MAYAK_DEV_AUTH: "1",
              SUPABASE_URL,
              SUPABASE_JWKS_URL: "http://127.0.0.1:8799/jwks.json",
              E2E_JWKS_FILE: "e2e/fixtures/supabase-test-key.json",
              E2E_JWKS_PORT: "8799",
            },
            timeout: 60_000,
          },
        ]
      : []),
  ],
});
