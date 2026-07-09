"use client";

import type { ReactNode } from "react";
import { useOrgPermissions } from "@/lib/useOrgPermissions";
import type { OrgPermission } from "@/lib/orgRbac";
import { DegradedModeShell } from "@/components/auth/DegradedModeShell";
import { Button } from "@/components/ui/Button";

type Props = {
  permission: OrgPermission;
  children: ReactNode;
  fallback?: ReactNode;
};

/**
 * Declarative RBAC gate; never throws — shows fallback when permission missing.
 */
export function PermissionBoundary({ permission, children, fallback }: Props) {
  const { can, activeOrganizationId } = useOrgPermissions();

  if (!activeOrganizationId) {
    return (
      <>
        {fallback ?? (
          <DegradedModeShell
            title="Workspace required"
            description="Pick an organization to check permissions."
          >
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                window.location.href = "/settings";
              }}
            >
              Settings
            </Button>
          </DegradedModeShell>
        )}
      </>
    );
  }

  if (!can(permission)) {
    return (
      <>
        {fallback ?? (
          <DegradedModeShell
            title="Access restricted"
            description="You don't have permission for this action in the current workspace."
          >
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                window.location.href = "/settings";
              }}
            >
              Workspace settings
            </Button>
          </DegradedModeShell>
        )}
      </>
    );
  }

  return <>{children}</>;
}
