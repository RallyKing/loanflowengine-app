/** Tab 1 File Overview section ids (Phase 37.15). */
export type OverviewSectionId =
  | "fileInsights"
  | "notes"
  | "contacts"
  | "tasks"
  | "lenders";

/** Migrated to Portals / Settings in Phase 53.6 — stripped from persisted layouts. */
const REMOVED_OVERVIEW_SECTION_IDS = new Set<string>([
  "communications",
  "activity",
]);

export const OVERVIEW_SECTION_IDS: OverviewSectionId[] = [
  "fileInsights",
  "notes",
  "contacts",
  "tasks",
  "lenders",
];

/** Default render order for Overview sections (Phase 38.13). */
export const DEFAULT_OVERVIEW_SECTION_ORDER: OverviewSectionId[] = [
  ...OVERVIEW_SECTION_IDS,
];

/** New section ids prepended to legacy layouts when absent (Phase 38.13). */
const OVERVIEW_SECTIONS_INTRODUCED_V38_13: OverviewSectionId[] = ["fileInsights"];

/** @deprecated Phase 38.7 — all sections use the same collapse default; kept for callers. */
export const SECONDARY_OVERVIEW_SECTION_IDS = [
  "notes",
  "contacts",
  "tasks",
] as const satisfies readonly OverviewSectionId[];

export type SecondaryOverviewSectionId =
  (typeof SECONDARY_OVERVIEW_SECTION_IDS)[number];

/** @deprecated Phase 38.7 — lenders no longer pinned expanded; kept for callers. */
export const PINNED_OVERVIEW_SECTION_IDS = ["lenders"] as const satisfies readonly OverviewSectionId[];

export type PinnedOverviewSectionId =
  (typeof PINNED_OVERVIEW_SECTION_IDS)[number];

const ALL_SECTION_IDS = new Set<OverviewSectionId>(OVERVIEW_SECTION_IDS);
const PINNED_SET = new Set<OverviewSectionId>(PINNED_OVERVIEW_SECTION_IDS);

export const OVERVIEW_SECTION_LABELS: Record<OverviewSectionId, string> = {
  fileInsights: "File insights",
  notes: "Notes",
  contacts: "Associated contacts",
  tasks: "Tasks",
  lenders: "Lenders",
};

export type OverviewTabLayoutV1 = {
  v: 1;
  /** Section render order on Overview. */
  order: OverviewSectionId[];
  /** `true` = expanded; omitted / `false` = collapsed. */
  expanded: Partial<Record<OverviewSectionId, boolean>>;
  /** Section ids hidden on Overview (empty = all visible). */
  hidden: OverviewSectionId[];
};

export function isPinnedOverviewSection(
  sectionId: OverviewSectionId,
): boolean {
  return PINNED_SET.has(sectionId);
}

export function isSecondaryOverviewSection(
  sectionId: OverviewSectionId,
): boolean {
  return !isPinnedOverviewSection(sectionId);
}

/** Phase 38.7 — zero-expanded default for every section. */
function defaultExpandedForSection(_sectionId: OverviewSectionId): boolean {
  return false;
}

/** Prepends newly introduced section ids without reordering existing user prefs. */
function backfillOverviewSectionOrder(
  order: OverviewSectionId[],
): OverviewSectionId[] {
  const missingIntroduced = OVERVIEW_SECTIONS_INTRODUCED_V38_13.filter(
    (id) => !order.includes(id),
  );
  if (missingIntroduced.length === 0) return order;
  return [...missingIntroduced, ...order];
}

function normalizeOrderArray(order: OverviewSectionId[]): OverviewSectionId[] {
  const seen = new Set<OverviewSectionId>();
  const normalized: OverviewSectionId[] = [];
  for (const id of order) {
    if (!ALL_SECTION_IDS.has(id) || seen.has(id)) continue;
    seen.add(id);
    normalized.push(id);
  }
  for (const id of DEFAULT_OVERVIEW_SECTION_ORDER) {
    if (!seen.has(id)) normalized.push(id);
  }
  return normalized;
}

export function defaultOverviewTabLayout(): OverviewTabLayoutV1 {
  return {
    v: 1,
    order: [...DEFAULT_OVERVIEW_SECTION_ORDER],
    expanded: {},
    hidden: [],
  };
}

