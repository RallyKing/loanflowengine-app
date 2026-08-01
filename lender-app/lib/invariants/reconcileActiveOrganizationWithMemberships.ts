"use client";

import type { Id } from "@/convex/_generated/dataModel";
import {
  getStoredActiveOrganizationId,
  setStoredActiveOrganizationId,
} from "@/lib/activeOrganizationId";
import { parseOrganizationId } from "@/lib/orgIdValidation";
import {
  MASTER_PLATFORM_ORGANIZATION_ID,
} from "@/lib/invariants/masterOrganizationFallback";

export type OrgMembershipRow = {
  organizationId: Id<"organizations">;
};

/**
 * Drop stale `lender.activeOrganizationId` when it is not a valid membership
 * (or session default for global admins). Returns the org id callers should use.
 */
export function reconcileActiveOrganizationWithMemberships(input: {
  memberships: readonly OrgMembershipRow[] | undefined;
  sessionOrganizationId: string | null | undefined;
  isGlobalAdmin: boolean;
}): Id<"organizations"> | null {
  if (typeof window === "undefined") return null;

  const sessionOrg = parseOrganizationId(input.sessionOrganizationId ?? null);
  const stored = getStoredActiveOrganizationId();
  const membershipIds = new Set(
    (input.memberships ?? []).map((m) => String(m.organizationId)),
  );

  const pickFallback = (): Id<"organizations"> | null => {
    if (sessionOrg && (input.isGlobalAdmin || membershipIds.has(sessionOrg))) {
      return sessionOrg;
    }
    const first = input.memberships?.[0]?.organizationId ?? null;
    if (first) return parseOrganizationId(first);
    if (input.isGlobalAdmin) return MASTER_PLATFORM_ORGANIZATION_ID;
    return null;
  };

  if (!stored) {
    const fallback = pickFallback();
    if (fallback) setStoredActiveOrganizationId(fallback);
    return fallback;
  }

  if (input.isGlobalAdmin) {
    if (!membershipIds.has(stored) && sessionOrg) {
      setStoredActiveOrganizationId(sessionOrg);
      return sessionOrg;
    }
    return stored;
  }

  if (membershipIds.has(stored)) {
    return stored;
  }

  const fallback = pickFallback();
  setStoredActiveOrganizationId(fallback);
  if (process.env.NODE_ENV === "development") {
    console.warn("[org-scope] Reset stale activeOrganizationId", {
      previous: stored,
      next: fallback,
    });
  }
  return fallback;
}
