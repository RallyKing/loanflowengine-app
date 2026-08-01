import type { QueryCtx, MutationCtx } from "./_generated/server";
import {
  callerIsPlatformGodMode,
  jwtIdentityIsPlatformGodMode,
} from "./auth/platformGodMode";
import { callerIsVerifiedWorkspaceMember } from "./auth/workspaceMemberAuth";
import { platformUserKeyFallback } from "./viewerIdentity";

async function logUnauthorizedDenial(
  ctx: QueryCtx | MutationCtx,
  memberUserKey: string | undefined,
  identity: Awaited<ReturnType<typeof ctx.auth.getUserIdentity>>,
): Promise<void> {
  if (await callerIsPlatformGodMode(ctx, memberUserKey)) return;
  console.error(
    "[auth] Unauthorized",
    JSON.stringify({
      stage: "requireAuthenticatedCaller",
      memberUserKeyPrefix: memberUserKey?.trim().slice(0, 14) ?? null,
      hasIdentity: Boolean(identity),
      subjectPrefix: identity?.subject?.trim().slice(0, 14) ?? null,
      email: typeof identity?.email === "string" ? identity.email : null,
      issuer: identity?.issuer?.trim() ?? null,
      jwtSuperAdmin: jwtIdentityIsPlatformGodMode(identity),
    }),
  );
}

/**
 * Cryptographic caller identity from Convex JWT (`ctx.auth.getUserIdentity()`).
 * Client-supplied `memberUserKey` is never trusted when it disagrees with JWT.
 *
 * Super-admin operators bypass arg/JWT subject mismatch and missing JWT (via authUsers row).
 * Verified workspace members (active org membership) may use session `memberUserKey` when JWT
 * is not attached yet — required for non-god-mode users in the browser.
 *
 * Operator/tooling fallback (NOT for browser clients):
 *   CONVEX_ALLOW_PLATFORM_KEY_FALLBACK=1 on the Convex deployment.
 */
export async function requireAuthenticatedCaller(
  ctx: QueryCtx | MutationCtx,
  memberUserKey: string | undefined,
): Promise<string> {
  const identity = await ctx.auth.getUserIdentity();
  if (identity?.subject?.trim()) {
    const sub = identity.subject.trim();
    const arg = memberUserKey?.trim();
    if (jwtIdentityIsPlatformGodMode(identity)) {
      return sub;
    }
    if (arg && arg !== sub) {
      if (await callerIsPlatformGodMode(ctx, arg)) {
        return sub;
      }
      const err = new Error("Unauthorized");
      await logUnauthorizedDenial(ctx, memberUserKey, identity);
      throw err;
    }
    return sub;
  }

  const argKey = memberUserKey?.trim();
  if (argKey && (await callerIsPlatformGodMode(ctx, argKey))) {
    return argKey;
  }
  if (argKey && (await callerIsVerifiedWorkspaceMember(ctx, argKey))) {
    return argKey;
  }

  // Legacy operator path — disabled in production unless explicitly enabled on Convex.
  if (process.env.CONVEX_ALLOW_PLATFORM_KEY_FALLBACK === "1") {
    const key = memberUserKey?.trim();
    if (key) return key;
    return platformUserKeyFallback();
  }

  await logUnauthorizedDenial(ctx, memberUserKey, identity);
  throw new Error("Unauthorized");
}

/**
 * Resolve authenticated member key — super-admin JWT fast-path, then caller auth.
 */
export async function resolveAuthenticatedMemberKey(
  ctx: QueryCtx | MutationCtx,
  memberUserKey?: string,
): Promise<string> {
  const identity = await ctx.auth.getUserIdentity();
  if (jwtIdentityIsPlatformGodMode(identity)) {
    const sub = identity?.subject?.trim();
    if (sub) return sub;
    const arg = memberUserKey?.trim();
    if (arg) return arg;
  }

  try {
    return await requireAuthenticatedCaller(ctx, memberUserKey);
  } catch (err) {
    const arg = memberUserKey?.trim();
    if (arg && (await callerIsPlatformGodMode(ctx, arg))) {
      return arg;
    }
    throw err;
  }
}

/**
 * JWT-only identity (ignores client memberUserKey entirely).
 */
export async function requireJwtSubject(
  ctx: QueryCtx | MutationCtx,
): Promise<string> {
  const identity = await ctx.auth.getUserIdentity();
  const sub = identity?.subject?.trim();
  if (!sub) throw new Error("Unauthorized");
  return sub;
}
