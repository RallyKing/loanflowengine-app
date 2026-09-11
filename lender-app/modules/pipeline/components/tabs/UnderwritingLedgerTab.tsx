"use client";

import { useLayoutEffect, useMemo, type ReactNode } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { CollapsibleBlock } from "@/components/ui/CollapsibleBlock";
import { OperationalSkeletonList } from "@/components/ui/OperationalSkeleton";
import { cn } from "@/lib/cn";
import { useDealWorkspaceEditor } from "@/lib/file/useDealWorkspaceEditor";
import {
  commercialMetricsMeta,
  underwritingActionQueueMeta,
  underwritingWorkflowMeta,
} from "@/lib/pipeline/collapsibleBlockMetadata";
import { premiumTabSectionSpaceClass } from "@/lib/pipeline/premiumWorkspaceUi";
import { UNDERWRITING_TAB_SECTION_IDS } from "@/lib/pipeline/fileWorkspaceTabRouting";
import {
  formatUnderwritingDueDate,
  type UnderwritingActionItem,
  underwritingDueDateUrgency,
} from "@/lib/pipeline/underwritingLedger";
import {
  internalWorkflowProgress,
  parseInternalWorkflowItems,
} from "@/lib/pipeline/internalWorkflow";
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  ClipboardList,
  Clock,
  ListChecks,
  TrendingUp,
} from "lucide-react";
import { LenderTrackingPanel } from "@/components/pipeline/underwriting/LenderTrackingPanel";
import { InternalWorkflowPanel } from "@/components/pipeline/underwriting/InternalWorkflowPanel";

export type UnderwritingLedgerSectionId =
  | "financialMetrics"
  | "actionQueue"
  | "lenderTrack"
  | "internalWorkflow";

export const UNDERWRITING_LEDGER_SECTION_IDS: UnderwritingLedgerSectionId[] = [
  "financialMetrics",
  "actionQueue",
  "lenderTrack",
  "internalWorkflow",
];

export type UnderwritingSectionRenderer = (dragHandle: ReactNode) => ReactNode;

export type RegisterUnderwritingSections = (
  sections: Partial<
    Record<UnderwritingLedgerSectionId, UnderwritingSectionRenderer>
  >,
  contentSig?: string,
) => void;

export type UnderwritingLedgerTabProps = {
  fileId: Id<"pipeline">;
  memberUserKey?: string;
  className?: string;
  /** Parent owns DnD — register section renderers instead of stacking locally. */
  suppressInternalDnd?: boolean;
  onRegisterSections?: RegisterUnderwritingSections;
};

function ActionTypeBadge({ type }: { type: UnderwritingActionItem["type"] }) {
  if (type === "task") {
    return (
      <span
        className="inline-flex max-w-full items-center rounded-full border border-slate-300 bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-800 dark:border-slate-600 dark:bg-slate-900/70 dark:text-slate-200"
        data-testid="pipeline-underwriting-action-type-task"
      >
        Internal Task
      </span>
    );
  }

  return (
    <span
      className="inline-flex max-w-full items-center rounded-full border border-indigo-300 bg-indigo-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-indigo-900 dark:border-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-200"
      data-testid="pipeline-underwriting-action-type-client-request"
    >
      Client Request
    </span>
  );
}

function DueDateAnchor({ dueDate }: { dueDate: number }) {
  const urgency = underwritingDueDateUrgency(dueDate);
  const label = formatUnderwritingDueDate(dueDate);
  const isWarning = urgency === "past_due" || urgency === "due_soon";

  return (
    <div
      className={cn(
        "flex w-full flex-col items-start gap-0.5 text-left sm:w-auto sm:min-w-[9.5rem] sm:items-end sm:text-right",
        isWarning ? "text-amber-800 dark:text-amber-200" : "text-foreground",
      )}
      data-testid="pipeline-underwriting-action-due-date"
      data-due-urgency={urgency ?? undefined}
    >
      <span className="inline-flex items-center gap-1 text-xs font-semibold tabular-nums">
        {isWarning ? (
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden />
        ) : (
          <Clock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
        )}
        {label}
      </span>
      <span
        className={cn(
          "text-[10px] font-semibold uppercase tracking-wide",
          urgency === "past_due"
            ? "text-destructive"
            : urgency === "due_soon"
              ? "text-amber-700 dark:text-amber-300"
              : "text-muted-foreground",
        )}
      >
        {urgency === "past_due"
          ? "Past due"
          : urgency === "due_soon"
            ? "Due within 24h"
            : "Due date"}
      </span>
    </div>
  );
}

