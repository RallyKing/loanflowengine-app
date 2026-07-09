/** UI-facing triage highlight (computed reactively — never stored on hub rows). */

export type TriageHighlightEntry = {
  triageLabelId: string;
  label: string;
  /** Preset id (`organizationTriageLabels.colorId`). */
  colorToken: string;
  severityWeight: number;
  sourceTaskId: string;
  sourceTaskTitle: string;
  hexCode: string;
};

export type HubTriageHighlightView = {
  hexCode: string;
  label: string;
  taskTitle: string;
  /** @deprecated Always true for 24.2A labeled bubbles. */
  isImmediate: boolean;
  triageLabelId: string;
  colorToken: string;
  severityWeight: number;
  sourceTaskId: string;
};

/** Phase Modular-D — open/overdue counts rolled up file → project → client. */
export type TaskRollupCountsView = {
  open: number;
  overdue: number;
  topStatus: "todo" | "in_progress" | null;
};

export type HubTriageHighlightMapView = {
  byFileId: Record<string, HubTriageHighlightView>;
  byProjectId: Record<string, HubTriageHighlightView>;
  byClientId: Record<string, HubTriageHighlightView>;
  countsByFileId: Record<string, TaskRollupCountsView>;
  countsByProjectId: Record<string, TaskRollupCountsView>;
  countsByClientId: Record<string, TaskRollupCountsView>;
};

export const EMPTY_HUB_TRIAGE_HIGHLIGHT_MAP: HubTriageHighlightMapView = {
  byFileId: {},
  byProjectId: {},
  byClientId: {},
  countsByFileId: {},
  countsByProjectId: {},
  countsByClientId: {},
};

export type HubTriageHighlightQueryResult = {
  files: Record<string, TriageHighlightEntry>;
  projects: Record<string, TriageHighlightEntry>;
  clients: Record<string, TriageHighlightEntry>;
  counts?: {
    files?: Record<string, TaskRollupCountsView>;
    projects?: Record<string, TaskRollupCountsView>;
    clients?: Record<string, TaskRollupCountsView>;
  };
};

export type TriageHighlightBucket = "byFileId" | "byProjectId" | "byClientId";

let triageMapShapeLogged = false;

/** Temporary production forensics — logs once per page load when map shape is wrong. */
export function logTriageMapShape(map: unknown): void {
  if (triageMapShapeLogged) return;
  triageMapShapeLogged = true;
  console.error("TRIAGE_MAP_SHAPE", {
    hasByFileId: !!(map as HubTriageHighlightMapView | null)?.byFileId,
    hasByProjectId: !!(map as HubTriageHighlightMapView | null)?.byProjectId,
    hasByClientId: !!(map as HubTriageHighlightMapView | null)?.byClientId,
    keys: Object.keys(map ?? {}),
  });
}

/**
 * Single guarded bucket lookup — never throws when the bucket or key is missing.
 */
export function safeHighlightLookup(
  map: Record<string, HubTriageHighlightView> | null | undefined,
  key: string,
  bucket: TriageHighlightBucket,
  rawMapForDiagnostics?: unknown,
): HubTriageHighlightView | null {
  const id = typeof key === "string" ? key.trim() : "";
  if (!id) return null;
  if (map == null || typeof map !== "object") {
    console.warn(
      `[triage] safeHighlightLookup: bucket "${bucket}" is missing; key="${id}"`,
    );
    if (rawMapForDiagnostics !== undefined) {
      logTriageMapShape(rawMapForDiagnostics);
    }
    return null;
  }
  return map[id] ?? null;
}

function entryToView(entry: TriageHighlightEntry): HubTriageHighlightView {
  return {
    hexCode: entry.hexCode,
    label: entry.label,
    taskTitle: entry.sourceTaskTitle,
    isImmediate: true,
    triageLabelId: entry.triageLabelId,
    colorToken: entry.colorToken,
    severityWeight: entry.severityWeight,
    sourceTaskId: entry.sourceTaskId,
  };
}

function isQueryResultShape(
  value: unknown,
): value is HubTriageHighlightQueryResult {
  if (!value || typeof value !== "object") return false;
  return "files" in value || "projects" in value || "clients" in value;
}

