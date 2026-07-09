"use client";

import { useCallback, useMemo, useState } from "react";
import {
  Building2,
  CheckSquare,
  FolderKanban,
  Handshake,
  Landmark,
  ListTree,
  Plus,
  User,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import type { Id } from "@/convex/_generated/dataModel";
import { cn } from "@/lib/cn";
import type { HubTriageHighlightMapView } from "@/lib/pipeline/hubTriageHighlight";
import { useHubTriageHighlightMap } from "@/hooks/useHubTriageHighlightMap";
import { PipelineHubHierarchyView } from "@/components/pipeline/PipelineHubHierarchyView";
import { PipelineHubFileRow } from "@/components/pipeline/PipelineHubFileRow";
import { LinkedClientChipRow } from "@/components/pipeline/ClientRelationshipBadge";
import { fmtHubFunding } from "@/lib/pipeline/hubHierarchyTree";
import type { HubHierarchyExpansionState } from "@/lib/pipeline/hubHierarchyExpansion";
import type {
  EntityFocusNode,
  HubProjectionMode,
  HubProjectFocusNode,
  TaskFocusNode,
  TaskFocusTree,
} from "@/lib/pipeline/graphProjection";
import { PipelineHubTaskFocusBadges } from "@/components/pipeline/PipelineHubTaskFocusBadges";
import type { HubClientNode } from "@/lib/pipeline/hubHierarchyTree";
import type { PipelineTablePreviewRow } from "@/lib/pipelineTablePreview";
import {
  groupPipelineRowsByParentStage,
  type PipelineHubStageGroupedFileList,
  type PipelineStageIndex,
} from "@/lib/pipeline/groupPipelineRowsByParentStage";
import {
  PipelineHubParentStageHeader,
  PipelineHubUnassignedStageHeader,
} from "@/components/pipeline/PipelineHubParentStageHeader";
import type { InlineSelectOption } from "@/components/inline";
import { hubHierarchySectionVisible } from "@/lib/debug/phase24-4I-hub-stabilization";
import { HubExpandChevron } from "@/components/pipeline/HubExpandChevron";
import { HubProjectDetailSubsections } from "@/components/pipeline/HubProjectDetailSubsections";

function fileRowParentPath(row: PipelineTablePreviewRow): string | undefined {
  const client = row.clientDisplayName?.trim();
  const project = row.projectDisplayTitle?.trim();
  if (client && project) return `${client} › ${project}`;
  return client || project || undefined;
}

type FileRowProps = {
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
  onFileDuplicated?: (fileId: Id<"pipeline">) => void;
  triageHighlights?: HubTriageHighlightMapView;
};

function EntitySection({
  node,
  icon: Icon,
  expanded,
  onToggle,
  testId,
  fileRowProps,
  stageIndex,
}: {
  node: EntityFocusNode;
  icon: React.ComponentType<{ className?: string }>;
  expanded: boolean;
  onToggle: () => void;
  testId: string;
  fileRowProps: FileRowProps;
  stageIndex: PipelineStageIndex;
}) {
  const showNested = hubHierarchySectionVisible(expanded);
  const groupedLoans = useMemo(() => {
    if (!showNested || node.loans.length === 0) {
      return { groups: [], unassigned: null };
    }
    return groupPipelineRowsByParentStage(
      node.loans.map((loan) => loan.row),
      stageIndex,
    );
  }, [showNested, node.loans, stageIndex]);

  const renderEntityFileRow = (row: PipelineTablePreviewRow) => (
    <PipelineHubFileRow
      key={row._id}
      row={row}
      stackIndex={0}
      stackTotal={1}
      bulkChecked={fileRowProps.bulkIds.has(row._id)}
      onBulkCheckedChange={(c) => fileRowProps.toggleBulkOne(row._id, c)}
      onOpen={() => fileRowProps.selectFile(row._id)}
      onOpenNotes={() => fileRowProps.selectFileNotes(row._id)}
      statusOptions={fileRowProps.statusOptions}
      onChangeRowStatus={(next) =>
        fileRowProps.onChangeRowStatus(row._id, next)
      }
      onSetClientMomentum={
        fileRowProps.onSetClientMomentum
          ? (n) => fileRowProps.onSetClientMomentum!(row._id, n)
          : undefined
      }
      hubFocusFileId={fileRowProps.hubFocusFileId}
      organizationId={fileRowProps.organizationId}
      memberUserKey={fileRowProps.memberUserKey}
      onFileDuplicated={fileRowProps.onFileDuplicated}
      triageHighlights={fileRowProps.triageHighlights}
      parentPathLabel={`${node.label}${fileRowParentPath(row) ? ` › ${fileRowParentPath(row)}` : ""}`}
    />
  );

  return (
    <section
      className="rounded-lg border-2 border-border/70 bg-dlc-surface/80 shadow-dlc-1"
      data-testid={testId}
      data-pipeline-hub-component="EntitySection"
    >
      <div className="flex w-full items-start gap-2 px-3 py-3 hover:bg-muted/30">
        <HubExpandChevron
          expanded={expanded}
          onToggle={onToggle}
          label={node.label}
          className="mt-0.5"
        />
        <button
          type="button"
          className="flex min-w-0 flex-1 items-start gap-2 text-left"
          onClick={onToggle}
          aria-expanded={expanded}
        >
          <Icon className="mt-0.5 h-4 w-4 shrink-0 text-foreground/70" />
          <div className="min-w-0 flex-1">
            <div className="text-base font-semibold text-foreground">{node.label}</div>
            <p className="text-xs text-muted-foreground">
              {node.fileCount} linked file{node.fileCount === 1 ? "" : "s"} ·{" "}
              {fmtHubFunding(
                node.loans.reduce((n, l) => n + (l.row.fundingAmount ?? 0), 0),
              )}
            </p>
          </div>
        </button>
      </div>
      {showNested && (
        <div className="flex flex-col gap-3 border-t-2 border-border/50 px-3 pb-3 pt-2">
          {groupedLoans.groups.map((group, groupIdx) => (
            <section
              key={`${node.entityId}-${group.parentStageId}`}
              className="flex flex-col gap-2"
              aria-labelledby={`pipeline-hub-stage-${node.entityId}-${String(group.parentStageId)}`}
            >
              <PipelineHubParentStageHeader
                variant="nested"
                entityPrefixId={node.entityId}
                id={`pipeline-hub-stage-${node.entityId}-${String(group.parentStageId)}`}
                stage={group.parentStage}
                fileCount={group.rows.length}
                isFirstInSection={groupIdx === 0}
              />
              <div className="flex flex-col gap-2">
                {group.rows.map(renderEntityFileRow)}
              </div>
            </section>
          ))}
          {groupedLoans.unassigned ? (
            <section
              className="flex flex-col gap-2"
              aria-labelledby={`pipeline-hub-stage-unassigned-${node.entityId}`}
            >
              <PipelineHubUnassignedStageHeader
                variant="nested"
                entityPrefixId={node.entityId}
                fileCount={groupedLoans.unassigned.length}
                isFirstInSection={groupedLoans.groups.length === 0}
              />
              <div className="flex flex-col gap-2">
                {groupedLoans.unassigned.map(renderEntityFileRow)}
              </div>
            </section>
          ) : null}
        </div>
      )}
    </section>
  );
}

function ProjectFocusSection({
  project,
  expanded,
  onToggle,
  fileRowProps,
  onAddLoanFile,
}: {
  project: HubProjectFocusNode;
  expanded: boolean;
  onToggle: () => void;
  fileRowProps: FileRowProps;
  onAddLoanFile?: (projectId: Id<"projects">) => void;
}) {
  const showNested = hubHierarchySectionVisible(expanded);
  const canInlineCreate = !project.projectId.startsWith("legacy");
  return (
    <section
      className="rounded-lg border-2 border-border/70 bg-dlc-surface/80 shadow-dlc-1"
      data-testid="pipeline-hub-project-focus"
      data-pipeline-hub-component="ProjectFocusSection"
    >
      <div className="flex w-full items-start gap-2 px-3 py-3 hover:bg-muted/30">
        <HubExpandChevron
          expanded={expanded}
          onToggle={onToggle}
          label={project.title}
          className="mt-0.5"
        />
        <button
          type="button"
          className="flex min-w-0 flex-1 items-start gap-2 text-left"
          onClick={onToggle}
          aria-expanded={expanded}
        >
          <FolderKanban className="mt-0.5 h-4 w-4 shrink-0 text-primary/70" />
          <div className="min-w-0 flex-1">
            <div className="text-base font-semibold text-foreground">
              {project.title}
            </div>
            <p className="text-xs text-muted-foreground">
              {project.loanCount} file{project.loanCount === 1 ? "" : "s"} ·{" "}
              {fmtHubFunding(project.stackFunding)}
            </p>
          </div>
        </button>
        {canInlineCreate && onAddLoanFile ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="shrink-0 gap-1 border-primary/40 text-primary"
            data-testid="hub-add-loan-file"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onAddLoanFile(project.projectId as Id<"projects">);
            }}
          >
            <Plus className="h-3.5 w-3.5" aria-hidden />
            Add file
          </Button>
        ) : null}
      </div>
      {showNested && (
        <div className="space-y-3 border-t border-border/60 px-3 pb-3 pt-2">
          <HubProjectDetailSubsections
            projectId={project.projectId}
            organizationId={fileRowProps.organizationId}
            memberUserKey={fileRowProps.memberUserKey}
            projectLoans={project.loans.map((l) => ({
              id: String(l.row._id),
              fileName: l.row.fileName,
            }))}
          />
          {project.projectLinkedClients.length > 0 ? (
            <div>
              <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Associated clients
              </p>
              <LinkedClientChipRow
                linkedClients={project.projectLinkedClients}
                expanded
              />
            </div>
          ) : null}
          <div className="space-y-2">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Loan files
            </p>
            {project.loans.map((loan, idx) => (
            <PipelineHubFileRow
              key={loan.row._id}
              row={loan.row}
              stackIndex={idx}
              stackTotal={project.loans.length}
              bulkChecked={fileRowProps.bulkIds.has(loan.row._id)}
              onBulkCheckedChange={(c) =>
                fileRowProps.toggleBulkOne(loan.row._id, c)
              }
              onOpen={() => fileRowProps.selectFile(loan.row._id)}
              onOpenNotes={() => fileRowProps.selectFileNotes(loan.row._id)}
              statusOptions={fileRowProps.statusOptions}
              onChangeRowStatus={(next) =>
                fileRowProps.onChangeRowStatus(loan.row._id, next)
              }
              onSetClientMomentum={
                fileRowProps.onSetClientMomentum
                  ? (n) => fileRowProps.onSetClientMomentum!(loan.row._id, n)
                  : undefined
              }
              hubFocusFileId={fileRowProps.hubFocusFileId}
              organizationId={fileRowProps.organizationId}
              memberUserKey={fileRowProps.memberUserKey}
              onFileDuplicated={fileRowProps.onFileDuplicated}
              triageHighlights={fileRowProps.triageHighlights}
              parentPathLabel={fileRowParentPath(loan.row)}
            />
          ))}
          </div>
        </div>
      )}
    </section>
  );
}

