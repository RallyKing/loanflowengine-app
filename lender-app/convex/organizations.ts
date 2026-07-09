import { mutation, query, type MutationCtx } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import {
  assertOrgPermission,
  assertAnyOrgPermission,
  resolveEffectivePermissionStrings,
  seedSystemRolesForOrganization,
  validateCustomPermissions,
  syncSystemRolePermissions,
} from "./organizationRbac";
import { SYSTEM_ORG_ROLE_KEYS } from "../lib/orgRbac";
import { assertOrgHasAvailableMemberSeat } from "./orgPlanLimits";
import { pickCanonicalOrgMember, pickCanonicalOrgRole } from "./orgMembership";
import {
  orgPermissionFail,
  orgPermissionTrace,
  safeUserKeyHint,
} from "./orgPermissionTelemetry";
import { assertOrgMember, resolveMemberUserKey } from "./organizationAccess";
import { resolveOrganizationContext } from "./organizationContext";
import { seedDefaultOrgPipelineStages } from "./organizationPipelineStagesHelpers";
import {
  InvalidOrganizationIdError,
  OrganizationNotFoundError,
} from "./organizationValidators";
import { orgIntegrityFail } from "./orgIntegrityTelemetry";
import { bumpCredentialForUserKey } from "./auth/sessionInvalidate";
import { tryGetAuthUserByPermissionKey } from "./auth/globalAdmin";
import { canonicalDisplayUsernameFromAuthUser } from "./auth/displayIdentity";

const tenantRoleV = v.union(
  v.literal("owner"),
  v.literal("admin"),
  v.literal("member"),
);

const MAX_BRANDING_LOGO_BYTES = 2 * 1024 * 1024;

const brandingUiPatchValidator = v.object({
  appName: v.optional(v.union(v.string(), v.null())),
  logoStorageId: v.optional(v.union(v.id("_storage"), v.null())),
  primaryColor: v.optional(v.union(v.string(), v.null())),
  secondaryColor: v.optional(v.union(v.string(), v.null())),
});

function normalizeHexOrThrow(raw: string): string {
  const s = raw.trim();
  if (!s) throw new Error("Color cannot be empty.");
  const m = /^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.exec(s);
  if (!m) throw new Error("Invalid color. Use #RGB or #RRGGBB.");
  let h = m[1];
  if (h.length === 3) {
    h = h
      .split("")
      .map((c) => c + c)
      .join("");
  }
  return `#${h.toLowerCase()}`;
}

async function assertBrandingLogoBlobOk(
  storage: MutationCtx["storage"],
  storageId: Id<"_storage">,
) {
  const meta = await storage.getMetadata(storageId);
  if (!meta) {
    throw new Error("Logo upload not found. Try uploading again.");
  }
  const size = meta.size ?? 0;
  if (size > MAX_BRANDING_LOGO_BYTES) {
    try {
      await storage.delete(storageId);
    } catch {
      /* best-effort */
    }
    throw new Error("Logo must be 2 MB or smaller.");
  }
  const ct = (meta.contentType || "").toLowerCase();
  if (ct && !ct.startsWith("image/")) {
    try {
      await storage.delete(storageId);
    } catch {
      /* best-effort */
    }
    throw new Error("Logo must be an image file.");
  }
}

/**
 * Create an organization and add the creator as owner (`userKey` = browser account id).
 * Seeds Admin / Manager / User roles and assigns the creator the Admin product role.
 */
