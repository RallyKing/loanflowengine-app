"use client";

import { useCallback, useMemo, useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import {
  Sparkles,
  Search,
  Loader2,
  AlertCircle,
  CheckCircle2,
  XCircle,
  Link as LinkIcon,
  Phone,
  Mail,
  MapPin,
  DollarSign,
  RefreshCcw,
  Trash2,
  Copy,
  Download,
  FileJson,
  FileText,
  Globe,
  Check,
} from "lucide-react";
import {
  buildDiscoveryCandidatesCsv,
  buildDiscoveryCandidatesJson,
  buildDiscoveryCandidatesTsv,
} from "@/lib/export/discoveryCandidatesExport";
import { downloadTextFile } from "@/lib/export/downloadClient";
import { buildExportFilename } from "@/lib/export/exportFilename";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { Button } from "./ui/Button";
import { Input, Textarea } from "./ui/Input";
import { Badge } from "./ui/Badge";
import { cn } from "@/lib/cn";
import { useLiveConnection } from "@/lib/useLiveConnection";
import { LiveDataPausedNotice } from "@/components/LiveDataPausedNotice";
import { SettingsLink } from "@/components/SettingsLink";
import { useOrgConvexQueryArgs } from "@/lib/useOrgConvexQueryArgs";
import {
  CollapsibleCard,
  CollapsibleSection,
} from "@/components/CollapsibleSection";

const SUGGESTIONS: Array<{ label: string; query: string }> = [
  {
    label: "DSCR lenders for investor rentals",
    query:
      "Direct DSCR lenders for non-owner-occupied rental property investors, minimum loan $75K, nationwide or multi-state",
  },
  {
    label: "Fix & flip in Florida",
    query:
      "Direct hard money / fix-and-flip lenders lending in Florida on residential 1-4 unit, $100K to $2M loan size",
  },
  {
    label: "SBA 7(a) preferred lenders",
    query:
      "SBA 7(a) preferred / PLP direct lenders with strong small business programs under $5M",
  },
  {
    label: "Commercial bridge $5M+",
    query:
      "Direct commercial bridge lenders for $5M+ deals on multifamily, office, and mixed-use nationwide",
  },
  {
    label: "Equipment financing",
    query:
      "Direct equipment financing lenders that fund heavy equipment, transportation, and medical equipment",
  },
  {
    label: "Church / religious",
    query:
      "Direct lenders specializing in church and religious-organization financing across the US",
  },
  {
    label: "Cannabis-friendly",
    query:
      "Direct lenders that fund cannabis businesses or cannabis real estate (dispensaries, cultivation)",
  },
  {
    label: "Ground-up construction",
    query:
      "Direct ground-up construction lenders for multifamily and mixed-use projects under $25M",
  },
];

type Status = "pending" | "accepted" | "dismissed" | "duplicate";

export function DiscoverLenders() {
  const [query, setQuery] = useState("");
  const [maxResults, setMaxResults] = useState(10);
  const [running, setRunning] = useState(false);
  const [lastResult, setLastResult] = useState<
    | {
        inserted: number;
        duplicates: number;
        provider: string;
        warnings: string[];
      }
    | null
  >(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Status>("pending");

  const orgScope = useOrgConvexQueryArgs();

  const provider = useQuery(
    api.discovery.providerStatus,
    orgScope ?? "skip",
  );
  const listCandidatesQueryArgs = useMemo(
    () =>
      orgScope
        ? ({ ...orgScope, status: tab, limit: 200 as const })
        : null,
    [orgScope, tab],
  );
  const candidates = useQuery(
    api.discovery.listCandidates,
    listCandidatesQueryArgs ?? "skip",
  );
  const recentRuns = useQuery(
    api.discovery.recentRuns,
    orgScope ? { ...orgScope, limit: 8 } : "skip",
  );

  const runDiscovery = useAction(api.discovery.runDiscovery);
  const dismiss = useMutation(api.discovery.dismissCandidate);
  const accept = useMutation(api.discovery.acceptCandidate);
  const acceptMany = useMutation(api.discovery.acceptMany);
  const clearDismissed = useMutation(api.discovery.clearDismissed);
  const deleteCandidate = useMutation(api.discovery.deleteCandidate);

  const [selected, setSelected] = useState<Set<Id<"lenderCandidates">>>(
    new Set()
  );
  const [discoveryCopyState, setDiscoveryCopyState] = useState<
    "idle" | "ok" | "err"
  >("idle");
  const { canUseHub, browserOnline, actionTitle } = useLiveConnection();

  const hasKey = provider && (provider.openai || provider.perplexity);

  async function runSearch(e?: React.FormEvent) {
    e?.preventDefault();
    if (!query.trim()) return;
    if (!orgScope) {
      setError("Sign in and select a workspace to run discovery.");
      return;
    }
    setRunning(true);
    setError(null);
    setLastResult(null);
    try {
      const result = await runDiscovery({ ...orgScope, query, maxResults });
      setLastResult(result);
      setTab("pending");
      setSelected(new Set());
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setRunning(false);
    }
  }

  function toggleSelected(id: Id<"lenderCandidates">) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAllVisible() {
    if (!candidates) return;
    setSelected(new Set(candidates.map((c) => c._id)));
  }

  async function bulkAccept() {
    if (selected.size === 0 || !orgScope) return;
    await acceptMany({ ...orgScope, ids: Array.from(selected) });
    setSelected(new Set());
  }

  const discoveryExportRows = useMemo(() => candidates ?? [], [candidates]);

  const copyDiscoveryTsv = useCallback(async () => {
    if (discoveryExportRows.length === 0) return;
    try {
      await navigator.clipboard.writeText(
        buildDiscoveryCandidatesTsv(discoveryExportRows)
      );
      setDiscoveryCopyState("ok");
      window.setTimeout(() => setDiscoveryCopyState("idle"), 1800);
    } catch {
      setDiscoveryCopyState("err");
      window.setTimeout(() => setDiscoveryCopyState("idle"), 2400);
    }
  }, [discoveryExportRows]);

  const exportDiscoveryCsv = useCallback(() => {
    if (discoveryExportRows.length === 0) return;
    downloadTextFile(
      buildExportFilename("discovery-candidates", "csv", [tab]),
      buildDiscoveryCandidatesCsv(discoveryExportRows),
      "text/csv;charset=utf-8",
      { utf8Bom: true }
    );
  }, [discoveryExportRows, tab]);

  const exportDiscoveryJson = useCallback(() => {
    if (discoveryExportRows.length === 0) return;
    downloadTextFile(
      buildExportFilename("discovery-candidates", "json", [tab]),
      buildDiscoveryCandidatesJson(discoveryExportRows),
      "application/json;charset=utf-8",
      { utf8Bom: false }
    );
  }, [discoveryExportRows, tab]);

  return (
    <div className="space-y-6">
      {/* ---------- Search bar ---------- */}
      <CollapsibleCard
        defaultOpen
        title={
          <div className="flex items-start gap-3">
            <div className="shrink-0 rounded-lg bg-accent p-2 text-accent-foreground">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-foreground">
                AI Lender Discovery
              </h2>
              <p className="text-sm text-muted-foreground">
                Describe the kind of direct lender you need. The system will
                search the live web, extract structured details, and stage them
                for your review before adding to the database.
              </p>
            </div>
          </div>
        }
      >
        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
          <LiveDataPausedNotice
            scope="discover"
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

        {provider && !hasKey && (
          <div className="mt-4 flex gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950/50 dark:text-amber-200">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <div>
              <div className="font-medium">No AI search API key configured</div>
              <div className="mt-1 text-xs">
                From the <code className="rounded bg-background/70 px-1">lender-app</code> directory run one of:
              </div>
              <pre className="mt-1 overflow-x-auto rounded bg-background/70 p-2 text-xs">
npx convex env set OPENAI_API_KEY sk-...
{"\n"}npx convex env set PERPLEXITY_API_KEY pplx-...
              </pre>
            </div>
          </div>
        )}

        <form onSubmit={runSearch} className="mt-4 space-y-3">
          <Textarea
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="e.g. Direct DSCR lenders nationwide for investor rentals, min loan $100K"
            rows={2}
            disabled={running || !hasKey}
          />
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 text-sm">
              <label htmlFor="maxResults" className="text-muted-foreground">
                Max results
              </label>
              <Input
                id="maxResults"
                type="number"
                min={1}
                max={25}
                value={maxResults}
                onChange={(e) =>
                  setMaxResults(Math.max(1, Math.min(25, Number(e.target.value) || 10)))
                }
                className="w-20"
                disabled={running || !hasKey}
              />
            </div>
            <div className="flex-1" />
            <Button
              type="submit"
              disabled={running || !query.trim() || !hasKey || !canUseHub}
              title={actionTitle(
                "Run AI web discovery and stage lenders for review"
              )}
            >
              {running ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Searching the web…
                </>
              ) : (
                <>
                  <Search className="h-4 w-4" /> Run discovery
                </>
              )}
            </Button>
          </div>
        </form>

        {/* Suggestions */}
        {hasKey && !running && (
          <div className="mt-4 flex flex-wrap gap-2">
            {SUGGESTIONS.map((s) => (
              <button
                key={s.label}
                type="button"
                onClick={() => setQuery(s.query)}
                className="rounded-full border bg-background px-3 py-1 text-xs transition-colors hover:bg-muted"
              >
                {s.label}
              </button>
            ))}
          </div>
        )}

        {/* Run feedback */}
        {lastResult && (
          <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
            <Badge variant="accent" className="gap-1">
              <CheckCircle2 className="h-3 w-3" />
              {lastResult.inserted} new candidate{lastResult.inserted === 1 ? "" : "s"}
            </Badge>
            {lastResult.duplicates > 0 && (
              <Badge className="gap-1">
                <Copy className="h-3 w-3" /> {lastResult.duplicates} duplicate{lastResult.duplicates === 1 ? "" : "s"} skipped
              </Badge>
            )}
            <span className="text-xs text-muted-foreground">
              via {lastResult.provider}
            </span>
          </div>
        )}
        {error && (
          <div
            className="mt-4 flex gap-2 rounded-lg border border-destructive/30 bg-destructive/[0.08] p-3 text-sm text-destructive"
            role="alert"
          >
            <AlertCircle className="h-4 w-4 shrink-0" />
            <div className="whitespace-pre-wrap break-words">{error}</div>
          </div>
        )}
      </CollapsibleCard>

      {/* ---------- Review queue ---------- */}
      <CollapsibleSection
        defaultOpen
        className="shadow-sm"
        title={
          <span className="text-sm font-semibold text-foreground normal-case">
            Review queue
          </span>
        }
        description="Accept to add to the database, dismiss to hide, or edit inline."
      >
        <div className="flex flex-wrap items-center justify-end gap-3 border-b border-border/60 pb-3">
          <div className="flex items-center gap-1 rounded-lg bg-muted p-1 text-xs">
            {(["pending", "duplicate", "accepted", "dismissed"] as Status[]).map((t) => (
              <button
                key={t}
                onClick={() => {
                  setTab(t);
                  setSelected(new Set());
                }}
                className={cn(
                  "rounded-md px-3 py-1 capitalize transition-colors",
                  tab === t
                    ? "bg-background shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {t}
              </button>
            ))}
          </div>
          {candidates && candidates.length > 0 && (
            <div className="flex flex-wrap items-center gap-1">
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-8 gap-1 text-xs"
                onClick={() => void copyDiscoveryTsv()}
                title="Copy visible candidates as TSV"
              >
                {discoveryCopyState === "ok" ? (
                  <Check className="h-3.5 w-3.5" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
                {discoveryCopyState === "ok"
                  ? "Copied"
                  : discoveryCopyState === "err"
                    ? "Copy failed"
                    : "Copy TSV"}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-8 gap-1 text-xs"
                onClick={exportDiscoveryCsv}
                title="Download visible tab as CSV"
              >
                <Download className="h-3.5 w-3.5" />
                CSV
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-8 gap-1 text-xs"
                onClick={exportDiscoveryJson}
                title="Download visible tab as JSON"
              >
                <FileJson className="h-3.5 w-3.5" />
                JSON
              </Button>
            </div>
          )}
        </div>

        {tab === "pending" && candidates && candidates.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 border-b py-3">
            <Button size="sm" variant="outline" onClick={selectAllVisible}>
              Select all ({candidates.length})
            </Button>
            <Button size="sm" variant="outline" onClick={() => setSelected(new Set())}>
              Clear
            </Button>
            <div className="flex-1" />
            <Button
              size="sm"
              onClick={bulkAccept}
              disabled={selected.size === 0 || !canUseHub}
              title={actionTitle("Add selected candidates to the lender database")}
            >
              <CheckCircle2 className="h-4 w-4" /> Accept {selected.size} selected
            </Button>
          </div>
        )}

        {tab === "dismissed" && candidates && candidates.length > 0 && (
          <div className="flex items-center justify-end border-b py-3">
            <Button
              size="sm"
              variant="outline"
              onClick={() => orgScope && clearDismissed(orgScope)}
              disabled={!canUseHub}
              title={actionTitle(
                "Permanently remove dismissed items from the discovery queue"
              )}
            >
              <Trash2 className="h-4 w-4" /> Purge dismissed
            </Button>
          </div>
        )}

        <div className="space-y-3 pt-3">
          {candidates === undefined && (
            <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </div>
          )}
          {candidates && candidates.length === 0 && (
            <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
              {tab === "pending"
                ? "No pending candidates. Run a discovery search above to populate the queue."
                : `No ${tab} candidates.`}
            </div>
          )}
          {candidates?.map((c) => (
            <CandidateCard
              key={c._id}
              candidate={c}
              tab={tab}
              selected={selected.has(c._id)}
              onToggleSelected={() => toggleSelected(c._id)}
              onAccept={() => orgScope && accept({ ...orgScope, id: c._id })}
              onDismiss={() => orgScope && dismiss({ ...orgScope, id: c._id })}
              onDelete={() => orgScope && deleteCandidate({ ...orgScope, id: c._id })}
              canUseHub={canUseHub}
              actionTitle={actionTitle}
            />
          ))}
        </div>
      </CollapsibleSection>

      {/* ---------- History ---------- */}
      {recentRuns && recentRuns.length > 0 && (
        <CollapsibleSection
          className="shadow-sm"
          defaultOpen={false}
          title={
            <span className="text-sm font-semibold text-foreground normal-case">
              Recent discovery runs
            </span>
          }
          description="Past search queries and how many candidates each one returned."
        >
          <div className="space-y-1.5 text-sm">
            {recentRuns.map((r) => (
              <div
                key={r._id}
                className="flex items-center gap-2 rounded-md px-2 py-1 hover:bg-muted"
              >
                <RefreshCcw className="h-3 w-3 shrink-0 text-muted-foreground" />
                <span className="flex-1 truncate">{r.query}</span>
                <Badge variant="accent">+{r.candidatesFound}</Badge>
                {r.duplicatesSkipped > 0 && (
                  <span className="text-xs text-muted-foreground">
                    {r.duplicatesSkipped} dup
                  </span>
                )}
                <span className="whitespace-nowrap text-xs text-muted-foreground">
                  {new Date(r.createdAt).toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        </CollapsibleSection>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function CandidateCard({
  candidate,
  tab,
  selected,
  onToggleSelected,
  onAccept,
  onDismiss,
  onDelete,
  canUseHub,
  actionTitle,
}: {
  candidate: Doc<"lenderCandidates">;
  tab: Status;
  selected: boolean;
  onToggleSelected: () => void;
  onAccept: () => void;
  onDismiss: () => void;
  onDelete: () => void;
  canUseHub: boolean;
  actionTitle: (whenConnected: string) => string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(candidate);
  const orgScope = useOrgConvexQueryArgs();
  const updateCandidate = useMutation(api.discovery.updateCandidate);

  // Re-sync when a newer candidate doc comes in from the server
  if (!editing && draft._id !== candidate._id) {
    setDraft(candidate);
  }

  async function save() {
    if (!orgScope) return;
    await updateCandidate({
      ...orgScope,
      id: candidate._id,
      patch: {
        company: draft.company,
        website: draft.website,
        contactName: draft.contactName,
        phone: draft.phone,
        email: draft.email,
        entityType: draft.entityType,
        primaryNiche: draft.primaryNiche,
        programs: draft.programs,
        propertyTypes: draft.propertyTypes,
        statesServed: draft.statesServed,
        fundingAmountMin: draft.fundingAmountMin,
        fundingAmountMax: draft.fundingAmountMax,
        notes: draft.notes,
        sourceUrl: draft.sourceUrl,
      },
    });
    setEditing(false);
  }

  const confidencePct = Math.round((candidate.confidence ?? 0.5) * 100);
  const confidenceColor =
    confidencePct >= 75
      ? "bg-green-100 text-green-900 dark:bg-green-950/60 dark:text-green-200"
      : confidencePct >= 50
      ? "bg-accent text-accent-foreground"
      : "bg-amber-100 text-amber-900 dark:bg-amber-950/60 dark:text-amber-200";

  return (
    <div
      className={cn(
        "rounded-lg border bg-background p-4 transition-colors",
        selected && "border-accent-foreground/60 ring-1 ring-accent-foreground/30"
      )}
    >
      <div className="flex items-start gap-3">
        {tab === "pending" && (
          <input
            type="checkbox"
            className="mt-1.5 h-4 w-4"
            checked={selected}
            onChange={onToggleSelected}
          />
        )}
        <div className="flex-1 min-w-0">
          {/* Title row */}
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              {editing ? (
                <Input
                  value={draft.company}
                  onChange={(e) =>
                    setDraft({ ...draft, company: e.target.value })
                  }
                  className="text-base font-semibold"
                />
              ) : (
                <div className="truncate text-base font-semibold">
                  {candidate.company}
                </div>
              )}
              <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                {candidate.entityType && (
                  <span>{candidate.entityType}</span>
                )}
                {candidate.website && !editing && (
                  <a
                    href={
                      candidate.website.startsWith("http")
                        ? candidate.website
                        : `https://${candidate.website}`
                    }
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 hover:underline"
                  >
                    <Globe className="h-3 w-3" /> {stripHttp(candidate.website)}
                  </a>
                )}
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-[10px] font-medium",
                  confidenceColor
                )}
                title={`Model confidence ${confidencePct}%`}
              >
                {confidencePct}% conf.
              </span>
            </div>
          </div>

          {/* Contact row */}
          {(candidate.contactName ||
            candidate.phone ||
            candidate.email) && (
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
              {candidate.contactName && <span>{candidate.contactName}</span>}
              {candidate.phone && (
                <span className="inline-flex items-center gap-1">
                  <Phone className="h-3 w-3 text-muted-foreground" />
                  {candidate.phone}
                </span>
              )}
              {candidate.email && (
                <span className="inline-flex items-center gap-1">
                  <Mail className="h-3 w-3 text-muted-foreground" />
                  {candidate.email}
                </span>
              )}
            </div>
          )}

          {/* Data row */}
          {!editing && (
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
              {(candidate.fundingAmountMin || candidate.fundingAmountMax) && (
                <span className="inline-flex items-center gap-1">
                  <DollarSign className="h-3 w-3 text-muted-foreground" />
                  {candidate.fundingAmountMin || "—"} → {candidate.fundingAmountMax || "—"}
                </span>
              )}
              {candidate.statesServed && (
                <span className="inline-flex items-center gap-1">
                  <MapPin className="h-3 w-3 text-muted-foreground" />
                  {truncate(candidate.statesServed, 60)}
                </span>
              )}
              {candidate.programs && (
                <span className="inline-flex items-center gap-1 text-muted-foreground">
                  <FileText className="h-3 w-3" />
                  {truncate(candidate.programs, 80)}
                </span>
              )}
            </div>
          )}
          {!editing && candidate.primaryNiche && (
            <div className="mt-1 text-xs text-muted-foreground">
              {candidate.primaryNiche}
            </div>
          )}
          {!editing && candidate.notes && (
            <div className="mt-2 rounded-md bg-muted px-3 py-2 text-xs leading-relaxed">
              {candidate.notes}
            </div>
          )}
          {!editing && candidate.sourceUrl && (
            <a
              href={candidate.sourceUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-2 inline-flex items-center gap-1 text-xs text-muted-foreground hover:underline"
            >
              <LinkIcon className="h-3 w-3" /> {truncate(candidate.sourceUrl, 90)}
            </a>
          )}

          {/* Edit form */}
          {editing && (
            <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2">
              <EditField
                label="Website"
                value={draft.website}
                onChange={(v) => setDraft({ ...draft, website: v })}
              />
              <EditField
                label="Contact"
                value={draft.contactName}
                onChange={(v) => setDraft({ ...draft, contactName: v })}
              />
              <EditField
                label="Phone"
                value={draft.phone}
                onChange={(v) => setDraft({ ...draft, phone: v })}
              />
              <EditField
                label="Email"
                value={draft.email}
                onChange={(v) => setDraft({ ...draft, email: v })}
              />
              <EditField
                label="Entity Type"
                value={draft.entityType}
                onChange={(v) => setDraft({ ...draft, entityType: v })}
              />
              <EditField
                label="Primary Niche"
                value={draft.primaryNiche}
                onChange={(v) => setDraft({ ...draft, primaryNiche: v })}
              />
              <EditField
                label="Programs"
                value={draft.programs}
                onChange={(v) => setDraft({ ...draft, programs: v })}
              />
              <EditField
                label="Property Types"
                value={draft.propertyTypes}
                onChange={(v) => setDraft({ ...draft, propertyTypes: v })}
              />
              <EditField
                label="States"
                value={draft.statesServed}
                onChange={(v) => setDraft({ ...draft, statesServed: v })}
              />
              <EditField
                label="Loan Min"
                value={draft.fundingAmountMin}
                onChange={(v) => setDraft({ ...draft, fundingAmountMin: v })}
              />
              <EditField
                label="Loan Max"
                value={draft.fundingAmountMax}
                onChange={(v) => setDraft({ ...draft, fundingAmountMax: v })}
              />
              <EditField
                label="Source URL"
                value={draft.sourceUrl}
                onChange={(v) => setDraft({ ...draft, sourceUrl: v })}
              />
              <div className="md:col-span-2">
                <label className="text-xs font-medium text-muted-foreground">
                  Notes
                </label>
                <Textarea
                  value={draft.notes}
                  onChange={(e) =>
                    setDraft({ ...draft, notes: e.target.value })
                  }
                  rows={3}
                />
              </div>
            </div>
          )}

          {/* Duplicate info */}
          {tab === "duplicate" && candidate.duplicateOfLenderId && (
            <div className="mt-2 text-xs text-muted-foreground">
              Already in your database. Accepting will refresh the existing
              record with any new details.
            </div>
          )}

          {/* Action row */}
          <div className="mt-3 flex flex-wrap gap-2">
            {editing ? (
              <>
                <Button
                  size="sm"
                  onClick={save}
                  disabled={!canUseHub}
                  title={actionTitle("Save edits to this staged candidate")}
                >
                  Save
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setDraft(candidate);
                    setEditing(false);
                  }}
                >
                  Cancel
                </Button>
              </>
            ) : (
              <>
                {tab !== "accepted" && (
                  <Button
                    size="sm"
                    onClick={onAccept}
                    disabled={!canUseHub}
                    title={actionTitle(
                      "Add or merge this candidate into the lender list"
                    )}
                  >
                    <CheckCircle2 className="h-4 w-4" />{" "}
                    {tab === "duplicate" ? "Accept (refresh)" : "Accept"}
                  </Button>
                )}
                {tab === "pending" || tab === "duplicate" ? (
                  <>
                    <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
                      Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={onDismiss}
                      disabled={!canUseHub}
                      title={actionTitle(
                        "Hide this candidate without adding to the database"
                      )}
                    >
                      <XCircle className="h-4 w-4" /> Dismiss
                    </Button>
                  </>
                ) : null}
                {tab === "dismissed" && (
                  <Button
                    size="sm"
                    variant="danger"
                    onClick={onDelete}
                    disabled={!canUseHub}
                    title={actionTitle("Delete this candidate row permanently")}
                  >
                    <Trash2 className="h-4 w-4" /> Delete
                  </Button>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function EditField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="text-xs">
      <span className="font-medium text-muted-foreground">{label}</span>
      <Input
        className="mt-1"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

function stripHttp(u: string): string {
  return u.replace(/^https?:\/\//, "").replace(/\/$/, "");
}
