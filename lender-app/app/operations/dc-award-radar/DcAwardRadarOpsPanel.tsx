"use client";

import { useState } from "react";
import { useAction, useMutation } from "convex/react";
import { Loader2 } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/Button";
import { Input, Label, Select, Textarea } from "@/components/ui/Input";
import {
  parseBoundedDcAwardRadarContactPayload,
  parseBoundedDcAwardRadarNationwidePayload,
} from "@/lib/dcAwardRadarPayload";
import { useActorUserKey } from "@/lib/useActorUserKey";

type ScrapeMode = "nationwide" | "contacts" | "both";

type OpsStatus =
  | { kind: "idle" }
  | { kind: "busy"; label: string }
  | { kind: "ok"; label: string; detail: string }
  | { kind: "error"; message: string };

const SCRAPE_MODE_LABEL: Record<ScrapeMode, string> = {
  nationwide: "Nationwide refresh",
  contacts: "Contacts only",
  both: "Nationwide + contacts",
};

function formatRequestedAt(ms: number): string {
  try {
    return new Date(ms).toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return new Date(ms).toISOString();
  }
}

/** Accessible indeterminate track — Hermes % complete is unknown client-side. */
function IndeterminateProgressBar({ label }: { label: string }) {
  return (
    <div className="mt-3 space-y-1.5" role="status" aria-live="polite">
      <p className="text-xs text-muted-foreground">Running {label}…</p>
      <div
        className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-valuetext="In progress"
        aria-busy="true"
      >
        <div className="h-full w-1/3 rounded-full bg-primary motion-safe:animate-pulse motion-reduce:opacity-80" />
      </div>
    </div>
  );
}

