import type { ApiErrorBody, ErrorCode } from "@mayak/domain";

const STATUS: Record<ErrorCode, number> = {
  VALIDATION_FAILED: 400,
  INVALID_CURSOR: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  DEVICE_REVOKED: 403,
  DEVICE_NOT_REGISTERED: 403,
  NOT_FOUND: 404,
  REVISION_CONFLICT: 409,
  ENTITY_PURGED: 409,
  CURSOR_EXPIRED: 410,
  PAYLOAD_TOO_LARGE: 413,
  IDEMPOTENCY_MISMATCH: 422,
  UPGRADE_REQUIRED: 426,
  RATE_LIMITED: 429,
  INTERNAL: 500,
};

const RETRYABLE = new Set<ErrorCode>(["RATE_LIMITED", "INTERNAL"]);

export class ApiError extends Error {
  override readonly name = "ApiError";
  readonly status: number;

  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.status = STATUS[code];
  }

  toBody(requestId: string): ApiErrorBody {
    return {
      code: this.code,
      message: this.message,
      retryable: RETRYABLE.has(this.code),
      requestId,
      ...(this.details ? { details: this.details } : {}),
    };
  }
}
