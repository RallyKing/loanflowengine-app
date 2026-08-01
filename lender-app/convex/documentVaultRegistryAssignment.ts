import { mutation } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import {
  assertCanMutatePipelineRow,
} from "./organizationAccess";

const memberKeyArg = { memberUserKey: v.optional(v.string()) };

const registryKindV = v.union(
  v.literal("contact"),
  v.literal("entity"),
  v.literal("lender"),
);

function registryPatch(
  registryKind: "contact" | "entity" | "lender",
  registryId: string,
): {
  assignedContactId?: Id<"contacts">;
  assignedClientId?: Id<"clients">;
  assignedLenderId?: Id<"lenders">;
} {
  if (registryKind === "contact") {
    return {
      assignedContactId: registryId as Id<"contacts">,
      assignedClientId: undefined,
      assignedLenderId: undefined,
    };
  }
  if (registryKind === "entity") {
    return {
      assignedContactId: undefined,
      assignedClientId: registryId as Id<"clients">,
      assignedLenderId: undefined,
    };
  }
  return {
    assignedContactId: undefined,
    assignedClientId: undefined,
    assignedLenderId: registryId as Id<"lenders">,
  };
}

async function validateRegistry(
  ctx: { db: { get: (id: Id<"contacts"> | Id<"clients"> | Id<"lenders">) => Promise<unknown> } },
  registryKind: "contact" | "entity" | "lender",
  registryId: string,
) {
  if (registryKind === "contact") {
    const row = await ctx.db.get(registryId as Id<"contacts">);
    if (!row) throw new Error("Contact not found.");
  } else if (registryKind === "entity") {
    const row = await ctx.db.get(registryId as Id<"clients">);
    if (!row) throw new Error("Entity not found.");
  } else {
    const row = await ctx.db.get(registryId as Id<"lenders">);
    if (!row) throw new Error("Lender not found.");
  }
}

export const assignDocumentLink = mutation({
  args: {
    linkId: v.id("libraryDocumentLinks"),
    registryKind: registryKindV,
    registryId: v.string(),
    ...memberKeyArg,
  },
  handler: async (ctx, { linkId, registryKind, registryId, memberUserKey }) => {
    const link = await ctx.db.get(linkId);
    if (!link?.pipelineFileId) throw new Error("Document link not found.");
    const pipeline = await ctx.db.get(link.pipelineFileId);
    if (!pipeline) throw new Error("Pipeline file not found.");
    await assertCanMutatePipelineRow(ctx, pipeline, memberUserKey);
    await validateRegistry(ctx, registryKind, registryId);
    await ctx.db.patch(linkId, registryPatch(registryKind, registryId));
    return { ok: true as const };
  },
});

export const clearDocumentLinkAssignment = mutation({
  args: {
    linkId: v.id("libraryDocumentLinks"),
    ...memberKeyArg,
  },
  handler: async (ctx, { linkId, memberUserKey }) => {
    const link = await ctx.db.get(linkId);
    if (!link?.pipelineFileId) throw new Error("Document link not found.");
    const pipeline = await ctx.db.get(link.pipelineFileId);
    if (!pipeline) throw new Error("Pipeline file not found.");
    await assertCanMutatePipelineRow(ctx, pipeline, memberUserKey);
    await ctx.db.patch(linkId, {
      assignedContactId: undefined,
      assignedClientId: undefined,
      assignedLenderId: undefined,
    });
    return { ok: true as const };
  },
});

export const assignFolder = mutation({
  args: {
    folderId: v.id("documentFolders"),
    registryKind: registryKindV,
    registryId: v.string(),
    ...memberKeyArg,
  },
  handler: async (ctx, { folderId, registryKind, registryId, memberUserKey }) => {
    const folder = await ctx.db.get(folderId);
    if (!folder) throw new Error("Folder not found.");
    const pipeline = await ctx.db.get(folder.pipelineFileId);
    if (!pipeline) throw new Error("Pipeline file not found.");
    await assertCanMutatePipelineRow(ctx, pipeline, memberUserKey);
    await validateRegistry(ctx, registryKind, registryId);
    const now = Date.now();
    await ctx.db.patch(folderId, {
      ...registryPatch(registryKind, registryId),
      updatedAt: now,
    });
    return { ok: true as const };
  },
});

export const clearFolderAssignment = mutation({
  args: {
    folderId: v.id("documentFolders"),
    ...memberKeyArg,
  },
  handler: async (ctx, { folderId, memberUserKey }) => {
    const folder = await ctx.db.get(folderId);
    if (!folder) throw new Error("Folder not found.");
    const pipeline = await ctx.db.get(folder.pipelineFileId);
    if (!pipeline) throw new Error("Pipeline file not found.");
    await assertCanMutatePipelineRow(ctx, pipeline, memberUserKey);
    await ctx.db.patch(folderId, {
      assignedContactId: undefined,
      assignedClientId: undefined,
      assignedLenderId: undefined,
      updatedAt: Date.now(),
    });
    return { ok: true as const };
  },
});
