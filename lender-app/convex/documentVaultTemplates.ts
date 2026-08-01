import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { assertOrganizationId } from "./organizationValidators";
import {
  requireOrgReaderKey,
  requireOrgMemberKey,
} from "./authUtils";

const memberUserKeyArg = { memberUserKey: v.optional(v.string()) };

const MAX_TITLE_LEN = 200;
const MAX_BODY_LEN = 500_000;
const MAX_DESC_LEN = 500;

async function requireOrgReader(
  ctx: QueryCtx,
  organizationId: Id<"organizations">,
  memberUserKey?: string,
) {
  await assertOrganizationId(ctx, organizationId);
  return requireOrgReaderKey(
    ctx,
    organizationId,
    memberUserKey,
    "documentVaultTemplates.requireOrgReader",
  );
}

async function requireOrgFileEditor(
  ctx: MutationCtx,
  organizationId: Id<"organizations">,
  memberUserKey?: string,
) {
  await assertOrganizationId(ctx, organizationId);
  return requireOrgMemberKey(ctx, organizationId, memberUserKey, {
    permission: "files.edit",
    stage: "documentVaultTemplates.requireOrgFileEditor",
  });
}

export const listForOrganization = query({
  args: {
    organizationId: v.id("organizations"),
    ...memberUserKeyArg,
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { organizationId, memberUserKey, limit }) => {
    await requireOrgReader(ctx, organizationId, memberUserKey);
    const cap = Math.min(Math.max(limit ?? 40, 1), 80);
    const rows = await ctx.db
      .query("documentVaultTemplates")
      .withIndex("by_organization_updated", (q) =>
        q.eq("organizationId", organizationId),
      )
      .order("desc")
      .take(cap);
    return rows.map((row) => ({
      _id: row._id,
      title: row.title,
      description: row.description,
      bodyHtml: row.bodyHtml,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }));
  },
});

export const create = mutation({
  args: {
    organizationId: v.id("organizations"),
    title: v.string(),
    bodyHtml: v.string(),
    description: v.optional(v.string()),
    ...memberUserKeyArg,
  },
  handler: async (ctx, args) => {
    const key = await requireOrgFileEditor(
      ctx,
      args.organizationId,
      args.memberUserKey,
    );
    const title = args.title.trim().slice(0, MAX_TITLE_LEN);
    if (!title) throw new Error("Template title is required.");
    const bodyHtml = args.bodyHtml.trim();
    if (!bodyHtml) throw new Error("Template body is required.");
    if (bodyHtml.length > MAX_BODY_LEN) {
      throw new Error("Template body is too large.");
    }
    const description = args.description?.trim().slice(0, MAX_DESC_LEN);

    const now = Date.now();
    const templateId = await ctx.db.insert("documentVaultTemplates", {
      organizationId: args.organizationId,
      title,
      description: description || undefined,
      bodyHtml,
      createdByUserKey: key,
      createdAt: now,
      updatedAt: now,
    });
    return { templateId };
  },
});
