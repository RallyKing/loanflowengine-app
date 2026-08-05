/**
 * Premade portal page sections — page-builder palette for portal defaults.
 * Runtime renders by `sectionId`; availability is filtered by portal type.
 */

import type { PortalDefaultType } from "@/lib/portalDefaults";
import {
  defaultPropsForSection,
  sanitizePortalSectionProps,
  type PortalSectionProps,
} from "@/lib/portalSectionConfig";

export const PORTAL_PAGE_SECTION_IDS = [
  "welcome",
  "status_pipeline_stage",
  "chat",
  "company_primary_contact",
  "outstanding_documents",
  "start_new_loan",
  "deal_summary",
  "document_package",
  /** Partner-style widgets (grid-friendly). */
  "stat_cards",
  "notifications_banner",
  "search_bar",
  "activity_feed",
  "pipeline_cards",
] as const;

/** Desktop grid spans on a 12-column layout. */
export const PORTAL_SECTION_COL_SPANS = [3, 4, 6, 8, 12] as const;
export type PortalSectionColSpan = (typeof PORTAL_SECTION_COL_SPANS)[number];

export type PortalSectionLayout = {
  /** Column span on a 12-col desktop grid (stacks to full width on mobile). */
  colSpan?: PortalSectionColSpan;
  /** Display order within the grid (lower first). */
  order?: number;
};

export type PortalPageSectionId = (typeof PORTAL_PAGE_SECTION_IDS)[number];

export type PortalPageSectionDef = {
  id: PortalPageSectionId;
  label: string;
  description: string;
  /** Portal types that may include this section in the builder palette. */
  portalTypes: readonly PortalDefaultType[];
  /** Stable key used by the runtime renderer switch. */
  rendererKey: PortalPageSectionId;
  defaultProps?: Record<string, string>;
};

export const PORTAL_PAGE_SECTION_REGISTRY: readonly PortalPageSectionDef[] = [
  {
    id: "welcome",
    label: "Welcome",
    description: "Greeting and optional welcome message from the portal default.",
    portalTypes: ["client", "lender", "referrer", "deal_partner"],
    rendererKey: "welcome",
  },
  {
    id: "status_pipeline_stage",
    label: "Status bar",
    description: "Shows the linked file’s current pipeline stage.",
    portalTypes: ["client", "lender", "referrer", "deal_partner"],
    rendererKey: "status_pipeline_stage",
  },
  {
    id: "chat",
    label: "Chat",
    description: "Messaging with the broker team (uses file messaging when available).",
    portalTypes: ["client", "referrer", "deal_partner"],
    rendererKey: "chat",
  },
  {
    id: "company_primary_contact",
    label: "Company primary contact",
    description: "Broker / org contact the recipient can reach.",
    portalTypes: ["client", "lender", "referrer", "deal_partner"],
    rendererKey: "company_primary_contact",
  },
  {
    id: "outstanding_documents",
    label: "Outstanding documents",
    description: "Document requests and vault tasks still needed from the recipient.",
    portalTypes: ["client", "referrer", "deal_partner"],
    rendererKey: "outstanding_documents",
  },
  {
    id: "start_new_loan",
    label: "Start a new loan",
    description: "Call-to-action to begin another loan conversation with your team.",
    portalTypes: ["client", "referrer"],
    rendererKey: "start_new_loan",
  },
  {
    id: "deal_summary",
    label: "Deal summary",
    description: "High-level file summary (name, stage, key labels).",
    portalTypes: ["lender", "referrer", "deal_partner"],
    rendererKey: "deal_summary",
  },
  {
    id: "document_package",
    label: "Document package",
    description: "Lender data-room documents and folders in this delivery.",
    portalTypes: ["lender"],
    rendererKey: "document_package",
  },
  {
    id: "stat_cards",
    label: "Stat cards",
    description: "Row of summary metrics (deals, docs, commissions-style).",
    portalTypes: ["client", "lender", "referrer", "deal_partner"],
    rendererKey: "stat_cards",
  },
  {
    id: "notifications_banner",
    label: "Notifications banner",
    description: "Onboarding / attention callout across the top of the page.",
    portalTypes: ["client", "referrer", "deal_partner"],
    rendererKey: "notifications_banner",
  },
  {
    id: "search_bar",
    label: "Search bar",
    description: "In-page search field for deals or documents (preview / polish).",
    portalTypes: ["client", "lender", "referrer", "deal_partner"],
    rendererKey: "search_bar",
  },
  {
    id: "activity_feed",
    label: "Recent activity",
    description: "Recent submissions / activity list (pairs well in a 2-col row).",
    portalTypes: ["client", "referrer", "deal_partner"],
    rendererKey: "activity_feed",
  },
  {
    id: "pipeline_cards",
    label: "Pipeline cards",
    description: "SLOC / MCA style pipeline summary cards.",
    portalTypes: ["referrer", "deal_partner", "lender"],
    rendererKey: "pipeline_cards",
  },
] as const;

