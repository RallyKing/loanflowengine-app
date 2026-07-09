"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FolderKanban, User } from "lucide-react";
import { HubExpandChevron } from "@/components/pipeline/HubExpandChevron";
import {
  RowShell,
  RowShellMetadata,
  RowShellTitle,
  rowShellMetaItems,
} from "@/components/ui/RowShell";
import type { Id } from "@/convex/_generated/dataModel";
import { cn } from "@/lib/cn";
import {
  HIERARCHY_CLIENT_CLUSTER_CLASS,
  HIERARCHY_PROJECT_RAIL_CLASS,
  HIERARCHY_LOAN_RAIL_CLASS,
  hierarchyChevronClass,
} from "@/lib/ui/hierarchyRhythm";
import {
  fmtHubFunding,
  type HubClientNode,
  type HubProjectNode,
} from "@/lib/pipeline/hubHierarchyTree";
import {
  pipelineHubClientHref,
  shouldOpenClientWorkspace,
} from "@/lib/pipeline/routes";
import {
  isClientExpanded,
  isProjectExpanded,
  type HubHierarchyExpansionState,
} from "@/lib/pipeline/hubHierarchyExpansion";
import { ResourceOwnershipLine } from "@/components/ownership/ResourceOwnershipLine";
import { PipelineHubRelationshipBadges } from "@/components/pipeline/PipelineHubRelationshipBadges";
import { LinkedClientChipRow } from "@/components/pipeline/ClientRelationshipBadge";
import { HubProjectDetailSubsections } from "@/components/pipeline/HubProjectDetailSubsections";
import { ClientNotesSubsection } from "@/components/pipeline/notes/ClientNotesSubsection";
import {
  HubHierarchyClientActions,
  HubHierarchyProjectActions,
} from "@/components/pipeline/HubHierarchyRowActions";
import { HubHierarchyLoanRowActions } from "@/components/pipeline/HubHierarchyLoanRowActions";
import { ProjectCapitalStackEditor } from "@/components/pipeline/ProjectCapitalStackEditor";
import {
  CLIENT_RELATIONSHIP_LABELS,
  countExtraClients,
} from "@/lib/pipeline/clientRelationshipUi";
import type { HubLoanClientPlacement } from "@/lib/pipeline/hubHierarchyTree";
import { formatCapitalMoney } from "@/lib/projectCapitalStack";
import { PipelineStageSelector } from "@/components/pipeline/PipelineStageSelector";
import { ClientMomentumStars } from "@/components/pipeline/ClientMomentumStars";
import {
  fmtPipelineBoardLoanCompact,
  fmtPipelineRelativeUpdated,
} from "@/lib/pipeline/pipelineTableFormatting";
import { getPipelineStatusInfo } from "@/lib/pipelineStatus";
import { PipelineFileRowHierarchyStack } from "@/components/pipeline/PipelineFileRowHierarchyStack";
import type { PipelineTablePreviewRow } from "@/lib/pipelineTablePreview";
import type { InlineSelectOption } from "@/components/inline";
import { PipelineHubNotesIndicatorChip } from "@/components/pipeline/notes/PipelineHubNotesIndicatorChip";
import {
  HubTriageHighlightFrame,
  TaskRollupBadge,
} from "@/components/pipeline/tasks/HubTriageHighlightChrome";
import {
  resolveTaskRollupCounts,
  resolveTriageHighlight,
  type HubTriageHighlightMapView,
} from "@/lib/pipeline/hubTriageHighlight";
import { EMPTY_HUB_TRIAGE_HIGHLIGHT_MAP } from "@/lib/pipeline/hubTriageHighlight";
import {
  mobileHierarchySecondaryInsetClass,
  mobilePrimaryTitleClass,
} from "@/lib/ui/mobileInformationHierarchy";
import { usePipelineLayoutRemountProbe } from "@/lib/debug/pipelineLayoutRemountProbe";
import {
  hubHierarchySectionVisible,
} from "@/lib/debug/phase24-4I-hub-stabilization";

/** Convex-backed hub entities only — legacy synthetic keys cannot use hierarchy mutations. */
function hubEntitySupportsInlineCreate(entityId: string): boolean {
  return entityId.length > 0 && !entityId.startsWith("legacy-");
}

