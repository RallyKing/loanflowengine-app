"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import type { PipelineListRow } from "@/lib/pipelineListRow";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Input";
import { SearchField } from "@/components/ui/SearchField";
import {
  InlineText,
  InlineNumber,
  InlineDate,
  InlineSelect,
  type InlineSelectOption,
} from "@/components/inline";
import { useLiveConnection } from "@/lib/useLiveConnection";
import { useUserPreferences } from "@/lib/userPreferencesContext";
import { useOrgPermissions } from "@/lib/useOrgPermissions";
import { useUserSettings } from "@/lib/userSettingsContext";
import { dataTableClassNames } from "@/lib/dataTableClasses";
import { OP_WORKSPACE_ISLAND } from "@/lib/ui/operationalInputs";
import { OP_MICRO_CONTROL_CLASS } from "@/lib/ui/operationalInputs";
import { OperationalBatchBar } from "@/components/ui/OperationalBatchBar";
import { OperationalSkeletonRow } from "@/components/ui/OperationalSkeleton";
import { showOperationalToast } from "@/lib/ui/operationalToast";
import { cn } from "@/lib/cn";
import {
  ChevronDown,
  ChevronRight,
  Copy,
  Download,
  FileJson,
  Plus,
  Printer,
  Trash2,
  Wallet,
  X,
  ExternalLink,
  AlertTriangle,
  Check,
  TrendingUp,
  Sparkles,
  ListChecks,
} from "lucide-react";
import {
  buildLedgerCsv,
  buildLedgerJson,
  buildLedgerTsv,
  ledgerClipboardTsv,
  type LedgerExportRow,
} from "@/lib/export/ledgerExport";
import { downloadTextFile } from "@/lib/export/downloadClient";
import { buildExportFilename } from "@/lib/export/exportFilename";
import { useRouter } from "next/navigation";
import {
  getPipelineStatusInfo,
  isPaidStatus,
} from "@/lib/pipelineStatus";
import { pipelineDealEditorHref } from "@/lib/pipeline/routes";
import { ResourceAccessProvider } from "@/components/ResourceAccessProvider";
import {
  DEFAULT_RESOURCE_ACCESS_UX,
  VIEW_ONLY_ACCESS_TOOLTIP,
  type ResourceAccessUxValue,
} from "@/lib/resourceAccessUx";

// ---------- Types ----------

type LedgerEntry = LedgerExportRow;

type PaymentMode = "lump_sum" | "scheduled" | "monthly";

// ---------- Format helpers ----------

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

function modeOf(l: Doc<"ledger">): PaymentMode {
  return l.paymentMode ?? "lump_sum";
}

const MODE_LABEL: Record<PaymentMode, string> = {
  lump_sum: "Lump sum",
  scheduled: "Scheduled",
  monthly: "Monthly",
};

const MODE_BADGE_CLASS: Record<PaymentMode, string> = {
  lump_sum:
    "border-primary/40 bg-primary/15 text-primary",
  scheduled:
    "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200",
  monthly:
    "border-sky-300 bg-sky-50 text-sky-700 dark:border-sky-900/60 dark:bg-sky-950/40 dark:text-sky-200",
};

const MODE_OPTIONS: InlineSelectOption[] = (["lump_sum", "scheduled", "monthly"] as const).map(
  (m) => ({
    value: m,
    label: MODE_LABEL[m],
    badgeClassName: MODE_BADGE_CLASS[m],
  })
);

// ---------- Method options ----------

const PAYMENT_METHOD_PRESETS = [
  "Wire",
  "ACH",
  "Check",
  "Zelle",
  "Cash",
  "Other",
] as const;

const METHOD_OPTIONS: InlineSelectOption[] = [
  { value: "", label: "Set method…" },
  ...PAYMENT_METHOD_PRESETS.map((m) => ({ value: m, label: m })),
];

type LedgerMemberScope = { memberUserKey?: string };

function ledgerMemberScope(accountId: string | undefined): LedgerMemberScope {
  const key = accountId?.trim();
  return key ? { memberUserKey: key } : {};
}

function ledgerRowAccessUx(canEditFile: boolean): ResourceAccessUxValue {
  if (canEditFile) return DEFAULT_RESOURCE_ACCESS_UX;
  return {
    readOnly: true,
    bannerMode: "view",
    ownerDisplayUsername: "",
    viewOnlyTooltip: VIEW_ONLY_ACCESS_TOOLTIP,
  };
}

const VIEW_ONLY_FIELD_PLACEHOLDER = "View only";

// ---------- Page ----------

