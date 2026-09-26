import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["packages/*/test/**/*.test.ts", "apps/*/test/**/*.test.ts"],
    // Серверные тесты используют одну базу PostgreSQL и очищают её между файлами.
    fileParallelism: false,
    testTimeout: 30_000,
  },
});
