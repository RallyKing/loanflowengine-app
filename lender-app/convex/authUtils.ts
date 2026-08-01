/**
 * Canonical super-admin identity + org membership gates.
 * Internal helpers (requireMemberKey, requireOrgReader, etc.) must delegate here.
 */
import type { Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { OrgPermission } from "../lib/orgRbac";
import {
  callerIsPlatformGodMode,
  jwtIdentityIsPlatformGodMode,
} from "./auth/platformGodMode";
import { resolveAuthenticatedMemberKey } from "./callerAuth";
import { assertOrgMember } from "./organizationAccess";
import {
  assertAnyOrgPermission,
  assertOrgPermission,
} from "./organizationRbac";

export type AuthCtx = QueryCtx | MutationCtx;

/**
 * Platform operator / super-admin — JWT email claim or elevated authUsers row.
 * Centralizes checks previously scattered as "god mode" bypasses.
 */
export async function isSuperAdmin(
  ctx: AuthCtx,
  userKey?: string,
): Promise<boolean> {
  return callerIsPlatformGodMode(ctx, userKey);
}

async function identityDebugSnapshot(ctx: AuthCtx) {
  const identity = await ctx.auth.getUserIdentity();
  return {
    hasIdentity: Boolean(identity),
    subjectPrefix: identity?.subject?.trim().slice(0, 14) ?? null,
    email: typeof identity?.email === "string" ? identity.email : null,
    issuer: identity?.issuer?.trim() ?? null,
    jwtSuperAdmin: jwtIdentityIsPlatformGodMode(identity),
  };
}

/** Temporary diagnostics when membership auth fails for non-super-admins. */
export function logMembershipAuthDenial(
  ctx: AuthCtx,
  stage: string,
  organizationId: Id<"organizations"> | string | undefined,
  memberUserKey: string | undefined,
  err: unknown,
): void {
  void identityDebugSnapshot(ctx).then((identity) => {
    console.error(
      "[auth] membership denied",
      JSON.stringify({
        stage,
        organizationId: organizationId ? String(organizationId) : null,
        memberUserKeyPrefix: memberUserKey?.trim().slice(0, 14) ?? null,
        error: err instanceof Error ? err.message : String(err),
        identity,
      }),
    );
  });
}

async function assertOrgExists(
  ctx: AuthCtx,
  organizationId: Id<"organizations">,
): Promise<void> {
  const org = await ctx.db.get(organizationId);
  if (!org) throw new Error("Organization not found.");
}

export type RequireOrgMemberKeyOptions = {
  permission?: OrgPermission;
  anyOf?: readonly OrgPermission[];
  /** Convex log stage label for denial diagnostics. */
  stage?: string;
};

/**
 * Canonical org-scoped member gate. Super-admins bypass organizationMembers lookup.
 */
export async function requireOrgMemberKey(
  ctx: AuthCtx,
  organizationId: Id<"organizations">,
  memberUserKey?: string,
  options?: RequireOrgMemberKeyOptions,
): Promise<string> {
  const stage = options?.stage ?? "requireOrgMemberKey";

  const identity = await ctx.auth.getUserIdentity();
  if (jwtIdentityIsPlatformGodMode(identity)) {
    const key = identity?.subject?.trim() || memberUserKey?.trim() || "";
    if (!key) {
      logMembershipAuthDenial(
        ctx,
        `${stage}.superAdminNoKey`,
        organizationId,
        memberUserKey,
        new Error("Not authenticated"),
      );
      throw new Error("Not authenticated");
    }
    await assertOrgExists(ctx, organizationId);
    return key;
  }

  try {
    const key = await resolveAuthenticatedMemberKey(ctx, memberUserKey);
    if (await isSuperAdmin(ctx, key)) {
      await assertOrgExists(ctx, organizationId);
      return key;
    }

    if (options?.permission) {
      await assertOrgPermission(ctx, organizationId, key, options.permission);
    } else if (options?.anyOf?.length) {
      await assertAnyOrgPermission(ctx, organizationId, key, options.anyOf);
    } else {
      await assertOrgMember(ctx, organizationId, key);
    }
    return key;
  } catch (err) {
    if (!(await isSuperAdmin(ctx, memberUserKey))) {
      logMembershipAuthDenial(ctx, stage, organizationId, memberUserKey, err);
    }
    throw err;
  }
}

/** Read access to org-scoped pipeline/settings data. */
export async function requireOrgReaderKey(
  ctx: AuthCtx,
  organizationId: Id<"organizations">,
  memberUserKey?: string,
  stage = "requireOrgReader",
): Promise<string> {
  return requireOrgMemberKey(ctx, organizationId, memberUserKey, {
    permission: "files.view",
    stage,
  });
}

/** Org settings mutations. */
export async function requireOrgSettingsAdminKey(
  ctx: AuthCtx,
  organizationId: Id<"organizations">,
  memberUserKey?: string,
  stage = "requireOrgSettingsAdmin",
): Promise<string> {
  return requireOrgMemberKey(ctx, organizationId, memberUserKey, {
    permission: "settings.manage",
    stage,
  });
}
