import { createHash } from "node:crypto";
import { createRemoteJWKSet, decodeJwt, decodeProtectedHeader, errors, jwtVerify, type JWTVerifyGetKey } from "jose";

/**
 * Аутентификация — адаптер. В production это проверка access token
 * Supabase Auth (SupabaseAuthProvider). DevTokenAuthProvider — только для
 * локальной разработки и тестов.
 */
export interface AuthIdentity {
  /** Стабильный идентификатор пользователя у провайдера. */
  subject: string;
  /** Идентификатор сессии провайдера; к нему привязывается устройство. */
  sessionId: string | null;
}

export interface AuthProvider {
  authenticate(request: Request): Promise<AuthIdentity | null>;
}

function bearer(request: Request): string | null {
  const match = /^Bearer ([A-Za-z0-9._~+/=-]+)$/.exec(request.headers.get("authorization") ?? "");
  return match ? match[1]! : null;
}

export interface SupabaseAuthOptions {
  /** URL проекта, например https://abcd.supabase.co (без /auth/v1). */
  projectUrl: string;
  /** Для тестов: источник ключей вместо JWKS проекта. */
  keys?: JWTVerifyGetKey;
  /** Для тестов: адрес JWKS вместо {projectUrl}/auth/v1/.well-known/jwks.json. */
  jwksUrl?: string;
  /**
   * Публикуемый ключ проекта (sb_publishable_…). С ним токены проектов,
   * которые ещё подписывают их общим секретом (HS256), проверяются запросом
   * к самому Supabase Auth (GET /auth/v1/user).
   */
  apiKey?: string;
  /** Для тестов: fetch для запросов к Supabase Auth. */
  fetch?: typeof fetch;
}

/** Сколько секунд помнить токен, подтверждённый Supabase Auth. */
const REMOTE_CACHE_SECONDS = 60;
const REMOTE_CACHE_LIMIT = 1000;

/**
 * Проверка access token Supabase Auth по асимметричным ключам проекта (JWKS).
 * Документация Supabase: ключи берутся из /auth/v1/.well-known/jwks.json,
 * issuer — https://<project>.supabase.co/auth/v1, aud — "authenticated".
 * Токены, подписанные общим секретом HS256 (legacy), сервер сам не
 * проверяет — секрета у него нет. Если задан публикуемый ключ проекта,
 * такой токен подтверждается у Supabase Auth; без ключа он отклоняется.
 */
export class SupabaseAuthProvider implements AuthProvider {
  private readonly keys: JWTVerifyGetKey;
  private readonly issuer: string;
  private readonly apiKey: string | undefined;
  private readonly fetchImpl: typeof fetch;
  private readonly confirmed = new Map<string, { identity: AuthIdentity; until: number }>();

  constructor(options: SupabaseAuthOptions) {
    const base = new URL(options.projectUrl);
    if (base.protocol !== "https:" && !isLocalhost(base.hostname)) {
      throw new Error("SUPABASE_URL должен использовать https");
    }
    const root = base.origin + base.pathname.replace(/\/+$/, "");
    this.issuer = `${root}/auth/v1`;
    this.apiKey = options.apiKey || undefined;
    this.fetchImpl = options.fetch ?? fetch;
    if (options.jwksUrl) {
      const jwks = new URL(options.jwksUrl);
      if (jwks.protocol !== "https:" && !isLocalhost(jwks.hostname)) throw new Error("SUPABASE_JWKS_URL должен использовать https");
    }
    this.keys =
      options.keys ??
      createRemoteJWKSet(new URL(options.jwksUrl ?? `${this.issuer}/.well-known/jwks.json`), {
        // Не дольше, чем кэширует сам Supabase: иначе отзыв ключа затянется.
        cacheMaxAge: 10 * 60 * 1000,
        cooldownDuration: 30 * 1000,
        timeoutDuration: 5 * 1000,
      });
  }

  async authenticate(request: Request): Promise<AuthIdentity | null> {
    const token = bearer(request);
    if (!token) return null;
    let alg: string | undefined;
    try {
      alg = decodeProtectedHeader(token).alg;
    } catch {
      return null;
    }
    if (alg === "HS256") return this.apiKey ? this.confirmWithAuthServer(token) : null;
    try {
      const { payload } = await jwtVerify(token, this.keys, {
        issuer: this.issuer,
        audience: "authenticated",
        algorithms: ["ES256", "RS256", "EdDSA"],
        requiredClaims: ["sub", "exp", "session_id"],
        clockTolerance: 30,
      });
      if (payload.role !== "authenticated" || payload.is_anonymous === true) return null;
      if (typeof payload.sub !== "string" || typeof payload.session_id !== "string") return null;
      return { subject: `supabase|${payload.sub}`, sessionId: payload.session_id };
    } catch (error) {
      if (INVALID_TOKEN_ERRORS.some((E) => error instanceof E)) return null;
      // Недоступность JWKS — не «неверный токен»: сессию не сбрасываем, клиент повторит позже.
      throw new AuthUnavailableError();
    }
  }

