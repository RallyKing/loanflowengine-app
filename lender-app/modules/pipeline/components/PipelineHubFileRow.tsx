"use client";

import type { Id } from "@/convex/_generated/dataModel";
import { cn } from "@/lib/cn";
import { ResourceOwnershipLine } from "@/components/ownership/ResourceOwnershipLine";
import { LinkedClientChipRow } from "@/components/pipeline/ClientRelationshipBadge";
import { PipelineHubRelationshipBadges } from "@/components/pipeline/PipelineHubRelationshipBadges";
import { PipelineHubFileFocusBadges } from "@/components/pipeline/PipelineHubFileFocusBadges";
import { PipelineStageSelector } from "@/components/pipeline/PipelineStageSelector";
import { ClientMomentumStars } from "@/components/pipeline/ClientMomentumStars";
import { HubHierarchyLoanRowActions } from "@/components/pipeline/HubHierarchyLoanRowActions";
import { OperationalRowShell } from "@/components/ui/OperationalRowShell";
import { PipelineFileRowHierarchyStack } from "@/components/pipeline/PipelineFileRowHierarchyStack";
import { PipelineFileArchivedIndicator } from "@/components/pipeline/PipelineFileArchivedIndicator";
import { OperationalCheckbox } from "@/components/ui/OperationalCheckbox";
import {
  fmtPipelineBoardLoanCompact,
  fmtPipelineRelativeUpdated,
} from "@/lib/pipeline/pipelineTableFormatting";
import { getPipelineStatusInfo } from "@/lib/pipelineStatus";
import type { PipelineTablePreviewRow } from "@/lib/pipelineTablePreview";
import type { InlineSelectOption } from "@/components/inline";
import { PipelineHubNotesIndicatorChip } from "@/components/pipeline/notes/PipelineHubNotesIndicatorChip";
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
import { mobileHierarchySecondaryInsetClass } from "@/lib/ui/mobileInformationHierarchy";
import { usePipelineLayoutRemountProbe } from "@/lib/debug/pipelineLayoutRemountProbe";

