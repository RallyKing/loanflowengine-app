/**
 * Pure helpers for copying Track Record rows / the full block into another file.
 * Convex `pipelineContacts.copyTrackRecordToFile` uses the same merge rules.
 */
import {
  applyScheduleCopyPlan,
  planScheduleCopy,
  type ScheduleCopyMode,
  type ScheduleCopyPlan,
} from "@/lib/schedule/copyToFile";
import {
  cloneTrackRecordRowForCopy,
  normalizeTrackRecordGuarantors,
  normalizeTrackRecordMeta,
  trackRecordRowHasIdentity,
  type DealTrackRecordRow,
  type TrackRecordBlockMeta,
} from "./trackRecordModel";

export type TrackRecordCopyMode = ScheduleCopyMode;
export type TrackRecordCopyPlan = ScheduleCopyPlan<DealTrackRecordRow> & {
  guarantors: TrackRecordBlockMeta["guarantors"];
};

export function planTrackRecordCopy(input: {
  mode: TrackRecordCopyMode;
  sourceRows: readonly DealTrackRecordRow[] | undefined | null;
  sourceMeta?: TrackRecordBlockMeta | null;
  rowIndexes?: readonly number[];
}): TrackRecordCopyPlan {
  const sourceMeta = normalizeTrackRecordMeta(input.sourceMeta);
  const plan = planScheduleCopy({
    mode: input.mode,
    sourceRows: input.sourceRows,
    sourceMeta,
    rowIndexes: input.rowIndexes,
    cloneRow: cloneTrackRecordRowForCopy,
  });
  return {
    ...plan,
    guarantors:
      input.mode === "block"
        ? normalizeTrackRecordGuarantors(sourceMeta.guarantors)
        : undefined,
  };
}

export function applyTrackRecordCopyPlan(input: {
  targetRows: readonly DealTrackRecordRow[] | undefined | null;
  targetMeta?: TrackRecordBlockMeta | null;
  plan: TrackRecordCopyPlan;
}): { rows: DealTrackRecordRow[]; meta: TrackRecordBlockMeta } {
  const targetMeta = normalizeTrackRecordMeta(input.targetMeta);
  const merged = applyScheduleCopyPlan({
    targetRows: input.targetRows,
    targetMeta,
    plan: input.plan,
    rowHasIdentity: trackRecordRowHasIdentity,
  });
  const guarantors =
    input.plan.mode === "block" && input.plan.guarantors
      ? normalizeTrackRecordGuarantors(input.plan.guarantors)
      : targetMeta.guarantors;
  return {
    rows: merged.rows,
    meta: {
      assignedContactIds: merged.meta.assignedContactIds,
      guarantors,
    },
  };
}
