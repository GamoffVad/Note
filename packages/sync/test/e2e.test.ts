import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { emptyDocument, newId, type NoteDocument } from "@mayak/domain";
import { LocalWriteError, MemoryBacking, MemoryLocalStore } from "@mayak/local-store";
import { createTestServer, openTestDatabase, resetDatabase, type TestServer } from "@mayak/server/testing";
import { describeSyncStatus, HttpTransport, noteSyncState, SyncEngine, type LocalNote } from "../src/index.ts";

const pool = await openTestDatabase();
if (!pool) console.warn("TEST_DATABASE_URL не задана — сквозные тесты синхронизации пропущены");

const BASE = "http://mayak.test/api/v1";
const HOUR = 3_600_000;

interface Device {
  engine: SyncEngine;
  backing: MemoryBacking;
  store: MemoryLocalStore;
  net: { online: boolean; dropNextPushResponse: boolean; beforePush: (() => Promise<void>) | null; token: string | null };
  clock: { t: number };
  id: string;
  /** Имитирует аварийное закрытие и повторный запуск приложения на том же диске. */
  restart(): Device;
}

let server: TestServer;

function device(user: string, options: { clockOffsetMs?: number; backing?: MemoryBacking; id?: string } = {}): Device {
  const backing = options.backing ?? new MemoryBacking();
  const id = options.id ?? newId();
  const store = new MemoryLocalStore(backing);
  const net: Device["net"] = { online: true, dropNextPushResponse: false, beforePush: null, token: `Bearer dev:${user}` };
  const clock = { t: Date.now() + (options.clockOffsetMs ?? 0) };
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    if (!net.online) throw new TypeError("fetch failed");
    const isPush = String(input).endsWith("/sync/push");
    if (isPush && net.beforePush) {
      const hook = net.beforePush;
      net.beforePush = null;
      await hook();
    }
    const response = await server.fetch(input, init);
    if (isPush && net.dropNextPushResponse) {
      // Сервер уже зафиксировал изменения, но ответ до клиента не дошёл.
      net.dropNextPushResponse = false;
      throw new TypeError("connection reset");
    }
    return response;
  }) as typeof fetch;
  const transport = new HttpTransport({ baseUrl: BASE, deviceId: id, getAuthorization: () => net.token, fetch: fetchImpl });
  const engine = new SyncEngine({
    store,
    transport,
    device: { id, name: `${user} ${id.slice(0, 4)}`, platform: "linux" },
    now: () => clock.t,
  });
  const d: Device = {
    engine,
    backing,
    store,
    net,
    clock,
    id,
    restart() {
      store.close();
      return device(user, { backing, id, clockOffsetMs: options.clockOffsetMs });
    },
  };
  return d;
}

function doc(title: string, text = title, extra: Partial<NoteDocument> = {}): NoteDocument {
  return { ...emptyDocument(), title, blocks: [{ id: newId(), type: "markdown", text }], ...extra };
}

async function note(d: Device, id: string): Promise<LocalNote> {
  const n = await d.engine.getNote(id);
  if (!n) throw new Error(`нет заметки ${id}`);
  return n;
}

async function serverChanges(): Promise<number> {
  const { rows } = await pool!.query("select count(*)::int as n from mayak.changes");
  return rows[0].n;
}

