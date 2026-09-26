import { describe, expect, it } from "vitest";
import { serverCaFor, SUPABASE_ROOT_CA } from "../src/index.ts";

describe("проверка сертификата сервера БД", () => {
  it("для Supabase без настройки — встроенный корневой сертификат", () => {
    expect(serverCaFor({ DATABASE_URL: "postgresql://u.ref:p@aws-0-eu-central-1.pooler.supabase.com:6543/postgres" })).toBe(SUPABASE_ROOT_CA);
    expect(serverCaFor({ DATABASE_URL: "postgresql://postgres:p@db.abcdefgh.supabase.co:5432/postgres" })).toBe(SUPABASE_ROOT_CA);
    expect(SUPABASE_ROOT_CA).toContain("-----BEGIN CERTIFICATE-----");
  });

  it("DATABASE_CA_CERT важнее встроенного; локальная база — без TLS", () => {
    expect(serverCaFor({ DATABASE_URL: "postgresql://x@h.pooler.supabase.com/p", DATABASE_CA_CERT: "A\\nB" })).toBe("A\nB");
    expect(serverCaFor({ DATABASE_URL: "postgres://mayak:mayak@localhost:5432/mayak" })).toBeNull();
    expect(serverCaFor({ DATABASE_URL: "postgres://x@evil-supabase.com.example.org/p" })).toBeNull();
  });
});