export const createOrganization = mutation({
  args: {
    name: v.string(),
    slug: v.optional(v.string()),
    creatorUserKey: v.string(),
  },
  handler: async (ctx, { name, slug, creatorUserKey }) => {
    const trimmedName = name.trim();
    if (!trimmedName) throw new Error("Organization name is required");
    const key = await resolveMemberUserKey(ctx, creatorUserKey);

    let slugNorm: string | undefined;
    if (slug?.trim()) {
      slugNorm = slug.trim().slice(0, 80).toLowerCase().replace(/\s+/g, "-");
      const dup = await ctx.db
        .query("organizations")
        .withIndex("by_slug", (q) => q.eq("slug", slugNorm!))
        .first();
      if (dup) throw new Error("That organization slug is already in use.");
    }

    const now = Date.now();
    const orgId = await ctx.db.insert("organizations", {
      name: trimmedName,
      slug: slugNorm,
      plan: "basic",
      createdAt: now,
      updatedAt: now,
    });
    const { adminId } = await seedSystemRolesForOrganization(ctx, orgId);
    await syncSystemRolePermissions(ctx, orgId);
    await seedDefaultOrgPipelineStages(ctx, orgId, key);
    await ctx.db.insert("organizationMembers", {
      organizationId: orgId,
      userKey: key,
      role: "owner",
      assignedRoleId: adminId,
      createdAt: now,
    });
    return { organizationId: orgId };
  },
});

/** Idempotent seed; any org member may call (safe, no privilege escalation). */
export const ensureSystemRoles = mutation({
  args: {
    organizationId: v.id("organizations"),
    actorUserKey: v.string(),
  },
  handler: async (ctx, { organizationId, actorUserKey }) => {
    const perms = await resolveEffectivePermissionStrings(
      ctx,
      organizationId,
      actorUserKey,
    );
    if (!perms) throw new Error("You are not a member of this organization.");
    await seedSystemRolesForOrganization(ctx, organizationId);
    await syncSystemRolePermissions(ctx, organizationId);
    return { ok: true as const };
  },
});

export const addMember = mutation({
  args: {
    organizationId: v.id("organizations"),
    userKey: v.string(),
    role: tenantRoleV,
    actorUserKey: v.string(),
    assignedRoleId: v.optional(v.id("organizationRoles")),
  },
  handler: async (ctx, args) => {
    const actor = args.actorUserKey.trim();
    const newKey = args.userKey.trim();
    if (!actor || !newKey) throw new Error("user keys are required");

    await assertOrgPermission(
      ctx,
      args.organizationId,
      actor,
      "org.members.invite",
    );

    const actorRows = await ctx.db
      .query("organizationMembers")
      .withIndex("by_org_user", (q) =>
        q.eq("organizationId", args.organizationId).eq("userKey", actor),
      )
      .collect();
    const actorRow = pickCanonicalOrgMember(actorRows);
    if (!actorRow) throw new Error("Actor membership not found.");

    if (args.role === "owner" && actorRow.role !== "owner") {
      throw new Error("Only an owner can assign the owner role.");
    }

    const { adminId, managerId, userId } = await seedSystemRolesForOrganization(
      ctx,
      args.organizationId,
    );

    let assigned = args.assignedRoleId;
    if (assigned) {
      const roleDoc = await ctx.db.get(assigned);
      if (!roleDoc || roleDoc.organizationId !== args.organizationId) {
        throw new Error("Invalid role for this organization.");
      }
    } else if (args.role === "owner") {
      assigned = adminId;
    } else if (args.role === "admin") {
      assigned = managerId;
    } else {
      assigned = userId;
    }

    const existingRows = await ctx.db
      .query("organizationMembers")
      .withIndex("by_org_user", (q) =>
        q.eq("organizationId", args.organizationId).eq("userKey", newKey),
      )
      .collect();
    const existing = pickCanonicalOrgMember(existingRows);
    if (existing) {
      for (const row of existingRows) {
        if (row._id !== existing._id) await ctx.db.delete(row._id);
      }
      if (existing.role === "owner" && args.role !== "owner") {
        const ownerCount = (
          await ctx.db
            .query("organizationMembers")
            .withIndex("by_organization", (q) =>
              q.eq("organizationId", args.organizationId),
            )
            .collect()
        ).filter((m) => m.role === "owner").length;
        if (ownerCount <= 1) {
          throw new Error("Cannot remove the last owner.");
        }
      }
      const patch: {
        role: typeof args.role;
        assignedRoleId: Id<"organizationRoles">;
      } = { role: args.role, assignedRoleId: assigned! };
      if (existing.role !== args.role || existing.assignedRoleId !== assigned) {
        await ctx.db.patch(existing._id, patch);
        await bumpCredentialForUserKey(ctx, newKey);
      }
      return { membershipId: existing._id };
    }

    const now = Date.now();
    await assertOrgHasAvailableMemberSeat(ctx, args.organizationId);
    const id = await ctx.db.insert("organizationMembers", {
      organizationId: args.organizationId,
      userKey: newKey,
      role: args.role,
      assignedRoleId: assigned,
      createdAt: now,
    });
    await ctx.db.patch(args.organizationId, { updatedAt: now });
    return { membershipId: id };
  },
});