export function DcAwardRadarOpsPanel() {
  const memberUserKey = useActorUserKey();
  const upsertRows = useMutation(api.dcAwardSignals.operatorUpsertRows);
  const upsertContacts = useMutation(api.dcAwardSignals.operatorUpsertContacts);
  const requestHermesScrape = useAction(
    api.dcAwardRadarActions.requestHermesScrape,
  );
  const [operatorSecret, setOperatorSecret] = useState("");
  const [scrapeMode, setScrapeMode] = useState<ScrapeMode>("both");
  const [scrapeNotes, setScrapeNotes] = useState("");
  const [showManualImport, setShowManualImport] = useState(false);
  const [nationwidePayload, setNationwidePayload] = useState("");
  const [contactPayload, setContactPayload] = useState("");
  const [status, setStatus] = useState<OpsStatus>({ kind: "idle" });

  const secret = operatorSecret.trim();
  const busy = status.kind === "busy";
  const scrapeBusy = busy && status.label === "Scrape with Hermes";

  async function runHermesScrape() {
    setStatus({ kind: "busy", label: "Scrape with Hermes" });
    try {
      const result = await requestHermesScrape({
        memberUserKey: memberUserKey || undefined,
        mode: scrapeMode,
        notes: scrapeNotes.trim() || undefined,
      });
      if (result.skipped && result.reason === "missing_url") {
        setStatus({
          kind: "error",
          message:
            "BOSSMAN Hermes scrape webhook is not configured (GROKBOT_DC_RADAR_SCRAPE_WEBHOOK_URL on Convex → routine dc-award-radar-hermes-scrape). Use Manual CSV import below, or set the env var and retry.",
        });
        return;
      }
      if (!result.ok) {
        setStatus({
          kind: "error",
          message: `Hermes scrape trigger failed (${result.reason ?? "unknown"}). Paste-import remains available.`,
        });
        return;
      }
      setStatus({
        kind: "ok",
        label: "Scrape with Hermes",
        detail: `Scrape requested — Hermes running via BOSSMAN; import lands after Minion gets CSVs (${SCRAPE_MODE_LABEL[result.mode]}, ${formatRequestedAt(result.requestedAt)}). No Convex polling; no invented contacts; GHL out of scope.`,
      });
    } catch (error) {
      setStatus({
        kind: "error",
        message:
          error instanceof Error ? error.message : "Hermes scrape trigger failed.",
      });
    }
  }

  async function runNationwide() {
    setStatus({ kind: "busy", label: "Manual CSV import (nationwide)" });
    try {
      const parsed = parseBoundedDcAwardRadarNationwidePayload(nationwidePayload);
      const result = await upsertRows({
        operatorSecret: secret,
        rows: parsed.rows,
      });
      setStatus({
        kind: "ok",
        label: "Manual CSV import (nationwide)",
        detail: `${result.inserted} inserted, ${result.updated} updated (${parsed.format}, ${result.total} rows).`,
      });
    } catch (error) {
      setStatus({
        kind: "error",
        message:
          error instanceof Error ? error.message : "Nationwide import failed.",
      });
    }
  }

  async function runContacts() {
    setStatus({ kind: "busy", label: "Manual CSV import (contacts)" });
    try {
      const parsed = parseBoundedDcAwardRadarContactPayload(contactPayload);
      const result = await upsertContacts({
        operatorSecret: secret,
        rows: parsed.rows,
      });
      setStatus({
        kind: "ok",
        label: "Manual CSV import (contacts)",
        detail: `${result.updated} updated, ${result.skipped} skipped (no insert; ${parsed.format}, ${result.total} rows).`,
      });
    } catch (error) {
      setStatus({
        kind: "error",
        message:
          error instanceof Error ? error.message : "Contact refresh failed.",
      });
    }
  }

  return (
    <section
      className="rounded-xl border border-border bg-card p-4 shadow-sm"
      aria-labelledby="dc-award-radar-ops-heading"
    >
      <h2
        id="dc-award-radar-ops-heading"
        className="text-sm font-semibold tracking-tight"
      >
        Operator controls
      </h2>
      <p className="mt-2 text-xs text-muted-foreground">
        Primary path: <strong className="font-medium text-foreground">Scrape with Hermes</strong>{" "}
        POSTs once to BOSSMAN&apos;s GrokBot routine{" "}
        <code className="rounded bg-muted px-1 py-0.5">dc-award-radar-hermes-scrape</code>
        . Requires a signed-in session (same as the radar list) — not the migration
        operator secret. BOSSMAN runs Hermes public-web research, then pings Minion
        for CSV import. This app does not scrape, run cron, or poll inside Convex.
        Prefer owner/principal{" "}
        <strong className="font-medium text-foreground">cell / direct</strong>{" "}
        phone and <strong className="font-medium text-foreground">direct</strong> email —
        no invented contacts. GHL and outbound messaging are out of scope.
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        Fallback: Manual CSV import (below) or CLI{" "}
        <code className="rounded bg-muted px-1 py-0.5">
          npm run import:dc-award-radar -- path/to/file.csv
        </code>
        . Manual import still requires the operator secret (
        <code className="rounded bg-muted px-1 py-0.5">
          DATA_MIGRATION_ADMIN_SECRET
        </code>
        ).
      </p>

      <div
        className="mt-4 space-y-3 rounded-lg border border-border/80 bg-muted/30 p-3"
        aria-labelledby="dc-award-hermes-scrape-heading"
      >
        <div>
          <h3
            id="dc-award-hermes-scrape-heading"
            className="text-sm font-semibold tracking-tight"
          >
            Scrape with Hermes
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            One-shot POST to BOSSMAN routine{" "}
            <code className="rounded bg-muted px-1 py-0.5">
              dc-award-radar-hermes-scrape
            </code>
            . No Convex scrape or scheduler. After Hermes, BOSSMAN pings Minion
            for import — not automatic GHL sync. Progress below is indeterminate:
            true Hermes completion is async outside this app.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Label>
            Mode
            <Select
              value={scrapeMode}
              onChange={(event) =>
                setScrapeMode(event.target.value as ScrapeMode)
              }
              aria-label="Hermes scrape mode"
              disabled={busy}
            >
              <option value="both">Nationwide + contacts</option>
              <option value="nationwide">Nationwide refresh only</option>
              <option value="contacts">Contacts only</option>
            </Select>
          </Label>
          <Label>
            Notes (optional)
            <Input
              value={scrapeNotes}
              onChange={(event) => setScrapeNotes(event.target.value)}
              aria-label="Hermes scrape notes"
              placeholder="e.g. focus Phoenix AZ awards this week"
              maxLength={500}
              disabled={busy}
            />
          </Label>
        </div>
        <Button
          type="button"
          disabled={busy}
          onClick={() => void runHermesScrape()}
          aria-busy={scrapeBusy}
        >
          {scrapeBusy ? (
            <>
              <Loader2
                className="mr-2 h-4 w-4 shrink-0 animate-spin motion-reduce:animate-none"
                aria-hidden
              />
              Requesting scrape…
            </>
          ) : (
            "Scrape with Hermes"
          )}
        </Button>
      </div>

      <div className="mt-4 border-t border-border pt-4">
        <button
          type="button"
          className="text-xs font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
          aria-expanded={showManualImport}
          onClick={() => setShowManualImport((open) => !open)}
        >
          {showManualImport ? "Hide manual CSV import" : "Manual CSV import (advanced)"}
        </button>
        {showManualImport ? (
          <div className="mt-3 space-y-4">
            <Label className="max-w-md">
              Operator secret
              <span className="block text-xs font-normal text-muted-foreground">
                Required only for Manual CSV import (nationwide upsert / contacts
                upsert). Not used by Scrape with Hermes.
              </span>
              <Input
                type="password"
                autoComplete="off"
                value={operatorSecret}
                onChange={(event) => setOperatorSecret(event.target.value)}
                aria-label="Operator secret for manual CSV import"
                disabled={busy}
              />
            </Label>
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="space-y-2">
                <Label>
                  Import nationwide refresh
                  <span className="block text-xs font-normal text-muted-foreground">
                    JSON array or CSV. Upserts by sourceKey (url + project + stage).
                    Any US market. Max 100 rows per submit.
                  </span>
                  <Textarea
                    rows={8}
                    value={nationwidePayload}
                    onChange={(event) => setNationwidePayload(event.target.value)}
                    aria-label="Nationwide refresh payload"
                    placeholder="market,project_or_campus,stage_signal,..."
                    disabled={busy}
                  />
                </Label>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={busy || !secret || !nationwidePayload.trim()}
                  onClick={() => void runNationwide()}
                >
                  Import nationwide refresh
                </Button>
              </div>
              <div className="space-y-2">
                <Label>
                  Refresh contacts
                  <span className="block text-xs font-normal text-muted-foreground">
                    JSON/CSV with sourceKey (or source_url + project + stage) plus
                    owner/principal fields. Prefer cell/direct — not switchboard.
                    Updates existing rows only — never creates duplicate projects.
                  </span>
                  <Textarea
                    rows={8}
                    value={contactPayload}
                    onChange={(event) => setContactPayload(event.target.value)}
                    aria-label="Contact refresh payload"
                    placeholder="source_key,contact_name,contact_title,email,email_type,phone,phone_type,linkedin_url,contact_notes"
                    disabled={busy}
                  />
                </Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={busy || !secret || !contactPayload.trim()}
                  onClick={() => void runContacts()}
                >
                  Refresh contacts
                </Button>
              </div>
            </div>
          </div>
        ) : null}
      </div>

      {status.kind === "busy" ? (
        <IndeterminateProgressBar label={status.label} />
      ) : null}
      {status.kind === "ok" ? (
        <p className="mt-3 text-xs text-emerald-800 dark:text-emerald-200" role="status">
          {status.label}: {status.detail}
        </p>
      ) : null}
      {status.kind === "error" ? (
        <p className="mt-3 text-xs text-destructive" role="alert">
          {status.message}
        </p>
      ) : null}
    </section>
  );
}
