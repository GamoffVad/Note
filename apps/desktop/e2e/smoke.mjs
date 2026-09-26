/**
 * Проверка настоящего окна приложения через WebDriver (tauri-driver).
 * Сценарий: создать заметку → закрыть приложение → открыть снова → заметка
 * на месте и лежит в SQLite, а не в IndexedDB.
 *
 * Запуск (Linux): собрать `npm run build -w @mayak/desktop`, установить
 * webkit2gtk-driver и `cargo install tauri-driver`, затем
 *   tauri-driver &  node apps/desktop/e2e/smoke.mjs
 * Под Xvfb: xvfb-run -a sh -c 'tauri-driver & sleep 1; node apps/desktop/e2e/smoke.mjs'
 * Используется протокол W3C WebDriver напрямую, без дополнительных пакетов.
 */
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

const DRIVER = process.env.TAURI_DRIVER_URL ?? "http://127.0.0.1:4444";
const application = resolve(import.meta.dirname, "../src-tauri/target/release/mayak-desktop");
const dataDir = process.env.MAYAK_DATA_DIR ?? join(process.env.XDG_DATA_HOME ?? join(homedir(), ".local/share"), "io.github.gamoffvad.mayak");
const title = `Проверка SQLite ${Date.now()}`;

async function wd(method, path, body) {
  const res = await fetch(DRIVER + path, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`${method} ${path}: ${JSON.stringify(json.value)}`);
  return json.value;
}

/** Ссылка на элемент W3C: объект с единственным ключом element-6066-…; берём значение. */
const elementId = (ref) => Object.values(ref)[0];

async function session() {
  const { sessionId } = await wd("POST", "/session", {
    capabilities: { alwaysMatch: { "tauri:options": { application } } },
  });
  const s = (method, path, body) => wd(method, `/session/${sessionId}${path}`, body);
  const find = async (xpath, timeout = 15_000) => {
    const until = Date.now() + timeout;
    for (;;) {
      try {
        return elementId(await s("POST", "/element", { using: "xpath", value: xpath }));
      } catch (error) {
        if (Date.now() > until) throw error;
        await new Promise((r) => setTimeout(r, 250));
      }
    }
  };
  return {
    find,
    click: async (xpath) => s("POST", `/element/${await find(xpath)}/click`, {}),
    type: async (xpath, text) => s("POST", `/element/${await find(xpath)}/value`, { text }),
    run: (script, args = []) => s("POST", "/execute/sync", { script, args }),
    close: () => s("DELETE", ""),
  };
}

const assert = (ok, message) => {
  if (!ok) throw new Error(message);
  console.log(`✓ ${message}`);
};

if (!existsSync(application)) throw new Error(`Нет сборки приложения: ${application}`);

// 1. Первый запуск: создаём заметку.
let app = await session();
assert(await app.run("return '__TAURI_INTERNALS__' in window"), "интерфейс открыт внутри Tauri");
await app.click(`(//button[@aria-label="Создать заметку" or normalize-space()="Создать заметку"])[1]`);
await app.type(`//*[@aria-label="Заголовок заметки"]`, title);
await app.find(`//*[contains(@class,"save-state") and contains(., "Сохранено")]`);
assert(true, "заметка создана и сохранена на устройстве");
await new Promise((r) => setTimeout(r, 500));
await app.close();

// 2. Данные — в SQLite приложения.
const dbPath = join(dataDir, "mayak.sqlite3");
assert(existsSync(dbPath), `база SQLite создана: ${dbPath}`);
const db = new DatabaseSync(dbPath, { readOnly: true });
const rows = db.prepare("select value from kv where store = 'notes'").all();
assert(rows.some((r) => JSON.parse(r.value).document?.title === title), "заметка записана в таблицу kv");
db.close();

// Приложение разрешает одно окно (single-instance): второй запуск, пока первое
// ещё закрывается, просто передал бы ему управление. Ждём завершения процесса.
for (let i = 0; i < 40; i++) {
  try {
    execFileSync("pgrep", ["-f", application], { stdio: "ignore" });
  } catch {
    break;
  }
  await new Promise((r) => setTimeout(r, 250));
}

// 3. Повторный запуск: заметка на месте.
app = await session();
await app.run("location.hash = '#/notes'");
await app.find(`//*[contains(., ${JSON.stringify(title)}) and contains(@class, "note-item")]`);
assert(true, "после перезапуска заметка на месте");
const idb = await app.run("return indexedDB.databases ? indexedDB.databases().then((d) => d.map((x) => x.name)) : []");
assert(!idb.some((n) => String(n).startsWith("mayak:")), "IndexedDB не используется");
await app.close();
console.log("Готово: настольное приложение хранит заметки в SQLite.");
