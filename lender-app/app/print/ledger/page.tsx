"use client";

import { Suspense, useEffect, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Doc } from "@/convex/_generated/dataModel";
import type { PipelineListRow } from "@/lib/pipelineListRow";
import { useOrgPermissions } from "@/lib/useOrgPermissions";
import { useUserPreferences } from "@/lib/userPreferencesContext";
import { Printer, X } from "lucide-react";
import {
  getPipelineStatusInfo,
  isPaidStatus,
} from "@/lib/pipelineStatus";

type LedgerEntry = {
  ledger: Doc<"ledger">;
  file: Doc<"pipeline"> | null;
  payments: Doc<"payments">[];
  receivedGross: number;
  receivedNet: number;
  paymentCount: number;
  lastPaymentDate: number | null;
};

type PaymentMode = "lump_sum" | "scheduled" | "monthly";

const MODE_LABEL: Record<PaymentMode, string> = {
  lump_sum: "Lump sum",
  scheduled: "Scheduled",
  monthly: "Monthly",
};

function modeOf(l: Doc<"ledger">): PaymentMode {
  return l.paymentMode ?? "lump_sum";
}

function fmtMoney(n: number): string {
  return `$${n.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function fmtDate(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function fmtDateLong(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

/**
 * Print-friendly ledger view. Mirrors the filters from the live ledger
 * page through URL search params (`?q=`, `?year=`, `?mode=`, `?method=`,
 * `?payee=`) so the print snapshot matches what the user was looking at.
 *
 * The toolbar (Print / Close buttons + filter banner) is `.no-print` and
 * disappears on print; the rest of the page is plain semantic HTML so the
 * browser's "Save as PDF" produces a clean export.
 */
function PrintLedgerContent() {
  const search = useSearchParams();
  const { activeOrganizationId } = useOrgPermissions();
  const { accountId } = useUserPreferences();
  const preferencesAccountId = accountId.trim() || undefined;
  const orgListArgs =
    activeOrganizationId && preferencesAccountId
      ? {
          organizationId: activeOrganizationId,
          memberUserKey: preferencesAccountId,
        }
      : null;
  const rows = useQuery(api.ledger.list, orgListArgs ?? "skip");
  const allFiles = useQuery(api.pipeline.listLight, orgListArgs ?? "skip");

  // Set a sensible PDF filename via document.title.
  useEffect(() => {
    const old = document.title;
    const yearTag = search?.get("year") ?? "all";
    const stamp = new Date().toISOString().slice(0, 10);
    document.title = `Ledger ${yearTag} ${stamp}`;
    return () => {
      document.title = old;
    };
  }, [search]);

  const q = (search?.get("q") ?? "").trim().toLowerCase();
  const year = search?.get("year") ?? "all";
  const mode = (search?.get("mode") ?? "all") as "all" | PaymentMode;
  const method = search?.get("method") ?? "all";
  const payee = search?.get("payee") ?? "all";

  const filtered = useMemo<LedgerEntry[]>(() => {
    if (!rows) return [];
    return rows.filter((r) => {
      // Mirror the live page: ledger only shows Paid/Paying files
      // (rows whose file was deleted are kept so historical revenue is
      // preserved).
      if (r.file !== null && !isPaidStatus(r.file.status)) return false;
      if (year !== "all") {
        if (String(new Date(r.ledger.date).getFullYear()) !== year)
          return false;
      }
      if (mode !== "all" && modeOf(r.ledger) !== mode) return false;
      if (method !== "all" && (r.ledger.paymentMethod ?? "") !== method)
        return false;
      if (payee !== "all" && (r.ledger.paidBy ?? "") !== payee) return false;
      if (q) {
        const hay = [
          r.file?.fileName ?? "",
          r.file?.propertyAddress ?? "",
          r.ledger.paymentMethod ?? "",
          r.ledger.paidBy ?? "",
          r.ledger.notes ?? "",
        ]
          .join(" ")
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [rows, q, year, mode, method, payee]);

  const totals = useMemo(() => {
    let expectedGross = 0;
    let expectedNet = 0;
    let receivedGross = 0;
    let receivedNet = 0;
    for (const r of filtered) {
      expectedGross += r.ledger.gross || 0;
      expectedNet += r.ledger.net || 0;
      receivedGross += r.receivedGross || 0;
      receivedNet += r.receivedNet || 0;
    }
    return {
      expectedGross,
      expectedNet,
      receivedGross,
      receivedNet,
      balanceGross: Math.max(0, expectedGross - receivedGross),
      balanceNet: Math.max(0, expectedNet - receivedNet),
    };
  }, [filtered]);

  const projected = useMemo<PipelineListRow[]>(() => {
    if (!allFiles) return [];
    return allFiles
      .filter((f) => f.projectIntoLedger && !isPaidStatus(f.status))
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }, [allFiles]);

  const projectionTotals = useMemo(() => {
    let net = 0;
    let gross = 0;
    for (const f of projected) {
      net += f.netToUser ?? 0;
      gross += f.brokerGross ?? 0;
    }
    return { net, gross, count: projected.length };
  }, [projected]);

  const today = Date.now();
  const filterBadges = useMemo(() => {
    const badges: { label: string; value: string }[] = [];
    if (year !== "all") badges.push({ label: "Year", value: year });
    if (mode !== "all")
      badges.push({ label: "Mode", value: MODE_LABEL[mode as PaymentMode] });
    if (method !== "all") badges.push({ label: "Method", value: method });
    if (payee !== "all") badges.push({ label: "Payee", value: payee });
    if (q) badges.push({ label: "Search", value: q });
    return badges;
  }, [year, mode, method, payee, q]);

  return (
    <div className="print-page bg-white text-black">
      <style>{`
        @page { size: letter landscape; margin: 0.5in; }
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; }
          .print-page { padding: 0 !important; }
          tr, .funding-block { break-inside: avoid; }
          thead { display: table-header-group; }
        }
        .print-page {
          font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI",
            Roboto, Helvetica, Arial, "Apple Color Emoji", "Segoe UI Emoji";
          color: #111827;
          max-width: 10.4in;
          margin: 0 auto;
          padding: 24px 28px 56px;
        }
        .print-page h1 { font-size: 22px; font-weight: 700; margin: 0; }
        .print-page h2 {
          font-size: 12px; font-weight: 700; letter-spacing: .06em;
          text-transform: uppercase; color: #4b5563; margin: 0 0 6px;
        }
        .totals-grid {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 8px 18px;
          font-size: 13px;
        }
        .totals-grid .label {
          font-size: 10.5px; letter-spacing: .04em; text-transform: uppercase;
          color: #6b7280;
        }
        .totals-grid .value { font-size: 18px; font-weight: 700; }
        .funding-block {
          border: 1px solid #d1d5db;
          border-radius: 8px;
          margin-bottom: 14px;
          overflow: hidden;
        }
        .funding-head {
          display: grid;
          grid-template-columns: 2fr 1fr 1fr 1fr 1fr;
          gap: 4px 12px;
          background: #f3f4f6;
          padding: 10px 14px;
          font-size: 12.5px;
          border-bottom: 1px solid #e5e7eb;
        }
        .funding-head .label {
          font-size: 10px; letter-spacing: .04em; text-transform: uppercase;
          color: #6b7280;
        }
        .funding-head .value { font-weight: 600; }
        .file-name { grid-column: 1 / 2; }
        .file-name .name { font-size: 14px; font-weight: 700; }
        .file-name .address { font-size: 11.5px; color: #6b7280; }
        .file-name .status {
          display: inline-block; margin-top: 4px; font-size: 10.5px;
          border: 1px solid #d1d5db; border-radius: 999px; padding: 1px 8px;
          color: #374151; background: #fff;
        }
        .funding-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 12px;
        }
        .funding-table th, .funding-table td {
          padding: 6px 10px;
          border-bottom: 1px solid #e5e7eb;
          text-align: left;
        }
        .funding-table th {
          font-size: 10px;
          letter-spacing: .04em;
          text-transform: uppercase;
          color: #6b7280;
          background: #fafafa;
        }
        .funding-table td.r, .funding-table th.r { text-align: right; font-variant-numeric: tabular-nums; }
        .funding-table .empty {
          color: #9ca3af; font-style: italic; padding: 10px;
        }
        .summary-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 12.5px;
          margin-top: 6px;
        }
        .summary-table th, .summary-table td {
          padding: 6px 10px;
          border-bottom: 1px solid #e5e7eb;
          text-align: left;
        }
        .summary-table th {
          font-size: 10px;
          letter-spacing: .04em;
          text-transform: uppercase;
          color: #6b7280;
          background: #f3f4f6;
        }
        .summary-table td.r, .summary-table th.r {
          text-align: right; font-variant-numeric: tabular-nums;
        }
        .badge {
          display: inline-block; font-size: 10.5px; padding: 1px 8px;
          border: 1px solid #d1d5db; border-radius: 999px; color: #374151;
          background: #fff;
        }
        .footer-note {
          color: #6b7280; font-size: 11px; margin-top: 24px;
          padding-top: 12px; border-top: 1px solid #e5e7eb;
        }
      `}</style>

      <div className="no-print sticky top-0 z-10 mb-6 -mx-8 flex items-center justify-between border-b border-border bg-background/95 px-8 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/90">
        <div className="text-sm text-muted-foreground">
          Printable ledger · use your browser&apos;s Print menu (or Ctrl/⌘ + P)
          to save as PDF.
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            <Printer className="h-4 w-4" />
            Print / Save as PDF
          </button>
          <button
            type="button"
            onClick={() => window.close()}
            className="inline-flex items-center gap-2 rounded-md border border-border/80 px-3 py-1.5 text-sm text-foreground hover:bg-muted"
          >
            <X className="h-4 w-4" />
            Close
          </button>
        </div>
      </div>

      {/* Header */}
      <header className="mb-6 flex items-start justify-between gap-6 border-b border-border pb-4">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Funding ledger
          </div>
          <h1 className="mt-1">
            {year === "all" ? "All time" : `${year}`}
            {filterBadges.length > 0 && (
              <span className="ml-2 text-base font-normal text-muted-foreground">
                ({filtered.length} of {rows?.length ?? "…"})
              </span>
            )}
          </h1>
          {filterBadges.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {filterBadges.map((b) => (
                <span key={b.label} className="badge">
                  <span className="text-[10px] uppercase text-muted-foreground">
                    {b.label}:
                  </span>{" "}
                  {b.value}
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="text-right text-xs text-muted-foreground">
          <div>{fmtDateLong(today)}</div>
        </div>
      </header>

      {/* Totals — NET is the headline figure (what actually lands in the
          bank). Gross is a small subline for reconciliation. */}
      <section className="mb-6 rounded-lg border border-border bg-muted/40 p-4">
        <h2>Totals (net to you)</h2>
        <div className="totals-grid mt-2">
          <div>
            <div className="label">Fundings</div>
            <div className="value">{filtered.length}</div>
          </div>
          <div>
            <div className="label">Booked net</div>
            <div className="value">{fmtMoney(totals.expectedNet)}</div>
            <div className="text-[11px] text-muted-foreground">
              gross {fmtMoney(totals.expectedGross)}
            </div>
          </div>
          <div>
            <div className="label">Received net</div>
            <div className="value">{fmtMoney(totals.receivedNet)}</div>
            <div className="text-[11px] text-muted-foreground">
              gross {fmtMoney(totals.receivedGross)}
            </div>
          </div>
          <div>
            <div className="label">Balance net</div>
            <div className="value">{fmtMoney(totals.balanceNet)}</div>
            {totals.balanceGross > 0 && (
              <div className="text-[11px] text-muted-foreground">
                gross {fmtMoney(totals.balanceGross)}
              </div>
            )}
          </div>
        </div>
        {projectionTotals.count > 0 && (
          <div className="mt-3 rounded-md border border-border/80 bg-white p-3">
            <div className="label" style={{ fontSize: 10.5, color: "#6b7280" }}>
              Projected net — pinned in-flight files ({projectionTotals.count})
            </div>
            <div className="value" style={{ fontSize: 18, fontWeight: 700 }}>
              {fmtMoney(projectionTotals.net)}
            </div>
            {projectionTotals.gross > 0 && (
              <div className="text-[11px] text-muted-foreground">
                gross {fmtMoney(projectionTotals.gross)}
              </div>
            )}
            <div className="mt-1 text-[11px] text-muted-foreground">
              In-flight pins only — not part of the booked net totals above.
            </div>
          </div>
        )}
      </section>

      {/* Projections — in-flight files the user has pinned to the
          forecast. Hidden when empty so the print stays compact. */}
      {projected.length > 0 && (
        <section className="mb-6">
          <h2>Projections — in-flight files in this forecast</h2>
          <table className="summary-table">
            <thead>
              <tr>
                <th>File</th>
                <th>Status</th>
                <th className="r">Funding amount</th>
                <th className="r">Projected net</th>
                <th className="r">Projected gross</th>
              </tr>
            </thead>
            <tbody>
              {projected.map((f) => {
                const status = getPipelineStatusInfo(f.status);
                return (
                  <tr key={f._id}>
                    <td>
                      <div style={{ fontWeight: 600 }}>{f.fileName}</div>
                      {f.propertyAddress && (
                        <div style={{ fontSize: 11, color: "#6b7280" }}>
                          {f.propertyAddress}
                        </div>
                      )}
                    </td>
                    <td>{status.label}</td>
                    <td className="r">{fmtMoney(f.fundingAmount)}</td>
                    <td className="r">{fmtMoney(f.netToUser ?? 0)}</td>
                    <td className="r">{fmtMoney(f.brokerGross ?? 0)}</td>
                  </tr>
                );
              })}
              <tr style={{ background: "#f3f4f6", fontWeight: 700 }}>
                <td colSpan={3}>
                  Subtotal ({projectionTotals.count}{" "}
                  {projectionTotals.count === 1 ? "file" : "files"})
                </td>
                <td className="r">{fmtMoney(projectionTotals.net)}</td>
                <td className="r">{fmtMoney(projectionTotals.gross)}</td>
              </tr>
            </tbody>
          </table>
        </section>
      )}

      {/* Body — choose format based on row count */}
      {rows === undefined ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No fundings match the current filters.
        </p>
      ) : filtered.length > 12 ? (
        <SummaryTable rows={filtered} totals={totals} />
      ) : (
        filtered.map((r) => <FundingBlock key={r.ledger._id} entry={r} />)
      )}

      <p className="footer-note">
        Generated {new Date(today).toLocaleString()}. Figures are user-entered
        and intended for internal review; verify against bank deposits before
        sharing externally.
      </p>
    </div>
  );
}

// ---------- per-funding block (used when rows are few enough to print
// expanded payment detail under each one) ----------

function FundingBlock({ entry }: { entry: LedgerEntry }) {
  const ledger = entry.ledger;
  const file = entry.file;
  const status = file ? getPipelineStatusInfo(file.status) : null;
  const m = modeOf(ledger);
  const netBalance = Math.max(0, ledger.net - entry.receivedNet);
  const grossBalance = Math.max(0, ledger.gross - entry.receivedGross);

  return (
    <div className="funding-block">
      <div className="funding-head">
        <div className="file-name">
          <div className="name">{file?.fileName ?? "(deleted file)"}</div>
          {file?.propertyAddress && (
            <div className="address">{file.propertyAddress}</div>
          )}
          {status && <div className="status">{status.label}</div>}
        </div>
        <div>
          <div className="label">Funded</div>
          <div className="value">{fmtDate(ledger.date)}</div>
        </div>
        <div>
          <div className="label">Mode</div>
          <div className="value">
            {MODE_LABEL[m]}
            {m === "scheduled" && ledger.scheduledDate && (
              <div className="text-[11px] font-normal text-muted-foreground">
                due {fmtDate(ledger.scheduledDate)}
              </div>
            )}
            {m === "monthly" && ledger.monthlyAmount && (
              <div className="text-[11px] font-normal text-muted-foreground">
                {fmtMoney(ledger.monthlyAmount)}
                {ledger.termMonths ? ` × ${ledger.termMonths} mo` : ""}
              </div>
            )}
          </div>
        </div>
        <div>
          <div className="label">Expected net</div>
          <div className="value">
            {fmtMoney(ledger.net)}
            <div className="text-[11px] font-normal text-muted-foreground">
              gross {fmtMoney(ledger.gross)}
            </div>
          </div>
        </div>
        <div>
          <div className="label">Received net / Balance</div>
          <div className="value">
            {fmtMoney(entry.receivedNet)}
            <div
              className="text-[11px] font-normal"
              style={{ color: netBalance > 0 ? "#b45309" : "#6b7280" }}
            >
              balance {fmtMoney(netBalance)}
              {grossBalance > 0 && (
                <span className="text-muted-foreground">
                  {" · gross "}
                  {fmtMoney(grossBalance)}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
      {entry.payments.length === 0 ? (
        <div className="empty funding-table">No payments recorded yet.</div>
      ) : (
        <table className="funding-table">
          <thead>
            <tr>
              <th>Date received</th>
              <th className="r">Gross</th>
              <th className="r">Net</th>
              <th>Method</th>
              <th>Paid by</th>
              <th>Notes</th>
            </tr>
          </thead>
          <tbody>
            {entry.payments.map((p) => (
              <tr key={p._id}>
                <td>{fmtDate(p.date)}</td>
                <td className="r">{fmtMoney(p.gross)}</td>
                <td className="r">{fmtMoney(p.net)}</td>
                <td>{p.method ?? ""}</td>
                <td>{p.paidBy ?? ""}</td>
                <td>{p.notes ?? ""}</td>
              </tr>
            ))}
            <tr style={{ background: "#fafafa", fontWeight: 600 }}>
              <td>Subtotal</td>
              <td className="r">{fmtMoney(entry.receivedGross)}</td>
              <td className="r">{fmtMoney(entry.receivedNet)}</td>
              <td colSpan={3} />
            </tr>
          </tbody>
        </table>
      )}
    </div>
  );
}

// ---------- compact summary table (used for large result sets to keep the
// PDF tight; the per-payment expansion would otherwise sprawl) ----------

function SummaryTable({
  rows,
  totals,
}: {
  rows: LedgerEntry[];
  totals: {
    expectedGross: number;
    expectedNet: number;
    receivedGross: number;
    receivedNet: number;
    balanceGross: number;
    balanceNet: number;
  };
}) {
  return (
    <table className="summary-table">
      <thead>
        <tr>
          <th>Funded</th>
          <th>File</th>
          <th>Mode</th>
          <th className="r">Expected (net)</th>
          <th className="r">Received (net)</th>
          <th className="r">Balance (net)</th>
          <th className="r">Pmts</th>
          <th>Method</th>
          <th>Paid by</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => {
          const m = modeOf(r.ledger);
          const netBalance = Math.max(0, r.ledger.net - r.receivedNet);
          return (
            <tr key={r.ledger._id}>
              <td>{fmtDate(r.ledger.date)}</td>
              <td>
                <div style={{ fontWeight: 600 }}>
                  {r.file?.fileName ?? "(deleted file)"}
                </div>
                {r.file?.propertyAddress && (
                  <div style={{ fontSize: 11, color: "#6b7280" }}>
                    {r.file.propertyAddress}
                  </div>
                )}
              </td>
              <td>{MODE_LABEL[m]}</td>
              <td className="r">
                {fmtMoney(r.ledger.net)}
                <div style={{ fontSize: 10, color: "#6b7280" }}>
                  gross {fmtMoney(r.ledger.gross)}
                </div>
              </td>
              <td className="r">
                {fmtMoney(r.receivedNet)}
                <div style={{ fontSize: 10, color: "#6b7280" }}>
                  gross {fmtMoney(r.receivedGross)}
                </div>
              </td>
              <td
                className="r"
                style={{ color: netBalance > 0 ? "#b45309" : "#6b7280" }}
              >
                {fmtMoney(netBalance)}
              </td>
              <td className="r">{r.paymentCount}</td>
              <td>{r.ledger.paymentMethod ?? ""}</td>
              <td>{r.ledger.paidBy ?? ""}</td>
            </tr>
          );
        })}
        <tr style={{ background: "#f3f4f6", fontWeight: 700 }}>
          <td colSpan={3}>Totals ({rows.length} fundings)</td>
          <td className="r">
            {fmtMoney(totals.expectedNet)}
            <div style={{ fontSize: 10, fontWeight: 400, color: "#6b7280" }}>
              gross {fmtMoney(totals.expectedGross)}
            </div>
          </td>
          <td className="r">
            {fmtMoney(totals.receivedNet)}
            <div style={{ fontSize: 10, fontWeight: 400, color: "#6b7280" }}>
              gross {fmtMoney(totals.receivedGross)}
            </div>
          </td>
          <td className="r">{fmtMoney(totals.balanceNet)}</td>
          <td colSpan={3} />
        </tr>
      </tbody>
    </table>
  );
}

export default function PrintLedgerPage() {
  return (
    <Suspense
      fallback={
        <div className="p-6 text-sm text-muted-foreground">Loading ledger…</div>
      }
    >
      <PrintLedgerContent />
    </Suspense>
  );
}
