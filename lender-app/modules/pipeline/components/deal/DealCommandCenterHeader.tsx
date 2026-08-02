"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { InlineNumber, InlineText } from "@/components/inline";
import { DealStatusBadge } from "@/components/contacts/hub/dealStatusBadge";
import { PipelineStageSelector } from "@/components/pipeline/PipelineStageSelector";
import { HardRefreshButton } from "@/components/HardRefreshButton";
import { HeaderDisclosureToggle } from "@/components/ui/HeaderDisclosure";
import { WorkspaceContextAnchor } from "@/components/ui/WorkspaceContextAnchor";
import type { Id } from "@/convex/_generated/dataModel";
import { cn } from "@/lib/cn";
import {
  commitPipelineFileName,
  commitPipelineFundingAmount,
  type DealCommitRow,
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
      className={cn("flex items-baseline gap-1.5", className)}
      data-testid={testId}
    >
      <span className={METRIC_LABEL_CLASS}>{label}</span>
      <span className={METRIC_VALUE_CLASS}>{children}</span>
    </div>
  );
}

/**
 * Deal Command Center — flat 3-row operational header (crumbs+utils · identity · metrics).
 */
export function DealCommandCenterHeader({
  fileId,
  pipelineData,
  statusLabel,
  rateDisplay,
  termDisplay,
  crumbs,
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

  const headerUtilities = (
    <div
      className="flex shrink-0 flex-wrap items-center justify-end gap-1"
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <div
        className="min-w-0 max-w-[11rem]"
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
      <HardRefreshButton variant="banner" />
      <HeaderDisclosureToggle
        expanded={detailsExpanded}
        onToggle={onDetailsToggle}
        testId="pipeline-workspace-header-expand-toggle"
        labelCollapsed="Show file details"
        labelExpanded="Hide file details"
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
      <div className="space-y-2 px-0 py-2">
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
            trailing={headerUtilities}
            data-testid="deal-command-center-crumbs"
          />
        ) : (
          <div className="flex min-h-9 items-center justify-end">
            {headerUtilities}
          </div>
        )}

        <div
          className="flex min-h-9 min-w-0 items-center gap-3"
          data-testid="deal-command-center-core"
        >
          <DealStatusBadge status={statusLabel} />
          <div
            className="min-w-0 flex-1"
            data-testid="deal-command-center-file-name"
          >
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
              displayClassName="block min-w-0 truncate text-base font-semibold text-foreground sm:text-lg"
            />
          </div>
          <Link
            href={clientHref}
            className={cn(
              "hidden shrink-0 text-sm font-medium text-primary hover:underline sm:inline",
              touchTargetIconClass,
            )}
            data-testid="deal-command-center-client-link"
          >
            {clientDisplayName}
          </Link>
        </div>

        <dl
          className="mt-2 flex flex-wrap items-center gap-x-6 gap-y-1 border-t border-slate-200/60 pt-2 dark:border-slate-700/60"
          data-testid="deal-command-center-metrics"
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

      {children}
    </div>
  );
}
