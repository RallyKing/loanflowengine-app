"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";

/**
 * Read-only Convex validation for lender ↔ migrated contact links.
 * Shown from Settings so operators can confirm data health before relying on the hub.
 */
export function LenderContactMigrationValidationCard() {
  const report = useQuery(api.lenderContactValidation.validateLenderContactMigration, {});

  if (report === undefined) {
    return (
      <div className="rounded-lg border border-border/80 bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
        Checking lender contact migration…
      </div>
    );
  }

  return (
    <div
      className={
        report.ok
          ? "rounded-lg border border-emerald-700/30 bg-emerald-950/10 px-4 py-3 dark:bg-emerald-950/25"
          : "rounded-lg border border-destructive/50 bg-destructive/5 px-4 py-3"
      }
    >
      <p className="text-sm font-semibold text-foreground">
        Lender ↔ Contacts migration check
        {report.ok ? (
          <span className="ml-2 font-normal text-emerald-800 dark:text-emerald-300">
            — passed
          </span>
        ) : (
          <span className="ml-2 font-normal text-destructive">— issues found (do not proceed)</span>
        )}
      </p>
      <ul className="mt-2 list-inside list-disc space-y-0.5 text-xs text-muted-foreground">
        <li>
          Extractable rows (all lenders): {report.summary.totalExpectedExtractedRows} · Links:{" "}
          {report.summary.totalContactLenderLinks} · Migration markers found:{" "}
          {report.summary.totalMigrationMarkersFound}
        </li>
        <li>
          Lenders with migration markers: {report.summary.lendersWithAnyMigrationMarker} · Not
          migrated (no links): {report.summary.lendersExpectedButNotMigrated} · Incomplete:{" "}
          {report.summary.lendersPartialMigration} · Duplicate marker across links:{" "}
          {report.summary.lendersDuplicateMarkerAcrossLinks}
        </li>
        <li>
          Orphan links: {report.summary.orphanLinks} · Wrong lender in marker:{" "}
          {report.summary.wrongLenderInMarker} · Snapshot drift warnings:{" "}
          {report.summary.snapshotMismatchWarnings}
        </li>
      </ul>
      {!report.ok && report.blockingIssues.length > 0 ? (
        <div className="mt-3">
          <p className="text-xs font-medium text-destructive">Blocking</p>
          <ul className="mt-1 max-h-40 list-inside list-disc space-y-1 overflow-y-auto text-xs text-destructive/95">
            {report.blockingIssues.slice(0, 24).map((t, i) => (
              <li key={i}>{t}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {report.warnings.length > 0 ? (
        <div className="mt-3">
          <p className="text-xs font-medium text-amber-900 dark:text-amber-200">Warnings</p>
          <ul className="mt-1 max-h-32 list-inside list-disc space-y-1 overflow-y-auto text-xs text-muted-foreground">
            {report.warnings.slice(0, 16).map((t, i) => (
              <li key={i}>{t}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {report.lenderIssueSamples.length > 0 ? (
        <div className="mt-3 space-y-2 text-xs text-muted-foreground">
          <p className="font-medium text-foreground">Sample lenders</p>
          {report.lenderIssueSamples.map((s) => (
            <div key={s.lenderId} className="rounded border border-border/60 bg-background/50 p-2">
              <p className="font-medium text-foreground">{s.company}</p>
              <ul className="mt-1 list-inside list-disc">
                {s.problems.map((p, i) => (
                  <li key={i}>{p}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      ) : null}
      <div className="mt-3 space-y-1 border-t border-border/60 pt-3 text-xs text-muted-foreground">
        <p className="font-medium text-foreground">UI data model</p>
        {report.uiNotes.map((t, i) => (
          <p key={i}>{t}</p>
        ))}
      </div>
    </div>
  );
}