function ActionQueueRow({ item }: { item: UnderwritingActionItem }) {
  return (
    <li
      className="rounded-dlc-md border border-border/70 bg-background/70 px-3 py-3 transition-colors duration-dlc-short ease-dlc-standard sm:px-4"
      data-testid={`pipeline-underwriting-action-row-${item.id}`}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <ActionTypeBadge type={item.type} />
            <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              {item.status.replace(/_/g, " ")}
            </span>
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold leading-snug text-foreground break-words">
              {item.title}
            </p>
            {item.type === "client_request" && item.clientEmail ? (
              <p className="mt-1 text-xs text-muted-foreground break-all">
                Requested from:{" "}
                <span className="font-medium text-foreground/90">
                  {item.clientEmail}
                </span>
              </p>
            ) : item.assignedToKey ? (
              <p className="mt-1 text-xs text-muted-foreground">
                Assigned:{" "}
                <span className="font-medium text-foreground/90">
                  {item.assignedToKey}
                </span>
              </p>
            ) : null}
          </div>
        </div>

        <div className="flex shrink-0 flex-col items-start gap-1 sm:items-end">
          {item.dueDate != null ? (
            <DueDateAnchor dueDate={item.dueDate} />
          ) : (
            <span
              className="inline-flex items-center rounded-dlc-sm border border-border/60 bg-muted/30 px-2 py-1 text-[10px] font-medium text-muted-foreground"
              data-testid="pipeline-underwriting-action-no-deadline"
            >
              No explicit deadline
            </span>
          )}
        </div>
      </div>
    </li>
  );
}

function ActionQueueBody({
  fileId,
  memberUserKey,
}: {
  fileId: Id<"pipeline">;
  memberUserKey?: string;
}) {
  const qArgs = useMemo(
    () => (memberUserKey ? { fileId, memberUserKey } : { fileId }),
    [fileId, memberUserKey],
  );

  const actionItems = useQuery(api.underwritingLedger.listForFile, qArgs);

  if (actionItems === undefined) {
    return (
      <div data-testid="pipeline-underwriting-action-queue-skeleton">
        <OperationalSkeletonList rows={4} className="px-0.5" />
      </div>
    );
  }

  if (actionItems.length === 0) {
    return (
      <div
        className="rounded-dlc-md border border-emerald-300/70 bg-emerald-50/80 px-4 py-8 text-center dark:border-emerald-800 dark:bg-emerald-950/30"
        data-testid="pipeline-underwriting-action-queue-empty"
      >
        <CheckCircle2
          className="mx-auto h-8 w-8 text-emerald-600 dark:text-emerald-400"
          aria-hidden
        />
        <p className="mt-2 text-sm font-semibold text-foreground">
          No outstanding underwriting actions or requests.
        </p>
        <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">
          This file is moving clean — open tasks and client portal asks will
          appear here automatically.
        </p>
      </div>
    );
  }

  return (
    <ul
      className="space-y-2"
      data-testid="pipeline-underwriting-action-queue-list"
    >
      {actionItems.map((item) => (
        <ActionQueueRow key={item.id} item={item} />
      ))}
    </ul>
  );
}

