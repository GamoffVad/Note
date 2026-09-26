import { invoke } from "@tauri-apps/api/core";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isNativeApp, nativePlatform } from "./native.ts";

/**
 * Вкладка «Файлы»: передача файлов между своими устройствами.
 * Файл лежит в приватной корзине Supabase Storage «transfers» по пути
 * <user_id>/<id>, описание — в таблице public.transfers
 * (supabase/migrations/…_transfers.sql). Через 7 дней файл удаляется:
 * просроченные удаляет любое устройство владельца при открытии вкладки.
 */

export interface Transfer {
  id: string;
  name: string;
  size: number;
  mime: string;
  device_name: string;
  created_at: string;
  expires_at: string;
}

const BUCKET = "transfers";
/** Предел бесплатного тарифа Supabase: 50 МБ на файл. */
export const MAX_TRANSFER_BYTES = 50 * 1024 * 1024;

const path = (userId: string, id: string) => `${userId}/${id}`;

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} Б`;
  const units = ["КБ", "МБ", "ГБ"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value.toLocaleString("ru-RU", { maximumFractionDigits: value < 10 ? 1 : 0 })} ${units[unit]}`;
}

/** Сколько дней осталось до удаления: «сегодня», «1 день», «5 дней». */
export function daysLeft(expiresAt: string, now: Date = new Date()): number {
  return Math.max(0, Math.ceil((new Date(expiresAt).getTime() - now.getTime()) / 86_400_000));
}

export async function listTransfers(sb: SupabaseClient): Promise<Transfer[]> {
  const { data, error } = await sb
    .from("transfers")
    .select("id, name, size, mime, device_name, created_at, expires_at")
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return data as Transfer[];
}

/** Удаляет просроченные файлы владельца (хранилище и записи). */
export async function removeExpired(sb: SupabaseClient, userId: string): Promise<void> {
  const { data } = await sb.from("transfers").select("id").lte("expires_at", new Date().toISOString());
  const ids = (data ?? []).map((r) => (r as { id: string }).id);
  if (!ids.length) return;
  await sb.storage.from(BUCKET).remove(ids.map((id) => path(userId, id)));
  await sb.from("transfers").delete().in("id", ids);
}

export async function sendFile(sb: SupabaseClient, userId: string, file: File, deviceName: string): Promise<void> {
  if (file.size > MAX_TRANSFER_BYTES) throw new Error(`Файл больше ${formatSize(MAX_TRANSFER_BYTES)}`);
  const id = crypto.randomUUID();
  const mime = file.type || "application/octet-stream";
  if (isNativeApp()) {
    // Двоичным телом в Rust и оттуда в хранилище (src-tauri/src/transfers.rs).
    const { data } = await sb.auth.getSession();
    const token = data.session?.access_token;
    if (!token) throw new Error("Войдите снова, чтобы отправлять файлы");
    const base = import.meta.env.VITE_SUPABASE_URL as string;
    await invoke("transfer_upload", new Uint8Array(await file.arrayBuffer()), {
      headers: {
        "x-mayak-url": `${base.replace(/\/$/, "")}/storage/v1/object/${BUCKET}/${path(userId, id)}`,
        "x-mayak-token": token,
        "x-mayak-apikey": import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string,
        "x-mayak-type": mime,
      },
    });
  } else {
    const { error } = await sb.storage.from(BUCKET).upload(path(userId, id), file, { contentType: mime, upsert: false });
    if (error) throw new Error(error.message);
  }
  const { error } = await sb.from("transfers").insert({ id, name: file.name || "Файл", size: file.size, mime, device_name: deviceName });
  if (error) {
    await sb.storage.from(BUCKET).remove([path(userId, id)]);
    throw new Error(error.message);
  }
}

export async function deleteTransfer(sb: SupabaseClient, userId: string, t: Transfer): Promise<void> {
  const { error } = await sb.storage.from(BUCKET).remove([path(userId, t.id)]);
  if (error) throw new Error(error.message);
  const del = await sb.from("transfers").delete().eq("id", t.id);
  if (del.error) throw new Error(del.error.message);
}

interface FilesBridge {
  download(url: string, name: string, mime: string): boolean;
}

declare global {
  interface Window {
    MayakFiles?: FilesBridge;
  }
}

/**
 * Сохраняет файл на этом устройстве. Android — «Диспетчер загрузок»
 * (MayakFiles.kt), компьютер — в папку «Загрузки» из Rust, браузер —
 * обычное скачивание. Возвращает текст для уведомления.
 */
export async function saveTransfer(sb: SupabaseClient, userId: string, t: Transfer): Promise<string> {
  const storage = sb.storage.from(BUCKET);
  if (isNativeApp()) {
    const { data, error } = await storage.createSignedUrl(path(userId, t.id), 600, { download: t.name });
    if (error || !data) throw new Error(error?.message ?? "Нет ссылки на файл");
    if (nativePlatform() === "android") {
      if (!window.MayakFiles?.download(data.signedUrl, t.name, t.mime)) throw new Error("Не удалось начать загрузку");
      return `Загружается в «Загрузки»: ${t.name}`;
    }
    const saved = await invoke<string>("transfer_save", { url: data.signedUrl, name: t.name });
    return `Сохранено: ${saved}`;
  }
  const { data, error } = await storage.download(path(userId, t.id));
  if (error || !data) throw new Error(error?.message ?? "Файл не скачался");
  const url = URL.createObjectURL(data);
  const a = document.createElement("a");
  a.href = url;
  a.download = t.name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return `Скачано: ${t.name}`;
}
