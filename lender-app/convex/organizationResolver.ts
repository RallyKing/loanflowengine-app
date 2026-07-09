/**
 * Global admin (GodMode) organization resolution — list all tenants for workspace switching.
 */
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import {
  authUserHasGlobalAdminElevation,
  tryGetAuthUserByPermissionKey,
} from "./auth/globalAdmin";
import { normalizeAuthEmail } from "../lib/auth/normalizeAuthEmail";
import { normalizeUsername } from "../lib/auth/normalizeUsername";
import { bumpCredentialForUserKey } from "./auth/sessionInvalidate";
import { assertDataMigrationAdmin } from "./migrationAdminAuth";
import { pickCanonicalOrgMember } from "./orgMembership";
import {
  seedSystemRolesForOrganization,
  syncSystemRolePermissions,
} from "./organizationRbac";

export const listAllOrganizations = query({
  args: { memberUserKey: v.string() },
  handler: async (ctx, { memberUserKey }) => {
    const key =
      typeof memberUserKey === "string" ? memberUserKey.trim() : "";
    if (!key) return [];

    const actor = await tryGetAuthUserByPermissionKey(ctx, key);
    if (!actor) return [];
    if (!authUserHasGlobalAdminElevation(actor)) return [];

    const userKey = actor._id as string;
    const memberships = await ctx.db
      .query("organizationMembers")
      .withIndex("by_user_org", (q) => q.eq("userKey", userKey))
      .collect();
    if (memberships.length === 0) return [];

    let rows: Doc<"organizations">[];
    try {
      rows = await ctx.db.query("organizations").collect();
    } catch {
      return [];
    }

    rows.sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));

    const out: {
      _id: Id<"organizations">;
      name: string;
      updatedAt: number;
    }[] = [];

    for (const o of rows) {
      if (!o?._id) continue;
      const updatedAt = o.updatedAt;
      if (typeof updatedAt !== "number" || Number.isNaN(updatedAt)) continue;
      const rawName = o.name;
      const name =
        typeof rawName === "string" && rawName.trim().length > 0
          ? rawName.trim()
          : "Unnamed workspace";
      out.push({ _id: o._id, name, updatedAt });
    }

    return out;
  },
});

/**
 * Operator repair: ensure `authUsers` + primary org has an `organizationMembers` row (owner).
 * Gated by `DATA_MIGRATION_ADMIN_SECRET` / `ORG_INTEGRITY_ADMIN_SECRET`.
 */
export const repairPrimaryMembership = mutation({
  args: {
    adminSecret: v.string(),
    loginOrEmail: v.string(),
  },
  handler: async (ctx, { adminSecret, loginOrEmail }) => {
    assertDataMigrationAdmin(adminSecret);
    const raw = loginOrEmail.trim();
    if (!raw) {
      return { ok: false as const, reason: "empty_login" as const };
    }

    const asUsername = normalizeUsername(raw);
    const asEmail = normalizeAuthEmail(raw);
    const now = Date.now();

    const byUser = await ctx.db
      .query("authUsers")
      .withIndex("by_normalizedUsername", (q) =>
        q.eq("normalizedUsername", asUsername),
      )
      .collect();
    let byEmail: Doc<"authUsers">[] = [];
    if (asEmail) {
      byEmail = await ctx.db
        .query("authUsers")
        .withIndex("by_email", (q) => q.eq("email", asEmail))
        .collect();
    }

    const seen = new Set<string>();
    const candidates: Doc<"authUsers">[] = [];
    for (const r of [...byUser, ...byEmail]) {
      const id = r._id as string;
      if (seen.has(id)) continue;
      seen.add(id);
      candidates.push(r);
    }

    if (candidates.length === 0) {
      return {
        ok: false as const,
        reason: "user_not_found" as const,
        normalizedUsername: asUsername,
        normalizedEmail: asEmail ?? null,
      };
    }
    if (candidates.length > 1) {
      return {
        ok: false as const,
        reason: "ambiguous_user" as const,
        userIds: candidates.map((c) => c._id as string),
      };
    }

    const user = candidates[0]!;
    const convexKey = user._id as string;

    let orgId: Id<"organizations"> | undefined = user.defaultOrganizationId;
    if (orgId) {
      const orgDoc = await ctx.db.get(orgId);
      if (!orgDoc) orgId = undefined;
    }
    if (!orgId) {
      const orgs = await ctx.db.query("organizations").collect();
      orgs.sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
      orgId = orgs[0]?._id;
    }
    if (!orgId) {
      return { ok: false as const, reason: "no_organization" as const };
    }

    const { adminId } = await seedSystemRolesForOrganization(ctx, orgId);
    await syncSystemRolePermissions(ctx, orgId);

    const dupes = await ctx.db
      .query("organizationMembers")
      .withIndex("by_org_user", (q) =>
        q.eq("organizationId", orgId!).eq("userKey", convexKey),
      )
      .collect();
    const canon = pickCanonicalOrgMember(dupes);
    for (const m of dupes) {
      if (canon && m._id !== canon._id) await ctx.db.delete(m._id);
    }

    let membershipAction: "inserted" | "updated" | "unchanged" = "unchanged";

    if (!canon) {
      await ctx.db.insert("organizationMembers", {
        organizationId: orgId,
        userKey: convexKey,
        role: "owner",
        assignedRoleId: adminId,
        createdAt: now,
      });
      await bumpCredentialForUserKey(ctx, convexKey);
      membershipAction = "inserted";
    } else {
      const patch: {
        role: "owner";
        assignedRoleId: Id<"organizationRoles">;
        isActive?: true;
      } = { role: "owner", assignedRoleId: adminId };
      if (canon.isActive === false) patch.isActive = true;
      const needsPatch =
        canon.role !== "owner" ||
        canon.assignedRoleId !== adminId ||
        canon.isActive === false;
      if (needsPatch) {
        await ctx.db.patch(canon._id, patch);
        await bumpCredentialForUserKey(ctx, convexKey);
        membershipAction = "updated";
      }
    }

    if (!user.defaultOrganizationId || user.defaultOrganizationId !== orgId) {
      await ctx.db.patch(user._id, {
        defaultOrganizationId: orgId,
        updatedAt: now,
      });
    }

    await ctx.db.patch(orgId, { updatedAt: now });

    return {
      ok: true as const,
      userId: user._id,
      organizationId: orgId,
      membershipAction,
    };
  },
});
