import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { assertOrgMember } from "./organizationAccess";
import { resolveClientAccessLevel } from "./resourceAccess";

const manualKindV = v.union(
  v.literal("note"),
  v.literal("call"),
  v.literal("email"),
  v.literal("meeting"),
);

export const listForEntity = query({
  args: {
    clientId: v.id("clients"),
    limit: v.optional(v.number()),
    memberUserKey: v.string(),
  },
  handler: async (ctx, { clientId, limit, memberUserKey }) => {
    const client = await ctx.db.get(clientId);
    if (!client) return [];
    await assertOrgMember(ctx, client.organizationId, memberUserKey);
    const level = await resolveClientAccessLevel(ctx, client, memberUserKey);
    if (level === "none") return [];
    const cap = Math.min(Math.max(limit ?? 80, 1), 200);
    return await ctx.db
      .query("entityActivity")
      .withIndex("by_client_at", (q) => q.eq("clientId", clientId))
      .order("desc")
      .take(cap);
  },
});

async function assertEntityMutable(
  ctx: MutationCtx,
  clientId: Id<"clients">,
  memberUserKey: string,
) {
  const client = await ctx.db.get(clientId);
  if (!client) throw new Error("Business entity not found.");
  await assertOrgMember(ctx, client.organizationId, memberUserKey);
  const level = await resolveClientAccessLevel(ctx, client, memberUserKey);
  if (level !== "edit") {
    throw new Error("You do not have permission to edit this entity.");
  }
  return client;
}

export const addManual = mutation({
  args: {
    clientId: v.id("clients"),
    kind: manualKindV,
    summary: v.string(),
    detail: v.optional(v.string()),
    noteCategory: v.optional(v.string()),
    memberUserKey: v.string(),
  },
  handler: async (ctx, args) => {
    await assertEntityMutable(ctx, args.clientId, args.memberUserKey);
    const summary = args.summary.trim();
    if (!summary) throw new Error("Summary is required.");
    const now = Date.now();
    return await ctx.db.insert("entityActivity", {
      clientId: args.clientId,
      at: now,
      kind: args.kind,
      summary,
      detail: args.detail?.trim() || undefined,
      noteCategory: args.noteCategory?.trim() || undefined,
      actorUserKey: args.memberUserKey.trim(),
    });
  },
});
