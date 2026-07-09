/**
 * Phase 14 Step 3 — project capital stack types and rollups (pure).
 */

export const CAPITAL_REQUIREMENT_TYPES = [
  "acquisition",
  "rehab",
  "refinance",
  "working_capital",
  "bridge",
  "LOC",
  "term",
  "equity",
  "other",
] as const;

export type CapitalRequirementType = (typeof CAPITAL_REQUIREMENT_TYPES)[number];

export const CAPITAL_SOURCE_TYPES = [
  "loan",
  "LOC",
  "term_loan",
  "equity",
  "cash",
  "mezzanine",
  "bridge",
  "other",
] as const;

export type CapitalSourceType = (typeof CAPITAL_SOURCE_TYPES)[number];

export const CAPITAL_SOURCE_STATUSES = [
  "planned",
  "sourcing",
  "approved",
  "funded",
  "failed",
] as const;

export type CapitalSourceStatus = (typeof CAPITAL_SOURCE_STATUSES)[number];

export const CAPITAL_REQUIREMENT_LABELS: Record<CapitalRequirementType, string> =
  {
    acquisition: "Acquisition",
    rehab: "Rehab",
    refinance: "Refinance",
    working_capital: "Working capital",
    bridge: "Bridge",
    LOC: "LOC",
    term: "Term",
    equity: "Equity",
    other: "Other",
  };

export const CAPITAL_SOURCE_TYPE_LABELS: Record<CapitalSourceType, string> = {
  loan: "Loan",
  LOC: "LOC",
  term_loan: "Term loan",
  equity: "Equity",
  cash: "Cash",
  mezzanine: "Mezzanine",
  bridge: "Bridge",
  other: "Other",
};

export const CAPITAL_SOURCE_STATUS_LABELS: Record<CapitalSourceStatus, string> =
  {
    planned: "Planned",
    sourcing: "Sourcing",
    approved: "Approved",
    funded: "Funded",
    failed: "Failed",
  };

export type ProjectCapitalRollup = {
  projectId: string;
  totalRequired: number;
  totalCommitted: number;
  totalApproved: number;
  totalFunded: number;
  remainingGap: number;
  fundingCoveragePercent: number;
  /** complete | partial | unfunded */
  gapHealth: "complete" | "partial" | "unfunded";
  requirementCount: number;
  sourceCount: number;
  /** Distinct funding source types on the project */
  sourceTypes: CapitalSourceType[];
  /** Concatenated notes for hub search */
  searchBlob: string;
};

export type CapitalRequirementRow = {
  id: string;
  capitalType: CapitalRequirementType;
  requiredAmount: number;
  priorityOrder: number;
  notes?: string;
};

export type CapitalSourceRow = {
  id: string;
  pipelineId: string | null;
  pipelineFileName?: string;
  sourceType: CapitalSourceType;
  committedAmount: number;
  approvedAmount: number;
  fundedAmount: number;
  status: CapitalSourceStatus;
  sortOrder: number;
  notes?: string;
  allocationByRequirementId: Record<string, number>;
};

export function safeMoney(n: unknown): number {
  const v = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(v) || v < 0) return 0;
  return v;
}

export function computeProjectCapitalRollup(args: {
  projectId: string;
  requirements: Array<{ requiredAmount: number; notes?: string }>;
  sources: Array<{
    sourceType?: CapitalSourceType;
    committedAmount: number;
    approvedAmount: number;
    fundedAmount: number;
    notes?: string;
  }>;
}): ProjectCapitalRollup {
  const totalRequired = args.requirements.reduce(
    (s, r) => s + safeMoney(r.requiredAmount),
    0,
  );
  const totalCommitted = args.sources.reduce(
    (s, r) => s + safeMoney(r.committedAmount),
    0,
  );
  const totalApproved = args.sources.reduce(
    (s, r) => s + safeMoney(r.approvedAmount),
    0,
  );
  const totalFunded = args.sources.reduce(
    (s, r) => s + safeMoney(r.fundedAmount),
    0,
  );
  const remainingGap = Math.max(0, totalRequired - totalFunded);
  const fundingCoveragePercent =
    totalRequired > 0
      ? Math.min(100, Math.round((totalFunded / totalRequired) * 100))
      : totalFunded > 0
        ? 100
        : 0;

  let gapHealth: ProjectCapitalRollup["gapHealth"] = "unfunded";
  if (totalRequired <= 0 && totalFunded <= 0) {
    gapHealth = "unfunded";
  } else if (remainingGap <= 0 && totalRequired > 0) {
    gapHealth = "complete";
  } else if (totalFunded > 0 || totalApproved > 0 || totalCommitted > 0) {
    gapHealth = "partial";
  }

  const searchParts: string[] = [];
  for (const r of args.requirements) {
    if (r.notes?.trim()) searchParts.push(r.notes.trim());
  }
  for (const s of args.sources) {
    if (s.notes?.trim()) searchParts.push(s.notes.trim());
  }

  const sourceTypes = [
    ...new Set(
      args.sources
        .map((s) => s.sourceType)
        .filter((t): t is CapitalSourceType => t != null),
    ),
  ];

  return {
    projectId: args.projectId,
    totalRequired,
    totalCommitted,
    totalApproved,
    totalFunded,
    remainingGap,
    fundingCoveragePercent,
    gapHealth,
    requirementCount: args.requirements.length,
    sourceCount: args.sources.length,
    sourceTypes,
    searchBlob: searchParts.join(" ").toLowerCase(),
  };
}

export function formatCapitalMoney(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${Math.round(n).toLocaleString()}`;
}
