import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import { tryGetAuthUserByPermissionKey } from "./globalAdmin";

/** Bump credential version so existing session rows fail `validateSession`. */
export async function bumpCredentialForUserKey(
  ctx: MutationCtx,
  userKey: string,
): Promise<void> {
  const user = await tryGetAuthUserByPermissionKey(ctx, userKey.trim());
  if (!user) return;
  await ctx.runMutation(internal.auth.usersInternal.bumpCredentialVersion, {
    userId: user._id,
  });
}

export async function revokeAllSessionsForUserId(
  ctx: MutationCtx,
  userId: Id<"authUsers">,
  reason: string,
): Promise<void> {
  const now = Date.now();
  await ctx.runMutation(internal.auth.sessionsInternal.revokeAllForUser, {
    userId,
    reason,
    nowMs: now,
  });
}
