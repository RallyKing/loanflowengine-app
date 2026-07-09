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
 * Single read model: merges `pipeline.fileSharedState` with top-level mirrors.
 * Never returns undefined for core keys — use **0**, **""**, or **updatedAt** defaults.
 */
export function normalizeFileSharedStateFromPipeline(
  row: PipelineFileSharedSource
): FileSharedState {
  const bus = row.fileSharedState;

  const fundingAmount = finiteNonNegative(
    bus?.fundingAmount !== undefined
      ? bus.fundingAmount
      : row.fundingAmount !== undefined && row.fundingAmount !== null
        ? row.fundingAmount
        : undefined,
    0
  );

  const interestRate = finiteNonNegative(
    bus?.interestRate !== undefined ? bus.interestRate : row.rate,
    0
  );

  const term =
    bus?.term !== undefined
      ? String(bus.term)
      : typeof row.term === "string"
        ? row.term
        : "";

  const notes =
    bus?.notes !== undefined
      ? String(bus.notes)
      : typeof row.notes === "string"
        ? row.notes
        : "";

  const commission = finiteNonNegative(
    bus?.commission !== undefined
      ? bus.commission
      : row.commission !== undefined && row.commission !== null
        ? row.commission
        : undefined,
    0,
  );

  const netRevenue = finiteNonNegative(
    bus?.netRevenue !== undefined
      ? bus.netRevenue
      : row.netRevenue !== undefined && row.netRevenue !== null
        ? row.netRevenue
        : undefined,
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

/** Writes normalized shared state onto an in-flight Convex patch object. */
export function materializeFileSharedStateOnPatch(
  patch: { fileSharedState?: FileSharedStateStorage },
  merged: PipelineFileSharedSource,
  now: number
): void {
  patch.fileSharedState = serializeFileSharedStateStorage(
    normalizeFileSharedStateFromPipeline(merged),
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
