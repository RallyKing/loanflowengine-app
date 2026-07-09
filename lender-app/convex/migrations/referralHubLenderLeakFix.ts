import { mutation, query } from "../_generated/server";
import { v } from "convex/values";
import { assertDataMigrationAdmin } from "../migrationAdminAuth";
import type { Doc, Id } from "../_generated/dataModel";
import {
  canonicalContactRoleIdFromDoc,
  DEFAULT_CONTACT_ROLE_IDS,
  isLenderRepRoleId,
  isReferralPartnerRoleId,
} from "../../lib/contact/contactRoles";
import { refreshContactGlobalSearchText } from "../globalSearchSync";

const LEAK_NAME_SUBSTRINGS = ["has 9 lenders", "a-paper lender"] as const;

export type ReferralHubLeakAuditRow = {
  contactId: string;
  name: string;
  contactRoleId: string | undefined;
  lenderLinkCount: number;
  referralFileLinkCount: number;
  fileReferralPartnerEdgeCount: number;
  flaggedByName: boolean;
  flaggedByRoleMismatch: boolean;
};

export type ReferralHubLeakAuditResult = {
  rows: ReferralHubLeakAuditRow[];
  summary: {
    scanned: number;
    flagged: number;
    referralPartnerContacts: number;
    lenderRepContacts: number;
  };
};

function nameMatchesLeakPattern(name: string): boolean {
  const n = name.trim().toLowerCase();
  return LEAK_NAME_SUBSTRINGS.some((s) => n.includes(s));
}

/** Phase 25.6 — read-only audit for referral hub lender leak. */
export const auditReferralHubLenderLeak = query({
  args: {
    adminSecret: v.string(),
    organizationId: v.optional(v.id("organizations")),
  },
  handler: async (ctx, args): Promise<ReferralHubLeakAuditResult> => {
    assertDataMigrationAdmin(args.adminSecret);
    const contacts = args.organizationId
      ? await ctx.db
          .query("contacts")
          .withIndex("by_organization_updatedAt", (q) =>
            q.eq("organizationId", args.organizationId!),
          )
          .collect()
      : await ctx.db.query("contacts").collect();

    const rows: ReferralHubLeakAuditRow[] = [];
    let referralPartnerContacts = 0;
    let lenderRepContacts = 0;

    for (const contact of contacts) {
      const canonical = canonicalContactRoleIdFromDoc(contact);
      if (isReferralPartnerRoleId(canonical)) referralPartnerContacts += 1;
      if (isLenderRepRoleId(canonical)) lenderRepContacts += 1;

      const flaggedByName = nameMatchesLeakPattern(contact.name ?? "");
      const flaggedByRoleMismatch =
        nameMatchesLeakPattern(contact.name ?? "") ||
        (isLenderRepRoleId(canonical) &&
          (await ctx.db
            .query("contactFileLinks")
            .withIndex("by_contact", (q) => q.eq("contactId", contact._id))
            .collect()
          ).some((l) => isReferralPartnerRoleId(l.contactRoleId?.trim())));

      const fileLinks = await ctx.db
        .query("contactFileLinks")
        .withIndex("by_contact", (q) => q.eq("contactId", contact._id))
        .collect();
      const referralFileLinkCount = fileLinks.filter((l) =>
        isReferralPartnerRoleId(l.contactRoleId?.trim()),
      ).length;

      const lenderLinkCount = (
        await ctx.db
          .query("contactLenderLinks")
          .withIndex("by_contact", (q) => q.eq("contactId", contact._id))
          .collect()
      ).length;

      const fileReferralPartnerEdgeCount = (
        await ctx.db
          .query("fileReferralPartners")
          .withIndex("by_entity", (q) => q.eq("contactId", contact._id))
          .collect()
      ).length;

      if (
        !flaggedByName &&
        !flaggedByRoleMismatch &&
        referralFileLinkCount === 0 &&
        fileReferralPartnerEdgeCount === 0
      ) {
        continue;
      }

      if (
        flaggedByName ||
        flaggedByRoleMismatch ||
        (referralFileLinkCount > 0 && !isReferralPartnerRoleId(canonical))
      ) {
        rows.push({
          contactId: String(contact._id),
          name: contact.name?.trim() ?? "",
          contactRoleId: canonical,
          lenderLinkCount,
          referralFileLinkCount,
          fileReferralPartnerEdgeCount,
          flaggedByName,
          flaggedByRoleMismatch,
        });
      }
    }

    return {
      rows,
      summary: {
        scanned: contacts.length,
        flagged: rows.length,
        referralPartnerContacts,
        lenderRepContacts,
      },
    };
  },
});

export type ReferralHubLeakFixResult = {
  dryRun: boolean;
  contactsPatched: number;
  fileLinksPatched: number;
  fileReferralPartnerEdgesRemoved: number;
  patched: Array<{ contactId: string; name: string; fromRole?: string; toRole: string }>;
};

