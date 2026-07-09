import { query } from "./_generated/server";
import { v } from "convex/values";

/**
 * CI helper: counts organization rows whose serialized document still contains
 * a legacy `org_` tenant token from a removed auth integration.
 */
export const scanOrganizationRowsForLegacyOrgPrefix = query({
  args: {},
  returns: v.object({
    organizationsChecked: v.number(),
    rowsWithLegacyOrgToken: v.number(),
  }),
  handler: async (ctx) => {
    const orgs = await ctx.db.query("organizations").collect();
    let rowsWithLegacyOrgToken = 0;
    for (const row of orgs) {
      if (JSON.stringify(row).includes("org_")) rowsWithLegacyOrgToken += 1;
    }
    return {
      organizationsChecked: orgs.length,
      rowsWithLegacyOrgToken,
    };
  },
});
