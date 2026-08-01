import type { Id } from "./_generated/dataModel";
import { PRIMARY_PLATFORM_DEFAULT_ORGANIZATION_ID } from "./auth/platformGodMode";

/** Legacy single-tenant rows without `organizationId` belong to the primary workspace. */
export function rowBelongsToOrganizationScope(
  rowOrganizationId: Id<"organizations"> | undefined,
  organizationId: Id<"organizations">,
): boolean {
  if (rowOrganizationId === organizationId) return true;
  return (
    rowOrganizationId == null &&
    organizationId === PRIMARY_PLATFORM_DEFAULT_ORGANIZATION_ID
  );
}
