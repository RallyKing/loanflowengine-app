"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { buildSections } from "@/lib/intake/export";
import { pipelineFileHref } from "@/lib/intake/routes";
import { useUserPreferences } from "@/lib/userPreferencesContext";

export type PrintViewProps = { fileId: Id<"pipeline"> };

export function PrintView(props: PrintViewProps) {
  const { accountId } = useUserPreferences();
  const memberUserKey = accountId.trim() || undefined;
  const dealBundle = useQuery(api.pipeline.getDealForEditor, {
    fileId: props.fileId,
    ...(memberUserKey ? { memberUserKey } : {}),
  });

  const sheet =
    dealBundle === undefined || dealBundle === null
      ? undefined
      : dealBundle.sheet;
  const linkedPipelineId = props.fileId;

  useEffect(() => {
    const prev = document.title;
    if (sheet) {
      const who =
        sheet.borrowers?.[0]?.lastName ||
        sheet.borrowers?.[0]?.firstName ||
        sheet.leadId ||
        "intake";
      document.title = `Intake — ${who}`;
    }
    return () => {
      document.title = prev;
    };
  }, [sheet]);

  if (sheet === undefined) {
    return (
      <div className="p-10 text-sm text-muted-foreground" role="status">
        Loading…
      </div>
    );
  }
  if (sheet === null) {
    return (
      <div className="p-10 text-sm text-destructive" role="alert">
        Sheet not found.
      </div>
    );
  }

  const sections = buildSections(sheet);
  const borrower =
    [sheet.borrowers?.[0]?.firstName, sheet.borrowers?.[0]?.lastName]
      .filter(Boolean)
      .join(" ") || "—";
  const subject =
    sheet.scenario?.propertyAddress ||
    [
      sheet.subjectProperty?.address,
      sheet.subjectProperty?.city,
      sheet.subjectProperty?.state,
    ]
      .filter(Boolean)
      .join(", ") ||
    "—";

  return (
    <div className="print-root mx-auto w-full max-w-[8.5in] bg-white text-zinc-900">
      <div className="no-print sticky top-0 z-10 flex items-center justify-between border-b border-border/80 bg-background/95 px-6 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/90">
        <div className="flex flex-wrap items-center gap-3 sm:gap-4">
          {linkedPipelineId != null && (
            <Link
              href={pipelineFileHref(linkedPipelineId)}
              className="text-sm font-medium text-primary hover:text-primary/80"
            >
              ← Pipeline file
            </Link>
          )}
          <Link
            href={pipelineFileHref(props.fileId)}
            className="text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            ← Back to file
          </Link>
          <span className="text-xs text-muted-foreground">
            Use your browser&apos;s print dialog to save as PDF.
          </span>
        </div>
        <button
          type="button"
          onClick={() => window.print()}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
        >
          Print / Save as PDF
        </button>
      </div>

      <article className="px-10 py-8">
        <header className="mb-8 border-b border-zinc-900 pb-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
                Loan Intake
              </p>
              <h1 className="mt-1 text-2xl font-bold tracking-tight">
                {borrower}
              </h1>
              <p className="mt-1 text-sm text-zinc-600">{subject}</p>
            </div>
            <div className="text-right text-xs text-zinc-600">
              <p>
                <strong>Lead ID:</strong> {sheet.leadId || "—"}
              </p>
              <p>
                <strong>Deal type:</strong> {sheet.dealType || "—"}
              </p>
              <p>
                <strong>Funding type:</strong> {sheet.fundingType || "—"}
              </p>
              <p>
                <strong>Loan officer:</strong>{" "}
                {sheet.cover?.loanOfficer || "—"}
              </p>
              <p>
                <strong>Generated:</strong> {new Date().toLocaleString()}
              </p>
            </div>
          </div>
        </header>

        {sections.map((sec) => (
          <section key={sec.id} className="mb-6 break-inside-avoid">
            <h2 className="mb-2 border-b border-zinc-300 pb-1 text-sm font-bold uppercase tracking-wider text-zinc-900">
              {sec.name}
            </h2>
            <div className="flex flex-col gap-3">
              {sec.blocks.map((block, i) => (
                <div key={i} className="break-inside-avoid">
                  <h3 className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                    {block.title}
                  </h3>

                  {block.rows && block.rows.length > 0 ? (
                    <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-[11px] leading-snug">
                      {block.rows.map((row, idx) => (
                        <div
                          key={idx}
                          className="flex items-baseline justify-between gap-3 border-b border-dotted border-zinc-200 py-0.5"
                        >
                          <span className="text-zinc-600">{row.label}</span>
                          <span className="text-right font-medium text-zinc-900">
                            {row.value}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : null}

                  {block.table ? (
                    <table className="mt-1 w-full border-collapse text-[11px]">
                      <thead>
                        <tr>
                          {block.table.columns.map((col) => (
                            <th
                              key={col}
                              className="border-b border-zinc-400 bg-zinc-100 px-2 py-1 text-left font-semibold text-zinc-700"
                            >
                              {col}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {block.table.rows.map((row, idx) => (
                          <tr key={idx}>
                            {row.map((cell, ci) => (
                              <td
                                key={ci}
                                className="border-b border-zinc-200 px-2 py-1 align-top"
                              >
                                {cell == null ? "" : String(cell)}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : null}
                </div>
              ))}
            </div>
          </section>
        ))}

        <footer className="mt-10 border-t border-zinc-300 pt-3 text-[10px] text-zinc-500">
          <p>
            Confidential. Generated from Intake Sheet App on{" "}
            {new Date().toLocaleDateString()}.
          </p>
        </footer>
      </article>

      <style jsx global>{`
        @media print {
          @page {
            size: Letter;
            margin: 0.5in;
          }
          html,
          body {
            background: #fff !important;
          }
          .no-print {
            display: none !important;
          }
          .print-root {
            max-width: none !important;
          }
          article {
            padding: 0 !important;
          }
          section {
            page-break-inside: avoid;
          }
        }
      `}</style>
    </div>
  );
}
