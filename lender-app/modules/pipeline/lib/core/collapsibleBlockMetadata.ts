import type { DealWorkspaceSheet } from "@/lib/file/dealSectionTypes";
import type { PipelineFileInsightsSnapshot } from "@/lib/pipelineFileInsights";
import { deriveIntake } from "@/lib/intake/derivations";
import {
  formatPct,
  formatUSD,
  monthlyPayment,
  parseRate,
  toNumber,
} from "@/lib/intake/finance";
import { computeDtiMetrics } from "@/lib/intake/dtiCompute";
import type { Doc } from "@/convex/_generated/dataModel";
import { formatRelativeTimestamp } from "@/lib/formatRelativeTimestamp";
import { resolveTriageLabelSeverityWeight } from "@/lib/pipeline/triageSeverityWeight";
import type { OrganizationTriageLabelView } from "@/lib/inFileTaskTriageUi";
import { buildTriageLabelsMap } from "@/lib/inFileTaskTriageUi";

const TRIAGE_URGENT_SEVERITY_THRESHOLD = 450;
const TRIAGE_REVIEW_SEVERITY_THRESHOLD = 200;

const URGENT_LABEL_PATTERN =
  /\b(urgent|high\s*priority|critical|compliance\s*hold|underwriting\s*hold)\b/i;

export type TaskTriageBadgeInput = Pick<
  Doc<"tasks">,
  "status" | "triageLabelId" | "isUrgent"
>;

export function resolveTaskTriageBadgeVariant(
  tasks: readonly TaskTriageBadgeInput[],
  labelsById?: Map<string, OrganizationTriageLabelView>,
): CollapsibleBlockBadgeVariant {
  const open = tasks.filter(
    (t) => t.status !== "done" && t.status !== "archived",
  );
  if (tasks.length > 0 && open.length === 0) {
    return "success";
  }
  if (open.length === 0) {
    return "default";
  }

  let maxSeverity = 0;
  let hasUrgentSignal = open.some((t) => t.isUrgent === true);

  for (const task of open) {
    if (!task.triageLabelId || !labelsById) continue;
    const label = labelsById.get(String(task.triageLabelId));
    if (!label) continue;
    const weight = resolveTriageLabelSeverityWeight(label);
    maxSeverity = Math.max(maxSeverity, weight);
    if (
      label.colorId === "triage-urgent-red" ||
      URGENT_LABEL_PATTERN.test(label.label)
    ) {
      hasUrgentSignal = true;
    }
  }

  if (hasUrgentSignal || maxSeverity >= TRIAGE_URGENT_SEVERITY_THRESHOLD) {
    return "destructive";
  }
  if (maxSeverity >= TRIAGE_REVIEW_SEVERITY_THRESHOLD) {
    return "warning";
  }
  if (open.some((t) => t.triageLabelId)) {
    return "warning";
  }
  return "default";
}

export function healthTierBadgeVariant(
  tier: PipelineFileInsightsSnapshot["healthTier"],
): CollapsibleBlockBadgeVariant {
  if (tier === "strong") return "success";
  if (tier === "needs_attention") return "warning";
  return "destructive";
}

import type { BadgeVariant } from "@/components/ui/Badge";

export type CollapsibleBlockBadgeVariant =
  | "default"
  | "secondary"
  | "destructive"
  | "outline"
  | "warning"
  | "success";

export type CollapsibleBlockMeta = {
  status: string;
  summary: string;
  badgeVariant?: CollapsibleBlockBadgeVariant;
  indicatorCount?: number;
};

export function collapsibleBadgeVariantToUi(
  variant: CollapsibleBlockBadgeVariant = "default",
): BadgeVariant {
  switch (variant) {
    case "destructive":
      return "destructive";
    case "warning":
      return "warning";
    case "success":
      return "success";
    case "secondary":
      return "secondary";
    case "outline":
      return "outline";
    default:
      return "default";
  }
}

export function healthTierStatusLabel(
  tier: PipelineFileInsightsSnapshot["healthTier"],
): string {
  if (tier === "strong") return "On track";
  if (tier === "needs_attention") return "Review";
  return "Needs focus";
}

export function fileInsightsBlockMeta(
  snapshot: PipelineFileInsightsSnapshot | null | undefined,
): CollapsibleBlockMeta {
  if (!snapshot) {
    return { status: "Loading", summary: "Computing deal health…" };
  }
  const metricParts = snapshot.metrics
    .slice(0, 3)
    .map((m) => (m.text ? `${m.label}: ${m.text}` : m.label))
    .filter(Boolean);
  return {
    status: healthTierStatusLabel(snapshot.healthTier),
    badgeVariant: healthTierBadgeVariant(snapshot.healthTier),
    summary:
      metricParts.length > 0
        ? metricParts.join(" · ")
        : snapshot.healthSummary.slice(0, 96),
  };
}

