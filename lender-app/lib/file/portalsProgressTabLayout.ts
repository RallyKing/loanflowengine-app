/**
 * Portals & Progress tab — unified block order / visibility (single DnD canvas).
 * Mirrors Deal Info command-center layout; persists on the deal sheet.
 */
import type {
  ClientPortalSectionId,
  ClientPortalTabLayoutV1,
} from "@/lib/file/clientPortalTabLayout";
import {
  CLIENT_PORTAL_SECTION_IDS,
  DEFAULT_CLIENT_PORTAL_SECTION_ORDER,
  normalizeClientPortalSectionOrder,
} from "@/lib/file/clientPortalTabLayout";

export type PortalsProgressSectionId =
  | "scenariosLenderMatch"
  | "financialMetrics"
  | "actionQueue"
  | "lenderTrack"
  | "internalWorkflow"
  | "contactPortalDefaults"
  | ClientPortalSectionId;

export const PORTALS_PROGRESS_CORE_SECTION_IDS: PortalsProgressSectionId[] = [
  "scenariosLenderMatch",
  "financialMetrics",
  "actionQueue",
  "lenderTrack",
  "internalWorkflow",
  "contactPortalDefaults",
];

export const PORTALS_PROGRESS_SECTION_IDS: PortalsProgressSectionId[] = [
  ...PORTALS_PROGRESS_CORE_SECTION_IDS,
  ...CLIENT_PORTAL_SECTION_IDS,
];

export const DEFAULT_PORTALS_PROGRESS_SECTION_ORDER: PortalsProgressSectionId[] =
  [...PORTALS_PROGRESS_SECTION_IDS];

const ALL_IDS = new Set<PortalsProgressSectionId>(PORTALS_PROGRESS_SECTION_IDS);

const CLIENT_PORTAL_ID_SET = new Set<string>(CLIENT_PORTAL_SECTION_IDS);

export const PORTALS_PROGRESS_SECTION_LABELS: Record<
  PortalsProgressSectionId,
  string
> = {
  scenariosLenderMatch: "Scenarios & Lender Match",
  financialMetrics: "Financial metrics",
  actionQueue: "Action queue",
  lenderTrack: "Lender track",
  internalWorkflow: "Internal workflow",
  contactPortalDefaults: "Contact portal defaults",
  safeDefaults: "Safe defaults",
  linkSecurity: "Link security & access",
  uploadsInbox: "Client uploads inbox",
  communications: "Communications",
};

export type PortalsProgressTabLayoutV1 = {
  v: 1;
  order: PortalsProgressSectionId[];
  hidden: PortalsProgressSectionId[];
};

export function isClientPortalProgressSectionId(
  id: string,
): id is ClientPortalSectionId {
  return CLIENT_PORTAL_ID_SET.has(id);
}

export function defaultPortalsProgressTabLayout(): PortalsProgressTabLayoutV1 {
  return {
    v: 1,
    order: [...DEFAULT_PORTALS_PROGRESS_SECTION_ORDER],
    hidden: [],
  };
}

export function normalizePortalsProgressSectionOrder(
  order: PortalsProgressSectionId[],
): PortalsProgressSectionId[] {
  const seen = new Set<PortalsProgressSectionId>();
  const normalized: PortalsProgressSectionId[] = [];
  for (const id of order) {
    if (!ALL_IDS.has(id) || seen.has(id)) continue;
    seen.add(id);
    normalized.push(id);
  }
  for (const id of DEFAULT_PORTALS_PROGRESS_SECTION_ORDER) {
    if (!seen.has(id)) normalized.push(id);
  }
  return normalized;
}

/** Build unified order from legacy client-portal layout when CC layout absent. */
export function derivePortalsProgressLayoutFromLegacy(
  clientPortalOrder?: ClientPortalSectionId[],
): PortalsProgressTabLayoutV1 {
  const base = defaultPortalsProgressTabLayout();
  const merged: PortalsProgressSectionId[] = [];
  const seen = new Set<PortalsProgressSectionId>();

  const push = (id: PortalsProgressSectionId) => {
    if (!ALL_IDS.has(id) || seen.has(id)) return;
    seen.add(id);
    merged.push(id);
  };

  for (const id of PORTALS_PROGRESS_CORE_SECTION_IDS) {
    push(id);
  }
  const portalOrder =
    clientPortalOrder && clientPortalOrder.length > 0
      ? clientPortalOrder
      : DEFAULT_CLIENT_PORTAL_SECTION_ORDER;
  for (const id of portalOrder) {
    push(id);
  }
  for (const id of DEFAULT_PORTALS_PROGRESS_SECTION_ORDER) {
    push(id);
  }

  return { v: 1, order: merged, hidden: [...base.hidden] };
}

