/**
 * Generic copy-to-file merge for schedule blocks (REO, Business Debt, …).
 * Copies complete rows into another file without replacing the destination.
 */
import {
  mergeScheduleBlockAssignees,
  normalizeContactIdList,
  type ScheduleBlockMeta,
} from "./contactIds";

export type ScheduleCopyMode = "rows" | "block";

export type ScheduleCopyPlan<TRow> = {
  mode: ScheduleCopyMode;
  rows: TRow[];
  meta: ScheduleBlockMeta;
  copyBlockAssignees: boolean;
};

export function selectScheduleRowsByIndex<TRow>(
  rows: readonly TRow[] | undefined | null,
  indexes: readonly number[],
): TRow[] {
  const list = Array.isArray(rows) ? rows : [];
  const seen = new Set<number>();
  const out: TRow[] = [];
  for (const raw of indexes) {
    const i = Math.trunc(raw);
    if (!Number.isFinite(i) || i < 0 || i >= list.length || seen.has(i)) {
      continue;
    }
    seen.add(i);
    const row = list[i];
    if (row) out.push(row);
  }
  return out;
}

export function planScheduleCopy<TRow>(input: {
  mode: ScheduleCopyMode;
  sourceRows: readonly TRow[] | undefined | null;
  sourceMeta?: ScheduleBlockMeta | null;
  rowIndexes?: readonly number[];
  cloneRow: (row: TRow) => TRow;
}): ScheduleCopyPlan<TRow> {
  if (input.mode === "block") {
    const source = Array.isArray(input.sourceRows) ? input.sourceRows : [];
    return {
      mode: "block",
      rows: source.map(input.cloneRow),
      meta: {
        assignedContactIds: [
          ...normalizeContactIdList(input.sourceMeta?.assignedContactIds),
        ],
      },
      copyBlockAssignees: true,
    };
  }
  const selected = selectScheduleRowsByIndex(
    input.sourceRows,
    input.rowIndexes ?? [],
  );
  return {
    mode: "rows",
    rows: selected.map(input.cloneRow),
    meta: { assignedContactIds: [] },
    copyBlockAssignees: false,
  };
}

export function mergeScheduleIntoTarget<TRow>(input: {
  targetRows: readonly TRow[] | undefined | null;
  targetMeta?: ScheduleBlockMeta | null;
  incomingRows: readonly TRow[];
  incomingMeta?: ScheduleBlockMeta | null;
  copyBlockAssignees: boolean;
  rowHasIdentity: (row: TRow) => boolean;
}): { rows: TRow[]; meta: ScheduleBlockMeta } {
  const existing = Array.isArray(input.targetRows) ? [...input.targetRows] : [];
  const kept = existing.filter(input.rowHasIdentity);
  return {
    rows: [...kept, ...input.incomingRows],
    meta: mergeScheduleBlockAssignees({
      targetMeta: input.targetMeta,
      incomingMeta: input.incomingMeta,
      copyBlockAssignees: input.copyBlockAssignees,
    }),
  };
}

export function applyScheduleCopyPlan<TRow>(input: {
  targetRows: readonly TRow[] | undefined | null;
  targetMeta?: ScheduleBlockMeta | null;
  plan: ScheduleCopyPlan<TRow>;
  rowHasIdentity: (row: TRow) => boolean;
}): { rows: TRow[]; meta: ScheduleBlockMeta } {
  return mergeScheduleIntoTarget({
    targetRows: input.targetRows,
    targetMeta: input.targetMeta,
    incomingRows: input.plan.rows,
    incomingMeta: input.plan.meta,
    copyBlockAssignees: input.plan.copyBlockAssignees,
    rowHasIdentity: input.rowHasIdentity,
  });
}