export function commercialMetricsMeta(
  draft: DealWorkspaceSheet | null | undefined,
): CollapsibleBlockMeta {
  if (!draft) {
    return { status: "Pending", summary: "Loading deal data…" };
  }
  const c = draft.commercial ?? {};
  const di = deriveIntake(draft);
  const gsr = toNumber(c.grossScheduledRent);
  const vacancyPct = parseRate(c.vacancyPct);
  const other = toNumber(c.otherIncome);
  const gpi = gsr - gsr * vacancyPct + other;
  const opEx =
    toNumber(c.opExTaxes) +
    toNumber(c.opExInsurance) +
    toNumber(c.opExManagement) +
    toNumber(c.opExRepairs) +
    toNumber(c.opExUtilities) +
    toNumber(c.opExOther);
  const noi = gpi - opEx;
  const cAny = c as { fundingAmount?: string };
  const loan =
    toNumber(cAny.fundingAmount) || toNumber(di.proposedLoanAmount);
  const rate = parseRate(c.ratePct);
  const amYears = toNumber(c.amortizationYears) || 30;
  const debtServiceAnnual =
    monthlyPayment(loan, rate, amYears * 12) * 12;
  const dscr = debtServiceAnnual > 0 ? noi / debtServiceAnnual : 0;
  const pv = toNumber(di.subjectValue);
  const ltv = pv > 0 ? loan / pv : 0;

  const hasInputs =
    gsr > 0 || loan > 0 || toNumber(c.ratePct) > 0;
  const parts: string[] = [];
  if (dscr > 0) parts.push(`DSCR: ${dscr.toFixed(2)}x`);
  if (pv > 0 && loan > 0) parts.push(`LTV: ${formatPct(ltv, 0)}`);

  return {
    status: dscr > 0 ? "Calculated" : hasInputs ? "Draft" : "Pending",
    badgeVariant:
      dscr > 0 ? "success" : hasInputs ? "warning" : "secondary",
    summary: parts.length > 0 ? parts.join(" | ") : "Enter rent roll and loan terms",
  };
}

export function dtiBlockMeta(
  draft: DealWorkspaceSheet | null | undefined,
): CollapsibleBlockMeta {
  if (!draft?.dti) {
    return { status: "Pending", summary: "Add income and housing to compute DTI" };
  }
  const m = computeDtiMetrics(draft.dti);
  if (m.grossIncome <= 0) {
    return { status: "Draft", summary: "Income required for DTI ratios" };
  }
  return {
    status: "Calculated",
    badgeVariant: "success",
    summary: `Front: ${formatPct(m.frontDti, 1)} | Back: ${formatPct(m.backDti, 1)}`,
  };
}

export function fileDetailsBlockMeta(
  pipeline: Doc<"pipeline"> | null | undefined,
  loanAmount?: number,
): CollapsibleBlockMeta {
  if (!pipeline) {
    return { status: "Pending", summary: "Loading file details…" };
  }
  const amount = loanAmount ?? pipeline.fundingAmount ?? 0;
  const term = pipeline.term?.trim() || "—";
  const amountLabel = amount > 0 ? formatUSD(amount) : "—";
  return {
    status: amount > 0 ? "Configured" : "Draft",
    summary: `Loan: ${amountLabel} | Term: ${term}`,
  };
}

export function tasksBlockMeta(
  tasks: readonly TaskTriageBadgeInput[] | undefined,
  labels?: readonly OrganizationTriageLabelView[],
): CollapsibleBlockMeta {
  if (!tasks) {
    return { status: "Loading", summary: "Fetching tasks…" };
  }
  const open = tasks.filter(
    (t) => t.status !== "done" && t.status !== "archived",
  ).length;
  const done = tasks.filter((t) => t.status === "done").length;
  const labelsById =
    labels && labels.length > 0 ? buildTriageLabelsMap([...labels]) : undefined;
  return {
    status: open > 0 ? `${open} open` : "Clear",
    badgeVariant: resolveTaskTriageBadgeVariant(tasks, labelsById),
    // Header pill matches status (“N open”), not open+completed total.
    indicatorCount: open > 0 ? open : undefined,
    summary:
      tasks.length === 0
        ? "No file tasks yet"
        : `${done} complete · ${open} open`,
  };
}

