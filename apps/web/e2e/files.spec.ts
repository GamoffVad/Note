import { expect, test, type Request } from "@playwright/test";
import { device, signIn, type ExtraHandler } from "./supabase-mock.ts";

/**
 * Вкладка «Файлы»: файл, отправленный с одного устройства, появляется на
 * другом устройстве того же аккаунта, сохраняется там и удаляется.
 * Хранилище Supabase Storage и таблица public.transfers имитируются в памяти
 * с проверкой владельца по токену, как RLS в настоящем проекте.
 */
test.skip(!process.env.MAYAK_E2E_DATABASE_URL, "MAYAK_E2E_DATABASE_URL не задана — вход через аккаунт не проверяется");

interface Row {
  id: string;
  user_id: string;
  name: string;
  size: number;
  mime: string;
  device_name: string;
  created_at: string;
  expires_at: string;
}

const rows: Row[] = [];
const objects = new Map<string, { body: Buffer; type: string }>();

function userOf(request: Request): string {
  const token = (request.headers()["authorization"] ?? "").replace(/^Bearer /, "");
  const payload = JSON.parse(Buffer.from(token.split(".")[1] ?? "", "base64url").toString("utf8") || "{}") as { sub?: string };
  return payload.sub ?? "";
}

/** Содержимое файла из составного тела (multipart/form-data) или тело целиком. */
function fileBody(request: Request): { body: Buffer; type: string } {
  const raw = request.postDataBuffer() ?? Buffer.alloc(0);
  const type = request.headers()["content-type"] ?? "";
  const boundary = type.match(/boundary=(.+)$/)?.[1];
  if (!boundary) return { body: raw, type };
  const start = raw.indexOf("\r\n\r\n", raw.indexOf("filename=")) + 4;
  const end = raw.indexOf(`\r\n--${boundary}`, start);
  const headers = raw.subarray(0, start).toString("utf8");
  return { body: raw.subarray(start, end), type: headers.match(/Content-Type: ([^\r\n]+)/i)?.[1] ?? "application/octet-stream" };
}

/** «gt.2026-…» / «eq.x» / «in.(a,b)» из PostgREST. */
function filter(url: URL, key: string): { op: string; value: string } | null {
  const raw = url.searchParams.get(key);
  if (!raw) return null;
  const dot = raw.indexOf(".");
  return { op: raw.slice(0, dot), value: raw.slice(dot + 1) };
}

const storageAndRest: ExtraHandler = async (route, request, path) => {
  const url = new URL(request.url());
  const user = userOf(request);
  const json = (status: number, body: unknown) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
  if (path === "/rest/v1/transfers") {
    let mine = rows.filter((r) => r.user_id === user);
    const expires = filter(url, "expires_at");
    if (expires) mine = mine.filter((r) => (expires.op === "gt" ? r.expires_at > expires.value : r.expires_at <= expires.value));
    const id = filter(url, "id");
    if (id) {
      const ids = id.op === "in" ? id.value.replace(/[()]/g, "").split(",") : [id.value];
      mine = mine.filter((r) => ids.includes(r.id));
    }
    if (request.method() === "GET") {
      await json(200, [...mine].sort((a, b) => b.created_at.localeCompare(a.created_at)));
      return true;
    }
    if (request.method() === "POST") {
      const body = request.postDataJSON() as Omit<Row, "user_id" | "created_at" | "expires_at">;
      const now = Date.now();
      rows.push({ ...body, user_id: user, created_at: new Date(now).toISOString(), expires_at: new Date(now + 7 * 86_400_000).toISOString() });
      await route.fulfill({ status: 201, body: "" });
      return true;
    }
    if (request.method() === "DELETE") {
      for (const r of mine) rows.splice(rows.indexOf(r), 1);
      await route.fulfill({ status: 204, body: "" });
      return true;
    }
  }
  const object = path.match(/^\/storage\/v1\/object\/(?:authenticated\/)?transfers\/(.+)$/);
  if (object) {
    const key = decodeURIComponent(object[1]!);
    if (!key.startsWith(`${user}/`)) {
      await json(403, { statusCode: "403", error: "Unauthorized", message: "new row violates row-level security policy" });
      return true;
    }
    if (request.method() === "POST") {
      objects.set(key, fileBody(request));
      await json(200, { Key: `transfers/${key}` });
      return true;
    }
    if (request.method() === "GET") {
      const found = objects.get(key);
      if (!found) await json(404, { statusCode: "404", error: "not_found", message: "Object not found" });
      else await route.fulfill({ status: 200, contentType: found.type, body: found.body });
      return true;
    }
  }
  if (path === "/storage/v1/object/transfers" && request.method() === "DELETE") {
    const { prefixes } = request.postDataJSON() as { prefixes: string[] };
    for (const key of prefixes) if (key.startsWith(`${user}/`)) objects.delete(key);
    await json(200, prefixes.map((name) => ({ name })));
    return true;
  }
  return false;
};

test("файл с одного устройства появляется на другом, сохраняется и удаляется", async ({ browser }) => {
  const email = `files-${Date.now()}@example.com`;
  const laptop = await device(browser, storageAndRest);
  const phone = await device(browser, storageAndRest);

  // Без входа — объяснение и путь к входу.
  await laptop.page.goto("/#/files");
  await expect(laptop.page.getByText("Войдите, чтобы передавать файлы")).toBeVisible();

  await signIn(laptop.page, email);
  await expect(laptop.page.getByText(`Вы вошли как ${email}`)).toBeVisible();
  await signIn(phone.page, email);
  await expect(phone.page.getByText(`Вы вошли как ${email}`)).toBeVisible();

  await laptop.page.goto("/#/files");
  await expect(laptop.page.getByText("Файлов пока нет")).toBeVisible();
  await laptop.page.locator("input[type=file]").setInputFiles({
    name: "Отчёт за сентябрь.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("Привет с ноутбука", "utf8"),
  });
  await expect(laptop.page.getByText("Отправлено: Отчёт за сентябрь.txt", { exact: false })).toBeVisible();
  await expect(laptop.page.getByRole("list", { name: "Файлы для передачи" }).getByText("Отчёт за сентябрь.txt")).toBeVisible();

  // На втором устройстве файл виден и сохраняется с тем же содержимым.
  await phone.page.goto("/#/files");
  const item = phone.page.getByRole("listitem").filter({ hasText: "Отчёт за сентябрь.txt" });
  await expect(item).toBeVisible();
  await expect(item).toContainText("удалится через 7 дней");
  const download = phone.page.waitForEvent("download");
  await item.getByRole("button", { name: "Сохранить" }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe("Отчёт за сентябрь.txt");
  const chunks: Buffer[] = [];
  for await (const chunk of (await file.createReadStream())!) chunks.push(chunk as Buffer);
  expect(Buffer.concat(chunks).toString("utf8")).toBe("Привет с ноутбука");

  // Удаление — пропадает и из хранилища, и из списка на другом устройстве.
  await item.getByRole("button", { name: "Удалить Отчёт за сентябрь.txt" }).click();
  await expect(item).toHaveCount(0);
  expect(objects.size).toBe(0);
  await laptop.page.reload();
  await expect(laptop.page.getByText("Файлов пока нет")).toBeVisible();

  // Чужие файлы недоступны: другой аккаунт видит пустой список.
  const stranger = await device(browser, storageAndRest);
  await signIn(stranger.page, `other-${Date.now()}@example.com`);
  await stranger.page.goto("/#/files");
  await expect(stranger.page.getByText("Файлов пока нет")).toBeVisible();

  expect([...laptop.unexpected, ...phone.unexpected, ...stranger.unexpected]).toEqual([]);
});
