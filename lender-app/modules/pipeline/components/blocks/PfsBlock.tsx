"use client";

/**
 * Phase Modular-C — `pfs` block. Spreadsheet-style personal financial
 * statement over the deal draft (assets/liabilities) with computed net worth.
 * Writes go through the existing contact-first dual-write adapter, which
 * mirrors rows to the primary borrower's `contactFinancialProfiles` store.
 * REO equity is read from the sticky `contactReoProperties` rows.
 */
import { useMemo } from "react";
import { useQuery } from "convex/react";
import { Landmark, Plus, Trash2 } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { CollapsibleBlock } from "@/components/ui/CollapsibleBlock";
import { cn } from "@/lib/cn";
import type { DealWorkspaceSheet } from "@/lib/file/dealSectionTypes";
import { useDealWorkspaceEditor } from "@/lib/file/useDealWorkspaceEditor";
import { useContactFirstBorrowerUpdate } from "@/lib/contacts/borrowerTabWriteAdapter";
import {
  sumAssetsEstimatedValue,
  sumLiabilitiesBalances,
  sumLiabilitiesMonthlyPayments,
} from "@/lib/intake/moneyAggregates";
import { MODULAR_BLOCK_SECTION_IDS } from "@/lib/pipeline/fileWorkspaceTabRouting";

type AssetRows = NonNullable<DealWorkspaceSheet["assets"]>;
type LiabilityRows = NonNullable<DealWorkspaceSheet["liabilities"]>;

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

const CELL_INPUT_CLASS =
  "h-8 w-full rounded-dlc-sm border border-transparent bg-transparent px-1.5 text-sm focus-visible:border-primary/50 focus-visible:bg-background focus-visible:outline-none";

export type PfsBlockProps = {
  /** Primary borrower contact — used for the sticky REO equity roll-in. */
  contactId: Id<"contacts"> | null;
  memberUserKey?: string;
  readOnly?: boolean;
};