export function parseOverviewTabLayoutFromUnknown(
  raw: unknown,
): OverviewTabLayoutV1 {
  const base = defaultOverviewTabLayout();
  if (!raw || typeof raw !== "object") return base;
  const o = raw as Record<string, unknown>;
  if (o.v !== 1) return base;

  const orderIn = Array.isArray(o.order) ? o.order : [];
  const orderSeen = new Set<OverviewSectionId>();
  const order: OverviewSectionId[] = [];
  for (const x of orderIn) {
    if (typeof x !== "string") continue;
    if (REMOVED_OVERVIEW_SECTION_IDS.has(x)) continue;
    if (!ALL_SECTION_IDS.has(x as OverviewSectionId)) {
      continue;
    }
    const id = x as OverviewSectionId;
    if (orderSeen.has(id)) continue;
    orderSeen.add(id);
    order.push(id);
  }
  for (const id of DEFAULT_OVERVIEW_SECTION_ORDER) {
    if (!orderSeen.has(id)) order.push(id);
  }
  const orderNormalized = normalizeOrderArray(
    backfillOverviewSectionOrder(order),
  );

  const expanded: Partial<Record<OverviewSectionId, boolean>> = {};
  if (
    o.expanded &&
    typeof o.expanded === "object" &&
    !Array.isArray(o.expanded)
  ) {
    for (const [k, v] of Object.entries(o.expanded as Record<string, unknown>)) {
      if (REMOVED_OVERVIEW_SECTION_IDS.has(k)) continue;
      if (!ALL_SECTION_IDS.has(k as OverviewSectionId)) continue;
      if (typeof v === "boolean") {
        expanded[k as OverviewSectionId] = v;
      }
    }
  }

  const hiddenIn = Array.isArray(o.hidden) ? o.hidden : [];
  const hidden: OverviewSectionId[] = [];
  const hiddenSeen = new Set<OverviewSectionId>();
  for (const x of hiddenIn) {
    if (typeof x !== "string") continue;
    if (REMOVED_OVERVIEW_SECTION_IDS.has(x)) continue;
    if (!ALL_SECTION_IDS.has(x as OverviewSectionId)) {
      continue;
    }
    const id = x as OverviewSectionId;
    if (hiddenSeen.has(id)) continue;
    hiddenSeen.add(id);
    hidden.push(id);
  }

  return { v: 1, order: orderNormalized, expanded, hidden };
}

/** Merge a reordered list with the layout — dedupes and appends missing ids. */
export function normalizeOverviewSectionOrder(
  layout: OverviewTabLayoutV1,
  newOrder: OverviewSectionId[],
): OverviewTabLayoutV1 {
  return {
    ...layout,
    order: normalizeOrderArray(newOrder),
  };
}

export function isOverviewSectionVisible(
  layout: OverviewTabLayoutV1,
  sectionId: OverviewSectionId,
): boolean {
  return !layout.hidden.includes(sectionId);
}

export function toggleOverviewSectionHidden(
  layout: OverviewTabLayoutV1,
  sectionId: OverviewSectionId,
): OverviewTabLayoutV1 {
  const isHidden = layout.hidden.includes(sectionId);
  return {
    ...layout,
    hidden: isHidden
      ? layout.hidden.filter((x) => x !== sectionId)
      : [...layout.hidden, sectionId],
  };
}

export function resetOverviewTabLayout(): OverviewTabLayoutV1 {
  return defaultOverviewTabLayout();
}

export function isOverviewSectionExpanded(
  layout: OverviewTabLayoutV1,
  sectionId: OverviewSectionId,
): boolean {
  const stored = layout.expanded[sectionId];
  if (typeof stored === "boolean") return stored;
  return defaultExpandedForSection(sectionId);
}

export function setOverviewSectionExpanded(
  layout: OverviewTabLayoutV1,
  sectionId: OverviewSectionId,
  open: boolean,
): OverviewTabLayoutV1 {
  const defaultOpen = defaultExpandedForSection(sectionId);
  if (open === defaultOpen) {
    const { [sectionId]: _removed, ...rest } = layout.expanded;
    return { ...layout, expanded: rest };
  }
  return {
    ...layout,
    expanded: { ...layout.expanded, [sectionId]: open },
  };
}

/** Collapse every visible section (including lenders). */
export function collapseAllOverviewSections(
  layout: OverviewTabLayoutV1,
): OverviewTabLayoutV1 {
  let next = layout;
  for (const id of OVERVIEW_SECTION_IDS) {
    next = setOverviewSectionExpanded(next, id, false);
  }
  return next;
}

/** Expand every section including pinned. */
export function expandAllOverviewSections(
  layout: OverviewTabLayoutV1,
): OverviewTabLayoutV1 {
  let next = layout;
  for (const id of OVERVIEW_SECTION_IDS) {
    next = setOverviewSectionExpanded(next, id, true);
  }
  return next;
}

export function areAllSecondaryOverviewSectionsExpanded(
  layout: OverviewTabLayoutV1,
): boolean {
  return SECONDARY_OVERVIEW_SECTION_IDS.every((id) =>
    isOverviewSectionExpanded(layout, id),
  );
}
