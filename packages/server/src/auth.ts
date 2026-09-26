/**
 * Аутентификация — адаптер. В production это проверка сессии выбранного
 * провайдера (по умолчанию Supabase Auth: issuer, audience, срок, статус сессии).
 * Адаптер провайдера подключается, когда владелец создаст проект.
 */
export interface AuthIdentity {
  /** Стабильный идентификатор пользователя у провайдера. */
  subject: string;
}

export interface AuthProvider {
  authenticate(request: Request): Promise<AuthIdentity | null>;
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
    return match ? { subject: `dev|${match[1]}` } : null;
  }
}
