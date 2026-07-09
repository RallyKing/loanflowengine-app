/**
 * Resolve a share target (email login or userKey) to canonical org member userKey.
 */
import type { Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { findAuthUserForShareResolution } from "./auth/canonicalIdentity";
import { pickCanonicalOrgMember } from "./orgMembership";

export async function resolveShareTargetUserKey(
  ctx: QueryCtx | MutationCtx,
  organizationId: Id<"organizations">,
  targetLoginOrUserKey: string,
): Promise<string> {
  const raw = targetLoginOrUserKey.trim();
  if (!raw) throw new Error("Share target is required.");

  let userKey = raw;
  const authUser = await findAuthUserForShareResolution(ctx, raw);
  if (raw.includes("@")) {
    if (!authUser) {
      throw new Error("No account found for that email.");
    }
    userKey = String(authUser._id);
  } else if (authUser) {
    userKey = String(authUser._id);
  }

  const targetRows = await ctx.db
    .query("organizationMembers")
    .withIndex("by_org_user", (q) =>
      q.eq("organizationId", organizationId).eq("userKey", userKey),
    )
    .collect();
  const targetMember = pickCanonicalOrgMember(targetRows);
  if (!targetMember) {
    throw new Error("That user is not a member of this organization.");
  }
  if (targetMember.isActive === false) {
    throw new Error("That team member is deactivated and cannot receive shares.");
  }
  return userKey;
}
