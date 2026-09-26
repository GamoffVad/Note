import { createHash } from "node:crypto";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

/**
 * Строгая CSP для сборки (ТЗ, раздел 7): скрипты только свои и встроенные
 * по хэшу, без eval и внешних источников. В режиме разработки не добавляется:
 * Vite использует встроенные скрипты для горячей перезагрузки.
 */
function contentSecurityPolicy(): Plugin {
  return {
    name: "mayak-csp",
    apply: "build",
    transformIndexHtml: {
      order: "post",
      handler(html) {
        const hashes = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(
          (m) => `'sha256-${createHash("sha256").update(m[1]!).digest("base64")}'`,
        );
        const policy = [
          "default-src 'self'",
          `script-src 'self' ${hashes.join(" ")}`,
          // Атрибуты style нужны для автоматической высоты полей и настроек оформления.
          "style-src 'self' 'unsafe-inline'",
          "img-src 'self' data: blob:",
          "connect-src 'self'",
          "object-src 'none'",
          "base-uri 'none'",
          "form-action 'self'",
        ].join("; ");
        return html.replace("<head>", `<head>\n    <meta http-equiv="Content-Security-Policy" content="${policy}" />`);
      },
    },
  };
}

const apiTarget = process.env.MAYAK_API_PROXY ?? "http://localhost:8787";

export default defineConfig({
  plugins: [react(), contentSecurityPolicy()],
  server: { port: 5173, proxy: { "/api": apiTarget } },
  preview: { port: 4173, proxy: { "/api": apiTarget } },
  build: { target: "es2022", sourcemap: true },
});
