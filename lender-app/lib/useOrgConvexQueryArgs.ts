"use client";

import { useMemo } from "react";
import type { Id } from "@/convex/_generated/dataModel";
import { useActorUserKey } from "@/lib/useActorUserKey";
import { useOrgPermissions } from "@/lib/useOrgPermissions";
import { MASTER_PLATFORM_ORGANIZATION_ID } from "@/lib/invariants/masterOrganizationFallback";
import { useConvexOrgQueryReady } from "@/lib/useConvexOrgQueryReady";

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
  const orgQueryReady = useConvexOrgQueryReady();
  const { activeOrganizationId } = useOrgPermissions();
  const memberUserKey = useActorUserKey().trim();
  return useMemo(() => {
    if (!orgQueryReady) return null;
    const orgId = activeOrganizationId ?? MASTER_PLATFORM_ORGANIZATION_ID;
    if (!memberUserKey) return null;
    return { organizationId: orgId, memberUserKey };
  }, [orgQueryReady, activeOrganizationId, memberUserKey]);
}
