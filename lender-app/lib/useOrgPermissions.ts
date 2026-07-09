"use client";

/**
 * RBAC for the active organization. Resolved org id priority:
 *   1. Host-mapped cookie (custom-domain org binding).
 *   2. localStorage `lender.activeOrganizationId`.
 *   3. Cookie viewer `organizationId`.
 *
 * Mount `OrgPermissionsProvider` once in the signed-in shell (see app layout).
 */
export type { OrgPermissionsContextValue } from "./orgPermissionsContext";
export {
  OrgPermissionsProvider,
  useOrgPermissions,
} from "./orgPermissionsContext";
