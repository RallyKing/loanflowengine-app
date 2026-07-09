"use client";

/**
 * Phase Modular-C — `constructionBudget` block. Line-item construction budget
 * (category / description / budget / spent / draw / status) over the
 * `constructionBudgetLines` table with a summary roll-up row.
 */
import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { HardHat, Plus, Trash2 } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { CollapsibleBlock } from "@/components/ui/CollapsibleBlock";
import { cn } from "@/lib/cn";
import { MODULAR_BLOCK_SECTION_IDS } from "@/lib/pipeline/fileWorkspaceTabRouting";

type BudgetLine = Doc<"constructionBudgetLines">;
type BudgetLineStatus = BudgetLine["status"];

const STATUS_OPTIONS: ReadonlyArray<{
  value: BudgetLineStatus;
  label: string;
}> = [
  { value: "planned", label: "Planned" },
  { value: "in_progress", label: "In progress" },
  { value: "complete", label: "Complete" },
  { value: "on_hold", label: "On hold" },
];

function statusLabel(status: BudgetLineStatus): string {
  return STATUS_OPTIONS.find((o) => o.value === status)?.label ?? status;
}

function parseMoney(raw: string | undefined): number {
  if (!raw) return 0;
  const n = Number.parseFloat(raw.replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function formatMoney(n: number): string {
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

export type ConstructionBudgetBlockProps = {
  fileId: Id<"pipeline">;
  memberUserKey?: string;
  readOnly?: boolean;
};

export function ConstructionBudgetBlock({
  fileId,
  memberUserKey,
  readOnly = false,
}: ConstructionBudgetBlockProps) {
  const lines = useQuery(api.constructionBudget.listByFile, {
    fileId,
    ...(memberUserKey ? { memberUserKey } : {}),
  });
  const upsertLine = useMutation(api.constructionBudget.upsertLine);
  const setLineStatus = useMutation(api.constructionBudget.setLineStatus);
  const removeLine = useMutation(api.constructionBudget.removeLine);

  const [draft, setDraft] = useState({
    category: "",
    description: "",
    budgetAmount: "",
    spentAmount: "",
    drawNumber: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const totals = useMemo(() => {
    const rows = lines ?? [];
    const budget = rows.reduce((s, r) => s + parseMoney(r.budgetAmount), 0);
    const spent = rows.reduce((s, r) => s + parseMoney(r.spentAmount), 0);
    return { budget, spent, remaining: budget - spent };
  }, [lines]);

  const meta = useMemo(() => {
    const count = lines?.length ?? 0;
    return {
      status: count > 0 ? "Configured" : "Draft",
      summary:
        count > 0
          ? `${count} line(s) · ${formatMoney(totals.budget)} budget · ${formatMoney(totals.spent)} spent`
          : "Line-item budget with draw tracking",
      indicatorCount: count > 0 ? count : undefined,
    };
  }, [lines, totals]);

  const addLine = async () => {
    const category = draft.category.trim();
    if (!category) {
      setError("Category is required.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await upsertLine({
        fileId,
        category,
        description: draft.description.trim() || undefined,
        budgetAmount: draft.budgetAmount.trim() || undefined,
        spentAmount: draft.spentAmount.trim() || undefined,
        drawNumber: draft.drawNumber.trim() || undefined,
        ...(memberUserKey ? { memberUserKey } : {}),
      });
      setDraft({
        category: "",
        description: "",
        budgetAmount: "",
        spentAmount: "",
        drawNumber: "",
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <CollapsibleBlock
      id={MODULAR_BLOCK_SECTION_IDS.constructionBudget}
      title="Construction budget"
      status={meta.status}
      summary={meta.summary}
      indicatorCount={meta.indicatorCount}
      icon={<HardHat className="h-4 w-4" aria-hidden />}
      description="Category-level construction budget with spend and draw tracking. Amounts roll up to the summary row."
      lazyMount
      animated
      contentClassName="space-y-4"
    >
      {lines === undefined ? (
        <p className="text-xs text-muted-foreground" role="status">
          Loading budget…
        </p>
      ) : lines.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No budget lines yet. Add categories like Foundation, Framing, or
          Soft Costs below.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table
            className="w-full min-w-[42rem] border-separate border-spacing-0 text-sm"
            data-testid="construction-budget-table"
          >
            <thead>
              <tr className="text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                <th className="border-b border-border/70 px-2 py-1.5">Category</th>
                <th className="border-b border-border/70 px-2 py-1.5">Description</th>
                <th className="border-b border-border/70 px-2 py-1.5 text-right">Budget</th>
                <th className="border-b border-border/70 px-2 py-1.5 text-right">Spent</th>
                <th className="border-b border-border/70 px-2 py-1.5 text-right">Remaining</th>
                <th className="border-b border-border/70 px-2 py-1.5">Draw #</th>
                <th className="border-b border-border/70 px-2 py-1.5">Status</th>
                {!readOnly ? (
                  <th className="border-b border-border/70 px-2 py-1.5">
                    <span className="sr-only">Actions</span>
                  </th>
                ) : null}
              </tr>
            </thead>
            <tbody>
              {lines.map((line) => {
                const remaining =
                  parseMoney(line.budgetAmount) - parseMoney(line.spentAmount);
                return (
                  <tr key={line._id} className="align-middle">
                    <td className="border-b border-border/40 px-2 py-1.5 font-medium text-foreground">
                      {line.category}
                    </td>
                    <td className="border-b border-border/40 px-2 py-1.5 text-muted-foreground">
                      {line.description || "—"}
                    </td>
                    <td className="border-b border-border/40 px-2 py-1.5 text-right tabular-nums">
                      {line.budgetAmount
                        ? formatMoney(parseMoney(line.budgetAmount))
                        : "—"}
                    </td>
                    <td className="border-b border-border/40 px-2 py-1.5 text-right tabular-nums">
                      {line.spentAmount
                        ? formatMoney(parseMoney(line.spentAmount))
                        : "—"}
                    </td>
                    <td
                      className={cn(
                        "border-b border-border/40 px-2 py-1.5 text-right tabular-nums",
                        remaining < 0 && "font-semibold text-destructive",
                      )}
                    >
                      {formatMoney(remaining)}
                    </td>
                    <td className="border-b border-border/40 px-2 py-1.5">
                      {line.drawNumber || "—"}
                    </td>
                    <td className="border-b border-border/40 px-2 py-1.5">
                      {readOnly ? (
                        statusLabel(line.status)
                      ) : (
                        <select
                          className="h-8 rounded-dlc-sm border border-border bg-background px-1.5 text-xs shadow-dlc-1 focus-visible:border-primary/50 focus-visible:outline-none"
                          value={line.status}
                          aria-label={`Status for ${line.category}`}
                          onChange={(e) => {
                            const value = e.target.value as BudgetLineStatus;
                            void setLineStatus({
                              fileId,
                              lineId: line._id,
                              status: value,
                              ...(memberUserKey ? { memberUserKey } : {}),
                            });
                          }}
                        >
                          {STATUS_OPTIONS.map((o) => (
                            <option key={o.value} value={o.value}>
                              {o.label}
                            </option>
                          ))}
                        </select>
                      )}
                    </td>
                    {!readOnly ? (
                      <td className="border-b border-border/40 px-2 py-1.5">
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                          aria-label={`Remove ${line.category} budget line`}
                          onClick={() =>
                            void removeLine({
                              fileId,
                              lineId: line._id,
                              ...(memberUserKey ? { memberUserKey } : {}),
                            })
                          }
                        >
                          <Trash2 className="h-3.5 w-3.5" aria-hidden />
                        </Button>
                      </td>
                    ) : null}
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="text-sm font-semibold text-foreground">
                <td className="px-2 py-2" colSpan={2}>
                  Total
                </td>
                <td className="px-2 py-2 text-right tabular-nums">
                  {formatMoney(totals.budget)}
                </td>
                <td className="px-2 py-2 text-right tabular-nums">
                  {formatMoney(totals.spent)}
                </td>
                <td
                  className={cn(
                    "px-2 py-2 text-right tabular-nums",
                    totals.remaining < 0 && "text-destructive",
                  )}
                >
                  {formatMoney(totals.remaining)}
                </td>
                <td colSpan={readOnly ? 2 : 3} />
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {!readOnly ? (
        <div className="space-y-2 rounded-dlc-md border border-border/60 bg-dlc-surface-high/40 p-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Add budget line
          </p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-5">
            <Input
              value={draft.category}
              onChange={(e) => setDraft((d) => ({ ...d, category: e.target.value }))}
              placeholder="Category *"
              aria-label="Budget line category"
            />
            <Input
              value={draft.description}
              onChange={(e) =>
                setDraft((d) => ({ ...d, description: e.target.value }))
              }
              placeholder="Description"
              aria-label="Budget line description"
            />
            <Input
              value={draft.budgetAmount}
              onChange={(e) =>
                setDraft((d) => ({ ...d, budgetAmount: e.target.value }))
              }
              placeholder="Budget $"
              inputMode="decimal"
              aria-label="Budget amount"
            />
            <Input
              value={draft.spentAmount}
              onChange={(e) =>
                setDraft((d) => ({ ...d, spentAmount: e.target.value }))
              }
              placeholder="Spent $"
              inputMode="decimal"
              aria-label="Spent amount"
            />
            <Input
              value={draft.drawNumber}
              onChange={(e) =>
                setDraft((d) => ({ ...d, drawNumber: e.target.value }))
              }
              placeholder="Draw #"
              aria-label="Draw number"
            />
          </div>
          {error ? (
            <p className="text-xs text-destructive" role="alert">
              {error}
            </p>
          ) : null}
          <Button
            type="button"
            size="sm"
            disabled={saving || draft.category.trim() === ""}
            onClick={() => void addLine()}
            data-testid="construction-budget-add-line"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden />
            {saving ? "Adding…" : "Add line"}
          </Button>
        </div>
      ) : null}
    </CollapsibleBlock>
  );
}

export default ConstructionBudgetBlock;
