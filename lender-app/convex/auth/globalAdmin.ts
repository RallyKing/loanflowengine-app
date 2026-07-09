import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

const MIN_CONVEX_ID_LEN = 10;
const MAX_CONVEX_ID_LEN = 96;
const CONVEX_ID_RE = /^[a-z0-9]+$/;

/**
 * `memberUserKey` / session `userKey` for internal auth is the `authUsers` document id string.
 */
export async function tryGetAuthUserByPermissionKey(
  ctx: QueryCtx | MutationCtx,
  userKey: string,
): Promise<Doc<"authUsers"> | null> {
  const k = userKey.trim();
  if (
    !k ||
    k.length < MIN_CONVEX_ID_LEN ||
    k.length > MAX_CONVEX_ID_LEN ||
    !CONVEX_ID_RE.test(k)
  ) {
    return null;
  }
  try {
    const doc = await ctx.db.get(k as Id<"authUsers">);
    return doc ?? null;
  } catch {
    return null;
  }
}

export function authUserHasGlobalAdminElevation(
  user: Doc<"authUsers"> | null | undefined,
): boolean {
  if (!user) return false;
  if (user.isGlobalAdmin === true) return true;
  if (user.systemRole === "SUPER_ADMIN") return true;
  return false;
}
