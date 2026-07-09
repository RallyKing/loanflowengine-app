"use client";

import { useMemo } from "react";
import type { Id } from "@/convex/_generated/dataModel";
import { useActorUserKey } from "@/lib/useActorUserKey";
import { useOrgPermissions } from "@/lib/useOrgPermissions";

/** Args shape required by org-scoped Convex queries (`assertOrgScopeArgs`). */
export type OrgScopedConvexArgs = {
  organizationId: Id<"organizations">;
  memberUserKey: string;
};

/**
 * Stable args for org-scoped Convex subscriptions. Returns null when the active
 * org or member key is missing — pass `"skip"` to `useQuery` so the client never
 * falls back to unscoped/global responses.
 */
export function useOrgConvexQueryArgs(): OrgScopedConvexArgs | null {
  const { activeOrganizationId } = useOrgPermissions();
  const memberUserKey = useActorUserKey().trim();
  return useMemo(() => {
    if (!activeOrganizationId || !memberUserKey) return null;
    return { organizationId: activeOrganizationId, memberUserKey };
  }, [activeOrganizationId, memberUserKey]);
}
