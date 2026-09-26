import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defaultClientConditions, defineConfig, loadEnv, type Plugin } from "vite";

/**
 * Строгая CSP для сборки (ТЗ, раздел 7): скрипты только свои и встроенные
 * по хэшу, без eval и внешних источников. В режиме разработки не добавляется:
 * Vite использует встроенные скрипты для горячей перезагрузки.
 */
function contentSecurityPolicy(connectOrigins: string[]): Plugin {
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
          // Свой API и Auth-сервер проекта Supabase.
          `connect-src 'self' ${connectOrigins.join(" ")}`.trim(),
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

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "VITE_");
  // Сборка для настольного приложения (apps/desktop, Tauri 2): страницы открываются
  // с tauri://localhost, поэтому адрес API должен быть абсолютным.
  const desktop = mode === "desktop";
  if (desktop && !/^https:\/\//.test(env.VITE_API_BASE ?? "")) {
    console.warn("VITE_API_BASE не задан (https://…/api/v1): приложение будет работать только на устройстве, без синхронизации.");
  }
  // IPC Tauri: ipc:// на macOS и Linux, http://ipc.localhost на Windows (документация Tauri, «CSP»).
  const origins: string[] = desktop ? ["ipc:", "http://ipc.localhost"] : [];
  if (env.VITE_SUPABASE_URL) origins.push(new URL(env.VITE_SUPABASE_URL).origin);
  if (env.VITE_API_BASE && /^https?:/.test(env.VITE_API_BASE)) origins.push(new URL(env.VITE_API_BASE).origin);
  return {
    plugins: [react(), contentSecurityPolicy(origins)],
    // Пакеты монорепозитория: исходники .ts по условию «source».
    resolve: { conditions: ["source", ...defaultClientConditions] },
    server: { port: 5173, proxy: { "/api": apiTarget } },
    preview: { port: 4173, proxy: { "/api": apiTarget } },
    build: {
      target: "es2022",
      outDir: desktop ? "dist-desktop" : "dist",
      // В приложение карты исходников не встраиваются.
      sourcemap: !desktop,
      rolldownOptions: {
        input: {
          main: fileURLToPath(new URL("./index.html", import.meta.url)),
          // Каталог компонентов — отдельная страница, в приложение не входит.
          ...(desktop ? {} : { catalog: fileURLToPath(new URL("./catalog.html", import.meta.url)) }),
        },
      },
    },
  };
});
