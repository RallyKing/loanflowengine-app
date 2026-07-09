import { mutation } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { pickCanonicalOrgMember } from "./orgMembership";
import { seedSystemRolesForOrganization } from "./organizationRbac";
import {
  hashPassword,
  normalizePortalEmailKey,
  randomHex,
} from "./clientPortalCrypto";
import {
  E2E_ORG_PRIMARY_SLUG,
  E2E_ORG_SECONDARY_SLUG,
  E2E_USER_CATALOG,
} from "../lib/testing/e2eUserCatalog";
import { validatePlaintextPasswordPolicy } from "../lib/auth/passwordPolicy";

function requireSeedSecret(secret: string): void {
  const expected = process.env.TESTING_SEED_SECRET?.trim();
  if (!expected || secret !== expected) {
    throw new Error(
      "testingSeed: invalid secret (set TESTING_SEED_SECRET in Convex env).",
    );
  }
}

function normKey(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

const PRIMARY_DEAL_NAME = "E2E Seed — Primary Deal";
const SECONDARY_DEAL_NAME = "E2E Seed — Secondary Deal";

export const seedE2EWorkspace = mutation({
  args: {
    secret: v.string(),
    /**
     * Plaintext portal password for `e2e-client-portal@dlc.test` (same 6–128
     * policy as product). Omit to skip portal identity + grant setup.
     */
    portalClientPassword: v.optional(v.string()),
  },
  handler: async (ctx, { secret, portalClientPassword }) => {
    requireSeedSecret(secret);
    const now = Date.now();

    async function ensureOrg(
      slug: string,
      name: string,
    ): Promise<Id<"organizations">> {
      const hit = await ctx.db
        .query("organizations")
        .withIndex("by_slug", (q) => q.eq("slug", slug))
        .unique();
      if (hit) {
        await ctx.db.patch(hit._id, { name, updatedAt: now });
        return hit._id;
      }
      return await ctx.db.insert("organizations", {
        name,
        slug,
        createdAt: now,
        updatedAt: now,
      });
    }

    const primaryOrgId = await ensureOrg(
      E2E_ORG_PRIMARY_SLUG,
      "E2E Primary Organization",
    );
    const secondaryOrgId = await ensureOrg(
      E2E_ORG_SECONDARY_SLUG,
      "E2E Secondary Organization",
    );

    const primaryRoles = await seedSystemRolesForOrganization(
      ctx,
      primaryOrgId,
    );
    const secondaryRoles = await seedSystemRolesForOrganization(
      ctx,
      secondaryOrgId,
    );

    for (const entry of E2E_USER_CATALOG) {
      if (entry.persona === "client_portal") continue;
      const orgId =
        entry.orgSlug === "primary" ? primaryOrgId : secondaryOrgId;
      const roles =
        entry.orgSlug === "primary" ? primaryRoles : secondaryRoles;

      let assignedRoleId: Id<"organizationRoles"> | undefined;
      if (entry.assignedPreset === "admin") assignedRoleId = roles.adminId;
      else if (entry.assignedPreset === "manager")
        assignedRoleId = roles.managerId;
      else if (entry.assignedPreset === "user") assignedRoleId = roles.userId;

      const rows = await ctx.db
        .query("organizationMembers")
        .withIndex("by_org_user", (q) =>
          q.eq("organizationId", orgId).eq("userKey", entry.userKey),
        )
        .collect();
      const existing = pickCanonicalOrgMember(rows);
      if (existing) {
        await ctx.db.patch(existing._id, {
          role: entry.membershipRole,
          assignedRoleId,
        });
      } else {
        await ctx.db.insert("organizationMembers", {
          organizationId: orgId,
          userKey: entry.userKey,
          role: entry.membershipRole,
          assignedRoleId,
          createdAt: now,
        });
      }
    }

    /** One directory lender scoped to primary org (scenario / attach tests). */
    const company = "E2E Seeded Lender LLC";
    const email = "deals@e2e-seeded-lender.test";
    const ck = normKey(company);
    const ek = normKey(email);
    let lenderId: Id<"lenders"> | null = null;
    const lenderHit = await ctx.db
      .query("lenders")
      .withIndex("by_company_email", (q) =>
        q.eq("companyKey", ck).eq("emailKey", ek),
      )
      .first();
    if (lenderHit && lenderHit.organizationId === primaryOrgId) {
      lenderId = lenderHit._id;
    } else {
      lenderId = await ctx.db.insert("lenders", {
        source: "E2E",
        section: "Test",
        company,
        contactName: "Alex Underwriter",
        titleRole: "Director",
        phone: "",
        email,
        website: "",
        entityType: "Private / Hedge Fund",
        primaryNiche: "Bridge — E2E",
        programs: "Bridge; DSCR; E2E",
        propertyTypes: "Multifamily",
        exclusions: "",
        statesServed: "Nationwide",
        ownerOrInvestor: "",
        ltv: "",
        interestRates: "",
        amortTerm: "",
        referralFees: "",
        notes: "Synthetic lender for automated QA.",
        status: "Active",
        lastUpdated: "",
        companyKey: ck,
        emailKey: ek,
        contactKey: normKey(`Alex Underwriter${email}`),
        createdAt: now,
        updatedAt: now,
        organizationId: primaryOrgId,
      });
    }

    let primaryFileId: Id<"pipeline"> | null = null;
    const primaryFiles = await ctx.db
      .query("pipeline")
      .withIndex("by_organization_createdAt", (q) =>
        q.eq("organizationId", primaryOrgId),
      )
      .collect();
    const existingPrimary = primaryFiles.find(
      (r) => r.fileName === PRIMARY_DEAL_NAME,
    );
    const ownerKey = E2E_USER_CATALOG.find((e) => e.persona === "org_owner")!
      .userKey;

    if (existingPrimary) {
      primaryFileId = existingPrimary._id;
      await ctx.db.patch(primaryFileId, {
        lenders: lenderId ? [lenderId] : [],
        ownerUserId: ownerKey,
        ownerUserKey: ownerKey,
        updatedAt: now,
      });
    } else if (lenderId) {
      primaryFileId = await ctx.db.insert("pipeline", {
        fileName: PRIMARY_DEAL_NAME,
        status: "Lead",
        rate: 0,
        term: "",
        lenders: [lenderId],
        contacts: [],
        organizationId: primaryOrgId,
        ownerUserId: ownerKey,
        ownerUserKey: ownerKey,
        createdAt: now,
        updatedAt: now,
      });
    }

    const demoKey = E2E_USER_CATALOG.find((e) => e.persona === "demo_sandbox")!
      .userKey;
    let secondaryFileId: Id<"pipeline"> | null = null;
    const secondaryFiles = await ctx.db
      .query("pipeline")
      .withIndex("by_organization_createdAt", (q) =>
        q.eq("organizationId", secondaryOrgId),
      )
      .collect();
    const existingSecondary = secondaryFiles.find(
      (r) => r.fileName === SECONDARY_DEAL_NAME,
    );
    if (existingSecondary) {
      secondaryFileId = existingSecondary._id;
      await ctx.db.patch(secondaryFileId, {
        ownerUserId: demoKey,
        ownerUserKey: demoKey,
        updatedAt: now,
      });
    } else {
      secondaryFileId = await ctx.db.insert("pipeline", {
        fileName: SECONDARY_DEAL_NAME,
        status: "Lead",
        rate: 0,
        term: "",
        lenders: [],
        contacts: [],
        organizationId: secondaryOrgId,
        ownerUserId: demoKey,
        ownerUserKey: demoKey,
        createdAt: now,
        updatedAt: now,
      });
    }

    /** CRM contacts + links on primary deal */
    if (primaryFileId) {
      const c1Email = "borrower@e2e-primary.test";
      const c1Key = normalizePortalEmailKey(c1Email);
      let contact1 = await ctx.db
        .query("contacts")
        .withIndex("by_organization_emailKey", (q) =>
          q.eq("organizationId", primaryOrgId).eq("emailKey", c1Key),
        )
        .first();
      if (!contact1) {
        const id = await ctx.db.insert("contacts", {
          name: "E2E Borrower Ava",
          email: c1Email,
          phone: "",
          notes: "Seeded borrower contact.",
          organizationId: primaryOrgId,
          emailKey: c1Key,
          companyName: "E2E Borrower Co",
          companyKey: normKey("E2E Borrower Co"),
          contactRoleId: "client",
          createdAt: now,
          updatedAt: now,
        });
        contact1 = await ctx.db.get(id);
      }
      if (contact1) {
        const link = await ctx.db
          .query("contactFileLinks")
          .withIndex("by_contact_file", (q) =>
            q.eq("contactId", contact1!._id).eq("fileId", primaryFileId!),
          )
          .unique();
        if (!link) {
          await ctx.db.insert("contactFileLinks", {
            contactId: contact1._id,
            fileId: primaryFileId,
            role: "Borrower",
            contactRoleId: "client",
            createdAt: now,
            updatedAt: now,
          });
        }
      }

      const referralEmail = E2E_USER_CATALOG.find(
        (e) => e.persona === "referral_partner",
      )!.username;
      const refKey = normalizePortalEmailKey(referralEmail);
      let refContact = await ctx.db
        .query("contacts")
        .withIndex("by_organization_emailKey", (q) =>
          q.eq("organizationId", primaryOrgId).eq("emailKey", refKey),
        )
        .first();
      if (!refContact) {
        const id = await ctx.db.insert("contacts", {
          name: "E2E Referral Riley",
          email: referralEmail,
          phone: "",
          notes: "Seeded referral partner contact.",
          organizationId: primaryOrgId,
          emailKey: refKey,
          contactRoleId: "referral_partner",
          createdAt: now,
          updatedAt: now,
        });
        refContact = await ctx.db.get(id);
      }
      if (refContact) {
        const link = await ctx.db
          .query("contactFileLinks")
          .withIndex("by_contact_file", (q) =>
            q.eq("contactId", refContact!._id).eq("fileId", primaryFileId!),
          )
          .unique();
        if (!link) {
          await ctx.db.insert("contactFileLinks", {
            contactId: refContact._id,
            fileId: primaryFileId,
            role: "Referral partner",
            contactRoleId: "referral_partner",
            createdAt: now,
            updatedAt: now,
          });
        }
      }
    }

    /** Task on primary deal */
    if (primaryFileId) {
      const title = "E2E — Follow up on scenario match";
      const existingTask = await ctx.db
        .query("tasks")
        .withIndex("by_relatedFile", (q) =>
          q.eq("relatedFileId", primaryFileId!),
        )
        .collect();
      if (!existingTask.some((t) => t.title === title)) {
        await ctx.db.insert("tasks", {
          title,
          type: "work",
          category: "call",
          quadrant: 2,
          status: "todo",
          priority: 1,
          relatedFileId: primaryFileId,
          organizationId: primaryOrgId,
          createdAt: now,
          updatedAt: now,
        });
      }
    }

    /** Portal grant + password identity */
    if (
      primaryFileId &&
      portalClientPassword &&
      validatePlaintextPasswordPolicy(portalClientPassword) === null
    ) {
      const clientEntry = E2E_USER_CATALOG.find(
        (e) => e.persona === "client_portal",
      )!;
      const orgScope = String(primaryOrgId);
      const emailKey = normalizePortalEmailKey(clientEntry.username);
      const salt = randomHex(16);
      const hash = await hashPassword(portalClientPassword, salt);
      const idn = await ctx.db
        .query("clientPortalIdentities")
        .withIndex("by_scope_email", (q) =>
          q.eq("orgScope", orgScope).eq("emailKey", emailKey),
        )
        .first();
      if (idn) {
        await ctx.db.patch(idn._id, {
          passwordSalt: salt,
          passwordHash: hash,
          updatedAt: now,
        });
      } else {
        await ctx.db.insert("clientPortalIdentities", {
          orgScope,
          emailKey,
          passwordSalt: salt,
          passwordHash: hash,
          createdAt: now,
          updatedAt: now,
        });
      }
      const grantHit = await ctx.db
        .query("clientPortalGrants")
        .withIndex("by_email_file", (q) =>
          q.eq("emailKey", emailKey).eq("pipelineFileId", primaryFileId),
        )
        .first();
      if (!grantHit) {
        await ctx.db.insert("clientPortalGrants", {
          orgScope,
          emailKey,
          pipelineFileId: primaryFileId,
          status: "active",
          invitedByUserKey: ownerKey,
          label: "E2E seeded client",
          permission: "view_upload",
          createdAt: now,
          updatedAt: now,
        });
      }
    }

    return {
      ok: true as const,
      primaryOrganizationId: primaryOrgId,
      secondaryOrganizationId: secondaryOrgId,
      primaryPipelineFileId: primaryFileId,
      secondaryPipelineFileId: secondaryFileId,
      seededLenderId: lenderId,
      portalConfigured: Boolean(
        portalClientPassword &&
          validatePlaintextPasswordPolicy(portalClientPassword) === null,
      ),
    };
  },
});
