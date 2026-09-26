import {
  HEADER_DEVICE,
  HEADER_PROTOCOL,
  parseRetryAfter,
  PROTOCOL_VERSION,
  type ApiErrorBody,
  type BootstrapResponse,
  type ErrorCode,
  type PullResponse,
  type PushRequest,
  type PushResponse,
  type RegisterDevice,
} from "@mayak/domain";

export interface SyncTransport {
  registerDevice(device: RegisterDevice): Promise<void>;
  bootstrap(pageToken: string | null): Promise<BootstrapResponse>;
  push(request: PushRequest): Promise<PushResponse>;
  pull(cursor: string): Promise<PullResponse>;
}

/** Ошибка обмена. status = 0 — сеть недоступна или истёк тайм-аут. */
export class TransportError extends Error {
  override readonly name = "TransportError";
  constructor(
    readonly status: number,
    readonly code: ErrorCode | "NETWORK",
    message: string,
    readonly retryAfterMs?: number,
  ) {
    super(message);
  }
}

export interface HttpTransportOptions {
  baseUrl: string;
  deviceId: string;
  /** Возвращает значение заголовка Authorization или null, если сессии нет. */
  getAuthorization: () => Promise<string | null> | string | null;
  fetch?: typeof fetch;
  timeoutMs?: number;
}

export class HttpTransport implements SyncTransport {
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly options: HttpTransportOptions) {
    this.fetchImpl = options.fetch ?? globalThis.fetch.bind(globalThis);
  }

  async registerDevice(device: RegisterDevice): Promise<void> {
    await this.request("POST", "/devices", device);
  }

  bootstrap(pageToken: string | null): Promise<BootstrapResponse> {
    const query = pageToken ? `?after=${encodeURIComponent(pageToken)}` : "";
    return this.request("GET", `/bootstrap${query}`);
  }

  push(request: PushRequest): Promise<PushResponse> {
    return this.request("POST", "/sync/push", request);
  }

  pull(cursor: string): Promise<PullResponse> {
    return this.request("GET", `/sync/pull?cursor=${encodeURIComponent(cursor)}`);
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const authorization = await this.options.getAuthorization();
    if (!authorization) throw new TransportError(401, "UNAUTHORIZED", "Нет активной сессии");
    const headers: Record<string, string> = {
      authorization,
      [HEADER_DEVICE]: this.options.deviceId,
      [HEADER_PROTOCOL]: String(PROTOCOL_VERSION),
    };
    if (body !== undefined) headers["content-type"] = "application/json";
    let response: Response;
    try {
      response = await this.fetchImpl(this.options.baseUrl.replace(/\/$/, "") + path, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(this.options.timeoutMs ?? 30_000),
      });
    } catch {
      throw new TransportError(0, "NETWORK", "Нет связи с сервером");
    }
    if (response.ok) return (response.status === 204 ? undefined : await response.json()) as T;
    let error: Partial<ApiErrorBody> = {};
    try {
      error = await response.json();
    } catch {
      // Тело ошибки может отсутствовать (прокси, шлюз).
    }
    throw new TransportError(
      response.status,
      error.code ?? (response.status >= 500 ? "INTERNAL" : "VALIDATION_FAILED"),
      error.message ?? `HTTP ${response.status}`,
      parseRetryAfter(response.headers.get("retry-after")),
    );
  }
}
