import type { ClientMomentumFilterToken } from "@/lib/clientMomentum";
import { parseJsonUnknown } from "@/lib/safeJson";

export type PipelineHubSortKey =
  | "updatedDesc"
  | "createdDesc"
  | "loanDesc"
  | "loanAsc"
  | "stageAsc"
  | "stageDesc"
  | "momentumDesc"
  | "momentumAsc";

export type PipelineHubFilterSnapshot = {
  v: 3;
  search: string;
  /** Legacy slug filters (pre–Phase 12.1). */
  statusValues: string[];
  /** Parent stage Convex ids. */
  stageIds: string[];
  /** Sub-stage Convex ids. */
  subStageIds: string[];
  momentumValues: ClientMomentumFilterToken[];
  showArchived: boolean;
  showSnoozed: boolean;
  sort: PipelineHubSortKey;
};

export type PipelineHubSavedView = PipelineHubFilterSnapshot & {
  id: string;
  name: string;
};

const HUB_STATE_KEY = "dlc.pipeline.hub.state.v3";
const HUB_VIEWS_KEY = "dlc.pipeline.hub.views.v1";
const HUB_MOBILE_DISPLAY_KEY = "dlc.pipeline.hub.mobileDisplay.v1";
export const HUB_PROJECTION_MODE_KEY = "dlc.pipeline.projectionMode.v1";

export type HubProjectionModePersisted =
  | "client"
  | "project"
  | "file"
  | "lender"
  | "referral"
  | "team"
  | "task";

export function loadHubProjectionMode(): HubProjectionModePersisted | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(HUB_PROJECTION_MODE_KEY);
    if (
      raw === "client" ||
      raw === "project" ||
      raw === "file" ||
      raw === "lender" ||
      raw === "referral" ||
      raw === "team" ||
      raw === "task"
    ) {
      return raw;
    }
  } catch {
    /* */
  }
  return null;
}

export function saveHubProjectionMode(mode: HubProjectionModePersisted): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(HUB_PROJECTION_MODE_KEY, mode);
  } catch {
    /* */
  }
}

export type HubMobileDisplayMode = "cards" | "table";

export function loadHubMobileDisplay(): HubMobileDisplayMode | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(HUB_MOBILE_DISPLAY_KEY);
    if (raw === "cards" || raw === "table") return raw;
  } catch {
    /* */
  }
  return null;
}

export function saveHubMobileDisplay(mode: HubMobileDisplayMode): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(HUB_MOBILE_DISPLAY_KEY, mode);
  } catch {
    /* */
  }
}

export function parseMomentumFilterTokens(raw: unknown): ClientMomentumFilterToken[] {
  if (!Array.isArray(raw)) return [];
  const out: ClientMomentumFilterToken[] = [];
  for (const x of raw) {
    if (
      x === "unrated" ||
      (typeof x === "string" && x.trim().toLowerCase() === "unrated")
    ) {
      out.push("unrated");
      continue;
    }
    if (typeof x !== "number" || !Number.isFinite(x)) continue;
    const n = Math.round(x);
    if (n >= 1 && n <= 5) out.push(n);
  }
  return [...new Set(out)];
}

