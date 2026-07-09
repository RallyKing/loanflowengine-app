import { mutation, type MutationCtx } from "../_generated/server";
import { v } from "convex/values";
import { assertDataMigrationAdmin } from "../migrationAdminAuth";
import type { Doc, Id } from "../_generated/dataModel";
import {
  DEFAULT_CONTACT_ROLE_IDS,
  DEFAULT_CONTACT_ROLES,
  legacyRelationshipTypeToRoleId,
  resolveContactRoleIdFromLegacyDoc,
} from "../../lib/contact/contactRoles";
import { ensureOrganizationSettings } from "../organizationSettings";
import { refreshContactGlobalSearchText } from "../globalSearchSync";

type LegacyContact = Doc<"contacts"> & {
  labels?: string[];
  crmRelationshipTypes?: string[];
};

function stripLegacyContactFields(
  row: LegacyContact,
  contactRoleId: string,
): Omit<Doc<"contacts">, "_id" | "_creationTime"> {
  return {
    name: row.name,
    email: row.email,
    phone: row.phone,
    emails: row.emails,
    phones: row.phones,
    notes: row.notes,
    contactRoleId,
    companyName: row.companyName,
    companyKey: row.companyKey,
    emailKey: row.emailKey,
    preferredEmailId: row.preferredEmailId,
    preferredPhoneId: row.preferredPhoneId,
    preferredContactMethod: row.preferredContactMethod,
    organizationId: row.organizationId,
    demoBundleId: row.demoBundleId,
    globalSearchText: row.globalSearchText,
    createdAt: row.createdAt,
    updatedAt: Date.now(),
  };
}

export type ContactRolesMigrationResult = {
  dryRun: boolean;
  orgsProcessed: number;
  contactsScanned: number;
  contactsUpdated: number;
  fileLinksUpdated: number;
  lenderLinksUpdated: number;
  capped: boolean;
};

/**
 * Phase 25.1b — one-time migration: seed org contact roles, map legacy labels/enums
 * to `contactRoleId`, strip deprecated fields from contacts and links.
 */