export function parsePortalsProgressTabLayoutFromUnknown(
  raw: unknown,
  legacy?: {
    clientPortalOrder?: ClientPortalSectionId[];
    clientPortalHidden?: ClientPortalSectionId[];
  },
): PortalsProgressTabLayoutV1 {
  let layout: PortalsProgressTabLayoutV1;
  if (!raw || typeof raw !== "object" || (raw as { v?: number }).v !== 1) {
    layout = derivePortalsProgressLayoutFromLegacy(legacy?.clientPortalOrder);
  } else {
    const o = raw as PortalsProgressTabLayoutV1;
    const orderSeen = new Set<PortalsProgressSectionId>();
    const order: PortalsProgressSectionId[] = [];
    for (const x of Array.isArray(o.order) ? o.order : []) {
      if (
        typeof x !== "string" ||
        !ALL_IDS.has(x as PortalsProgressSectionId)
      ) {
        continue;
      }
      const id = x as PortalsProgressSectionId;
      if (orderSeen.has(id)) continue;
      orderSeen.add(id);
      order.push(id);
    }
    for (const id of DEFAULT_PORTALS_PROGRESS_SECTION_ORDER) {
      if (!orderSeen.has(id)) order.push(id);
    }
    const hidden: PortalsProgressSectionId[] = [];
    const hiddenSeen = new Set<PortalsProgressSectionId>();
    for (const x of Array.isArray(o.hidden) ? o.hidden : []) {
      if (
        typeof x !== "string" ||
        !ALL_IDS.has(x as PortalsProgressSectionId)
      ) {
        continue;
      }
      const id = x as PortalsProgressSectionId;
      if (hiddenSeen.has(id)) continue;
      hiddenSeen.add(id);
      hidden.push(id);
    }
    layout = { v: 1, order, hidden };
  }

  if (legacy?.clientPortalHidden) {
    const hidden = new Set(layout.hidden);
    for (const id of legacy.clientPortalHidden) {
      if (isClientPortalProgressSectionId(id)) hidden.add(id);
    }
    layout = { ...layout, hidden: [...hidden] };
  }

  return layout;
}

export function isPortalsProgressSectionVisible(
  layout: PortalsProgressTabLayoutV1,
  sectionId: PortalsProgressSectionId,
): boolean {
  return !layout.hidden.includes(sectionId);
}

export function togglePortalsProgressSectionHidden(
  layout: PortalsProgressTabLayoutV1,
  sectionId: PortalsProgressSectionId,
): PortalsProgressTabLayoutV1 {
  const isHidden = layout.hidden.includes(sectionId);
  return {
    ...layout,
    hidden: isHidden
      ? layout.hidden.filter((x) => x !== sectionId)
      : [...layout.hidden, sectionId],
  };
}

export function resetPortalsProgressTabLayout(): PortalsProgressTabLayoutV1 {
  return defaultPortalsProgressTabLayout();
}

/** Keep legacy client-portal tab order aligned with unified Portals & Progress order. */
export function syncClientPortalLayoutFromPortalsProgress(
  clientPortal: ClientPortalTabLayoutV1,
  pp: PortalsProgressTabLayoutV1,
): ClientPortalTabLayoutV1 {
  const fromPp: ClientPortalSectionId[] = [];
  for (const id of pp.order) {
    if (isClientPortalProgressSectionId(id)) fromPp.push(id);
  }
  const hidden: ClientPortalSectionId[] = [];
  for (const id of pp.hidden) {
    if (isClientPortalProgressSectionId(id)) hidden.push(id);
  }
  return {
    ...normalizeClientPortalSectionOrder(clientPortal, fromPp),
    hidden,
  };
}