export default function LedgerPage() {
  const router = useRouter();
  const { activeOrganizationId } = useOrgPermissions();
  const { accountId } = useUserPreferences();
  const preferencesAccountId = accountId.trim() || undefined;
  const memberScope = useMemo(
    () => ledgerMemberScope(preferencesAccountId),
    [preferencesAccountId]
  );
  const orgListArgs =
    activeOrganizationId && preferencesAccountId
      ? {
          organizationId: activeOrganizationId,
          memberUserKey: preferencesAccountId,
        }
      : null;
  const rows = useQuery(
    api.ledger.list,
    orgListArgs ?? "skip",
  );
  const allFiles = useQuery(
    api.pipeline.listLight,
    orgListArgs ?? "skip",
  ) as PipelineListRow[] | undefined;
  const setPayment = useMutation(api.ledger.setPayment);
  const removeLedger = useMutation(api.ledger.remove);
  const createFor = useMutation(api.ledger.createFor);
  const setProjected = useMutation(api.pipeline.setProjected);
  const { canUseHub } = useLiveConnection();
  const { settings } = useUserSettings();

  const [search, setSearch] = useState("");
  const [year, setYear] = useState<"all" | string>("all");
  const [method, setMethod] = useState<string>("all");
  const [payee, setPayee] = useState<string>("all");
  const [mode, setMode] = useState<"all" | PaymentMode>("all");
  const openPipelineFile = (id: Id<"pipeline">) => {
    router.push(pipelineDealEditorHref(id));
  };
  const [deletingId, setDeletingId] = useState<Id<"ledger"> | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<Id<"ledger"> | null>(
    null
  );
  const [expanded, setExpanded] = useState<Set<Id<"ledger">>>(new Set());
  const [copyState, setCopyState] = useState<"idle" | "ok" | "err">("idle");
  /** Pinned pipeline files excluded from the Projections totals + main list. */
  const [excludedFromProjectionForecast, setExcludedFromProjectionForecast] =
    useState<Set<Id<"pipeline">>>(new Set());
  const [selectedLedgerIds, setSelectedLedgerIds] = useState<
    Set<Id<"ledger">>
  >(new Set());
  const selectAllCheckboxRef = useRef<HTMLInputElement>(null);

  const loading = rows === undefined;
  // Stable reference for `useMemo` deps — `rows ?? []` would build a fresh
  // array literal on every render and invalidate every downstream memo.
  const allRows: LedgerEntry[] = useMemo(() => rows ?? [], [rows]);

  // The ledger only ever shows files in Paid/Paying status. In-flight
  // deals (anything not paid) belong to the projections card below or
  // the Pipeline tab, not the booked-revenue ledger. Rows whose `file`
  // was deleted are preserved so historical revenue is never lost.
  const data: LedgerEntry[] = useMemo(
    () => allRows.filter((r) => r.file === null || isPaidStatus(r.file.status)),
    [allRows]
  );

  // Derived option lists for filters
  const years = useMemo(() => {
    const ys = new Set<string>();
    for (const r of data) ys.add(String(new Date(r.ledger.date).getFullYear()));
    return Array.from(ys).sort((a, b) => Number(b) - Number(a));
  }, [data]);
  const methods = useMemo(() => {
    const ms = new Set<string>();
    for (const r of data) {
      if (r.ledger.paymentMethod) ms.add(r.ledger.paymentMethod);
    }
    return Array.from(ms).sort();
  }, [data]);
  const payees = useMemo(() => {
    const ps = new Set<string>();
    for (const r of data) {
      if (r.ledger.paidBy) ps.add(r.ledger.paidBy);
    }
    return Array.from(ps).sort();
  }, [data]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return data.filter((r) => {
      if (year !== "all") {
        if (String(new Date(r.ledger.date).getFullYear()) !== year) {
          return false;
        }
      }
      if (mode !== "all" && modeOf(r.ledger) !== mode) return false;
      if (method !== "all") {
        if ((r.ledger.paymentMethod ?? "") !== method) return false;
      }
      if (payee !== "all") {
        if ((r.ledger.paidBy ?? "") !== payee) return false;
      }
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
  }, [data, search, year, method, payee, mode]);

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

  // "Funded" or "Paid" pipeline files that don't yet have a ledger row
  // (escape hatch for both the auto-insert miss and the new monthly mode).
  const missingPaid = useMemo(() => {
    if (!allFiles) return [];
    const seen = new Set(allRows.map((r) => r.ledger.fileId));
    return allFiles
      .filter((p) => isPaidStatus(p.status) && !seen.has(p._id))
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }, [allFiles, allRows]);

  // Files the user has opted into the forecast (`projectIntoLedger`).
  // Always sorted by most-recently-touched first so the freshest signal
  // is at the top.
  const projectedFiles = useMemo(() => {
    if (!allFiles) return [];
    return allFiles
      .filter((p) => p.projectIntoLedger && !isPaidStatus(p.status))
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }, [allFiles]);

  // In-flight files the user hasn't projected yet — surfaced in the
  // "Add to projection" picker.
  const projectionCandidates = useMemo(() => {
    if (!allFiles) return [];
    return allFiles
      .filter((p) => !p.projectIntoLedger && !isPaidStatus(p.status))
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }, [allFiles]);

  useEffect(() => {
    const pinIds = new Set(projectedFiles.map((p) => p._id));
    setExcludedFromProjectionForecast((prev) => {
      const next = new Set<Id<"pipeline">>();
      for (const id of prev) {
        if (pinIds.has(id)) next.add(id);
      }
      return next;
    });
  }, [projectedFiles]);

  const includedProjectionFiles = useMemo(
    () =>
      projectedFiles.filter(
        (p) => !excludedFromProjectionForecast.has(p._id)
      ),
    [projectedFiles, excludedFromProjectionForecast]
  );

  const excludedProjectionFiles = useMemo(
    () =>
      projectedFiles.filter((p) =>
        excludedFromProjectionForecast.has(p._id)
      ),
    [projectedFiles, excludedFromProjectionForecast]
  );

  const projectionTotals = useMemo(() => {
    let net = 0;
    let gross = 0;
    for (const f of includedProjectionFiles) {
      net += f.netToUser ?? 0;
      gross += f.brokerGross ?? 0;
    }
    return { net, gross, count: includedProjectionFiles.length };
  }, [includedProjectionFiles]);

  useEffect(() => {
    const visible = new Set(filtered.map((r) => r.ledger._id));
    setSelectedLedgerIds((prev) => {
      const next = new Set<Id<"ledger">>();
      for (const id of prev) {
        if (visible.has(id)) next.add(id);
      }
      return next;
    });
  }, [filtered]);

  const selectionTotals = useMemo(() => {
    let count = 0;
    let expectedGross = 0;
    let expectedNet = 0;
    let receivedGross = 0;
    let receivedNet = 0;
    for (const r of filtered) {
      if (!selectedLedgerIds.has(r.ledger._id)) continue;
      count += 1;
      expectedGross += r.ledger.gross || 0;
      expectedNet += r.ledger.net || 0;
      receivedGross += r.receivedGross || 0;
      receivedNet += r.receivedNet || 0;
    }
    return {
      count,
      expectedGross,
      expectedNet,
      receivedGross,
      receivedNet,
      balanceGross: Math.max(0, expectedGross - receivedGross),
      balanceNet: Math.max(0, expectedNet - receivedNet),
    };
  }, [filtered, selectedLedgerIds]);

  const selectedLedgerRows = useMemo(
    () => filtered.filter((r) => selectedLedgerIds.has(r.ledger._id)),
    [filtered, selectedLedgerIds],
  );

  const allFilteredLedgerSelected =
    filtered.length > 0 &&
    filtered.every((r) => selectedLedgerIds.has(r.ledger._id));
  const someFilteredLedgerSelected = filtered.some((r) =>
    selectedLedgerIds.has(r.ledger._id)
  );

  useEffect(() => {
    const el = selectAllCheckboxRef.current;
    if (!el) return;
    el.indeterminate =
      someFilteredLedgerSelected && !allFilteredLedgerSelected;
  }, [someFilteredLedgerSelected, allFilteredLedgerSelected]);

  const toggleLedgerSelect = (ledgerId: Id<"ledger">) => {
    setSelectedLedgerIds((prev) => {
      const next = new Set(prev);
      if (next.has(ledgerId)) next.delete(ledgerId);
      else next.add(ledgerId);
      return next;
    });
  };

  const toggleSelectAllFiltered = () => {
    setSelectedLedgerIds(() => {
      if (filtered.length === 0) return new Set();
      if (allFilteredLedgerSelected) return new Set();
      return new Set(filtered.map((r) => r.ledger._id));
    });
  };

  const exportTags = useMemo(
    () =>
      [
        year === "all" ? "all-years" : `y${year}`,
        mode !== "all" ? mode : "",
        method !== "all" ? "method-filter" : "",
        payee !== "all" ? "payee-filter" : "",
      ].filter(Boolean),
    [year, mode, method, payee]
  );

  const exportSelectedCsv = () => {
    if (selectedLedgerRows.length === 0) return;
    downloadTextFile(
      buildExportFilename("ledger-selection", "csv", exportTags),
      buildLedgerCsv(selectedLedgerRows),
      "text/csv;charset=utf-8",
      { utf8Bom: true },
    );
    showOperationalToast({
      title: "Selection exported",
      description: `${selectedLedgerRows.length} funding row${selectedLedgerRows.length === 1 ? "" : "s"} as CSV`,
      variant: "success",
    });
  };

  const exportCsv = () => {
    downloadTextFile(
      buildExportFilename("ledger", "csv", exportTags),
      buildLedgerCsv(filtered),
      "text/csv;charset=utf-8",
      { utf8Bom: true }
    );
  };

  const exportTsv = () => {
    downloadTextFile(
      buildExportFilename("ledger", "tsv", exportTags),
      buildLedgerTsv(filtered),
      "text/tab-separated-values;charset=utf-8",
      { utf8Bom: false }
    );
  };

  const exportJson = () => {
    downloadTextFile(
      buildExportFilename("ledger", "json", exportTags),
      buildLedgerJson(filtered),
      "application/json;charset=utf-8",
      { utf8Bom: false }
    );
  };

  const copyTable = async () => {
    try {
      await navigator.clipboard.writeText(ledgerClipboardTsv(filtered));
      setCopyState("ok");
      window.setTimeout(() => setCopyState("idle"), 1800);
    } catch {
      setCopyState("err");
      window.setTimeout(() => setCopyState("idle"), 2400);
    }
  };

  const printPage = () => {
    const params = new URLSearchParams();
    if (search) params.set("q", search);
    if (year !== "all") params.set("year", year);
    if (mode !== "all") params.set("mode", mode);
    if (method !== "all") params.set("method", method);
    if (payee !== "all") params.set("payee", payee);
    const qs = params.toString();
    window.open(`/print/ledger${qs ? `?${qs}` : ""}`, "_blank");
  };

  const clearFilters = () => {
    setSearch("");
    setYear("all");
    setMode("all");
    setMethod("all");
    setPayee("all");
  };

  const toggleExpanded = (id: Id<"ledger">) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const empty = !loading && data.length === 0;
  const noMatches = !loading && data.length > 0 && filtered.length === 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Ledger</h1>
          <p className="text-sm text-muted-foreground">
            Funded loans — paid, scheduled, or on a monthly receivable.
            Click any cell to edit; expand a row to log individual payments.
            Export, copy, or print at any time.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={filtered.length === 0}
            onClick={copyTable}
            title="Copy the visible rows as TSV (paste into Excel / Sheets)"
          >
            {copyState === "ok" ? (
              <Check className="h-4 w-4" />
            ) : (
              <Copy className="h-4 w-4" />
            )}
            {copyState === "ok"
              ? "Copied"
              : copyState === "err"
                ? "Copy failed"
                : "Copy table"}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={filtered.length === 0}
            onClick={printPage}
            title="Open a print-friendly view (Save as PDF works too)"
          >
            <Printer className="h-4 w-4" />
            Print
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={filtered.length === 0}
            onClick={exportTsv}
            title="Download visible rows as a .tsv file (Excel-friendly)"
          >
            <Download className="h-4 w-4" />
            Export TSV
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={filtered.length === 0}
            onClick={exportCsv}
            title="Download visible rows as CSV (UTF-8 with BOM for Excel)"
          >
            <Download className="h-4 w-4" />
            Export CSV
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={filtered.length === 0}
            onClick={exportJson}
            title="Download visible rows as structured JSON (full detail)"
          >
            <FileJson className="h-4 w-4" />
            Export JSON
          </Button>
        </div>
      </div>

      {missingPaid.length > 0 && (
        <section className="rounded-lg border border-amber-200/80 bg-amber-50/40 p-3 dark:border-amber-900/60 dark:bg-amber-950/20">
          <h3 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-amber-900 dark:text-amber-200">
            <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
            Paid files missing a ledger entry ({missingPaid.length})
          </h3>
          <p className="mb-2 text-xs text-amber-900/80 dark:text-amber-200/80">
            These files are marked Paid / Paying but didn&apos;t auto-create
            a row (typically older deals from before the ledger existed).
            Add them in to keep totals accurate.
          </p>
          <ul className="space-y-1.5">
            {missingPaid.map((f) => (
              <li
                key={f._id}
                className="flex flex-wrap items-center gap-2 rounded-md border border-amber-200/60 bg-background/80 px-2 py-1.5 text-sm"
              >
                <button
                  type="button"
                  className="min-w-0 flex-1 truncate text-left font-medium hover:underline"
                  onClick={() => openPipelineFile(f._id)}
                >
                  {f.fileName}
                </button>
                <span className="text-xs text-muted-foreground">
                  Funding {fmtMoney(f.fundingAmount)} · Net{" "}
                  {fmtMoney(f.netToUser ?? 0)} · Gross{" "}
                  {fmtMoney(f.brokerGross ?? 0)}
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={!canUseHub}
                  onClick={async () => {
                    await createFor({
                      fileId: f._id,
                      gross: f.brokerGross ?? 0,
                      net: f.netToUser ?? 0,
                      date: f.updatedAt,
                      ...memberScope,
                    });
                  }}
                >
                  <Plus className="h-3.5 w-3.5" /> Add to ledger
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <ProjectionsCard
        includedInForecast={includedProjectionFiles}
        excludedPinned={excludedProjectionFiles}
        candidates={projectionCandidates}
        totals={projectionTotals}
        canUseHub={canUseHub}
        onSetProjected={async (id, projected) => {
          await setProjected({
            id,
            projected,
            ...(preferencesAccountId ? { preferencesAccountId } : {}),
          });
        }}
        onExcludeFromForecast={(id) => {
          setExcludedFromProjectionForecast((prev) => {
            const next = new Set(prev);
            next.add(id);
            return next;
          });
        }}
        onIncludeInForecast={(id) => {
          setExcludedFromProjectionForecast((prev) => {
            const next = new Set(prev);
            next.delete(id);
            return next;
          });
        }}
        onOpenFile={openPipelineFile}
      />

      {selectionTotals.count > 0 && (
        <LedgerSelectionSummary
          count={selectionTotals.count}
          expectedNet={selectionTotals.expectedNet}
          expectedGross={selectionTotals.expectedGross}
          receivedNet={selectionTotals.receivedNet}
          receivedGross={selectionTotals.receivedGross}
          balanceNet={selectionTotals.balanceNet}
          balanceGross={selectionTotals.balanceGross}
          onClear={() => setSelectedLedgerIds(new Set())}
        />
      )}

      <div className={cn("overflow-hidden", OP_WORKSPACE_ISLAND, "p-0")}>
        <div className="sticky top-0 z-[2] border-b border-border/80 bg-background/95 backdrop-blur">
          <div className="flex flex-col gap-3 p-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
              <SearchField
                containerClassName="flex-1"
                placeholder="Search file, address, method, payee, or notes…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onClear={() => setSearch("")}
                aria-label="Search ledger"
              />
              <Select
                value={year}
                onChange={(e) => setYear(e.target.value)}
                aria-label="Filter year"
                className="w-auto min-w-[7rem]"
              >
                <option value="all">All years</option>
                {years.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </Select>
              <Select
                value={mode}
                onChange={(e) =>
                  setMode(e.target.value as "all" | PaymentMode)
                }
                aria-label="Filter funding mode"
                className="w-auto min-w-[8rem]"
              >
                <option value="all">All modes</option>
                <option value="lump_sum">Lump sum</option>
                <option value="scheduled">Scheduled</option>
                <option value="monthly">Monthly</option>
              </Select>
              <Select
                value={method}
                onChange={(e) => setMethod(e.target.value)}
                aria-label="Filter method"
                className="w-auto min-w-[7rem]"
              >
                <option value="all">All methods</option>
                {methods.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </Select>
              <Select
                value={payee}
                onChange={(e) => setPayee(e.target.value)}
                aria-label="Filter payee"
                className="w-auto min-w-[8rem]"
              >
                <option value="all">All payees</option>
                {payees.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </Select>
              {(search ||
                year !== "all" ||
                mode !== "all" ||
                method !== "all" ||
                payee !== "all") && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={clearFilters}
                >
                  <X className="h-3.5 w-3.5" /> Clear
                </Button>
              )}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
              <span>
                {loading
                  ? "…"
                  : `${filtered.length.toLocaleString()} of ${data.length.toLocaleString()} fundings`}
              </span>
              {!loading && filtered.length > 0 && (
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-foreground">
                  {/* All headline figures are NET to the user — the
                      number that actually lands in the bank. Gross is
                      shown as a small subtotal underneath for context. */}
                  <span className="inline-flex items-baseline gap-1.5">
                    <Wallet className="h-3.5 w-3.5 self-center text-muted-foreground" />
                    Booked net{" "}
                    <span className="font-semibold tabular-nums">
                      {fmtMoney(totals.expectedNet)}
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      gross {fmtMoney(totals.expectedGross)}
                    </span>
                  </span>
                  <span className="inline-flex items-baseline gap-1.5">
                    Received{" "}
                    <span className="font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
                      {fmtMoney(totals.receivedNet)}
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      gross {fmtMoney(totals.receivedGross)}
                    </span>
                  </span>
                  <span className="inline-flex items-baseline gap-1.5">
                    Balance{" "}
                    <span
                      className={cn(
                        "font-semibold tabular-nums",
                        totals.balanceNet > 0
                          ? "text-amber-700 dark:text-amber-400"
                          : "text-muted-foreground"
                      )}
                    >
                      {fmtMoney(totals.balanceNet)}
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      gross {fmtMoney(totals.balanceGross)}
                    </span>
                  </span>
                  {projectionTotals.count > 0 && (
                    <span className="inline-flex items-baseline gap-1.5 rounded-md border border-primary/30 bg-primary/5 px-2 py-0.5 text-foreground">
                      <TrendingUp className="h-3.5 w-3.5 self-center text-primary" />
                      Net forecast{" "}
                      <span className="font-semibold tabular-nums text-primary">
                        {fmtMoney(
                          totals.expectedNet + projectionTotals.net
                        )}
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        +{fmtMoney(projectionTotals.net)} projected
                      </span>
                    </span>
                  )}
                  {selectionTotals.count > 0 && (
                    <span className="inline-flex items-baseline gap-1.5 rounded-md border border-border/80 bg-muted/40 px-2 py-0.5 text-foreground">
                      Table selection ({selectionTotals.count}) — net{" "}
                      <span className="font-semibold tabular-nums">
                        {fmtMoney(selectionTotals.expectedNet)}
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        recv {fmtMoney(selectionTotals.receivedNet)} · bal{" "}
                        {fmtMoney(selectionTotals.balanceNet)}
                      </span>
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="max-h-[70vh] overflow-auto">
          <table
            className={dataTableClassNames(
              settings.tableDensity,
              "w-full min-w-[1180px] text-sm"
            )}
          >
            <thead className="sticky top-0 z-[1] border-b border-border/80 bg-muted text-left text-xs font-semibold uppercase tracking-wider text-foreground/80">
              <tr>
                <th className="w-9 px-1 py-2 text-center" scope="col">
                  <input
                    ref={selectAllCheckboxRef}
                    type="checkbox"
                    className={cn(OP_MICRO_CONTROL_CLASS, "h-3.5 w-3.5")}
                    checked={allFilteredLedgerSelected}
                    onChange={toggleSelectAllFiltered}
                    disabled={loading || filtered.length === 0}
                    aria-label="Select all visible fundings"
                    title="Select all visible fundings"
                  />
                </th>
                <th className="w-8 px-1 py-2" aria-label="Expand" />
                <th className="px-3 py-2">Funded</th>
                <th className="px-3 py-2">File</th>
                <th className="px-3 py-2">Mode</th>
                <th className="px-3 py-2 text-right">Expected (net)</th>
                <th className="px-3 py-2 text-right">Received (net)</th>
                <th className="px-3 py-2 text-right">Balance (net)</th>
                <th className="px-3 py-2">Method</th>
                <th className="px-3 py-2">Paid by</th>
                <th className="px-3 py-2 text-right" aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {loading &&
                Array.from({ length: 6 }, (_, i) => (
                  <tr key={i} aria-hidden>
                    <td colSpan={11} className="px-3 py-1.5">
                      <OperationalSkeletonRow />
                    </td>
                  </tr>
                ))}
              {empty && (
                <tr>
                  <td
                    colSpan={11}
                    className="px-3 py-12 text-center text-muted-foreground"
                  >
                    No funded loans recorded yet. Mark a pipeline file as
                    &quot;Paid / Paying&quot; to drop it here automatically.
                  </td>
                </tr>
              )}
              {noMatches && (
                <tr>
                  <td
                    colSpan={11}
                    className="px-3 py-12 text-center text-muted-foreground"
                  >
                    No fundings match the current filters.
                  </td>
                </tr>
              )}
              {!loading &&
                filtered.map((r) => (
                  <LedgerTableRow
                    key={r.ledger._id}
                    entry={r}
                    selected={selectedLedgerIds.has(r.ledger._id)}
                    onToggleSelected={() => toggleLedgerSelect(r.ledger._id)}
                    expanded={expanded.has(r.ledger._id)}
                    onToggleExpanded={() => toggleExpanded(r.ledger._id)}
                    onOpenFile={openPipelineFile}
                    confirmingDelete={confirmDeleteId === r.ledger._id}
                    deleting={deletingId === r.ledger._id}
                    onAskDelete={() => setConfirmDeleteId(r.ledger._id)}
                    onCancelDelete={() => setConfirmDeleteId(null)}
                    onConfirmDelete={async () => {
                      setDeletingId(r.ledger._id);
                      try {
                        await removeLedger({
                          id: r.ledger._id,
                          ...memberScope,
                        });
                        setConfirmDeleteId(null);
                      } finally {
                        setDeletingId(null);
                      }
                    }}
                    setPayment={setPayment}
                    memberScope={memberScope}
                  />
                ))}
            </tbody>
            {!loading && filtered.length > 0 && (
              <tfoot className="border-t-2 border-border/80 bg-muted/30 text-sm font-semibold">
                <tr>
                  <td />
                  <td />
                  <td
                    className="px-3 py-2.5 text-xs uppercase text-muted-foreground"
                    colSpan={3}
                  >
                    Totals ({filtered.length} fundings)
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">
                    {fmtMoney(totals.expectedNet)}
                    <div className="text-[10px] font-normal text-muted-foreground">
                      gross {fmtMoney(totals.expectedGross)}
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-emerald-600 dark:text-emerald-400">
                    {fmtMoney(totals.receivedNet)}
                    <div className="text-[10px] font-normal text-muted-foreground">
                      gross {fmtMoney(totals.receivedGross)}
                    </div>
                  </td>
                  <td
                    className={cn(
                      "px-3 py-2.5 text-right tabular-nums",
                      totals.balanceNet > 0
                        ? "text-amber-700 dark:text-amber-400"
                        : "text-muted-foreground"
                    )}
                  >
                    {fmtMoney(totals.balanceNet)}
                    {totals.balanceGross > 0 && (
                      <div className="text-[10px] font-normal text-muted-foreground">
                        gross {fmtMoney(totals.balanceGross)}
                      </div>
                    )}
                  </td>
                  <td colSpan={3} />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      <OperationalBatchBar
        open={selectionTotals.count > 0}
        count={selectionTotals.count}
        itemNoun="funding"
        sublabel={`Balance net ${fmtMoney(selectionTotals.balanceNet)} · Expected ${fmtMoney(selectionTotals.expectedNet)}`}
        onClear={() => setSelectedLedgerIds(new Set())}
        data-testid="ledger-batch-bar"
      >
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-9 gap-1.5 px-2.5 text-xs max-md:min-h-10"
          onClick={exportSelectedCsv}
        >
          <Download className="h-3.5 w-3.5 shrink-0" aria-hidden />
          Export
        </Button>
      </OperationalBatchBar>
    </div>
  );
}

// ============================================================================
// Ledger table selection — subtotals for checked fundings
// ============================================================================

function LedgerSelectionSummary({
  count,
  expectedNet,
  expectedGross,
  receivedNet,
  receivedGross,
  balanceNet,
  balanceGross,
  onClear,
}: {
  count: number;
  expectedNet: number;
  expectedGross: number;
  receivedNet: number;
  receivedGross: number;
  balanceNet: number;
  balanceGross: number;
  onClear: () => void;
}) {
  return (
    <section className={cn(OP_WORKSPACE_ISLAND)}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <ListChecks className="h-4 w-4 text-muted-foreground" aria-hidden />
          <h2 className="text-sm font-semibold">Table selection</h2>
          <span className="text-xs text-muted-foreground">
            Subtotals for {count.toLocaleString()} checked funding
            {count === 1 ? "" : "s"} in the ledger below
          </span>
        </div>
        <Button type="button" size="sm" variant="outline" onClick={onClear}>
          <X className="h-3.5 w-3.5" /> Clear selection
        </Button>
      </div>
      <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
        <div className="rounded-md border border-border/60 bg-background px-3 py-2">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Expected net
          </div>
          <div className="text-base font-semibold tabular-nums">
            {fmtMoney(expectedNet)}
          </div>
          <div className="text-[10px] text-muted-foreground">
            gross {fmtMoney(expectedGross)}
          </div>
        </div>
        <div className="rounded-md border border-border/60 bg-background px-3 py-2">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Received net
          </div>
          <div className="text-base font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
            {fmtMoney(receivedNet)}
          </div>
          <div className="text-[10px] text-muted-foreground">
            gross {fmtMoney(receivedGross)}
          </div>
        </div>
        <div className="rounded-md border border-border/60 bg-background px-3 py-2">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Balance net
          </div>
          <div
            className={cn(
              "text-base font-semibold tabular-nums",
              balanceNet > 0
                ? "text-amber-700 dark:text-amber-400"
                : "text-muted-foreground"
            )}
          >
            {fmtMoney(balanceNet)}
          </div>
          {balanceGross > 0 && (
            <div className="text-[10px] text-muted-foreground">
              gross {fmtMoney(balanceGross)}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

// ============================================================================
// Projections card — forecast net revenue from in-flight files
// ============================================================================

/**
 * "What-if" planner for the ledger. Pins are stored on each pipeline row;
 * this card only **counts** files you keep in the active forecast list
 * (not hidden). Booked ledger revenue is not mixed in here — totals are
 * projected net/gross from those included files only.
 * Use "Hide" to remove a pin from the dashboard totals without unpinning,
 * or "Unpin" to drop it from the forecast entirely.
 */
function ProjectionsCard({
  includedInForecast,
  excludedPinned,
  candidates,
  totals,
  canUseHub,
  onSetProjected,
  onExcludeFromForecast,
  onIncludeInForecast,
  onOpenFile,
}: {
  includedInForecast: PipelineListRow[];
  excludedPinned: PipelineListRow[];
  candidates: PipelineListRow[];
  totals: { net: number; gross: number; count: number };
  canUseHub: boolean;
  onSetProjected: (id: Id<"pipeline">, projected: boolean) => Promise<void>;
  onExcludeFromForecast: (id: Id<"pipeline">) => void;
  onIncludeInForecast: (id: Id<"pipeline">) => void;
  onOpenFile: (id: Id<"pipeline">) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [pickerSearch, setPickerSearch] = useState("");
  const [busyId, setBusyId] = useState<Id<"pipeline"> | null>(null);

  const filteredCandidates = useMemo(() => {
    const q = pickerSearch.trim().toLowerCase();
    if (!q) return candidates;
    return candidates.filter((c) => {
      const name = c.fileName.toLowerCase();
      const addr = (c.propertyAddress ?? "").toLowerCase();
      const status = c.status.toLowerCase();
      return name.includes(q) || addr.includes(q) || status.includes(q);
    });
  }, [candidates, pickerSearch]);

  const pinnedCount =
    includedInForecast.length + excludedPinned.length;
  const isEmptyIncluded = includedInForecast.length === 0;

  return (
    <section className={cn(OP_WORKSPACE_ISLAND)}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" aria-hidden />
          <h2 className="text-sm font-semibold">Projections</h2>
          <span className="text-xs text-muted-foreground">
            Pin deals, then keep only the ones you want in this forecast — Hide
            removes a file from totals without unpinning
          </span>
        </div>
        <Button
          type="button"
          size="sm"
          variant={adding ? "primary" : "outline"}
          onClick={() => setAdding((v) => !v)}
          disabled={!canUseHub || (!adding && candidates.length === 0)}
          aria-expanded={adding}
        >
          {adding ? (
            <>
              <X className="h-3.5 w-3.5" /> Done
            </>
          ) : (
            <>
              <Plus className="h-3.5 w-3.5" /> Add file
            </>
          )}
        </Button>
      </div>

      <div className="mt-2 rounded-md border border-primary/30 bg-primary/5 px-3 py-2">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
          Projected net — files in forecast ({totals.count})
        </div>
        <div className="text-base font-semibold tabular-nums text-primary">
          {fmtMoney(totals.net)}
        </div>
        {totals.gross > 0 && (
          <div className="text-[10px] text-muted-foreground">
            gross {fmtMoney(totals.gross)}
          </div>
        )}
        <div className="mt-1 text-[10px] text-muted-foreground">
          Sum of the files listed below (hidden pins excluded). Does not
          include booked ledger revenue.
        </div>
      </div>

      {isEmptyIncluded && !adding && (
        <p className="mt-3 rounded-md border border-dashed border-border/70 bg-muted/20 px-3 py-3 text-xs text-muted-foreground">
          {excludedPinned.length > 0 ? (
            <>
              Every pinned file is currently <strong>hidden</strong> from this
              forecast. Use &quot;Add to forecast&quot; under{' '}
              <em>Pinned, not in forecast</em> below, or unpin files you
              don&apos;t need.
            </>
          ) : candidates.length > 0 ? (
            <>
              No files in your forecast yet. Click &quot;Add file&quot; above
              to pin in-flight pipeline deals, then they appear here for
              totals.
            </>
          ) : pinnedCount > 0 ? (
            "All in-flight files are already in your pin list or funded."
          ) : (
            "All in-flight files will appear here once you pin them."
          )}
        </p>
      )}

      {includedInForecast.length > 0 && (
        <ul className="mt-3 divide-y divide-border/60 rounded-md border border-border/60">
          {includedInForecast.map((f) => {
            const info = getPipelineStatusInfo(f.status);
            const busy = busyId === f._id;
            return (
              <li
                key={f._id}
                className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm"
              >
                <button
                  type="button"
                  className="min-w-0 flex-1 truncate text-left font-medium hover:underline"
                  onClick={() => onOpenFile(f._id)}
                  title="Open file"
                >
                  {f.fileName}
                </button>
                <span
                  className={cn(
                    "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium",
                    info.badgeClassName
                  )}
                >
                  {info.label}
                </span>
                <span className="text-xs text-muted-foreground">
                  Funding {fmtMoney(f.fundingAmount)}
                </span>
                <span className="text-right text-sm tabular-nums">
                  <span className="font-semibold text-primary">
                    {fmtMoney(f.netToUser ?? 0)}
                  </span>
                  <span className="ml-1 text-[10px] text-muted-foreground">
                    net · gross {fmtMoney(f.brokerGross ?? 0)}
                  </span>
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={!canUseHub || busy}
                  onClick={() => onExcludeFromForecast(f._id)}
                  aria-label={`Hide ${f.fileName} from forecast totals`}
                  title="Hide from forecast totals (stays pinned)"
                >
                  Hide
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={!canUseHub || busy}
                  onClick={async () => {
                    setBusyId(f._id);
                    try {
                      await onSetProjected(f._id, false);
                    } finally {
                      setBusyId(null);
                    }
                  }}
                  aria-label={`Unpin ${f.fileName}`}
                  title="Remove pin from forecast list"
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </li>
            );
          })}
        </ul>
      )}

      {excludedPinned.length > 0 && (
        <div className="mt-3 rounded-md border border-dashed border-border/70 bg-muted/15 px-3 py-2">
          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Pinned, not in forecast ({excludedPinned.length})
          </h3>
          <p className="mb-2 text-[11px] text-muted-foreground">
            Still pinned on the pipeline; hidden from the projected totals above.
          </p>
          <ul className="divide-y divide-border/40 rounded-md border border-border/50 bg-background/80">
            {excludedPinned.map((f) => {
              const info = getPipelineStatusInfo(f.status);
              const busy = busyId === f._id;
              return (
                <li
                  key={f._id}
                  className="flex flex-wrap items-center gap-2 px-2 py-1.5 text-sm"
                >
                  <button
                    type="button"
                    className="min-w-0 flex-1 truncate text-left font-medium hover:underline"
                    onClick={() => onOpenFile(f._id)}
                  >
                    {f.fileName}
                  </button>
                  <span
                    className={cn(
                      "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium",
                      info.badgeClassName
                    )}
                  >
                    {info.label}
                  </span>
                  <span className="text-xs tabular-nums text-muted-foreground">
                    Net {fmtMoney(f.netToUser ?? 0)}
                  </span>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() => onIncludeInForecast(f._id)}
                  >
                    Add to forecast
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={!canUseHub || busy}
                    onClick={async () => {
                      setBusyId(f._id);
                      try {
                        await onSetProjected(f._id, false);
                      } finally {
                        setBusyId(null);
                      }
                    }}
                    aria-label={`Unpin ${f.fileName}`}
                    title="Remove pin"
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {adding && (
        <div className="mt-3 rounded-md border border-border/60 bg-muted/20 p-2">
          <div className="px-1 pb-2">
            <SearchField
              compact
              autoFocus
              placeholder="Search by file, address, status…"
              value={pickerSearch}
              onChange={(e) => setPickerSearch(e.target.value)}
              aria-label="Search candidate files"
            />
          </div>
          {filteredCandidates.length === 0 ? (
            <p className="px-1 py-2 text-xs text-muted-foreground">
              {candidates.length === 0
                ? "No in-flight files available — every pipeline file is already paid or projected."
                : "No matches."}
            </p>
          ) : (
            <ul className="max-h-64 overflow-auto divide-y divide-border/60">
              {filteredCandidates.slice(0, 50).map((f) => {
                const info = getPipelineStatusInfo(f.status);
                const busy = busyId === f._id;
                return (
                  <li
                    key={f._id}
                    className="flex flex-wrap items-center gap-2 px-2 py-1.5 text-sm"
                  >
                    <span className="min-w-0 flex-1 truncate font-medium">
                      {f.fileName}
                    </span>
                    <span
                      className={cn(
                        "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium",
                        info.badgeClassName
                      )}
                    >
                      {info.label}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      Net {fmtMoney(f.netToUser ?? 0)}
                    </span>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={!canUseHub || busy}
                      onClick={async () => {
                        setBusyId(f._id);
                        try {
                          await onSetProjected(f._id, true);
                        } finally {
                          setBusyId(null);
                        }
                      }}
                    >
                      <Plus className="h-3.5 w-3.5" /> Pin
                    </Button>
                  </li>
                );
              })}
              {filteredCandidates.length > 50 && (
                <li className="px-2 py-1.5 text-[11px] text-muted-foreground">
                  Showing 50 of {filteredCandidates.length}. Refine your
                  search to see more.
                </li>
              )}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}

// ============================================================================
// Row + payments expansion
// ============================================================================

type SetPaymentFn = (args: {
  id: Id<"ledger">;
  paymentMode?: PaymentMode | null;
  scheduledDate?: number | null;
  monthlyAmount?: number | null;
  termMonths?: number | null;
  notes?: string | null;
  paymentMethod?: string | null;
  paidBy?: string | null;
  gross?: number;
  net?: number;
  date?: number;
}) => Promise<unknown>;

function LedgerTableRow({
  entry,
  selected,
  onToggleSelected,
  expanded,
  onToggleExpanded,
  onOpenFile,
  confirmingDelete,
  deleting,
  onAskDelete,
  onCancelDelete,
  onConfirmDelete,
  setPayment,
  memberScope,
}: {
  entry: LedgerEntry;
  selected: boolean;
  onToggleSelected: () => void;
  expanded: boolean;
  onToggleExpanded: () => void;
  onOpenFile: (id: Id<"pipeline">) => void;
  confirmingDelete: boolean;
  deleting: boolean;
  onAskDelete: () => void;
  onCancelDelete: () => void;
  onConfirmDelete: () => void;
  setPayment: SetPaymentFn;
  memberScope: LedgerMemberScope;
}) {
  const ledger = entry.ledger;
  const file = entry.file;
  const canEditFile = entry.canEditFile;
  const status = file ? getPipelineStatusInfo(file.status) : null;
  const m = modeOf(ledger);
  const balance = Math.max(0, ledger.gross - entry.receivedGross);
  const netBalance = Math.max(0, ledger.net - entry.receivedNet);

  return (
    <ResourceAccessProvider value={ledgerRowAccessUx(canEditFile)}>
      <tr
        className={cn(
          "border-b border-border/50 last:border-0",
          expanded && "bg-muted/30"
        )}
      >
        <td className="px-1 py-2 align-top text-center">
          <input
            type="checkbox"
            className="h-3.5 w-3.5 rounded border-border accent-primary"
            checked={selected}
            onChange={onToggleSelected}
            aria-label={`Select ${file?.fileName ?? "funding"} for subtotal`}
            title="Include in table selection subtotal"
          />
        </td>
        <td className="px-1 py-2 align-top text-center">
          <button
            type="button"
            onClick={onToggleExpanded}
            className="rounded p-1 text-muted-foreground hover:bg-muted"
            aria-label={expanded ? "Collapse payments" : "Expand payments"}
            title={
              expanded
                ? "Hide payments"
                : `Show payments (${entry.paymentCount})`
            }
          >
            {expanded ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
          </button>
        </td>
        <td className="px-3 py-2 align-top">
          <InlineDate
            value={ledger.date}
            onCommit={async (next) => {
              if (next === null) return;
              await setPayment({
                id: ledger._id,
                date: next,
                ...memberScope,
              });
            }}
            ariaLabel="Edit funded date"
            format={fmtDate}
          />
        </td>
        <td className="px-3 py-2 align-top">
          {file ? (
            <button
              type="button"
              className="group flex items-start gap-1.5 text-left"
              onClick={() => onOpenFile(file._id)}
              title="Open full pipeline file"
            >
              <span>
                <span className="block font-medium text-foreground group-hover:underline">
                  {file.fileName}
                </span>
                {file.propertyAddress && (
                  <span className="block text-xs text-muted-foreground">
                    {file.propertyAddress}
                  </span>
                )}
                {status && (
                  <span
                    className={cn(
                      "mt-1 inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium",
                      status.badgeClassName
                    )}
                  >
                    {status.label}
                  </span>
                )}
              </span>
              <ExternalLink className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground/60 group-hover:text-foreground" />
            </button>
          ) : (
            <span className="italic text-muted-foreground">
              (deleted file)
            </span>
          )}
        </td>
        <td className="px-3 py-2 align-top">
          <InlineSelect
            value={m}
            options={MODE_OPTIONS}
            onCommit={async (next) => {
              await setPayment({
                id: ledger._id,
                paymentMode: next as PaymentMode,
                ...memberScope,
              });
            }}
            ariaLabel="Edit funding mode"
            asBadge
          />
          {m === "scheduled" && (
            <div className="mt-1 text-[11px] text-muted-foreground">
              <span className="mr-1">Due</span>
              <InlineDate
                value={ledger.scheduledDate}
                onCommit={async (next) =>
                  setPayment({
                    id: ledger._id,
                    scheduledDate: next,
                    ...memberScope,
                  })
                }
                ariaLabel="Edit scheduled pay date"
                placeholder="set date"
                format={fmtDate}
              />
            </div>
          )}
          {m === "monthly" && (
            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
              <span>Each</span>
              <InlineNumber
                value={ledger.monthlyAmount ?? null}
                format={(n) => fmtMoney(n)}
                placeholder="amt"
                onCommit={async (next) =>
                  setPayment({
                    id: ledger._id,
                    monthlyAmount: next,
                    ...memberScope,
                  })
                }
                ariaLabel="Edit monthly amount"
              />
              <span>×</span>
              <InlineNumber
                value={ledger.termMonths ?? null}
                placeholder="mos"
                format={(n) => String(Math.round(n))}
                parse={(s) => {
                  const n = parseInt(s.replace(/[^\d]/g, ""), 10);
                  return Number.isFinite(n) ? n : null;
                }}
                onCommit={async (next) =>
                  setPayment({
                    id: ledger._id,
                    termMonths: next,
                    ...memberScope,
                  })
                }
                ariaLabel="Edit number of months"
              />
              <span>mo</span>
            </div>
          )}
        </td>
        <td className="px-3 py-2 text-right align-top">
          <InlineNumber
            value={ledger.net}
            format={fmtMoney}
            clearable={false}
            validate={(n) => (n < 0 ? "Must be 0 or more" : null)}
            onCommit={async (next) => {
              if (next === null) return;
              await setPayment({
                id: ledger._id,
                net: next,
                ...memberScope,
              });
            }}
            ariaLabel="Edit expected net"
            displayClassName="justify-end text-right font-medium"
          />
          <div className="text-[11px] text-muted-foreground">
            gross{" "}
            <InlineNumber
              value={ledger.gross}
              format={fmtMoney}
              clearable={false}
              validate={(n) => (n < 0 ? "Must be 0 or more" : null)}
              onCommit={async (next) => {
                if (next === null) return;
                await setPayment({
                  id: ledger._id,
                  gross: next,
                  ...memberScope,
                });
              }}
              ariaLabel="Edit expected gross"
              displayClassName="inline justify-end text-right"
            />
          </div>
        </td>
        <td className="px-3 py-2 text-right align-top tabular-nums">
          <span
            className={cn(
              "font-medium",
              entry.receivedNet > 0
                ? "text-emerald-600 dark:text-emerald-400"
                : "text-muted-foreground"
            )}
          >
            {fmtMoney(entry.receivedNet)}
          </span>
          <div className="text-[11px] text-muted-foreground">
            gross {fmtMoney(entry.receivedGross)}
            {entry.paymentCount > 0 && (
              <>
                {" · "}
                {entry.paymentCount} pmt
                {entry.paymentCount === 1 ? "" : "s"}
                {entry.lastPaymentDate
                  ? ` · last ${fmtDate(entry.lastPaymentDate)}`
                  : ""}
              </>
            )}
          </div>
        </td>
        <td
          className={cn(
            "px-3 py-2 text-right align-top tabular-nums",
            netBalance > 0
              ? "text-amber-700 dark:text-amber-400"
              : "text-muted-foreground"
          )}
        >
          {fmtMoney(netBalance)}
          {balance > 0 && (
            <div className="text-[11px] text-muted-foreground">
              gross {fmtMoney(balance)}
            </div>
          )}
        </td>
        <td className="px-3 py-2 align-top">
          <InlineSelect
            value={ledger.paymentMethod ?? ""}
            options={METHOD_OPTIONS}
            onCommit={async (next) =>
              setPayment({
                id: ledger._id,
                paymentMethod: next ? next : null,
                ...memberScope,
              })
            }
            ariaLabel="Edit method"
          />
        </td>
        <td className="px-3 py-2 align-top">
          <InlineText
            value={ledger.paidBy ?? ""}
            allowEmpty
            placeholder="Add payee"
            onCommit={async (next) =>
              setPayment({
                id: ledger._id,
                paidBy: next.trim() ? next.trim() : null,
                ...memberScope,
              })
            }
            ariaLabel="Edit payee"
          />
        </td>
        <td className="px-3 py-2 align-top text-right">
          {confirmingDelete ? (
            <span className="inline-flex items-center gap-1">
              <Button
                type="button"
                size="sm"
                variant="danger"
                disabled={deleting}
                onClick={onConfirmDelete}
              >
                {deleting ? "Deleting…" : "Confirm"}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={onCancelDelete}
              >
                Cancel
              </Button>
            </span>
          ) : (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="text-muted-foreground hover:text-destructive"
              onClick={onAskDelete}
              disabled={!canEditFile}
              aria-label="Delete entry"
              title={
                canEditFile
                  ? "Delete entry (cascades payments)"
                  : VIEW_ONLY_ACCESS_TOOLTIP
              }
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </td>
      </tr>
      {expanded && (
        <PaymentsRow entry={entry} memberScope={memberScope} />
      )}
    </ResourceAccessProvider>
  );
}

// ----------------------------------------------------------------------------
// Payments expansion (sub-table + add form)
// ----------------------------------------------------------------------------

const ADD_PAYMENT_INVALID_TOAST = "Please enter valid Gross and Net amounts.";

function parseAddPaymentAmount(raw: string): number | undefined {
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  const cleaned = trimmed.replace(/[$,\s]/g, "");
  if (!cleaned) return undefined;
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : undefined;
}

/** Gross required (> 0); net optional (defaults to gross when blank). */
function validateAddPaymentAmounts(
  draftGross: string,
  draftNet: string
): { gross: number; net: number } | null {
  const gross = parseAddPaymentAmount(draftGross);
  if (gross === undefined || gross <= 0) return null;
  if (!draftNet.trim()) return { gross, net: gross };
  const net = parseAddPaymentAmount(draftNet);
  if (net === undefined || net < 0) return null;
  return { gross, net };
}

function advanceAddPaymentFieldOnEnter(
  e: React.KeyboardEvent,
  next?: React.RefObject<HTMLElement | null>
) {
  if (e.key !== "Enter") return;
  e.preventDefault();
  e.stopPropagation();
  if (next?.current) {
    next.current.focus();
    if (next.current instanceof HTMLInputElement) {
      next.current.select();
    }
  } else {
    (e.currentTarget as HTMLElement).blur();
  }
}

function PaymentsRow({
  entry,
  memberScope,
}: {
  entry: LedgerEntry;
  memberScope: LedgerMemberScope;
}) {
  const { settings } = useUserSettings();
  const create = useMutation(api.payments.create);
  const update = useMutation(api.payments.update);
  const remove = useMutation(api.payments.remove);
  const canEditFile = entry.canEditFile;

  const [draftDate, setDraftDate] = useState<string>(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  });
  const [draftGross, setDraftGross] = useState<string>("");
  const [draftNet, setDraftNet] = useState<string>("");
  const [draftMethod, setDraftMethod] = useState<string>(
    entry.ledger.paymentMethod ?? ""
  );
  const [draftPaidBy, setDraftPaidBy] = useState<string>(
    entry.ledger.paidBy ?? ""
  );
  const [draftNotes, setDraftNotes] = useState<string>("");
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const grossInputRef = useRef<HTMLInputElement>(null);
  const netInputRef = useRef<HTMLInputElement>(null);
  const methodSelectRef = useRef<HTMLSelectElement>(null);
  const paidByInputRef = useRef<HTMLInputElement>(null);
  const notesInputRef = useRef<HTMLInputElement>(null);
  const addPaymentButtonRef = useRef<HTMLButtonElement>(null);

  // Pre-fill expected installment for monthly mode for one-click logging.
  const suggestedAmount =
    modeOf(entry.ledger) === "monthly" && entry.ledger.monthlyAmount
      ? entry.ledger.monthlyAmount
      : null;

  async function submitAddPayment() {
    if (!canEditFile) return;
    setAddError(null);
    const amounts = validateAddPaymentAmounts(draftGross, draftNet);
    if (!amounts) {
      showOperationalToast({
        title: ADD_PAYMENT_INVALID_TOAST,
        variant: "destructive",
      });
      setAddError(ADD_PAYMENT_INVALID_TOAST);
      return;
    }
    const [y, mo, d] = draftDate.split("-").map((p) => parseInt(p, 10));
    const dateMs = y && mo && d ? new Date(y, mo - 1, d).getTime() : Date.now();
    setAdding(true);
    try {
      await create({
        ledgerId: entry.ledger._id,
        date: dateMs,
        gross: amounts.gross,
        net: amounts.net,
        method: draftMethod || undefined,
        paidBy: draftPaidBy || undefined,
        notes: draftNotes || undefined,
        ...memberScope,
      });
      setDraftGross("");
      setDraftNet("");
      setDraftNotes("");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setAddError(message);
      showOperationalToast({
        title: "Could not add payment",
        description: message,
        variant: "destructive",
      });
    } finally {
      setAdding(false);
    }
  }

  return (
    <tr className="bg-muted/20">
      <td />
      <td />
      <td colSpan={9} className="px-3 pb-4 pt-1">
        <div className="rounded-md border bg-background p-3">
          <div className="mb-3 flex items-baseline justify-between gap-2">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Payments received ({entry.paymentCount})
            </h4>
            <span className="text-xs text-muted-foreground">
              Received{" "}
              <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                {fmtMoney(entry.receivedGross)}
              </span>
              {" · "}
              Balance{" "}
              <span
                className={cn(
                  "font-semibold",
                  entry.ledger.gross - entry.receivedGross > 0
                    ? "text-amber-700 dark:text-amber-400"
                    : "text-muted-foreground"
                )}
              >
                {fmtMoney(
                  Math.max(0, entry.ledger.gross - entry.receivedGross)
                )}
              </span>
            </span>
          </div>

          {entry.payments.length === 0 ? (
            <p className="rounded-md border border-dashed p-3 text-center text-xs text-muted-foreground">
              No payments logged yet. Use the form below to record the first
              receipt.
            </p>
          ) : (
            <table
              className={dataTableClassNames(
                settings.tableDensity,
                "w-full text-xs"
              )}
            >
              <thead className="border-b border-border/50 text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-2 py-1.5">Date</th>
                  <th className="px-2 py-1.5 text-right">Gross</th>
                  <th className="px-2 py-1.5 text-right">Net</th>
                  <th className="px-2 py-1.5">Method</th>
                  <th className="px-2 py-1.5">Paid by</th>
                  <th className="px-2 py-1.5">Notes</th>
                  <th className="px-2 py-1.5" aria-label="Delete" />
                </tr>
              </thead>
              <tbody>
                {entry.payments.map((p) => (
                  <tr
                    key={p._id}
                    className="border-b border-border/30 last:border-0"
                  >
                    <td className="px-2 py-1.5 align-top">
                      <InlineDate
                        value={p.date}
                        onCommit={async (next) => {
                          if (next === null) return;
                          await update({
                            id: p._id,
                            date: next,
                            ...memberScope,
                          });
                        }}
                        ariaLabel="Edit payment date"
                        format={fmtDate}
                      />
                    </td>
                    <td className="px-2 py-1.5 text-right align-top">
                      <InlineNumber
                        value={p.gross}
                        format={fmtMoney}
                        clearable={false}
                        validate={(n) =>
                          n < 0 ? "Must be 0 or more" : null
                        }
                        onCommit={async (next) => {
                          if (next === null) return;
                          await update({
                            id: p._id,
                            gross: next,
                            ...memberScope,
                          });
                        }}
                        ariaLabel="Edit payment gross"
                        displayClassName="justify-end text-right"
                      />
                    </td>
                    <td className="px-2 py-1.5 text-right align-top">
                      <InlineNumber
                        value={p.net}
                        format={fmtMoney}
                        clearable={false}
                        validate={(n) =>
                          n < 0 ? "Must be 0 or more" : null
                        }
                        onCommit={async (next) => {
                          if (next === null) return;
                          await update({
                            id: p._id,
                            net: next,
                            ...memberScope,
                          });
                        }}
                        ariaLabel="Edit payment net"
                        displayClassName="justify-end text-right"
                      />
                    </td>
                    <td className="px-2 py-1.5 align-top">
                      <InlineSelect
                        value={p.method ?? ""}
                        options={METHOD_OPTIONS}
                        onCommit={async (next) =>
                          update({
                            id: p._id,
                            method: next ? next : null,
                            ...memberScope,
                          })
                        }
                        ariaLabel="Edit payment method"
                      />
                    </td>
                    <td className="px-2 py-1.5 align-top">
                      <InlineText
                        value={p.paidBy ?? ""}
                        allowEmpty
                        placeholder="Add payee"
                        onCommit={async (next) =>
                          update({
                            id: p._id,
                            paidBy: next.trim() ? next.trim() : null,
                            ...memberScope,
                          })
                        }
                        ariaLabel="Edit payment payee"
                      />
                    </td>
                    <td className="px-2 py-1.5 align-top">
                      <InlineText
                        value={p.notes ?? ""}
                        allowEmpty
                        placeholder="—"
                        onCommit={async (next) =>
                          update({
                            id: p._id,
                            notes: next.trim() ? next.trim() : null,
                            ...memberScope,
                          })
                        }
                        ariaLabel="Edit payment notes"
                      />
                    </td>
                    <td className="px-2 py-1.5 align-top text-right">
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="text-muted-foreground hover:text-destructive"
                        disabled={!canEditFile}
                        onClick={async () => {
                          await remove({ id: p._id, ...memberScope });
                        }}
                        aria-label="Delete payment"
                        title={
                          canEditFile
                            ? "Delete payment"
                            : VIEW_ONLY_ACCESS_TOOLTIP
                        }
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {/* ---- Add payment form ---- */}
          <form
            onSubmit={(e) => e.preventDefault()}
            className="mt-3 grid grid-cols-1 gap-2 rounded-md border border-dashed bg-muted/30 p-2 sm:grid-cols-[10rem_8rem_8rem_8rem_10rem_1fr_auto]"
          >
            <Input
              type="date"
              value={draftDate}
              disabled={!canEditFile}
              title={!canEditFile ? VIEW_ONLY_ACCESS_TOOLTIP : undefined}
              onChange={(e) => setDraftDate(e.target.value)}
              onKeyDown={(e) => advanceAddPaymentFieldOnEnter(e, grossInputRef)}
              aria-label="Payment date"
            />
            <Input
              ref={grossInputRef}
              inputMode="decimal"
              disabled={!canEditFile}
              title={!canEditFile ? VIEW_ONLY_ACCESS_TOOLTIP : undefined}
              placeholder={
                !canEditFile
                  ? VIEW_ONLY_FIELD_PLACEHOLDER
                  : suggestedAmount !== null
                    ? `Gross (e.g. ${suggestedAmount})`
                    : "Gross $"
              }
              value={draftGross}
              onChange={(e) => setDraftGross(e.target.value)}
              onKeyDown={(e) => advanceAddPaymentFieldOnEnter(e, netInputRef)}
              aria-label="Payment gross"
            />
            <Input
              ref={netInputRef}
              inputMode="decimal"
              disabled={!canEditFile}
              title={!canEditFile ? VIEW_ONLY_ACCESS_TOOLTIP : undefined}
              placeholder={
                !canEditFile ? VIEW_ONLY_FIELD_PLACEHOLDER : "Net $ (opt.)"
              }
              value={draftNet}
              onChange={(e) => setDraftNet(e.target.value)}
              onKeyDown={(e) =>
                advanceAddPaymentFieldOnEnter(e, methodSelectRef)
              }
              aria-label="Payment net"
            />
            <Select
              ref={methodSelectRef}
              value={draftMethod}
              disabled={!canEditFile}
              title={!canEditFile ? VIEW_ONLY_ACCESS_TOOLTIP : undefined}
              onChange={(e) => setDraftMethod(e.target.value)}
              onKeyDown={(e) =>
                advanceAddPaymentFieldOnEnter(e, paidByInputRef)
              }
              aria-label="Payment method"
            >
              <option value="">Method…</option>
              {PAYMENT_METHOD_PRESETS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </Select>
            <Input
              ref={paidByInputRef}
              placeholder={
                !canEditFile ? VIEW_ONLY_FIELD_PLACEHOLDER : "Paid by"
              }
              disabled={!canEditFile}
              title={!canEditFile ? VIEW_ONLY_ACCESS_TOOLTIP : undefined}
              value={draftPaidBy}
              onChange={(e) => setDraftPaidBy(e.target.value)}
              onKeyDown={(e) => advanceAddPaymentFieldOnEnter(e, notesInputRef)}
              aria-label="Payment payee"
            />
            <Input
              ref={notesInputRef}
              placeholder={
                !canEditFile ? VIEW_ONLY_FIELD_PLACEHOLDER : "Notes (optional)"
              }
              disabled={!canEditFile}
              title={!canEditFile ? VIEW_ONLY_ACCESS_TOOLTIP : undefined}
              value={draftNotes}
              onChange={(e) => setDraftNotes(e.target.value)}
              onKeyDown={(e) =>
                advanceAddPaymentFieldOnEnter(e, addPaymentButtonRef)
              }
              aria-label="Payment notes"
            />
            <Button
              ref={addPaymentButtonRef}
              type="button"
              size="sm"
              disabled={adding || !canEditFile}
              title={!canEditFile ? VIEW_ONLY_ACCESS_TOOLTIP : undefined}
              onClick={() => void submitAddPayment()}
            >
              <Plus className="h-3.5 w-3.5" />
              {adding ? "Adding…" : "Add payment"}
            </Button>
            {addError && (
              <p
                className="col-span-full text-xs text-destructive"
                role="alert"
              >
                {addError}
              </p>
            )}
            {suggestedAmount !== null && (
              <p className="col-span-full text-[11px] text-muted-foreground">
                Tip: monthly installment is{" "}
                <button
                  type="button"
                  className="font-medium underline decoration-dotted underline-offset-2"
                  onClick={() => setDraftGross(String(suggestedAmount))}
                >
                  {fmtMoney(suggestedAmount)}
                </button>
                .
              </p>
            )}
          </form>
        </div>
      </td>
    </tr>
  );
}
