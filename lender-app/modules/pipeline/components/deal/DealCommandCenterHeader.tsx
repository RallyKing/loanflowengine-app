"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { InlineNumber, InlineText } from "@/components/inline";
import { DealStatusBadge } from "@/components/contacts/hub/dealStatusBadge";
import { PipelineStageSelector } from "@/components/pipeline/PipelineStageSelector";
import { HardRefreshButton } from "@/components/HardRefreshButton";
import { HeaderDisclosureToggle } from "@/components/ui/HeaderDisclosure";
import { WorkspaceContextAnchor } from "@/components/ui/WorkspaceContextAnchor";
import {
  WorkspaceProjectAssociationControl,
  type ProjectSiblingFileOption,
} from "@/components/pipeline/WorkspaceProjectAssociationControl";
import type { Id } from "@/convex/_generated/dataModel";
import { cn } from "@/lib/cn";
import {
  commitPipelineFileName,
  commitPipelineFundingAmount,
} from "@/lib/pipeline/pipelineTableCommits";
import { touchTargetIconClass } from "@/lib/ui/touchTarget";
import type { WorkspaceHierarchyCrumb } from "@/components/pipeline/WorkspaceHierarchyCrumbs";
import type { FileWorkspaceUnifiedHeaderPipelineData } from "@/components/pipeline/FileWorkspaceUnifiedHeader";

export type DealCommandCenterHeaderProps = {
  fileId: Id<"pipeline">;
  hubBackHref: string;
  hubBackLabel: string;
  pipelineData: FileWorkspaceUnifiedHeaderPipelineData;
  statusLabel: string;
  rateDisplay?: string;
  termDisplay?: string;
  crumbs: WorkspaceHierarchyCrumb[];
  /** Project association — shown left of the pipeline stage pill. */
  projectName?: string | null;
  projectHref?: string | null;
  projectSiblingFiles?: readonly ProjectSiblingFileOption[];
  accessHint?: string;
  ownerDisplayUsername?: string;
  detailsExpanded: boolean;
  onDetailsToggle: () => void;
  overflowMenu: ReactNode;
  onPatchField: (fields: {
    id: Id<"pipeline">;
    fileName?: string;
    stageId?: Id<"organizationPipelineStages"> | null;
    subStageId?: Id<"organizationPipelineSubStages"> | null;
  }) => Promise<void>;
  runPatchDeal: (args: {
    fileId: Id<"pipeline">;
    changes: Record<string, unknown>;
  }) => Promise<unknown>;
  onCommitFundingFallback?: (amount: number) => Promise<void>;
  children?: ReactNode;
  className?: string;
};

const METRIC_LABEL_CLASS =
  "text-[10px] font-medium uppercase tracking-wider text-slate-400 dark:text-slate-500";
const METRIC_VALUE_CLASS =
  "text-sm font-semibold tabular-nums text-slate-700 dark:text-slate-200";
const METRIC_VALUE_COMPACT_CLASS =
  "text-xs font-semibold tabular-nums text-slate-700 dark:text-slate-200 md:text-sm";

