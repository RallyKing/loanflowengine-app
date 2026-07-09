/**
 * Organization membership and row-level access checks.
 * Legacy rows: `organizationId` unset — no membership check (migration-safe default).
 */
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { hasOrgPermission } from "../lib/orgRbac";

import {
  assertOrgPermission,
  resolveEffectivePermissionStrings,
} from "./organizationRbac";
import { orgPermissionFail, safeUserKeyHint } from "./orgPermissionTelemetry";
import { platformUserKeyFallback } from "./viewerIdentity";
import { assertOrganizationId } from "./organizationValidators";
import {
  authUserHasGlobalAdminElevation,
  tryGetAuthUserByPermissionKey,
} from "./auth/globalAdmin";
import {
  assertCanAccessFile as assertCanAccessFileAcl,
  assertCanMutatePipelineRow as assertCanMutatePipelineRowAcl,
  assertCanReadPipelineRow as assertCanReadPipelineRowAcl,
  filterPipelineRowsForMember as filterPipelineRowsForMemberAcl,
  pipelineFileReadable as pipelineFileReadableAcl,
  resolvePipelineAccessLevel as resolvePipelineAccessLevelAcl,
  resolveRowOwnerUserId,
  viewerIsOrgAdminOrOwner,
} from "./resourceAccess";

export { assertOrgPermission };
export {
  filterTaskRowsForMember,
  assertCanMutateTaskRow,
  assertCanReadTaskRow,
  resolveTaskAccessLevel,
} from "./resourceAccess";

export async function sessionKeyIsGlobalAdmin(
  ctx: QueryCtx | MutationCtx,
  memberUserKey: string | undefined,
): Promise<boolean> {
  const key = await resolveMemberUserKey(ctx, memberUserKey);
  const authUser = await tryGetAuthUserByPermissionKey(ctx, key);
  return authUserHasGlobalAdminElevation(authUser);
}

/**
 * Resolve the canonical member identity for a Convex call.
 *
 * Priority:
 *   1. Convex JWT subject (when an auth provider is mounted — none today).
 *   2. Explicit `memberUserKey` arg from the client (set by most components
 *      via `useOrgConvexQueryArgs`).
 *   3. `platformUserKeyFallback()` (from `APP_AUTH_USER_KEY` on the deployment).
 *
 * The cookie session has already been verified at the Next.js layer before
 * any Convex traffic reaches us, so the fallback is no weaker than the rest
 * of the app's auth posture.
 */
export async function resolveMemberUserKey(
  ctx: QueryCtx | MutationCtx,
  memberUserKey: string | undefined,
): Promise<string> {
  const identity = await ctx.auth.getUserIdentity();
  if (identity) {
    const sub = identity.subject?.trim() ?? "";
    if (!sub) {
      const hint = safeUserKeyHint(memberUserKey);
      orgPermissionFail(
        "resolveMemberUserKey.emptyJwtSubject",
        {
          hasIdentity: true,
          tokenIdentifier: identity.tokenIdentifier ?? null,
          clientKey: hint,
        },
        new Error("Invalid authenticated subject."),
      );
      throw new Error("Invalid authenticated subject.");
    }
    const arg = memberUserKey?.trim();
    if (arg && arg !== sub) {
      console.warn(
        "[resolveMemberUserKey] ignoring client memberUserKey that disagrees with JWT subject",
        { jwtSubject: sub, clientArg: arg },
      );
    }
    return sub;
  }
  const key = memberUserKey?.trim();
  if (key) return key;
  return platformUserKeyFallback();
}

export async function assertOrgMember(
  ctx: QueryCtx | MutationCtx,
  organizationId: Id<"organizations">,
  userKey: string | undefined,
): Promise<void> {
  // Identity resolution priority mirrors `resolveMemberUserKey`.
  let key = userKey?.trim() ?? "";
  if (!key) {
    const identity = await ctx.auth.getUserIdentity();
    key = identity?.subject?.trim() ?? "";
  }
  if (!key) key = platformUserKeyFallback();
  const perms = await resolveEffectivePermissionStrings(ctx, organizationId, key);
  if (!perms) {
    // Log enough state to debug stale-org-in-localStorage / cross-org leaks
    // without revealing other tenants' data.
    console.warn(
      "[assertOrgMember] not a member",
      { organizationId, userKey: key },
    );
    throw new Error("You are not a member of this organization.");
  }
}

/** When listing or mutating in org context, require proof of membership. */
export async function assertOrgScopeArgs(
  ctx: QueryCtx | MutationCtx,
  organizationId: Id<"organizations"> | undefined,
  memberUserKey: string | undefined,
): Promise<void> {
  if (!organizationId) {
    throw new Error("organizationId is required.");
  }
  const { id } = await assertOrganizationId(ctx, organizationId);
  const key = await resolveMemberUserKey(ctx, memberUserKey);
  await assertOrgMember(ctx, id, key);
}

export function filterPipelineByOrgScope(
  rows: Doc<"pipeline">[],
  organizationId: Id<"organizations">,
): Doc<"pipeline">[] {
  return rows.filter((r) => r.organizationId === organizationId);
}

export function filterContactsByOrgScope(
  rows: Doc<"contacts">[],
  organizationId: Id<"organizations"> | undefined,
): Doc<"contacts">[] {
  if (!organizationId) return rows;
  return rows.filter((r) => r.organizationId === organizationId);
}

/** Effective access to an org-scoped pipeline file (legacy rows use full access in mutators). */
export type OrgPipelineFileAccessLevel = "none" | "view" | "edit";

export async function resolveOrgPipelineFileAccessLevel(
  ctx: QueryCtx | MutationCtx,
  row: Doc<"pipeline">,
  memberUserKey: string | undefined,
): Promise<OrgPipelineFileAccessLevel> {
  return resolvePipelineAccessLevelAcl(ctx, row, memberUserKey);
}

