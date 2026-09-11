import type { Id } from "../convex/_generated/dataModel";

/**
 * Slim pipeline row for list, ledger, and file-picker UIs. Returned by
 * `api.pipeline.listLight` — omits `contacts`, `scenarioCriteria`, `termOptions`, etc.
 * so subscriptions stay much smaller than full `Doc<"pipeline">` reads.
 */
export type PipelineListRow = {
  _id: Id<"pipeline">;
  _creationTime: number;
  createdAt: number;
  fileName: string;
  propertyAddress?: string;
  scenario?: string;
  status: string;
  /** Dynamic org stage (Phase 12.1). */
  stageId?: Id<"organizationPipelineStages">;
  subStageId?: Id<"organizationPipelineSubStages">;
  /**
   * Stored `pipeline.fundingAmount` (ledger / slim list). For the main pipeline
   * table, use `listTablePreview` instead — its `fundingAmount` is resolved from
   * the file deal payload in real time.
   */
  fundingAmount: number;
  rate: number;
  term: string;
  updatedAt: number;
  archivedAt?: number;
  snoozedUntil?: number | string;
  /** True when `snoozedUntil` parses to a future instant (see `isCurrentlySnoozed`). */
  isSnoozed?: boolean;
  /** Auto-archive-on-inactivity period (whole days). Separate from snooze. */
  autoArchiveInactivityDays?: number;
  /** Denormalized inactivity deadline (Unix ms) for hub marker / sweep. */
  autoArchiveAfterAt?: number;
  lenders: Array<Id<"lenders">>;
  assigneeId?: string;
  projectIntoLedger?: boolean;
  netToUser?: number;
  brokerGross?: number;
  /** Tracked commission (USD) from shared layer — not fee-calculator `brokerGross`. */
  commission: number;
  /** Tracked net revenue from shared layer — not fee-calculator `netToUser`. */
  netRevenue: number;
  /**
   * Operator confidence the client is serious about moving forward (1–5).
   * Omitted until the user sets a rating (unrated in UI).
   */
  clientMomentum?: number;
};