function CapitalGapBadge({
  health,
}: {
  health: "complete" | "partial" | "unfunded";
}) {
  const styles =
    health === "complete"
      ? "bg-muted/60 text-muted-foreground"
      : health === "partial"
        ? "bg-amber-500/15 text-amber-800 dark:text-amber-200"
        : "bg-destructive/10 text-destructive";
  const label =
    health === "complete"
      ? "Funded"
      : health === "partial"
        ? "Partial"
        : "Gap";
  return (
    <span
      className={cn(
        "inline-flex shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium",
        styles,
      )}
      data-testid={`capital-gap-badge-${health}`}
    >
      {label}
    </span>
  );
}

function HubLoanPlacementBadge({
  placement,
}: {
  placement?: HubLoanClientPlacement;
}) {
  if (!placement || placement.isPrimary) return null;
  const label =
    CLIENT_RELATIONSHIP_LABELS[placement.relationshipType] ?? "Secondary";
  return (
    <span
      className="inline-flex shrink-0 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold text-amber-900 dark:text-amber-100"
      data-testid="hub-loan-secondary-placement-badge"
    >
      {label}
    </span>
  );
}

function LoanStackRow({
  row,
  stackIndex,
  stackTotal,
  clientPlacement,
  bulkChecked,
  onBulkCheckedChange,
  onOpen,
  onOpenNotes,
  statusOptions,
  onChangeRowStatus,
  onSetClientMomentum,
  hubFocusFileId,
  organizationId,
  memberUserKey,
  onFileDuplicated,
  triageHighlights = EMPTY_HUB_TRIAGE_HIGHLIGHT_MAP,
}: {
  row: PipelineTablePreviewRow;
  stackIndex: number;
  stackTotal: number;
  clientPlacement?: HubLoanClientPlacement;
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
  organizationId?: Id<"organizations">;
  memberUserKey?: string;
  onFileDuplicated?: (fileId: Id<"pipeline">) => void;
  triageHighlights?: HubTriageHighlightMapView;
}) {
  const focused = hubFocusFileId === row._id;
  const statusInfo = getPipelineStatusInfo(row.status);
  const fileHighlight = resolveTriageHighlight(triageHighlights, {
    kind: "file",
    id: String(row._id),
  });
  const fileTaskCounts = resolveTaskRollupCounts(triageHighlights, {
    kind: "file",
    id: String(row._id),
  });
  return (
    <HubTriageHighlightFrame
      highlight={fileHighlight}
      className={cn(
        "group/loan-row flex flex-col gap-1 rounded-md border-2 border-border/60 bg-background px-3 py-2 shadow-sm transition-colors",
        stackTotal > 1 && "ml-4 border-l-2 border-l-primary/25 pl-3",
        focused && "ring-2 ring-brand-accent/40",
        fileHighlight && "pr-28",
      )}
      badgeClassName="top-1.5"
    >
    <div
      data-pipeline-row={row._id}
      data-pipeline-hub-component="LoanStackRow"
      className="relative flex flex-col gap-1"
    >
      {stackTotal > 1 && (
        <span className="absolute -left-[9px] top-3 flex h-4 w-4 items-center justify-center rounded-full bg-primary/15 text-[9px] font-bold text-primary">
          {stackIndex + 1}
        </span>
      )}
      <div className="flex flex-col gap-2 md:hidden">
        <button type="button" className="w-full min-w-0 text-left" onClick={onOpen}>
          <PipelineFileRowHierarchyStack row={row} />
        </button>
        <div
          className={cn(
            "flex w-full flex-wrap items-center gap-2",
            mobileHierarchySecondaryInsetClass,
          )}
        >
          <input
            type="checkbox"
            className="h-4 w-4 shrink-0 rounded border-border accent-primary"
            checked={bulkChecked}
            onChange={(e) => onBulkCheckedChange(e.target.checked)}
            aria-label={`Select ${row.fileName}`}
            onClick={(e) => e.stopPropagation()}
          />
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2 text-xs text-muted-foreground">
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
          </div>
          {organizationId && memberUserKey ? (
            <HubHierarchyLoanRowActions
              row={row}
              organizationId={organizationId}
              memberUserKey={memberUserKey}
              onOpen={onOpen}
              onDuplicated={onFileDuplicated}
            />
          ) : null}
          {row.ownership ? (
            <ResourceOwnershipLine presentation={row.ownership} compact />
          ) : null}
        </div>
        {(row.linkedClients?.length ?? 0) > 1 ? (
          <LinkedClientChipRow linkedClients={row.linkedClients ?? []} />
        ) : null}
        <PipelineHubRelationshipBadges row={row} compact />
      </div>
      <div className="hidden flex-wrap items-start gap-2 md:flex">
        <input
          type="checkbox"
          className="mt-1 h-4 w-4 shrink-0 rounded border-border accent-primary"
          checked={bulkChecked}
          onChange={(e) => onBulkCheckedChange(e.target.checked)}
          aria-label={`Select ${row.fileName}`}
          onClick={(e) => e.stopPropagation()}
        />
        <div className="min-w-0 flex-1">
          <button type="button" className="w-full text-left" onClick={onOpen}>
            <PipelineFileRowHierarchyStack row={row} />
            {(row.linkedClients?.length ?? 0) > 1 ? (
              <LinkedClientChipRow linkedClients={row.linkedClients ?? []} />
            ) : null}
            <PipelineHubRelationshipBadges row={row} compact />
          </button>
          <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
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
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          {organizationId && memberUserKey ? (
            <HubHierarchyLoanRowActions
              row={row}
              organizationId={organizationId}
              memberUserKey={memberUserKey}
              onOpen={onOpen}
              onDuplicated={onFileDuplicated}
            />
          ) : null}
          {row.ownership ? (
            <ResourceOwnershipLine presentation={row.ownership} compact />
          ) : null}
        </div>
      </div>
      <div
        className="flex flex-wrap items-center gap-2"
        onClick={(e) => e.stopPropagation()}
      >
        <PipelineStageSelector
          stageId={row.stageId}
          subStageId={row.subStageId}
          readOnly={!row.canEditFile}
          compact
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
    </div>
    </HubTriageHighlightFrame>
  );
}

