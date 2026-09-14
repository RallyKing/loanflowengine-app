"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/Button";
import { Input, Label, Textarea } from "@/components/ui/Input";
import {
  parseBoundedDcAwardRadarContactPayload,
  parseBoundedDcAwardRadarNationwidePayload,
} from "@/lib/dcAwardRadarPayload";

type OpsStatus =
  | { kind: "idle" }
  | { kind: "busy"; label: string }
  | { kind: "ok"; label: string; detail: string }
  | { kind: "error"; message: string };

export function DcAwardRadarOpsPanel() {
  const upsertRows = useMutation(api.dcAwardSignals.operatorUpsertRows);
  const upsertContacts = useMutation(api.dcAwardSignals.operatorUpsertContacts);
  const [operatorSecret, setOperatorSecret] = useState("");
  const [nationwidePayload, setNationwidePayload] = useState("");
  const [contactPayload, setContactPayload] = useState("");
  const [status, setStatus] = useState<OpsStatus>({ kind: "idle" });

  const secret = operatorSecret.trim();
  const busy = status.kind === "busy";

  async function runNationwide() {
    setStatus({ kind: "busy", label: "Import nationwide refresh" });
    try {
      const parsed = parseBoundedDcAwardRadarNationwidePayload(nationwidePayload);
      const result = await upsertRows({
        operatorSecret: secret,
        rows: parsed.rows,
      });
      setStatus({
        kind: "ok",
        label: "Import nationwide refresh",
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
    setStatus({ kind: "busy", label: "Refresh contacts" });
    try {
      const parsed = parseBoundedDcAwardRadarContactPayload(contactPayload);
      const result = await upsertContacts({
        operatorSecret: secret,
        rows: parsed.rows,
      });
      setStatus({
        kind: "ok",
        label: "Refresh contacts",
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
        Nationwide research runs via Hermes → CSV → import. Markets are free-text
        (any US market), not limited to Ashburn, Dallas–Fort Worth, or Columbus.
        Contact enrichment is Hermes/ops-driven — this page does not scrape the
        web, run a cron, or send outbound messages. GHL is out of scope.
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        CLI:{" "}
        <code className="rounded bg-muted px-1 py-0.5">
          npm run import:dc-award-radar -- path/to/file.csv
        </code>
        {" "}or{" "}
        <code className="rounded bg-muted px-1 py-0.5">
          --contacts path/to/contacts.csv
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

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
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
              placeholder='market,project_or_campus,stage_signal,...'
            />
          </Label>
          <Button
            type="button"
            size="sm"
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
