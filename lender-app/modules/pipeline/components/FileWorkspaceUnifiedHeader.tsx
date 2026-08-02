"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { ChevronLeft, UserCircle2 } from "lucide-react";
import { InlineNumber, InlineText } from "@/components/inline";
import { PipelineStageSelector } from "@/components/pipeline/PipelineStageSelector";
import { HardRefreshButton } from "@/components/HardRefreshButton";
import { HeaderDisclosureToggle } from "@/components/ui/HeaderDisclosure";
import type { Id } from "@/convex/_generated/dataModel";
import { cn } from "@/lib/cn";
import {
  commitPipelineFileName,
  commitPipelineFundingAmount,
  type DealCommitRow,
} from "@/lib/pipeline/pipelineTableCommits";
import { touchTargetIconClass } from "@/lib/ui/touchTarget";

export type FileWorkspaceUnifiedHeaderPipelineData = {
  fileName: string;
  clientDisplayName: string;
  clientHref: string;
  fundingAmount: number;
  fundingDisplay?: number;
  stageId?: Id<"organizationPipelineStages">;
  subStageId?: Id<"organizationPipelineSubStages">;
  status?: string;
  archivedAt?: number | null;
  dealCommitRow: DealCommitRow | null;
  dealBacked: boolean;
  readOnly: boolean;
  canMutate: boolean;
};

export type FileWorkspaceUnifiedHeaderProps = {
  fileId: Id<"pipeline">;
  hubBackHref: string;
  pipelineData: FileWorkspaceUnifiedHeaderPipelineData;
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

function fmtCurrency(n: number | null | undefined) {
  if (n == null || !Number.isFinite(n)) return "—";
  return `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

/**
 * Phase 54.2 — responsive pipeline file header: 2-row stack on mobile, single h-14 row on md+.
 */
export function FileWorkspaceUnifiedHeader({
  fileId,
  hubBackHref,
  pipelineData,
  ownerDisplayUsername,
  detailsExpanded,
  onDetailsToggle,
  overflowMenu,
  onPatchField,
  runPatchDeal,
  onCommitFundingFallback,
  children,
  className,
}: FileWorkspaceUnifiedHeaderProps) {
  const {
    fileName,
    clientDisplayName,
    clientHref,
    fundingAmount,
    fundingDisplay,
    stageId,
    subStageId,
    status,
    archivedAt,
    dealCommitRow,
    dealBacked,
    readOnly,
    canMutate,
  } = pipelineData;

  const fieldReadOnly = archivedAt != null || !canMutate || readOnly;
  const fundingValue = fundingDisplay ?? fundingAmount;

  return (
    <div
      data-testid="pipeline-file-workspace-header"
      className={cn(
        "w-full min-w-0 border-b border-border/70 bg-background",
        className,
      )}
    >
      <header
        className={cn(
          "sticky top-0 z-40 flex h-auto w-full min-w-0 flex-col items-stretch justify-between px-4 py-2",
          "md:h-14 md:min-h-14 md:max-h-14 md:flex-row md:items-center md:py-0",
          "supports-[overflow-anchor:auto]:[overflow-anchor:none]",
        )}
        data-testid="pipeline-global-banner"
      >
        {/* Row 1 — navigation & identity (mobile top line; desktop left cluster) */}
        <div
          className={cn(
            "flex min-w-0 items-center gap-2 border-b border-dashed border-border/50 pb-2",
            "md:flex-1 md:border-none md:pb-0",
          )}
          data-testid="pipeline-workspace-header-identity-row"
        >
          <Link
            href={hubBackHref}
            data-testid="pipeline-workspace-back-to-hub"
            className={cn(
              "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-dlc-sm border border-border/90 bg-dlc-surface-high text-foreground shadow-dlc-1 transition-colors hover:bg-muted/80",
              touchTargetIconClass,
            )}
            title="Back to Pipeline Hub"
          >
            <ChevronLeft className="h-4 w-4 shrink-0" aria-hidden />
          </Link>

          <Link
            href={clientHref}
            data-testid="pipeline-global-banner-client"
            className={cn(
              "inline-flex h-8 max-w-[7.5rem] shrink-0 items-center rounded-full border border-border/80 sm:max-w-[9rem]",
              "bg-dlc-surface-high px-2.5 text-xs font-semibold text-foreground shadow-dlc-1",
              "transition-colors duration-dlc-short ease-dlc-standard hover:bg-muted/70",
            )}
            title={`View client: ${clientDisplayName}`}
          >
            <span className="min-w-0 truncate">{clientDisplayName}</span>
          </Link>

          <div
            className="min-w-0 flex-1"
            data-testid="pipeline-global-banner-file-name"
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
              ariaLabel="Edit file name"
              placeholder="Untitled file"
              displayClassName="block min-w-0 truncate text-sm font-semibold leading-tight max-w-[calc(100vw-140px)] md:max-w-[280px]"
            />
          </div>

          {/* Funding — desktop only (Deal Info tab on mobile) */}
          <div
            className="hidden min-w-0 shrink-0 items-center gap-1.5 md:flex"
            data-testid="pipeline-global-banner-funding"
          >
            <span className="shrink-0 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              Funding
            </span>
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
              placeholder="$0"
              displayClassName="text-sm font-semibold tabular-nums text-foreground"
            />
          </div>
        </div>

        {/* Row 2 — ownership, stage, utilities (mobile second line; desktop right cluster) */}
        <div
          className="flex items-center justify-between gap-2 pt-2 md:justify-end md:pt-0"
          data-testid="pipeline-workspace-header-actions-row"
        >
          {ownerDisplayUsername ? (
            <div
              className="flex min-w-0 max-w-[38%] items-center gap-1.5 text-xs text-muted-foreground sm:max-w-[45%] md:max-w-[6.5rem]"
              title={`Owner: ${ownerDisplayUsername}`}
              data-testid="pipeline-workspace-header-owner"
            >
              <UserCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden />
              <span className="min-w-0 truncate font-medium">
                {ownerDisplayUsername}
              </span>
            </div>
          ) : null}

          <div className="hidden min-w-0 md:block md:flex-1" aria-hidden />

          <div
            className="flex min-w-0 max-w-[min(42vw,12rem)] shrink-0 items-center overflow-hidden sm:max-w-none"
            data-testid="pipeline-global-banner-stage"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
          >
            <PipelineStageSelector
              stageId={stageId}
              subStageId={subStageId}
              status={status}
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

          <div className="flex shrink-0 items-center gap-0.5">
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
        </div>
      </header>

      {children}
    </div>
  );
}

/** @deprecated Phase 54.1 — use `FileWorkspaceUnifiedHeader`. */
export type GlobalBannerPipelineData = FileWorkspaceUnifiedHeaderPipelineData & {
  projectDisplayTitle: string;
};
