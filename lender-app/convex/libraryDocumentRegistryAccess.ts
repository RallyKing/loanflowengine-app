/**
 * Phase Registry-1 — ACL helpers for entity (`clients`) and lender document vault links.
 */
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { assertOrgMember, assertOrgPermission } from "./organizationAccess";
import { resolveClientAccessLevel } from "./resourceAccess";

type Ctx = QueryCtx | MutationCtx;

export async function assertCanReadClientVault(
  ctx: Ctx,
  client: Doc<"clients">,
  memberUserKey: string | undefined,
): Promise<void> {
  const key = memberUserKey?.trim();
  if (!key) throw new Error("memberUserKey is required.");
  await assertOrgMember(ctx, client.organizationId, key);
  const level = await resolveClientAccessLevel(ctx, client, key);
  if (level === "none") {
    throw new Error("You do not have access to this business entity.");
  }
}

export async function assertCanMutateClientVault(
  ctx: MutationCtx,
  client: Doc<"clients">,
  memberUserKey: string | undefined,
): Promise<void> {
  const key = memberUserKey?.trim();
  if (!key) throw new Error("memberUserKey is required.");
  await assertOrgMember(ctx, client.organizationId, key);
  const level = await resolveClientAccessLevel(ctx, client, key);
  if (level !== "edit") {
    throw new Error("You do not have permission to edit this business entity.");
  }
}

export async function assertCanReadLenderVault(
  ctx: Ctx,
  lender: Doc<"lenders">,
  memberUserKey: string | undefined,
): Promise<void> {
  const key = memberUserKey?.trim();
  if (!key) throw new Error("memberUserKey is required.");
  if (lender.organizationId) {
    await assertOrgPermission(ctx, lender.organizationId, key, "files.view");
    return;
  }
  await assertOrgPermission(
    ctx,
    await requireAnyOrgForGlobalLender(ctx, key),
    key,
    "files.view",
  );
}

export async function assertCanMutateLenderVault(
  ctx: MutationCtx,
  lender: Doc<"lenders">,
  memberUserKey: string | undefined,
): Promise<void> {
  const key = memberUserKey?.trim();
  if (!key) throw new Error("memberUserKey is required.");
  if (lender.organizationId) {
    await assertOrgPermission(ctx, lender.organizationId, key, "contacts.manage");
    return;
  }
  await assertOrgPermission(
    ctx,
    await requireAnyOrgForGlobalLender(ctx, key),
    key,
    "contacts.manage",
  );
}

/** Global catalog lenders have no org FK — use caller's active org membership. */
async function requireAnyOrgForGlobalLender(
  ctx: Ctx,
  memberUserKey: string,
): Promise<Id<"organizations">> {
  const memberships = await ctx.db
    .query("organizationMembers")
    .withIndex("by_user_org", (q) => q.eq("userKey", memberUserKey))
    .collect();
  const active = memberships.find((m) => m.isActive !== false);
  if (!active) {
    throw new Error("Organization membership required for global lender vault access.");
  }
  return active.organizationId;
}
