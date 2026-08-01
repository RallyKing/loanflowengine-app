import type { MutationCtx, QueryCtx } from "../_generated/server";
import { tryGetAuthUserByPermissionKey } from "./globalAdmin";

/**
 * Browser session bridge fallback when Convex JWT is not yet attached:
 * `memberUserKey` must be a real `authUsers` id with at least one active org membership.
 * (Same trust model as pre-JWT org queries — userKey comes from the httpOnly session on the client.)
 */
export async function callerIsVerifiedWorkspaceMember(
  ctx: QueryCtx | MutationCtx,
  userKey: string | undefined,
): Promise<boolean> {
  const key = userKey?.trim();
  if (!key) return false;
  const authUser = await tryGetAuthUserByPermissionKey(ctx, key);
  if (!authUser) return false;
  const memberships = await ctx.db
    .query("organizationMembers")
    .withIndex("by_user_org", (q) => q.eq("userKey", key))
    .collect();
  return memberships.some((m) => m.isActive !== false);
}
