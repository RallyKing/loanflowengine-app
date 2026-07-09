import { mutation, type MutationCtx } from "../_generated/server";
import { v } from "convex/values";
import { assertDataMigrationAdmin } from "../migrationAdminAuth";
import type { Doc } from "../_generated/dataModel";
import {
  canonicalContactRoleIdsFromDoc,
  effectiveContactRoleIdsFromDoc,
  primaryContactRoleIdFromDoc,
} from "../../lib/contact/contactRoles";
import { refreshContactGlobalSearchText } from "../globalSearchSync";

export type ContactMultiRoleMigrationResult = {
  dryRun: boolean;
  contactsScanned: number;
  contactsUpdated: number;
  capped: boolean;
};

async function runContactMultiRoleMigration(
  ctx: MutationCtx,
  args: { dryRun: boolean; limit?: number },
): Promise<ContactMultiRoleMigrationResult> {
  const cap = Math.min(args.limit ?? 20_000, 50_000);
  let contactsScanned = 0;
  let contactsUpdated = 0;

  for (const row of await ctx.db.query("contacts").collect()) {
    if (contactsScanned >= cap) break;
    contactsScanned += 1;

    const legacy = row as Doc<"contacts">;
    const nextIds = effectiveContactRoleIdsFromDoc(legacy);
    const existing = canonicalContactRoleIdsFromDoc(legacy);
    const same =
      existing.length === nextIds.length &&
      existing.every((id, i) => id === nextIds[i]);
    if (same && legacy.contactRoleIds?.length) continue;

    contactsUpdated += 1;
    if (args.dryRun) continue;

    await ctx.db.patch(legacy._id, {
      contactRoleIds: nextIds,
      contactRoleId: primaryContactRoleIdFromDoc({ contactRoleIds: nextIds }),
      updatedAt: Date.now(),
    });
    await refreshContactGlobalSearchText(ctx, legacy._id);
  }

  return {
    dryRun: args.dryRun,
    contactsScanned,
    contactsUpdated,
    capped: contactsScanned >= cap,
  };
}

export const migrateContactMultiRole = mutation({
  args: {
    adminSecret: v.string(),
    dryRun: v.optional(v.boolean()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    assertDataMigrationAdmin(args.adminSecret);
    return runContactMultiRoleMigration(ctx, {
      dryRun: args.dryRun ?? false,
      limit: args.limit,
    });
  },
});
