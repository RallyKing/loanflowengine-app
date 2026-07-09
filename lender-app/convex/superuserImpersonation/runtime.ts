/**
 * Active impersonation resolution + tenant permission helpers.
 */
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { SYSTEM_ORG_ROLE_KEYS } from "../../lib/orgRbac";
import { pickCanonicalOrgRole } from "../orgMembership";
import { authUserMayInitiateSuperuserImpersonation } from "../auth/superuserAllowlist";
import { tryGetAuthUserByPermissionKey } from "../auth/globalAdmin";

export const IMPERSONATION_MAX_TTL_MS = 30 * 60 * 1000;

export function isMutationCtx(
  ctx: QueryCtx | MutationCtx,
): ctx is MutationCtx {
  return "scheduler" in ctx;
}

export async function getActiveImpersonationForInitiatorKey(
  ctx: QueryCtx | MutationCtx,
  userKey: string,
  nowMs: number = Date.now(),
): Promise<Doc<"superuserImpersonationSessions"> | null> {
  const authUser = await tryGetAuthUserByPermissionKey(ctx, userKey);
  if (!authUser || !authUserMayInitiateSuperuserImpersonation(authUser)) {
    return null;
  }

  const rows = await ctx.db
    .query("superuserImpersonationSessions")
    .withIndex("by_initiator", (q) => q.eq("initiatorUserId", authUser._id))
    .collect();

  const active = rows
    .filter((r) => !r.revokedAtMs && r.expiresAt > nowMs)
    .sort((a, b) => b.issuedAt - a.issuedAt);

  return active[0] ?? null;
}

export async function resolveTenantAdminPermissionStrings(
  ctx: QueryCtx | MutationCtx,
  organizationId: Id<"organizations">,
): Promise<string[] | null> {
  const adminRows = await ctx.db
    .query("organizationRoles")
    .withIndex("by_organization_key", (q) =>
      q.eq("organizationId", organizationId).eq("key", SYSTEM_ORG_ROLE_KEYS.admin),
    )
    .collect();
  const adminRole = pickCanonicalOrgRole(adminRows);
  if (!adminRole) return null;

  const denyRows = await ctx.db
    .query("organizationPermissions")
    .withIndex("by_organization", (q) => q.eq("organizationId", organizationId))
    .collect();
  const deny = new Set(
    denyRows.filter((r) => r.denied).map((r) => r.permissionKey),
  );
  const perms = adminRole.permissions.filter((p) => !deny.has(p));
  return perms.length > 0 ? perms : null;
}

export async function validateImpersonationSessionRow(
  ctx: QueryCtx | MutationCtx,
  args: {
    publicId: string;
    tokenHash: string;
    authSessionPublicId: string;
    nowMs: number;
  },
): Promise<
  | { ok: false; code: string }
  | {
      ok: true;
      row: Doc<"superuserImpersonationSessions">;
      orgName: string;
    }
> {
  const rows = await ctx.db
    .query("superuserImpersonationSessions")
    .withIndex("by_publicId", (q) => q.eq("publicId", args.publicId))
    .collect();
  const row = rows.sort((a, b) => b.issuedAt - a.issuedAt)[0];
  if (!row) return { ok: false, code: "NOT_FOUND" };
  if (row.revokedAtMs) return { ok: false, code: "REVOKED" };
  if (row.expiresAt <= args.nowMs) return { ok: false, code: "EXPIRED" };
  if (row.tokenHash !== args.tokenHash) return { ok: false, code: "INVALID_TOKEN" };
  if (row.authSessionPublicId !== args.authSessionPublicId) {
    return { ok: false, code: "SESSION_MISMATCH" };
  }

  const initiator = await ctx.db.get(row.initiatorUserId);
  if (!authUserMayInitiateSuperuserImpersonation(initiator)) {
    return { ok: false, code: "FORBIDDEN_INITIATOR" };
  }

  const org = await ctx.db.get(row.targetOrganizationId);
  if (!org) return { ok: false, code: "ORG_MISSING" };

  return { ok: true, row, orgName: org.name };
}
