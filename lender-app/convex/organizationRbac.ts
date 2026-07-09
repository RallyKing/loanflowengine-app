/**
 * Server-side RBAC resolution and enforcement for organizations.
 */
import type { Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import {
  ALL_ORG_PERMISSIONS,
  type OrgPermission,
  hasOrgPermission,
  isOrgPermission,
  sanitizePermissionList,
  SYSTEM_ORG_ROLE_KEYS,
} from "../lib/orgRbac";
import { pickCanonicalOrgMember, pickCanonicalOrgRole } from "./orgMembership";
import {
  orgPermissionFail,
  orgPermissionTrace,
  safeUserKeyHint,
} from "./orgPermissionTelemetry";
import { platformUserKeyFallback } from "./viewerIdentity";
import {
  authUserHasGlobalAdminElevation,
  tryGetAuthUserByPermissionKey,
} from "./auth/globalAdmin";
import {
  getActiveImpersonationForInitiatorKey,
  isMutationCtx,
  resolveTenantAdminPermissionStrings,
} from "./superuserImpersonation/runtime";
import { appendSuperuserImpersonationAudit } from "./superuserImpersonation/auditLog";

/**
 * Single-user deployment fallback userKey resolution MUST stay aligned with
 * `convex/organizationAccess.ts#resolveMemberUserKey` and
 * `convex/viewerIdentity.ts` (`APP_AUTH_USER_KEY`) plus `lib/sessionAuth.ts`.
 *
 * The Next.js cookie gate authenticates the caller before any Convex traffic
 * reaches us; this fallback covers org-scoped queries that forget to thread
 * `memberUserKey` from the client (e.g. notification + RBAC paths that
 * predated the cookie-only auth model).
 */
const EVERYTHING: OrgPermission[] = [...ALL_ORG_PERMISSIONS];

/** Legacy org `admin` gets full product access except defining custom roles. */
const LEGACY_ADMIN_PERMISSIONS: OrgPermission[] = EVERYTHING.filter(
  (p) => p !== "org.roles.manage",
);

const MANAGER_PERMISSIONS: OrgPermission[] = sanitizePermissionList([
  "files.view",
  "files.edit",
  "files.view_all",
  "files.edit_all",
  "files.delete",
  "blocks.manage",
  "contacts.view",
  "contacts.manage",
  "settings.access",
  "settings.view",
  "settings.manage",
  "email.send",
  "org.members.invite",
  "tasks.manage",
  "lenders.manage",
  "ledger.manage",
  "communications.manage",
  "operations.manage",
  "reporting.manage",
  "portals.manage",
  "documents.upload",
  "documents.delete",
  "comments.manage",
  "assignment.manage",
  "export.data",
  "financial.view",
  "revenue.view",
  "commission.view",
  "audit.view",
]);

const USER_PERMISSIONS: OrgPermission[] = sanitizePermissionList([
  "files.view",
  "contacts.view",
  "settings.access",
  "settings.view",
  "tasks.view",
  "reporting.view",
]);

const PROCESSOR_PERMISSIONS: OrgPermission[] = sanitizePermissionList([
  "files.view",
  "files.edit",
  "contacts.view",
  "tasks.edit",
  "tasks.manage",
  "lenders.view",
  "ledger.view",
  "communications.view",
  "documents.upload",
  "assignment.manage",
  "settings.access",
  "settings.view",
]);

const SALES_PERMISSIONS: OrgPermission[] = sanitizePermissionList([
  "files.view",
  "contacts.view",
  "contacts.manage",
  "communications.edit",
  "lenders.view",
  "reporting.view",
  "export.data",
  "settings.access",
  "settings.view",
]);

const VIEWER_PERMISSIONS: OrgPermission[] = sanitizePermissionList([
  "files.view",
  "contacts.view",
  "reporting.view",
  "comments.view",
  "settings.access",
  "settings.view",
]);

const EXTERNAL_PARTNER_PERMISSIONS: OrgPermission[] = sanitizePermissionList([
  "files.view",
  "portals.view",
  "comments.view",
]);

async function applyOrgPermissionDenies(
  ctx: QueryCtx | MutationCtx,
  tenantId: Id<"organizations">,
  permissions: string[],
): Promise<string[]> {
  const rows = await ctx.db
    .query("organizationPermissions")
    .withIndex("by_organization", (q) => q.eq("organizationId", tenantId))
    .collect();
  const deny = new Set(
    rows.filter((r) => r.denied).map((r) => r.permissionKey),
  );
  if (deny.size === 0) return permissions;
  return permissions.filter((p) => !deny.has(p));
}

export async function resolveEffectivePermissionStrings(
  ctx: QueryCtx | MutationCtx,
  organizationId: Id<"organizations">,
  userKey: string,
): Promise<string[] | null> {
  const key = userKey.trim();
  if (!key) return null;

  const activeImp = await getActiveImpersonationForInitiatorKey(ctx, key);
  if (activeImp) {
    if (String(organizationId) !== String(activeImp.targetOrganizationId)) {
      orgPermissionTrace("resolveEffective.impersonationWrongOrg", {
        organizationId: String(organizationId),
        userKey: safeUserKeyHint(key),
      });
      return null;
    }
    orgPermissionTrace("resolveEffective.impersonationTenantView", {
      organizationId: String(organizationId),
      userKey: safeUserKeyHint(key),
      mode: activeImp.mode,
    });
    return resolveTenantAdminPermissionStrings(ctx, organizationId);
  }

  const authUserBypass = await tryGetAuthUserByPermissionKey(ctx, key);
  if (authUserHasGlobalAdminElevation(authUserBypass)) {
    orgPermissionTrace("resolveEffective.globalAdminBypass", {
      organizationId: String(organizationId),
      userKey: safeUserKeyHint(key),
    });
    return [...EVERYTHING];
  }

  try {
    orgPermissionTrace("resolveEffective.start", {
      organizationId: String(organizationId),
      userKey: safeUserKeyHint(key),
    });

    const membershipRows = await ctx.db
      .query("organizationMembers")
      .withIndex("by_org_user", (q) =>
        q.eq("organizationId", organizationId).eq("userKey", key),
      )
      .collect();
    const membership = pickCanonicalOrgMember(membershipRows);

    orgPermissionTrace("resolveEffective.afterMembership", {
      organizationId: String(organizationId),
      membershipRowCount: membershipRows.length,
      canonicalMembershipId: membership?._id ?? null,
      tenantRole: membership?.role ?? null,
      hasAssignedRoleId: Boolean(membership?.assignedRoleId),
    });

    if (!membership) return null;

    if (membership.isActive === false) {
      orgPermissionTrace("resolveEffective.inactiveMember", {
        organizationId: String(organizationId),
        userKey: safeUserKeyHint(key),
      });
      return null;
    }

    if (membership.role === "owner") {
      return await applyOrgPermissionDenies(ctx, organizationId, [...EVERYTHING]);
    }
    if (membership.role === "admin") {
      return await applyOrgPermissionDenies(
        ctx,
        organizationId,
        [...LEGACY_ADMIN_PERMISSIONS],
      );
    }

    let roleId = membership.assignedRoleId;
    if (!roleId) {
      const fallbackRows = await ctx.db
        .query("organizationRoles")
        .withIndex("by_organization_key", (q) =>
          q.eq("organizationId", organizationId).eq("key", SYSTEM_ORG_ROLE_KEYS.user),
        )
        .collect();
      const fallback = pickCanonicalOrgRole(fallbackRows);
      orgPermissionTrace("resolveEffective.fallbackUserRole", {
        organizationId: String(organizationId),
        fallbackRoleRowCount: fallbackRows.length,
        pickedRoleId: fallback?._id ?? null,
      });
      if (!fallback) {
        return await applyOrgPermissionDenies(ctx, organizationId, [
          ...USER_PERMISSIONS,
        ]);
      }
      roleId = fallback._id;
    }

    const roleDoc = await ctx.db.get(roleId);
    if (!roleDoc || roleDoc.organizationId !== organizationId) {
      orgPermissionTrace("resolveEffective.roleDocMissingOrForeign", {
        organizationId: String(organizationId),
        roleId: String(roleId),
        roleDocFound: Boolean(roleDoc),
        roleDocOrg: roleDoc ? String(roleDoc.organizationId) : null,
      });
      return await applyOrgPermissionDenies(ctx, organizationId, [
        ...USER_PERMISSIONS,
      ]);
    }
    return await applyOrgPermissionDenies(
      ctx,
      organizationId,
      sanitizePermissionList(roleDoc.permissions),
    );
  } catch (err) {
    orgPermissionFail(
      "resolveEffectivePermissionStrings",
      {
        organizationId: String(organizationId),
        userKey: safeUserKeyHint(key),
      },
      err,
    );
    throw err;
  }
}

export async function assertOrgPermission(
  ctx: QueryCtx | MutationCtx,
  organizationId: Id<"organizations">,
  userKey: string | undefined,
  permission: OrgPermission,
): Promise<void> {
  let key = userKey?.trim() ?? "";
  if (!key) {
    const identity = await ctx.auth.getUserIdentity();
    key = identity?.subject?.trim() ?? "";
  }
  if (!key) key = platformUserKeyFallback();

  const activeImp = await getActiveImpersonationForInitiatorKey(ctx, key);
  if (activeImp) {
    if (String(organizationId) !== String(activeImp.targetOrganizationId)) {
      throw new Error("Impersonation is scoped to one target organization.");
    }
    if (isMutationCtx(ctx) && activeImp.mode === "readonly") {
      const authUser = await tryGetAuthUserByPermissionKey(ctx, key);
      if (authUser) {
        const org = await ctx.db.get(activeImp.targetOrganizationId);
        await appendSuperuserImpersonationAudit(ctx, {
          event: "mutation_blocked",
          initiatorUserId: authUser._id,
          targetOrganizationId: activeImp.targetOrganizationId,
          targetOrganizationName: org?.name,
          impersonationPublicId: activeImp.publicId,
          mode: activeImp.mode,
          mutationPath: permission,
          detail: "readonly_impersonation",
        });
      }
      throw new Error("IMPERSONATION_READ_ONLY");
    }
    if (isMutationCtx(ctx) && activeImp.mode === "operator") {
      const authUser = await tryGetAuthUserByPermissionKey(ctx, key);
      if (authUser) {
        const org = await ctx.db.get(activeImp.targetOrganizationId);
        await appendSuperuserImpersonationAudit(ctx, {
          event: "mutation_allowed",
          initiatorUserId: authUser._id,
          targetOrganizationId: activeImp.targetOrganizationId,
          targetOrganizationName: org?.name,
          impersonationPublicId: activeImp.publicId,
          mode: activeImp.mode,
          mutationPath: permission,
        });
      }
      return;
    }
  }

  const godUser = await tryGetAuthUserByPermissionKey(ctx, key);
  if (authUserHasGlobalAdminElevation(godUser) && !activeImp) {
    return;
  }

  const perms = await resolveEffectivePermissionStrings(ctx, organizationId, key);
  if (!perms) {
    orgPermissionTrace("assertOrgPermission.notMember", {
      organizationId: String(organizationId),
      userKey: safeUserKeyHint(key),
      permission,
    });
    console.warn("[assertOrgPermission] not a member", {
      organizationId,
      userKey: key,
      permission,
    });
    throw new Error("You are not a member of this organization.");
  }
  if (!hasOrgPermission(perms, permission)) {
    orgPermissionTrace("assertOrgPermission.denied", {
      organizationId: String(organizationId),
      userKey: safeUserKeyHint(key),
      permission,
    });
    throw new Error("You do not have permission to perform this action.");
  }
}

export async function assertAnyOrgPermission(
  ctx: QueryCtx | MutationCtx,
  organizationId: Id<"organizations">,
  userKey: string | undefined,
  anyOf: readonly OrgPermission[],
): Promise<void> {
  let key = userKey?.trim() ?? "";
  if (!key) {
    const identity = await ctx.auth.getUserIdentity();
    key = identity?.subject?.trim() ?? "";
  }
  if (!key) key = platformUserKeyFallback();

  const activeImp = await getActiveImpersonationForInitiatorKey(ctx, key);
  if (activeImp) {
    if (String(organizationId) !== String(activeImp.targetOrganizationId)) {
      throw new Error("Impersonation is scoped to one target organization.");
    }
    if (isMutationCtx(ctx) && activeImp.mode === "readonly") {
      throw new Error("IMPERSONATION_READ_ONLY");
    }
    if (isMutationCtx(ctx) && activeImp.mode === "operator") {
      return;
    }
  }

  const godUser = await tryGetAuthUserByPermissionKey(ctx, key);
  if (authUserHasGlobalAdminElevation(godUser) && !activeImp) {
    return;
  }

  const perms = await resolveEffectivePermissionStrings(ctx, organizationId, key);
  if (!perms) {
    console.warn("[assertAnyOrgPermission] not a member", {
      organizationId,
      userKey: key,
      anyOf,
    });
    throw new Error("You are not a member of this organization.");
  }
  for (const p of anyOf) {
    if (hasOrgPermission(perms, p)) return;
  }
  throw new Error("You do not have permission to perform this action.");
}

export async function seedSystemRolesForOrganization(
  ctx: MutationCtx,
  organizationId: Id<"organizations">,
): Promise<{
  adminId: Id<"organizationRoles">;
  managerId: Id<"organizationRoles">;
  userId: Id<"organizationRoles">;
  processorId: Id<"organizationRoles">;
  salesId: Id<"organizationRoles">;
  viewerId: Id<"organizationRoles">;
  externalPartnerId: Id<"organizationRoles">;
}> {
  const now = Date.now();
  const adminPerms = [...EVERYTHING];
  const managerPerms = [...MANAGER_PERMISSIONS];
  const userPerms = [...USER_PERMISSIONS];
  const processorPerms = [...PROCESSOR_PERMISSIONS];
  const salesPerms = [...SALES_PERMISSIONS];
  const viewerPerms = [...VIEWER_PERMISSIONS];
  const externalPerms = [...EXTERNAL_PARTNER_PERMISSIONS];

  async function insertIfMissing(
    key: string,
    label: string,
    permissions: OrgPermission[],
    isSystem: boolean,
  ): Promise<Id<"organizationRoles">> {
    const existingRows = await ctx.db
      .query("organizationRoles")
      .withIndex("by_organization_key", (q) =>
        q.eq("organizationId", organizationId).eq("key", key),
      )
      .collect();
    const existing = pickCanonicalOrgRole(existingRows);
    if (existing) return existing._id;
    return await ctx.db.insert("organizationRoles", {
      organizationId,
      key,
      label,
      permissions,
      isSystem,
      createdAt: now,
      updatedAt: now,
    });
  }

  const adminId = await insertIfMissing(
    SYSTEM_ORG_ROLE_KEYS.admin,
    "Admin",
    adminPerms,
    true,
  );
  const managerId = await insertIfMissing(
    SYSTEM_ORG_ROLE_KEYS.manager,
    "Manager",
    managerPerms,
    true,
  );
  const userId = await insertIfMissing(
    SYSTEM_ORG_ROLE_KEYS.user,
    "User",
    userPerms,
    true,
  );
  const processorId = await insertIfMissing(
    SYSTEM_ORG_ROLE_KEYS.processor,
    "Processor",
    processorPerms,
    true,
  );
  const salesId = await insertIfMissing(
    SYSTEM_ORG_ROLE_KEYS.sales,
    "Sales",
    salesPerms,
    true,
  );
  const viewerId = await insertIfMissing(
    SYSTEM_ORG_ROLE_KEYS.viewer,
    "Viewer",
    viewerPerms,
    true,
  );
  const externalPartnerId = await insertIfMissing(
    SYSTEM_ORG_ROLE_KEYS.external_partner,
    "External Partner",
    externalPerms,
    true,
  );
  return {
    adminId,
    managerId,
    userId,
    processorId,
    salesId,
    viewerId,
    externalPartnerId,
  };
}

/** Keeps built-in Admin/Manager/User permission lists up to date (additive product changes). */
export async function syncSystemRolePermissions(
  ctx: MutationCtx,
  organizationId: Id<"organizations">,
): Promise<void> {
  const now = Date.now();
  const adminPerms = [...EVERYTHING];
  const managerPerms = [...MANAGER_PERMISSIONS];
  const userPerms = [...USER_PERMISSIONS];
  const processorPerms = [...PROCESSOR_PERMISSIONS];
  const salesPerms = [...SALES_PERMISSIONS];
  const viewerPerms = [...VIEWER_PERMISSIONS];
  const externalPerms = [...EXTERNAL_PARTNER_PERMISSIONS];

  const roles = await ctx.db
    .query("organizationRoles")
    .withIndex("by_organization", (q) => q.eq("organizationId", organizationId))
    .collect();

  for (const r of roles) {
    if (!r.isSystem) continue;
    let next: OrgPermission[] | null = null;
    if (r.key === SYSTEM_ORG_ROLE_KEYS.admin) next = adminPerms;
    else if (r.key === SYSTEM_ORG_ROLE_KEYS.manager) next = managerPerms;
    else if (r.key === SYSTEM_ORG_ROLE_KEYS.user) next = userPerms;
    else if (r.key === SYSTEM_ORG_ROLE_KEYS.processor) next = processorPerms;
    else if (r.key === SYSTEM_ORG_ROLE_KEYS.sales) next = salesPerms;
    else if (r.key === SYSTEM_ORG_ROLE_KEYS.viewer) next = viewerPerms;
    else if (r.key === SYSTEM_ORG_ROLE_KEYS.external_partner)
      next = externalPerms;
    if (!next) continue;
    const a = [...new Set(next)].sort().join("\0");
    const b = [...new Set(r.permissions as OrgPermission[])].sort().join("\0");
    if (a !== b) {
      await ctx.db.patch(r._id, {
        permissions: sanitizePermissionList(next),
        updatedAt: now,
      });
    }
  }
}

export function validateCustomPermissions(
  raw: readonly string[],
): OrgPermission[] {
  return sanitizePermissionList(raw);
}

export { isOrgPermission };
