import { randomUUID } from "node:crypto";
import {
  HEADER_DEVICE,
  HEADER_PROTOCOL,
  isUuid,
  MAX_PUSH_BODY_BYTES,
  PROTOCOL_VERSION,
  PushRequestSchema,
  type MutationResult,
} from "@mayak/domain";
import { AuthUnavailableError, type AuthProvider } from "./auth.ts";
import { ApiError } from "./errors.ts";
import type { RequestContext, SyncService } from "./service.ts";

export interface ApiOptions {
  service: SyncService;
  auth: AuthProvider;
  basePath?: string;
  /** Журнал без содержимого заметок, токенов и имён файлов. */
  log?: (entry: { requestId: string; method: string; route: string; status: number; ms: number; error?: string }) => void;
}

const MAX_JSON_BODY_BYTES = 64 * 1024;

/**
 * Обработчик /api/v1 в стандарте Fetch API (Request → Response).
 * Подходит для Vercel Functions и для локального Node-сервера.
 */
export function createApiHandler(options: ApiOptions): (request: Request) => Promise<Response> {
  const basePath = options.basePath ?? "/api/v1";
  const { service, auth } = options;

  return async (request) => {
    const started = Date.now();
    const requestId = randomUUID();
    const url = new URL(request.url);
    let route = "unknown";
    let status = 500;
    let errorCode: string | undefined;
    try {
      if (!url.pathname.startsWith(basePath + "/")) throw new ApiError("NOT_FOUND", "Маршрут не найден");
      const path = url.pathname.slice(basePath.length).replace(/\/+$/, "");
      const segments = path.split("/").filter(Boolean);
      route = routeName(request.method, segments);

      // Проверка состояния для мониторинга: без входа, без данных пользователей.
      if (route === "GET /health") {
        try {
          await service.ping();
        } catch (error) {
          errorCode = `DB:${(error as { code?: string })?.code ?? (error as Error)?.name ?? "Error"}`;
          status = 503;
          return json(503, { status: "unavailable", database: "unavailable" }, { "cache-control": "no-store" });
        }
        status = 200;
        return json(200, { status: "ok", database: "ok" }, { "cache-control": "no-store" });
      }

      const protocolHeader = request.headers.get(HEADER_PROTOCOL);
      if (protocolHeader !== null && Number(protocolHeader) !== PROTOCOL_VERSION) {
        throw new ApiError("UPGRADE_REQUIRED", "Обновите приложение, чтобы продолжить синхронизацию", {
          supportedProtocolVersion: PROTOCOL_VERSION,
        });
      }

      let identity;
      try {
        identity = await auth.authenticate(request);
      } catch (error) {
        if (error instanceof AuthUnavailableError) throw new ApiError("SERVICE_UNAVAILABLE", error.message);
        throw error;
      }
      if (!identity) throw new ApiError("UNAUTHORIZED", "Войдите снова, чтобы продолжить синхронизацию");
      const ownerId = await service.resolveUser(identity.subject);
      await service.assertSessionActive(ownerId, identity.sessionId);

      if (route === "POST /devices") {
        const device = await service.registerDevice(ownerId, await readJson(request, MAX_JSON_BODY_BYTES), identity.sessionId);
        status = 201;
        return json(201, device);
      }

      const deviceId = request.headers.get(HEADER_DEVICE);
      if (!isUuid(deviceId)) throw new ApiError("VALIDATION_FAILED", `Нужен заголовок ${HEADER_DEVICE}`);
      await service.authorizeDevice(ownerId, deviceId, identity.sessionId);
      const ctx: RequestContext = { ownerId, deviceId, sessionId: identity.sessionId };

      const response = await dispatch(service, ctx, route, segments, url, request);
      status = response.status;
      return response;
    } catch (error) {
      const apiError = error instanceof ApiError ? error : new ApiError("INTERNAL", "Внутренняя ошибка сервера");
      status = apiError.status;
      errorCode = error instanceof ApiError ? apiError.code : `INTERNAL:${(error as Error)?.name ?? "Error"}`;
      const headers: Record<string, string> = {};
      if (apiError.code === "RATE_LIMITED" || apiError.code === "SERVICE_UNAVAILABLE") headers["retry-after"] = "30";
      return json(apiError.status, apiError.toBody(requestId), headers);
    } finally {
      options.log?.({ requestId, method: request.method, route, status, ms: Date.now() - started, error: errorCode });
    }
  };
}

