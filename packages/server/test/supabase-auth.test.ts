import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT, type CryptoKey, type JWK } from "jose";
import { HEADER_DEVICE, newId } from "@mayak/domain";
import { AuthUnavailableError, createApiHandler, SupabaseAuthProvider, SyncService } from "../src/index.ts";
import { openTestDatabase, resetDatabase } from "../src/testing.ts";

/**
 * Реального проекта Supabase в тестах нет: токены подписываются своим ключом
 * ES256 с полями, как у Supabase Auth (iss, aud, sub, role, session_id).
 */
const PROJECT = "https://mayaktest.supabase.co";
const ISSUER = `${PROJECT}/auth/v1`;

let privateKey: CryptoKey;
let publicJwk: JWK;
let otherKey: CryptoKey;

beforeAll(async () => {
  const pair = await generateKeyPair("ES256", { extractable: true });
  privateKey = pair.privateKey;
  publicJwk = { ...(await exportJWK(pair.publicKey)), kid: "test-key", alg: "ES256", use: "sig" };
  otherKey = (await generateKeyPair("ES256")).privateKey;
});

interface Claims {
  sub?: string;
  aud?: string;
  iss?: string;
  role?: string;
  session_id?: string | undefined;
  is_anonymous?: boolean;
  expiresIn?: string;
}

async function token(claims: Claims = {}, key: CryptoKey = privateKey, kid = "test-key"): Promise<string> {
  const { expiresIn = "1h", ...rest } = claims;
  const payload: Record<string, unknown> = {
    role: "authenticated",
    session_id: newId(),
    is_anonymous: false,
    email: "user@example.com",
    aal: "aal1",
    ...rest,
  };
  if (payload.session_id === undefined) delete payload.session_id;
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "ES256", kid, typ: "JWT" })
    .setIssuer(claims.iss ?? ISSUER)
    .setAudience(claims.aud ?? "authenticated")
    .setSubject(claims.sub ?? newId())
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(key);
}

function provider() {
  return new SupabaseAuthProvider({ projectUrl: PROJECT, keys: createLocalJWKSet({ keys: [publicJwk] }) });
}

function req(bearer: string | null, init: RequestInit = {}, path = "/api/v1/bootstrap"): Request {
  const headers = new Headers(init.headers);
  if (bearer) headers.set("authorization", `Bearer ${bearer}`);
  return new Request(`http://mayak.test${path}`, { ...init, headers });
}

