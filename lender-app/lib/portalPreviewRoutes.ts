/**
 * Interactive builder preview — maps chrome route keys to page content.
 * Reuses portal section ids; does not invent a second portal runtime.
 */

import {
  PORTAL_NAV_ROUTE_LABELS,
  type PortalNavRouteKey,
} from "@/lib/portalChrome";
import type { PortalPageSectionId } from "@/lib/portalPageSections";

/** Routes that show the composed dashboard sections (builder canvas). */
export const PORTAL_PREVIEW_DASHBOARD_ROUTES: readonly PortalNavRouteKey[] = [
  "dashboard",
] as const;

/**
 * Sections to highlight when navigating to a non-dashboard route in preview.
 * Empty = show a labeled stub panel for that route.
 */
export const PORTAL_PREVIEW_ROUTE_SECTIONS: Partial<
  Record<PortalNavRouteKey, readonly PortalPageSectionId[]>
> = {
  documents: ["outstanding_documents", "document_package", "search_bar"],
  messages: ["chat"],
  deals: ["deal_summary", "pipeline_cards", "stat_cards"],
  commissions: ["stat_cards", "deal_summary"],
  resources: ["company_primary_contact", "search_bar"],
  pipeline: ["pipeline_cards", "status_pipeline_stage", "activity_feed"],
  submit: ["start_new_loan", "deal_summary"],
  leads: ["activity_feed", "pipeline_cards"],
  community: ["activity_feed", "company_primary_contact"],
  ask_ai: ["search_bar", "chat"],
  settings: ["company_primary_contact"],
  profile: ["company_primary_contact", "welcome"],
};

export function isPortalPreviewDashboardRoute(
  routeKey: PortalNavRouteKey | string | undefined,
): boolean {
  return !routeKey || routeKey === "dashboard";
}

export function portalPreviewRouteLabel(
  routeKey: PortalNavRouteKey | string | undefined,
): string {
  if (!routeKey) return PORTAL_NAV_ROUTE_LABELS.dashboard;
  if (routeKey in PORTAL_NAV_ROUTE_LABELS) {
    return PORTAL_NAV_ROUTE_LABELS[routeKey as PortalNavRouteKey];
  }
  return "Page";
}

export function sectionsForPortalPreviewRoute(
  routeKey: PortalNavRouteKey,
  available: readonly { sectionId: PortalPageSectionId; enabled?: boolean }[],
): PortalPageSectionId[] {
  if (isPortalPreviewDashboardRoute(routeKey)) {
    return available
      .filter((s) => s.enabled !== false)
      .map((s) => s.sectionId);
  }
  const preferred = PORTAL_PREVIEW_ROUTE_SECTIONS[routeKey] ?? [];
  const enabledIds = new Set(
    available.filter((s) => s.enabled !== false).map((s) => s.sectionId),
  );
  return preferred.filter((id) => enabledIds.has(id));
}

/** In-page CTA → route for interactive preview. */
export function portalPreviewCtaRoute(
  sectionId: PortalPageSectionId,
): PortalNavRouteKey | null {
  switch (sectionId) {
    case "outstanding_documents":
    case "document_package":
      return "documents";
    case "chat":
      return "messages";
    case "start_new_loan":
      return "submit";
    case "deal_summary":
    case "pipeline_cards":
      return "deals";
    case "activity_feed":
      return "pipeline";
    case "company_primary_contact":
      return "profile";
    case "notifications_banner":
      return "documents";
    case "stat_cards":
      return "dashboard";
    default:
      return null;
  }
}
