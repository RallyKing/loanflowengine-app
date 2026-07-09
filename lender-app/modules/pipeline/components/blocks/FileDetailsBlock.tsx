"use client";

import type { Doc, Id } from "@/convex/_generated/dataModel";
import { IntelligentAlertsCallout } from "@/components/IntelligentAlertsCallout";
import {
  InlineNumber,
  InlineText,
  InlineTextarea,
} from "@/components/inline";
import { FieldLabel } from "@/components/pipeline/FieldLabel";
import {
  FieldSyncIndicator,
  type FieldSyncSource,
} from "@/components/FieldSyncIndicator";
import { Button } from "@/components/ui/Button";
import type { BlockSyncBehaviorParsed } from "@/lib/blockSyncBehaviorSettings";
import { cn } from "@/lib/cn";
import type {
  BlockDataResolvedField,
  BlockFieldSyncMeta,
  UseBlockDataResult,
} from "@/hooks/useBlockData";
import type { IntelligentAlert } from "@/lib/intelligentAlerts";
import type { PipelineFileInsightsSnapshot } from "@/lib/pipelineFileInsights";
import type { DealCommitRow } from "@/lib/pipeline/pipelineTableCommits";
import {
  commitPipelineFileName,
  commitPipelineFundingAmount,
  commitPipelineSubjectAddress,
} from "@/lib/pipeline/pipelineTableCommits";
import { FileDetailsTelemetryFooter } from "@/components/pipeline/blocks/FileDetailsTelemetryFooter";

