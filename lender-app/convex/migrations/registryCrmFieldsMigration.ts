/**
 * Phase Contacts overhaul — backfill `linkStatus`, `lastActivityAt`,
 * `lastInteractionAt` on existing contacts from file links + activity log.
 */
import { v } from "convex/values";
import { mutation } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { assertDataMigrationAdmin } from "../migrationAdminAuth";
import { refreshContactCrmListFields } from "../contactCrmListFields";

export type RegistryCrmFieldsMigrationResult = {
  dryRun: boolean;
  contactsScanned: number;
  contactsUpdated: number;
  capped: boolean;
};

export const run = mutation({
  args: {
    adminSecret: v.string(),
    dryRun: v.optional(v.boolean()),
    organizationId: v.optional(v.id("organizations")),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    assertDataMigrationAdmin(args.adminSecret);

    const dryRun = args.dryRun ?? false;
    const cap = Math.min(Math.max(args.limit ?? 5000, 1), 20_000);
    let contactsScanned = 0;
    let contactsUpdated = 0;
    let capped = false;

    let contactIds: Id<"contacts">[];

    if (args.organizationId) {
      const rows = await ctx.db
        .query("contacts")
        .withIndex("by_organization_updatedAt", (q) =>
          q.eq("organizationId", args.organizationId!),
        )
        .take(cap + 1);
      capped = rows.length > cap;
      contactIds = rows.slice(0, cap).map((r) => r._id);
    } else {
      const rows = await ctx.db.query("contacts").take(cap + 1);
      capped = rows.length > cap;
      contactIds = rows.slice(0, cap).map((r) => r._id);
    }

    for (const contactId of contactIds) {
      contactsScanned += 1;
      if (dryRun) {
        contactsUpdated += 1;
        continue;
      }
      await refreshContactCrmListFields(ctx, contactId);
      contactsUpdated += 1;
    }

    const result: RegistryCrmFieldsMigrationResult = {
      dryRun,
      contactsScanned,
      contactsUpdated,
      capped,
    };
    return result;
  },
});
