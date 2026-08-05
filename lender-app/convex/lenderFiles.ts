import { mutation, query, type MutationCtx } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { assertOrgScopeArgs, resolveMemberUserKey } from "./organizationAccess";
import { assertOrgPermission } from "./organizationRbac";
import { callerHasUnrestrictedOrgDataAccess } from "./viewerOrgAccess";

const MAX_NAME_LEN = 255;
/** Same cap as client `lib/uploadToConvexStorage.ts` — reject oversized blobs at save time. */
const MAX_ATTACHMENT_BYTES = 80 * 1024 * 1024;

const orgArgs = {
  organizationId: v.optional(v.id("organizations")),
  memberUserKey: v.optional(v.string()),
};

function safeFileName(name: string) {
  const base = name.replace(/[/\\]/g, "").trim() || "file";
  return base.slice(0, MAX_NAME_LEN);
}

function clampPreviewScale(n: number | undefined): number | undefined {
  if (n === undefined || Number.isNaN(n)) return undefined;
  return Math.min(2, Math.max(0.5, Math.round(n * 100) / 100));
}

async function getStorageMetadataWithRetry(
  storage: MutationCtx["storage"],
  storageId: Id<"_storage">,
  { attempts = 15, delayMs = 100 }: { attempts?: number; delayMs?: number } = {},
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

async function assertCanMutateLenderFile(
  ctx: MutationCtx,
  lenderId: Id<"lenders">,
  organizationId: Id<"organizations"> | undefined,
  memberUserKey: string | undefined,
) {
  const lender = await ctx.db.get(lenderId);
  if (!lender) throw new Error("Lender not found");
  if (!organizationId) {
    // Legacy callers without org scope — still require a live lender row.
    return lender;
  }
  await assertOrgScopeArgs(ctx, organizationId, memberUserKey);
  const key = await resolveMemberUserKey(ctx, memberUserKey);
  await assertOrgPermission(ctx, organizationId, key, "lenders.edit");
  const god = await callerHasUnrestrictedOrgDataAccess(ctx, memberUserKey);
  if (!god && lender.organizationId && lender.organizationId !== organizationId) {
    throw new Error("Lender belongs to a different organization.");
  }
  return lender;
}

/**
 * Public URL to upload a file; client POSTs the raw bytes, then calls `addFile`.
 */
export const generateUploadUrl = mutation({
  args: {},
  returns: v.string(),
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
    notes: v.optional(v.string()),
    groupName: v.optional(v.string()),
    previewScale: v.optional(v.number()),
    ...orgArgs,
  },
  returns: v.id("lenderAttachments"),
  handler: async (ctx, args) => {
    const lender = await assertCanMutateLenderFile(
      ctx,
      args.lenderId,
      args.organizationId,
      args.memberUserKey,
    );
    const meta = await getStorageMetadataWithRetry(ctx.storage, args.storageId);
    if (!meta) {
      throw new Error(
        "Upload not found. Try again, or check that the file was POSTed to the upload URL and Convex file storage is enabled for this deployment.",
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
        `File exceeds maximum size (${Math.round(MAX_ATTACHMENT_BYTES / (1024 * 1024))} MB).`,
      );
    }
    const fileName = safeFileName(args.fileName);
    const contentType = args.contentType || meta.contentType || undefined;
    const now = Date.now();
    const id = await ctx.db.insert("lenderAttachments", {
      lenderId: args.lenderId,
      organizationId: lender.organizationId ?? args.organizationId,
      storageId: args.storageId,
      fileName,
      contentType,
      size: args.size ?? meta.size,
      label: args.label?.trim() || undefined,
      notes: args.notes?.trim() || undefined,
      groupName: args.groupName?.trim() || undefined,
      previewScale: clampPreviewScale(args.previewScale),
      createdAt: now,
      updatedAt: now,
    });
    return id;
  },
});

export const removeFile = mutation({
  args: {
    id: v.id("lenderAttachments"),
    ...orgArgs,
  },
  returns: v.object({ ok: v.boolean() }),
  handler: async (ctx, { id, organizationId, memberUserKey }) => {
    const row = await ctx.db.get(id);
    if (!row) return { ok: false as const };
    await assertCanMutateLenderFile(
      ctx,
      row.lenderId,
      organizationId,
      memberUserKey,
    );
    await ctx.storage.delete(row.storageId);
    await ctx.db.delete(id);
    return { ok: true as const };
  },
});

export const updateFileLabel = mutation({
  args: {
    id: v.id("lenderAttachments"),
    label: v.optional(v.string()),
    ...orgArgs,
  },
  returns: v.object({ ok: v.literal(true) }),
  handler: async (ctx, { id, label, organizationId, memberUserKey }) => {
    const row = await ctx.db.get(id);
    if (!row) throw new Error("Attachment not found");
    await assertCanMutateLenderFile(
      ctx,
      row.lenderId,
      organizationId,
      memberUserKey,
    );
    const next = label?.trim() || undefined;
    await ctx.db.patch(id, { label: next, updatedAt: Date.now() });
    return { ok: true as const };
  },
});

