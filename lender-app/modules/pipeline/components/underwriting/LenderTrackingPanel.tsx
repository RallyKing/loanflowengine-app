"use client";

import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { OperationalSkeletonList } from "@/components/ui/OperationalSkeleton";
import { cn } from "@/lib/cn";
import {
  buildLenderTrackRows,
  relationshipTypeLabel,
  sortLenderTrackRows,
  type CoverLenderSnapshot,
  type LenderTrackRow,
} from "@/lib/pipeline/lenderTracking";
import {
  Building2,
  ChevronDown,
  Star,
} from "lucide-react";

export type LenderTrackingPanelProps = {
  fileId: Id<"pipeline">;
  memberUserKey?: string;
};

function RelationshipBadge({
  relationshipType,
}: {
  relationshipType: LenderTrackRow["relationshipType"];
}) {
  const label = relationshipTypeLabel(relationshipType);
  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide",
        relationshipType === "selected" &&
          "border-emerald-400/70 bg-emerald-100 text-emerald-900 dark:border-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-200",
        relationshipType === "submitted" &&
          "border-blue-300 bg-blue-100 text-blue-900 dark:border-blue-700 dark:bg-blue-950/50 dark:text-blue-200",
        relationshipType === "quoted" &&
          "border-border/70 bg-muted/60 text-muted-foreground",
        relationshipType === "declined" &&
          "border-destructive/50 bg-destructive/10 text-destructive",
        relationshipType === "other" &&
          "border-border/70 bg-dlc-surface-high text-muted-foreground",
      )}
      data-testid={`pipeline-underwriting-lender-status-${relationshipType}`}
    >
      {label}
    </span>
  );
}

function MilestoneStrip({ milestones }: { milestones: LenderTrackRow["milestones"] }) {
  const filled = milestones.filter((m) => m.value);
  if (filled.length === 0) {
    return (
      <p className="text-[11px] text-muted-foreground">
        No milestone dates recorded on the coversheet yet.
      </p>
    );
  }

  return (
    <div
      className="flex flex-wrap gap-1.5"
      data-testid="pipeline-underwriting-lender-milestones"
    >
      {milestones.map((milestone) => {
        const hasValue = Boolean(milestone.value);
        return (
          <div
            key={milestone.key}
            className={cn(
              "min-w-0 flex-1 basis-[calc(50%-0.375rem)] rounded-dlc-sm border px-2 py-1.5 sm:min-w-[5.5rem] sm:flex-none sm:basis-auto",
              hasValue
                ? "border-primary/25 bg-primary/5"
                : "border-dashed border-border/50 bg-muted/20 opacity-60",
            )}
            data-testid={`pipeline-underwriting-lender-milestone-${milestone.key}`}
          >
            <p className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
              {milestone.label}
            </p>
            <p
              className={cn(
                "mt-0.5 text-[11px] font-medium tabular-nums",
                hasValue ? "text-foreground" : "text-muted-foreground",
              )}
            >
              {milestone.value ?? "—"}
            </p>
          </div>
        );
      })}
    </div>
  );
}

function LenderTrackRowCard({ row }: { row: LenderTrackRow }) {
  const isDeclined = row.relationshipType === "declined";
  const [expanded, setExpanded] = useState(!isDeclined);

  return (
    <article
      className={cn(
        "rounded-dlc-md border bg-background/70 transition-colors duration-dlc-short ease-dlc-standard",
        isDeclined
          ? "border-destructive/30 bg-destructive/[0.03]"
          : row.isSelected
            ? "border-primary/35 bg-primary/[0.03]"
            : "border-border/70",
      )}
      data-testid={`pipeline-underwriting-lender-row-${row.lenderId}`}
    >
      <button
        type="button"
        className="flex w-full items-start gap-3 px-3 py-3 text-left touch-manipulation sm:px-4"
        aria-expanded={expanded}
        onClick={() => setExpanded((v) => !v)}
      >
        <ChevronDown
          className={cn(
            "mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-dlc-short ease-dlc-standard",
            expanded && "rotate-180",
          )}
          aria-hidden
        />
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold text-foreground break-words">
              {row.company}
            </h3>
            <RelationshipBadge relationshipType={row.relationshipType} />
            {row.isSelected ? (
              <span className="inline-flex items-center gap-0.5 rounded-full border border-primary/40 bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                <Star className="h-2.5 w-2.5 fill-current" aria-hidden />
                Chosen
              </span>
            ) : null}
          </div>
          {row.contactName ? (
            <p className="text-xs text-muted-foreground">{row.contactName}</p>
          ) : null}
          {isDeclined && row.rejectionReason ? (
            <p className="text-xs leading-relaxed text-destructive break-words">
              {expanded
                ? row.rejectionReason
                : row.rejectionReason.length > 120
                  ? `${row.rejectionReason.slice(0, 120)}…`
                  : row.rejectionReason}
            </p>
          ) : null}
          {!expanded && row.termSummary ? (
            <p className="text-[11px] text-muted-foreground">{row.termSummary}</p>
          ) : null}
        </div>
      </button>

      {expanded ? (
        <div className="space-y-3 border-t border-border/60 px-3 pb-3 pt-3 sm:px-4 sm:pb-4">
          {row.termSummary ? (
            <div
              className="rounded-dlc-sm border border-border/60 bg-dlc-surface-high/50 px-3 py-2"
              data-testid="pipeline-underwriting-lender-term-summary"
            >
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Term options
              </p>
              <p className="mt-0.5 text-xs text-foreground">{row.termSummary}</p>
            </div>
          ) : null}
          <MilestoneStrip milestones={row.milestones} />
        </div>
      ) : null}
    </article>
  );
}