describe("SupabaseAuthProvider", () => {
  it("принимает токен проекта и возвращает пользователя и сессию", async () => {
    const sub = newId();
    const sessionId = newId();
    const identity = await provider().authenticate(req(await token({ sub, session_id: sessionId })));
    expect(identity).toEqual({ subject: `supabase|${sub}`, sessionId });
  });

  it.each<[string, Claims]>([
    ["чужой проект (issuer)", { iss: "https://other.supabase.co/auth/v1" }],
    ["аудитория anon", { aud: "anon" }],
    ["роль anon", { role: "anon" }],
    ["анонимный пользователь", { is_anonymous: true }],
    ["без session_id", { session_id: undefined }],
    ["истёкший токен", { expiresIn: "-5 minutes" }],
  ])("отклоняет: %s", async (_name, claims) => {
    expect(await provider().authenticate(req(await token(claims)))).toBeNull();
  });

  it("отклоняет чужую подпись, неизвестный ключ, HS256 и мусор", async () => {
    const p = provider();
    expect(await p.authenticate(req(await token({}, otherKey)))).toBeNull();
    expect(await p.authenticate(req(await token({}, privateKey, "unknown-kid")))).toBeNull();
    const hs = await new SignJWT({ role: "authenticated", session_id: newId() })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuer(ISSUER)
      .setAudience("authenticated")
      .setSubject(newId())
      .setExpirationTime("1h")
      .sign(new TextEncoder().encode("legacy-shared-secret-legacy-shared-secret"));
    expect(await p.authenticate(req(hs))).toBeNull();
    expect(await p.authenticate(req("not.a.jwt"))).toBeNull();
    expect(await p.authenticate(req(null))).toBeNull();
    expect(await p.authenticate(req("dev:alice"))).toBeNull();
  });

  describe("проекты со старой подписью HS256: подтверждение у Supabase Auth", () => {
    const secret = new TextEncoder().encode("legacy-shared-secret-legacy-shared-secret");
    async function hsToken(claims: Record<string, unknown> = {}, sub = newId()) {
      const { iss = ISSUER, ...rest } = claims;
      return new SignJWT({ role: "authenticated", session_id: newId(), is_anonymous: false, ...rest })
        .setProtectedHeader({ alg: "HS256", typ: "JWT" })
        .setIssuer(String(iss))
        .setAudience("authenticated")
        .setSubject(sub)
        .setIssuedAt()
        .setExpirationTime("1h")
        .sign(secret);
    }
    function remote(respond: (auth: string) => Response | Promise<Response>) {
      const calls: Array<{ url: string; apikey: string | null }> = [];
      const fake = (async (input: RequestInfo | URL, init?: RequestInit) => {
        const headers = new Headers(init?.headers);
        calls.push({ url: String(input), apikey: headers.get("apikey") });
        return respond(headers.get("authorization") ?? "");
      }) as typeof fetch;
      const p = new SupabaseAuthProvider({
        projectUrl: PROJECT,
        keys: createLocalJWKSet({ keys: [publicJwk] }),
        apiKey: "sb_publishable_test",
        fetch: fake,
      });
      return { p, calls };
    }

    it("принимает токен, который подтвердил Supabase Auth, и кэширует ответ", async () => {
      const sub = newId();
      const sessionId = newId();
      const { p, calls } = remote(() => Response.json({ id: sub }));
      const t = await hsToken({ session_id: sessionId }, sub);
      expect(await p.authenticate(req(t))).toEqual({ subject: `supabase|${sub}`, sessionId });
      expect(await p.authenticate(req(t))).not.toBeNull();
      expect(calls).toEqual([{ url: `${ISSUER}/user`, apikey: "sb_publishable_test" }]);
    });

    it("отклоняет: Supabase Auth ответил 401/403, другой пользователь, чужой issuer, аноним", async () => {
      expect(await remote(() => new Response(null, { status: 401 })).p.authenticate(req(await hsToken()))).toBeNull();
      expect(await remote(() => new Response(null, { status: 403 })).p.authenticate(req(await hsToken()))).toBeNull();
      expect(await remote(() => Response.json({ id: newId() })).p.authenticate(req(await hsToken()))).toBeNull();
      const ok = remote(() => Response.json({ id: "x" }));
      expect(await ok.p.authenticate(req(await hsToken({ iss: "https://other.supabase.co/auth/v1" })))).toBeNull();
      expect(await ok.p.authenticate(req(await hsToken({ is_anonymous: true })))).toBeNull();
      expect(ok.calls).toEqual([]);
    });

    it("недоступный Supabase Auth — временная ошибка", async () => {
      const down = remote(() => new Response(null, { status: 502 }));
      await expect(down.p.authenticate(req(await hsToken()))).rejects.toBeInstanceOf(AuthUnavailableError);
      const offline = remote(() => Promise.reject(new TypeError("fetch failed")));
      await expect(offline.p.authenticate(req(await hsToken()))).rejects.toBeInstanceOf(AuthUnavailableError);
    });
  });

  it("требует https для URL проекта", () => {
    expect(() => new SupabaseAuthProvider({ projectUrl: "http://evil.example.com" })).toThrow(/https/);
  });

  describe("удалённый JWKS", () => {
    let server: Server;
    let url: string;
    let fail = false;
    let requests = 0;

    beforeAll(async () => {
      server = createServer((_, res) => {
        requests++;
        if (fail) {
          res.writeHead(500).end();
          return;
        }
        res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ keys: [publicJwk] }));
      });
      await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
      url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/auth/v1/.well-known/jwks.json`;
    });
    afterAll(() => new Promise<void>((r) => server.close(() => r())));

    it("загружает ключи из JWKS проекта и кэширует их", async () => {
      const p = new SupabaseAuthProvider({ projectUrl: PROJECT, jwksUrl: url });
      requests = 0;
      expect(await p.authenticate(req(await token()))).not.toBeNull();
      expect(await p.authenticate(req(await token()))).not.toBeNull();
      expect(requests).toBe(1);
    });

    it("недоступный JWKS — временная ошибка, а не «войдите снова»", async () => {
      fail = true;
      const p = new SupabaseAuthProvider({ projectUrl: PROJECT, jwksUrl: url });
      await expect(p.authenticate(req(await token()))).rejects.toBeInstanceOf(AuthUnavailableError);
      fail = false;
    });
  });
});

const pool = await openTestDatabase();

describe.skipIf(!pool)("API с входом через Supabase", () => {
  let handler: (r: Request) => Promise<Response>;

  beforeEach(async () => {
    await resetDatabase(pool!);
    handler = createApiHandler({ service: new SyncService(pool!), auth: provider() });
  });
  afterAll(async () => {
    await pool?.end();
  });

  async function call(jwt: string, method: string, path: string, deviceId: string, body?: unknown) {
    const res = await handler(
      req(
        jwt,
        {
          method,
          headers: { [HEADER_DEVICE]: deviceId, "content-type": "application/json" },
          body: body === undefined ? undefined : JSON.stringify(body),
        },
        `/api/v1${path}`,
      ),
    );
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : null };
  }

  it("пользователь Supabase синхронизирует заметки; отзыв устройства закрывает его сессию", async () => {
    const user = newId();
    const laptop = { jwt: await token({ sub: user }), device: newId() };
    const phone = { jwt: await token({ sub: user }), device: newId() };

    for (const d of [laptop, phone]) {
      expect((await call(d.jwt, "POST", "/devices", d.device, { id: d.device, name: "Устройство", platform: "web" })).status).toBe(201);
    }
    const push = await call(laptop.jwt, "POST", "/sync/push", laptop.device, {
      protocolVersion: 1,
      deviceId: laptop.device,
      mutations: [
        {
          mutationId: newId(),
          entity: "note",
          entityId: newId(),
          baseRevision: 0,
          operation: "upsert",
          document: { title: "Из Supabase", blocks: [], tags: [], pinned: false },
          deleted: false,
        },
      ],
    });
    expect(push.body.results[0].status).toBe("applied");
    const boot = await call(phone.jwt, "GET", "/bootstrap", phone.device);
    expect(boot.body.notes[0].document.title).toBe("Из Supabase");

    // Ноутбук отзывает телефон: и устройство, и его сессия больше не принимаются.
    expect((await call(laptop.jwt, "DELETE", `/devices/${phone.device}/session`, laptop.device)).status).toBe(204);
    const again = await call(phone.jwt, "GET", "/bootstrap", phone.device);
    expect(again.status).toBe(401);
    expect(again.body.code).toBe("SESSION_REVOKED");
    const sneaky = newId();
    const reRegister = await call(phone.jwt, "POST", "/devices", sneaky, { id: sneaky, name: "Новое", platform: "web" });
    expect(reRegister.status).toBe(401);
    // Новый вход на телефоне — новая сессия и новое устройство.
    const fresh = { jwt: await token({ sub: user }), device: newId() };
    expect((await call(fresh.jwt, "POST", "/devices", fresh.device, { id: fresh.device, name: "Телефон", platform: "web" })).status).toBe(201);
    expect((await call(laptop.jwt, "GET", "/bootstrap", laptop.device)).status).toBe(200);
  });

  it("разные пользователи Supabase изолированы", async () => {
    const a = { jwt: await token(), device: newId() };
    const b = { jwt: await token(), device: newId() };
    await call(a.jwt, "POST", "/devices", a.device, { id: a.device, name: "A", platform: "web" });
    await call(b.jwt, "POST", "/devices", b.device, { id: b.device, name: "B", platform: "web" });
    const noteId = newId();
    await call(a.jwt, "POST", "/sync/push", a.device, {
      protocolVersion: 1,
      deviceId: a.device,
      mutations: [
        {
          mutationId: newId(),
          entity: "note",
          entityId: noteId,
          baseRevision: 0,
          operation: "upsert",
          document: { title: "Секрет A", blocks: [], tags: [], pinned: false },
          deleted: false,
        },
      ],
    });
    expect((await call(b.jwt, "GET", "/bootstrap", b.device)).body.notes).toEqual([]);
    expect((await call(b.jwt, "GET", `/notes/${noteId}/history`, b.device)).status).toBe(404);
    // Устройство A нельзя использовать с токеном B.
    expect((await call(b.jwt, "GET", "/bootstrap", a.device)).status).toBe(403);
  });

  it("без токена — 401, недоступный JWKS — 503 с Retry-After", async () => {
    expect((await handler(req(null))).status).toBe(401);
    const down = createApiHandler({
      service: new SyncService(pool!),
      auth: new SupabaseAuthProvider({ projectUrl: PROJECT, jwksUrl: "http://127.0.0.1:9/jwks.json" }),
    });
    const res = await down(req(await token(), { headers: { [HEADER_DEVICE]: newId() } }));
    expect(res.status).toBe(503);
    expect(res.headers.get("retry-after")).toBe("30");
    expect((await res.json()).code).toBe("SERVICE_UNAVAILABLE");
  });
});