describe.skipIf(!pool)("SyncEngine ↔ API ↔ PostgreSQL", () => {
  beforeEach(async () => {
    await resetDatabase(pool!);
    server = createTestServer(pool!);
  });

  afterAll(async () => {
    await pool?.end();
  });

  it("A01: заметка с одного устройства появляется на другом с тем же id и текстом", async () => {
    const windows = device("alice");
    const android = device("alice");
    const created = await windows.engine.createNote(doc("Планы на осень", "Купить билеты"));
    expect((await windows.engine.syncOnce()).state).toBe("idle");
    await android.engine.syncOnce();
    const received = await note(android, created.id);
    expect(received.document).toEqual(created.document);
    expect(received.serverRevision).toBe(1);
  });

  it("A02/A03: правка без сети переживает падение процесса и отправляется без дубликата", async () => {
    const win = device("alice");
    await win.engine.syncOnce();
    win.net.online = false;
    const created = await win.engine.createNote(doc("Офлайн", "черновик"));
    await win.engine.editNote(created.id, doc("Офлайн", "подтверждённый текст"));
    const offline = await win.engine.syncOnce();
    expect(offline.state).toBe("offline");
    expect(describeSyncStatus(offline).text).toBe("Нет сети. Изменения сохранены на устройстве");

    // Процесс убит; при следующем запуске текст на месте.
    const reopened = win.restart();
    const restored = await note(reopened, created.id);
    expect(restored.document.blocks[0]).toMatchObject({ text: "подтверждённый текст" });
    expect(await reopened.engine.getOutbox()).toHaveLength(1);

    reopened.clock.t += HOUR; // окно повтора прошло
    expect((await reopened.engine.syncOnce()).state).toBe("idle");
    expect(await reopened.engine.getOutbox()).toHaveLength(0);

    const mac = device("alice");
    await mac.engine.syncOnce();
    const notes = await mac.engine.listNotes();
    expect(notes).toHaveLength(1);
    expect(notes[0]!.document.blocks[0]).toMatchObject({ text: "подтверждённый текст" });
    expect(await serverChanges()).toBe(1);
  });

  it("A04: правки одной заметки офлайн на двух устройствах дают явный конфликт; «Сохранить обе»", async () => {
    const a = device("alice");
    const b = device("alice");
    const created = await a.engine.createNote(doc("Общая", "исходный"));
    await a.engine.syncOnce();
    await b.engine.syncOnce();

    a.net.online = false;
    b.net.online = false;
    await a.engine.editNote(created.id, doc("Общая", "версия A"));
    await b.engine.editNote(created.id, doc("Общая", "версия B"));
    a.net.online = true;
    b.net.online = true;
    a.clock.t += HOUR;
    b.clock.t += HOUR;

    await a.engine.syncOnce();
    const status = await b.engine.syncOnce();
    expect(status.conflictCount).toBe(1);
    expect(describeSyncStatus(status).text).toBe("Найдены изменения с другого устройства");

    // Обе версии доступны: локальная в заметке, серверная в записи конфликта.
    const [conflict] = await b.engine.getConflicts();
    expect(conflict!.server!.document.blocks[0]).toMatchObject({ text: "версия A" });
    expect((await note(b, created.id)).document.blocks[0]).toMatchObject({ text: "версия B" });
    expect(noteSyncState(await note(b, created.id), undefined, conflict)).toBe("conflict");

    const { copyId } = await b.engine.resolveConflict(created.id, "both");
    await b.engine.syncOnce();
    await a.engine.syncOnce();

    const original = await note(a, created.id);
    const copy = await note(a, copyId!);
    expect(original.document.blocks[0]).toMatchObject({ text: "версия A" });
    expect(copy.document.blocks[0]).toMatchObject({ text: "версия B" });
    expect(copy.document.conflictOf).toBe(created.id);
    expect(await b.engine.getConflicts()).toHaveLength(0);
  });

  it("A05: удаление на одном устройстве не стирает правку на другом", async () => {
    const a = device("alice");
    const b = device("alice");
    const created = await a.engine.createNote(doc("Список", "старый"));
    await a.engine.syncOnce();
    await b.engine.syncOnce();

    await a.engine.setDeleted(created.id, true);
    await a.engine.syncOnce();
    b.net.online = false;
    await b.engine.editNote(created.id, doc("Список", "важная правка"));
    b.net.online = true;
    b.clock.t += HOUR;
    await b.engine.syncOnce();

    const [conflict] = await b.engine.getConflicts();
    expect(conflict!.server!.deleted).toBe(true);
    await b.engine.resolveConflict(created.id, "mine");
    await b.engine.syncOnce();
    await a.engine.syncOnce();
    const onA = await note(a, created.id);
    expect(onA.deleted).toBe(false);
    expect(onA.document.blocks[0]).toMatchObject({ text: "важная правка" });
  });

  it("A07: ответ потерян после commit сервера — повтор возвращает прежний ack, без дубликата", async () => {
    const a = device("alice");
    await a.engine.syncOnce();
    const created = await a.engine.createNote(doc("Потерянный ответ"));
    a.net.dropNextPushResponse = true;
    expect((await a.engine.syncOnce()).state).toBe("offline");
    const [pending] = await a.engine.getOutbox();
    expect(pending!.sent).toBe(true);
    expect(noteSyncState(await note(a, created.id), pending, undefined)).toBe("syncing");

    a.clock.t += HOUR;
    await a.engine.syncOnce();
    expect(await a.engine.getOutbox()).toHaveLength(0);
    expect((await note(a, created.id)).serverRevision).toBe(1);
    expect(await serverChanges()).toBe(1);
  });

  it("A07: своё изменение, пришедшее через pull до повтора, считается подтверждением", async () => {
    const a = device("alice");
    await a.engine.syncOnce();
    const created = await a.engine.createNote(doc("Через pull"));
    a.net.dropNextPushResponse = true;
    await a.engine.syncOnce();
    // Окно повтора ещё не прошло: push пропускается, pull приносит наше изменение.
    await a.engine.syncOnce();
    expect(await a.engine.getOutbox()).toHaveLength(0);
    expect(await a.engine.getConflicts()).toHaveLength(0);
    const n = await note(a, created.id);
    expect(n.serverRevision).toBe(1);
    expect(noteSyncState(n, undefined, undefined)).toBe("cloud-saved");
  });

  it("правка во время отправки не теряется и уходит следующей ревизией", async () => {
    const a = device("alice");
    await a.engine.syncOnce();
    const created = await a.engine.createNote(doc("Набор", "первое"));
    a.net.beforePush = async () => {
      await a.engine.editNote(created.id, doc("Набор", "второе, набрано во время запроса"));
    };
    await a.engine.syncOnce();
    const n = await note(a, created.id);
    expect(n.document.blocks[0]).toMatchObject({ text: "второе, набрано во время запроса" });
    // Отправленная запись неизменна, поэтому сервер сначала получил «первое»,
    // а новая правка ушла следующей мутацией в том же цикле.
    expect(n.serverRevision).toBe(2);
    expect(await a.engine.getOutbox()).toHaveLength(0);
    const { rows } = await pool!.query("select document from mayak.notes");
    expect(rows[0].document.blocks[0].text).toBe("второе, набрано во время запроса");
  });

  it("A08: смещённые часы устройств не влияют на результат", async () => {
    const future = device("alice", { clockOffsetMs: 365 * 24 * HOUR });
    const past = device("alice", { clockOffsetMs: -365 * 24 * HOUR });
    const created = await future.engine.createNote(doc("Часы", "из будущего"));
    await future.engine.syncOnce();
    await past.engine.syncOnce();
    // Позже по реальному порядку, но «раньше» по часам устройства.
    await past.engine.editNote(created.id, doc("Часы", "правка из прошлого"));
    await past.engine.syncOnce();
    await future.engine.syncOnce();
    expect((await note(future, created.id)).document.blocks[0]).toMatchObject({ text: "правка из прошлого" });

    // Одновременные правки — конфликт, а не «последний по часам выигрывает».
    future.net.online = false;
    await future.engine.editNote(created.id, doc("Часы", "будущее снова"));
    await past.engine.editNote(created.id, doc("Часы", "прошлое снова"));
    await past.engine.syncOnce();
    future.net.online = true;
    future.clock.t += HOUR;
    expect((await future.engine.syncOnce()).conflictCount).toBe(1);
  });

  it("A09: отметка задачи в общем списке меняет тот же блок на другом устройстве", async () => {
    const a = device("alice");
    const b = device("alice");
    const taskId = newId();
    const created = await a.engine.createNote({
      ...emptyDocument(),
      title: "Дела",
      blocks: [{ id: taskId, type: "task", text: "Отправить материалы", checked: false }],
    });
    await a.engine.syncOnce();
    await b.engine.syncOnce();
    const [task] = await b.engine.listTasks();
    expect(task).toMatchObject({ noteId: created.id, blockId: taskId, checked: false });
    await b.engine.setTaskChecked(task!.noteId, task!.blockId, true);
    await b.engine.syncOnce();
    await a.engine.syncOnce();
    expect((await note(a, created.id)).document.blocks).toEqual([
      { id: taskId, type: "task", text: "Отправить материалы", checked: true },
    ]);
  });

  it("A17: после 410 полная ресинхронизация сохраняет локальные правки и не воскрешает удалённое", async () => {
    const a = device("alice");
    const b = device("alice");
    const shared = await a.engine.createNote(doc("Общая", "исходный"));
    const doomed = await a.engine.createNote(doc("Будет удалена навсегда"));
    await a.engine.syncOnce();
    await b.engine.syncOnce();

    // У A — неразрешённый конфликт и правки поверх него.
    a.net.online = false;
    await a.engine.editNote(shared.id, doc("Общая", "A офлайн"));
    await b.engine.editNote(shared.id, doc("Общая", "B онлайн"));
    await b.engine.syncOnce();
    a.net.online = true;
    a.clock.t += HOUR;
    await a.engine.syncOnce();
    expect(await a.engine.getConflicts()).toHaveLength(1);
    await a.engine.editNote(shared.id, doc("Общая", "A продолжает во время конфликта"));

    // Сервер: ещё одна правка, окончательное удаление, очистка журнала.
    await b.engine.editNote(shared.id, doc("Общая", "B ещё раз"));
    await b.engine.syncOnce();
    const owner = await pool!.query("select id from mayak.users where auth_subject = 'dev|alice'");
    await pool!.query("delete from mayak.notes where id = $1", [doomed.id]);
    await pool!.query("insert into mayak.purged_ids(owner_id, entity_type, entity_id) values ($1, 'note', $2)", [
      owner.rows[0].id,
      doomed.id,
    ]);
    await pool!.query("update mayak.sync_heads set retained_from_seq = last_seq + 1");

    expect((await a.engine.syncOnce()).state).toBe("idle");
    expect((await note(a, shared.id)).document.blocks[0]).toMatchObject({ text: "A продолжает во время конфликта" });
    const [conflict] = await a.engine.getConflicts();
    expect(conflict!.server!.document.blocks[0]).toMatchObject({ text: "B ещё раз" });
    expect(await a.engine.getNote(doomed.id)).toBeUndefined();

    await a.engine.resolveConflict(shared.id, "mine");
    await a.engine.syncOnce();
    await b.engine.syncOnce();
    expect((await note(b, shared.id)).document.blocks[0]).toMatchObject({ text: "A продолжает во время конфликта" });
  });

  it("ошибка локальной записи не даёт ложного «сохранено»", async () => {
    const a = device("alice");
    const created = await a.engine.createNote(doc("Диск", "было"));
    a.backing.failNextCommit = true;
    await expect(a.engine.editNote(created.id, doc("Диск", "стало"))).rejects.toBeInstanceOf(LocalWriteError);
    expect((await note(a, created.id)).document.blocks[0]).toMatchObject({ text: "было" });
    const [entry] = await a.engine.getOutbox();
    expect(entry!.document.blocks[0]).toMatchObject({ text: "было" });
  });

  it("истёкшая сессия и отзыв устройства останавливают обмен, но не удаляют очередь", async () => {
    const a = device("alice");
    const phone = device("alice");
    await a.engine.syncOnce();
    await phone.engine.syncOnce();

    a.net.token = null;
    await a.engine.createNote(doc("Без сессии"));
    const noSession = await a.engine.syncOnce();
    expect(noSession.state).toBe("auth-required");
    expect(describeSyncStatus(noSession).text).toBe("Войдите снова, чтобы продолжить синхронизацию");
    expect(await a.engine.getOutbox()).toHaveLength(1);
    a.net.token = "Bearer dev:alice";
    expect((await a.engine.syncOnce()).state).toBe("idle");

    await pool!.query("update mayak.devices set revoked_at = now() where id = $1", [phone.id]);
    await phone.engine.createNote(doc("После отзыва"));
    const revoked = await phone.engine.syncOnce();
    expect(revoked.state).toBe("forbidden");
    expect(await phone.engine.getOutbox()).toHaveLength(1);
    // Локальная заметка на месте; после отзыва устройство ничего не получает с сервера.
    expect((await phone.engine.listNotes()).map((n) => n.document.title)).toEqual(["После отзыва"]);
  });

  it("слишком большая заметка сохраняется локально и помечается ошибкой, остальное уходит", async () => {
    const a = device("alice");
    const big = await a.engine.createNote(doc("Большая", "я".repeat(600_000)));
    const small = await a.engine.createNote(doc("Маленькая"));
    const status = await a.engine.syncOnce();
    expect(status.failedCount).toBe(1);
    expect(status.pendingCount).toBe(0);
    const [failed] = await a.engine.getOutbox();
    expect(failed).toMatchObject({ entityId: big.id, failure: { code: "PAYLOAD_TOO_LARGE" } });
    expect((await note(a, small.id)).serverRevision).toBe(1);
    expect((await note(a, big.id)).document.blocks[0]!).toMatchObject({ type: "markdown" });
    // Исправленная правка снимает отказ и уходит.
    await a.engine.editNote(big.id, doc("Большая", "сокращено"));
    expect((await a.engine.syncOnce()).failedCount).toBe(0);
    expect((await note(a, big.id)).serverRevision).toBe(1);
  });

  it("пустой аккаунт на новом устройстве: bootstrap и дальнейшие правки", async () => {
    const a = device("alice");
    for (let i = 0; i < 3; i++) await a.engine.createNote(doc(`Заметка ${i}`));
    await a.engine.syncOnce();
    const fresh = device("alice");
    const status = await fresh.engine.syncOnce();
    expect(status.receivedInLastCycle).toBe(3);
    expect(await fresh.engine.listNotes()).toHaveLength(3);
    const bob = device("bob");
    await bob.engine.syncOnce();
    expect(await bob.engine.listNotes()).toHaveLength(0);
  });
});