function TaskFocusRow({
  node,
  onOpenFile,
}: {
  node: TaskFocusNode;
  onOpenFile: (fileId: Id<"pipeline">) => void;
}) {
  return (
    <button
      type="button"
      className="flex w-full flex-col rounded-md border-2 border-border/60 bg-background px-3 py-2 text-left shadow-sm transition-colors hover:bg-muted/30"
      onClick={() => onOpenFile(node.row._id)}
      data-testid={`pipeline-hub-task-row-${node.taskId}`}
    >
      <div className="flex items-start gap-2">
        <CheckSquare className="mt-0.5 h-4 w-4 shrink-0 text-primary/70" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-foreground">
            {node.label}
          </div>
          <PipelineHubTaskFocusBadges node={node} />
        </div>
      </div>
    </button>
  );
}

function TaskFocusView({
  taskTree,
  fileRowProps,
}: {
  taskTree: TaskFocusTree;
  fileRowProps: FileRowProps;
}) {
  return (
    <div className="space-y-4" data-testid="pipeline-hub-projection-task">
      {taskTree.open.length > 0 ? (
        <section>
          <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Open ({taskTree.open.length})
          </h3>
          <div className="space-y-2">
            {taskTree.open.map((node) => (
              <TaskFocusRow
                key={node.taskId}
                node={node}
                onOpenFile={fileRowProps.selectFile}
              />
            ))}
          </div>
        </section>
      ) : null}
      {taskTree.completed.length > 0 ? (
        <section>
          <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Completed ({taskTree.completed.length})
          </h3>
          <div className="space-y-2">
            {taskTree.completed.map((node) => (
              <TaskFocusRow
                key={node.taskId}
                node={node}
                onOpenFile={fileRowProps.selectFile}
              />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

export function PipelineHubProjectionView({
  mode,
  clientTree,
  projectTree,
  fileFlatGrouped,
  lenderTree,
  referralTree,
  teamTree,
  taskTree,
  expansion,
  onExpansionChange,
  organizationId,
  memberUserKey,
  onAddProject,
  onAddLoanFile,
  onFileDuplicated,
  stageIndex,
  ...fileRowProps
}: {
  mode: HubProjectionMode;
  stageIndex: PipelineStageIndex;
  clientTree: HubClientNode[];
  projectTree: HubProjectFocusNode[];
  fileFlatGrouped: PipelineHubStageGroupedFileList;
  lenderTree: EntityFocusNode[];
  referralTree: EntityFocusNode[];
  teamTree: EntityFocusNode[];
  taskTree: TaskFocusTree;
  expansion: HubHierarchyExpansionState;
  onExpansionChange: (next: HubHierarchyExpansionState) => void;
  organizationId?: Id<"organizations">;
  memberUserKey?: string;
  onAddProject?: (clientId: Id<"clients">) => void;
  onAddLoanFile?: (projectId: Id<"projects">) => void;
  onFileDuplicated?: (fileId: Id<"pipeline">) => void;
} & FileRowProps) {
  const triageHighlights = useHubTriageHighlightMap(
    organizationId,
    memberUserKey,
  );

  const enrichedFileRowProps: FileRowProps = {
    ...fileRowProps,
    organizationId,
    memberUserKey,
    onFileDuplicated,
    triageHighlights,
  };
  const [entityExpanded, setEntityExpanded] = useState<Record<string, boolean>>(
    {},
  );
  const toggleEntity = useCallback((id: string) => {
    setEntityExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
  }, []);

  if (mode === "client") {
    return (
      <PipelineHubHierarchyView
        clients={clientTree}
        expansion={expansion}
        onExpansionChange={onExpansionChange}
        organizationId={organizationId}
        memberUserKey={memberUserKey}
        onAddProject={onAddProject}
        onAddLoanFile={onAddLoanFile}
        onFileDuplicated={onFileDuplicated}
        triageHighlights={triageHighlights}
        {...enrichedFileRowProps}
      />
    );
  }

  if (mode === "project") {
    return (
      <div className="space-y-3" data-testid="pipeline-hub-projection-project">
        {projectTree.map((p) => (
          <ProjectFocusSection
            key={p.projectId}
            project={p}
            expanded={entityExpanded[p.projectId] ?? true}
            onToggle={() => toggleEntity(p.projectId)}
            fileRowProps={enrichedFileRowProps}
            onAddLoanFile={onAddLoanFile}
          />
        ))}
      </div>
    );
  }

  if (mode === "file") {
    const renderFileRow = (row: PipelineTablePreviewRow) => (
      <PipelineHubFileRow
        key={row._id}
        row={row}
        bulkChecked={enrichedFileRowProps.bulkIds.has(row._id)}
        onBulkCheckedChange={(c) =>
          enrichedFileRowProps.toggleBulkOne(row._id, c)
        }
        onOpen={() => enrichedFileRowProps.selectFile(row._id)}
        onOpenNotes={() => enrichedFileRowProps.selectFileNotes(row._id)}
        statusOptions={enrichedFileRowProps.statusOptions}
        onChangeRowStatus={(next) =>
          enrichedFileRowProps.onChangeRowStatus(row._id, next)
        }
        onSetClientMomentum={
          enrichedFileRowProps.onSetClientMomentum
            ? (n) => enrichedFileRowProps.onSetClientMomentum!(row._id, n)
            : undefined
        }
        hubFocusFileId={enrichedFileRowProps.hubFocusFileId}
        fileFocusBadges
        showGraphBadges={false}
        organizationId={organizationId}
        memberUserKey={memberUserKey}
        onFileDuplicated={onFileDuplicated}
        triageHighlights={enrichedFileRowProps.triageHighlights}
        parentPathLabel={fileRowParentPath(row)}
      />
    );

    return (
      <div
        className="flex flex-col gap-3"
        data-testid="pipeline-hub-projection-file"
      >
        {fileFlatGrouped.groups.map((group) => (
          <section
            key={group.parentStageId}
            className="flex flex-col gap-2"
            aria-labelledby={`pipeline-hub-stage-${String(group.parentStageId)}`}
          >
            <PipelineHubParentStageHeader
              variant="default"
              id={`pipeline-hub-stage-${String(group.parentStageId)}`}
              stage={group.parentStage}
              fileCount={group.rows.length}
              isFirstInSection={false}
            />
            <div className="flex flex-col gap-2">{group.rows.map(renderFileRow)}</div>
          </section>
        ))}
        {fileFlatGrouped.unassigned ? (
          <section
            className="flex flex-col gap-2"
            aria-labelledby="pipeline-hub-stage-unassigned"
          >
            <PipelineHubUnassignedStageHeader
              fileCount={fileFlatGrouped.unassigned.length}
            />
            <div className="flex flex-col gap-2">
              {fileFlatGrouped.unassigned.map(renderFileRow)}
            </div>
          </section>
        ) : null}
      </div>
    );
  }

  if (mode === "lender") {
    return (
      <div className="space-y-3" data-testid="pipeline-hub-projection-lender">
        {lenderTree.map((n) => (
          <EntitySection
            key={n.entityId}
            node={n}
            icon={Landmark}
            expanded={entityExpanded[n.entityId] ?? false}
            onToggle={() => toggleEntity(n.entityId)}
            testId="pipeline-hub-lender"
            fileRowProps={enrichedFileRowProps}
            stageIndex={stageIndex}
          />
        ))}
      </div>
    );
  }

  if (mode === "referral") {
    return (
      <div className="space-y-3" data-testid="pipeline-hub-projection-referral">
        {referralTree.map((n) => (
          <EntitySection
            key={n.entityId}
            node={n}
            icon={Handshake}
            expanded={entityExpanded[n.entityId] ?? false}
            onToggle={() => toggleEntity(n.entityId)}
            testId="pipeline-hub-referral"
            fileRowProps={enrichedFileRowProps}
            stageIndex={stageIndex}
          />
        ))}
      </div>
    );
  }

  if (mode === "team") {
    return (
      <div className="space-y-3" data-testid="pipeline-hub-projection-team">
        {teamTree.map((n) => (
          <EntitySection
            key={n.entityId}
            node={n}
            icon={Users}
            expanded={entityExpanded[n.entityId] ?? false}
            onToggle={() => toggleEntity(n.entityId)}
            testId="pipeline-hub-team"
            fileRowProps={enrichedFileRowProps}
            stageIndex={stageIndex}
          />
        ))}
      </div>
    );
  }

  return (
    <TaskFocusView taskTree={taskTree} fileRowProps={enrichedFileRowProps} />
  );
}

/** @deprecated Use `ProjectionModeSwitcher` from `@/components/ui/ProjectionModeSwitcher`. */
export { ProjectionModeSwitcher as PipelineHubProjectionSwitcher } from "@/components/ui/ProjectionModeSwitcher";

export const PROJECTION_MODE_ICONS = {
  client: User,
  project: FolderKanban,
  file: ListTree,
  lender: Landmark,
  referral: Handshake,
  team: Users,
  task: CheckSquare,
  building: Building2,
} as const;
