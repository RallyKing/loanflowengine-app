"use client";

import { cn } from "@/lib/cn";
import type { PipelineFileInsightsSnapshot } from "@/lib/pipelineFileInsights";
import { pipelineWorkspaceNestedChipClass } from "@/lib/pipelineWorkspaceCard";

function HealthBadge({ tier }: { tier: PipelineFileInsightsSnapshot["healthTier"] }) {
  const cfg =
    tier === "strong"
      ? {
          label: "On track",
          className:
            "border-emerald-300/80 bg-emerald-50/90 text-emerald-900 dark:border-emerald-800/60 dark:bg-emerald-950/40 dark:text-emerald-100",
        }
      : tier === "needs_attention"
        ? {
            label: "Review",
            className:
              "border-amber-300/80 bg-amber-50/90 text-amber-950 dark:border-amber-800/60 dark:bg-amber-950/35 dark:text-amber-100",
          }
        : {
            label: "Needs focus",
            className:
              "border-rose-300/80 bg-rose-50/90 text-rose-950 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-100",
          };
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide",
        cfg.className,
      )}
    >
      {cfg.label}
    </span>
  );
}

function metricValue(
  snapshot: PipelineFileInsightsSnapshot,
  id: string,
): string {
  const m = snapshot.metrics.find((x) => x.id === id);
  if (!m) return "—";
  if (m.text?.trim()) return m.text.trim();
  if (typeof m.amount === "number" && Number.isFinite(m.amount)) {
    return m.amount > 0 ? `$${m.amount.toLocaleString(undefined, { maximumFractionDigits: 0 })}` : "—";
  }
  return "—";
}

export type FileDetailsTelemetryFooterProps = {
  snapshot: PipelineFileInsightsSnapshot;
  className?: string;
};

/** Inline file telemetry — stage, lenders, primary lender, health (merged from File Insights). */
export function FileDetailsTelemetryFooter({
  snapshot,
  className,
}: FileDetailsTelemetryFooterProps) {
  const stage = metricValue(snapshot, "stage");
  const lenders = metricValue(snapshot, "lenders");
  const primaryLender = metricValue(snapshot, "chosen");

  return (
    <div
      className={cn(
        "mt-5 border-t border-border/70 pt-4",
        className,
      )}
      data-testid="pipeline-file-details-telemetry"
    >
      <div className="flex flex-wrap items-center gap-2">
        <HealthBadge tier={snapshot.healthTier} />
        <p className="min-w-0 flex-1 text-xs leading-relaxed text-muted-foreground">
          {snapshot.healthSummary}
        </p>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {[
          { label: "Current stage", value: stage },
          { label: "Linked lenders", value: lenders },
          { label: "Primary lender", value: primaryLender },
        ].map((chip) => (
          <div
            key={chip.label}
            className={cn(
              pipelineWorkspaceNestedChipClass,
              "min-w-[7rem] flex-1 bg-muted/20 px-2.5 py-2 sm:flex-none",
            )}
          >
            <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              {chip.label}
            </div>
            <div className="truncate text-xs font-semibold text-foreground">
              {chip.value}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