export function PipelineHubFileRow({
  row,
  stackIndex = 0,
  stackTotal = 1,
  bulkChecked,
  onBulkCheckedChange,
  onOpen,
  onOpenNotes,
  onChangeRowStatus,
  onSetClientMomentum,
  hubFocusFileId,
  showGraphBadges = false,
  fileFocusBadges = false,
  organizationId,
  memberUserKey,
  onFileDuplicated,
  parentPathLabel,
  triageHighlights = EMPTY_HUB_TRIAGE_HIGHLIGHT_MAP,
}: {
  row: PipelineTablePreviewRow;
  stackIndex?: number;
  stackTotal?: number;
  bulkChecked: boolean;
  onBulkCheckedChange: (checked: boolean) => void;
  onOpen: () => void;
  onOpenNotes: () => void;
  statusOptions: InlineSelectOption[];
  onChangeRowStatus: (next: {
    stageId?: Id<"organizationPipelineStages">;
    subStageId?: Id<"organizationPipelineSubStages">;
  }) => void;
  onSetClientMomentum?: (n: number | null) => void;
  hubFocusFileId: Id<"pipeline"> | null;
  showGraphBadges?: boolean;
  fileFocusBadges?: boolean;
  organizationId?: Id<"organizations">;
  memberUserKey?: string;
  onFileDuplicated?: (fileId: Id<"pipeline">) => void;
  /** Mobile hierarchy path — client › project */
  parentPathLabel?: string;
  triageHighlights?: HubTriageHighlightMapView;
}) {
  const focused = hubFocusFileId === row._id;
  usePipelineLayoutRemountProbe("PipelineHubFileRow", row._id);
  const statusInfo = getPipelineStatusInfo(row.status);
  const fileHighlight = resolveTriageHighlight(triageHighlights, {
    kind: "file",
    id: String(row._id),
  });
  const fileTaskCounts = resolveTaskRollupCounts(triageHighlights, {
    kind: "file",
    id: String(row._id),
  });

  const tertiaryBadges =
    fileFocusBadges ? (
      <PipelineHubFileFocusBadges row={row} compact />
    ) : showGraphBadges ? (
      <PipelineHubRelationshipBadges row={row} compact />
    ) : null;

  return (
    <HubTriageHighlightFrame
      highlight={fileHighlight}
      className={cn(
        "relative rounded-md border-2 border-border/50 bg-background",
        stackTotal > 1 && "ml-3 border-l-2 border-l-border/55",
        focused && "ring-1 ring-primary/20",
        fileHighlight && "pr-28",
      )}
      badgeClassName="top-1.5"
    >
    <div data-pipeline-row={row._id} className="relative">
      {stackTotal > 1 ? (
        <span className="absolute -left-[9px] top-3 flex h-4 w-4 items-center justify-center rounded-full bg-primary/15 text-[9px] font-bold text-primary">
          {stackIndex + 1}
        </span>
      ) : null}
      <OperationalRowShell
        stackOnMobile
        indentLevel={0}
        left={
          <div className="hidden md:block">
            <OperationalCheckbox
              bare
              checked={bulkChecked}
              onChange={(e) => onBulkCheckedChange(e.target.checked)}
              aria-label={`Select ${row.fileName}`}
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        }
        mobileSecondary={
          <div
            className={cn(
              "flex w-full flex-wrap items-center gap-2",
              mobileHierarchySecondaryInsetClass,
            )}
          >
            <OperationalCheckbox
              bare
              checked={bulkChecked}
              onChange={(e) => onBulkCheckedChange(e.target.checked)}
              aria-label={`Select ${row.fileName}`}
              onClick={(e) => e.stopPropagation()}
              className="md:hidden"
            />
            <span className="tabular-nums font-medium text-foreground/80">
              {fmtPipelineBoardLoanCompact(row.fundingAmount)}
            </span>
            <span>{statusInfo.label}</span>
            <span>{fmtPipelineRelativeUpdated(row.updatedAt)}</span>
            <PipelineHubNotesIndicatorChip
              noteCount={row.fileNotesCount ?? 0}
              fileName={row.fileName}
              onOpenNotes={onOpenNotes}
            />
            <TaskRollupBadge counts={fileTaskCounts} />
            {(row.linkedClients?.length ?? 0) > 1 ? (
              <LinkedClientChipRow linkedClients={row.linkedClients ?? []} />
            ) : null}
            {tertiaryBadges}
            {row.ownership ? (
              <ResourceOwnershipLine presentation={row.ownership} compact />
            ) : null}
            <PipelineStageSelector
              stageId={row.stageId}
              subStageId={row.subStageId}
              status={row.status}
              readOnly={!row.canEditFile}
              canEditFile={row.canEditFile}
              compact
              stopPropagation
              onCommit={onChangeRowStatus}
            />
            {onSetClientMomentum ? (
              <ClientMomentumStars
                value={row.clientMomentum}
                onCommit={(n) => onSetClientMomentum(n)}
                size="sm"
              />
            ) : null}
            {organizationId && memberUserKey ? (
              <HubHierarchyLoanRowActions
                row={row}
                organizationId={organizationId}
                memberUserKey={memberUserKey}
                onOpen={onOpen}
                onDuplicated={onFileDuplicated}
              />
            ) : null}
          </div>
        }
        primary={
          <button
            type="button"
            className="flex min-w-0 flex-1 items-start gap-1.5 text-left"
            onClick={onOpen}
          >
            <PipelineFileArchivedIndicator
              archivedAt={row.archivedAt}
              compact
              withLabel
              className="mt-0.5 shrink-0"
            />
            <PipelineFileRowHierarchyStack row={row} />
          </button>
        }
        secondary={
          <>
            <span className="tabular-nums font-medium text-foreground/80">
              {fmtPipelineBoardLoanCompact(row.fundingAmount)}
            </span>
            <span className="text-muted-foreground/50"> · </span>
            <span>{statusInfo.label}</span>
            <span className="hidden text-muted-foreground sm:inline">
              <span className="text-muted-foreground/50"> · </span>
              {fmtPipelineRelativeUpdated(row.updatedAt)}
            </span>
            <PipelineHubNotesIndicatorChip
              noteCount={row.fileNotesCount ?? 0}
              fileName={row.fileName}
              onOpenNotes={onOpenNotes}
              className="ml-0.5"
            />
            <TaskRollupBadge counts={fileTaskCounts} className="ml-0.5" />
          </>
        }
        tertiary={
          <>
            {(row.linkedClients?.length ?? 0) > 1 ? (
              <LinkedClientChipRow linkedClients={row.linkedClients ?? []} />
            ) : null}
            {tertiaryBadges}
            {row.ownership ? (
              <ResourceOwnershipLine presentation={row.ownership} compact />
            ) : null}
          </>
        }
        trailing={
          <div
            className="flex flex-wrap items-center gap-1.5"
            onClick={(e) => e.stopPropagation()}
          >
            <PipelineStageSelector
              stageId={row.stageId}
              subStageId={row.subStageId}
              status={row.status}
              readOnly={!row.canEditFile}
              canEditFile={row.canEditFile}
              compact
              stopPropagation
              onCommit={onChangeRowStatus}
            />
            {onSetClientMomentum ? (
              <ClientMomentumStars
                value={row.clientMomentum}
                onCommit={(n) => onSetClientMomentum(n)}
                size="sm"
              />
            ) : null}
          </div>
        }
        actions={
          organizationId && memberUserKey ? (
            <HubHierarchyLoanRowActions
              row={row}
              organizationId={organizationId}
              memberUserKey={memberUserKey}
              onOpen={onOpen}
              onDuplicated={onFileDuplicated}
            />
          ) : null
        }
      />
    </div>
    </HubTriageHighlightFrame>
  );
}
