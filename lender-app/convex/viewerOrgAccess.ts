/**
 * Operators who may see all org-scoped rows without owner/share ACL filtering.
 */
import type { MutationCtx, QueryCtx } from "./_generated/server";
import {
  authUserHasGlobalAdminElevation,
  tryGetAuthUserByPermissionKey,
} from "./auth/globalAdmin";
import { callerIsPlatformGodMode } from "./auth/platformGodMode";

export type ViewerCtx = QueryCtx | MutationCtx;

/** Platform super-admin (JWT email) or global-admin elevation on authUsers. */
export async function callerHasUnrestrictedOrgDataAccess(
  ctx: ViewerCtx,
  memberUserKey?: string,
): Promise<boolean> {
  if (await callerIsPlatformGodMode(ctx, memberUserKey)) return true;
  const key = memberUserKey?.trim();
  if (!key) return false;
  const authUser = await tryGetAuthUserByPermissionKey(ctx, key);
  return authUserHasGlobalAdminElevation(authUser);
}