export function PfsBlock({
  contactId,
  memberUserKey,
  readOnly = false,
}: PfsBlockProps) {
  const { draft } = useDealWorkspaceEditor();
  const { update, assetsSaving } = useContactFirstBorrowerUpdate();

  const reoRows = useQuery(
    api.contactDataBridge.getContactReo,
    contactId && memberUserKey ? { contactId, memberUserKey } : "skip",
  );

  const assets: AssetRows = useMemo(() => draft?.assets ?? [], [draft?.assets]);
  const liabilities: LiabilityRows = useMemo(
    () => draft?.liabilities ?? [],
    [draft?.liabilities],
  );

  const assetTotal = useMemo(() => sumAssetsEstimatedValue(assets), [assets]);
  const liabilityBalanceTotal = useMemo(
    () => sumLiabilitiesBalances(liabilities),
    [liabilities],
  );
  const liabilityMonthlyTotal = useMemo(
    () => sumLiabilitiesMonthlyPayments(liabilities),
    [liabilities],
  );
  const reoEquity = useMemo(() => {
    if (!reoRows?.length) return 0;
    return reoRows.reduce(
      (sum, r) =>
        sum + parseMoney(r.marketValue) - parseMoney(r.mortgageBalance),
      0,
    );
  }, [reoRows]);

  const netWorth = assetTotal - liabilityBalanceTotal;
  const netWorthWithReo = netWorth + reoEquity;

  const meta = useMemo(() => {
    const count = assets.length + liabilities.length;
    return {
      status: count > 0 ? "Configured" : "Draft",
      summary:
        count > 0
          ? `Net worth ${formatMoney(netWorth)} · ${assets.length} asset(s) · ${liabilities.length} liability(ies)`
          : "Assets & liabilities grid with computed net worth",
      indicatorCount: count > 0 ? count : undefined,
    };
  }, [assets.length, liabilities.length, netWorth]);

  const setAsset = (
    index: number,
    patch: Partial<AssetRows[number]>,
  ) => {
    update(
      "assets",
      assets.map((row, i) => (i === index ? { ...row, ...patch } : row)),
    );
  };
  const setLiability = (
    index: number,
    patch: Partial<LiabilityRows[number]>,
  ) => {
    update(
      "liabilities",
      liabilities.map((row, i) => (i === index ? { ...row, ...patch } : row)),
    );
  };

  if (!draft) {
    // Loading shell instead of vanishing — keeps layout stable while the
    // deal workspace draft hydrates.
    return (
      <div
        id={MODULAR_BLOCK_SECTION_IDS.pfs}
        className="rounded-dlc-md border border-border/60 bg-dlc-surface px-3 py-4 text-xs text-muted-foreground"
        role="status"
      >
        Loading personal financial statement…
      </div>
    );
  }

  return (
    <CollapsibleBlock
      id={MODULAR_BLOCK_SECTION_IDS.pfs}
      title="Personal financial statement"
      status={meta.status}
      summary={meta.summary}
      indicatorCount={meta.indicatorCount}
      icon={<Landmark className="h-4 w-4" aria-hidden />}
      description="Spreadsheet-style PFS. Rows sync to the primary borrower's sticky financial profile and travel across files."
      lazyMount
      animated
      contentClassName="space-y-4"
    >
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <section className="space-y-2" aria-label="Assets">
          <div className="flex items-center justify-between">
            <h4 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Assets
            </h4>
            {!readOnly ? (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-8 px-2 text-xs"
                onClick={() => update("assets", [...assets, {}])}
                data-testid="pfs-add-asset"
              >
                <Plus className="h-3.5 w-3.5" aria-hidden />
                Add row
              </Button>
            ) : null}
          </div>
          <div className="overflow-x-auto rounded-dlc-md border border-border/60">
            <table className="w-full min-w-[22rem] border-separate border-spacing-0 text-sm">
              <thead>
                <tr className="bg-dlc-surface-high/60 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  <th className="border-b border-border/70 px-2 py-1.5">Description</th>
                  <th className="border-b border-border/70 px-2 py-1.5 text-right">Value</th>
                  {!readOnly ? (
                    <th className="w-9 border-b border-border/70 px-1 py-1.5">
                      <span className="sr-only">Remove</span>
                    </th>
                  ) : null}
                </tr>
              </thead>
              <tbody>
                {assets.length === 0 ? (
                  <tr>
                    <td
                      colSpan={readOnly ? 2 : 3}
                      className="px-2 py-3 text-xs text-muted-foreground"
                    >
                      No asset rows yet.
                    </td>
                  </tr>
                ) : (
                  assets.map((row, i) => (
                    <tr key={i}>
                      <td className="border-b border-border/40 px-1 py-0.5">
                        {readOnly ? (
                          <span className="px-1.5">{row.description || "—"}</span>
                        ) : (
                          <input
                            className={CELL_INPUT_CLASS}
                            value={row.description ?? ""}
                            placeholder="Cash, brokerage, vehicle…"
                            aria-label={`Asset ${i + 1} description`}
                            onChange={(e) =>
                              setAsset(i, { description: e.target.value })
                            }
                          />
                        )}
                      </td>
                      <td className="border-b border-border/40 px-1 py-0.5 text-right">
                        {readOnly ? (
                          <span className="px-1.5 tabular-nums">
                            {row.estimatedValue || "—"}
                          </span>
                        ) : (
                          <input
                            className={cn(CELL_INPUT_CLASS, "text-right tabular-nums")}
                            value={row.estimatedValue ?? ""}
                            placeholder="$"
                            inputMode="decimal"
                            aria-label={`Asset ${i + 1} estimated value`}
                            onChange={(e) =>
                              setAsset(i, { estimatedValue: e.target.value })
                            }
                          />
                        )}
                      </td>
                      {!readOnly ? (
                        <td className="border-b border-border/40 px-1 py-0.5">
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                            aria-label={`Remove asset row ${i + 1}`}
                            onClick={() =>
                              update(
                                "assets",
                                assets.filter((_, idx) => idx !== i),
                              )
                            }
                          >
                            <Trash2 className="h-3.5 w-3.5" aria-hidden />
                          </Button>
                        </td>
                      ) : null}
                    </tr>
                  ))
                )}
              </tbody>
              <tfoot>
                <tr className="text-sm font-semibold text-foreground">
                  <td className="px-2 py-2">Total assets</td>
                  <td className="px-2 py-2 text-right tabular-nums">
                    {formatMoney(assetTotal)}
                  </td>
                  {!readOnly ? <td /> : null}
                </tr>
              </tfoot>
            </table>
          </div>
        </section>

        <section className="space-y-2" aria-label="Liabilities">
          <div className="flex items-center justify-between">
            <h4 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Liabilities
            </h4>
            {!readOnly ? (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-8 px-2 text-xs"
                onClick={() => update("liabilities", [...liabilities, {}])}
                data-testid="pfs-add-liability"
              >
                <Plus className="h-3.5 w-3.5" aria-hidden />
                Add row
              </Button>
            ) : null}
          </div>
          <div className="overflow-x-auto rounded-dlc-md border border-border/60">
            <table className="w-full min-w-[26rem] border-separate border-spacing-0 text-sm">
              <thead>
                <tr className="bg-dlc-surface-high/60 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  <th className="border-b border-border/70 px-2 py-1.5">Description</th>
                  <th className="border-b border-border/70 px-2 py-1.5 text-right">Monthly</th>
                  <th className="border-b border-border/70 px-2 py-1.5 text-right">Balance</th>
                  {!readOnly ? (
                    <th className="w-9 border-b border-border/70 px-1 py-1.5">
                      <span className="sr-only">Remove</span>
                    </th>
                  ) : null}
                </tr>
              </thead>
              <tbody>
                {liabilities.length === 0 ? (
                  <tr>
                    <td
                      colSpan={readOnly ? 3 : 4}
                      className="px-2 py-3 text-xs text-muted-foreground"
                    >
                      No liability rows yet.
                    </td>
                  </tr>
                ) : (
                  liabilities.map((row, i) => (
                    <tr key={i}>
                      <td className="border-b border-border/40 px-1 py-0.5">
                        {readOnly ? (
                          <span className="px-1.5">{row.description || "—"}</span>
                        ) : (
                          <input
                            className={CELL_INPUT_CLASS}
                            value={row.description ?? ""}
                            placeholder="Mortgage, card, auto loan…"
                            aria-label={`Liability ${i + 1} description`}
                            onChange={(e) =>
                              setLiability(i, { description: e.target.value })
                            }
                          />
                        )}
                      </td>
                      <td className="border-b border-border/40 px-1 py-0.5 text-right">
                        {readOnly ? (
                          <span className="px-1.5 tabular-nums">
                            {row.monthlyPayment || "—"}
                          </span>
                        ) : (
                          <input
                            className={cn(CELL_INPUT_CLASS, "text-right tabular-nums")}
                            value={row.monthlyPayment ?? ""}
                            placeholder="$/mo"
                            inputMode="decimal"
                            aria-label={`Liability ${i + 1} monthly payment`}
                            onChange={(e) =>
                              setLiability(i, { monthlyPayment: e.target.value })
                            }
                          />
                        )}
                      </td>
                      <td className="border-b border-border/40 px-1 py-0.5 text-right">
                        {readOnly ? (
                          <span className="px-1.5 tabular-nums">
                            {row.balance || "—"}
                          </span>
                        ) : (
                          <input
                            className={cn(CELL_INPUT_CLASS, "text-right tabular-nums")}
                            value={row.balance ?? ""}
                            placeholder="$"
                            inputMode="decimal"
                            aria-label={`Liability ${i + 1} balance`}
                            onChange={(e) =>
                              setLiability(i, { balance: e.target.value })
                            }
                          />
                        )}
                      </td>
                      {!readOnly ? (
                        <td className="border-b border-border/40 px-1 py-0.5">
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                            aria-label={`Remove liability row ${i + 1}`}
                            onClick={() =>
                              update(
                                "liabilities",
                                liabilities.filter((_, idx) => idx !== i),
                              )
                            }
                          >
                            <Trash2 className="h-3.5 w-3.5" aria-hidden />
                          </Button>
                        </td>
                      ) : null}
                    </tr>
                  ))
                )}
              </tbody>
              <tfoot>
                <tr className="text-sm font-semibold text-foreground">
                  <td className="px-2 py-2">Total liabilities</td>
                  <td className="px-2 py-2 text-right tabular-nums">
                    {formatMoney(liabilityMonthlyTotal)}/mo
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums">
                    {formatMoney(liabilityBalanceTotal)}
                  </td>
                  {!readOnly ? <td /> : null}
                </tr>
              </tfoot>
            </table>
          </div>
        </section>
      </div>

      <div
        className="flex flex-wrap items-center gap-x-6 gap-y-1 rounded-dlc-md border border-border/60 bg-dlc-surface-high/40 px-3 py-2"
        data-testid="pfs-net-worth-summary"
      >
        <p className="text-sm font-semibold text-foreground">
          Net worth:{" "}
          <span className={cn("tabular-nums", netWorth < 0 && "text-destructive")}>
            {formatMoney(netWorth)}
          </span>
        </p>
        {reoRows !== undefined && contactId ? (
          <p className="text-xs text-muted-foreground">
            REO equity ({reoRows?.length ?? 0} propert
            {(reoRows?.length ?? 0) === 1 ? "y" : "ies"}):{" "}
            <span className="tabular-nums">{formatMoney(reoEquity)}</span>
            {" · "}incl. REO:{" "}
            <span
              className={cn(
                "font-semibold tabular-nums text-foreground",
                netWorthWithReo < 0 && "text-destructive",
              )}
            >
              {formatMoney(netWorthWithReo)}
            </span>
          </p>
        ) : null}
        {assetsSaving ? (
          <p className="text-xs text-muted-foreground" role="status">
            Saving…
          </p>
        ) : null}
      </div>
    </CollapsibleBlock>
  );
}

export default PfsBlock;