/** Rename the active workspace organization (requires invite / admin permissions). */
export const renameOrganization = mutation({
  args: {
    organizationId: v.id("organizations"),
    name: v.string(),
    actorUserKey: v.string(),
  },
  handler: async (ctx, { organizationId, name, actorUserKey }) => {
    await assertOrgPermission(
      ctx,
      organizationId,
      actorUserKey,
      "org.members.invite",
    );
    const org = await ctx.db.get(organizationId);
    if (!org) throw new Error("Organization not found.");
    const trimmed = name.trim();
    if (!trimmed) throw new Error("Name is required.");
    await ctx.db.patch(organizationId, {
      name: trimmed,
      updatedAt: Date.now(),
    });
    return { ok: true as const };
  },
});

/**
 * White-label logo upload (caller POSTs bytes to the returned URL, then passes
 * `storageId` to `updateOrganizationBranding`).
 */
export const generateBrandingLogoUploadUrl = mutation({
  args: {
    organizationId: v.id("organizations"),
    actorUserKey: v.string(),
  },
  handler: async (ctx, { organizationId, actorUserKey }) => {
    await assertOrgPermission(
      ctx,
      organizationId,
      actorUserKey,
      "settings.access",
    );
    const org = await ctx.db.get(organizationId);
    if (!org) throw new Error("Organization not found.");
    return await ctx.storage.generateUploadUrl();
  },
});

export const updateOrganizationBranding = mutation({
  args: {
    organizationId: v.id("organizations"),
    actorUserKey: v.string(),
    patch: brandingUiPatchValidator,
  },
  handler: async (ctx, { organizationId, actorUserKey, patch }) => {
    await assertOrgPermission(
      ctx,
      organizationId,
      actorUserKey,
      "settings.access",
    );
    const org = await ctx.db.get(organizationId);
    if (!org) throw new Error("Organization not found.");

    const prev = org.branding;
    const next: NonNullable<typeof prev> = { ...(prev ?? {}) };
    const now = Date.now();

    if (patch.appName !== undefined) {
      if (patch.appName === null) {
        delete next.appName;
      } else {
        const t = patch.appName.trim().slice(0, 120);
        if (t) next.appName = t;
        else delete next.appName;
      }
    }

    if (patch.primaryColor !== undefined) {
      if (patch.primaryColor === null) {
        delete next.primaryColor;
      } else {
        next.primaryColor = normalizeHexOrThrow(patch.primaryColor);
      }
    }

    if (patch.secondaryColor !== undefined) {
      if (patch.secondaryColor === null) {
        delete next.secondaryColor;
      } else {
        next.secondaryColor = normalizeHexOrThrow(patch.secondaryColor);
      }
    }

    if (patch.logoStorageId !== undefined) {
      if (patch.logoStorageId === null) {
        const old = next.logoStorageId;
        if (old) {
          try {
            await ctx.storage.delete(old);
          } catch {
            /* best-effort */
          }
        }
        delete next.logoStorageId;
      } else {
        await assertBrandingLogoBlobOk(ctx.storage, patch.logoStorageId);
        const old = prev?.logoStorageId;
        if (old && old !== patch.logoStorageId) {
          try {
            await ctx.storage.delete(old);
          } catch {
            /* best-effort */
          }
        }
        next.logoStorageId = patch.logoStorageId;
      }
    }

    const hasAny = Boolean(
      next.appName ||
        next.logoStorageId ||
        next.primaryColor ||
        next.secondaryColor,
    );

    if (!hasAny) {
      await ctx.db.patch(organizationId, {
        branding: undefined,
        updatedAt: now,
      });
      return { ok: true as const };
    }

    next.updatedAt = now;
    await ctx.db.patch(organizationId, {
      branding: next,
      updatedAt: now,
    });
    return { ok: true as const };
  },
});

