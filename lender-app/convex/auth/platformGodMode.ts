import type { UserIdentity } from "convex/server";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { normalizeAuthEmail } from "../../lib/auth/normalizeAuthEmail";
import {
  authUserHasGlobalAdminElevation,
  tryGetAuthUserByPermissionKey,
} from "./globalAdmin";
import {
  authUserIsPrimaryPlatformAdmin,
  primaryPlatformAdminUsernameKeys,
} from "./primaryPlatformAdmin";

const GOD_MODE_EMAILS = new Set(primaryPlatformAdminUsernameKeys());

/** Canonical production workspace for the primary platform operator. */
export const PRIMARY_PLATFORM_DEFAULT_ORGANIZATION_ID =
  "mx76bxqnc23q76cb99tvrffmy58644pf" as Id<"organizations">;

export const PRIMARY_PLATFORM_DEFAULT_ORGANIZATION_NAME =
  "Direct Lending Connection";

export type PlatformGodModeMembershipRow = {
  organizationId: Id<"organizations">;
  role: "owner";
  organizationName: string;
  organizationSlug?: string;
  productRoleKey?: string;
  productRoleLabel?: string;
};

/** Fast-path membership row — no database reads. */
export function platformGodModeMembershipFastPath(): PlatformGodModeMembershipRow[] {
  return [
    {
      organizationId: PRIMARY_PLATFORM_DEFAULT_ORGANIZATION_ID,
      role: "owner",
      organizationName: PRIMARY_PLATFORM_DEFAULT_ORGANIZATION_NAME,
      organizationSlug: "direct-lending-connection",
      productRoleKey: "admin",
      productRoleLabel: "Admin",
    },
  ];
}

/**
 * Platform operator lockout bypass — JWT email claim or elevated authUsers row.
 * Used so the primary admin cannot be blocked by stale org scope or membership drift.
 */
export function jwtIdentityIsPlatformGodMode(
  identity: UserIdentity | null | undefined,
): boolean {
  if (!identity) return false;
  const email =
    normalizeAuthEmail(
      typeof identity.email === "string" ? identity.email : undefined,
    ) ??
    (typeof identity.email === "string"
      ? identity.email.trim().toLowerCase()
      : undefined);
  if (email && GOD_MODE_EMAILS.has(email)) return true;
  return false;
}

export async function callerIsPlatformGodMode(
  ctx: QueryCtx | MutationCtx,
  userKey: string | undefined,
): Promise<boolean> {
  const identity = await ctx.auth.getUserIdentity();
  if (jwtIdentityIsPlatformGodMode(identity)) return true;
  const key = userKey?.trim();
  if (!key) return false;
  const authUser = await tryGetAuthUserByPermissionKey(ctx, key);
  if (authUserHasGlobalAdminElevation(authUser)) return true;
  if (authUserIsPrimaryPlatformAdmin(authUser)) return true;
  return false;
}

/** God mode may read any existing organization document. */
export async function assertOrgReadableForGodModeOrMember(
  ctx: QueryCtx | MutationCtx,
  organizationId: Id<"organizations">,
): Promise<void> {
  const org = await ctx.db.get(organizationId);
  if (!org) throw new Error("Organization not found.");
}
