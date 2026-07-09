"use client";

import Link from "next/link";
import { Archive, BellOff, FileText, User } from "lucide-react";
import type { Id } from "@/convex/_generated/dataModel";
import type { PipelineTablePreviewRow } from "@/lib/pipelineTablePreview";
import { cn } from "@/lib/cn";
import { InlineSelect, type InlineSelectOption } from "@/components/inline";
import { pipelineDealEditorHref } from "@/lib/pipeline/routes";
import { getPipelineStatusInfo } from "@/lib/pipelineStatus";
import { fmtPipelineBoardLoanCompact, fmtPipelineRelativeUpdated } from "@/lib/pipeline/pipelineTableFormatting";
import { snoozedUntilToMs } from "@/lib/pipelineSnooze";
import { ClientMomentumStars } from "@/components/pipeline/ClientMomentumStars";
import { ResourceOwnershipLine } from "@/components/ownership/ResourceOwnershipLine";
import { useOrgPermissions } from "@/lib/useOrgPermissions";
import { useActorUserKey } from "@/lib/useActorUserKey";
import { useOrgMemberDisplayLabel } from "@/lib/useOrgMemberDisplayLabel";
import {
  HubTriageHighlightFrame,
  TaskRollupBadge,
} from "@/components/pipeline/tasks/HubTriageHighlightChrome";
import {
  EMPTY_HUB_TRIAGE_HIGHLIGHT_MAP,
  resolveTaskRollupCounts,
  resolveTriageHighlight,
  type HubTriageHighlightMapView,
} from "@/lib/pipeline/hubTriageHighlight";
import { PipelineFileRowHierarchyStack } from "@/components/pipeline/PipelineFileRowHierarchyStack";