/**
 * Pipeline rows visible to this member under strict owner-scoped ACL (Step 8B).
 */
export async function filterPipelineRowsForMember(
  ctx: QueryCtx,
  rows: Doc<"pipeline">[],
  organizationId: Id<"organizations">,
  memberUserKey: string | undefined,
): Promise<Doc<"pipeline">[]> {
  return filterPipelineRowsForMemberAcl(ctx, rows, organizationId, memberUserKey);
}

export async function assertCanReadPipelineRow(
  ctx: QueryCtx,
  row: Doc<"pipeline">,
  memberUserKey: string | undefined,
): Promise<void> {
  return assertCanReadPipelineRowAcl(ctx, row, memberUserKey);
}

export async function assertCanAccessFile(
  ctx: QueryCtx | MutationCtx,
  fileId: Id<"pipeline">,
  memberUserKey: string | undefined,
): Promise<Doc<"pipeline">> {
  return assertCanAccessFileAcl(ctx, fileId, memberUserKey);
}

export async function pipelineFileReadable(
  ctx: QueryCtx | MutationCtx,
  row: Doc<"pipeline">,
  memberUserKey: string | undefined,
): Promise<boolean> {
  return pipelineFileReadableAcl(ctx, row, memberUserKey);
}

export async function assertCanMutatePipelineRow(
  ctx: MutationCtx,
  row: Doc<"pipeline">,
  memberUserKey: string | undefined,
): Promise<void> {
  return assertCanMutatePipelineRowAcl(ctx, row, memberUserKey);
}

export async function assertCanDeletePipelineRow(
  ctx: MutationCtx,
  row: Doc<"pipeline">,
  memberUserKey: string | undefined,
): Promise<void> {
  if (!row.organizationId) return;
  const key = await resolveMemberUserKey(ctx, memberUserKey);
  await assertOrgPermission(ctx, row.organizationId, key, "files.delete");
  const owner = resolveRowOwnerUserId(row);
  if (!owner || owner === key) return;
  if (await viewerIsOrgAdminOrOwner(ctx, row.organizationId, key)) return;
  throw new Error("Only the file owner can delete this file.");
}

/**
 * Org-scoped files may only reference global lenders or lenders in the same org.
 */
export function assertLenderAttachableToPipeline(
  lender: Doc<"lenders">,
  file: Doc<"pipeline">,
): void {
  const lo = lender.organizationId;
  const fo = file.organizationId;
  if (lo == null) return;
  if (fo == null) {
    throw new Error(
      "Organization-specific lenders cannot be attached to legacy (non-organization) files.",
    );
  }
  if (lo !== fo) {
    throw new Error("That lender belongs to a different organization.");
  }
}

/** Same org-boundary rule as pipeline ↔ lender, for CRM contact ↔ lender links. */
export function assertContactAndLenderOrgCompatible(
  contact: Doc<"contacts">,
  lender: Doc<"lenders">,
): void {
  const co = contact.organizationId;
  const lo = lender.organizationId;
  if (!co && !lo) return;
  if (co && !lo) return;
  if (!co && lo) {
    throw new Error(
      "Link a global-directory contact to this lender from a team-scoped contact instead.",
    );
  }
  if (co && lo && co !== lo) {
    throw new Error("That lender belongs to a different organization than this contact.");
  }
}

export async function assertCanReadContactRow(
  ctx: QueryCtx,
  row: Doc<"contacts">,
  memberUserKey: string | undefined,
): Promise<void> {
  if (!row.organizationId) return;
  const key = await resolveMemberUserKey(ctx, memberUserKey);
  await assertOrgPermission(ctx, row.organizationId, key, "contacts.view");
}

export async function assertCanMutateContactRow(
  ctx: MutationCtx,
  row: Doc<"contacts">,
  memberUserKey: string | undefined,
): Promise<void> {
  if (!row.organizationId) return;
  const key = await resolveMemberUserKey(ctx, memberUserKey);
  await assertOrgPermission(ctx, row.organizationId, key, "contacts.manage");
}

/** Per-file drawer layout / template reset (optional blocks — org enforcement). */
export async function assertCanManagePipelineDrawerLayout(
  ctx: MutationCtx,
  row: Doc<"pipeline">,
  memberUserKey: string | undefined,
): Promise<void> {
  if (!row.organizationId) return;
  const key = await resolveMemberUserKey(ctx, memberUserKey);
  await assertOrgPermission(ctx, row.organizationId, key, "blocks.manage");
  await assertCanMutatePipelineRow(ctx, row, memberUserKey);
}

/** Contact↔file link changes touching org-scoped rows. */
export async function assertCanMutateContactFileLink(
  ctx: MutationCtx,
  contact: Doc<"contacts">,
  file: Doc<"pipeline">,
  memberUserKey: string | undefined,
): Promise<void> {
  const co = contact.organizationId;
  const fo = file.organizationId;
  if (!co && !fo) return;
  const key = await resolveMemberUserKey(ctx, memberUserKey);
  if (co && fo && co !== fo) {
    const authUser = await tryGetAuthUserByPermissionKey(ctx, key);
    if (!authUserHasGlobalAdminElevation(authUser)) {
      throw new Error("Contact and file belong to different organizations.");
    }
    await assertOrgPermission(ctx, co, key, "contacts.manage");
    await assertOrgPermission(ctx, fo, key, "files.edit");
    return;
  }
  const orgId = (co ?? fo)!;
  await assertOrgPermission(ctx, orgId, key, "contacts.manage");
  await assertOrgPermission(ctx, orgId, key, "files.edit");
}