/**
 * Phase 25.6 — correct lender contacts mis-tagged on contacts / file links / junction.
 */
export const fixReferralHubLenderLeak = mutation({
  args: {
    adminSecret: v.string(),
    dryRun: v.optional(v.boolean()),
    organizationId: v.optional(v.id("organizations")),
    contactIds: v.optional(v.array(v.id("contacts"))),
  },
  handler: async (ctx, args): Promise<ReferralHubLeakFixResult> => {
    assertDataMigrationAdmin(args.adminSecret);
    const dryRun = args.dryRun ?? false;
    const patched: ReferralHubLeakFixResult["patched"] = [];
    let contactsPatched = 0;
    let fileLinksPatched = 0;
    let fileReferralPartnerEdgesRemoved = 0;

    let targets: Doc<"contacts">[] = [];
    if (args.contactIds?.length) {
      for (const id of args.contactIds) {
        const doc = await ctx.db.get(id);
        if (doc) targets.push(doc);
      }
    } else {
      const all = args.organizationId
        ? await ctx.db
            .query("contacts")
            .withIndex("by_organization_updatedAt", (q) =>
              q.eq("organizationId", args.organizationId!),
            )
            .collect()
        : await ctx.db.query("contacts").collect();
      for (const c of all) {
        if (nameMatchesLeakPattern(c.name ?? "")) {
          targets.push(c);
          continue;
        }
        if (!isReferralPartnerRoleId(canonicalContactRoleIdFromDoc(c))) continue;
        const lenderLink = await ctx.db
          .query("contactLenderLinks")
          .withIndex("by_contact", (q) => q.eq("contactId", c._id))
          .first();
        if (lenderLink) targets.push(c);
      }
    }

    for (const contact of targets) {
      const canonical = canonicalContactRoleIdFromDoc(contact);
      const targetRole = isLenderRepRoleId(canonical)
        ? DEFAULT_CONTACT_ROLE_IDS.lenderRep
        : nameMatchesLeakPattern(contact.name ?? "")
          ? DEFAULT_CONTACT_ROLE_IDS.lenderRep
          : canonical === DEFAULT_CONTACT_ROLE_IDS.client
            ? DEFAULT_CONTACT_ROLE_IDS.client
            : DEFAULT_CONTACT_ROLE_IDS.lenderRep;

      const needsContactPatch =
        isReferralPartnerRoleId(canonical) ||
        (nameMatchesLeakPattern(contact.name ?? "") &&
          canonical !== targetRole);

      if (needsContactPatch) {
        patched.push({
          contactId: String(contact._id),
          name: contact.name?.trim() ?? "",
          fromRole: canonical,
          toRole: targetRole,
        });
        contactsPatched += 1;
        if (!dryRun) {
          await ctx.db.patch(contact._id, {
            contactRoleId: targetRole,
            updatedAt: Date.now(),
          });
          await refreshContactGlobalSearchText(ctx, contact._id);
        }
      }

      const fileLinks = await ctx.db
        .query("contactFileLinks")
        .withIndex("by_contact", (q) => q.eq("contactId", contact._id))
        .collect();
      for (const link of fileLinks) {
        if (!isReferralPartnerRoleId(link.contactRoleId?.trim())) continue;
        fileLinksPatched += 1;
        if (!dryRun) {
          await ctx.db.patch(link._id, {
            contactRoleId: targetRole,
            updatedAt: Date.now(),
          });
        }
      }

      const frEdges = await ctx.db
        .query("fileReferralPartners")
        .withIndex("by_entity", (q) => q.eq("contactId", contact._id))
        .collect();
      for (const edge of frEdges) {
        fileReferralPartnerEdgesRemoved += 1;
        if (!dryRun) await ctx.db.delete(edge._id);
      }
    }

    // Global sweep: file links marked referral where contact is not.
    const allLinks = await ctx.db.query("contactFileLinks").collect();
    for (const link of allLinks) {
      if (!isReferralPartnerRoleId(link.contactRoleId?.trim())) continue;
      const contact = await ctx.db.get(link.contactId);
      if (!contact) continue;
      if (args.organizationId && contact.organizationId !== args.organizationId) {
        continue;
      }
      const canonical = canonicalContactRoleIdFromDoc(contact);
      if (isReferralPartnerRoleId(canonical)) continue;
      fileLinksPatched += 1;
      if (!dryRun) {
        await ctx.db.patch(link._id, {
          contactRoleId:
            isLenderRepRoleId(canonical) || nameMatchesLeakPattern(contact.name ?? "")
              ? DEFAULT_CONTACT_ROLE_IDS.lenderRep
              : canonical ?? DEFAULT_CONTACT_ROLE_IDS.client,
          updatedAt: Date.now(),
        });
      }
    }

    return {
      dryRun,
      contactsPatched,
      fileLinksPatched,
      fileReferralPartnerEdgesRemoved,
      patched,
    };
  },
});
