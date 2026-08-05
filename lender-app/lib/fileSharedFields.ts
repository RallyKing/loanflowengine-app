import type { PipelineBlockId } from "./pipelineBlockRegistry";

/**
 * Canonical per-file shared fields (“data bus”). Always use **`fundingAmount`**
 * for loan / file principal — never **`loanAmount`** on this shape. Top-level
 * `pipeline.fundingAmount`, `pipeline.rate`, `pipeline.term`, `pipeline.notes`,
 * `pipeline.commission`, and `pipeline.netRevenue` remain **mirrors** for legacy
 * list and drawer readers.
 */
export type FileSharedState = {
  fundingAmount: number;
  /** Note rate / APR (canonical name — mirrors legacy `pipeline.rate`). */
  interestRate: number;
  term: string;
  /** One-line file notes (mirrors `pipeline.notes`). */
  notes: string;
  /**
   * Tracked commission (USD). Mirrors `pipeline.commission`; not the same as
   * pct-fee `brokerGross`.
   */
  commission: number;
  /** Tracked net revenue / take-home (USD). Mirrors `pipeline.netRevenue`. */
  netRevenue: number;
  /** Last time the canonical shared snapshot was written. */
  updatedAt: number;
};

/** Subset stored on `pipeline.fileSharedState` (Convex); fields may be absent on old rows. */
export type FileSharedStateStorage = {
  fundingAmount?: number;
  interestRate?: number;
  term?: string;
  notes?: string;
  commission?: number;
  netRevenue?: number;
  updatedAt: number;
};

/** Minimal row shape for normalization (no Convex import). */
export type PipelineFileSharedSource = {
  fundingAmount?: number | null;
  rate: number;
  term: string;
  notes?: string | null;
  commission?: number | null;
  netRevenue?: number | null;
  fileSharedState?: FileSharedStateStorage | null;
  updatedAt: number;
};

function finiteNumber(v: unknown, fallback: number): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  return fallback;
}

function finiteNonNegative(v: unknown, fallback: number): number {
  const n = finiteNumber(v, fallback);
  return n < 0 ? 0 : n;
}

/**
 * Prefer defined bus values, but heal the desync where `fileSharedState` stayed
 * at 0 after a top-level mirror write (stale materialize). Non-zero bus still wins.
 */
function coalesceSharedNonNegative(
  busVal: number | undefined,
  topVal: number | null | undefined,
  fallback: number,
): number {
  const top =
    topVal !== undefined && topVal !== null && Number.isFinite(topVal)
      ? topVal < 0
        ? 0
        : topVal
      : undefined;
  if (busVal !== undefined && Number.isFinite(busVal)) {
    const bus = busVal < 0 ? 0 : busVal;
    if (bus === 0 && top !== undefined && top > 0) return top;
    return bus;
  }
  if (top !== undefined) return top;
  return fallback;
}

function coalesceSharedText(
  busVal: string | undefined,
  topVal: string | null | undefined,
): string {
  const top = typeof topVal === "string" ? topVal : "";
  if (busVal !== undefined) {
    if (busVal === "" && top.trim().length > 0) return top;
    return busVal;
  }
  return top;
}

/**
 * Single read model: merges `pipeline.fileSharedState` with top-level mirrors.
 * Never returns undefined for core keys — use **0**, **""**, or **updatedAt** defaults.
 */
export function normalizeFileSharedStateFromPipeline(
  row: PipelineFileSharedSource
): FileSharedState {
  const bus = row.fileSharedState;

  const fundingAmount = coalesceSharedNonNegative(
    bus?.fundingAmount,
    row.fundingAmount,
    0,
  );

  const interestRate = coalesceSharedNonNegative(
    bus?.interestRate,
    row.rate,
    0,
  );

  const term = coalesceSharedText(
    bus?.term !== undefined ? String(bus.term) : undefined,
    typeof row.term === "string" ? row.term : "",
  );

  const notes = coalesceSharedText(
    bus?.notes !== undefined ? String(bus.notes) : undefined,
    typeof row.notes === "string" ? row.notes : "",
  );

  const commission = coalesceSharedNonNegative(
    bus?.commission,
    row.commission,
    0,
  );

  const netRevenue = coalesceSharedNonNegative(
    bus?.netRevenue,
    row.netRevenue,
    0,
  );

  const updatedAt =
    typeof bus?.updatedAt === "number" && Number.isFinite(bus.updatedAt)
      ? bus.updatedAt
      : row.updatedAt;

  return {
    fundingAmount,
    interestRate,
    term,
    notes,
    commission,
    netRevenue,
    updatedAt,
  };
}

/** Convex / persistence payload for `pipeline.fileSharedState` (fully materialized). */
export function serializeFileSharedStateStorage(
  state: FileSharedState,
  updatedAt: number
): FileSharedStateStorage {
  return {
    fundingAmount: state.fundingAmount,
    interestRate: state.interestRate,
    term: state.term,
    notes: state.notes,
    commission: state.commission,
    netRevenue: state.netRevenue,
    updatedAt,
  };
}

/**
 * Writes normalized shared state onto an in-flight Convex patch object.
 *
 * Callers set top-level mirrors on `patch` / `merged` (`fundingAmount`, `rate`,
 * …) while the previous `fileSharedState` object is still on `merged`. Prefer
 * those in-flight mirrors when rematerializing — otherwise normalize would
 * keep stale bus values (e.g. rate stuck at 0 after a successful top-level
 * write) and File Details “funding (normalized)” / rate would never update.
 */
export function materializeFileSharedStateOnPatch(
  patch: {
    fileSharedState?: FileSharedStateStorage;
    fundingAmount?: number;
    rate?: number;
    term?: string;
    notes?: string | null;
    commission?: number;
    netRevenue?: number;
  },
  merged: PipelineFileSharedSource,
  now: number
): void {
  const prev = merged.fileSharedState;
  const hasOverlay =
    patch.fundingAmount !== undefined ||
    patch.rate !== undefined ||
    patch.term !== undefined ||
    patch.notes !== undefined ||
    patch.commission !== undefined ||
    patch.netRevenue !== undefined;

  const busForNormalize: FileSharedStateStorage | undefined = hasOverlay
    ? {
        ...(prev ?? { updatedAt: now }),
        ...(patch.fundingAmount !== undefined
          ? { fundingAmount: patch.fundingAmount }
          : {}),
        ...(patch.rate !== undefined ? { interestRate: patch.rate } : {}),
        ...(patch.term !== undefined ? { term: patch.term } : {}),
        ...(patch.notes !== undefined
          ? { notes: patch.notes == null ? "" : String(patch.notes) }
          : {}),
        ...(patch.commission !== undefined
          ? { commission: patch.commission }
          : {}),
        ...(patch.netRevenue !== undefined
          ? { netRevenue: patch.netRevenue }
          : {}),
        updatedAt: now,
      }
    : prev ?? undefined;

  const source: PipelineFileSharedSource = {
    ...merged,
    fileSharedState: busForNormalize,
  };

  patch.fileSharedState = serializeFileSharedStateStorage(
    normalizeFileSharedStateFromPipeline(source),
    now
  );
}

/** Shared numeric fields stored on the pipeline “data bus” (block overrides). */
export const FILE_SHARED_NUMERIC_FIELD_KEYS = [
  "fundingAmount",
  "interestRate",
] as const;

export type FileSharedNumericFieldKey =
  (typeof FILE_SHARED_NUMERIC_FIELD_KEYS)[number];

export function fileBlockOverrideKey(
  blockId: PipelineBlockId | string,
  field: FileSharedNumericFieldKey
): string {
  return `${blockId}::${field}`;
}
