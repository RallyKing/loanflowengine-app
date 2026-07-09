/** Tab 2 Deal Info section ids (Phase 37.14.C). */
export type DealInfoSectionId =
  | "fileDetails"
  | "licensing"
  | "borrowers"
  | "guarantors"
  | "household"
  | "income"
  | "assets"
  | "reo"
  | "businessDebt";

/** @deprecated Phase 38.9 — all sections are freely reorderable. */
export const PINNED_DEAL_INFO_SECTION_IDS = [
  "fileDetails",
  "licensing",
] as const satisfies readonly DealInfoSectionId[];

export type PinnedDealInfoSectionId =
  (typeof PINNED_DEAL_INFO_SECTION_IDS)[number];

export const DEFAULT_DEAL_INFO_SECTION_ORDER: DealInfoSectionId[] = [
  "fileDetails",
  "licensing",
  "borrowers",
  "guarantors",
  "household",
  "income",
  "assets",
  "reo",
  "businessDebt",
];

const ALL_SECTION_IDS = new Set<DealInfoSectionId>(
  DEFAULT_DEAL_INFO_SECTION_ORDER,
);

export const DEAL_INFO_SECTION_LABELS: Record<DealInfoSectionId, string> = {
  fileDetails: "File details",
  licensing: "Licensing",
  borrowers: "Borrowers",
  guarantors: "Guarantors",
  household: "Household",
  income: "Income",
  assets: "Assets & Liabilities",
  reo: "Schedule of REO",
  businessDebt: "Schedule of Business Debt",
};

export type DealInfoLayoutV1 = {
  v: 1;
  order: DealInfoSectionId[];
  /** Section ids hidden in Tab 2. */
  hidden: DealInfoSectionId[];
};

/** @deprecated Phase 38.9 — pinning removed; always returns false. */
export function isPinnedDealInfoSection(_sectionId: DealInfoSectionId): boolean {
  return false;
}

/** @deprecated Phase 38.9 — all sections are draggable; always returns true. */
export function isDraggableDealInfoSection(
  sectionId: DealInfoSectionId,
): boolean {
  return ALL_SECTION_IDS.has(sectionId);
}

/** Ensures all 9 section ids are present and deduplicated (Phase 38.9). */
export function normalizeDealInfoSectionOrder(
  order: DealInfoSectionId[],
): DealInfoSectionId[] {
  const seen = new Set<DealInfoSectionId>();
  const normalized: DealInfoSectionId[] = [];

  for (const id of order) {
    if (!ALL_SECTION_IDS.has(id) || seen.has(id)) continue;
    seen.add(id);
    normalized.push(id);
  }

  for (const id of DEFAULT_DEAL_INFO_SECTION_ORDER) {
    if (!seen.has(id)) normalized.push(id);
  }

  return normalized;
}

export function defaultDealInfoLayout(): DealInfoLayoutV1 {
  return {
    v: 1,
    order: [...DEFAULT_DEAL_INFO_SECTION_ORDER],
    hidden: [],
  };
}

export function parseDealInfoLayoutFromUnknown(raw: unknown): DealInfoLayoutV1 {
  const base = defaultDealInfoLayout();
  if (!raw || typeof raw !== "object") return base;
  const o = raw as Record<string, unknown>;
  if (o.v !== 1) return base;

  const orderIn = Array.isArray(o.order) ? o.order : [];
  const orderSeen = new Set<DealInfoSectionId>();
  const orderRaw: DealInfoSectionId[] = [];
  for (const x of orderIn) {
    if (typeof x !== "string" || !ALL_SECTION_IDS.has(x as DealInfoSectionId)) {
      continue;
    }
    const id = x as DealInfoSectionId;
    if (orderSeen.has(id)) continue;
    orderSeen.add(id);
    orderRaw.push(id);
  }
  for (const id of DEFAULT_DEAL_INFO_SECTION_ORDER) {
    if (!orderSeen.has(id)) orderRaw.push(id);
  }

  const hiddenIn = Array.isArray(o.hidden) ? o.hidden : [];
  const hidden: DealInfoSectionId[] = [];
  const hiddenSeen = new Set<DealInfoSectionId>();
  for (const x of hiddenIn) {
    if (typeof x !== "string" || !ALL_SECTION_IDS.has(x as DealInfoSectionId)) {
      continue;
    }
    const id = x as DealInfoSectionId;
    if (hiddenSeen.has(id)) continue;
    hiddenSeen.add(id);
    hidden.push(id);
  }

  return {
    v: 1,
    order: normalizeDealInfoSectionOrder(orderRaw),
    hidden,
  };
}

export function isDealInfoSectionVisible(
  layout: DealInfoLayoutV1,
  sectionId: DealInfoSectionId,
): boolean {
  return !layout.hidden.includes(sectionId);
}

export function toggleDealInfoSectionHidden(
  layout: DealInfoLayoutV1,
  sectionId: DealInfoSectionId,
): DealInfoLayoutV1 {
  const isHidden = layout.hidden.includes(sectionId);
  return {
    ...layout,
    hidden: isHidden
      ? layout.hidden.filter((x) => x !== sectionId)
      : [...layout.hidden, sectionId],
  };
}

export function resetDealInfoLayout(): DealInfoLayoutV1 {
  return defaultDealInfoLayout();
}
