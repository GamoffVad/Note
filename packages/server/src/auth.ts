import { createRemoteJWKSet, errors, jwtVerify, type JWTVerifyGetKey } from "jose";

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
}

/**
 * Проверка access token Supabase Auth по асимметричным ключам проекта (JWKS).
 * Документация Supabase: ключи берутся из /auth/v1/.well-known/jwks.json,
 * issuer — https://<project>.supabase.co/auth/v1, aud — "authenticated".
 * Общий секрет HS256 (legacy) не поддерживается: Supabase не рекомендует
 * проверять им токены, а JWKS такие ключи не отдаёт.
 */
export class SupabaseAuthProvider implements AuthProvider {
  private readonly keys: JWTVerifyGetKey;
  private readonly issuer: string;

  constructor(options: SupabaseAuthOptions) {
    const base = new URL(options.projectUrl);
    if (base.protocol !== "https:" && !isLocalhost(base.hostname)) {
      throw new Error("SUPABASE_URL должен использовать https");
    }
    const root = base.origin + base.pathname.replace(/\/+$/, "");
    this.issuer = `${root}/auth/v1`;
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
    return new SupabaseAuthProvider({ projectUrl: env.SUPABASE_URL, jwksUrl: env.SUPABASE_JWKS_URL });
  });
  return providers.length === 1 ? providers[0]! : new CompositeAuthProvider(providers);
}
