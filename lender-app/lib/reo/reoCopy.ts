/**
 * Pure helpers for copying REO rows / the full block into another file.
 * Convex `pipelineContacts.copyReoToFile` uses the same merge rules.
 */
import {
  cloneReoBlockForCopy,
  mergeReoIntoTarget,
  normalizeContactIdList,
  selectReoRowsByIndex,
  type DealReoRow,
  type ReoBlockMeta,
} from "./scheduleOfReoModel";

export type ReoCopyMode = "rows" | "block";

export type ReoCopyPlan = {
  mode: ReoCopyMode;
  rows: DealReoRow[];
  meta: ReoBlockMeta;
  copyBlockAssignees: boolean;
};

export function planReoCopy(input: {
  mode: ReoCopyMode;
  sourceRows: readonly DealReoRow[] | undefined | null;
  sourceMeta?: ReoBlockMeta | null;
  rowIndexes?: readonly number[];
}): ReoCopyPlan {
  if (input.mode === "block") {
    const cloned = cloneReoBlockForCopy({
      rows: input.sourceRows ?? [],
      meta: input.sourceMeta,
    });
    return {
      mode: "block",
      rows: cloned.rows,
      meta: cloned.meta,
      copyBlockAssignees: true,
    };
  }
  const selected = selectReoRowsByIndex(
    input.sourceRows,
    input.rowIndexes ?? [],
  );
  const cloned = cloneReoBlockForCopy({
    rows: selected,
    meta: { assignedContactIds: [] },
  });
  return {
    mode: "rows",
    rows: cloned.rows,
    meta: cloned.meta,
    copyBlockAssignees: false,
  };
}

export function applyReoCopyPlan(input: {
  targetRows: readonly DealReoRow[] | undefined | null;
  targetMeta?: ReoBlockMeta | null;
  plan: ReoCopyPlan;
}): { rows: DealReoRow[]; meta: ReoBlockMeta } {
  return mergeReoIntoTarget({
    targetRows: input.targetRows,
    targetMeta: input.targetMeta,
    incomingRows: input.plan.rows,
    incomingMeta: input.plan.meta,
    copyBlockAssignees: input.plan.copyBlockAssignees,
  });
}

/** Contact ids that should be linked onto a destination file after copy. */
export function collectReoCopyAssigneeIds(plan: ReoCopyPlan): string[] {
  return normalizeContactIdList([
    ...(plan.copyBlockAssignees ? plan.meta.assignedContactIds ?? [] : []),
    ...plan.rows.flatMap((row) => row.assignedContactIds ?? []),
  ]);
}
