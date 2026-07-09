import { mutation, query, type MutationCtx } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";

const MAX_NAME_LEN = 255;
/** Same cap as client `lib/uploadToConvexStorage.ts` — reject oversized blobs at save time. */
const MAX_ATTACHMENT_BYTES = 80 * 1024 * 1024;

function safeFileName(name: string) {
  const base = name.replace(/[/\\]/g, "").trim() || "file";
  return base.slice(0, MAX_NAME_LEN);
}

async function getStorageMetadataWithRetry(
  storage: MutationCtx["storage"],
  storageId: Id<"_storage">,
  { attempts = 15, delayMs = 100 }: { attempts?: number; delayMs?: number } = {}
) {
  for (let i = 0; i < attempts; i++) {
    const meta = await storage.getMetadata(storageId);
    if (meta) return meta;
    if (i < attempts - 1) {
      await new Promise<void>((r) => setTimeout(r, delayMs));
    }
  }
  return null;
}

/**
 * Public URL to upload a file; client POSTs the raw bytes, then calls `addFile`.
 */
export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    return await ctx.storage.generateUploadUrl();
  },
});

/**
 * After uploading to the URL from `generateUploadUrl`, link the storage blob to a lender.
 */
export const addFile = mutation({
  args: {
    lenderId: v.id("lenders"),
    storageId: v.id("_storage"),
    fileName: v.string(),
    contentType: v.optional(v.string()),
    size: v.optional(v.number()),
    label: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const lender = await ctx.db.get(args.lenderId);
    if (!lender) throw new Error("Lender not found");
    const meta = await getStorageMetadataWithRetry(ctx.storage, args.storageId);
    if (!meta) {
      throw new Error(
        "Upload not found. Try again, or check that the file was POSTed to the upload URL and Convex file storage is enabled for this deployment."
      );
    }
    const byteSize = args.size ?? meta.size ?? 0;
    if (typeof byteSize === "number" && byteSize > MAX_ATTACHMENT_BYTES) {
      try {
        await ctx.storage.delete(args.storageId);
      } catch {
        /* orphan blob cleanup best-effort */
      }
      throw new Error(
        `File exceeds maximum size (${Math.round(MAX_ATTACHMENT_BYTES / (1024 * 1024))} MB).`
      );
    }
    const fileName = safeFileName(args.fileName);
    const contentType = args.contentType || meta.contentType || undefined;
    const id = await ctx.db.insert("lenderAttachments", {
      lenderId: args.lenderId,
      storageId: args.storageId,
      fileName,
      contentType,
      size: args.size ?? meta.size,
      label: args.label?.trim() || undefined,
      createdAt: Date.now(),
    });
    return id;
  },
});

export const removeFile = mutation({
  args: { id: v.id("lenderAttachments") },
  handler: async (ctx, { id }) => {
    const row = await ctx.db.get(id);
    if (!row) return { ok: false as const };
    await ctx.storage.delete(row.storageId);
    await ctx.db.delete(id);
    return { ok: true as const };
  },
});

export const updateFileLabel = mutation({
  args: { id: v.id("lenderAttachments"), label: v.optional(v.string()) },
  handler: async (ctx, { id, label }) => {
    const row = await ctx.db.get(id);
    if (!row) throw new Error("Attachment not found");
    const next = label?.trim() || undefined;
    await ctx.db.patch(id, { label: next });
    return { ok: true as const };
  },
});

/**
 * @returns Attachment rows with short-lived `url` for download/open in new tab.
 */
export const list = query({
  args: { lenderId: v.id("lenders") },
  handler: async (ctx, { lenderId }) => {
    const rows = await ctx.db
      .query("lenderAttachments")
      .withIndex("by_lender", (q) => q.eq("lenderId", lenderId))
      .order("desc")
      .collect();
    const out: Array<{
      _id: (typeof rows)[0]["_id"];
      _creationTime: number;
      lenderId: (typeof rows)[0]["lenderId"];
      storageId: (typeof rows)[0]["storageId"];
      fileName: string;
      contentType: string | undefined;
      size: number | undefined;
      label: string | undefined;
      createdAt: number;
      url: string | null;
    }> = [];
    for (const r of rows) {
      let url: string | null = null;
      try {
        url = await ctx.storage.getUrl(r.storageId);
      } catch {
        url = null;
      }
      out.push({
        _id: r._id,
        _creationTime: r._creationTime,
        lenderId: r.lenderId,
        storageId: r.storageId,
        fileName: r.fileName,
        contentType: r.contentType,
        size: r.size,
        label: r.label,
        createdAt: r.createdAt,
        url,
      });
    }
    return out;
  },
});

/** Called from `lenders.remove` / `wipeAll` */
export async function deleteAllForLender(
  ctx: Pick<MutationCtx, "db" | "storage">,
  lenderId: Id<"lenders">
) {
  const rows = await ctx.db
    .query("lenderAttachments")
    .withIndex("by_lender", (q) => q.eq("lenderId", lenderId))
    .collect();
  for (const a of rows) {
    try {
      await ctx.storage.delete(a.storageId);
    } catch {
      // blob may already be gone
    }
    await ctx.db.delete(a._id);
  }
  return rows.length;
}

/** Move profile files when merging two lenders (before deleting the duplicate row). */
export async function reassignToLender(
  ctx: Pick<MutationCtx, "db">,
  fromLenderId: Id<"lenders">,
  toLenderId: Id<"lenders">
) {
  const rows = await ctx.db
    .query("lenderAttachments")
    .withIndex("by_lender", (q) => q.eq("lenderId", fromLenderId))
    .collect();
  for (const a of rows) {
    await ctx.db.patch(a._id, { lenderId: toLenderId });
  }
  return rows.length;
}

/** Wipe: delete every `lenderAttachments` row and its storage blob. */
export async function deleteAllLenderAttachments(
  ctx: Pick<MutationCtx, "db" | "storage">
) {
  const rows = await ctx.db.query("lenderAttachments").collect();
  for (const a of rows) {
    try {
      await ctx.storage.delete(a.storageId);
    } catch {
      // already gone
    }
    await ctx.db.delete(a._id);
  }
  return rows.length;
}
