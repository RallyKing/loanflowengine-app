"use client";

import { useState } from "react";
import { useAction, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/Button";
import { Input, Label, Select, Textarea } from "@/components/ui/Input";
import {
  parseBoundedDcAwardRadarContactPayload,
  parseBoundedDcAwardRadarNationwidePayload,
} from "@/lib/dcAwardRadarPayload";

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

export function DcAwardRadarOpsPanel() {
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

  async function runHermesScrape() {
    setStatus({ kind: "busy", label: "Scrape with Hermes" });
    try {
      const result = await requestHermesScrape({
        operatorSecret: secret,
        mode: scrapeMode,
        notes: scrapeNotes.trim() || undefined,
      });
      if (result.skipped && result.reason === "missing_url") {
        setStatus({
          kind: "error",
          message:
            "Hermes scrape webhook is not configured (GROKBOT_DC_RADAR_SCRAPE_WEBHOOK_URL on Convex). Use Manual CSV import below, or set the env var and retry.",
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
        detail: `Webhook accepted for ${SCRAPE_MODE_LABEL[result.mode]}. Hermes researches public sources; Minion/ops import CSV when ready. No invented contacts; GHL out of scope.`,
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
        wakes Cursor Cloud Minion / Hermes via GrokBot webhook. Hermes researches
        public web sources; Minion (or ops) imports the resulting CSV. This app
        does not scrape the web, run cron, or poll inside Convex. Prefer
        owner/principal <strong className="font-medium text-foreground">cell / direct</strong>{" "}
        phone and <strong className="font-medium text-foreground">direct</strong> email —
        no invented contacts. GHL and outbound messaging are out of scope.
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        Fallback: Manual CSV import (below) or CLI{" "}
        <code className="rounded bg-muted px-1 py-0.5">
          npm run import:dc-award-radar -- path/to/file.csv
        </code>
        . Operator secret matches{" "}
        <code className="rounded bg-muted px-1 py-0.5">
          DATA_MIGRATION_ADMIN_SECRET
        </code>
        .
      </p>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Label>
          Operator secret
          <Input
            type="password"
            autoComplete="off"
            value={operatorSecret}
            onChange={(event) => setOperatorSecret(event.target.value)}
            aria-label="Operator secret"
          />
        </Label>
      </div>

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
            One-shot webhook to GrokBot. No Convex scrape or scheduler. Results
            land via Minion/ops import — not automatic GHL sync.
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
            />
          </Label>
        </div>
        <Button
          type="button"
          disabled={busy || !secret}
          onClick={() => void runHermesScrape()}
        >
          Scrape with Hermes
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
          <div className="mt-3 grid gap-4 lg:grid-cols-2">
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
        ) : null}
      </div>

      {status.kind === "busy" ? (
        <p className="mt-3 text-xs text-muted-foreground" role="status">
          Running {status.label}…
        </p>
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
