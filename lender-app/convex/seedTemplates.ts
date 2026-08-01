import { internalMutation, mutation } from "./_generated/server";
import { v } from "convex/values";
import { assertOrganizationId } from "./organizationValidators";
import { seedDocumentTaskTemplatesForOrg } from "./documentTaskTemplateSeed";

const memberKeyArg = { memberUserKey: v.optional(v.string()) };

/** Public — seed baseline document task template stacks for one organization. */
export const seedDocumentTaskTemplates = mutation({
  args: {
    organizationId: v.id("organizations"),
    force: v.optional(v.boolean()),
    ...memberKeyArg,
  },
  handler: async (ctx, { organizationId, force, memberUserKey }) => {
    await assertOrganizationId(ctx, organizationId);
    const key = memberUserKey?.trim() || "__seed__";
    return await seedDocumentTaskTemplatesForOrg(
      ctx,
      organizationId,
      key,
      force === true,
    );
  },
});

/** Internal — seed every organization that has no template stacks yet. */
export const seedAllOrganizationsBaseline = internalMutation({
  args: {},
  handler: async (ctx) => {
    const orgs = await ctx.db.query("organizations").collect();
    let seededOrgs = 0;
    let totalTemplates = 0;
    for (const org of orgs) {
      const result = await seedDocumentTaskTemplatesForOrg(
        ctx,
        org._id,
        "__system_seed__",
        false,
      );
      if (result.seeded) {
        seededOrgs += 1;
        totalTemplates += result.templateCount;
      }
    }
    return { ok: true as const, seededOrgs, totalTemplates };
  },
});
