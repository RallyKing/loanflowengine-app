"use client";

import { useEffect, useMemo, useState } from "react";
import { useAction, useConvex, useMutation, useQueries, useQuery, type RequestForQueries } from "convex/react";
import { Filter, Database, Download, Sparkles, Wand2 } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { Input, Select } from "./ui/Input";
import { SearchField } from "./ui/SearchField";
import { Button } from "./ui/Button";
import { Badge } from "./ui/Badge";
import { Stars } from "./ui/Stars";
import { LenderDrawer } from "./LenderDrawer";
import { ResizableTextBlock } from "./ResizableTextBlock";
import { BrowseFiltersPanel, buildListQueryArgs, emptyBrowseFilterForm, formToListArgs, presetDocToAdvancedForm, type BrowseFilterForm, } from "./BrowseFiltersPanel";
import { buildLenderCsv } from "@/lib/csv";
import { downloadBlob } from "@/lib/export/downloadClient";
import { buildExportFilename } from "@/lib/export/exportFilename";
import type { Lender } from "@/lib/schema";
import { cn } from "@/lib/cn";
import { dataTableClassNames } from "@/lib/dataTableClasses";
import { useUserSettings } from "@/lib/userSettingsContext";
import { useLiveConnection } from "@/lib/useLiveConnection";
import { browseListNeedsFullScan } from "@/lib/browseListMode";
import { LiveDataPausedNotice } from "@/components/LiveDataPausedNotice";
import { SettingsLink } from "@/components/SettingsLink";
import { emptyQueryArgs } from "@/lib/convexQueryArgs";
import { useOrgConvexQueryArgs } from "@/lib/useOrgConvexQueryArgs";
import { appendPriorityDebugClientLog } from "@/lib/debugClientLog";

type Row = {
  _id: Id<"lenders">;
  company: string;
  contactName: string;
  phone: string;
  email: string;
  entityType: string;
  primaryNiche: string;
  programs: string;
  statesServed: string;
  fundingAmountMin: string;
  fundingAmountMax: string;
  section: string;
  status: string;
  notes: string;
  lastUpdated: string;
  rating?: number;
};

type LenderTableProps = {
  /**
   * Controlled quick-search (programs, company, contact, states…).
   * When both are set, the table uses them instead of internal state.
   */
  quickSearch?: string;
  onQuickSearchChange?: (value: string) => void;
  /** Hide the search field row when the parent supplies a unified search bar. */
  hideQuickSearchField?: boolean;
  /** Open this lender's drawer on load (e.g. global search deep link). */
  initialOpenLenderId?: Id<"lenders"> | null;
};

