/** Tab 5 Portals section ids (Phase 38.10; renamed Phase 53.6). */
export type ClientPortalSectionId =
  | "safeDefaults"
  | "linkSecurity"
  | "uploadsInbox"
  | "communications";

export const CLIENT_PORTAL_SECTION_IDS: ClientPortalSectionId[] = [
  "safeDefaults",
  "linkSecurity",
  "uploadsInbox",
  "communications",
];

export const DEFAULT_CLIENT_PORTAL_SECTION_ORDER: ClientPortalSectionId[] = [
  ...CLIENT_PORTAL_SECTION_IDS,
];

const ALL_SECTION_IDS = new Set<ClientPortalSectionId>(CLIENT_PORTAL_SECTION_IDS);

export const CLIENT_PORTAL_SECTION_LABELS: Record<
  ClientPortalSectionId,
  string
> = {
  safeDefaults: "Safe defaults",
  linkSecurity: "Link security & access",
  uploadsInbox: "Client uploads inbox",
  communications: "Communications",
};

export type ClientPortalTabLayoutV1 = {
  v: 1;
  order: ClientPortalSectionId[];
  hidden: ClientPortalSectionId[];
};

function normalizeOrderArray(
  order: ClientPortalSectionId[],
): ClientPortalSectionId[] {
  const seen = new Set<ClientPortalSectionId>();
  const normalized: ClientPortalSectionId[] = [];
  for (const id of order) {
    if (!ALL_SECTION_IDS.has(id) || seen.has(id)) continue;
    seen.add(id);
    normalized.push(id);
  }
  for (const id of DEFAULT_CLIENT_PORTAL_SECTION_ORDER) {
    if (!seen.has(id)) normalized.push(id);
  }
  return normalized;
}

export function defaultClientPortalTabLayout(): ClientPortalTabLayoutV1 {
  return {
    v: 1,
    order: [...DEFAULT_CLIENT_PORTAL_SECTION_ORDER],
    hidden: [],
  };
}

export function parseClientPortalTabLayoutFromUnknown(
  raw: unknown,
): ClientPortalTabLayoutV1 {
  const base = defaultClientPortalTabLayout();
  if (!raw || typeof raw !== "object") return base;
  const o = raw as Record<string, unknown>;
  if (o.v !== 1) return base;

  const orderIn = Array.isArray(o.order) ? o.order : [];
  const orderSeen = new Set<ClientPortalSectionId>();
  const order: ClientPortalSectionId[] = [];
  for (const x of orderIn) {
    if (
      typeof x !== "string" ||
      !ALL_SECTION_IDS.has(x as ClientPortalSectionId)
    ) {
      continue;
    }
    const id = x as ClientPortalSectionId;
    if (orderSeen.has(id)) continue;
    orderSeen.add(id);
    order.push(id);
  }
  for (const id of DEFAULT_CLIENT_PORTAL_SECTION_ORDER) {
    if (!orderSeen.has(id)) order.push(id);
  }

  const hiddenIn = Array.isArray(o.hidden) ? o.hidden : [];
  const hidden: ClientPortalSectionId[] = [];
  const hiddenSeen = new Set<ClientPortalSectionId>();
  for (const x of hiddenIn) {
    if (
      typeof x !== "string" ||
      !ALL_SECTION_IDS.has(x as ClientPortalSectionId)
    ) {
      continue;
    }
    const id = x as ClientPortalSectionId;
    if (hiddenSeen.has(id)) continue;
    hiddenSeen.add(id);
    hidden.push(id);
  }

  return { v: 1, order, hidden };
}

export function normalizeClientPortalSectionOrder(
  layout: ClientPortalTabLayoutV1,
  newOrder: ClientPortalSectionId[],
): ClientPortalTabLayoutV1 {
  return {
    ...layout,
    order: normalizeOrderArray(newOrder),
  };
}

export function isClientPortalSectionVisible(
  layout: ClientPortalTabLayoutV1,
  sectionId: ClientPortalSectionId,
): boolean {
  return !layout.hidden.includes(sectionId);
}

export function toggleClientPortalSectionHidden(
  layout: ClientPortalTabLayoutV1,
  sectionId: ClientPortalSectionId,
): ClientPortalTabLayoutV1 {
  const isHidden = layout.hidden.includes(sectionId);
  return {
    ...layout,
    hidden: isHidden
      ? layout.hidden.filter((x) => x !== sectionId)
      : [...layout.hidden, sectionId],
  };
}

export function resetClientPortalTabLayout(): ClientPortalTabLayoutV1 {
  return defaultClientPortalTabLayout();
}
