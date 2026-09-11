/**
 * Shared validators / helpers for broker-attached client template files
 * on vault file tasks and document task templates.
 */
import type { MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { v } from "convex/values";

export const MAX_CLIENT_TEMPLATE_ATTACHMENTS = 5;
export const MAX_CLIENT_TEMPLATE_BYTES = 80 * 1024 * 1024;
export const MAX_CLIENT_TEMPLATE_NAME_LEN = 255;

export const clientTemplateAttachmentV = v.object({
  storageId: v.id("_storage"),
  fileName: v.string(),
  mimeType: v.string(),
  size: v.number(),
});

export type ClientTemplateAttachment = {
  storageId: Id<"_storage">;
  fileName: string;
  mimeType: string;
  size: number;
};

export function taskTypeAllowsClientTemplateAttachments(
  taskType: string | undefined,
): boolean {
  const t = taskType ?? "document_upload";
  return t === "document_upload" || t === "client_instruction";
}

export function safeClientTemplateFileName(name: string): string {
  const base = name.replace(/[/\\]/g, "").trim() || "template";
  return base.slice(0, MAX_CLIENT_TEMPLATE_NAME_LEN);
}

async function getStorageMetadataWithRetry(
  storage: MutationCtx["storage"],
  storageId: Id<"_storage">,
) {
  for (let i = 0; i < 15; i++) {
    const meta = await storage.getMetadata(storageId);
    if (meta) return meta;
    if (i < 14) {
      await new Promise<void>((r) => setTimeout(r, 100));
    }
  }
  return null;
}

export async function validateClientTemplateAttachments(
  ctx: MutationCtx,
  attachments: ClientTemplateAttachment[],
): Promise<ClientTemplateAttachment[]> {
  if (attachments.length > MAX_CLIENT_TEMPLATE_ATTACHMENTS) {
    throw new Error(
      `Attach at most ${MAX_CLIENT_TEMPLATE_ATTACHMENTS} template files.`,
    );
  }
  const out: ClientTemplateAttachment[] = [];
  for (const att of attachments) {
    const meta = await getStorageMetadataWithRetry(ctx.storage, att.storageId);
    if (!meta) {
      throw new Error(
        `Upload not found for "${att.fileName}". Finish uploading before saving.`,
      );
    }
    const byteSize = att.size > 0 ? att.size : (meta.size ?? 0);
    if (byteSize > MAX_CLIENT_TEMPLATE_BYTES) {
      try {
        await ctx.storage.delete(att.storageId);
      } catch {
        /* best-effort */
      }
      throw new Error(
        `File "${att.fileName}" exceeds maximum size (${Math.round(MAX_CLIENT_TEMPLATE_BYTES / (1024 * 1024))} MB).`,
      );
    }
    out.push({
      storageId: att.storageId,
      fileName: safeClientTemplateFileName(att.fileName),
      mimeType: (
        att.mimeType?.trim() ||
        meta.contentType ||
        "application/octet-stream"
      ).slice(0, 200),
      size: byteSize,
    });
  }
  return out;
}

export async function deleteRemovedClientTemplateStorage(
  ctx: MutationCtx,
  previous: ClientTemplateAttachment[] | undefined,
  next: ClientTemplateAttachment[] | undefined,
) {
  const keep = new Set((next ?? []).map((a) => String(a.storageId)));
  for (const att of previous ?? []) {
    if (keep.has(String(att.storageId))) continue;
    try {
      await ctx.storage.delete(att.storageId);
    } catch {
      /* best-effort */
    }
  }
}

/** Shallow copy of validated attachment rows for inject/apply carry-over. */
export function copyClientTemplateAttachments(
  attachments: ClientTemplateAttachment[] | undefined,
): ClientTemplateAttachment[] | undefined {
  if (!attachments?.length) return undefined;
  return attachments.map((a) => ({
    storageId: a.storageId,
    fileName: a.fileName,
    mimeType: a.mimeType,
    size: a.size,
  }));
}