export function UnderwritingLedgerTab({
  fileId,
  memberUserKey,
  className,
  suppressInternalDnd = false,
  onRegisterSections,
}: UnderwritingLedgerTabProps) {
  const { draft } = useDealWorkspaceEditor();

  const actionQArgs = useMemo(
    () => (memberUserKey ? { fileId, memberUserKey } : { fileId }),
    [fileId, memberUserKey],
  );
  const actionItems = useQuery(api.underwritingLedger.listForFile, actionQArgs);

  const detailArgs = useMemo(
    () => (memberUserKey ? { id: fileId, memberUserKey } : { id: fileId }),
    [fileId, memberUserKey],
  );
  const detail = useQuery(api.pipeline.getDetail, detailArgs);

  const workflowItems = useMemo(() => {
    if (!detail) return undefined;
    const dealData = detail.pipeline.dealData as
      | { workflow?: unknown }
      | undefined;
    return parseInternalWorkflowItems(dealData?.workflow);
  }, [detail]);

  const workflowProgress =
    workflowItems === undefined
      ? null
      : internalWorkflowProgress(workflowItems);

  const financialMeta = commercialMetricsMeta(draft);
  const actionMeta = underwritingActionQueueMeta(actionItems?.length);
  const workflowMeta = underwritingWorkflowMeta(
    workflowProgress?.completed ?? 0,
    workflowProgress?.total ?? 0,
  );

  const contentSig = useMemo(
    () =>
      [
        financialMeta.status,
        financialMeta.summary,
        actionMeta.status,
        actionMeta.summary,
        String(actionMeta.indicatorCount ?? ""),
        workflowMeta.status,
        workflowMeta.summary,
        String(workflowMeta.indicatorCount ?? ""),
      ].join("|"),
    [actionMeta, financialMeta, workflowMeta],
  );

  const renderSection = (
    sectionId: UnderwritingLedgerSectionId,
    dragHandle?: ReactNode,
  ): ReactNode => {
    const headerRight = dragHandle ?? undefined;
    switch (sectionId) {
      case "financialMetrics":
        return (
          <CollapsibleBlock
            id={UNDERWRITING_TAB_SECTION_IDS.financialMetrics}
            title="Financial metrics"
            status={financialMeta.status}
            summary={financialMeta.summary}
            badgeVariant={financialMeta.badgeVariant}
            icon={<TrendingUp className="h-4 w-4" aria-hidden />}
            headerRight={headerRight}
            description="DSCR, LTV, and commercial underwriting ratios from the deal workspace."
            defaultOpen={false}
          >
            <p className="text-sm text-muted-foreground">
              Metrics are sourced from the commercial / DSCR workspace. Edit rent
              roll and loan terms in{" "}
              <span className="font-medium text-foreground">
                Deal Workspace → Financial metrics
              </span>{" "}
              to refresh these values.
            </p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div className="rounded-dlc-md border border-border/70 bg-muted/20 px-3 py-2.5">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Summary
                </p>
                <p className="mt-1 text-sm font-semibold text-foreground tabular-nums">
                  {financialMeta.summary}
                </p>
              </div>
              <div className="rounded-dlc-md border border-border/70 bg-muted/20 px-3 py-2.5">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Risk rating
                </p>
                <p className="mt-1 text-sm font-semibold text-foreground">
                  {financialMeta.status === "Calculated"
                    ? "Under review"
                    : "Pending inputs"}
                </p>
              </div>
            </div>
          </CollapsibleBlock>
        );
      case "actionQueue":
        return (
          <CollapsibleBlock
            id={UNDERWRITING_TAB_SECTION_IDS.actionQueue}
            title="Action queue"
            status={actionMeta.status}
            summary={actionMeta.summary}
            indicatorCount={actionMeta.indicatorCount}
            badgeVariant={actionMeta.badgeVariant}
            icon={<ListChecks className="h-4 w-4" aria-hidden />}
            headerRight={headerRight}
            description="Open internal tasks and client portal requests — merged and sorted by due date."
            defaultOpen={false}
          >
            <ActionQueueBody fileId={fileId} memberUserKey={memberUserKey} />
          </CollapsibleBlock>
        );
      case "lenderTrack":
        return (
          <CollapsibleBlock
            id={UNDERWRITING_TAB_SECTION_IDS.lenderTrack}
            title="Lender track"
            status="Tracking"
            summary="Submission milestones and lender relationship status"
            icon={<Building2 className="h-4 w-4" aria-hidden />}
            headerRight={headerRight}
            description="Coversheet milestones and lender pipeline status for this file."
            defaultOpen={false}
          >
            <LenderTrackingPanel
              fileId={fileId}
              memberUserKey={memberUserKey}
            />
          </CollapsibleBlock>
        );
      case "internalWorkflow":
        return (
          <CollapsibleBlock
            id={UNDERWRITING_TAB_SECTION_IDS.internalWorkflow}
            title="Internal workflow"
            status={workflowMeta.status}
            summary={workflowMeta.summary}
            indicatorCount={workflowMeta.indicatorCount}
            badgeVariant={workflowMeta.badgeVariant}
            icon={<ClipboardList className="h-4 w-4" aria-hidden />}
            headerRight={headerRight}
            description="Check off mileposts, edit steps, and switch checklist templates."
            defaultOpen={false}
          >
            <InternalWorkflowPanel
              fileId={fileId}
              memberUserKey={memberUserKey}
            />
          </CollapsibleBlock>
        );
      default:
        return null;
    }
  };

  useLayoutEffect(() => {
    if (!suppressInternalDnd || !onRegisterSections) return;
    const sections: Partial<
      Record<UnderwritingLedgerSectionId, UnderwritingSectionRenderer>
    > = {};
    for (const id of UNDERWRITING_LEDGER_SECTION_IDS) {
      sections[id] = (dragHandle) => renderSection(id, dragHandle);
    }
    onRegisterSections(sections, contentSig);
    // renderSection closes over latest meta/query state via contentSig.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional register on contentSig
  }, [contentSig, onRegisterSections, suppressInternalDnd, fileId, memberUserKey]);

  if (suppressInternalDnd) {
    return null;
  }

  return (
    <div
      id={UNDERWRITING_TAB_SECTION_IDS.ledger}
      className={cn(
        "min-w-0 space-y-4 overflow-x-hidden",
        premiumTabSectionSpaceClass,
        className,
      )}
      data-testid="pipeline-underwriting-ledger-tab"
      data-file-id={fileId}
      data-member-user-key={memberUserKey ?? undefined}
    >
      {UNDERWRITING_LEDGER_SECTION_IDS.map((id) => (
        <div key={id}>{renderSection(id)}</div>
      ))}
    </div>
  );
}
