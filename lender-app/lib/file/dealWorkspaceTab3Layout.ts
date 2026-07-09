import type { DealTabId } from "@/lib/file/dealTabGroups";

/** Tab 3 Sub-Tab A sections with live layout toggles (Phase 37.3.F.5+). */
export type DealWorkspaceTab3SectionId =
  | "hardmoney"
  | "commercial"
  | "fees"
  | "feesSplits"
  | "scenariomatch";

export const DEFAULT_DEAL_WORKSPACE_TAB3_SECTION_ORDER: DealWorkspaceTab3SectionId[] =
  ["hardmoney", "commercial", "scenariomatch", "feesSplits", "fees"];

const ALL_SECTION_IDS = new Set<DealWorkspaceTab3SectionId>(
  DEFAULT_DEAL_WORKSPACE_TAB3_SECTION_ORDER,
);

export const DEAL_WORKSPACE_TAB3_SECTION_LABELS: Record<
  DealWorkspaceTab3SectionId,
  string
> = {
  hardmoney: "Hard Money / Rehab Budgets",
  commercial: "Commercial / DSCR Math",
  fees: "Fees & Closing",
  feesSplits: "Fees & splits",
  scenariomatch: "Scenarios & Lender Match",
};

export type DealWorkspaceTab3LayoutV1 = {
  v: 1;
  /** Section render order in Sub-Tab A. */
  order: DealWorkspaceTab3SectionId[];
  /** Section ids hidden in Sub-Tab A (empty = all visible). */
  hidden: DealWorkspaceTab3SectionId[];
};

export function defaultDealWorkspaceTab3Layout(): DealWorkspaceTab3LayoutV1 {
  return {
    v: 1,
    order: [...DEFAULT_DEAL_WORKSPACE_TAB3_SECTION_ORDER],
    hidden: [],
  };
}

export function parseDealWorkspaceTab3LayoutFromUnknown(
  raw: unknown,
): DealWorkspaceTab3LayoutV1 {
  const base = defaultDealWorkspaceTab3Layout();
  if (!raw || typeof raw !== "object") return base;
  const o = raw as Record<string, unknown>;
  if (o.v !== 1) return base;

  const orderIn = Array.isArray(o.order) ? o.order : [];
  const orderSeen = new Set<DealWorkspaceTab3SectionId>();
  const order: DealWorkspaceTab3SectionId[] = [];
  for (const x of orderIn) {
    if (
      typeof x !== "string" ||
      !ALL_SECTION_IDS.has(x as DealWorkspaceTab3SectionId)
    ) {
      continue;
    }
    const id = x as DealWorkspaceTab3SectionId;
    if (orderSeen.has(id)) continue;
    orderSeen.add(id);
    order.push(id);
  }
  for (const id of DEFAULT_DEAL_WORKSPACE_TAB3_SECTION_ORDER) {
    if (!orderSeen.has(id)) order.push(id);
  }

  const hiddenIn = Array.isArray(o.hidden) ? o.hidden : [];
  const hidden: DealWorkspaceTab3SectionId[] = [];
  const hiddenSeen = new Set<DealWorkspaceTab3SectionId>();
  for (const x of hiddenIn) {
    if (
      typeof x !== "string" ||
      !ALL_SECTION_IDS.has(x as DealWorkspaceTab3SectionId)
    ) {
      continue;
    }
    const id = x as DealWorkspaceTab3SectionId;
    if (hiddenSeen.has(id)) continue;
    hiddenSeen.add(id);
    hidden.push(id);
  }

  return { v: 1, order, hidden };
}

export function isDealWorkspaceTab3SectionVisible(
  layout: DealWorkspaceTab3LayoutV1,
  sectionId: DealWorkspaceTab3SectionId,
): boolean {
  return !layout.hidden.includes(sectionId);
}

export function toggleDealWorkspaceTab3SectionHidden(
  layout: DealWorkspaceTab3LayoutV1,
  sectionId: DealWorkspaceTab3SectionId,
): DealWorkspaceTab3LayoutV1 {
  const isHidden = layout.hidden.includes(sectionId);
  return {
    ...layout,
    hidden: isHidden
      ? layout.hidden.filter((x) => x !== sectionId)
      : [...layout.hidden, sectionId],
  };
}

export function resetDealWorkspaceTab3Layout(): DealWorkspaceTab3LayoutV1 {
  return defaultDealWorkspaceTab3Layout();
}

/** Maps Sub-Tab A layout section id to legacy deal tab id (same string set today). */
export function dealTabIdForTab3Section(
  sectionId: DealWorkspaceTab3SectionId,
): DealTabId | null {
  if (sectionId === "scenariomatch") return "scenario";
  if (sectionId === "feesSplits") return null;
  return sectionId;
}
