import { parseJsonUnknown } from "@/lib/safeJson";

export const DEAL_ANALYSIS_LAYOUT_KEY = "dlc.deal-analysis-layout.v1";

/** Tools shown on the unified Analysis tab (order / visibility / collapse). */
export type DealAnalysisSectionId =
  | "dti"
  | "comparison"
  | "weighted"
  | "payoff"
  | "daycounter";

export const DEAL_ANALYSIS_SECTION_LABELS: Record<
  DealAnalysisSectionId,
  string
> = {
  dti: "DTI calculator",
  comparison: "Loan comparison",
  weighted: "Weighted interest",
  payoff: "Payoff calculator",
  daycounter: "Day counter",
};

export const DEFAULT_DEAL_ANALYSIS_ORDER: DealAnalysisSectionId[] = [
  "dti",
  "comparison",
  "weighted",
  "payoff",
  "daycounter",
];

const ALL_IDS = new Set(DEFAULT_DEAL_ANALYSIS_ORDER);

export type DealAnalysisLayoutV1 = {
  v: 1;
  order: DealAnalysisSectionId[];
  hidden: DealAnalysisSectionId[];
  /** `true` = expanded; omitted / `false` = collapsed. */
  expanded: Partial<Record<DealAnalysisSectionId, boolean>>;
};

export function parseDealAnalysisLayoutFromUnknown(
  raw: unknown
): DealAnalysisLayoutV1 {
  return normalizeLayout(raw);
}

function normalizeLayout(raw: unknown): DealAnalysisLayoutV1 {
  const base: DealAnalysisLayoutV1 = {
    v: 1,
    order: [...DEFAULT_DEAL_ANALYSIS_ORDER],
    hidden: [],
    expanded: {},
  };
  if (!raw || typeof raw !== "object") return base;
  const o = raw as Record<string, unknown>;
  if (o.v !== 1) return base;

  const orderIn = Array.isArray(o.order) ? o.order : [];
  const seen = new Set<DealAnalysisSectionId>();
  const order: DealAnalysisSectionId[] = [];
  for (const x of orderIn) {
    if (typeof x !== "string" || !ALL_IDS.has(x as DealAnalysisSectionId))
      continue;
    const id = x as DealAnalysisSectionId;
    if (seen.has(id)) continue;
    seen.add(id);
    order.push(id);
  }
  for (const id of DEFAULT_DEAL_ANALYSIS_ORDER) {
    if (!seen.has(id)) order.push(id);
  }

  const hiddenIn = Array.isArray(o.hidden) ? o.hidden : [];
  const hidden: DealAnalysisSectionId[] = [];
  const hiddenSeen = new Set<DealAnalysisSectionId>();
  for (const x of hiddenIn) {
    if (typeof x !== "string" || !ALL_IDS.has(x as DealAnalysisSectionId))
      continue;
    const id = x as DealAnalysisSectionId;
    if (hiddenSeen.has(id)) continue;
    hiddenSeen.add(id);
    hidden.push(id);
  }

  const expanded: Partial<Record<DealAnalysisSectionId, boolean>> = {};
  if (o.expanded && typeof o.expanded === "object" && !Array.isArray(o.expanded)) {
    for (const [k, v] of Object.entries(o.expanded as Record<string, unknown>)) {
      if (!ALL_IDS.has(k as DealAnalysisSectionId)) continue;
      if (typeof v === "boolean") {
        expanded[k as DealAnalysisSectionId] = v;
      }
    }
  }

  return { v: 1, order, hidden, expanded };
}

export function defaultDealAnalysisLayout(): DealAnalysisLayoutV1 {
  return {
    v: 1,
    order: [...DEFAULT_DEAL_ANALYSIS_ORDER],
    hidden: [],
    expanded: {},
  };
}

export function isDealAnalysisSectionVisible(
  layout: DealAnalysisLayoutV1,
  sectionId: DealAnalysisSectionId,
): boolean {
  return !layout.hidden.includes(sectionId);
}

export function toggleDealAnalysisSectionHidden(
  layout: DealAnalysisLayoutV1,
  sectionId: DealAnalysisSectionId,
): DealAnalysisLayoutV1 {
  const isHidden = layout.hidden.includes(sectionId);
  return {
    ...layout,
    hidden: isHidden
      ? layout.hidden.filter((x) => x !== sectionId)
      : [...layout.hidden, sectionId],
  };
}

export function resetDealAnalysisLayout(): DealAnalysisLayoutV1 {
  return defaultDealAnalysisLayout();
}

export function loadDealAnalysisLayout(): DealAnalysisLayoutV1 {
  if (typeof window === "undefined") return defaultDealAnalysisLayout();
  try {
    const s = window.localStorage.getItem(DEAL_ANALYSIS_LAYOUT_KEY);
    if (!s) return defaultDealAnalysisLayout();
    return normalizeLayout(parseJsonUnknown(s));
  } catch {
    return defaultDealAnalysisLayout();
  }
}

export function saveDealAnalysisLayout(layout: DealAnalysisLayoutV1): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(DEAL_ANALYSIS_LAYOUT_KEY, JSON.stringify(layout));
  } catch {
    /* ignore */
  }
}

export function moveDealAnalysisSection(
  order: DealAnalysisSectionId[],
  id: DealAnalysisSectionId,
  dir: -1 | 1
): DealAnalysisSectionId[] {
  const i = order.indexOf(id);
  if (i < 0) return order;
  const j = i + dir;
  if (j < 0 || j >= order.length) return order;
  const next = [...order];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}
