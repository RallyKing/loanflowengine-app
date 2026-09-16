import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { assertOrganizationId } from "./organizationValidators";
import { requireOrgMemberKey, requireOrgReaderKey } from "./authUtils";

const memberKeyArg = { memberUserKey: v.optional(v.string()) };

const listReturns = v.object({
  templateIds: v.array(v.id("documentTaskTemplates")),
});

const toggleReturns = v.object({
  favorited: v.boolean(),
  templateId: v.id("documentTaskTemplates"),
});

/**
 * List favorited individual task templates for the caller in an org.
 * Indexed by org + user — no scheduler, no polling, no full-table scan.
 * Dedupes duplicate rows if a prior race left extras.
 */
export const listForOrg = query({
  args: {
    organizationId: v.id("organizations"),
    ...memberKeyArg,
  },
  returns: listReturns,
  handler: async (ctx, { organizationId, memberUserKey }) => {
    await assertOrganizationId(ctx, organizationId);
    const key = await requireOrgReaderKey(
      ctx,
      organizationId,
      memberUserKey,
      "documentTaskTemplateFavorites.listForOrg",
    );
    const rows = await ctx.db
      .query("documentTaskTemplateFavorites")
      .withIndex("by_org_user", (q) =>
        q.eq("organizationId", organizationId).eq("memberUserKey", key),
      )
      // bounded: per-user favorites within one org
      .collect();
    const seen = new Set<string>();
    const templateIds: Array<(typeof rows)[number]["templateId"]> = [];
    for (const row of rows) {
      const id = String(row.templateId);
      if (seen.has(id)) continue;
      seen.add(id);
      templateIds.push(row.templateId);
    }
    return { templateIds };
  },
});

/**
 * Toggle favorite for one org task template. Does not affect inject behavior.
 * Race-safe: collect all matching rows (never `.unique()`), delete-all to unfavorite,
 * or insert only when none remain.
 */
export const toggle = mutation({
  args: {
    organizationId: v.id("organizations"),
    templateId: v.id("documentTaskTemplates"),
    ...memberKeyArg,
  },
  returns: toggleReturns,
  handler: async (ctx, { organizationId, templateId, memberUserKey }) => {
    await assertOrganizationId(ctx, organizationId);
    const key = await requireOrgMemberKey(ctx, organizationId, memberUserKey, {
      permission: "files.view",
      stage: "documentTaskTemplateFavorites.toggle",
    });

    const template = await ctx.db.get(templateId);
    if (!template) {
      throw new Error("Task template not found.");
    }
    if (template.organizationId !== organizationId) {
      throw new Error("Template belongs to a different organization.");
    }

    const existing = await ctx.db
      .query("documentTaskTemplateFavorites")
      .withIndex("by_org_user_template", (q) =>
        q
          .eq("organizationId", organizationId)
          .eq("memberUserKey", key)
          .eq("templateId", templateId),
      )
      .collect();

    if (existing.length > 0) {
      // Unfavorite: delete every duplicate row so `.unique()` never blows up later.
      for (const row of existing) {
        await ctx.db.delete(row._id);
      }
      return { favorited: false, templateId };
    }

    await ctx.db.insert("documentTaskTemplateFavorites", {
      organizationId,
      memberUserKey: key,
      templateId,
      favoritedAt: Date.now(),
    });
    return { favorited: true, templateId };
  },
});