  /**
   * Токен HS256: подпись и срок проверяет Supabase Auth (GET /auth/v1/user).
   * Поля берутся из самого токена только после подтверждения и только если
   * пользователь в ответе совпадает с sub.
   */
  private async confirmWithAuthServer(token: string): Promise<AuthIdentity | null> {
    const key = createHash("sha256").update(token).digest("hex");
    const now = Date.now();
    const cached = this.confirmed.get(key);
    if (cached && cached.until > now) return cached.identity;

    let payload: Record<string, unknown>;
    try {
      payload = decodeJwt(token) as Record<string, unknown>;
    } catch {
      return null;
    }
    if (typeof payload.exp !== "number" || payload.exp * 1000 <= now) return null;
    const identity = identityFrom(payload, this.issuer);
    if (!identity) return null;

    let response: Response;
    try {
      response = await this.fetchImpl(`${this.issuer}/user`, {
        headers: { apikey: this.apiKey!, authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(5000),
      });
    } catch {
      throw new AuthUnavailableError();
    }
    if (response.status === 401 || response.status === 403) return null;
    if (!response.ok) throw new AuthUnavailableError();
    const user = (await response.json().catch(() => null)) as { id?: unknown } | null;
    if (!user || user.id !== payload.sub) return null;

    if (this.confirmed.size >= REMOTE_CACHE_LIMIT) this.confirmed.clear();
    this.confirmed.set(key, { identity, until: Math.min(now + REMOTE_CACHE_SECONDS * 1000, payload.exp * 1000) });
    return identity;
  }
}

/** Проверенные поля токена Supabase → личность; null — токен не подходит. */
function identityFrom(payload: Record<string, unknown>, issuer: string): AuthIdentity | null {
  if (payload.iss !== issuer) return null;
  const aud = payload.aud;
  if (!(aud === "authenticated" || (Array.isArray(aud) && aud.includes("authenticated")))) return null;
  if (payload.role !== "authenticated" || payload.is_anonymous === true) return null;
  if (typeof payload.sub !== "string" || typeof payload.session_id !== "string") return null;
  return { subject: `supabase|${payload.sub}`, sessionId: payload.session_id };
}

export class AuthUnavailableError extends Error {
  override readonly name = "AuthUnavailableError";
  constructor() {
    super("Сервис входа временно недоступен");
  }
}

/** Ошибки, означающие недействительный токен; остальные — сбой получения ключей. */
const INVALID_TOKEN_ERRORS = [
  errors.JWTExpired,
  errors.JWTClaimValidationFailed,
  errors.JWTInvalid,
  errors.JWSInvalid,
  errors.JWSSignatureVerificationFailed,
  errors.JOSEAlgNotAllowed,
  errors.JOSENotSupported,
  errors.JWKSNoMatchingKey,
  errors.JWKSMultipleMatchingKeys,
];

function isLocalhost(host: string): boolean {
  return host === "localhost" || host === "127.0.0.1" || host === "[::1]";
}

/**
 * ТОЛЬКО для локальной разработки и тестов: «Authorization: Bearer dev:<subject>».
 * Не проверяет личность. Включается явно и отказывается работать в production.
 */
export class DevTokenAuthProvider implements AuthProvider {
  constructor(options: { enabled: boolean; environment?: string }) {
    if (!options.enabled) throw new Error("DevTokenAuthProvider не включён (MAYAK_DEV_AUTH=1)");
    if (options.environment === "production") {
      throw new Error("DevTokenAuthProvider запрещён в production");
    }
  }

  async authenticate(request: Request): Promise<AuthIdentity | null> {
    const header = request.headers.get("authorization") ?? "";
    const match = /^Bearer dev:([A-Za-z0-9._@-]{1,200})$/.exec(header);
    return match ? { subject: `dev|${match[1]}`, sessionId: null } : null;
  }
}

/** Первый провайдер, признавший запрос. Нужен тестам, где работают оба входа. */
export class CompositeAuthProvider implements AuthProvider {
  constructor(private readonly providers: AuthProvider[]) {}

  async authenticate(request: Request): Promise<AuthIdentity | null> {
    for (const provider of this.providers) {
      const identity = await provider.authenticate(request);
      if (identity) return identity;
    }
    return null;
  }
}

/**
 * Провайдер по переменным окружения: MAYAK_AUTH=supabase (по умолчанию),
 * dev или список через запятую («supabase,dev» — только для тестов).
 */
export function authFromEnv(env: Record<string, string | undefined>): AuthProvider {
  const modes = (env.MAYAK_AUTH ?? (env.MAYAK_DEV_AUTH === "1" ? "dev" : "supabase")).split(",").map((m) => m.trim());
  const providers = modes.map((mode): AuthProvider => {
    if (mode === "dev") return new DevTokenAuthProvider({ enabled: env.MAYAK_DEV_AUTH === "1", environment: env.NODE_ENV });
    if (mode !== "supabase") throw new Error(`Неизвестный MAYAK_AUTH=${mode}`);
    if (!env.SUPABASE_URL) throw new Error("Задайте SUPABASE_URL (URL проекта Supabase)");
    return new SupabaseAuthProvider({
      projectUrl: env.SUPABASE_URL,
      jwksUrl: env.SUPABASE_JWKS_URL,
      apiKey: env.SUPABASE_PUBLISHABLE_KEY,
    });
  });
  return providers.length === 1 ? providers[0]! : new CompositeAuthProvider(providers);
}