export function documentVaultBlockMeta(
  count: number | undefined,
  lastUploadedAt: number | undefined,
  pendingReviewCount?: number,
): CollapsibleBlockMeta {
  if (count === undefined) {
    return { status: "Loading", summary: "Scanning vault…" };
  }
  const last =
    lastUploadedAt != null
      ? new Date(lastUploadedAt).toLocaleDateString(undefined, {
          month: "short",
          day: "numeric",
        })
      : "—";
  const needsReview = (pendingReviewCount ?? 0) > 0;
  return {
    status: needsReview
      ? "Needs review"
      : count > 0
        ? "Active"
        : "Empty",
    badgeVariant: needsReview ? "destructive" : count > 0 ? "default" : "secondary",
    indicatorCount: needsReview
      ? pendingReviewCount
      : count > 0
        ? count
        : undefined,
    summary: needsReview
      ? `${pendingReviewCount} task${pendingReviewCount === 1 ? "" : "s"} awaiting broker review`
      : `Last upload: ${last}`,
  };
}

export function communicationsBlockMeta(
  threadCount: number | undefined,
  lastMessageAt: number | undefined,
): CollapsibleBlockMeta {
  if (threadCount === undefined) {
    return { status: "Loading", summary: "Loading messages…" };
  }
  const summary =
    lastMessageAt != null
      ? `Last message: ${formatRelativeTimestamp(lastMessageAt)}`
      : threadCount > 0
        ? "Internal threads · outbound email & portal"
        : "Start internal threads or send outbound messages";
  return {
    status: threadCount > 0 ? "Active" : "Ready",
    badgeVariant: threadCount > 0 ? "default" : "secondary",
    indicatorCount: threadCount > 0 ? threadCount : undefined,
    summary,
  };
}

export function fileHistoryBlockMeta(
  rows: readonly { at: number }[] | undefined,
): CollapsibleBlockMeta {
  if (rows === undefined) {
    return { status: "Loading", summary: "Loading audit trail…" };
  }
  if (rows.length === 0) {
    return {
      status: "Empty",
      badgeVariant: "secondary",
      summary: "No recorded changes yet",
    };
  }
  const latest = rows[0]!.at;
  return {
    status: "Audit",
    badgeVariant: "default",
    summary: `Last modified: ${formatRelativeTimestamp(latest)}`,
  };
}

export function clientPortalBlockMeta(
  activeGrants: number | null,
  pendingUploads?: number,
): CollapsibleBlockMeta {
  if (activeGrants === null) {
    return { status: "Checking", summary: "Verifying portal access…" };
  }
  const uploadPart =
    pendingUploads != null && pendingUploads > 0
      ? ` · ${pendingUploads} inbox item${pendingUploads === 1 ? "" : "s"}`
      : "";
  return {
    status: activeGrants > 0 ? "Live" : "Inactive",
    badgeVariant: activeGrants > 0 ? "success" : "secondary",
    indicatorCount: activeGrants > 0 ? activeGrants : undefined,
    summary:
      activeGrants > 0
        ? `Active client access${uploadPart}`
        : "No active client links — invite to enable access",
  };
}

export function settingsLayoutBlockMeta(
  behavior: string,
  visibleBlocks: number,
): CollapsibleBlockMeta {
  const behaviorLabel =
    behavior === "all_open"
      ? "All open"
      : behavior === "all_closed"
        ? "All collapsed"
        : "Smart expand";
  return {
    status: "Configured",
    badgeVariant: "default",
    indicatorCount: visibleBlocks > 0 ? visibleBlocks : undefined,
    summary: `${behaviorLabel} default expand`,
  };
}

export function underwritingActionQueueMeta(
  count: number | undefined,
): CollapsibleBlockMeta {
  if (count === undefined) {
    return { status: "Loading", summary: "Fetching action queue…" };
  }
  return {
    status: count > 0 ? `${count} pending` : "Clear",
    badgeVariant: count > 0 ? "warning" : "success",
    indicatorCount: count > 0 ? count : undefined,
    summary:
      count > 0
        ? "Open actions sorted by due date"
        : "No outstanding tasks or client requests",
  };
}

export function underwritingWorkflowMeta(
  done: number,
  total: number,
): CollapsibleBlockMeta {
  if (total === 0) {
    return { status: "Pending", summary: "Workflow steps not configured" };
  }
  const pct = Math.round((done / total) * 100);
  return {
    status: done === total ? "Complete" : "In progress",
    badgeVariant: done === total ? "success" : "warning",
    indicatorCount: total > 0 ? total : undefined,
    summary: `${done}/${total} steps (${pct}%)`,
  };
}

export function countSectionMeta(
  count: number,
  label: string,
  emptyHint: string,
): CollapsibleBlockMeta {
  return {
    status: count > 0 ? "Populated" : "Empty",
    badgeVariant: count > 0 ? "default" : "secondary",
    indicatorCount: count > 0 ? count : undefined,
    summary: count > 0 ? label : emptyHint,
  };
}
