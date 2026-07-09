import type { UserIdentity } from "convex/server";
import type { QueryCtx, MutationCtx } from "./_generated/server";

/**
 * Convex runs without JWT providers; the Next.js cookie gate authenticates the
 * workspace session. When `ctx.auth.getUserIdentity()` is null, we use the same
 * profile as `lib/sessionAuth.ts` (via matching env vars on the Convex deployment).
 */
function readFallbackIdentity(): UserIdentity {
  const subject = process.env.APP_AUTH_USER_KEY?.trim() ?? "";
  const activeOrganizationId = process.env.APP_AUTH_ORGANIZATION_ID?.trim() ?? "";
  const email = process.env.APP_AUTH_USER_EMAIL?.trim() ?? "";
  const name = process.env.APP_AUTH_USER_FULL_NAME?.trim() ?? "";
  const roleRaw = process.env.APP_AUTH_WORKSPACE_ROLE?.trim().toLowerCase();
  const workspaceRole =
    roleRaw === "member" ? "workspace:member" : "workspace:admin";
  if (!subject || !activeOrganizationId) {
    throw new Error(
      "Convex env missing APP_AUTH_USER_KEY or APP_AUTH_ORGANIZATION_ID (must match Next session profile).",
    );
  }
  return {
    subject,
    issuer: "local-session",
    tokenIdentifier: `local-session|${subject}`,
    name,
    email,
    activeOrganizationId,
    workspaceRole,
  } as unknown as UserIdentity;
}

let cached: UserIdentity | null = null;

function fallbackIdentity(): UserIdentity {
  if (!cached) cached = readFallbackIdentity();
  return cached;
}

export function activeOrganizationIdFromIdentity(
  identity: UserIdentity | null,
): string | undefined {
  if (!identity) return undefined;
  const r = identity as Record<string, unknown>;
  if (
    typeof r.activeOrganizationId === "string" &&
    r.activeOrganizationId.length > 0
  ) {
    return r.activeOrganizationId;
  }
  return undefined;
}

export async function requireIdentity(
  ctx: QueryCtx | MutationCtx,
): Promise<UserIdentity> {
  const identity = await ctx.auth.getUserIdentity();
  if (identity) return identity;
  return fallbackIdentity();
}

export function mapWorkspaceRoleToTenantRole(
  role: string | undefined,
): "owner" | "admin" | "member" {
  if (!role) return "member";
  const r = role.toLowerCase();
  if (r.includes("owner")) return "owner";
  if (r.includes("admin") || r === "workspace:admin" || r === "org:admin")
    return "admin";
  return "member";
}

let cachedUserKey: string | null = null;

/** Matches `APP_AUTH_USER_KEY` on the Convex deployment (and Next session profile). */
export function platformUserKeyFallback(): string {
  if (!cachedUserKey) {
    const k = process.env.APP_AUTH_USER_KEY?.trim() ?? "";
    if (!k) {
      throw new Error(
        "APP_AUTH_USER_KEY must be set on the Convex deployment for member fallbacks.",
      );
    }
    cachedUserKey = k;
  }
  return cachedUserKey;
}
