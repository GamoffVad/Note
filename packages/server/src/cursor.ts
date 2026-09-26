import { ApiError } from "./errors.ts";

/**
 * Курсор непрозрачен для клиента. Внутри: версия протокола курсора,
 * владелец, эпоха журнала и последний прочитанный seq.
 */
interface CursorData {
  v: 1;
  o: string;
  e: number;
  s: number;
}

export function encodeCursor(ownerId: string, epoch: number, seq: number): string {
  const data: CursorData = { v: 1, o: ownerId, e: epoch, s: seq };
  return Buffer.from(JSON.stringify(data)).toString("base64url");
}

export function decodeCursor(cursor: string, ownerId: string): { epoch: number; seq: number } {
  let data: Partial<CursorData>;
  try {
    data = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
  } catch {
    throw new ApiError("INVALID_CURSOR", "Некорректный курсор синхронизации");
  }
  if (
    data.v !== 1 ||
    typeof data.e !== "number" ||
    typeof data.s !== "number" ||
    !Number.isSafeInteger(data.s) ||
    data.s < 0
  ) {
    throw new ApiError("INVALID_CURSOR", "Некорректный курсор синхронизации");
  }
  if (data.o !== ownerId) throw new ApiError("INVALID_CURSOR", "Курсор относится к другому аккаунту");
  return { epoch: data.e, seq: data.s };
}

interface PageToken {
  a: string;
  h: number;
  e: number;
}

/** Токен страницы bootstrap: последний id и high-water seq первой страницы. */
export function encodePageToken(afterId: string, epoch: number, highWater: number): string {
  const data: PageToken = { a: afterId, h: highWater, e: epoch };
  return Buffer.from(JSON.stringify(data)).toString("base64url");
}

export function decodePageToken(token: string): PageToken {
  try {
    const data = JSON.parse(Buffer.from(token, "base64url").toString("utf8")) as PageToken;
    if (typeof data.a === "string" && typeof data.h === "number" && typeof data.e === "number") return data;
  } catch {
    // ниже
  }
  throw new ApiError("VALIDATION_FAILED", "Некорректный токен страницы");
}