async function runContactRolesMigration(
  ctx: MutationCtx,
  args: {
    dryRun: boolean;
    organizationId?: Id<"organizations">;
    limit?: number;
  },
): Promise<ContactRolesMigrationResult> {
    const dryRun = args.dryRun ?? false;
    const cap = Math.min(args.limit ?? 5000, 20_000);
    let orgsProcessed = 0;
    let contactsScanned = 0;
    let contactsUpdated = 0;
    let fileLinksUpdated = 0;
    let lenderLinksUpdated = 0;

    const orgs = args.organizationId
      ? [await ctx.db.get(args.organizationId)].filter(Boolean)
      : await ctx.db.query("organizations").collect();

    for (const org of orgs) {
      if (!org) continue;
      orgsProcessed += 1;
      if (!dryRun) {
        await ensureOrganizationSettings(ctx, org._id);
        const settings = await ctx.db
          .query("organizationSettings")
          .withIndex("by_organization", (q) => q.eq("organizationId", org._id))
          .first();
        if (settings && !settings.contactRoles?.length) {
          await ctx.db.patch(settings._id, {
            contactRoles: DEFAULT_CONTACT_ROLES,
            updatedAt: Date.now(),
          });
        }
      }

      const orgContacts = await ctx.db
        .query("contacts")
        .withIndex("by_organization_updatedAt", (q) =>
          q.eq("organizationId", org._id),
        )
        .collect();

      for (const row of orgContacts) {
        if (contactsScanned >= cap) break;
        contactsScanned += 1;
        const legacy = row as LegacyContact;
        const needsRole = !legacy.contactRoleId;
        const hasLegacy =
          (legacy.labels?.length ?? 0) > 0 ||
          (legacy.crmRelationshipTypes?.length ?? 0) > 0;
        if (!needsRole && !hasLegacy) continue;

        const contactRoleId =
          legacy.contactRoleId ??
          resolveContactRoleIdFromLegacyDoc(legacy);

        if (dryRun) {
          contactsUpdated += 1;
          continue;
        }

        await ctx.db.replace(row._id, stripLegacyContactFields(legacy, contactRoleId));
        await refreshContactGlobalSearchText(ctx, row._id);
        contactsUpdated += 1;
      }
    }

    // Global contacts without org + link tables
    const allContacts = args.organizationId
      ? []
      : await ctx.db.query("contacts").collect();

    for (const row of allContacts) {
      if (contactsScanned >= cap) break;
      if (row.organizationId) continue;
      contactsScanned += 1;
      const legacy = row as LegacyContact;
      const hasLegacy =
        (legacy.labels?.length ?? 0) > 0 ||
        (legacy.crmRelationshipTypes?.length ?? 0) > 0 ||
        !legacy.contactRoleId;
      if (!hasLegacy) continue;
      const contactRoleId =
        legacy.contactRoleId ??
        resolveContactRoleIdFromLegacyDoc(legacy);
      if (dryRun) {
        contactsUpdated += 1;
        continue;
      }
      await ctx.db.replace(row._id, stripLegacyContactFields(legacy, contactRoleId));
      await refreshContactGlobalSearchText(ctx, row._id);
      contactsUpdated += 1;
    }

    type LegacyFileLink = Doc<"contactFileLinks"> & {
      relationshipType?: string;
    };
    for (const link of await ctx.db.query("contactFileLinks").collect()) {
      const legacy = link as LegacyFileLink;
      if (legacy.contactRoleId && !legacy.relationshipType) continue;
      const contactRoleId =
        legacy.contactRoleId ??
        legacyRelationshipTypeToRoleId(legacy.relationshipType) ??
        DEFAULT_CONTACT_ROLE_IDS.client;
      if (dryRun) {
        fileLinksUpdated += 1;
        continue;
      }
      const { relationshipType: _rt, ...rest } = legacy as LegacyFileLink &
        Record<string, unknown>;
      await ctx.db.patch(link._id, {
        ...rest,
        contactRoleId,
        updatedAt: Date.now(),
      });
      fileLinksUpdated += 1;
    }

    type LegacyLenderLink = Doc<"contactLenderLinks"> & {
      relationshipType?: string;
    };
    for (const link of await ctx.db.query("contactLenderLinks").collect()) {
      const legacy = link as LegacyLenderLink;
      if (legacy.contactRoleId && !legacy.relationshipType) continue;
      const contactRoleId =
        legacy.contactRoleId ??
        legacyRelationshipTypeToRoleId(legacy.relationshipType) ??
        DEFAULT_CONTACT_ROLE_IDS.lenderRep;
      if (dryRun) {
        lenderLinksUpdated += 1;
        continue;
      }
      const { relationshipType: _rt, ...rest } = legacy as LegacyLenderLink &
        Record<string, unknown>;
      await ctx.db.patch(link._id, {
        ...rest,
        contactRoleId,
        updatedAt: Date.now(),
      });
      lenderLinksUpdated += 1;
    }

  return {
    dryRun,
    orgsProcessed,
    contactsScanned,
    contactsUpdated,
    fileLinksUpdated,
    lenderLinksUpdated,
    capped: contactsScanned >= cap,
  };
}

/** Callable via `npx convex run --prod` with deploy key / logged-in CLI. */
export const migrateContactRolesAndPurgeLabels = mutation({
  args: {
    adminSecret: v.string(),
    dryRun: v.optional(v.boolean()),
    organizationId: v.optional(v.id("organizations")),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    assertDataMigrationAdmin(args.adminSecret);
    return runContactRolesMigration(ctx, {
      dryRun: args.dryRun ?? false,
      organizationId: args.organizationId,
      limit: args.limit,
    });
  },
});
