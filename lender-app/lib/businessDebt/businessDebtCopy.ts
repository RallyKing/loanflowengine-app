/**
 * Pure helpers for copying Business Debt rows / the full block into another file.
 * Convex `pipelineContacts.copyBusinessDebtToFile` uses the same merge rules.
 */
import {
  applyScheduleCopyPlan,
  planScheduleCopy,
  type ScheduleCopyMode,
  type ScheduleCopyPlan,
} from "@/lib/schedule/copyToFile";
import type { ScheduleBlockMeta } from "@/lib/schedule/contactIds";
import {
  businessDebtRowHasIdentity,
  cloneBusinessDebtRowForCopy,
  type DealBusinessDebtRow,
} from "./scheduleOfBusinessDebtModel";

export type BusinessDebtCopyMode = ScheduleCopyMode;

export type BusinessDebtCopyPlan = ScheduleCopyPlan<DealBusinessDebtRow>;

export function planBusinessDebtCopy(input: {
  mode: BusinessDebtCopyMode;
  sourceRows: readonly DealBusinessDebtRow[] | undefined | null;
  sourceMeta?: ScheduleBlockMeta | null;
  rowIndexes?: readonly number[];
}): BusinessDebtCopyPlan {
  return planScheduleCopy({
    mode: input.mode,
    sourceRows: input.sourceRows,
    sourceMeta: input.sourceMeta,
    rowIndexes: input.rowIndexes,
    cloneRow: cloneBusinessDebtRowForCopy,
  });
}

export function applyBusinessDebtCopyPlan(input: {
  targetRows: readonly DealBusinessDebtRow[] | undefined | null;
  targetMeta?: ScheduleBlockMeta | null;
  plan: BusinessDebtCopyPlan;
}): { rows: DealBusinessDebtRow[]; meta: ScheduleBlockMeta } {
  return applyScheduleCopyPlan({
    targetRows: input.targetRows,
    targetMeta: input.targetMeta,
    plan: input.plan,
    rowHasIdentity: businessDebtRowHasIdentity,
  });
}