function fmtCurrency(n: number | null | undefined) {
  if (n == null || !Number.isFinite(n)) return "—";
  return `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function MetricCell({
  label,
  children,
  testId,
  className,
}: {
  label: string;
  children: ReactNode;
  testId?: string;
  className?: string;
}) {
  return (
    <div
      className={cn("flex items-baseline gap-1 md:gap-1.5", className)}
      data-testid={testId}
    >
      <span className={METRIC_LABEL_CLASS}>{label}</span>
      <span className={METRIC_VALUE_COMPACT_CLASS}>{children}</span>
    </div>
  );
}

/**
 * Deal Command Center — dense mobile chrome (title + stage strip; metrics behind
 * Details) and a fuller desktop command row.
 */
export function DealCommandCenterHeader({
  fileId,
  pipelineData,
  statusLabel,
  rateDisplay,
  termDisplay,
  crumbs,
  projectName,
  projectHref,
  projectSiblingFiles = [],
  accessHint,
  ownerDisplayUsername,
  detailsExpanded,
  onDetailsToggle,
  overflowMenu,
  onPatchField,
  runPatchDeal,
  onCommitFundingFallback,
  children,
  className,
}: DealCommandCenterHeaderProps) {
  const {
    fileName,
    clientDisplayName,
    clientHref,
    fundingAmount,
    fundingDisplay,
    stageId,
    subStageId,
    archivedAt,
    dealCommitRow,
    dealBacked,
    readOnly,
    canMutate,
  } = pipelineData;

  const fieldReadOnly = archivedAt != null || !canMutate || readOnly;
  const fundingValue = fundingDisplay ?? fundingAmount;

  const projectStageCluster = (
    <div
      className="flex min-w-0 shrink items-center gap-1 md:gap-1.5"
      data-testid="deal-command-center-project-stage"
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <WorkspaceProjectAssociationControl
        projectName={projectName}
        projectHref={projectHref}
        currentFileId={fileId}
        siblingFiles={projectSiblingFiles}
        dense
      />
      <div
        className="min-w-0 max-w-[min(12rem,42vw)] md:max-w-[11rem]"
        data-testid="pipeline-global-banner-stage"
      >
        <PipelineStageSelector
          stageId={stageId}
          subStageId={subStageId}
          status={pipelineData.status}
          readOnly={fieldReadOnly}
          canEditFile={canMutate}
          compact
          stopPropagation
          onCommit={(next) =>
            onPatchField({
              id: fileId,
              stageId: next.stageId,
              subStageId: next.subStageId ?? null,
            })
          }
          ariaLabel="Change pipeline stage"
        />
      </div>
    </div>
  );

  const headerUtilities = (
    <div
      className="flex shrink-0 items-center justify-end gap-0.5 md:gap-1"
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <HardRefreshButton variant="banner" className="max-md:h-8 max-md:w-8" />
      <HeaderDisclosureToggle
        expanded={detailsExpanded}
        onToggle={onDetailsToggle}
        testId="pipeline-workspace-header-expand-toggle"
        labelCollapsed="Show file details"
        labelExpanded="Hide file details"
        className="max-md:!h-8 max-md:!w-8 max-md:!min-h-8 max-md:!min-w-8"
      />
      {overflowMenu}
    </div>
  );

  return (
    <div
      data-testid="pipeline-file-workspace-header"
      className={cn(
        "w-full min-w-0 border-b border-slate-200 bg-background dark:border-slate-700",
        className,
      )}
    >
      {/* Fibonacci-ish rhythm: 4/8 gaps — maximize work surface on phone. */}
      <div className="space-y-1 px-0 py-1 md:space-y-2 md:py-2">
        {/* Identity + utilities (always visible) */}
        <div
          className="flex min-h-8 min-w-0 items-center gap-2 md:min-h-9"
          data-testid="deal-command-center-core"
        >
          <DealStatusBadge status={statusLabel} />
          <div
            className="min-w-0 flex-1"
            data-testid="deal-command-center-file-name"
          >
            <div data-testid="pipeline-global-banner-file-name" className="min-w-0">
              <InlineText
                value={fileName}
                readOnly={fieldReadOnly}
                onCommit={async (next) => {
                  const t = next.trim();
                  if (!t || !dealCommitRow) return;
                  await commitPipelineFileName(
                    dealCommitRow,
                    onPatchField,
                    runPatchDeal,
                    t,
                  );
                }}
                ariaLabel="Edit deal name"
                placeholder="Untitled deal"
                displayClassName="block min-w-0 truncate text-sm font-semibold leading-tight text-foreground md:text-base lg:text-lg"
              />
            </div>
          </div>
          <div className="hidden min-w-0 max-w-[14rem] md:block">
            <Link
              href={clientHref}
              title={clientDisplayName}
              className={cn(
                "block truncate text-sm font-medium text-primary hover:underline",
                touchTargetIconClass,
              )}
              data-testid="deal-command-center-client-link"
            >
              {clientDisplayName}
            </Link>
          </div>
          {headerUtilities}
        </div>

        {/* Stage / project (one-tap) + mobile borrower */}
        <div
          className="flex min-h-8 min-w-0 items-center gap-2"
          data-testid="deal-command-center-top-row"
        >
          {projectStageCluster}
          <Link
            href={clientHref}
            title={clientDisplayName}
            className={cn(
              "min-w-0 flex-1 truncate text-xs font-medium text-primary hover:underline md:hidden",
            )}
            data-testid="deal-command-center-client-link-mobile"
          >
            {clientDisplayName}
          </Link>
          <div className="hidden min-w-0 flex-1 md:block">
            {crumbs.length > 0 ? (
              <WorkspaceContextAnchor
                layout="dense"
                entityType="Loan file"
                entityLabel=""
                crumbs={crumbs.map((c) => ({
                  label: c.label,
                  ...("href" in c && c.href ? { href: c.href } : {}),
                }))}
                accessHint={accessHint}
                data-testid="deal-command-center-crumbs"
              />
            ) : null}
          </div>
        </div>

        {/* Metrics: always on md+; on phone only when Details is expanded */}
        <dl
          className={cn(
            "flex flex-wrap items-center gap-x-3 gap-y-0.5 border-t border-slate-200/60 pt-1 dark:border-slate-700/60 md:mt-0 md:gap-x-6 md:pt-2",
            detailsExpanded ? "max-md:flex" : "max-md:hidden",
          )}
          data-testid="deal-command-center-metrics"
          data-metrics-visibility={detailsExpanded ? "expanded" : "collapsed"}
        >
          <MetricCell label="Funding" testId="deal-command-center-funding">
            {fieldReadOnly ? (
              fmtCurrency(fundingValue)
            ) : (
              <InlineNumber
                value={fundingValue}
                format={fmtCurrency}
                clearable={false}
                validate={(n) =>
                  n < 0 ? "Funding amount must be 0 or more" : null
                }
                onCommit={async (next) => {
                  const n = next === null ? 0 : next;
                  if (n < 0 || !dealCommitRow) return;
                  if (dealBacked) {
                    await commitPipelineFundingAmount(
                      dealCommitRow,
                      onPatchField,
                      runPatchDeal,
                      n,
                    );
                    return;
                  }
                  await onCommitFundingFallback?.(n);
                }}
                ariaLabel="Edit funding amount"
                placeholder="—"
                displayClassName={METRIC_VALUE_CLASS}
              />
            )}
          </MetricCell>
          <MetricCell label="Rate" testId="deal-command-center-rate">
            {rateDisplay?.trim() || "—"}
          </MetricCell>
          <MetricCell label="Term" testId="deal-command-center-term">
            {termDisplay?.trim() || "—"}
          </MetricCell>
          {ownerDisplayUsername ? (
            <MetricCell
              label="Owner"
              className="min-w-0 max-sm:w-full sm:ml-auto"
            >
              <span className="truncate">{ownerDisplayUsername}</span>
            </MetricCell>
          ) : null}
        </dl>
      </div>

      {children ? (
        <div className="w-full min-w-0" data-testid="deal-command-center-details-slot">
          {children}
        </div>
      ) : null}
    </div>
  );
}
