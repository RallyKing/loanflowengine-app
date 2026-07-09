"use client";

import { useCallback, useRef, useState } from "react";
import Link from "next/link";
import { useMutation } from "convex/react";
import {
  Upload,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  Trash2,
  Download,
} from "lucide-react";
import { api } from "@/convex/_generated/api";
import { Button } from "./ui/Button";
import { downloadBlob } from "@/lib/export/downloadClient";
import { Badge } from "./ui/Badge";
import { parseLenderCsv, dedupeKey } from "@/lib/csv";
import { FIELD_META, LENDER_FIELDS, type Lender } from "@/lib/schema";
import { cn } from "@/lib/cn";
import { useLiveConnection } from "@/lib/useLiveConnection";
import { LiveDataPausedNotice } from "@/components/LiveDataPausedNotice";
import { SettingsLink } from "@/components/SettingsLink";
import { CollapsibleSection } from "@/components/CollapsibleSection";

const CHUNK_SIZE = 100;

type Status =
  | { kind: "idle" }
  | { kind: "parsed"; records: Lender[]; fileName: string; warnings: string[] }
  | { kind: "uploading"; total: number; done: number }
  | {
      kind: "done";
      inserted: number;
      updated: number;
      total: number;
      fileName: string;
    }
  | { kind: "error"; message: string };

