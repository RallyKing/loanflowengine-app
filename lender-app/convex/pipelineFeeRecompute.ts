import type { Doc } from "./_generated/dataModel";
import {
  materializeFileSharedStateOnPatch,
  type PipelineFileSharedSource,
} from "../lib/fileSharedFields";

type FeeGroup = {
  total: "lenderFee" | "brokerGross" | "netToUser";
  pct: "lenderFeePct" | "brokerGrossPct" | "netToUserPct";
  outside: "lenderFeeOutside" | "brokerGrossOutside" | "netToUserOutside";
};

const FEE_GROUPS: FeeGroup[] = [
  {
    total: "lenderFee",
    pct: "lenderFeePct",
    outside: "lenderFeeOutside",
  },
  {
    total: "brokerGross",
    pct: "brokerGrossPct",
    outside: "brokerGrossOutside",
  },
  {
    total: "netToUser",
    pct: "netToUserPct",
    outside: "netToUserOutside",
  },
];

/**
 * Sets `fundingAmount` on `patch` and refreshes pct-based dollar fee lines when
 * the loan base changes outside `pipeline.patch` (e.g. deal workspace sync).
 * Matches the recompute branch in `pipeline.patch`.
 */
export function appendPctFeeRecomputeForLoanChange(
  existing: Doc<"pipeline">,
  patch: Partial<Doc<"pipeline">>,
  nextLoan: number,
  opts?: { now?: number }
): void {
  patch.fundingAmount = nextLoan;
  const merged = { ...existing, ...patch } as Doc<"pipeline">;
  for (const g of FEE_GROUPS) {
    const pct = merged[g.pct];
    const outside = merged[g.outside];
    if (pct === undefined && outside === undefined) continue;
    const fundingBase = merged.fundingAmount ?? 0;
    const computed = (fundingBase * (pct ?? 0)) / 100 + (outside ?? 0);
    patch[g.total] = Number.isFinite(computed)
      ? Math.round(computed * 100) / 100
      : 0;
  }
  const now = opts?.now ?? Date.now();
  materializeFileSharedStateOnPatch(
    patch,
    merged as unknown as PipelineFileSharedSource,
    now
  );
}
