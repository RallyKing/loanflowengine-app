"use client";

import { parseOrganizationId } from "@/lib/orgIdValidation";
import { setStoredActiveOrganizationId } from "@/lib/activeOrganizationId";

/**
 * Production-safe recovery: if the cookie session org disagrees with a **malformed**
 * active org in localStorage, clear storage (storage self-heals on read too; this
 * helps after upgrades when viewer already hydrated).
 */
export function reconcileActiveOrgWithSession(
  viewer: { organizationId?: string } | null,
): void {
  if (typeof window === "undefined") return;
  try {
    const raw = window.localStorage.getItem("lender.activeOrganizationId");
    if (!raw?.trim()) return;
    if (!parseOrganizationId(raw)) {
      setStoredActiveOrganizationId(null);
      return;
    }
    const fromViewer = viewer?.organizationId?.trim();
    if (!fromViewer) return;
    const v = parseOrganizationId(fromViewer);
    const stored = parseOrganizationId(raw);
    if (v && stored && v !== stored) {
      setStoredActiveOrganizationId(v);
    }
  } catch {
    /* private mode */
  }
}