export function CsvUploader() {
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const bulkUpsert = useMutation(api.lenders.bulkUpsert);
  const { canUseHub, browserOnline, actionTitle } = useLiveConnection();

  const handleFiles = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const file = files[0];
    try {
      const text = await file.text();
      const records = parseLenderCsv(text);
      const warnings: string[] = [];
      const seen = new Map<string, number>();
      for (const r of records) {
        const k = dedupeKey(r);
        seen.set(k, (seen.get(k) ?? 0) + 1);
      }
      const internalDupes = [...seen.values()].filter((n) => n > 1).length;
      if (internalDupes > 0) {
        warnings.push(
          `${internalDupes} duplicate pair(s) detected inside your CSV — the last occurrence of each will win on upload.`
        );
      }
      if (records.length === 0) {
        setStatus({
          kind: "error",
          message:
            "No valid rows found. Your CSV must have a header row matching the schema (e.g. 'Company', 'Contact Name', ...).",
        });
        return;
      }
      setStatus({ kind: "parsed", records, fileName: file.name, warnings });
    } catch (err) {
      setStatus({
        kind: "error",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }, []);

  async function upload() {
    if (status.kind !== "parsed") return;
    const records = status.records;
    const fileName = status.fileName;
    setStatus({ kind: "uploading", total: records.length, done: 0 });
    let inserted = 0;
    let updated = 0;
    try {
      for (let i = 0; i < records.length; i += CHUNK_SIZE) {
        const chunk = records.slice(i, i + CHUNK_SIZE);
        const result = await bulkUpsert({ records: chunk });
        inserted += result.inserted;
        updated += result.updated;
        setStatus({
          kind: "uploading",
          total: records.length,
          done: Math.min(i + CHUNK_SIZE, records.length),
        });
      }
      setStatus({
        kind: "done",
        inserted,
        updated,
        total: records.length,
        fileName,
      });
    } catch (err) {
      setStatus({
        kind: "error",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  function downloadTemplate() {
    const headers = [
      ...LENDER_FIELDS.map((f) => FIELD_META[f].csvHeader),
      "Programs Detail (JSON)",
      "Additional Contacts (JSON)",
      "Additional Phones (JSON)",
      "Rating (0-5)",
      "Rating Notes",
    ];
    // Per-field example values, aligned with LENDER_FIELDS order.
    const exampleByHeader: Record<string, string> = {
      Source: "Manual Entry",
      Section: "Manual Addition",
      Company: "EXAMPLE - delete this row",
      "Contact Name": "Jane Doe",
      "Title / Role": "VP of Lending",
      Phone: "555-123-4567",
      Email: "jane.doe@example.com",
      Website: "www.example.com",
      "Entity Type": "",
      "Primary Niche / Specialty": "Equipment Financing",
      "Programs / Funding Types": "SBA 7(a), Equipment Leasing",
      "Property Types": "Manufacturing equipment",
      Exclusions: "Start-ups",
      "States Served": "All 50 states",
      "Owner-Occupied or Investor": "Either",
      "Funding amount - Min": "$25,000",
      "Funding amount - Max": "$5,000,000",
      "Min FICO": "680",
      "LTV / Leverage": "Up to 100% financing",
      "Interest Rates": "Starting 8.5%",
      "Amortization / Term": "3-7 years",
      "Referral / YSP Fees": "1-2% referral",
      "Additional Notes": "Fast approvals; 650+ FICO preferred",
      Status: "",
      "Last Updated": "",
      "Programs Detail (JSON)":
        '[{"name":"SBA 7(a)","minFico":"680","requirements":"2yr tax returns; no bankruptcy"},{"name":"Equipment Lease","minFico":"640","requirements":"New or used equipment"}]',
      "Additional Contacts (JSON)":
        '[{"name":"John Smith","titleRole":"Intake","phone":"555-222-3333","email":"intake@example.com"}]',
      "Additional Phones (JSON)":
        '[{"label":"Main Office","phone":"(555) 111-2222"},{"label":"Toll-Free","phone":"1-800-555-9999"}]',
      "Rating (0-5)": "0",
      "Rating Notes":
        "Easy to work with; fast closes; flexible on FICO when other compensating factors exist",
    };
    const exampleRow = headers
      .map((h) => `"${(exampleByHeader[h] ?? "").replace(/"/g, '""')}"`)
      .join(",");
    const headerLine = headers.map((h) => `"${h}"`).join(",");
    const csv = "\uFEFF" + headerLine + "\n" + exampleRow + "\n";
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    downloadBlob(blob, "lender-upload-template.csv");
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <LiveDataPausedNotice
          scope="upload"
          canUseHub={canUseHub}
          browserOnline={browserOnline}
          className="min-w-0 flex-1"
        />
        <SettingsLink
          section="data"
          className="shrink-0 self-start text-xs font-medium text-muted-foreground hover:text-foreground"
        >
          Data preferences
        </SettingsLink>
      </div>
      <div className="flex items-center justify-between">
        <Button variant="outline" onClick={downloadTemplate}>
          <Download className="h-4 w-4" /> Download CSV template
        </Button>
      </div>

      {status.kind === "idle" && (
        <DropZone
          dragActive={dragActive}
          onDragOver={(e) => {
            e.preventDefault();
            setDragActive(true);
          }}
          onDragLeave={() => setDragActive(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragActive(false);
            handleFiles(e.dataTransfer.files);
          }}
          onClick={() => fileInputRef.current?.click()}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => handleFiles(e.target.files)}
          />
          <Upload className="h-10 w-10 text-muted-foreground" />
          <div className="mt-3 text-lg font-medium">
            Drop your CSV file here
          </div>
          <div className="text-sm text-muted-foreground">
            or click to browse · must include a header row
          </div>
        </DropZone>
      )}

      {status.kind === "parsed" && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-muted/40 p-4">
            <FileSpreadsheet className="h-6 w-6 text-accent-foreground" />
            <div className="flex-1">
              <div className="font-medium">{status.fileName}</div>
              <div className="text-xs text-muted-foreground">
                Parsed <strong>{status.records.length}</strong> records
              </div>
            </div>
            <Button variant="outline" onClick={() => setStatus({ kind: "idle" })}>
              <Trash2 className="h-4 w-4" /> Discard
            </Button>
            <Button
              onClick={upload}
              disabled={!canUseHub}
              title={actionTitle(
                `Send ${status.records.length} row(s) to the database in batches`
              )}
            >
              Upload {status.records.length} records
            </Button>
          </div>
          {status.warnings.length > 0 && (
            <div className="flex gap-3 rounded-lg border border-amber-500/40 bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
              <AlertTriangle className="h-4 w-4" />
              <ul className="space-y-1">
                {status.warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </div>
          )}

          <CollapsibleSection
            defaultOpen
            className="shadow-sm"
            title={
              <span className="text-sm font-medium normal-case">
                Preview (first 10 rows)
              </span>
            }
            description="Sanity-check parsed values before upload."
            contentClassName="!px-0 !py-0"
          >
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left">Company</th>
                    <th className="px-3 py-2 text-left">Contact</th>
                    <th className="px-3 py-2 text-left">Email</th>
                    <th className="px-3 py-2 text-left">Entity Type</th>
                    <th className="px-3 py-2 text-left">Primary Niche</th>
                  </tr>
                </thead>
                <tbody>
                  {status.records.slice(0, 10).map((r, i) => (
                    <tr key={i} className="border-t">
                      <td className="px-3 py-2 font-medium">{r.company}</td>
                      <td className="px-3 py-2">{r.contactName}</td>
                      <td className="px-3 py-2">{r.email}</td>
                      <td className="px-3 py-2">
                        <Badge variant="accent">
                          {r.entityType || "(auto)"}
                        </Badge>
                      </td>
                      <td className="px-3 py-2">{r.primaryNiche}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {status.records.length > 10 && (
                <div className="border-t px-3 py-2 text-xs text-muted-foreground">
                  …and {status.records.length - 10} more
                </div>
              )}
            </div>
          </CollapsibleSection>
        </div>
      )}

      {status.kind === "uploading" && (
        <div className="space-y-3 rounded-lg border p-6">
          <div className="text-sm">
            Uploading…{" "}
            <strong>
              {status.done}/{status.total}
            </strong>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full bg-primary transition-all"
              style={{ width: `${(status.done / status.total) * 100}%` }}
            />
          </div>
        </div>
      )}

      {status.kind === "done" && (
        <div className="space-y-3 rounded-lg border border-green-500/40 bg-green-50 p-6 text-green-900 dark:bg-green-950/30 dark:text-green-200">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5" />
            <div className="font-medium">Upload complete</div>
          </div>
          <div className="text-sm">
            <div>
              File: <strong>{status.fileName}</strong>
            </div>
            <div>
              Inserted: <strong>{status.inserted}</strong> new lenders
            </div>
            <div>
              Updated: <strong>{status.updated}</strong> existing lenders
              (matched by company + email/name)
            </div>
            <div>
              Total processed: <strong>{status.total}</strong>
            </div>
          </div>
          <div className="flex gap-2 pt-2">
            <Button onClick={() => setStatus({ kind: "idle" })}>
              Upload another file
            </Button>
            <Link href="/lenders">
              <Button variant="outline">Back to browse</Button>
            </Link>
          </div>
        </div>
      )}

      {status.kind === "error" && (
        <div
          className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/[0.08] p-4 text-sm text-destructive"
          role="alert"
        >
          <AlertTriangle className="h-4 w-4 mt-0.5" />
          <div className="flex-1">
            <div className="font-medium">Upload failed</div>
            <div className="mt-1">{status.message}</div>
            <Button
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={() => setStatus({ kind: "idle" })}
            >
              Try again
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function DropZone({
  dragActive,
  children,
  ...handlers
}: {
  dragActive: boolean;
  children: React.ReactNode;
} & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      {...handlers}
      className={cn(
        "grid cursor-pointer place-items-center rounded-xl border-2 border-dashed p-12 text-center transition-colors",
        "border-border bg-muted/20 hover:border-accent-foreground hover:bg-accent/40",
        dragActive && "dropzone-active"
      )}
    >
      <div className="flex flex-col items-center">{children}</div>
    </div>
  );
}
