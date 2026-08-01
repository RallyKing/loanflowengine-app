import type { ReactNode } from "react";
import type {
  DealInfoLayoutV1,
  DealInfoSectionId,
} from "@/lib/file/dealInfoTabLayout";
import { normalizeDealInfoSectionOrder } from "@/lib/file/dealInfoTabLayout";
import type {
  OverviewSectionId,
  OverviewTabLayoutV1,
} from "@/lib/file/overviewTabLayout";
import { normalizeOverviewSectionOrder } from "@/lib/file/overviewTabLayout";

export type CommandCenterSectionRenderer = (
  dragHandle: ReactNode,
) => ReactNode;

/** Unified Deal Info command-center block ids (single DnD canvas). */
export type DealInfoCommandCenterSectionId =
  | "fileDetails"
  | "borrowers"
  | "contacts"
  | "notes"
  | "tasks"
  | "lenders"
  | "feesSplits"
  | "fees"
  | "investorExperience";

export const DEAL_INFO_COMMAND_CENTER_SECTION_IDS: DealInfoCommandCenterSectionId[] =
  [
    "fileDetails",
    "borrowers",
    "contacts",
    "notes",
    "tasks",
    "lenders",
    "feesSplits",
    "fees",
    "investorExperience",
  ];

export const DEAL_INFO_COMMAND_CENTER_SECTION_LABELS: Record<
  DealInfoCommandCenterSectionId,
  string
> = {
  fileDetails: "File details",
  borrowers: "Borrowers & guarantors",
  contacts: "Associated contacts",
  notes: "Notes",
  tasks: "Tasks",
  lenders: "Lenders",
  feesSplits: "Fees & splits",
  fees: "Fees & closing",
  investorExperience: "Investor experience",
};

export const DEFAULT_DEAL_INFO_COMMAND_CENTER_ORDER: DealInfoCommandCenterSectionId[] =
  [
    "fileDetails",
    "borrowers",
    "contacts",
    "notes",
    "tasks",
    "lenders",
    "feesSplits",
    "fees",
  ];

const ALL_IDS = new Set<DealInfoCommandCenterSectionId>(
  DEAL_INFO_COMMAND_CENTER_SECTION_IDS,
);

export type DealInfoCommandCenterLayoutV1 = {
  v: 1;
  order: DealInfoCommandCenterSectionId[];
  hidden: DealInfoCommandCenterSectionId[];
};

export function defaultDealInfoCommandCenterLayout(): DealInfoCommandCenterLayoutV1 {
  return {
    v: 1,
    order: [...DEFAULT_DEAL_INFO_COMMAND_CENTER_ORDER],
    hidden: [],
  };
}

/** Build unified order from legacy dealInfo + overview layouts when CC layout absent. */
export function deriveCommandCenterLayoutFromLegacy(
  dealInfoOrder: DealInfoSectionId[],
  overviewOrder: OverviewSectionId[],
): DealInfoCommandCenterLayoutV1 {
  const base = defaultDealInfoCommandCenterLayout();
  const merged: DealInfoCommandCenterSectionId[] = [];
  const seen = new Set<DealInfoCommandCenterSectionId>();

  const push = (id: DealInfoCommandCenterSectionId) => {
    if (!ALL_IDS.has(id) || seen.has(id)) return;
    seen.add(id);
    merged.push(id);
  };

  for (const id of dealInfoOrder) {
    if (id === "guarantors") continue;
    if (id === "borrowers" || id === "fileDetails") push(id);
  }
  for (const id of overviewOrder) {
    if (id === "fileInsights") continue;
    if (
      id === "contacts" ||
      id === "notes" ||
      id === "tasks" ||
      id === "lenders"
    ) {
      push(id);
    }
  }
  for (const id of DEFAULT_DEAL_INFO_COMMAND_CENTER_ORDER) {
    push(id);
  }

  return { v: 1, order: merged, hidden: [...base.hidden] };
}

export function parseDealInfoCommandCenterLayoutFromUnknown(
  raw: unknown,
  legacy?: {
    dealInfoOrder?: DealInfoSectionId[];
    overviewOrder?: OverviewSectionId[];
    dealInfoHidden?: DealInfoSectionId[];
    overviewHidden?: OverviewSectionId[];
  },
): DealInfoCommandCenterLayoutV1 {
  let layout: DealInfoCommandCenterLayoutV1;
  if (!raw || typeof raw !== "object" || (raw as { v?: number }).v !== 1) {
    layout = deriveCommandCenterLayoutFromLegacy(
      legacy?.dealInfoOrder ?? [],
      legacy?.overviewOrder ?? [],
    );
  } else {
    const o = raw as DealInfoCommandCenterLayoutV1;
    const orderSeen = new Set<DealInfoCommandCenterSectionId>();
    const order: DealInfoCommandCenterSectionId[] = [];
    for (const x of Array.isArray(o.order) ? o.order : []) {
      if (typeof x !== "string" || !ALL_IDS.has(x as DealInfoCommandCenterSectionId)) {
        continue;
      }
      const id = x as DealInfoCommandCenterSectionId;
      if (orderSeen.has(id)) continue;
      orderSeen.add(id);
      order.push(id);
    }
    for (const id of DEFAULT_DEAL_INFO_COMMAND_CENTER_ORDER) {
      if (!orderSeen.has(id)) order.push(id);
    }
    const hidden: DealInfoCommandCenterSectionId[] = [];
    const hiddenSeen = new Set<DealInfoCommandCenterSectionId>();
    for (const x of Array.isArray(o.hidden) ? o.hidden : []) {
      if (typeof x !== "string" || !ALL_IDS.has(x as DealInfoCommandCenterSectionId)) {
        continue;
      }
      const id = x as DealInfoCommandCenterSectionId;
      if (hiddenSeen.has(id)) continue;
      hiddenSeen.add(id);
      hidden.push(id);
    }
    layout = { v: 1, order, hidden };
  }

  if (legacy) {
    const hidden = new Set(layout.hidden);
    for (const id of legacy.dealInfoHidden ?? []) {
      if (id === "fileDetails") hidden.add("fileDetails");
      if (id === "borrowers" || id === "guarantors") hidden.add("borrowers");
    }
    for (const id of legacy.overviewHidden ?? []) {
      if (
        id === "contacts" ||
        id === "notes" ||
        id === "tasks" ||
        id === "lenders"
      ) {
        hidden.add(id);
      }
    }
    layout = { ...layout, hidden: [...hidden] };
  }

  return layout;
}