export type PortalPageSectionInstance = {
  /** Stable id for drag-reorder keys (unique within a version). */
  instanceId: string;
  sectionId: PortalPageSectionId;
  enabled?: boolean;
  /** Section-specific configuration (welcome copy, status mode, contact, CTAs…). */
  props?: PortalSectionProps;
  /** Grid placement — defaults to full width (12). */
  layout?: PortalSectionLayout;
};

const REGISTRY_BY_ID = new Map(
  PORTAL_PAGE_SECTION_REGISTRY.map((s) => [s.id, s] as const),
);

export function isPortalPageSectionId(raw: unknown): raw is PortalPageSectionId {
  return (
    typeof raw === "string" &&
    (PORTAL_PAGE_SECTION_IDS as readonly string[]).includes(raw)
  );
}

export function getPortalPageSectionDef(
  id: PortalPageSectionId,
): PortalPageSectionDef | undefined {
  return REGISTRY_BY_ID.get(id);
}

export function sectionsForPortalType(
  portalType: PortalDefaultType,
): PortalPageSectionDef[] {
  return PORTAL_PAGE_SECTION_REGISTRY.filter((s) =>
    s.portalTypes.includes(portalType),
  );
}

export function sectionAllowedForPortalType(
  sectionId: PortalPageSectionId,
  portalType: PortalDefaultType,
): boolean {
  const def = REGISTRY_BY_ID.get(sectionId);
  return def ? def.portalTypes.includes(portalType) : false;
}