export function loadHubFilterSnapshot(): PipelineHubFilterSnapshot | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(HUB_STATE_KEY);
    if (!raw) return null;
    const parsed = parseJsonUnknown(raw);
    if (!parsed || typeof parsed !== "object") return null;
    const o = parsed as Record<string, unknown>;
    const version = o.v;
    if (version !== 2 && version !== 3) return null;
    const sort = o.sort;
    const statusValues = o.statusValues;
    const stageIds = o.stageIds;
    const subStageIds = o.subStageIds;
    const momentumValues = parseMomentumFilterTokens(o.momentumValues);
    return {
      v: 3,
      search: typeof o.search === "string" ? o.search : "",
      statusValues: Array.isArray(statusValues)
        ? (statusValues as unknown[]).filter((x): x is string => typeof x === "string")
        : [],
      stageIds: Array.isArray(stageIds)
        ? (stageIds as unknown[]).filter((x): x is string => typeof x === "string")
        : [],
      subStageIds: Array.isArray(subStageIds)
        ? (subStageIds as unknown[]).filter((x): x is string => typeof x === "string")
        : [],
      momentumValues,
      showArchived: o.showArchived === true,
      showSnoozed: o.showSnoozed === true,
      sort:
        sort === "updatedDesc" ||
        sort === "createdDesc" ||
        sort === "loanDesc" ||
        sort === "loanAsc" ||
        sort === "stageAsc" ||
        sort === "stageDesc" ||
        sort === "momentumDesc" ||
        sort === "momentumAsc"
          ? sort
          : "stageAsc",
    };
  } catch {
    return null;
  }
}

export function saveHubFilterSnapshot(
  s: Omit<PipelineHubFilterSnapshot, "v" | "momentumValues"> & {
    momentumValues?: ClientMomentumFilterToken[];
  },
): void {
  if (typeof window === "undefined") return;
  try {
    const payload: PipelineHubFilterSnapshot = {
      v: 3,
      search: s.search,
      statusValues: s.statusValues ?? [],
      stageIds: s.stageIds ?? [],
      subStageIds: s.subStageIds ?? [],
      momentumValues: s.momentumValues ?? [],
      showArchived: s.showArchived,
      showSnoozed: s.showSnoozed,
      sort: s.sort,
    };
    window.localStorage.setItem(HUB_STATE_KEY, JSON.stringify(payload));
  } catch {
    /* */
  }
}

const MAX_VIEWS = 12;

export function loadHubSavedViews(): PipelineHubSavedView[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(HUB_VIEWS_KEY);
    if (!raw) return [];
    const parsed = parseJsonUnknown(raw);
    if (!Array.isArray(parsed)) return [];
    const out: PipelineHubSavedView[] = [];
    for (const item of parsed) {
      if (!item || typeof item !== "object") continue;
      const o = item as Record<string, unknown>;
      const id = typeof o.id === "string" ? o.id : "";
      const name = typeof o.name === "string" ? o.name : "";
      if (!id || !name) continue;
      const sort = o.sort;
      const statusValues = o.statusValues;
      const stageIds = o.stageIds;
      const subStageIds = o.subStageIds;
      const momentumValues = parseMomentumFilterTokens(o.momentumValues);
      out.push({
        id,
        name,
        v: 3,
        search: typeof o.search === "string" ? o.search : "",
        statusValues: Array.isArray(statusValues)
          ? (statusValues as unknown[]).filter((x): x is string => typeof x === "string")
          : [],
        stageIds: Array.isArray(stageIds)
          ? (stageIds as unknown[]).filter((x): x is string => typeof x === "string")
          : [],
        subStageIds: Array.isArray(subStageIds)
          ? (subStageIds as unknown[]).filter((x): x is string => typeof x === "string")
          : [],
        momentumValues,
        showArchived: o.showArchived === true,
        showSnoozed: o.showSnoozed === true,
        sort:
          sort === "updatedDesc" ||
          sort === "createdDesc" ||
          sort === "loanDesc" ||
          sort === "loanAsc" ||
          sort === "stageAsc" ||
          sort === "stageDesc" ||
          sort === "momentumDesc" ||
          sort === "momentumAsc"
            ? sort
            : "stageAsc",
      });
    }
    return out.slice(0, MAX_VIEWS);
  } catch {
    return [];
  }
}

export function saveHubSavedViews(views: PipelineHubSavedView[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      HUB_VIEWS_KEY,
      JSON.stringify(views.slice(0, MAX_VIEWS)),
    );
  } catch {
    /* */
  }
}

export function newSavedViewId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `sv-${Date.now()}`;
}