function isRecord(value: unknown): value is Record<string, HubTriageHighlightView> {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

function sanitizeCountsRecord(
  raw: Record<string, TaskRollupCountsView> | undefined,
): Record<string, TaskRollupCountsView> {
  const out: Record<string, TaskRollupCountsView> = {};
  for (const [id, entry] of Object.entries(raw ?? {})) {
    if (!entry || typeof entry !== "object") continue;
    const open = Number((entry as TaskRollupCountsView).open);
    const overdue = Number((entry as TaskRollupCountsView).overdue);
    if (!Number.isFinite(open) || open <= 0) continue;
    const topStatus = (entry as TaskRollupCountsView).topStatus;
    out[id] = {
      open: Math.floor(open),
      overdue: Number.isFinite(overdue) ? Math.max(0, Math.floor(overdue)) : 0,
      topStatus:
        topStatus === "in_progress" || topStatus === "todo" ? topStatus : null,
    };
  }
  return out;
}

export function hubTriageMapFromQuery(
  raw: HubTriageHighlightQueryResult | null | undefined,
): HubTriageHighlightMapView {
  if (!raw) return EMPTY_HUB_TRIAGE_HIGHLIGHT_MAP;
  const byFileId: Record<string, HubTriageHighlightView> = {};
  const byProjectId: Record<string, HubTriageHighlightView> = {};
  const byClientId: Record<string, HubTriageHighlightView> = {};
  for (const [id, entry] of Object.entries(raw.files ?? {})) {
    if (!entry) continue;
    byFileId[id] = entryToView(entry);
  }
  for (const [id, entry] of Object.entries(raw.projects ?? {})) {
    if (!entry) continue;
    byProjectId[id] = entryToView(entry);
  }
  for (const [id, entry] of Object.entries(raw.clients ?? {})) {
    if (!entry) continue;
    byClientId[id] = entryToView(entry);
  }
  return {
    byFileId,
    byProjectId,
    byClientId,
    countsByFileId: sanitizeCountsRecord(raw.counts?.files),
    countsByProjectId: sanitizeCountsRecord(raw.counts?.projects),
    countsByClientId: sanitizeCountsRecord(raw.counts?.clients),
  };
}

/**
 * Coerce any triage highlight payload to a safe UI map.
 * Accepts server `{ files, projects, clients }` or partial UI maps without crashing render.
 */
export function normalizeHubTriageHighlightMap(
  map:
    | HubTriageHighlightMapView
    | HubTriageHighlightQueryResult
    | null
    | undefined,
): HubTriageHighlightMapView {
  if (!map) return EMPTY_HUB_TRIAGE_HIGHLIGHT_MAP;
  if (isQueryResultShape(map)) {
    return hubTriageMapFromQuery(map);
  }
  const view = map as HubTriageHighlightMapView;
  const byFileId = isRecord(view.byFileId) ? view.byFileId : {};
  const byProjectId = isRecord(view.byProjectId) ? view.byProjectId : {};
  const byClientId = isRecord(view.byClientId) ? view.byClientId : {};
  if (
    !isRecord(view.byFileId) ||
    !isRecord(view.byProjectId) ||
    !isRecord(view.byClientId)
  ) {
    logTriageMapShape(map);
  }
  return {
    byFileId,
    byProjectId,
    byClientId,
    countsByFileId: isRecord(view.countsByFileId)
      ? (view.countsByFileId as Record<string, TaskRollupCountsView>)
      : {},
    countsByProjectId: isRecord(view.countsByProjectId)
      ? (view.countsByProjectId as Record<string, TaskRollupCountsView>)
      : {},
    countsByClientId: isRecord(view.countsByClientId)
      ? (view.countsByClientId as Record<string, TaskRollupCountsView>)
      : {},
  };
}

/** Roll-up counts lookup for hub rows, cards, hierarchy rows, and client header. */
export function resolveTaskRollupCounts(
  map:
    | HubTriageHighlightMapView
    | HubTriageHighlightQueryResult
    | null
    | undefined,
  target: { kind: "file" | "project" | "client"; id: string },
): TaskRollupCountsView | null {
  const safe = normalizeHubTriageHighlightMap(map);
  const id = target.id.trim();
  if (!id) return null;
  const bucket =
    target.kind === "file"
      ? safe.countsByFileId
      : target.kind === "project"
        ? safe.countsByProjectId
        : safe.countsByClientId;
  const counts = bucket[id];
  if (!counts || counts.open <= 0) return null;
  return counts;
}

/** Single lookup helper for hub rows, board cards, and mobile cards. */
export function resolveTriageHighlight(
  map:
    | HubTriageHighlightMapView
    | HubTriageHighlightQueryResult
    | null
    | undefined,
  target: { kind: "file" | "project" | "client"; id: string },
): HubTriageHighlightView | null {
  const safe = normalizeHubTriageHighlightMap(map);
  const id = target.id.trim();
  if (!id) return null;
  if (target.kind === "file") {
    return safeHighlightLookup(safe.byFileId, id, "byFileId", map);
  }
  if (target.kind === "project") {
    return safeHighlightLookup(safe.byProjectId, id, "byProjectId", map);
  }
  return safeHighlightLookup(safe.byClientId, id, "byClientId", map);
}