function newInstanceId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `sec_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export function defaultColSpanForSection(
  sectionId: PortalPageSectionId,
): PortalSectionColSpan {
  switch (sectionId) {
    case "stat_cards":
    case "notifications_banner":
    case "search_bar":
    case "welcome":
      return 12;
    case "activity_feed":
    case "pipeline_cards":
    case "outstanding_documents":
    case "document_package":
    case "chat":
    case "deal_summary":
      return 6;
    case "company_primary_contact":
    case "status_pipeline_stage":
    case "start_new_loan":
      return 4;
    default:
      return 12;
  }
}

export function makeSectionInstance(
  sectionId: PortalPageSectionId,
  overrides?: Partial<
    Pick<PortalPageSectionInstance, "enabled" | "props" | "layout">
  >,
): PortalPageSectionInstance {
  const colSpan =
    overrides?.layout?.colSpan ?? defaultColSpanForSection(sectionId);
  const props =
    sanitizePortalSectionProps(
      sectionId,
      overrides?.props ?? defaultPropsForSection(sectionId),
    ) ?? defaultPropsForSection(sectionId);
  return {
    instanceId: newInstanceId(),
    sectionId,
    enabled: overrides?.enabled ?? true,
    layout: {
      colSpan,
      order: overrides?.layout?.order,
    },
    props,
  };
}

function sanitizeColSpan(raw: unknown): PortalSectionColSpan | undefined {
  if (
    typeof raw === "number" &&
    (PORTAL_SECTION_COL_SPANS as readonly number[]).includes(raw)
  ) {
    return raw as PortalSectionColSpan;
  }
  return undefined;
}

/** Soft-start composition when creating a new portal default / version. */
export function defaultSectionsForPortalType(
  portalType: PortalDefaultType,
): PortalPageSectionInstance[] {
  const ids: PortalPageSectionId[] = (() => {
    switch (portalType) {
      case "client":
        return [
          "notifications_banner",
          "welcome",
          "search_bar",
          "stat_cards",
          "status_pipeline_stage",
          "outstanding_documents",
          "activity_feed",
          "company_primary_contact",
          "chat",
          "start_new_loan",
        ];
      case "lender":
        return [
          "welcome",
          "search_bar",
          "stat_cards",
          "status_pipeline_stage",
          "deal_summary",
          "document_package",
          "pipeline_cards",
          "company_primary_contact",
        ];
      case "referrer":
        return [
          "notifications_banner",
          "welcome",
          "search_bar",
          "stat_cards",
          "pipeline_cards",
          "activity_feed",
          "deal_summary",
          "outstanding_documents",
          "company_primary_contact",
          "chat",
          "start_new_loan",
        ];
      case "deal_partner":
        return [
          "notifications_banner",
          "welcome",
          "search_bar",
          "stat_cards",
          "pipeline_cards",
          "activity_feed",
          "deal_summary",
          "outstanding_documents",
          "company_primary_contact",
          "chat",
        ];
    }
  })();
  return ids
    .filter((id) => sectionAllowedForPortalType(id, portalType))
    .map((id) => makeSectionInstance(id));
}

export function sanitizePortalPageSections(
  portalType: PortalDefaultType,
  raw: readonly PortalPageSectionInstance[] | undefined,
  max = 24,
): PortalPageSectionInstance[] {
  if (!raw || raw.length === 0) return [];
  const out: PortalPageSectionInstance[] = [];
  const seenInstance = new Set<string>();
  for (const item of raw.slice(0, max)) {
    if (!isPortalPageSectionId(item.sectionId)) continue;
    if (!sectionAllowedForPortalType(item.sectionId, portalType)) continue;
    let instanceId =
      typeof item.instanceId === "string" && item.instanceId.trim()
        ? item.instanceId.trim().slice(0, 64)
        : newInstanceId();
    if (seenInstance.has(instanceId)) {
      instanceId = newInstanceId();
    }
    seenInstance.add(instanceId);
    const props = sanitizePortalSectionProps(item.sectionId, item.props);
    const colSpan =
      sanitizeColSpan(item.layout?.colSpan) ??
      defaultColSpanForSection(item.sectionId);
    const order =
      typeof item.layout?.order === "number" &&
      Number.isFinite(item.layout.order)
        ? Math.max(0, Math.min(999, Math.floor(item.layout.order)))
        : out.length;
    out.push({
      instanceId,
      sectionId: item.sectionId,
      enabled: item.enabled === false ? false : true,
      layout: { colSpan, order },
      ...(props && Object.keys(props).length > 0 ? { props } : {}),
    });
  }
  return out.sort(
    (a, b) =>
      (a.layout?.order ?? 0) - (b.layout?.order ?? 0) ||
      a.instanceId.localeCompare(b.instanceId),
  );
}

export function summarizePortalPageSections(
  sections: readonly PortalPageSectionInstance[] | undefined,
): string {
  const enabled = (sections ?? []).filter((s) => s.enabled !== false);
  if (enabled.length === 0) return "No page sections";
  const labels = enabled.map((s) => {
    const def = REGISTRY_BY_ID.get(s.sectionId);
    return def?.label ?? s.sectionId;
  });
  if (labels.length <= 3) return labels.join(" · ");
  return `${labels.slice(0, 3).join(" · ")} +${labels.length - 3}`;
}