/** High-density mobile hub row: scan-friendly without replacing the full data grid on desktop. */
export function PipelineHubMobileFileCard({
  row: r,
  selected,
  bulkChecked,
  onBulkCheckedChange,
  onOpen,
  statusOptions,
  onChangeRowStatus,
  onSetClientMomentum,
  triageHighlights = EMPTY_HUB_TRIAGE_HIGHLIGHT_MAP,
}: {
  row: PipelineTablePreviewRow;
  selected: boolean;
  bulkChecked: boolean;
  onBulkCheckedChange: (checked: boolean) => void;
  onOpen: () => void;
  statusOptions: InlineSelectOption[];
  onChangeRowStatus: (id: Id<"pipeline">, next: string) => void;
  onSetClientMomentum?: (id: Id<"pipeline">, next: number | null) => void | Promise<void>;
  triageHighlights?: HubTriageHighlightMapView;
}) {
  const { activeOrganizationId } = useOrgPermissions();
  const memberUserKey = useActorUserKey().trim() || undefined;
  const { labelFor: assigneeLabel } = useOrgMemberDisplayLabel(
    activeOrganizationId,
    memberUserKey,
  );
  const archived = r.archivedAt != null;
  const canEditStars = !archived && r.canEditFile && Boolean(onSetClientMomentum);
  const fileHighlight = resolveTriageHighlight(triageHighlights, {
    kind: "file",
    id: String(r._id),
  });
  const fileTaskCounts = resolveTaskRollupCounts(triageHighlights, {
    kind: "file",
    id: String(r._id),
  });
  return (
    <HubTriageHighlightFrame
      highlight={fileHighlight}
      className={cn(
        "rounded-xl border border-border/80 bg-background shadow-sm transition-colors",
        "active:bg-muted/30",
        archived && "opacity-65",
        selected &&
          "ring-2 ring-brand-accent/40 ring-offset-2 ring-offset-background",
      )}
      badgeClassName="top-2 right-2"
    >
    <article
      data-pipeline-row={r._id}
      className="p-3"
    >
      <div className="flex flex-col gap-2">
        <div className="flex min-w-0 items-start gap-2">
          <FileText
            className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground"
            aria-hidden
          />
          <Link
            href={pipelineDealEditorHref(r._id)}
            className="min-w-0 flex-1 text-left"
            onClick={onOpen}
            aria-label={`Open file ${r.fileName}`}
            prefetch={false}
          >
            <PipelineFileRowHierarchyStack row={r} />
          </Link>
        </div>
        <div
          className="flex w-full flex-wrap items-center gap-2 pl-6"
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <input
            type="checkbox"
            className="h-4 w-4 shrink-0 cursor-pointer rounded border-border text-primary accent-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent focus-visible:ring-offset-1 focus-visible:ring-offset-background"
            checked={bulkChecked}
            onChange={(e) => {
              e.stopPropagation();
              onBulkCheckedChange(e.target.checked);
            }}
            aria-label={`Select ${r.fileName} for bulk actions`}
            onClick={(e) => e.stopPropagation()}
          />
          <span className="text-sm font-semibold tabular-nums text-foreground">
            {r.fundingAmountDisplay ||
              fmtPipelineBoardLoanCompact(r.fundingAmount || 0)}
          </span>
          <ClientMomentumStars
            className="shrink-0"
            value={r.clientMomentum}
            readOnly={!canEditStars}
            disabled={archived}
            onCommit={
              canEditStars && onSetClientMomentum
                ? (n) => onSetClientMomentum(r._id, n)
                : undefined
            }
          />
          {r.archivedAt != null && (
            <span
              className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-800 dark:border-amber-700 dark:bg-amber-950/60 dark:text-amber-200"
              title={`Archived ${new Date(r.archivedAt).toLocaleString()}`}
            >
              <Archive className="h-2.5 w-2.5" aria-hidden />
              Archived
            </span>
          )}
          {r.isSnoozed && snoozedUntilToMs(r.snoozedUntil) != null && (
            <span
              className="inline-flex items-center gap-1 rounded-full border border-blue-300 bg-blue-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-blue-800 dark:border-blue-700 dark:bg-blue-950/60 dark:text-blue-200"
              title={`Snoozed until ${new Date(snoozedUntilToMs(r.snoozedUntil)!).toLocaleString()}`}
            >
              <BellOff className="h-2.5 w-2.5" aria-hidden />
              Snoozed
            </span>
          )}
          <TaskRollupBadge counts={fileTaskCounts} />
        </div>
        {r.ownership?.ownershipLine ? (
          <ResourceOwnershipLine
            ownershipLine={r.ownership.ownershipLine}
            badge={r.ownership.badge}
            compact
            className="pl-6"
          />
        ) : null}
        {r.subjectAddressDisplay ? (
          <p className="pl-6 text-[11px] break-words text-muted-foreground">
            {r.subjectAddressDisplay}
          </p>
        ) : null}
        {[r.sourceLabel, r.fundingTypeDisplay, r.selectedLenderDisplay].some(
          Boolean,
        ) ? (
          <p className="pl-6 text-[11px] break-words text-muted-foreground">
            {[r.sourceLabel, r.fundingTypeDisplay, r.selectedLenderDisplay]
              .filter(Boolean)
              .join(" · ")}
          </p>
        ) : null}
        <div
          className="flex flex-wrap items-center justify-between gap-2 border-t border-border/50 pt-2"
          onClick={(e) => e.stopPropagation()}
        >
            <InlineSelect
              value={getPipelineStatusInfo(r.status).value}
              options={statusOptions}
              onCommit={(next) => onChangeRowStatus(r._id, next)}
              ariaLabel={`Change status for ${r.fileName}`}
              asBadge
              stopPropagation
            />
            <span className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
              {r.assigneeId ? (
                <span
                  className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/50 px-1.5 py-0.5"
                  title={`Assigned to ${assigneeLabel(r.assigneeId)}`}
                >
                  <User className="h-3 w-3" aria-hidden />
                  {assigneeLabel(r.assigneeId)}
                </span>
              ) : null}
              <span title={`Updated ${fmtPipelineRelativeUpdated(r.updatedAt)}`}>
                {fmtPipelineRelativeUpdated(r.updatedAt)}
              </span>
            </span>
          </div>
      </div>
    </article>
    </HubTriageHighlightFrame>
  );
}
