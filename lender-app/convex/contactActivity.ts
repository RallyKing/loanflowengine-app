import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { assertCanReadContactRow, assertCanMutateContactRow } from "./organizationAccess";
import { mirrorContactActivityToFeed } from "./activityFeed";
import { patchContactAfterActivity } from "./contactCrmListFields";

const activityKindV = v.union(
  v.literal("note"),
  v.literal("call"),
  v.literal("email"),
  v.literal("meeting"),
  v.literal("file_linked"),
  v.literal("file_unlinked"),
  v.literal("lender_linked"),
  v.literal("lender_unlinked"),
  v.literal("system"),
);

export type ContactActivityInsert = {
  contactId: Id<"contacts">;
  kind:
    | "note"
    | "call"
    | "email"
    | "meeting"
    | "file_linked"
    | "file_unlinked"
    | "lender_linked"
    | "lender_unlinked"
    | "system";
  summary: string;
  detail?: string;
  noteCategory?: string;
  actorUserKey?: string;
  relatedFileId?: Id<"pipeline">;
  relatedLenderId?: Id<"lenders">;
  at?: number;
};

export async function insertContactActivity(
  ctx: MutationCtx,
  row: ContactActivityInsert,
): Promise<Id<"contactActivity">> {
  const at = row.at ?? Date.now();
  const id = await ctx.db.insert("contactActivity", {
    contactId: row.contactId,
    at,
    kind: row.kind,
    summary: row.summary,
    detail: row.detail,
    noteCategory: row.noteCategory,
    actorUserKey: row.actorUserKey,
    relatedFileId: row.relatedFileId,
    relatedLenderId: row.relatedLenderId,
  });
  await mirrorContactActivityToFeed(ctx, {
    contactId: row.contactId,
    at,
    kind: row.kind,
    summary: row.summary,
    detail: row.detail,
    actorUserKey: row.actorUserKey,
    relatedFileId: row.relatedFileId,
    relatedLenderId: row.relatedLenderId,
  });
  await patchContactAfterActivity(ctx, row.contactId, { at, kind: row.kind });
  return id;
}

export const listForContact = query({
  args: {
    contactId: v.id("contacts"),
    limit: v.optional(v.number()),
    memberUserKey: v.optional(v.string()),
  },
  handler: async (ctx, { contactId, limit, memberUserKey }) => {
    const contact = await ctx.db.get(contactId);
    if (!contact) return [];
    await assertCanReadContactRow(ctx, contact, memberUserKey);
    const cap = Math.min(Math.max(limit ?? 80, 1), 200);
    return await ctx.db
      .query("contactActivity")
      .withIndex("by_contact_at", (q) => q.eq("contactId", contactId))
      .order("desc")
      .take(cap);
  },
});

const manualKindV = v.union(
  v.literal("note"),
  v.literal("call"),
  v.literal("email"),
  v.literal("meeting"),
);

export const addManual = mutation({
  args: {
    contactId: v.id("contacts"),
    kind: manualKindV,
    summary: v.string(),
    detail: v.optional(v.string()),
    noteCategory: v.optional(v.string()),
    memberUserKey: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.contactId);
    if (!row) throw new Error("Contact not found");
    await assertCanMutateContactRow(ctx, row, args.memberUserKey);
    const actor = args.memberUserKey?.trim();
    const summary = args.summary.trim();
    if (!summary) throw new Error("Summary is required");
    return await insertContactActivity(ctx, {
      contactId: args.contactId,
      kind: args.kind,
      summary,
      detail: args.detail?.trim() || undefined,
      noteCategory: args.noteCategory?.trim() || undefined,
      actorUserKey: actor,
    });
  },
});

export { activityKindV };
