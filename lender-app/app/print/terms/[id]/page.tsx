"use client";

import { useEffect, useMemo } from "react";
import { useParams } from "next/navigation";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useUserPreferences } from "@/lib/userPreferencesContext";
import { Printer, X } from "lucide-react";
import { getPipelineStatusInfo } from "@/lib/pipelineStatus";

function fmtCurrency(n: number) {
  return `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}
function fmtRate(n: number) {
  return `${n.toLocaleString(undefined, { maximumFractionDigits: 3 })}%`;
}
function fmtDateLong(ms: number) {
  return new Date(ms).toLocaleDateString(undefined, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export default function PrintTermsPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id as Id<"pipeline"> | undefined;
  const { accountId } = useUserPreferences();
  const memberUserKey = accountId.trim() || undefined;
  const detail = useQuery(
    api.pipeline.getDetail,
    id
      ? { id, ...(memberUserKey ? { memberUserKey } : {}) }
      : "skip"
  );

  // Auto-set the document title to the file name so "Save as PDF" picks a
  // sensible filename.
  useEffect(() => {
    if (detail?.pipeline?.fileName) {
      const old = document.title;
      document.title = `Term Sheet — ${detail.pipeline.fileName}`;
      return () => {
        document.title = old;
      };
    }
  }, [detail?.pipeline?.fileName]);

  const lenderNames = useMemo(() => {
    const rows = detail?.lenders ?? [];
    return rows.map((l) => l.company || "Lender").filter(Boolean);
  }, [detail?.lenders]);

  if (id === undefined) {
    return (
      <div className="mx-auto max-w-2xl p-8 text-center text-sm text-muted-foreground">
        Missing file id.
      </div>
    );
  }
  if (detail === undefined) {
    return (
      <div className="mx-auto max-w-2xl p-8 text-center text-sm text-muted-foreground">
        Loading…
      </div>
    );
  }
  if (detail === null) {
    return (
      <div className="mx-auto max-w-2xl p-8 text-center text-sm text-destructive">
        Pipeline file not found.
      </div>
    );
  }

  const p = detail.pipeline;
  const options = p.termOptions ?? [];
  const status = getPipelineStatusInfo(p.status);
  const today = Date.now();

  return (
    <div className="print-page bg-white text-black">
      {/* Inline print stylesheet — keeps everything in one route file. */}
      <style>{`
        @page { size: letter; margin: 0.6in; }
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; }
          .print-page { padding: 0 !important; }
        }
        .print-page {
          font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI",
            Roboto, Helvetica, Arial, "Apple Color Emoji", "Segoe UI Emoji";
          color: #111827;
          max-width: 7.4in;
          margin: 0 auto;
          padding: 28px 32px 56px;
        }
        .print-page h1 { font-size: 22px; font-weight: 700; margin: 0; }
        .print-page h2 { font-size: 13px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: #4b5563; margin: 0 0 6px; }
        .meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 18px; font-size: 12.5px; }
        .meta-grid div span { color: #6b7280; }
        .option {
          break-inside: avoid;
          border: 1px solid #d1d5db;
          border-radius: 8px;
          padding: 14px 16px;
          margin-bottom: 12px;
        }
        .option-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 18px; font-size: 13px; }
        .option-grid .full { grid-column: 1 / -1; }
        .option-grid .label {
          font-size: 10.5px;
          letter-spacing: .04em;
          text-transform: uppercase;
          color: #6b7280;
        }
        .option-grid .value { font-weight: 600; }
        .lenders { font-size: 12.5px; color: #374151; }
        .footer-note { color: #6b7280; font-size: 11px; margin-top: 24px; padding-top: 12px; border-top: 1px solid #e5e7eb; }
      `}</style>

      <div className="no-print sticky top-0 z-10 mb-6 -mx-8 flex items-center justify-between border-b border-border bg-background/95 px-8 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/90">
        <div className="text-sm text-muted-foreground">
          Printable term sheet · use your browser&apos;s Print menu (or
          Ctrl/⌘ + P) to save as PDF
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
            Term sheet
          </div>
          <h1 className="mt-1">{p.fileName || "Untitled file"}</h1>
          {p.propertyAddress && (
            <div className="mt-1 text-sm text-muted-foreground">
              {p.propertyAddress}
            </div>
          )}
          {lenderNames.length > 0 && (
            <div className="mt-1 text-sm text-muted-foreground">
              {lenderNames.join(" · ")}
            </div>
          )}
        </div>
        <div className="text-right text-xs text-muted-foreground">
          <div>{fmtDateLong(today)}</div>
          <div className="mt-1 inline-flex items-center rounded-full border border-border/80 px-2 py-0.5 text-[11px] font-medium text-foreground">
            {status.label}
          </div>
        </div>
      </header>

      {/* Meta */}
      <section className="mb-6">
        <h2>Loan summary</h2>
        <div className="meta-grid">
          <div>
            <span>Funding amount: </span>
            {fmtCurrency(p.fundingAmount ?? 0)}
          </div>
          <div>
            <span>Indicative rate: </span>
            {fmtRate(p.rate)}
          </div>
          <div>
            <span>Term: </span>
            {p.term || "—"}
          </div>
          <div>
            <span>Status: </span>
            {status.label}
          </div>
          {p.scenario && (
            <div className="full">
              <span>Scenario: </span>
              {p.scenario}
            </div>
          )}
        </div>
      </section>

      {/* Options */}
      <section className="mb-2">
        <h2>Options</h2>
        {options.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No term options have been added to this file yet.
          </p>
        ) : (
          options.map((o, i) => (
            <div className="option" key={i}>
              <div className="mb-2 flex items-baseline justify-between">
                <div className="text-base font-semibold">Option {i + 1}</div>
                <div className="text-xs text-muted-foreground">
                  {o.rate ? `${o.rate}% · ` : ""}
                  {o.term || ""}
                </div>
              </div>
              <div className="option-grid">
                <div>
                  <div className="label">Rate</div>
                  <div className="value">{o.rate || "—"}</div>
                </div>
                <div>
                  <div className="label">Term</div>
                  <div className="value">{o.term || "—"}</div>
                </div>
                <div className="full">
                  <div className="label">Prepayment penalty</div>
                  <div className="value">{o.prepaymentPenalty || "—"}</div>
                </div>
                {o.notes && (
                  <div className="full">
                    <div className="label">Notes</div>
                    <div className="value font-normal">{o.notes}</div>
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </section>

      <p className="footer-note">
        Indicative pricing only — subject to underwriting, appraisal, and final
        lender approval. Generated {new Date(today).toLocaleString()}.
      </p>
    </div>
  );
}
