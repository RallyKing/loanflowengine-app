/**
 * Re-add an existing auth user to an organization (team re-invite path).
 */
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { assertOrgHasAvailableMemberSeat } from "./orgPlanLimits";
import { pickCanonicalOrgMember } from "./orgMembership";
import { seedSystemRolesForOrganization } from "./organizationRbac";
import { bumpCredentialForUserKey } from "./auth/sessionInvalidate";

export async function reinviteExistingUserToOrg(
  ctx: MutationCtx,
  args: {
    organizationId: Id<"organizations">;
    userId: Id<"authUsers">;
    assignedRoleId: Id<"organizationRoles">;
    passwordHash: string;
  },
): Promise<{ userKey: string; reinvited: true }> {
  const roleDoc = await ctx.db.get(args.assignedRoleId);
  if (!roleDoc || roleDoc.organizationId !== args.organizationId) {
    throw new Error("Invalid role for this organization.");
  }
  await seedSystemRolesForOrganization(ctx, args.organizationId);

  const userKey = String(args.userId);
  const memRows = await ctx.db
    .query("organizationMembers")
    .withIndex("by_org_user", (q) =>
      q.eq("organizationId", args.organizationId).eq("userKey", userKey),
    )
    .collect();
  const existingMem = pickCanonicalOrgMember(memRows);
  const now = Date.now();

  if (existingMem) {
    for (const row of memRows) {
      if (row._id !== existingMem._id) await ctx.db.delete(row._id);
    }
    await ctx.db.patch(existingMem._id, {
      role: "member",
      assignedRoleId: args.assignedRoleId,
      isActive: true,
    });
  } else {
    await assertOrgHasAvailableMemberSeat(ctx, args.organizationId);
    await ctx.db.insert("organizationMembers", {
      organizationId: args.organizationId,
      userKey,
      role: "member",
      assignedRoleId: args.assignedRoleId,
      isActive: true,
      createdAt: now,
    });
  }

  await ctx.db.patch(args.userId, {
    passwordHash: args.passwordHash,
    defaultOrganizationId: args.organizationId,
    updatedAt: now,
  });
  await bumpCredentialForUserKey(ctx, userKey);
  await ctx.db.patch(args.organizationId, { updatedAt: now });
  return { userKey, reinvited: true };
}