function fmtCurrency(n: number | null | undefined) {
  if (n == null || !Number.isFinite(n)) return "—";
  return `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function fmtRate(n: number | null | undefined) {
  if (n == null || !Number.isFinite(n)) return "—";
  return `${n}%`;
}

function fmtTime(ms: number) {
  return new Date(ms).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export type FileDetailsRevenueOrgAgg = {
  fileCount: number;
  commission: number;
  netRevenue: number;
};

export type FileDetailsRevenueTotals = {
  fundingAmount: number;
  commission: number;
  netRevenue: number;
};

export type FileDetailsBlockProps = {
  pipeline: Doc<"pipeline">;
  dealCommitRow: DealCommitRow | null;
  patchField: (fields: {
    id: Id<"pipeline">;
    term?: string;
    rate?: number;
    commission?: number;
    netRevenue?: number;
    scenario?: string | null;
  }) => Promise<void>;
  runPatchDeal: (args: {
    fileId: Id<"pipeline">;
    changes: Record<string, unknown>;
  }) => Promise<unknown>;
  fileDetailsIntelligentAlerts: IntelligentAlert[];
  fileDetailsLoanAmount: number;
  fileDetailsBusFund: BlockDataResolvedField | undefined;
  fileDetailsBusRate: BlockDataResolvedField | undefined;
  fundingFieldSync: BlockFieldSyncMeta | null;
  rateFieldSync: BlockFieldSyncMeta | null;
  fundingSyncSource: FieldSyncSource;
  rateSyncSource: FieldSyncSource;
  dealBackedForBus: boolean;
  blockSyncBehavior: BlockSyncBehaviorParsed;
  blockBus: UseBlockDataResult;
  fileRevenueTotals: FileDetailsRevenueTotals | null;
  revenueOrgAgg: FileDetailsRevenueOrgAgg | undefined;
  revenueUserAgg: FileDetailsRevenueOrgAgg | undefined;
  preferencesAccountId?: string;
  subjectAddressValue: string;
  /** Phase 4 — merged File Insights telemetry (stage, lenders, health). */
  fileInsightsSnapshot?: PipelineFileInsightsSnapshot | null;
  /** Phase 38 — premium card data hierarchy (labels + 2-col grid). */
  premiumLayout?: boolean;
};

export function FileDetailsBlock({
  pipeline: p,
  dealCommitRow,
  patchField,
  runPatchDeal,
  fileDetailsIntelligentAlerts,
  fileDetailsLoanAmount,
  fileDetailsBusFund,
  fileDetailsBusRate,
  fundingFieldSync,
  rateFieldSync,
  fundingSyncSource,
  rateSyncSource,
  dealBackedForBus,
  blockSyncBehavior,
  blockBus,
  fileRevenueTotals,
  revenueOrgAgg,
  revenueUserAgg,
  preferencesAccountId,
  subjectAddressValue,
  fileInsightsSnapshot,
  premiumLayout = false,
}: FileDetailsBlockProps) {
  const fieldStack = premiumLayout ? "space-y-2" : "space-y-1";
  const fieldGrid = cn(
    "grid grid-cols-1 lg:grid-cols-2",
    premiumLayout ? "gap-5 sm:gap-6" : "gap-4",
  );
  const labelPremium = premiumLayout;
  const valueClass = premiumLayout
    ? "text-sm font-semibold text-foreground"
    : undefined;

  return (
    <>
      {fileDetailsIntelligentAlerts.length > 0 ? (
        <IntelligentAlertsCallout
          alerts={fileDetailsIntelligentAlerts}
          maxVisible={2}
        />
      ) : null}
      <div className={fieldGrid}>
        <div className={fieldStack}>
          <FieldLabel premium={labelPremium}>File name</FieldLabel>
          <div className={valueClass}>
            <InlineText
            value={p.fileName}
            onCommit={async (next) => {
              const t = next.trim();
              if (!t || !dealCommitRow) return;
              await commitPipelineFileName(
                dealCommitRow,
                patchField,
                runPatchDeal,
                t,
              );
            }}
            ariaLabel="Edit file name"
          />
          </div>
        </div>
        <div className={fieldStack}>
          <FieldLabel premium={labelPremium}>Term</FieldLabel>
          <div className={valueClass}>
            <InlineText
            value={p.term ?? ""}
            allowEmpty
            onCommit={(next) => patchField({ id: p._id, term: next })}
            placeholder="e.g. 30 yr fixed"
            ariaLabel="Edit term"
          />
          </div>
        </div>
        <div className={fieldStack}>
          <div className="flex flex-wrap items-center gap-2">
            <FieldLabel premium={labelPremium}>Funding amount</FieldLabel>
            {fileDetailsBusFund ? (
              <FieldSyncIndicator source={fundingSyncSource} />
            ) : null}
          </div>
          <div
            className={cn(
              valueClass,
              fundingFieldSync &&
                !fundingFieldSync.isSynced &&
                "rounded-md ring-1 ring-amber-400/40 ring-offset-1 ring-offset-background",
            )}
          >
            <InlineNumber
              value={fileDetailsBusFund?.display ?? fileDetailsLoanAmount}
              format={fmtCurrency}
              clearable={false}
              validate={(n) =>
                n < 0 ? "Funding amount must be 0 or more" : null
              }
              onCommit={async (next) => {
                const n = next === null ? 0 : next;
                if (n < 0 || !dealCommitRow) return;
                const fund = fileDetailsBusFund;
                if (dealBackedForBus) {
                  await commitPipelineFundingAmount(
                    dealCommitRow,
                    patchField,
                    runPatchDeal,
                    n,
                  );
                  return;
                }
                if (!fund) return;
                await blockBus.commitSharedNumeric("fundingAmount", n, fund);
              }}
              ariaLabel="Edit funding amount"
              placeholder="$0"
            />
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
            {fileDetailsBusFund &&
            fundingFieldSync &&
            !fundingFieldSync.isSynced ? (
              <>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-auto px-0 text-xs text-primary"
                  onClick={() =>
                    void blockBus.resetFieldToShared("fundingAmount")
                  }
                >
                  Reset to shared value
                </Button>
                {!blockSyncBehavior.autoSyncSharedAcrossBlocks &&
                blockBus.localMask.fundingAmount ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-auto px-0 text-xs text-primary"
                    onClick={() =>
                      void blockBus.pushLocalFieldToShared("fundingAmount")
                    }
                  >
                    Push to shared bus
                  </Button>
                ) : null}
              </>
            ) : null}
            {blockSyncBehavior.allowOverrides &&
            fileDetailsBusFund &&
            fileDetailsBusFund.source === "shared" &&
            !dealBackedForBus ? (
              <button
                type="button"
                className="text-xs text-muted-foreground hover:underline"
                onClick={() =>
                  void blockBus.setFieldOverride(
                    "fundingAmount",
                    fileDetailsBusFund.display,
                  )
                }
              >
                Use block-only funding (detach from shared)
              </button>
            ) : null}
          </div>
        </div>
        <div className={fieldStack}>
          <div className="flex flex-wrap items-center gap-2">
            <FieldLabel premium={labelPremium}>Rate</FieldLabel>
            {fileDetailsBusRate ? (
              <FieldSyncIndicator source={rateSyncSource} />
            ) : null}
          </div>
          <div
            className={cn(
              valueClass,
              rateFieldSync &&
                !rateFieldSync.isSynced &&
                "rounded-md ring-1 ring-amber-400/40 ring-offset-1 ring-offset-background",
            )}
          >
            <InlineNumber
              value={fileDetailsBusRate?.display ?? p.rate}
              format={fmtRate}
              clearable={false}
              parse={(s) => {
                const n = Number(s.replace(/[%\s,]/g, ""));
                return Number.isFinite(n) ? n : undefined;
              }}
              validate={(n) => (n < 0 ? "Rate must be 0 or more" : null)}
              onCommit={async (next) => {
                const n = next === null ? 0 : next;
                const r = fileDetailsBusRate;
                if (!r) {
                  await patchField({ id: p._id, rate: n });
                  return;
                }
                await blockBus.commitSharedNumeric("interestRate", n, r);
              }}
              ariaLabel="Edit rate"
              placeholder="0%"
            />
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
            {fileDetailsBusRate &&
            rateFieldSync &&
            !rateFieldSync.isSynced ? (
              <>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-auto px-0 text-xs text-primary"
                  onClick={() =>
                    void blockBus.resetFieldToShared("interestRate")
                  }
                >
                  Reset to shared value
                </Button>
                {!blockSyncBehavior.autoSyncSharedAcrossBlocks &&
                blockBus.localMask.interestRate ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-auto px-0 text-xs text-primary"
                    onClick={() =>
                      void blockBus.pushLocalFieldToShared("interestRate")
                    }
                  >
                    Push to shared bus
                  </Button>
                ) : null}
              </>
            ) : null}
            {blockSyncBehavior.allowOverrides &&
            fileDetailsBusRate &&
            fileDetailsBusRate.source === "shared" ? (
              <button
                type="button"
                className="text-xs text-muted-foreground hover:underline"
                onClick={() =>
                  void blockBus.setFieldOverride(
                    "interestRate",
                    fileDetailsBusRate.display,
                  )
                }
              >
                Use block-only rate (detach from shared)
              </button>
            ) : null}
          </div>
        </div>
        <div className="flex w-full min-w-0 flex-col gap-y-3 lg:col-span-2">
          <FieldLabel premium={labelPremium}>Revenue tracking</FieldLabel>
          <p className="text-xs text-muted-foreground">
            Same shared data layer as funding and rate. Separate from
            fee-calculator gross / net lines.
          </p>
          <div className="flex w-full min-w-0 flex-col gap-y-2">
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              <div className={fieldStack}>
                <FieldLabel premium={labelPremium}>Funding (normalized)</FieldLabel>
                <p className="text-sm font-medium tabular-nums text-foreground">
                  {fileRevenueTotals
                    ? fmtCurrency(fileRevenueTotals.fundingAmount)
                    : "—"}
                </p>
              </div>
              <div className={fieldStack}>
                <FieldLabel premium={labelPremium}>Commission</FieldLabel>
                <div className={valueClass}>
                <InlineNumber
                  value={fileRevenueTotals?.commission ?? 0}
                  format={fmtCurrency}
                  clearable={false}
                  validate={(n) =>
                    n < 0 ? "Commission must be 0 or more" : null
                  }
                  onCommit={(next) => {
                    const n = next === null ? 0 : next;
                    if (n < 0) return;
                    void patchField({ id: p._id, commission: n });
                  }}
                  ariaLabel="Edit tracked commission"
                  placeholder="$0"
                />
                </div>
              </div>
              <div className={fieldStack}>
                <FieldLabel premium={labelPremium}>Net revenue</FieldLabel>
                <div className={valueClass}>
                <InlineNumber
                  value={fileRevenueTotals?.netRevenue ?? 0}
                  format={fmtCurrency}
                  clearable={false}
                  validate={(n) =>
                    n < 0 ? "Net revenue must be 0 or more" : null
                  }
                  onCommit={(next) => {
                    const n = next === null ? 0 : next;
                    if (n < 0) return;
                    void patchField({ id: p._id, netRevenue: n });
                  }}
                  ariaLabel="Edit tracked net revenue"
                  placeholder="$0"
                />
                </div>
              </div>
            </div>
            {p.organizationId && preferencesAccountId ? (
              <div className="rounded-md border border-border/70 bg-muted/15 px-3 py-2">
                <p className="text-xs font-medium text-foreground">
                  Organization roll-ups
                </p>
                <div className="mt-2 grid grid-cols-1 gap-3 lg:grid-cols-2">
                  <div className="flex flex-col gap-y-0.5 text-xs">
                    <p className="text-muted-foreground">
                      All files you can see
                    </p>
                    <p className="tabular-nums text-foreground">
                      {revenueOrgAgg !== undefined
                        ? `${revenueOrgAgg.fileCount} files · comm. ${fmtCurrency(revenueOrgAgg.commission)} · net ${fmtCurrency(revenueOrgAgg.netRevenue)}`
                        : "…"}
                    </p>
                  </div>
                  <div className="flex flex-col gap-y-0.5 text-xs">
                    <p className="text-muted-foreground">
                      Attributed to you (assignee, else owner)
                    </p>
                    <p className="tabular-nums text-foreground">
                      {revenueUserAgg !== undefined
                        ? `${revenueUserAgg.fileCount} files · comm. ${fmtCurrency(revenueUserAgg.commission)} · net ${fmtCurrency(revenueUserAgg.netRevenue)}`
                        : "…"}
                    </p>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </div>
        <div className={cn("flex w-full min-w-0 flex-col lg:col-span-2", fieldStack)}>
          <FieldLabel premium={labelPremium}>Property address</FieldLabel>
          <div className={valueClass}>
          <InlineText
            value={subjectAddressValue}
            allowEmpty
            onCommit={async (next) => {
              if (!dealCommitRow) return;
              await commitPipelineSubjectAddress(
                dealCommitRow,
                patchField,
                runPatchDeal,
                next.trim(),
              );
            }}
            placeholder="Add a property address"
            ariaLabel="Edit property address"
          />
          </div>
        </div>
        <div className={cn("flex w-full min-w-0 flex-col lg:col-span-2", fieldStack)}>
          <FieldLabel premium={labelPremium}>Scenario</FieldLabel>
          <div className={valueClass}>
          <InlineTextarea
            value={p.scenario ?? ""}
            onCommit={(next) =>
              patchField({ id: p._id, scenario: next || null })
            }
            placeholder="Add a scenario / one-liner"
            ariaLabel="Edit scenario"
            rows={3}
          />
          </div>
        </div>
      </div>
      {fileInsightsSnapshot ? (
        <FileDetailsTelemetryFooter snapshot={fileInsightsSnapshot} />
      ) : null}
      <p className="mt-3 text-xs text-muted-foreground">
        Updated {fmtTime(p.updatedAt)} · Created {fmtTime(p.createdAt)}
      </p>
    </>
  );
}
