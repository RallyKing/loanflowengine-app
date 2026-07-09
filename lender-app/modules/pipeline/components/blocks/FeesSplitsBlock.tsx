"use client";

import { Plus, Trash2 } from "lucide-react";
import { InlineNumber, InlineText } from "@/components/inline";
import { FieldLabel } from "@/components/pipeline/FieldLabel";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import type { Doc, Id } from "@/convex/_generated/dataModel";

export type SplitRow = {
  name: string;
  amount: number;
  reason?: string;
};

function fmtCurrency(n: number | null | undefined) {
  if (n == null || !Number.isFinite(n)) return "—";
  return `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function fmtCurrencyCents(n: number | null | undefined) {
  if (n == null || !Number.isFinite(n)) return "—";
  return `$${n.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function fmtPct(n: number | null | undefined) {
  if (n == null || !Number.isFinite(n)) return "—";
  return `${n.toLocaleString(undefined, { maximumFractionDigits: 3 })}%`;
}

function parsePctInput(s: string): number | null | undefined {
  const trimmed = s.replace(/[%\s,]/g, "");
  if (!trimmed) return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : undefined;
}

type FeeRowProps = {
  label: string;
  fundingAmount: number | undefined;
  pct: number | undefined;
  outside: number | undefined;
  total: number | undefined;
  onCommitPct: (next: number | null) => Promise<void>;
  onCommitOutside: (next: number | null) => Promise<void>;
  emphasizeTotal?: boolean;
};

function FeeRow({
  label,
  fundingAmount,
  pct,
  outside,
  total,
  onCommitPct,
  onCommitOutside,
  emphasizeTotal,
}: FeeRowProps) {
  const hasPct = pct !== undefined;
  const hasOutside = outside !== undefined;
  const hasAnyInput = hasPct || hasOutside;
  const fundingOk =
    fundingAmount != null && Number.isFinite(fundingAmount) && fundingAmount >= 0;
  const calcDollar =
    hasPct && fundingOk ? (fundingAmount * (pct ?? 0)) / 100 : undefined;
  const computedTotal = hasAnyInput
    ? hasPct && !fundingOk
      ? total
      : (calcDollar ?? 0) + (outside ?? 0)
    : total;

  return (
    <div className="rounded-md border border-border/70 bg-muted/15 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {label}
        </div>
        <div
          className={cn(
            "rounded-md px-2 py-0.5 text-sm tabular-nums",
            emphasizeTotal
              ? "bg-primary/10 font-semibold text-primary"
              : "bg-background font-medium text-foreground",
          )}
          aria-label={`${label} total`}
        >
          {computedTotal === undefined || computedTotal === null
            ? "—"
            : fmtCurrencyCents(computedTotal)}
        </div>
      </div>
      <div className="grid grid-cols-1 gap-2 lg:grid-cols-[120px_1fr_120px]">
        <div className="space-y-1">
          <FieldLabel>Percent</FieldLabel>
          <InlineNumber
            value={pct ?? null}
            format={fmtPct}
            placeholder="—%"
            parse={parsePctInput}
            validate={(n) =>
              n < 0 ? "Must be 0 or more" : n > 100 ? "Max 100%" : null
            }
            onCommit={(next) => onCommitPct(next)}
            ariaLabel={`Edit ${label} percent`}
          />
        </div>
        <div className="space-y-1">
          <FieldLabel>= Calculated from loan</FieldLabel>
          <div
            className={cn(
              "h-9 rounded-md border border-dashed border-border/70 bg-background/40 px-3 py-1.5 text-sm tabular-nums",
              calcDollar === undefined && "text-muted-foreground",
            )}
            aria-live="polite"
          >
            {calcDollar === undefined
              ? hasPct && !fundingOk
                ? "—"
                : "Enter percent →"
              : fmtCurrencyCents(calcDollar)}
          </div>
        </div>
        <div className="space-y-1">
          <FieldLabel>+ Outside fee</FieldLabel>
          <InlineNumber
            value={outside ?? null}
            format={fmtCurrency}
            placeholder="$0"
            validate={(n) => (n < 0 ? "Must be 0 or more" : null)}
            onCommit={(next) => onCommitOutside(next)}
            ariaLabel={`Edit ${label} outside fee`}
          />
        </div>
      </div>
    </div>
  );
}

export type FeesSplitsBlockProps = {
  file: Doc<"pipeline">;
  /** Same resolver as the Funding amount inline field — live file deal, not a stale pipeline-only copy. */
  loanBaseAmount: number;
  patch: (fields: {
    id: Id<"pipeline">;
    lenderFeePct?: number | null;
    lenderFeeOutside?: number | null;
    brokerGrossPct?: number | null;
    brokerGrossOutside?: number | null;
    netToUserPct?: number | null;
    netToUserOutside?: number | null;
  }) => Promise<void>;
  splits: SplitRow[];
  onCommitSplits: (next: SplitRow[]) => Promise<void>;
};

/** Pipeline lender/broker/net fee rows plus commission splits (Phase 37.13.E). */
export function FeesSplitsBlock({
  file,
  loanBaseAmount,
  patch,
  splits,
  onCommitSplits,
}: FeesSplitsBlockProps) {
  const updateSplit = async (
    index: number,
    fields: Partial<SplitRow>,
  ): Promise<void> => {
    const next = splits.map((s, i) =>
      i === index ? { ...s, ...fields } : s,
    );
    await onCommitSplits(next);
  };

  const removeSplit = async (index: number): Promise<void> => {
    await onCommitSplits(splits.filter((_, i) => i !== index));
  };

  const addSplit = async (): Promise<void> => {
    await onCommitSplits([...splits, { name: "Split", amount: 0 }]);
  };

  const fundingForFees =
    typeof loanBaseAmount === "number" && Number.isFinite(loanBaseAmount)
      ? loanBaseAmount
      : 0;

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Funding amount:{" "}
        <span className="font-medium text-foreground">
          {fmtCurrency(fundingForFees)}
        </span>{" "}
        — totals recompute when you change the loan, percent, or outside fee.
      </p>

      <div className="space-y-3">
        <FeeRow
          label="Lender fee"
          fundingAmount={fundingForFees}
          pct={file.lenderFeePct}
          outside={file.lenderFeeOutside}
          total={file.lenderFee}
          onCommitPct={(next) =>
            patch({ id: file._id, lenderFeePct: next === null ? null : next })
          }
          onCommitOutside={(next) =>
            patch({
              id: file._id,
              lenderFeeOutside: next === null ? null : next,
            })
          }
        />
        <FeeRow
          label="Broker (gross)"
          fundingAmount={fundingForFees}
          pct={file.brokerGrossPct}
          outside={file.brokerGrossOutside}
          total={file.brokerGross}
          onCommitPct={(next) =>
            patch({ id: file._id, brokerGrossPct: next === null ? null : next })
          }
          onCommitOutside={(next) =>
            patch({
              id: file._id,
              brokerGrossOutside: next === null ? null : next,
            })
          }
        />
        <FeeRow
          label="Net to you"
          fundingAmount={fundingForFees}
          pct={file.netToUserPct}
          outside={file.netToUserOutside}
          total={file.netToUser}
          onCommitPct={(next) =>
            patch({ id: file._id, netToUserPct: next === null ? null : next })
          }
          onCommitOutside={(next) =>
            patch({
              id: file._id,
              netToUserOutside: next === null ? null : next,
            })
          }
          emphasizeTotal
        />
      </div>

      <div className="mt-4">
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className="text-xs font-medium text-muted-foreground">Splits</div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => void addSplit()}
          >
            <Plus className="h-3.5 w-3.5" /> Add split
          </Button>
        </div>
        {splits.length === 0 ? (
          <p className="rounded-md border border-dashed p-3 text-center text-sm text-muted-foreground">
            No splits.
          </p>
        ) : (
          <ul className="space-y-2" aria-label="Pipeline splits">
            {splits.map((s, i) => (
              <li
                key={i}
                className="grid grid-cols-1 items-start gap-2 rounded-md border border-border/60 bg-muted/15 p-2 lg:grid-cols-[1fr_140px_1fr_auto]"
              >
                <div className="space-y-1">
                  <FieldLabel>Name</FieldLabel>
                  <InlineText
                    value={s.name}
                    onCommit={(next) =>
                      updateSplit(i, { name: next || "Split" })
                    }
                    ariaLabel={`Split ${i + 1} name`}
                  />
                </div>
                <div className="space-y-1">
                  <FieldLabel>Amount</FieldLabel>
                  <InlineNumber
                    value={s.amount}
                    format={fmtCurrency}
                    clearable={false}
                    onCommit={(next) => updateSplit(i, { amount: next ?? 0 })}
                    ariaLabel={`Split ${i + 1} amount`}
                  />
                </div>
                <div className="space-y-1">
                  <FieldLabel>Reason</FieldLabel>
                  <InlineText
                    value={s.reason ?? ""}
                    allowEmpty
                    placeholder="Add reason"
                    onCommit={(next) =>
                      updateSplit(i, { reason: next || undefined })
                    }
                    ariaLabel={`Split ${i + 1} reason`}
                  />
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="self-end text-muted-foreground hover:text-destructive sm:self-center"
                  onClick={() => void removeSplit(i)}
                  aria-label={`Remove split ${i + 1}`}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
