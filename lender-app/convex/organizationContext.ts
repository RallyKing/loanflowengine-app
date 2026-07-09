import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { orgIntegrityTrace } from "./orgIntegrityTelemetry";
import { assertOrgMember, resolveMemberUserKey } from "./organizationAccess";
import { assertOrganizationId } from "./organizationValidators";

export type OrganizationContext = {
  organizationId: Id<"organizations">;
  organization: Doc<"organizations">;
  memberUserKey: string;
};

export async function resolveOrganizationContext(
  ctx: QueryCtx | MutationCtx,
  organizationId: Id<"organizations"> | string,
  memberUserKey: string | undefined,
): Promise<OrganizationContext> {
  const { id, organization } = await assertOrganizationId(ctx, organizationId);
  const memberUserKeyResolved = await resolveMemberUserKey(ctx, memberUserKey);
  await assertOrgMember(ctx, id, memberUserKeyResolved);
  orgIntegrityTrace("resolveOrganizationContext.ok", {
    organizationId: String(id),
  });
  return {
    organizationId: id,
    organization,
    memberUserKey: memberUserKeyResolved,
  };
}