export function isCommandCenterSectionVisible(
  layout: DealInfoCommandCenterLayoutV1,
  sectionId: DealInfoCommandCenterSectionId,
): boolean {
  return !layout.hidden.includes(sectionId);
}

export function toggleCommandCenterSectionHidden(
  layout: DealInfoCommandCenterLayoutV1,
  sectionId: DealInfoCommandCenterSectionId,
): DealInfoCommandCenterLayoutV1 {
  const isHidden = layout.hidden.includes(sectionId);
  return {
    ...layout,
    hidden: isHidden
      ? layout.hidden.filter((x) => x !== sectionId)
      : [...layout.hidden, sectionId],
  };
}

export function resetDealInfoCommandCenterLayout(): DealInfoCommandCenterLayoutV1 {
  return defaultDealInfoCommandCenterLayout();
}

export function normalizeCommandCenterSectionOrder(
  order: DealInfoCommandCenterSectionId[],
): DealInfoCommandCenterSectionId[] {
  const seen = new Set<DealInfoCommandCenterSectionId>();
  const normalized: DealInfoCommandCenterSectionId[] = [];
  for (const id of order) {
    if (!ALL_IDS.has(id) || seen.has(id)) continue;
    seen.add(id);
    normalized.push(id);
  }
  for (const id of DEFAULT_DEAL_INFO_COMMAND_CENTER_ORDER) {
    if (!seen.has(id)) normalized.push(id);
  }
  return normalized;
}

/** Map command-center visibility toggles onto legacy layout hidden arrays. */
export function legacyHiddenFromCommandCenter(
  layout: DealInfoCommandCenterLayoutV1,
): {
  dealInfoHidden: DealInfoSectionId[];
  overviewHidden: OverviewSectionId[];
} {
  const dealInfoHidden: DealInfoSectionId[] = [];
  const overviewHidden: OverviewSectionId[] = [];
  if (!isCommandCenterSectionVisible(layout, "fileDetails")) {
    dealInfoHidden.push("fileDetails");
  }
  if (!isCommandCenterSectionVisible(layout, "borrowers")) {
    dealInfoHidden.push("borrowers", "guarantors");
  }
  if (!isCommandCenterSectionVisible(layout, "contacts")) {
    overviewHidden.push("contacts");
  }
  if (!isCommandCenterSectionVisible(layout, "notes")) {
    overviewHidden.push("notes");
  }
  if (!isCommandCenterSectionVisible(layout, "tasks")) {
    overviewHidden.push("tasks");
  }
  if (!isCommandCenterSectionVisible(layout, "lenders")) {
    overviewHidden.push("lenders");
  }
  return { dealInfoHidden, overviewHidden };
}

/** Keep legacy deal-info tab order aligned with unified command-center order. */
export function syncDealInfoLayoutFromCommandCenter(
  dealInfo: DealInfoLayoutV1,
  cc: DealInfoCommandCenterLayoutV1,
): DealInfoLayoutV1 {
  const identityFromCc: DealInfoSectionId[] = [];
  for (const id of cc.order) {
    if (id === "fileDetails") identityFromCc.push("fileDetails");
    if (id === "borrowers") identityFromCc.push("borrowers", "guarantors");
  }
  const nonIdentity = dealInfo.order.filter(
    (id) =>
      id !== "fileDetails" && id !== "borrowers" && id !== "guarantors",
  );
  const { dealInfoHidden } = legacyHiddenFromCommandCenter(cc);
  return {
    ...dealInfo,
    order: normalizeDealInfoSectionOrder([
      ...identityFromCc,
      ...nonIdentity,
    ]),
    hidden: dealInfoHidden,
  };
}

/** Keep legacy overview tab order aligned with unified command-center order. */
export function syncOverviewLayoutFromCommandCenter(
  overview: OverviewTabLayoutV1,
  cc: DealInfoCommandCenterLayoutV1,
): OverviewTabLayoutV1 {
  const fromCc: OverviewSectionId[] = [];
  for (const id of cc.order) {
    if (
      id === "contacts" ||
      id === "notes" ||
      id === "tasks" ||
      id === "lenders"
    ) {
      fromCc.push(id);
    }
  }
  const rest = overview.order.filter((id) => !fromCc.includes(id));
  const { overviewHidden } = legacyHiddenFromCommandCenter(cc);
  return {
    ...normalizeOverviewSectionOrder(overview, [...fromCc, ...rest]),
    hidden: overviewHidden,
  };
}
