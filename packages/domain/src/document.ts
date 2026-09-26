import { z } from "zod";
import {
  MAX_BLOCKS,
  MAX_DOCUMENT_BYTES,
  MAX_TAG_LENGTH,
  MAX_TAGS,
  MAX_TITLE_LENGTH,
} from "./limits.ts";
import { stableStringify, utf8ByteLength } from "./stable-json.ts";

/**
 * Каноническая заметка — структурированный документ из блоков со стабильными
 * UUID (ТЗ, раздел 3). Задачи в общем разделе — проекция task-блоков,
 * а не отдельная копия.
 */
export const MarkdownBlockSchema = z.object({
  id: z.uuid(),
  type: z.literal("markdown"),
  text: z.string(),
});

export const TaskBlockSchema = z.object({
  id: z.uuid(),
  type: z.literal("task"),
  text: z.string(),
  checked: z.boolean(),
});

export const AttachmentBlockSchema = z.object({
  id: z.uuid(),
  type: z.literal("attachment"),
  fileId: z.uuid(),
  /** Подпись вложения, показываемая в заметке. */
  text: z.string(),
});

export const BlockSchema = z.discriminatedUnion("type", [
  MarkdownBlockSchema,
  TaskBlockSchema,
  AttachmentBlockSchema,
]);

export const NoteDocumentSchema = z
  .object({
    title: z.string().max(MAX_TITLE_LENGTH),
    blocks: z.array(BlockSchema).max(MAX_BLOCKS),
    tags: z.array(z.string().min(1).max(MAX_TAG_LENGTH)).max(MAX_TAGS),
    pinned: z.boolean(),
    /** Заметка создана действием «Сохранить обе» при конфликте с этой заметкой. */
    conflictOf: z.uuid().optional(),
  })
  .superRefine((doc, ctx) => {
    const seen = new Set<string>();
    for (const [index, block] of doc.blocks.entries()) {
      if (seen.has(block.id)) {
        ctx.addIssue({
          code: "custom",
          message: "Идентификаторы блоков должны быть уникальны",
          path: ["blocks", index, "id"],
        });
      }
      seen.add(block.id);
    }
  });

export type MarkdownBlock = z.infer<typeof MarkdownBlockSchema>;
export type TaskBlock = z.infer<typeof TaskBlockSchema>;
export type AttachmentBlock = z.infer<typeof AttachmentBlockSchema>;
export type Block = z.infer<typeof BlockSchema>;
export type NoteDocument = z.infer<typeof NoteDocumentSchema>;

export function emptyDocument(): NoteDocument {
  return { title: "", blocks: [], tags: [], pinned: false };
}

export function documentByteLength(doc: NoteDocument): number {
  return utf8ByteLength(stableStringify(doc));
}

export type DocumentCheck =
  | { ok: true; document: NoteDocument }
  | { ok: false; reason: "invalid" | "too-large"; message: string };

/** Проверка схемы и лимита размера. Выполняется и на клиенте, и на сервере. */
export function checkDocument(input: unknown): DocumentCheck {
  const parsed = NoteDocumentSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, reason: "invalid", message: z.prettifyError(parsed.error) };
  }
  if (documentByteLength(parsed.data) > MAX_DOCUMENT_BYTES) {
    return { ok: false, reason: "too-large", message: "Документ заметки больше 1 MiB" };
  }
  return { ok: true, document: parsed.data };
}

export function documentsEqual(a: NoteDocument, b: NoteDocument): boolean {
  return stableStringify(a) === stableStringify(b);
}
