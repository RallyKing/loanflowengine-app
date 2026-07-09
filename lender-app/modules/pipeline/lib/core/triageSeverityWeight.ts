import type { Doc } from "@/convex/_generated/dataModel";

export const DEFAULT_TRIAGE_SEVERITY_WEIGHT = 100;

/** Seed-friendly defaults when `severityWeight` is unset on the label row. */
const KNOWN_LABEL_SEVERITY: Readonly<Record<string, number>> = {
  "Compliance Hold": 1000,
  "Underwriting Hold": 950,
  "Missing Documentation": 500,
  "Missing Documents": 500,
  Stalled: 450,
  "Waiting On Borrower": 300,
  "Waiting On Broker": 310,
  "Waiting On Lender": 320,
  "Waiting On Vendor": 330,
  "Funding Review": 200,
  "Call Client": 100,
};

export function resolveTriageLabelSeverityWeight(
  label: Pick<Doc<"organizationTriageLabels">, "label" | "severityWeight">,
): number {
  const stored = label.severityWeight;
  if (typeof stored === "number" && Number.isFinite(stored) && stored > 0) {
    return stored;
  }
  const known = KNOWN_LABEL_SEVERITY[label.label.trim()];
  if (known != null) return known;
  return DEFAULT_TRIAGE_SEVERITY_WEIGHT;
}