export function LenderTable({
  quickSearch: controlledQuickSearch,
  onQuickSearchChange,
  hideQuickSearchField = false,
  initialOpenLenderId = null,
}: LenderTableProps = {}) {
  const { settings } = useUserSettings();
  const [internalSearch, setInternalSearch] = useState("");
  const controlled =
    controlledQuickSearch !== undefined && onQuickSearchChange !== undefined;
  const search = controlled ? controlledQuickSearch : internalSearch;
  const setSearch = controlled ? onQuickSearchChange : setInternalSearch;
  const [entityType, setEntityType] = useState("");
  const [section, setSection] = useState("");
  const [advForm, setAdvForm] = useState<BrowseFilterForm>(emptyBrowseFilterForm);
  const [selected, setSelected] = useState<Id<"lenders"> | null>(null);

  useEffect(() => {
    if (!initialOpenLenderId) return;
    setSelected(initialOpenLenderId);
  }, [initialOpenLenderId]);

  const listQueryArgs = useMemo(
    () => buildListQueryArgs(search, entityType, section, advForm),
    [search, entityType, section, advForm]
  );

  const fullScan = useMemo(
    () => browseListNeedsFullScan(search, entityType, section, advForm),
    [search, entityType, section, advForm]
  );

  /** For full-text / smart filters, scan in chunks; max lines up with `lenders.list` cap. */
  const LIST_CAP = 10_000;
  const [fullScanPageSize, setFullScanPageSize] = useState(500);
  useEffect(() => {
    setFullScanPageSize(500);
  }, [search, entityType, section, advForm]);

  const orgScope = useOrgConvexQueryArgs();

  const statsQueries = useMemo((): RequestForQueries => {
    if (!orgScope) return {};
    return {
      lenderStats: {
        query: api.lenders.stats,
        args: {
          organizationId: orgScope.organizationId,
          memberUserKey: orgScope.memberUserKey,
        },
      },
    };
  }, [orgScope]);

  const statsQueryResults = useQueries(statsQueries);
  const statsRaw = orgScope ? statsQueryResults.lenderStats : undefined;
  const statsError = statsRaw instanceof Error ? statsRaw : null;
  /** `undefined` = loading or no org; `null` = query failed; else payload */
  const stats =
    statsRaw instanceof Error
      ? null
      : statsRaw === undefined
        ? undefined
        : statsRaw;

  useEffect(() => {
    if (!statsError) return;
    appendPriorityDebugClientLog({
      sessionId: "f25461",
      runId: "lenders-stats",
      hypothesisId: "H_lenders_stats_useQuery_throw",
      location: "LenderTable.tsx:lenderStats",
      message: statsError.message,
      data: {
        name: statsError.name,
        stack: statsError.stack?.slice(0, 500) ?? null,
      },
      timestamp: Date.now(),
    });
  }, [statsError]);

  const listQueryArgsForTable = useMemo(() => {
    const base = fullScan
      ? { ...listQueryArgs, limit: fullScanPageSize }
      : { ...listQueryArgs, limit: LIST_CAP };
    if (!orgScope) return null;
    return { ...base, ...orgScope };
  }, [fullScan, listQueryArgs, fullScanPageSize, orgScope]);

  const listResult = useQuery(
    api.lenders.list,
    listQueryArgsForTable ?? "skip"
  ) as Row[] | undefined;

  const lenders: Row[] | undefined = listResult;

  const listLoading = listResult === undefined;

  const canLoadMoreFull =
    fullScan &&
    (listResult?.length ?? 0) === fullScanPageSize &&
    fullScanPageSize < LIST_CAP;

  const atBrowseCap =
    !fullScan &&
    stats != null &&
    listResult != null &&
    listResult.length >= LIST_CAP &&
    stats.total > listResult.length;

  const convex = useConvex();
  const [exporting, setExporting] = useState(false);

  const entityOptions = useMemo<string[]>(
    () =>
      stats
        ? (stats.byEntity as Array<[string, number]>).map(([k]) => k)
        : [],
    [stats]
  );
  const sectionOptions = useMemo<string[]>(
    () =>
      stats
        ? (stats.bySection as Array<[string, number]>).map(([k]) => k)
        : [],
    [stats]
  );

  const createFilterPreset = useMutation(api.savedFilterLists.createPreset);
  const normalizeAll = useMutation(api.lenders.normalizeAll);
  const [normalizing, setNormalizing] = useState(false);
  const [normalizeMsg, setNormalizeMsg] = useState<string | null>(null);

  const enrichMissing = useAction(api.enrich.enrichMissing);
  const [enriching, setEnriching] = useState(false);
  const [enrichMsg, setEnrichMsg] = useState<string | null>(null);
  const { canUseHub, browserOnline, actionTitle } = useLiveConnection();

  const hasSmartFilter = useMemo(
    () => Object.values(formToListArgs(advForm)).some((v) => v != null),
    [advForm]
  );

  async function handleExport() {
    if (exporting) return;
    if (!orgScope) return;
    if (stats != null && stats.total === 0) return;
    setExporting(true);
    try {
      const rows = (await convex.query(api.lenders.list, {
        ...orgScope,
        ...listQueryArgs,
        limit: LIST_CAP,
      })) as Row[];
      if (!rows || rows.length === 0) return;
      const csv = buildLenderCsv(rows as unknown as Lender[]);
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const tags = [
        search.trim() ? "search" : "",
        entityType ? "entity" : "",
        section ? "section" : "",
        hasSmartFilter ? "smart" : "",
      ].filter(Boolean);
      downloadBlob(
        blob,
        buildExportFilename("lenders", "csv", tags.length ? tags : ["all"])
      );
    } finally {
      setExporting(false);
    }
  }

  async function saveAsPreset(name: string) {
    if (!orgScope) {
      window.alert("Select an organization to save filter presets.");
      return;
    }
    const adv = formToListArgs(advForm);
    await createFilterPreset({
      ...orgScope,
      name,
      search: search.trim() || undefined,
      entityType: entityType || undefined,
      section: section || undefined,
      ...adv,
    });
  }

  function applySavedPreset(p: Doc<"savedFilterPresets">) {
    setSearch(p.search ?? "");
    setEntityType(p.entityType ?? "");
    setSection(p.section ?? "");
    setAdvForm(presetDocToAdvancedForm(p));
  }

  async function handleEnrichMissing() {
    if (enriching) return;
    if (stats == null) return;
    const batch = Math.min(stats.incompleteCount, 10);
    if (batch <= 0) {
      setEnrichMsg("No lenders are missing core info. Good job!");
      return;
    }
    if (
      !confirm(
        `Run AI web search on ${batch} lender${batch === 1 ? "" : "s"} that are missing core info (programs / niche)? Each call hits the LLM and may take 1–2 minutes total.`
      )
    )
      return;
    setEnriching(true);
    setEnrichMsg(null);
    try {
      const res = await enrichMissing({ limit: batch });
      setEnrichMsg(
        `Processed ${res.total} · Filled ${res.filled} new fields · ${res.succeeded} ok / ${res.failed} failed`
      );
    } catch (err) {
      setEnrichMsg(err instanceof Error ? `Failed: ${err.message}` : "Failed");
    } finally {
      setEnriching(false);
    }
  }

  async function handleNormalize() {
    if (normalizing) return;
    if (
      !confirm(
        "Run canonical formatting across every lender? This rewrites phone, email, website and state formatting — safe to run more than once."
      )
    )
      return;
    setNormalizing(true);
    setNormalizeMsg(null);
    try {
      const res = await normalizeAll(emptyQueryArgs);
      setNormalizeMsg(
        `Examined ${res.examined.toLocaleString()} · Updated ${res.changed.toLocaleString()}`
      );
    } catch (err) {
      setNormalizeMsg(
        err instanceof Error ? `Failed: ${err.message}` : "Failed"
      );
    } finally {
      setNormalizing(false);
    }
  }

  return (
    <div className="min-w-0 space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <LiveDataPausedNotice
          scope="browse"
          canUseHub={canUseHub}
          browserOnline={browserOnline}
          className="min-w-0 flex-1"
        />
        <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 self-start">
          <SettingsLink
            section="data"
            className="text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            Data preferences
          </SettingsLink>
          <SettingsLink
            section="layout"
            className="text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            Table layout
          </SettingsLink>
        </div>
      </div>
      <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        {!hideQuickSearchField && (
          <SearchField
            containerClassName="w-full sm:min-w-[200px] sm:max-w-md sm:flex-1"
            placeholder="Search programs (e.g. DSCR, SBA 7a, fix & flip), company, contact, states…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        )}
        <div className="flex w-full min-w-0 flex-col gap-2 sm:w-auto sm:max-w-none sm:flex-row sm:items-center sm:gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <Filter
              className="h-4 w-4 shrink-0 text-muted-foreground"
              aria-hidden
            />
            <Select
              value={entityType}
              onChange={(e) => setEntityType(e.target.value)}
              className="min-w-0 w-full sm:w-56"
            >
              <option value="">All entity types</option>
              {entityOptions.map((e: string) => (
                <option key={e} value={e}>
                  {e}
                </option>
              ))}
            </Select>
          </div>
          <Select
            value={section}
            onChange={(e) => setSection(e.target.value)}
            className="min-w-0 w-full sm:w-44"
          >
            <option value="">All sections</option>
            {sectionOptions.map((s: string) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex w-full min-w-0 items-center gap-2 text-sm text-muted-foreground sm:w-auto">
          <Database className="h-4 w-4 shrink-0" aria-hidden />
          {statsError ? (
            <span className="text-destructive" title={statsError.message}>
              Could not load lender counts
            </span>
          ) : stats ? (
            <span>
              <strong className="text-foreground">{stats.total}</strong> lenders
              {lenders && lenders.length !== stats.total
                ? ` · ${lenders.length} shown`
                : ""}
            </span>
          ) : (
            <span>Loading…</span>
          )}
        </div>
        <div className="flex w-full min-w-0 flex-wrap items-center gap-2 sm:ml-auto sm:w-auto sm:justify-end">
          <Button
            variant="outline"
            size="sm"
            onClick={handleEnrichMissing}
            disabled={enriching || stats == null || !canUseHub}
            title={actionTitle(
              statsError
                ? "Lender counts unavailable"
                : stats != null
                  ? `AI web-search up to 10 lenders that are missing programs or niche (${stats.incompleteCount} total incomplete).`
                  : "Loading…",
            )}
          >
            <Wand2 className="h-4 w-4" />
            {enriching
              ? "Enriching…"
              : `Enrich Missing${
                  stats != null && stats.incompleteCount > 0
                    ? ` (${stats.incompleteCount})`
                    : ""
                }`}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleNormalize}
            disabled={normalizing || !canUseHub}
            title={actionTitle(
              "Re-format phone, email, website, and state fields across every lender"
            )}
          >
            <Sparkles className="h-4 w-4" />
            {normalizing ? "Cleaning…" : "Uniform data"}
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={() => void handleExport()}
            disabled={exporting || stats == null || stats.total === 0}
            title={
              stats == null || stats.total === 0
                ? "Nothing to export"
                : "Download up to 2,000 lenders matching current filters as CSV"
            }
          >
            <Download className="h-4 w-4" />
            {exporting ? "Preparing…" : "Export CSV"}
          </Button>
        </div>
      </div>

      {statsError ? (
        <div
          role="alert"
          className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive"
        >
          Lender statistics failed to load: {statsError.message}. The table may
          still show rows; filters that depend on counts may be limited.
        </div>
      ) : null}

      <BrowseFiltersPanel
        form={advForm}
        onChange={setAdvForm}
        onApplyPreset={applySavedPreset}
        onSaveAsPreset={saveAsPreset}
      />

      {normalizeMsg && (
        <div className="rounded-md border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          {normalizeMsg}
        </div>
      )}
      {enrichMsg && (
        <div className="rounded-md border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          {enrichMsg}
        </div>
      )}

      <div className="overflow-hidden rounded-xl border bg-background shadow-sm">
        <div className="max-h-[70vh] overflow-auto">
          <table
            className={dataTableClassNames(
              settings.tableDensity,
              "w-full text-sm"
            )}
          >
            <thead className="sticky top-0 z-[1] bg-muted text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left">Rating</th>
                <th className="px-3 py-2 text-left">Company</th>
                <th className="px-3 py-2 text-left">Contact</th>
                <th className="px-3 py-2 text-left">Entity Type</th>
                <th className="min-w-[14rem] max-w-[32rem] px-3 py-2 text-left">
                  Primary Niche
                </th>
                <th className="px-3 py-2 text-left">Loan Size</th>
                <th className="px-3 py-2 text-left">States</th>
                <th className="px-3 py-2 text-left">Updated</th>
              </tr>
            </thead>
            <tbody>
              {listLoading && (
                <tr>
                  <td colSpan={8} className="px-3 py-8 text-center text-muted-foreground">
                    Loading lenders…
                  </td>
                </tr>
              )}
              {!listLoading && lenders && lenders.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-3 py-12 text-center">
                    <div className="text-muted-foreground">
                      No lenders match your filters.
                      {stats && stats.total === 0 && (
                        <div className="mt-3 text-sm">
                          The database is empty — add lenders via the{" "}
                          <a className="underline" href="/lenders?tab=add">
                            Add Lender
                          </a>{" "}
                          or{" "}
                          <a className="underline" href="/lenders?tab=upload">
                            Upload CSV
                          </a>{" "}
                          pages.
                        </div>
                      )}
                    </div>
                  </td>
                </tr>
              )}
              {!listLoading &&
                lenders?.map((r) => (
                <tr
                  key={r._id}
                  onClick={() => setSelected(r._id)}
                  className={cn(
                    "cursor-pointer border-t align-top hover:bg-muted/60",
                    selected === r._id && "bg-accent/40"
                  )}
                >
                  <td className="px-3 py-2.5">
                    <Stars value={r.rating ?? 0} size="sm" readOnly />
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="font-medium">{r.company}</div>
                    {r.status && (
                      <Badge variant="warning" className="mt-1">
                        {r.status.length > 60
                          ? r.status.slice(0, 60) + "…"
                          : r.status}
                      </Badge>
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    <div>{r.contactName}</div>
                    <div className="text-xs text-muted-foreground">
                      {r.phone}
                      {r.phone && r.email ? " · " : ""}
                      {r.email}
                    </div>
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex flex-wrap gap-1">
                      {r.entityType
                        .split(";")
                        .slice(0, 2)
                        .map((e) => (
                          <Badge key={e} variant="accent">
                            {e.trim()}
                          </Badge>
                        ))}
                    </div>
                  </td>
                  <td className="px-3 py-2.5 align-top text-left">
                    <ResizableTextBlock text={r.primaryNiche} />
                  </td>
                  <td className="px-3 py-2.5 whitespace-nowrap">
                    {r.fundingAmountMin || r.fundingAmountMax
                      ? `${r.fundingAmountMin || "—"} → ${r.fundingAmountMax || "—"}`
                      : ""}
                  </td>
                  <td className="min-w-[8rem] max-w-[20rem] px-3 py-2.5 align-top">
                    {r.statesServed && r.statesServed.length > 100 ? (
                      <ResizableTextBlock
                        text={r.statesServed}
                        className="!h-24 !min-h-[2.5rem] text-[11px] leading-snug"
                      />
                    ) : (
                      <div
                        className="text-xs break-words text-muted-foreground"
                        title={r.statesServed}
                      >
                        {r.statesServed || "—"}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2.5 whitespace-nowrap text-muted-foreground">
                    {r.lastUpdated}
                  </td>
                </tr>
              ))}
              {!listLoading && canLoadMoreFull && (
                <tr>
                  <td
                    colSpan={8}
                    className="border-t bg-muted/20 px-3 py-3 text-center"
                  >
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setFullScanPageSize((n) =>
                          Math.min(n + 1_000, LIST_CAP)
                        );
                      }}
                    >
                      Load more
                    </Button>
                  </td>
                </tr>
              )}
              {!listLoading && atBrowseCap && (
                <tr>
                  <td
                    colSpan={8}
                    className="border-t bg-amber-50/80 px-3 py-3 text-center text-xs text-amber-900 dark:bg-amber-950/30 dark:text-amber-100"
                  >
                    Showing the first {LIST_CAP.toLocaleString()} lenders
                    {stats?.total != null
                      ? ` of ${stats.total.toLocaleString()} in the database`
                      : ""}
                    . Use search or filters to narrow the set.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <LenderDrawer
        id={selected}
        onClose={() => setSelected(null)}
        onLenderReplaced={(keepId) => setSelected(keepId)}
      />
    </div>
  );
}
