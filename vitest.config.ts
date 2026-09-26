import { defaultClientConditions, defaultServerConditions } from "vite";
import { defineConfig } from "vitest/config";

// Пакеты монорепозитория экспортируют исходники .ts по условию «source»;
// без условия Node получает скомпилированный .js (сборка Vercel).
export default defineConfig({
  resolve: { conditions: ["source", ...defaultClientConditions] },
  ssr: { resolve: { conditions: ["source", ...defaultServerConditions] } },
  test: {
    include: ["packages/*/test/**/*.test.ts", "apps/*/test/**/*.test.ts"],
    // Серверные тесты используют одну базу PostgreSQL и очищают её между файлами.
    fileParallelism: false,
    testTimeout: 30_000,
  },
});
