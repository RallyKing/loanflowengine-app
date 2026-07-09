"use client";

import type { ReactNode } from "react";
import { useOrgPermissions } from "@/lib/useOrgPermissions";
import { useAuthStateOptional } from "@/lib/auth/authStateContext";
import { AuthSuspenseFallback } from "@/components/auth/AuthSuspenseFallback";
import { DegradedModeShell } from "@/components/auth/DegradedModeShell";
import { Button } from "@/components/ui/Button";

type Props = {
  children: ReactNode;
  fallback?: ReactNode;
};

/**
 * Ensures an active organization id is resolved before showing org-scoped UI.
 */
export function OrgBoundary({ children, fallback }: Props) {
  const { activeOrganizationId } = useOrgPermissions();
  const auth = useAuthStateOptional();
  const loading =
    auth && !auth.clientHydrated && auth.viewer && auth.state === "loading";

  if (loading) {
    return <AuthSuspenseFallback state="loading" />;
  }

  if (!activeOrganizationId) {
    if (fallback) return <>{fallback}</>;
    return (
      <DegradedModeShell
        title="Choose a workspace"
        description="No active organization is selected, or your saved workspace is invalid."
      >
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            window.location.href = "/settings";
          }}
        >
          Open settings
        </Button>
      </DegradedModeShell>
    );
  }

  return <>{children}</>;
}