function ProjectSection({
  project,
  expansion,
  onToggleProject,
  bulkIds,
  toggleBulkOne,
  selectFile,
  selectFileNotes,
  statusOptions,
  onChangeRowStatus,
  onSetClientMomentum,
  hubFocusFileId,
  organizationId,
  memberUserKey,
  onAddLoanFile,
  onFileDuplicated,
  triageHighlights = EMPTY_HUB_TRIAGE_HIGHLIGHT_MAP,
}: {
  project: HubProjectNode;
  expansion: HubHierarchyExpansionState;
  onToggleProject: (projectId: string) => void;
  bulkIds: Set<Id<"pipeline">>;
  toggleBulkOne: (id: Id<"pipeline">, checked: boolean) => void;
  selectFile: (id: Id<"pipeline">) => void;
  selectFileNotes: (id: Id<"pipeline">) => void;
  statusOptions: InlineSelectOption[];
  onChangeRowStatus: (
    fileId: Id<"pipeline">,
    next: {
      stageId?: Id<"organizationPipelineStages">;
      subStageId?: Id<"organizationPipelineSubStages">;
    },
  ) => void;
  onSetClientMomentum?: (fileId: Id<"pipeline">, n: number | null) => void;
  hubFocusFileId: Id<"pipeline"> | null;
  organizationId?: Id<"organizations">;
  memberUserKey?: string;
  onAddLoanFile?: (projectId: Id<"projects">) => void;
  onFileDuplicated?: (fileId: Id<"pipeline">) => void;
  triageHighlights?: HubTriageHighlightMapView;
}) {
  const expanded = isProjectExpanded(expansion, project.projectId);
  const showNested = hubHierarchySectionVisible(expanded);
  usePipelineLayoutRemountProbe("PipelineHubProjectRow", project.projectId);
  const projectHighlight =
    resolveTriageHighlight(triageHighlights, {
      kind: "project",
      id: project.projectId,
    });
  const projectTaskCounts = resolveTaskRollupCounts(triageHighlights, {
    kind: "project",
    id: project.projectId,
  });
  const canInlineCreate =
    Boolean(organizationId && memberUserKey?.trim()) &&
    hubEntitySupportsInlineCreate(project.projectId) &&
    Boolean(onAddLoanFile);
  const extraClients = countExtraClients(project.projectLinkedClients.length);
  const stageMix = Object.entries(project.activeStageMix)
    .map(([k, n]) => `${n}× ${k.slice(-6)}`)
    .slice(0, 3)
    .join(", ");
  const capital = project.capitalRollup;
  const projectLoans = project.loans.map((l) => ({
    id: String(l.row._id),
    fileName: l.row.fileName,
  }));

  return (
    <div
      className={cn("group/hub-project", HIERARCHY_PROJECT_RAIL_CLASS)}
      data-testid="pipeline-hub-project-row"
      data-pipeline-hub-component="ProjectSection"
    >
      <HubTriageHighlightFrame
        highlight={projectHighlight}
        className={cn(projectHighlight && "pr-28")}
        badgeClassName="top-1"
      >
      <RowShell
        stackOnMobile
        onRowClick={() => onToggleProject(project.projectId)}
        aria-expanded={expanded}
        left={
          <>
            <HubExpandChevron
              expanded={expanded}
              onToggle={() => onToggleProject(project.projectId)}
              label={project.title}
            />
            <FolderKanban className="h-4 w-4 shrink-0 text-primary/70" />
          </>
        }
        primary={
          <>
            <span className="hidden min-w-0 items-center gap-1.5 overflow-hidden md:flex">
              <span className="min-w-0 truncate text-sm font-semibold text-foreground">
                {project.title}
              </span>
              {extraClients > 0 ? (
                <span className="shrink-0 text-xs font-medium text-muted-foreground">
                  +{extraClients}
                </span>
              ) : null}
              {capital && capital.requirementCount > 0 ? (
                <CapitalGapBadge health={capital.gapHealth} />
              ) : null}
              <TaskRollupBadge counts={projectTaskCounts} />
            </span>
            <span className={cn(mobilePrimaryTitleClass, "md:hidden")}>
              {project.title}
            </span>
          </>
        }
        primaryTooltip={project.title}
        mobileSecondary={
          <>
            {extraClients > 0 ? (
              <span className="shrink-0 text-xs font-medium text-muted-foreground">
                +{extraClients}
              </span>
            ) : null}
            {capital && capital.requirementCount > 0 ? (
              <CapitalGapBadge health={capital.gapHealth} />
            ) : null}
            <TaskRollupBadge counts={projectTaskCounts} />
            <RowShellMetadata className="max-md:block md:hidden">
              {rowShellMetaItems([
                { label: "Loans", value: String(project.loanCount) },
                { label: "Stack", value: fmtHubFunding(project.stackFunding) },
                { label: "Done", value: `${project.completionPercent}%` },
                ...(capital && capital.totalRequired > 0
                  ? [
                      {
                        label: "Required",
                        value: formatCapitalMoney(capital.totalRequired),
                      },
                      {
                        label: "Funded",
                        value: formatCapitalMoney(capital.totalFunded),
                      },
                      {
                        label: "Coverage",
                        value: `${capital.fundingCoveragePercent}%`,
                      },
                    ]
                  : []),
                ...(stageMix ? [{ label: "Stages", value: stageMix }] : []),
              ])}
            </RowShellMetadata>
            {organizationId && memberUserKey ? (
              <HubHierarchyProjectActions
                organizationId={organizationId}
                memberUserKey={memberUserKey}
                hubProjectKey={project.projectId}
                title={project.title}
                onAddLoanFile={
                  canInlineCreate
                    ? () => onAddLoanFile!(project.projectId as Id<"projects">)
                    : undefined
                }
              />
            ) : null}
          </>
        }
        meta={rowShellMetaItems([
          { label: "Loans", value: String(project.loanCount) },
          { label: "Stack", value: fmtHubFunding(project.stackFunding) },
          { label: "Done", value: `${project.completionPercent}%` },
          ...(capital && capital.totalRequired > 0
            ? [
                {
                  label: "Required",
                  value: formatCapitalMoney(capital.totalRequired),
                },
                {
                  label: "Funded",
                  value: formatCapitalMoney(capital.totalFunded),
                },
                {
                  label: "Coverage",
                  value: `${capital.fundingCoveragePercent}%`,
                },
              ]
            : []),
          ...(stageMix ? [{ label: "Stages", value: stageMix }] : []),
        ])}
        actions={
          organizationId && memberUserKey ? (
            <HubHierarchyProjectActions
              organizationId={organizationId}
              memberUserKey={memberUserKey}
              hubProjectKey={project.projectId}
              title={project.title}
              onAddLoanFile={
                canInlineCreate
                  ? () => onAddLoanFile!(project.projectId as Id<"projects">)
                  : undefined
              }
            />
          ) : null
        }
      />
      </HubTriageHighlightFrame>
      {showNested && (
        <div
          className={cn(
            "space-y-2 pb-2 pl-6",
            project.loans.length > 1 && "rounded-md bg-muted/15 p-2",
          )}
          data-testid={
            project.loans.length > 1 ? "pipeline-project-loan-stack" : undefined
          }
        >
          <HubProjectDetailSubsections
            projectId={project.projectId}
            organizationId={organizationId}
            memberUserKey={memberUserKey}
            projectLoans={projectLoans}
          />
          {project.projectLinkedClients.length > 1 ? (
            <LinkedClientChipRow
              linkedClients={project.projectLinkedClients}
              expanded
            />
          ) : null}
          {project.loans.map((loan, idx) => (
            <LoanStackRow
              key={loan.row._id}
              row={loan.row}
              stackIndex={idx}
              stackTotal={project.loans.length}
              clientPlacement={loan.clientPlacement}
              bulkChecked={bulkIds.has(loan.row._id)}
              onBulkCheckedChange={(c) => toggleBulkOne(loan.row._id, c)}
              onOpen={() => selectFile(loan.row._id)}
              onOpenNotes={() => selectFileNotes(loan.row._id)}
              statusOptions={statusOptions}
              onChangeRowStatus={(next) => onChangeRowStatus(loan.row._id, next)}
              onSetClientMomentum={
                onSetClientMomentum
                  ? (n) => onSetClientMomentum(loan.row._id, n)
                  : undefined
              }
              hubFocusFileId={hubFocusFileId}
              organizationId={organizationId}
              memberUserKey={memberUserKey}
              onFileDuplicated={onFileDuplicated}
              triageHighlights={triageHighlights}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ClientSection({
  client,
  expansion,
  onToggleClient,
  onToggleProject,
  bulkIds,
  toggleBulkOne,
  selectFile,
  selectFileNotes,
  statusOptions,
  onChangeRowStatus,
  onSetClientMomentum,
  hubFocusFileId,
  organizationId,
  memberUserKey,
  onAddProject,
  onAddLoanFile,
  onFileDuplicated,
  triageHighlights = EMPTY_HUB_TRIAGE_HIGHLIGHT_MAP,
}: {
  client: HubClientNode;
  expansion: HubHierarchyExpansionState;
  onToggleClient: (clientId: string) => void;
  onToggleProject: (projectId: string) => void;
  bulkIds: Set<Id<"pipeline">>;
  toggleBulkOne: (id: Id<"pipeline">, checked: boolean) => void;
  selectFile: (id: Id<"pipeline">) => void;
  selectFileNotes: (id: Id<"pipeline">) => void;
  statusOptions: InlineSelectOption[];
  onChangeRowStatus: (
    fileId: Id<"pipeline">,
    next: {
      stageId?: Id<"organizationPipelineStages">;
      subStageId?: Id<"organizationPipelineSubStages">;
    },
  ) => void;
  onSetClientMomentum?: (fileId: Id<"pipeline">, n: number | null) => void;
  hubFocusFileId: Id<"pipeline"> | null;
  organizationId?: Id<"organizations">;
  memberUserKey?: string;
  onAddProject?: (clientId: Id<"clients">) => void;
  onAddLoanFile?: (projectId: Id<"projects">) => void;
  onFileDuplicated?: (fileId: Id<"pipeline">) => void;
  triageHighlights?: HubTriageHighlightMapView;
}) {
  const router = useRouter();
  const expanded = isClientExpanded(expansion, client.clientId);
  const showNested = hubHierarchySectionVisible(expanded);
  const fractalClient = shouldOpenClientWorkspace(client.clientId);
  const handleClientRowActivate = () => {
    if (fractalClient) {
      router.push(pipelineHubClientHref(client.clientId));
      return;
    }
    onToggleClient(client.clientId);
  };
  usePipelineLayoutRemountProbe("PipelineHubClientRow", client.clientId);
  const clientHighlight = resolveTriageHighlight(triageHighlights, {
    kind: "client",
    id: client.clientId,
  });
  const clientTaskCounts = resolveTaskRollupCounts(triageHighlights, {
    kind: "client",
    id: client.clientId,
  });
  const canInlineCreate =
    Boolean(organizationId && memberUserKey?.trim()) &&
    hubEntitySupportsInlineCreate(client.clientId) &&
    Boolean(onAddProject);
  return (
    <section
      className={cn("group/hub-client", HIERARCHY_CLIENT_CLUSTER_CLASS)}
      data-testid="pipeline-hub-client"
      data-pipeline-hub-component="ClientSection"
    >
      <HubTriageHighlightFrame
        highlight={clientHighlight}
        className={cn(clientHighlight && "pr-28")}
        badgeClassName="top-1"
      >
      <RowShell
        stackOnMobile
        className="px-3"
        onRowClick={handleClientRowActivate}
        aria-expanded={expanded}
        left={
          <>
            <HubExpandChevron
              expanded={expanded}
              onToggle={() => onToggleClient(client.clientId)}
              label={client.displayName}
            />
            <User className="h-4 w-4 shrink-0 text-foreground/70" />
          </>
        }
        primary={
          <span className="flex min-w-0 items-center gap-1.5">
            <Link
              href={pipelineHubClientHref(client.clientId)}
              className="min-w-0 hover:underline"
              title={`Open client workspace: ${client.displayName}`}
              data-testid={`pipeline-hub-client-link-${client.clientId}`}
              onClick={(e) => e.stopPropagation()}
            >
              <RowShellTitle allowWrapOnMobile>{client.displayName}</RowShellTitle>
            </Link>
            <TaskRollupBadge counts={clientTaskCounts} className="max-md:hidden" />
          </span>
        }
        primaryTooltip={client.displayName}
        mobileSecondary={
          <>
            <TaskRollupBadge counts={clientTaskCounts} />
            <RowShellMetadata className="max-md:block md:hidden">
              {rowShellMetaItems([
                { label: "Projects", value: String(client.projectCount) },
                { label: "Loans", value: String(client.loanCount) },
                { label: "Funding", value: fmtHubFunding(client.aggregateFunding) },
                { label: "Done", value: `${client.completionPercent}%` },
              ])}
            </RowShellMetadata>
            {organizationId && memberUserKey ? (
              <HubHierarchyClientActions
                organizationId={organizationId}
                memberUserKey={memberUserKey}
                hubClientKey={client.clientId}
                displayName={client.displayName}
                onAddProject={
                  canInlineCreate
                    ? () => onAddProject!(client.clientId as Id<"clients">)
                    : undefined
                }
              />
            ) : null}
          </>
        }
        meta={rowShellMetaItems([
          { label: "Projects", value: String(client.projectCount) },
          { label: "Loans", value: String(client.loanCount) },
          { label: "Funding", value: fmtHubFunding(client.aggregateFunding) },
          { label: "Done", value: `${client.completionPercent}%` },
        ])}
        actions={
          organizationId && memberUserKey ? (
            <HubHierarchyClientActions
              organizationId={organizationId}
              memberUserKey={memberUserKey}
              hubClientKey={client.clientId}
              displayName={client.displayName}
              onAddProject={
                canInlineCreate
                  ? () => onAddProject!(client.clientId as Id<"clients">)
                  : undefined
              }
            />
          ) : null
        }
      />
      </HubTriageHighlightFrame>
      {showNested && organizationId && memberUserKey?.trim() ? (
        <ClientNotesSubsection
          client={client}
          organizationId={organizationId}
          memberUserKey={memberUserKey.trim()}
        />
      ) : null}
      {showNested && (
        <div className="space-y-1 border-t-2 border-border/50 px-1 pb-2 pt-1">
          {client.projects.map((project) => (
            <ProjectSection
              key={project.projectId}
              project={project}
              expansion={expansion}
              onToggleProject={onToggleProject}
              bulkIds={bulkIds}
              toggleBulkOne={toggleBulkOne}
              selectFile={selectFile}
              selectFileNotes={selectFileNotes}
              statusOptions={statusOptions}
              onChangeRowStatus={onChangeRowStatus}
              onSetClientMomentum={onSetClientMomentum}
              hubFocusFileId={hubFocusFileId}
              organizationId={organizationId}
              memberUserKey={memberUserKey}
              onAddLoanFile={onAddLoanFile}
              onFileDuplicated={onFileDuplicated}
              triageHighlights={triageHighlights}
            />
          ))}
        </div>
      )}
    </section>
  );
}

export function PipelineHubHierarchyView({
  clients,
  expansion,
  onExpansionChange,
  bulkIds,
  toggleBulkOne,
  selectFile,
  selectFileNotes,
  statusOptions,
  onChangeRowStatus,
  onSetClientMomentum,
  hubFocusFileId,
  organizationId,
  memberUserKey,
  onAddProject,
  onAddLoanFile,
  onFileDuplicated,
  triageHighlights = EMPTY_HUB_TRIAGE_HIGHLIGHT_MAP,
}: {
  clients: HubClientNode[];
  expansion: HubHierarchyExpansionState;
  onExpansionChange: (next: HubHierarchyExpansionState) => void;
  bulkIds: Set<Id<"pipeline">>;
  toggleBulkOne: (id: Id<"pipeline">, checked: boolean) => void;
  selectFile: (id: Id<"pipeline">) => void;
  selectFileNotes: (id: Id<"pipeline">) => void;
  statusOptions: InlineSelectOption[];
  onChangeRowStatus: (
    fileId: Id<"pipeline">,
    next: {
      stageId?: Id<"organizationPipelineStages">;
      subStageId?: Id<"organizationPipelineSubStages">;
    },
  ) => void;
  onSetClientMomentum?: (fileId: Id<"pipeline">, n: number | null) => void;
  hubFocusFileId: Id<"pipeline"> | null;
  organizationId?: Id<"organizations">;
  memberUserKey?: string;
  onAddProject?: (clientId: Id<"clients">) => void;
  onAddLoanFile?: (projectId: Id<"projects">) => void;
  onFileDuplicated?: (fileId: Id<"pipeline">) => void;
  triageHighlights?: HubTriageHighlightMapView;
}) {
  const toggleClient = (clientId: string) => {
    const next = {
      ...expansion,
      clients: { ...(expansion.clients ?? {}) },
      projects: { ...(expansion.projects ?? {}) },
    };
    next.clients[clientId] = !isClientExpanded(expansion, clientId);
    onExpansionChange(next);
  };
  const toggleProject = (projectId: string) => {
    const next = {
      ...expansion,
      clients: { ...(expansion.clients ?? {}) },
      projects: { ...(expansion.projects ?? {}) },
    };
    next.projects[projectId] = !isProjectExpanded(expansion, projectId);
    onExpansionChange(next);
  };

  usePipelineLayoutRemountProbe("PipelineHubHierarchyView", "root");

  return (
    <div
      className="min-w-0 max-w-full space-y-3"
      data-testid="pipeline-hub-hierarchy"
      data-pipeline-hub-hierarchy
      data-clipping-parent="pipeline-hub-hierarchy"
    >
      {clients.map((client) => (
        <ClientSection
          key={client.clientId}
          client={client}
          expansion={expansion}
          onToggleClient={toggleClient}
          onToggleProject={toggleProject}
          bulkIds={bulkIds}
          toggleBulkOne={toggleBulkOne}
          selectFile={selectFile}
          selectFileNotes={selectFileNotes}
          statusOptions={statusOptions}
          onChangeRowStatus={onChangeRowStatus}
          onSetClientMomentum={onSetClientMomentum}
          hubFocusFileId={hubFocusFileId}
          organizationId={organizationId}
          memberUserKey={memberUserKey}
          onAddProject={onAddProject}
          onAddLoanFile={onAddLoanFile}
          onFileDuplicated={onFileDuplicated}
          triageHighlights={triageHighlights}
        />
      ))}
    </div>
  );
}
