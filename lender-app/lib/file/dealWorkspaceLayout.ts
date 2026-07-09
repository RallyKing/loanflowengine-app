import { DEAL_TAB_GROUPS } from "@/lib/file/dealTabGroups";
import type { DealTabId } from "@/lib/file/dealTabGroups";

export const DEFAULT_DEAL_WORKSPACE_TAB_ORDER: DealTabId[] =
  DEAL_TAB_GROUPS.flatMap((g) => g.tabs.map((t) => t.id));

const ALL_TAB_IDS = new Set<DealTabId>(DEFAULT_DEAL_WORKSPACE_TAB_ORDER);

export const DEAL_TAB_LABELS: Record<DealTabId, string> = Object.fromEntries(
  DEAL_TAB_GROUPS.flatMap((g) => g.tabs.map((t) => [t.id, t.label] as const))
) as Record<DealTabId, string>;

export type DealWorkspaceLayoutV1 = {
  v: 1;
  order: DealTabId[];
  hidden: DealTabId[];
  /** `true` = expanded; omitted / `false` = collapsed. */
  expanded: Partial<Record<DealTabId, boolean>>;
};

function normalizeLayout(raw: unknown): DealWorkspaceLayoutV1 {
  const base: DealWorkspaceLayoutV1 = {
    v: 1,
    order: [...DEFAULT_DEAL_WORKSPACE_TAB_ORDER],
    hidden: [],
    expanded: {},
  };
  if (!raw || typeof raw !== "object") return base;
  const o = raw as Record<string, unknown>;
  if (o.v !== 1) return base;

  const orderIn = Array.isArray(o.order) ? o.order : [];
  const seen = new Set<DealTabId>();
  const order: DealTabId[] = [];
  for (const x of orderIn) {
    if (typeof x !== "string" || !ALL_TAB_IDS.has(x as DealTabId)) continue;
    const id = x as DealTabId;
    if (seen.has(id)) continue;
    seen.add(id);
    order.push(id);
  }
  for (const id of DEFAULT_DEAL_WORKSPACE_TAB_ORDER) {
    if (!seen.has(id)) order.push(id);
  }

  const hiddenIn = Array.isArray(o.hidden) ? o.hidden : [];
  const hidden: DealTabId[] = [];
  const hiddenSeen = new Set<DealTabId>();
  for (const x of hiddenIn) {
    if (typeof x !== "string" || !ALL_TAB_IDS.has(x as DealTabId)) continue;
    const id = x as DealTabId;
    if (hiddenSeen.has(id)) continue;
    hiddenSeen.add(id);
    hidden.push(id);
  }

  const expanded: Partial<Record<DealTabId, boolean>> = {};
  if (o.expanded && typeof o.expanded === "object" && !Array.isArray(o.expanded)) {
    for (const [k, v] of Object.entries(o.expanded as Record<string, unknown>)) {
      if (!ALL_TAB_IDS.has(k as DealTabId)) continue;
      if (typeof v === "boolean") {
        expanded[k as DealTabId] = v;
      }
    }
  }

  return { v: 1, order, hidden, expanded };
}

export function defaultDealWorkspaceLayout(): DealWorkspaceLayoutV1 {
  return {
    v: 1,
    order: [...DEFAULT_DEAL_WORKSPACE_TAB_ORDER],
    hidden: [],
    expanded: {},
  };
}

export function parseDealWorkspaceLayoutFromUnknown(
  raw: unknown
): DealWorkspaceLayoutV1 {
  return normalizeLayout(raw);
}

export function moveDealWorkspaceTab(
  order: DealTabId[],
  id: DealTabId,
  dir: -1 | 1
): DealTabId[] {
  const i = order.indexOf(id);
  if (i < 0) return order;
  const j = i + dir;
  if (j < 0 || j >= order.length) return order;
  const next = [...order];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}