async function dispatch(
  service: SyncService,
  ctx: RequestContext,
  route: string,
  segments: string[],
  url: URL,
  request: Request,
): Promise<Response> {
  switch (route) {
    case "GET /bootstrap":
      return json(200, await service.bootstrap(ctx, url.searchParams.get("after"), intParam(url, "limit")));
    case "POST /sync/push": {
      const body = PushRequestSchema.safeParse(await readJson(request, MAX_PUSH_BODY_BYTES));
      if (!body.success) throw new ApiError("VALIDATION_FAILED", "Некорректный запрос синхронизации");
      if (body.data.deviceId !== ctx.deviceId) {
        throw new ApiError("VALIDATION_FAILED", "deviceId в теле не совпадает с устройством сессии");
      }
      return json(200, { results: await service.push(ctx, body.data.mutations) });
    }
    case "GET /sync/pull": {
      const cursor = url.searchParams.get("cursor");
      if (!cursor) throw new ApiError("VALIDATION_FAILED", "Нужен параметр cursor; начните с /bootstrap");
      return json(200, await service.pull(ctx, cursor, intParam(url, "limit")));
    }
    case "GET /notes/:id/history": {
      const noteId = uuidSegment(segments[1]);
      const before = intParam(url, "before");
      return json(200, await service.history(ctx, noteId, before ?? null, intParam(url, "limit")));
    }
    case "POST /notes/:id/restore": {
      const result = await service.restore(ctx, uuidSegment(segments[1]), await readJson(request, MAX_JSON_BODY_BYTES));
      return mutationResponse(result);
    }
    case "GET /devices":
      return json(200, { devices: await service.listDevices(ctx) });
    case "DELETE /devices/:id/session":
      await service.revokeDevice(ctx, uuidSegment(segments[1]));
      return new Response(null, { status: 204, headers: { "cache-control": "no-store" } });
    default:
      throw new ApiError("NOT_FOUND", "Маршрут не найден");
  }
}

function mutationResponse(result: MutationResult): Response {
  if (result.status === "applied") return json(200, result);
  if (result.status === "conflict") {
    throw new ApiError("REVISION_CONFLICT", "Найдены изменения с другого устройства", {
      serverRevision: result.serverRevision,
      server: result.server,
    });
  }
  throw new ApiError(result.code, result.message);
}

function routeName(method: string, segments: string[]): string {
  const [a, b, c] = segments;
  if (segments.length === 1 && a === "health" && method === "GET") return "GET /health";
  if (segments.length === 1 && a === "bootstrap") return `${method} /bootstrap`;
  if (segments.length === 2 && a === "sync" && (b === "push" || b === "pull")) return `${method} /sync/${b}`;
  if (segments.length === 3 && a === "notes" && (c === "history" || c === "restore")) return `${method} /notes/:id/${c}`;
  if (segments.length === 1 && a === "devices") return `${method} /devices`;
  if (segments.length === 3 && a === "devices" && c === "session") return `${method} /devices/:id/session`;
  return `${method} ?`;
}

async function readJson(request: Request, maxBytes: number): Promise<unknown> {
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > maxBytes) throw new ApiError("PAYLOAD_TOO_LARGE", "Слишком большой запрос");
  const buffer = await request.arrayBuffer();
  if (buffer.byteLength > maxBytes) throw new ApiError("PAYLOAD_TOO_LARGE", "Слишком большой запрос");
  try {
    return JSON.parse(new TextDecoder().decode(buffer));
  } catch {
    throw new ApiError("VALIDATION_FAILED", "Тело запроса должно быть JSON");
  }
}

function intParam(url: URL, name: string): number | undefined {
  const raw = url.searchParams.get(name);
  if (raw === null) return undefined;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 0) throw new ApiError("VALIDATION_FAILED", `Некорректный параметр ${name}`);
  return value;
}

function uuidSegment(value: string | undefined): string {
  // Некорректный id неотличим от чужого: 404 без подробностей.
  if (!isUuid(value)) throw new ApiError("NOT_FOUND", "Объект не найден");
  return value.toLowerCase();
}

function json(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers },
  });
}
