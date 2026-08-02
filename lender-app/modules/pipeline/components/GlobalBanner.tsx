"use client";

import Link from "next/link";
import { InlineNumber, InlineText } from "@/components/inline";
import { PipelineStageSelector } from "@/components/pipeline/PipelineStageSelector";
import type { Id } from "@/convex/_generated/dataModel";
import { cn } from "@/lib/cn";
import {
  commitPipelineFileName,
  commitPipelineFundingAmount,
  type DealCommitRow,
} from "@/lib/pipeline/pipelineTableCommits";
import { HardRefreshButton } from "@/components/HardRefreshButton";

export type GlobalBannerPipelineData = {
  fileName: string;
  clientDisplayName: string;
  clientHref: string;
  projectDisplayTitle: string;
  fundingAmount: number;
  /** When block bus resolves a display override for funding. */
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

export type GlobalBannerProps = {
  fileId: Id<"pipeline">;
  pipelineData: GlobalBannerPipelineData;
  onPatchField: (fields: {
    id: Id<"pipeline">;
    fileName?: string;
    stageId?: Id<"organizationPipelineStages"> | null;
    subStageId?: Id<"organizationPipelineSubStages"> | null;
  }) => Promise<void>;
  onCommitProjectName: (next: string) => Promise<void>;
  runPatchDeal: (args: {
    fileId: Id<"pipeline">;
    changes: Record<string, unknown>;
  }) => Promise<unknown>;
  onCommitFundingFallback?: (amount: number) => Promise<void>;
};

function fmtCurrency(n: number | null | undefined) {
  if (n == null || !Number.isFinite(n)) return "—";
  return `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

export function GlobalBanner({
  fileId,
  pipelineData,
  onPatchField,
  onCommitProjectName,
  runPatchDeal,
  onCommitFundingFallback,
}: GlobalBannerProps) {
  const {
    fileName,
    clientDisplayName,
    clientHref,
    projectDisplayTitle,
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
      data-testid="pipeline-global-banner"
      className={cn(
        "sticky top-0 z-50 w-full min-w-0 border-b border-border/60",
        "bg-dlc-surface/95 shadow-dlc-1 backdrop-blur-sm supports-[backdrop-filter]:bg-dlc-surface/85",
      )}
    >
      <div className="flex min-w-0 flex-col gap-2 px-1 py-1 sm:gap-2.5 sm:py-1.5">
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5">
          <Link
            href={clientHref}
            data-testid="pipeline-global-banner-client"
            className={cn(
              "inline-flex h-8 max-w-full shrink-0 items-center rounded-full border border-border/80",
              "bg-dlc-surface-high px-2.5 text-xs font-semibold text-foreground shadow-dlc-1",
              "transition-colors duration-dlc-short ease-dlc-standard hover:bg-muted/70",
            )}
            title={`View client: ${clientDisplayName}`}
          >
            <span className="min-w-0 truncate">{clientDisplayName}</span>
          </Link>

          <div
            className="min-w-0 flex-1 basis-[8rem]"
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
              displayClassName="block min-w-0 truncate text-sm font-semibold leading-tight sm:text-base"
            />
          </div>

          <div
            className="min-w-0 max-w-[min(100%,14rem)] shrink-0"
            data-testid="pipeline-global-banner-project"
          >
            <InlineText
              value={projectDisplayTitle}
              readOnly={fieldReadOnly}
              onCommit={onCommitProjectName}
              ariaLabel="Edit project name"
              placeholder="Project"
              displayClassName="block min-w-0 truncate text-xs font-medium text-muted-foreground sm:text-sm"
            />
          </div>
        </div>

        <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2">
          <div
            className="flex min-w-0 items-center gap-1.5"
            data-testid="pipeline-global-banner-funding"
          >
            <span className="shrink-0 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
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

          <div
            className="flex shrink-0 items-center"
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

          <HardRefreshButton variant="banner" className="ml-auto shrink-0" />
        </div>
      </div>
    </div>
  );
}
