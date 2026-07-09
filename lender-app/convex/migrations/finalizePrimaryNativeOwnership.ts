/**
 * Single-tenant finish line: mark primary owner, strip legacy Clerk org ids from
 * `organizations`, and ensure the canonical user is `owner` on every org (deduped).
 *
 * Run after `mergeAuthUsersByEmail` / `ensurePrimaryPlatformAdmin`.
 */
import { v } from "convex/values";
import type { Id } from "../_generated/dataModel";
import { mutation } from "../_generated/server";
import { assertDataMigrationAdmin } from "../migrationAdminAuth";
import { normalizeAuthEmail } from "../../lib/auth/normalizeAuthEmail";
import { normalizeUsername } from "../../lib/auth/normalizeUsername";
import { pickCanonicalOrgMember } from "../orgMembership";
import { seedSystemRolesForOrganization } from "../organizationRbac";
import { SYSTEM_ORG_ROLE_KEYS } from "../../lib/orgRbac";

export const finalizePrimaryNativeOwnership = mutation({
  args: {
    adminSecret: v.string(),
    email: v.string(),
    matchUsernameAsEmail: v.optional(v.boolean()),
    dryRun: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    assertDataMigrationAdmin(args.adminSecret);
    const dry = args.dryRun === true;
    const now = Date.now();
    const normEmail = normalizeAuthEmail(args.email);
    if (!normEmail) {
      throw new Error("finalizePrimaryNativeOwnership: email required.");
    }
    const matchUsername = args.matchUsernameAsEmail !== false;

    const allAuth = await ctx.db.query("authUsers").collect();
    const matches = allAuth.filter((u) => {
      const emailHit = normalizeAuthEmail(u.email) === normEmail;
      const userHit =
        matchUsername && normalizeUsername(u.normalizedUsername) === normEmail;
      return emailHit || userHit;
    });
    if (matches.length === 0) {
      return {
        ok: false as const,
        reason: "no_matching_auth_users" as const,
        targetEmail: normEmail,
      };
    }
    let canonical = matches[0]!;
    for (let i = 1; i < matches.length; i++) {
      const c = matches[i]!;
      if (c.createdAt > canonical.createdAt) canonical = c;
    }
    const userKey = canonical._id as string;

    let primaryOwnerPatched = 0;
    let clerkOrgFieldsCleared = 0;
    let ownerMembershipsCreated = 0;
    let ownerMembershipsUpgraded = 0;
    let orgMemberDupesRemoved = 0;

    if (!dry) {
      await ctx.db.patch(canonical._id, {
        primaryOwner: true,
        isGlobalAdmin: true,
        systemRole: "SUPER_ADMIN",
        updatedAt: now,
      });
    }
    primaryOwnerPatched = 1;

    for (const org of await ctx.db.query("organizations").collect()) {
      if (org.clerkOrganizationId !== undefined) {
        clerkOrgFieldsCleared++;
        if (!dry) {
          await ctx.db.patch(org._id, {
            clerkOrganizationId: undefined,
            updatedAt: now,
          });
        }
      }

      let adminId: Id<"organizationRoles">;
      if (!dry) {
        const seeded = await seedSystemRolesForOrganization(ctx, org._id);
        adminId = seeded.adminId;
      } else {
        const existing = await ctx.db
          .query("organizationRoles")
          .withIndex("by_organization_key", (q) =>
            q
              .eq("organizationId", org._id)
              .eq("key", SYSTEM_ORG_ROLE_KEYS.admin),
          )
          .first();
        if (!existing) continue;
        adminId = existing._id;
      }

      const mems = await ctx.db
        .query("organizationMembers")
        .withIndex("by_org_user", (q) =>
          q.eq("organizationId", org._id).eq("userKey", userKey),
        )
        .collect();
      const best = pickCanonicalOrgMember(mems);
      if (mems.length > 1) {
        for (const m of mems) {
          if (best && m._id !== best._id) {
            orgMemberDupesRemoved++;
            if (!dry) await ctx.db.delete(m._id);
          }
        }
      }
      if (!best) {
        ownerMembershipsCreated++;
        if (!dry) {
          await ctx.db.insert("organizationMembers", {
            organizationId: org._id,
            userKey,
            role: "owner",
            assignedRoleId: adminId,
            createdAt: now,
          });
        }
      } else if (best.role !== "owner" || best.assignedRoleId !== adminId) {
        ownerMembershipsUpgraded++;
        if (!dry) {
          await ctx.db.patch(best._id, {
            role: "owner",
            assignedRoleId: adminId,
          });
        }
      }
    }

    return {
      ok: true as const,
      dryRun: dry,
      targetEmail: normEmail,
      canonicalAuthUserId: canonical._id as Id<"authUsers">,
      primaryOwnerPatched,
      clerkOrgFieldsCleared,
      ownerMembershipsCreated,
      ownerMembershipsUpgraded,
      orgMemberDupesRemoved,
    };
  },
});
