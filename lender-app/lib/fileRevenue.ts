import {
  normalizeFileSharedStateFromPipeline,
  type PipelineFileSharedSource,
} from "./fileSharedFields";

export type FileRevenueTotals = {
  fundingAmount: number;
  commission: number;
  netRevenue: number;
};

export function revenueTotalsFromPipelineRow(
  row: PipelineFileSharedSource,
): FileRevenueTotals {
  const s = normalizeFileSharedStateFromPipeline(row);
  return {
    fundingAmount: s.fundingAmount,
    commission: s.commission,
    netRevenue: s.netRevenue,
  };
}

/** Revenue roll-ups attribute to assignee first, else file owner (`ownerUserId`). */
export function revenueAttributionUserKey(row: {
  assigneeId?: string;
  ownerUserId?: string;
  ownerUserKey?: string;
}): string | undefined {
  const a = row.assigneeId?.trim();
  if (a) return a;
  const o = row.ownerUserId?.trim() || row.ownerUserKey?.trim();
  return o || undefined;
}