export const removeMember = mutation({
  args: {
    organizationId: v.id("organizations"),
    userKey: v.string(),
    actorUserKey: v.string(),
  },
  handler: async (ctx, args) => {
    const actor = args.actorUserKey.trim();
    const target = args.userKey.trim();
    if (!actor || !target) throw new Error("user keys are required");

    await assertOrgPermission(
      ctx,
      args.organizationId,
      actor,
      "org.members.invite",
    );

    const actorRows = await ctx.db
      .query("organizationMembers")
      .withIndex("by_org_user", (q) =>
        q.eq("organizationId", args.organizationId).eq("userKey", actor),
      )
      .collect();
    const actorRow = pickCanonicalOrgMember(actorRows);
    if (!actorRow) throw new Error("Actor membership not found.");

    const victimRows = await ctx.db
      .query("organizationMembers")
      .withIndex("by_org_user", (q) =>
        q.eq("organizationId", args.organizationId).eq("userKey", target),
      )
      .collect();
    const victim = pickCanonicalOrgMember(victimRows);
    if (!victim) return { ok: true as const };
    if (victim.role === "owner" && actorRow.role !== "owner") {
      throw new Error("Only an owner can remove another owner.");
    }

    const ownerCount = (
      await ctx.db
        .query("organizationMembers")
        .withIndex("by_organization", (q) =>
          q.eq("organizationId", args.organizationId),
        )
        .collect()
    ).filter((m) => m.role === "owner").length;
    if (victim.role === "owner" && ownerCount <= 1) {
      throw new Error("Cannot remove the last owner. Transfer ownership first.");
    }

    for (const row of victimRows) {
      await ctx.db.delete(row._id);
    }
    await ctx.db.patch(args.organizationId, { updatedAt: Date.now() });
    await bumpCredentialForUserKey(ctx, target);
    return { ok: true as const };
  },
});

/**
 * Assign the member's product RBAC role (Admin / Manager / User preset or custom).
 * Requires org.roles.manage.
 */
export const setMemberProductRole = mutation({
  args: {
    organizationId: v.id("organizations"),
    userKey: v.string(),
    assignedRoleId: v.id("organizationRoles"),
    actorUserKey: v.string(),
  },
  handler: async (ctx, args) => {
    await assertOrgPermission(
      ctx,
      args.organizationId,
      args.actorUserKey,
      "org.roles.manage",
    );
    const roleDoc = await ctx.db.get(args.assignedRoleId);
    if (!roleDoc || roleDoc.organizationId !== args.organizationId) {
      throw new Error("Invalid role for this organization.");
    }
    const memberRows = await ctx.db
      .query("organizationMembers")
      .withIndex("by_org_user", (q) =>
        q.eq("organizationId", args.organizationId).eq("userKey", args.userKey.trim()),
      )
      .collect();
    const member = pickCanonicalOrgMember(memberRows);
    if (!member) throw new Error("Member not found.");
    for (const row of memberRows) {
      if (row._id !== member._id) await ctx.db.delete(row._id);
    }
    await ctx.db.patch(member._id, { assignedRoleId: args.assignedRoleId });
    await ctx.db.patch(args.organizationId, { updatedAt: Date.now() });
    await bumpCredentialForUserKey(ctx, args.userKey.trim());
    return { ok: true as const };
  },
});

