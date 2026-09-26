import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { HEADER_DEVICE, newId, stableStringify, type NoteMutation, type PullResponse } from "@mayak/domain";
import { createTestServer, openTestDatabase, resetDatabase, type TestServer } from "../src/testing.ts";

const pool = await openTestDatabase();
if (!pool) console.warn("TEST_DATABASE_URL не задана — серверные тесты пропущены");

const BASE = "http://mayak.test/api/v1";

class Client {
  readonly deviceId = newId();
  constructor(
    private readonly server: TestServer,
    readonly user: string,
  ) {}

  async call(method: string, path: string, body?: unknown, extraHeaders: Record<string, string> = {}) {
    const response = await this.server.fetch(BASE + path, {
      method,
      headers: {
        authorization: `Bearer dev:${this.user}`,
        [HEADER_DEVICE]: this.deviceId,
        "content-type": "application/json",
        ...extraHeaders,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await response.text();
    return { status: response.status, body: text ? JSON.parse(text) : null };
  }

  register() {
    return this.call("POST", "/devices", { id: this.deviceId, name: `Устройство ${this.user}`, platform: "linux" });
  }

  push(mutations: unknown[]) {
    return this.call("POST", "/sync/push", { protocolVersion: 1, deviceId: this.deviceId, mutations });
  }

  async pullAll(): Promise<{ changes: PullResponse["changes"]; cursor: string }> {
    const boot = await this.call("GET", "/bootstrap");
    let cursor: string = boot.body.highWaterCursor;
    const changes: PullResponse["changes"] = [];
    for (;;) {
      const page = await this.call("GET", `/sync/pull?cursor=${cursor}`);
      expect(page.status).toBe(200);
      changes.push(...page.body.changes);
      cursor = page.body.nextCursor;
      if (!page.body.hasMore) return { changes, cursor };
    }
  }
}

function mutation(entityId: string, baseRevision: number, text: string, extra: Partial<NoteMutation> = {}): NoteMutation {
  return {
    mutationId: newId(),
    entity: "note",
    entityId,
    baseRevision,
    operation: "upsert",
    document: { title: text, blocks: [{ id: newId(), type: "markdown", text }], tags: [], pinned: false },
    deleted: false,
    ...extra,
  };
}

describe.skipIf(!pool)("API синхронизации на PostgreSQL", () => {
  let server: TestServer;
  let alice: Client;

  beforeEach(async () => {
    await resetDatabase(pool!);
    server = createTestServer(pool!);
    alice = new Client(server, "alice");
    expect((await alice.register()).status).toBe(201);
  });

  afterAll(async () => {
    await pool?.end();
  });

  it("создаёт заметку, увеличивает ревизию и отдаёт изменения по курсору", async () => {
    const id = newId();
    const first = await alice.push([mutation(id, 0, "Планы на осень")]);
    expect(first.status).toBe(200);
    expect(first.body.results[0]).toMatchObject({ status: "applied", revision: 1, seq: 1 });
    const second = await alice.push([mutation(id, 1, "Планы на осень — дополнено")]);
    expect(second.body.results[0]).toMatchObject({ status: "applied", revision: 2, seq: 2 });

    const boot = await alice.call("GET", "/bootstrap");
    expect(boot.body.notes).toHaveLength(1);
    expect(boot.body.notes[0]).toMatchObject({ id, revision: 2, deleted: false });
  });

  it("A06: десять повторов одного mutationId дают одну ревизию и один результат", async () => {
    const id = newId();
    const m = mutation(id, 0, "Один раз");
    const results = [];
    for (let i = 0; i < 10; i++) results.push((await alice.push([m])).body.results[0]);
    // jsonb меняет порядок ключей, поэтому сравниваем канонический JSON.
    expect(new Set(results.map((r) => stableStringify(r))).size).toBe(1);
    expect(results[0]).toMatchObject({ status: "applied", revision: 1 });
    const { rows } = await pool!.query("select count(*)::int as n from changes");
    expect(rows[0].n).toBe(1);
    const versions = await pool!.query("select count(*)::int as n from note_versions");
    expect(versions.rows[0].n).toBe(1);
  });

  it("A06: параллельные повторы одного mutationId тоже применяются один раз", async () => {
    const m = mutation(newId(), 0, "Параллельно");
    const results = await Promise.all(Array.from({ length: 10 }, () => alice.push([m])));
    expect(new Set(results.map((r) => stableStringify(r.body.results[0]))).size).toBe(1);
    const { rows } = await pool!.query("select count(*)::int as n from changes");
    expect(rows[0].n).toBe(1);
  });

  it("тот же mutationId с другим телом отклоняется", async () => {
    const m = mutation(newId(), 0, "Первое тело");
    await alice.push([m]);
    const again = await alice.push([{ ...m, document: { ...m.document, title: "Другое тело" } }]);
    expect(again.body.results[0]).toMatchObject({ status: "rejected", code: "IDEMPOTENCY_MISMATCH" });
  });

  it("устаревшая baseRevision — конфликт с серверным снимком, без изменения данных", async () => {
    const id = newId();
    await alice.push([mutation(id, 0, "v1")]);
    await alice.push([mutation(id, 1, "v2")]);
    const stale = await alice.push([mutation(id, 1, "моя правка на v1")]);
    expect(stale.body.results[0]).toMatchObject({ status: "conflict", serverRevision: 2 });
    expect(stale.body.results[0].server.document.title).toBe("v2");
    const { rows } = await pool!.query("select revision from notes where id = $1", [id]);
    expect(Number(rows[0].revision)).toBe(2);
  });

  it("A08: при параллельных транзакциях курсор не пропускает ни одного изменения", async () => {
    const devices = await Promise.all(
      Array.from({ length: 4 }, async () => {
        const c = new Client(server, "alice");
        await c.register();
        return c;
      }),
    );
    const boot = await alice.call("GET", "/bootstrap");
    let cursor: string = boot.body.highWaterCursor;
    const seen: number[] = [];
    let writing = true;
    const writers = Promise.all(
      devices.map(async (device) => {
        for (let i = 0; i < 15; i++) {
          const r = await device.push([mutation(newId(), 0, `${device.deviceId}-${i}`)]);
          expect(r.body.results[0].status).toBe("applied");
        }
      }),
    ).finally(() => {
      writing = false;
    });
    // Читаем одновременно с записью, маленькими страницами; после записи дочитываем хвост.
    let draining = false;
    for (;;) {
      const finished = !writing;
      const page = await alice.call("GET", `/sync/pull?cursor=${cursor}&limit=7`);
      seen.push(...page.body.changes.map((c: { seq: number }) => c.seq));
      cursor = page.body.nextCursor;
      if (draining && !page.body.hasMore) break;
      if (finished) draining = true;
    }
    await writers;
    expect(seen).toEqual(Array.from({ length: 60 }, (_, i) => i + 1));
  });

  it("A13: чужие заметки, история и курсор недоступны и не раскрываются", async () => {
    const id = newId();
    await alice.push([mutation(id, 0, "Секрет Алисы")]);
    const aliceCursor = (await alice.pullAll()).cursor;

    const bob = new Client(server, "bob");
    await bob.register();
    const history = await bob.call("GET", `/notes/${id}/history`);
    expect(history.status).toBe(404);
    expect(JSON.stringify(history.body)).not.toContain("Секрет");
    const restore = await bob.call("POST", `/notes/${id}/restore`, {
      versionId: newId(),
      baseRevision: 1,
      mutationId: newId(),
    });
    expect(restore.status).toBe(404);
    const pull = await bob.call("GET", `/sync/pull?cursor=${aliceCursor}`);
    expect(pull.status).toBe(400);
    expect(pull.body.code).toBe("INVALID_CURSOR");
    const bobBoot = await bob.call("GET", "/bootstrap");
    expect(bobBoot.body.notes).toEqual([]);

    // Тот же id у Боба — отдельный объект в его пространстве; заметка Алисы не меняется.
    const bobPush = await bob.push([mutation(id, 0, "Заметка Боба")]);
    expect(bobPush.body.results[0]).toMatchObject({ status: "applied", revision: 1 });
    const aliceBoot = await alice.call("GET", "/bootstrap");
    expect(aliceBoot.body.notes[0].document.title).toBe("Секрет Алисы");

    // Чужое устройство нельзя использовать и нельзя перерегистрировать.
    const hijack = await new Client(server, "bob").call("GET", "/bootstrap", undefined, {
      [HEADER_DEVICE]: alice.deviceId,
    });
    expect(hijack.status).toBe(403);
    const reRegister = await bob.call("POST", "/devices", { id: alice.deviceId, name: "Чужое", platform: "web" });
    expect(reRegister.status).toBe(403);
  });

  it("A14: отозванное устройство теряет доступ", async () => {
    const phone = new Client(server, "alice");
    await phone.register();
    const devices = await alice.call("GET", "/devices");
    expect(devices.body.devices).toHaveLength(2);
    expect((await alice.call("DELETE", `/devices/${phone.deviceId}/session`)).status).toBe(204);
    const attempt = await phone.push([mutation(newId(), 0, "после отзыва")]);
    expect(attempt.status).toBe(403);
    expect(attempt.body.code).toBe("DEVICE_REVOKED");
    expect((await phone.register()).status).toBe(403);
  });

  it("без сессии — 401, старый протокол — 426, deviceId в теле обязан совпадать", async () => {
    const anonymous = await server.fetch(BASE + "/bootstrap", { headers: { [HEADER_DEVICE]: alice.deviceId } });
    expect(anonymous.status).toBe(401);
    const old = await alice.call("GET", "/bootstrap", undefined, { "x-mayak-protocol": "0" });
    expect(old.status).toBe(426);
    expect(old.body.code).toBe("UPGRADE_REQUIRED");
    const spoofed = await alice.call("POST", "/sync/push", {
      protocolVersion: 1,
      deviceId: newId(),
      mutations: [mutation(newId(), 0, "x")],
    });
    expect(spoofed.status).toBe(400);
  });

  it("проверяет схему и размер каждой мутации отдельно", async () => {
    const ok = mutation(newId(), 0, "нормальная");
    const big = mutation(newId(), 0, "большая");
    big.document.blocks[0] = { id: newId(), type: "markdown", text: "я".repeat(600_000) };
    const broken = { ...mutation(newId(), 0, "x"), baseRevision: -1 };
    const r = await alice.push([ok, big, broken]);
    expect(r.status).toBe(200);
    expect(r.body.results.map((x: { status: string; code?: string }) => x.code ?? x.status)).toEqual([
      "applied",
      "PAYLOAD_TOO_LARGE",
      "VALIDATION_FAILED",
    ]);
  });

  it("устаревший курсор получает 410 CURSOR_EXPIRED", async () => {
    await alice.push([mutation(newId(), 0, "a")]);
    const { cursor: start } = await alice.pullAll();
    await alice.push([mutation(newId(), 0, "b")]);
    await alice.push([mutation(newId(), 0, "c")]);
    // Имитация очистки журнала старше срока хранения.
    await pool!.query("update sync_heads set retained_from_seq = 3");
    const expired = await alice.call("GET", `/sync/pull?cursor=${start}`);
    expect(expired.status).toBe(410);
    expect(expired.body.code).toBe("CURSOR_EXPIRED");
  });

  it("A16: восстановление версии создаёт новую ревизию; устаревшая база — 409", async () => {
    const id = newId();
    await alice.push([mutation(id, 0, "первая версия")]);
    await alice.push([mutation(id, 1, "вторая версия")]);
    const history = await alice.call("GET", `/notes/${id}/history`);
    expect(history.body.versions.map((v: { revision: number }) => v.revision)).toEqual([2, 1]);
    const v1 = history.body.versions[1];
    const restored = await alice.call("POST", `/notes/${id}/restore`, {
      versionId: v1.versionId,
      baseRevision: 2,
      mutationId: newId(),
    });
    expect(restored.status).toBe(200);
    expect(restored.body).toMatchObject({ status: "applied", revision: 3 });
    const boot = await alice.call("GET", "/bootstrap");
    expect(boot.body.notes[0]).toMatchObject({ revision: 3, document: { title: "первая версия" } });
    const conflict = await alice.call("POST", `/notes/${id}/restore`, {
      versionId: v1.versionId,
      baseRevision: 2,
      mutationId: newId(),
    });
    expect(conflict.status).toBe(409);
    expect(conflict.body.code).toBe("REVISION_CONFLICT");
  });

  it("окончательно удалённый id нельзя создать заново", async () => {
    const id = newId();
    const { rows } = await pool!.query("select id from users where auth_subject = 'dev|alice'");
    await pool!.query("insert into purged_ids(owner_id, entity_type, entity_id) values ($1, 'note', $2)", [
      rows[0].id,
      id,
    ]);
    const r = await alice.push([mutation(id, 0, "воскрешение")]);
    expect(r.body.results[0]).toMatchObject({ status: "rejected", code: "ENTITY_PURGED" });
  });

  it("корзина: удаление и восстановление — обычные ревизии", async () => {
    const id = newId();
    const m = mutation(id, 0, "в корзину");
    await alice.push([m]);
    const del = await alice.push([{ ...mutation(id, 1, "в корзину"), deleted: true }]);
    expect(del.body.results[0]).toMatchObject({ status: "applied", revision: 2 });
    let boot = await alice.call("GET", "/bootstrap");
    expect(boot.body.notes[0].deleted).toBe(true);
    await alice.push([mutation(id, 2, "в корзину")]);
    boot = await alice.call("GET", "/bootstrap");
    expect(boot.body.notes[0]).toMatchObject({ deleted: false, revision: 3 });
  });

  it("bootstrap отдаёт снимок постранично с единым high-water курсором", async () => {
    for (let i = 0; i < 5; i++) await alice.push([mutation(newId(), 0, `n${i}`)]);
    const first = await alice.call("GET", "/bootstrap?limit=2");
    expect(first.body.notes).toHaveLength(2);
    await alice.push([mutation(newId(), 0, "после первой страницы")]);
    const ids = first.body.notes.map((n: { id: string }) => n.id);
    let token = first.body.nextAfter;
    while (token) {
      const page = await alice.call("GET", `/bootstrap?limit=2&after=${token}`);
      expect(page.body.highWaterCursor).toBe(first.body.highWaterCursor);
      ids.push(...page.body.notes.map((n: { id: string }) => n.id));
      token = page.body.nextAfter;
    }
    const tail = await alice.call("GET", `/sync/pull?cursor=${first.body.highWaterCursor}`);
    expect(tail.body.changes).toHaveLength(1);
    expect(tail.body.changes[0].note.document.title).toBe("после первой страницы");
    expect(new Set(ids).size).toBe(ids.length);
  });
});