/** Retitle, annotate, group, or resize preview for a lender document. */
export const updateFileMeta = mutation({
  args: {
    id: v.id("lenderAttachments"),
    fileName: v.optional(v.string()),
    label: v.optional(v.string()),
    notes: v.optional(v.string()),
    groupName: v.optional(v.union(v.string(), v.null())),
    previewScale: v.optional(v.union(v.number(), v.null())),
    ...orgArgs,
  },
  returns: v.object({ ok: v.literal(true) }),
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.id);
    if (!row) throw new Error("Attachment not found");
    await assertCanMutateLenderFile(
      ctx,
      row.lenderId,
      args.organizationId,
      args.memberUserKey,
    );
    const patch: Record<string, unknown> = { updatedAt: Date.now() };
    if (args.fileName !== undefined) {
      patch.fileName = safeFileName(args.fileName);
    }
    if (args.label !== undefined) {
      patch.label = args.label.trim() || undefined;
    }
    if (args.notes !== undefined) {
      patch.notes = args.notes.trim() || undefined;
    }
    if (args.groupName !== undefined) {
      patch.groupName =
        args.groupName === null ? undefined : args.groupName.trim() || undefined;
    }
    if (args.previewScale !== undefined) {
      patch.previewScale =
        args.previewScale === null
          ? undefined
          : clampPreviewScale(args.previewScale);
    }
    await ctx.db.patch(args.id, patch);
    return { ok: true as const };
  },
});

/**
 * @returns Attachment rows with short-lived `url` for download/open in new tab.
 */
export const list = query({
  args: {
    lenderId: v.id("lenders"),
    ...orgArgs,
  },
  returns: v.array(
    v.object({
      _id: v.id("lenderAttachments"),
      _creationTime: v.number(),
      lenderId: v.id("lenders"),
      storageId: v.id("_storage"),
      fileName: v.string(),
      contentType: v.optional(v.string()),
      size: v.optional(v.number()),
      label: v.optional(v.string()),
      notes: v.optional(v.string()),
      groupName: v.optional(v.string()),
      previewScale: v.optional(v.number()),
      createdAt: v.number(),
      updatedAt: v.optional(v.number()),
      url: v.union(v.string(), v.null()),
    }),
  ),
  handler: async (ctx, { lenderId, organizationId, memberUserKey }) => {
    if (organizationId) {
      await assertOrgScopeArgs(ctx, organizationId, memberUserKey);
      const lender = await ctx.db.get(lenderId);
      if (!lender) return [];
      const god = await callerHasUnrestrictedOrgDataAccess(ctx, memberUserKey);
      if (
        !god &&
        lender.organizationId &&
        lender.organizationId !== organizationId
      ) {
        return [];
      }
    }
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
      notes: string | undefined;
      groupName: string | undefined;
      previewScale: number | undefined;
      createdAt: number;
      updatedAt: number | undefined;
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
        notes: r.notes,
        groupName: r.groupName,
        previewScale: r.previewScale,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
        url,
      });
    }
    return out;
  },
});

/** Called from `lenders.remove` / `wipeAll` */
export async function deleteAllForLender(
  ctx: Pick<MutationCtx, "db" | "storage">,
  lenderId: Id<"lenders">,
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
  const creds = await ctx.db
    .query("lenderPortalCredentials")
    .withIndex("by_lender", (q) => q.eq("lenderId", lenderId))
    .collect();
  for (const c of creds) {
    await ctx.db.delete(c._id);
  }
  return rows.length;
}

/** Move profile files when merging two lenders (before deleting the duplicate row). */
export async function reassignToLender(
  ctx: Pick<MutationCtx, "db">,
  fromLenderId: Id<"lenders">,
  toLenderId: Id<"lenders">,
) {
  const rows = await ctx.db
    .query("lenderAttachments")
    .withIndex("by_lender", (q) => q.eq("lenderId", fromLenderId))
    .collect();
  for (const a of rows) {
    await ctx.db.patch(a._id, { lenderId: toLenderId });
  }
  const creds = await ctx.db
    .query("lenderPortalCredentials")
    .withIndex("by_lender", (q) => q.eq("lenderId", fromLenderId))
    .collect();
  for (const c of creds) {
    const existingOnKeep = await ctx.db
      .query("lenderPortalCredentials")
      .withIndex("by_lender", (q) => q.eq("lenderId", toLenderId))
      .first();
    if (existingOnKeep) {
      await ctx.db.delete(c._id);
    } else {
      await ctx.db.patch(c._id, { lenderId: toLenderId });
    }
  }
  return rows.length;
}

/** Wipe: delete every `lenderAttachments` row and its storage blob. */
export async function deleteAllLenderAttachments(
  ctx: Pick<MutationCtx, "db" | "storage">,
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
