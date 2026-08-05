/**
 * Org-scoped portal default templates (Settings → Portal defaults).
 * Assigned on contacts; surfaced in pipeline Portals & Progress via contactFileLinks.
 * Page composition lives in `config.sections` (promoted from versions).
 */

import { DEFAULT_CONTACT_ROLE_IDS } from "@/lib/contact/contactRoles";
import {
  defaultPortalChrome,
  type PortalChromeConfig,
} from "@/lib/portalChrome";
import {
  defaultSectionsForPortalType,
  summarizePortalPageSections,
  type PortalPageSectionInstance,
} from "@/lib/portalPageSections";

export const PORTAL_DEFAULT_TYPES = [
  "client",
  "lender",
  "referrer",
  "deal_partner",
] as const;

export type PortalDefaultType = (typeof PORTAL_DEFAULT_TYPES)[number];

export const PORTAL_DEFAULT_TYPE_LABELS: Record<PortalDefaultType, string> = {
  client: "Client",
  lender: "Lender",
  referrer: "Referrer",
  deal_partner: "Deal partner",
};

export type PortalDefaultClientPermission = "view" | "view_upload";
export type PortalDefaultLinkExpires = "1h" | "24h" | "7d" | "30d";
export type PortalDefaultGrantExpires = "never" | "30d" | "90d";
export type PortalDefaultLenderPermission = "view_only" | "downloadable";
export type PortalDefaultStatusVisibility = "basic" | "detailed";

export type PortalDefaultChecklistItem = {
  title: string;
  description?: string;
  folderName?: string;
};

/** Configuration payload stored on `portalDefaults.config`. */
export type PortalDefaultConfig = {
  welcomeMessage?: string;
  /** Client portal invite defaults */
  permission?: PortalDefaultClientPermission;
  linkExpiresPreset?: PortalDefaultLinkExpires;
  grantExpiresPreset?: PortalDefaultGrantExpires;
  /** Built-in checklist id from `PORTAL_REQUEST_CHECKLISTS`. */
  checklistId?: string;
  /** Custom checklist items (used when checklistId is unset). */
  requestChecklist?: PortalDefaultChecklistItem[];
  /** Lender delivery defaults */
  lenderPermission?: PortalDefaultLenderPermission;
  includeAllDocumentsByDefault?: boolean;
  /** Referrer / deal partner (thinner) */
  showDealSummary?: boolean;
  allowMessaging?: boolean;
  statusVisibility?: PortalDefaultStatusVisibility;
  /**
   * Composed portal page sections (array order = display order).
   * Promoted from an active `portalDefaultVersions` row when published.
   */
  sections?: PortalPageSectionInstance[];
  /** Sidebar / top header / grid chrome — promoted with sections. */
  chrome?: PortalChromeConfig;
};

export function isPortalDefaultType(raw: unknown): raw is PortalDefaultType {
  return (
    typeof raw === "string" &&
    (PORTAL_DEFAULT_TYPES as readonly string[]).includes(raw)
  );
}

/**
 * Map CRM / file-link role ids to the portal default type they typically use.
 */
export function portalDefaultTypeForContactRole(
  roleId: string | undefined | null,
): PortalDefaultType | null {
  const id = roleId?.trim();
  if (!id) return null;
  switch (id) {
    case DEFAULT_CONTACT_ROLE_IDS.client:
    case DEFAULT_CONTACT_ROLE_IDS.borrower:
    case DEFAULT_CONTACT_ROLE_IDS.guarantor:
      return "client";
    case DEFAULT_CONTACT_ROLE_IDS.lender:
    case DEFAULT_CONTACT_ROLE_IDS.lenderRep:
      return "lender";
    case DEFAULT_CONTACT_ROLE_IDS.referralPartner:
      return "referrer";
    case DEFAULT_CONTACT_ROLE_IDS.dealPartner:
      return "deal_partner";
    default:
      return null;
  }
}

/** Soft defaults when creating a new template of each type. */
export function emptyPortalDefaultConfig(
  portalType: PortalDefaultType,
): PortalDefaultConfig {
  const sections = defaultSectionsForPortalType(portalType);
  const chrome = defaultPortalChrome(portalType);
  switch (portalType) {
    case "client":
      return {
        permission: "view_upload",
        linkExpiresPreset: "24h",
        grantExpiresPreset: "never",
        welcomeMessage: "",
        checklistId: "standard-loan-docs",
        sections,
        chrome,
      };
    case "lender":
      return {
        lenderPermission: "view_only",
        includeAllDocumentsByDefault: false,
        welcomeMessage: "",
        sections,
        chrome,
      };
    case "referrer":
      return {
        showDealSummary: true,
        allowMessaging: true,
        statusVisibility: "basic",
        welcomeMessage: "",
        sections,
        chrome,
      };
    case "deal_partner":
      return {
        showDealSummary: true,
        allowMessaging: true,
        statusVisibility: "detailed",
        welcomeMessage: "",
        sections,
        chrome,
      };
  }
}

export function summarizePortalDefaultConfig(
  portalType: PortalDefaultType,
  config: PortalDefaultConfig | undefined,
): string {
  const c = config ?? {};
  const sectionSummary = summarizePortalPageSections(c.sections);
  const hasSections = (c.sections?.length ?? 0) > 0;
  switch (portalType) {
    case "client": {
      const parts: string[] = [];
      if (hasSections) parts.push(sectionSummary);
      if (c.permission === "view") parts.push("View only");
      else if (c.permission === "view_upload") parts.push("View + upload");
      if (c.linkExpiresPreset) parts.push(`Link ${c.linkExpiresPreset}`);
      if (c.checklistId) parts.push(`Checklist: ${c.checklistId}`);
      else if (c.requestChecklist?.length)
        parts.push(`${c.requestChecklist.length} custom requests`);
      return parts.join(" · ") || "Client portal defaults";
    }
    case "lender": {
      const parts: string[] = [];
      if (hasSections) parts.push(sectionSummary);
      if (c.lenderPermission === "downloadable") parts.push("Downloadable");
      else if (c.lenderPermission === "view_only") parts.push("View only");
      if (c.includeAllDocumentsByDefault) parts.push("All docs by default");
      return parts.join(" · ") || "Lender delivery defaults";
    }
    case "referrer":
    case "deal_partner": {
      const parts: string[] = [];
      if (hasSections) parts.push(sectionSummary);
      if (c.showDealSummary) parts.push("Deal summary");
      if (c.allowMessaging) parts.push("Messaging");
      if (c.statusVisibility) parts.push(`Status: ${c.statusVisibility}`);
      return parts.join(" · ") || `${PORTAL_DEFAULT_TYPE_LABELS[portalType]} defaults`;
    }
  }
}