export function LenderTrackingPanel({
  fileId,
  memberUserKey,
}: LenderTrackingPanelProps) {
  const [panelOpen, setPanelOpen] = useState(true);

  const qArgs = useMemo(
    () => (memberUserKey ? { fileId, memberUserKey } : { fileId }),
    [fileId, memberUserKey],
  );

  const detailArgs = useMemo(
    () => (memberUserKey ? { id: fileId, memberUserKey } : { id: fileId }),
    [fileId, memberUserKey],
  );

  const fileLinks = useQuery(api.fileLenders.listByFile, qArgs);
  const detail = useQuery(api.pipeline.getDetail, detailArgs);

  const rows = useMemo(() => {
    if (!detail) return undefined;
    const dealData = detail.pipeline.dealData as
      | { cover?: { lenders?: CoverLenderSnapshot[] } }
      | undefined;
    const coverLenders = dealData?.cover?.lenders ?? [];
    const built = buildLenderTrackRows({
      lenders: detail.lenders,
      lenderOrder: detail.pipeline.lenders,
      links: fileLinks ?? [],
      selectedLenderId: detail.pipeline.selectedLenderId,
      selectedLenderSentAt: detail.pipeline.selectedLenderSentAt,
      termOptions: detail.pipeline.termOptions,
      coverLenders,
    });
    return sortLenderTrackRows(built);
  }, [detail, fileLinks]);

  const loading = detail === undefined || fileLinks === undefined;
  const resolvedRows = rows ?? [];
  const activeCount = resolvedRows.filter(
    (r) => r.relationshipType !== "declined",
  ).length;
  const declinedCount = resolvedRows.filter(
    (r) => r.relationshipType === "declined",
  ).length;

  return (
    <div className="dlc-surface-card min-w-0 rounded-dlc-md border border-border/80">
      <div className="flex items-start gap-2 border-b border-border/60 px-3 py-3 sm:px-5">
        <Building2
          className="mt-0.5 h-4 w-4 shrink-0 text-dlc-accent"
          aria-hidden
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-semibold text-foreground">
              Lender track
            </h2>
            {!loading ? (
              <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold tabular-nums text-muted-foreground">
                {resolvedRows.length} total
                {declinedCount > 0 ? ` · ${declinedCount} declined` : ""}
              </span>
            ) : null}
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Allocation status from{" "}
            <code className="rounded bg-muted px-1 text-[10px]">fileLenders</code>
            , coversheet milestones, and term options for the chosen lender.
            {!loading && declinedCount > 0
              ? " Declined allocations start collapsed."
              : null}
          </p>
        </div>
        <button
          type="button"
          className="flex h-10 w-10 shrink-0 touch-manipulation items-center justify-center rounded-dlc-sm text-muted-foreground transition-colors duration-dlc-short ease-dlc-standard hover:bg-muted/50 hover:text-foreground"
          aria-expanded={panelOpen}
          aria-label={panelOpen ? "Collapse lender track" : "Expand lender track"}
          data-testid="pipeline-underwriting-lender-toggle"
          onClick={() => setPanelOpen((v) => !v)}
        >
          <ChevronDown
            className={cn(
              "h-5 w-5 transition-transform duration-dlc-short ease-dlc-standard",
              panelOpen && "rotate-180",
            )}
            aria-hidden
          />
        </button>
      </div>

      {panelOpen ? (
        <div className="px-3 py-3 sm:px-4 sm:py-4">
          {loading ? (
            <div data-testid="pipeline-underwriting-lender-skeleton">
              <OperationalSkeletonList rows={3} />
            </div>
          ) : resolvedRows.length === 0 ? (
            <div
              className="rounded-dlc-md border border-dashed border-border/60 bg-dlc-surface-high/40 px-4 py-8 text-center"
              data-testid="pipeline-underwriting-lender-empty"
            >
              <p className="text-sm font-medium text-foreground">
                No lenders linked to this file
              </p>
              <p className="mx-auto mt-1 max-w-sm text-xs text-muted-foreground">
                Attach lenders from the lender workspace to begin tracking
                submissions and coversheet milestones here.
              </p>
            </div>
          ) : (
            <div className="space-y-2" data-testid="pipeline-underwriting-lender-list">
              {activeCount === 0 && declinedCount > 0 ? (
                <p className="mb-2 text-xs text-muted-foreground">
                  All linked lenders are declined — expand a row to review
                  rejection context.
                </p>
              ) : null}
              {resolvedRows.map((row) => (
                <LenderTrackRowCard key={row.lenderId} row={row} />
              ))}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