export const createCustomRole = mutation({
  args: {
    organizationId: v.id("organizations"),
    key: v.string(),
    label: v.string(),
    description: v.optional(v.string()),
    permissions: v.array(v.string()),
    actorUserKey: v.string(),
  },
  handler: async (ctx, args) => {
    await assertOrgPermission(
      ctx,
      args.organizationId,
      args.actorUserKey,
      "org.roles.manage",
    );
    const key = args.key
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "-")
      .slice(0, 64);
    if (!key) throw new Error("Role key is required.");
    const reserved = new Set<string>(Object.values(SYSTEM_ORG_ROLE_KEYS));
    if (reserved.has(key)) {
      throw new Error("That key is reserved for a built-in role.");
    }
    const perms = validateCustomPermissions(args.permissions);
    const dupRows = await ctx.db
      .query("organizationRoles")
      .withIndex("by_organization_key", (q) =>
        q.eq("organizationId", args.organizationId).eq("key", key),
      )
      .collect();
    if (dupRows.length > 0) throw new Error("A role with this key already exists.");
    const now = Date.now();
    return await ctx.db.insert("organizationRoles", {
      organizationId: args.organizationId,
      key,
      label: args.label.trim() || key,
      description: args.description?.trim() || undefined,
      permissions: perms,
      isSystem: false,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const updateCustomRole = mutation({
  args: {
    roleId: v.id("organizationRoles"),
    label: v.optional(v.string()),
    description: v.optional(v.string()),
    permissions: v.optional(v.array(v.string())),
    actorUserKey: v.string(),
  },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.roleId);
    if (!row) throw new Error("Role not found.");
    await assertOrgPermission(
      ctx,
      row.organizationId,
      args.actorUserKey,
      "org.roles.manage",
    );
    if (row.isSystem) {
      throw new Error("Built-in roles cannot be edited here.");
    }
    const now = Date.now();
    const patch: Record<string, unknown> = { updatedAt: now };
    if (args.label !== undefined) patch.label = args.label.trim() || row.label;
    if (args.description !== undefined) {
      patch.description = args.description.trim() || undefined;
    }
    if (args.permissions !== undefined) {
      patch.permissions = validateCustomPermissions(args.permissions);
    }
    await ctx.db.patch(args.roleId, patch);
    return { ok: true as const };
  },
});

export const deleteCustomRole = mutation({
  args: {
    roleId: v.id("organizationRoles"),
    actorUserKey: v.string(),
  },
  handler: async (ctx, { roleId, actorUserKey }) => {
    const row = await ctx.db.get(roleId);
    if (!row) return { ok: true as const };
    await assertOrgPermission(
      ctx,
      row.organizationId,
      actorUserKey,
      "org.roles.manage",
    );
    if (row.isSystem) {
      throw new Error("Built-in roles cannot be deleted.");
    }
    const members = await ctx.db
      .query("organizationMembers")
      .withIndex("by_organization", (q) => q.eq("organizationId", row.organizationId))
      .collect();
    for (const m of members) {
      if (m.assignedRoleId === roleId) {
        const userFallbackRows = await ctx.db
          .query("organizationRoles")
          .withIndex("by_organization_key", (q) =>
            q.eq("organizationId", row.organizationId).eq("key", SYSTEM_ORG_ROLE_KEYS.user),
          )
          .collect();
        const userFallback = pickCanonicalOrgRole(userFallbackRows);
        if (userFallback) {
          await ctx.db.patch(m._id, { assignedRoleId: userFallback._id });
        } else {
          await ctx.db.patch(m._id, { assignedRoleId: undefined });
        }
      }
    }
    await ctx.db.delete(roleId);
    await ctx.db.patch(row.organizationId, { updatedAt: Date.now() });
    return { ok: true as const };
  },
});

export const listRoles = query({
  args: {
    organizationId: v.id("organizations"),
    memberUserKey: v.optional(v.string()),
  },
  handler: async (ctx, { organizationId, memberUserKey }) => {
    await assertAnyOrgPermission(ctx, organizationId, memberUserKey, [
      "org.members.invite",
      "org.roles.manage",
    ]);
    return await ctx.db
      .query("organizationRoles")
      .withIndex("by_organization", (q) => q.eq("organizationId", organizationId))
      .collect();
  },
});

/** Any member can read effective permissions for UI gating. */
export const effectivePermissions = query({
  args: {
    organizationId: v.id("organizations"),
    userKey: v.string(),
    /** Browser-issued span; echoed in ORG_PERM_TRACE for cross-layer correlation. */
    clientTraceId: v.optional(v.string()),
  },
  handler: async (ctx, { organizationId, userKey, clientTraceId }) => {
    try {
      orgPermissionTrace("effectivePermissions.entry", {
        organizationId: String(organizationId),
        argUserKey: safeUserKeyHint(userKey),
        clientTraceId: clientTraceId?.trim() || null,
      });

      const key = await resolveMemberUserKey(ctx, userKey);
      orgPermissionTrace("effectivePermissions.resolvedKey", {
        organizationId: String(organizationId),
        resolvedKey: safeUserKeyHint(key),
      });

      const permissions = await resolveEffectivePermissionStrings(
        ctx,
        organizationId,
        key,
      );
      if (!permissions) {
        orgPermissionTrace("effectivePermissions.noPermissionSet", {
          organizationId: String(organizationId),
          resolvedKey: safeUserKeyHint(key),
        });
        return null;
      }

      const membershipRows = await ctx.db
        .query("organizationMembers")
        .withIndex("by_org_user", (q) =>
          q.eq("organizationId", organizationId).eq("userKey", key),
        )
        .collect();
      const membership = pickCanonicalOrgMember(membershipRows);

      let roleLabel = "";
      let roleKey = "";
      if (membership?.assignedRoleId) {
        const rd = await ctx.db.get(membership.assignedRoleId);
        if (rd) {
          roleLabel = rd.label;
          roleKey = rd.key;
        }
      }

      orgPermissionTrace("effectivePermissions.success", {
        organizationId: String(organizationId),
        membershipRowCount: membershipRows.length,
        tenantRole: membership?.role ?? null,
      });

      return {
        permissions,
        tenantRole: membership?.role,
        productRoleKey: roleKey,
        productRoleLabel: roleLabel,
      };
    } catch (err) {
      try {
        orgPermissionFail(
          "organizations.effectivePermissions",
          {
            organizationId: String(organizationId),
            argUserKey: safeUserKeyHint(userKey),
          },
          err,
        );
      } catch {
        /* never block returning null if telemetry throws */
      }
      /** Fail closed for UI: avoids Convex client `useQuery` throwing on execution errors. */
      return null;
    }
  },
});

export const get = query({
  args: {
    organizationId: v.id("organizations"),
    memberUserKey: v.optional(v.string()),
  },
  handler: async (ctx, { organizationId, memberUserKey }) => {
    const org = await ctx.db.get(organizationId);
    if (!org) return null;
    const key = await resolveMemberUserKey(ctx, memberUserKey);
    await assertOrgMember(ctx, organizationId, key);
    return org;
  },
});

/**
 * Lightweight white-label payload for active org members (header + CSS variables).
 */
export const brandingForMember = query({
  args: {
    organizationId: v.id("organizations"),
    memberUserKey: v.optional(v.string()),
  },
  handler: async (ctx, { organizationId, memberUserKey }) => {
    try {
      const key = await resolveMemberUserKey(ctx, memberUserKey);
      const perms = await resolveEffectivePermissionStrings(
        ctx,
        organizationId,
        key,
      );
      if (!perms) return null;
      const org = await ctx.db.get(organizationId);
      if (!org) return null;
      const b = org.branding;
      let logoUrl: string | null = null;
      if (b?.logoStorageId) {
        try {
          logoUrl = await ctx.storage.getUrl(b.logoStorageId);
        } catch (logoErr) {
          orgPermissionFail(
            "organizations.brandingForMember.logoUrl",
            { organizationId: String(organizationId) },
            logoErr,
          );
        }
      }
      const headerTitle = (b?.appName?.trim() || org.name).slice(0, 120);
      return {
        headerTitle,
        logoUrl,
        primaryHex: b?.primaryColor ?? null,
        secondaryHex: b?.secondaryColor ?? null,
      };
    } catch (err) {
      orgPermissionFail(
        "organizations.brandingForMember",
        { organizationId: String(organizationId) },
        err,
      );
      return null;
    }
  },
});

export type MembershipRow = {
  organizationId: Id<"organizations">;
  role: "owner" | "admin" | "member";
  organizationName: string;
  organizationSlug?: string;
  productRoleKey?: string;
  productRoleLabel?: string;
};

export const listMyMemberships = query({
  args: { userKey: v.string() },
  handler: async (ctx, { userKey }) => {
    const key = userKey.trim();
    if (!key) return [] as MembershipRow[];

    const links = await ctx.db
      .query("organizationMembers")
      .withIndex("by_user_org", (q) => q.eq("userKey", key))
      .collect();

    const out: MembershipRow[] = [];
    for (const m of links) {
      const org = await ctx.db.get(m.organizationId);
      if (!org) continue;
      let productRoleKey: string | undefined;
      let productRoleLabel: string | undefined;
      if (m.assignedRoleId) {
        const rd = await ctx.db.get(m.assignedRoleId);
        if (rd) {
          productRoleKey = rd.key;
          productRoleLabel = rd.label;
        }
      }
      out.push({
        organizationId: m.organizationId,
        role: m.role,
        organizationName: org.name,
        organizationSlug: org.slug,
        productRoleKey,
        productRoleLabel,
      });
    }
    return out;
  },
});

/** Members of an org (for sharing pickers). Requires org membership. */
export const listMembers = query({
  args: {
    organizationId: v.id("organizations"),
    memberUserKey: v.optional(v.string()),
    /** When false (default), deactivated members are hidden (e.g. sharing pickers). */
    includeInactive: v.optional(v.boolean()),
  },
  handler: async (ctx, { organizationId, memberUserKey, includeInactive }) => {
    const key = await resolveMemberUserKey(ctx, memberUserKey);
    const perms = await resolveEffectivePermissionStrings(
      ctx,
      organizationId,
      key,
    );
    if (!perms) {
      throw new Error("You are not a member of this organization.");
    }

    const members = await ctx.db
      .query("organizationMembers")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", organizationId),
      )
      .collect();

    const out: Array<{
      userKey: string;
      tenantRole: "owner" | "admin" | "member";
      productRoleLabel?: string;
      assignedRoleId?: Id<"organizationRoles">;
      isActive: boolean;
      displayUsername?: string;
      canonicalDisplayUsername?: string;
    }> = [];

    for (const m of members) {
      if (includeInactive !== true && m.isActive === false) continue;
      let productRoleLabel: string | undefined;
      if (m.assignedRoleId) {
        const rd = await ctx.db.get(m.assignedRoleId);
        productRoleLabel = rd?.label;
      }
      const auth = await tryGetAuthUserByPermissionKey(ctx, m.userKey);
      out.push({
        userKey: m.userKey,
        tenantRole: m.role,
        productRoleLabel,
        assignedRoleId: m.assignedRoleId,
        isActive: m.isActive !== false,
        displayUsername: auth?.displayUsername,
        canonicalDisplayUsername: auth
          ? canonicalDisplayUsernameFromAuthUser(auth)
          : undefined,
      });
    }
    return out;
  },
});

/**
 * Minimal no-arg query for `/convex-debug`: raw `useQuery(api.organizations.list, {})`
 * to verify deployed Convex matches generated `api` (no app wrappers).
 */
export const list = query({
  args: {},
  handler: async (ctx) => {
    await ctx.db.query("organizations").take(1);
    return { ok: true as const };
  },
});

/** Lightweight scope check for clients: org exists and caller is a member. */
export const validateActiveScope = query({
  args: {
    organizationId: v.id("organizations"),
    memberUserKey: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    try {
      await resolveOrganizationContext(
        ctx,
        args.organizationId,
        args.memberUserKey,
      );
      return { ok: true as const };
    } catch (e) {
      orgIntegrityFail("validateActiveScope", {
        organizationId: String(args.organizationId),
      }, e);
      const code =
        e instanceof OrganizationNotFoundError
          ? ("ORG_NOT_FOUND" as const)
          : e instanceof InvalidOrganizationIdError
            ? ("ORG_ID_MALFORMED" as const)
            : ("SCOPE_ERROR" as const);
      return {
        ok: false as const,
        code,
        reason: e instanceof Error ? e.message : String(e),
      };
    }
  },
});
