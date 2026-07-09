"use client";

import { useMemo, useState, useEffect, useCallback } from "react";
import { useQuery } from "convex/react";
import {
  Search,
  MapPin,
  DollarSign,
  CheckCircle2,
  AlertTriangle,
  Sparkles,
  RotateCcw,
  Target,
  Phone,
  Mail,
  Building2,
  Copy,
  Download,
  FileJson,
  Check,
} from "lucide-react";
import {
  buildScenarioResultsCsv,
  buildScenarioResultsJson,
  buildScenarioResultsTsv,
} from "@/lib/export/scenarioExport";
import { downloadTextFile } from "@/lib/export/downloadClient";
import { buildExportFilename } from "@/lib/export/exportFilename";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Input, Label, Select, Textarea } from "./ui/Input";
import { Button } from "./ui/Button";
import { Badge } from "./ui/Badge";
import { LenderDrawer } from "./LenderDrawer";
import {
  FUNDING_TYPE_OPTIONS,
  PROPERTY_TYPE_OPTIONS,
  TRANSACTION_TYPE_OPTIONS,
  ENTITY_TYPE_PREFERENCE_OPTIONS,
  US_STATES,
  parseMoney,
  type Scenario,
} from "@/lib/scenario";
import { cn } from "@/lib/cn";
import { LiveDataPausedNotice } from "@/components/LiveDataPausedNotice";
import { SettingsLink } from "@/components/SettingsLink";
import { useLiveConnection } from "@/lib/useLiveConnection";
import { CollapsibleSection } from "@/components/CollapsibleSection";

interface FormState {
  fundingAmountText: string;
  fundingTypeLabel: string;
  propertyTypeLabel: string;
  state: string;
  transactionType: string;
  ficoText: string;
  annualRevenueText: string;
  timeInBusinessText: string;
  ltvText: string;
  ownerOccupied: "Owner" | "Investor" | "Either";
  entityTypePreference: string;
  industry: string;
  freeText: string;
}

const EMPTY_FORM: FormState = {
  fundingAmountText: "",
  fundingTypeLabel: "",
  propertyTypeLabel: "",
  state: "",
  transactionType: "",
  ficoText: "",
  annualRevenueText: "",
  timeInBusinessText: "",
  ltvText: "",
  ownerOccupied: "Either",
  entityTypePreference: "No preference",
  industry: "",
  freeText: "",
};

function formToScenario(f: FormState) {
  const fundingTypeOption = FUNDING_TYPE_OPTIONS.find((o) => o.label === f.fundingTypeLabel);
  const propertyTypeOption = PROPERTY_TYPE_OPTIONS.find(
    (o) => o.label === f.propertyTypeLabel
  );
  const num = (s: string) => {
    const n = parseFloat(s.replace(/[, $%]/g, ""));
    return isFinite(n) && n > 0 ? n : undefined;
  };
  const fundingAmount = parseMoney(f.fundingAmountText);
  const annualRevenue = parseMoney(f.annualRevenueText);
  return {
    fundingAmount,
    fundingTypeLabel: fundingTypeOption?.label,
    fundingTypeKeywords: fundingTypeOption?.keywords,
    propertyTypeLabel: propertyTypeOption?.label,
    propertyTypeKeywords: propertyTypeOption?.keywords,
    state: f.state || undefined,
    transactionType: f.transactionType || undefined,
    ficoScore: num(f.ficoText),
    annualRevenue,
    timeInBusinessMonths: num(f.timeInBusinessText),
    ltv: num(f.ltvText),
    ownerOccupied: f.ownerOccupied === "Either" ? undefined : f.ownerOccupied,
    entityTypePreference:
      f.entityTypePreference === "No preference"
        ? undefined
        : f.entityTypePreference,
    industry: f.industry || undefined,
    freeText: f.freeText || undefined,
    limit: 40,
  };
}

function hasAnyCriteria(s: ReturnType<typeof formToScenario>): boolean {
  return Boolean(
    s.fundingAmount ||
      s.fundingTypeLabel ||
      s.propertyTypeLabel ||
      s.state ||
      s.ficoScore ||
      s.entityTypePreference ||
      s.industry ||
      s.transactionType ||
      (s.freeText && s.freeText.trim().length > 2)
  );
}

type FilterReason =
  | "not-a-lender"
  | "loan-amount-below-min"
  | "loan-amount-above-max"
  | "state-excluded"
  | "fico-below-min"
  | "industry-excluded"
  | "funding-type-incompatible"
  | "zero-signal";

const FILTER_LABELS: Record<FilterReason, string> = {
  "not-a-lender": "non-lenders (law firms, advisors, etc.)",
  "loan-amount-below-min": "funding amount below their minimum",
  "loan-amount-above-max": "funding amount above their maximum",
  "state-excluded": "don't lend in this state",
  "fico-below-min": "FICO below their (stated or typical) minimum",
  "industry-excluded": "exclude this industry",
  "funding-type-incompatible": "don't do this funding type",
  "zero-signal": "no matching signal",
};

type SearchResult = {
  _id: Id<"lenders">;
  company: string;
  contactName: string;
  phone: string;
  email: string;
  website: string;
  entityType: string;
  primaryNiche: string;
  programs: string;
  statesServed: string;
  fundingAmountMin: string;
  fundingAmountMax: string;
  rawScore: number;
  displayScore: number;
  reasons: string[];
  concerns: string[];
  matchedProgram?: {
    name: string;
    minFico?: string;
    requirements?: string;
  } | null;
};

export function ScenarioSearch() {
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [submitted, setSubmitted] = useState<FormState | null>(null);
  const [selectedId, setSelectedId] = useState<Id<"lenders"> | null>(null);
  const [scenarioCopyState, setScenarioCopyState] = useState<
    "idle" | "ok" | "err"
  >("idle");
  const { canUseHub, browserOnline } = useLiveConnection();

  const scenarioArgs = useMemo(
    () => (submitted ? formToScenario(submitted) : null),
    [submitted]
  );

  const data = useQuery(
    api.scenario.matchScenario,
    scenarioArgs && hasAnyCriteria(scenarioArgs) ? scenarioArgs : "skip"
  ) as
    | {
        totalConsidered: number;
        totalMatched: number;
        filterCounts: Partial<Record<FilterReason, number>>;
        results: SearchResult[];
        usedSearchNarrow?: boolean;
      }
    | undefined;

  function update<K extends keyof FormState>(k: K, v: FormState[K]) {
    setForm((p) => ({ ...p, [k]: v }));
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitted(form);
  }

  function reset() {
    setForm(EMPTY_FORM);
    setSubmitted(null);
  }

  // Auto-submit when any primary field changes after the first submit
  useEffect(() => {
    if (!submitted) return;
    const timer = setTimeout(() => setSubmitted(form), 500);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    form.fundingAmountText,
    form.fundingTypeLabel,
    form.propertyTypeLabel,
    form.state,
    form.ficoText,
    form.entityTypePreference,
    form.ownerOccupied,
    form.industry,
    form.transactionType,
    form.freeText,
  ]);

  const ready = hasAnyCriteria(formToScenario(form));

  const copyScenarioTsv = useCallback(async () => {
    if (!data || !submitted) return;
    const bundle = {
      scenario: formToScenario(submitted) as Record<string, unknown>,
      summary: {
        totalConsidered: data.totalConsidered,
        totalMatched: data.totalMatched,
        filterCounts: data.filterCounts,
        usedSearchNarrow: data.usedSearchNarrow,
      },
      results: data.results,
    };
    try {
      await navigator.clipboard.writeText(buildScenarioResultsTsv(bundle));
      setScenarioCopyState("ok");
      window.setTimeout(() => setScenarioCopyState("idle"), 1800);
    } catch {
      setScenarioCopyState("err");
      window.setTimeout(() => setScenarioCopyState("idle"), 2400);
    }
  }, [data, submitted]);

  const exportScenarioCsv = useCallback(() => {
    if (!data || !submitted) return;
    const bundle = {
      scenario: formToScenario(submitted) as Record<string, unknown>,
      summary: {
        totalConsidered: data.totalConsidered,
        totalMatched: data.totalMatched,
        filterCounts: data.filterCounts,
        usedSearchNarrow: data.usedSearchNarrow,
      },
      results: data.results,
    };
    const tags = [
      submitted.state ? `state-${submitted.state}` : "",
      data.results.length ? `${data.results.length}-rows` : "",
    ].filter(Boolean);
    downloadTextFile(
      buildExportFilename("scenario-matches", "csv", tags),
      buildScenarioResultsCsv(bundle),
      "text/csv;charset=utf-8",
      { utf8Bom: true }
    );
  }, [data, submitted]);

  const exportScenarioJson = useCallback(() => {
    if (!data || !submitted) return;
    const bundle = {
      scenario: formToScenario(submitted) as Record<string, unknown>,
      summary: {
        totalConsidered: data.totalConsidered,
        totalMatched: data.totalMatched,
        filterCounts: data.filterCounts,
        usedSearchNarrow: data.usedSearchNarrow,
      },
      results: data.results,
    };
    const tags = [
      submitted.state ? `state-${submitted.state}` : "",
      data.results.length ? `${data.results.length}-rows` : "",
    ].filter(Boolean);
    downloadTextFile(
      buildExportFilename("scenario-matches", "json", tags),
      buildScenarioResultsJson(bundle),
      "application/json;charset=utf-8",
      { utf8Bom: false }
    );
  }, [data, submitted]);

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[380px_1fr]">
      {/* ------------- Scenario form ------------- */}
      <form
        onSubmit={submit}
        className="space-y-5 rounded-xl border bg-background p-5 shadow-sm lg:sticky lg:top-20 lg:self-start"
      >
        <div className="flex items-center gap-2">
          <Target className="h-5 w-5 text-accent-foreground" />
          <h2 className="text-lg font-semibold">Loan Scenario</h2>
        </div>
        <p className="text-xs text-muted-foreground">
          Fill in what you know. The list of matching lenders narrows as you
          type. All fields are optional.
        </p>
        <div className="space-y-2">
          <LiveDataPausedNotice
            scope="scenario"
            canUseHub={canUseHub}
            browserOnline={browserOnline}
          />
          <SettingsLink
            section="data"
            className="text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            Data preferences
          </SettingsLink>
        </div>

        <Section defaultOpen title="Deal Basics">
          <Label hint="e.g. 500k, $1M, 2,500,000">
            Funding Amount
            <Input
              className="mt-1"
              placeholder="$"
              value={form.fundingAmountText}
              onChange={(e) => update("fundingAmountText", e.target.value)}
            />
          </Label>
          <Label>
            Funding type
            <Select
              className="mt-1"
              value={form.fundingTypeLabel}
              onChange={(e) => update("fundingTypeLabel", e.target.value)}
            >
              <option value="">— Any —</option>
              {FUNDING_TYPE_OPTIONS.map((o) => (
                <option key={o.label} value={o.label}>
                  {o.label}
                </option>
              ))}
            </Select>
          </Label>
          <Label>
            Transaction Type
            <Select
              className="mt-1"
              value={form.transactionType}
              onChange={(e) => update("transactionType", e.target.value)}
            >
              <option value="">— Any —</option>
              {TRANSACTION_TYPE_OPTIONS.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </Select>
          </Label>
        </Section>

        <Section defaultOpen title="Property / Location">
          <Label>
            Property Type
            <Select
              className="mt-1"
              value={form.propertyTypeLabel}
              onChange={(e) => update("propertyTypeLabel", e.target.value)}
            >
              <option value="">— Any —</option>
              {PROPERTY_TYPE_OPTIONS.map((o) => (
                <option key={o.label} value={o.label}>
                  {o.label}
                </option>
              ))}
            </Select>
          </Label>
          <Label>
            State
            <Select
              className="mt-1"
              value={form.state}
              onChange={(e) => update("state", e.target.value)}
            >
              <option value="">— Any —</option>
              {US_STATES.map((s) => (
                <option key={s.code} value={s.code}>
                  {s.code} – {s.name}
                </option>
              ))}
            </Select>
          </Label>
          <Label>
            Owner-Occupied or Investor
            <Select
              className="mt-1"
              value={form.ownerOccupied}
              onChange={(e) =>
                update(
                  "ownerOccupied",
                  e.target.value as FormState["ownerOccupied"]
                )
              }
            >
              <option value="Either">Either</option>
              <option value="Owner">Owner-Occupied</option>
              <option value="Investor">Investor</option>
            </Select>
          </Label>
        </Section>

        <Section defaultOpen title="Borrower Profile">
          <div className="grid grid-cols-2 gap-3">
            <Label>
              FICO
              <Input
                className="mt-1"
                placeholder="680"
                value={form.ficoText}
                onChange={(e) => update("ficoText", e.target.value)}
              />
            </Label>
            <Label hint="%">
              Requested LTV
              <Input
                className="mt-1"
                placeholder="75"
                value={form.ltvText}
                onChange={(e) => update("ltvText", e.target.value)}
              />
            </Label>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Label>
              Annual Revenue
              <Input
                className="mt-1"
                placeholder="$1.5M"
                value={form.annualRevenueText}
                onChange={(e) =>
                  update("annualRevenueText", e.target.value)
                }
              />
            </Label>
            <Label hint="months">
              Time in Business
              <Input
                className="mt-1"
                placeholder="24"
                value={form.timeInBusinessText}
                onChange={(e) =>
                  update("timeInBusinessText", e.target.value)
                }
              />
            </Label>
          </div>
          <Label hint="Used to filter lenders that exclude the borrower's industry">
            Industry
            <Input
              className="mt-1"
              placeholder="e.g. restaurant, cannabis, auto sales"
              value={form.industry}
              onChange={(e) => update("industry", e.target.value)}
            />
          </Label>
        </Section>

        <Section defaultOpen title="Preferences">
          <Label>
            Preferred Lender Type
            <Select
              className="mt-1"
              value={form.entityTypePreference}
              onChange={(e) =>
                update("entityTypePreference", e.target.value)
              }
            >
              {ENTITY_TYPE_PREFERENCE_OPTIONS.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </Select>
          </Label>
          <Label hint="Describe anything else: use of funds, timeline, specific niche...">
            Additional details
            <Textarea
              className="mt-1"
              rows={3}
              value={form.freeText}
              onChange={(e) => update("freeText", e.target.value)}
            />
          </Label>
        </Section>

        <div className="flex gap-2">
          <Button type="submit" className="flex-1" disabled={!ready}>
            <Search className="h-4 w-4" /> Find matches
          </Button>
          <Button type="button" variant="outline" onClick={reset}>
            <RotateCcw className="h-4 w-4" /> Reset
          </Button>
        </div>
      </form>

      {/* ------------- Results ------------- */}
      <div className="space-y-3">
        {!submitted && (
          <EmptyState />
        )}

        {submitted && !data && (
          <div className="rounded-lg border p-6 text-sm text-muted-foreground">
            Scoring against your lender database…
          </div>
        )}

        {data && (
          <>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-sm">
                <span className="text-lg font-semibold">
                  {data.totalMatched}
                </span>{" "}
                <span className="text-muted-foreground">
                  of {data.totalConsidered} lenders match
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-muted-foreground">
                  Top {data.results.length} · scores are relative
                </span>
                {data.results.length > 0 && (
                  <>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8 gap-1 text-xs"
                      onClick={() => void copyScenarioTsv()}
                      title="Copy match table as TSV"
                    >
                      {scenarioCopyState === "ok" ? (
                        <Check className="h-3.5 w-3.5" />
                      ) : (
                        <Copy className="h-3.5 w-3.5" />
                      )}
                      {scenarioCopyState === "ok"
                        ? "Copied"
                        : scenarioCopyState === "err"
                          ? "Copy failed"
                          : "Copy TSV"}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8 gap-1 text-xs"
                      onClick={exportScenarioCsv}
                      title="Download ranked matches as CSV"
                    >
                      <Download className="h-3.5 w-3.5" />
                      CSV
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8 gap-1 text-xs"
                      onClick={exportScenarioJson}
                      title="Download scenario + results as JSON"
                    >
                      <FileJson className="h-3.5 w-3.5" />
                      JSON
                    </Button>
                  </>
                )}
              </div>
            </div>

            {data.filterCounts &&
              Object.keys(data.filterCounts).length > 0 && (
                <CollapsibleSection
                  variant="card"
                  className="border-dashed"
                  title={
                    <span className="text-sm font-medium normal-case text-foreground">
                      Why lenders were filtered out
                    </span>
                  }
                  description="Counts of lenders that matched your criteria but were excluded for each reason."
                  defaultOpen
                >
                  <div className="flex flex-wrap gap-1.5 text-xs text-muted-foreground">
                    {(
                      Object.entries(data.filterCounts) as [
                        FilterReason,
                        number,
                      ][]
                    )
                      .sort((a, b) => b[1] - a[1])
                      .map(([k, n]) => (
                        <span
                          key={k}
                          className="inline-flex items-center gap-1 rounded-full bg-background px-2 py-0.5"
                        >
                          <span className="font-semibold">{n}</span>
                          <span>{FILTER_LABELS[k] ?? k}</span>
                        </span>
                      ))}
                  </div>
                </CollapsibleSection>
              )}

            {data.results.length === 0 && (
              <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
                No lenders pass the hard filters. Try loosening the loan
                amount, state, or FICO criteria.
              </div>
            )}

            <div className="space-y-3">
              {data.results.map((r, i) => (
                <ResultCard
                  key={r._id}
                  rank={i + 1}
                  result={r}
                  onOpen={() => setSelectedId(r._id)}
                />
              ))}
            </div>
          </>
        )}
      </div>

      <LenderDrawer
        id={selectedId}
        onClose={() => setSelectedId(null)}
        onLenderReplaced={(keepId) => setSelectedId(keepId)}
      />
    </div>
  );
}

function Section({
  title,
  defaultOpen = true,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  return (
    <CollapsibleSection
      variant="plain"
      title={title}
      defaultOpen={defaultOpen}
    >
      {children}
    </CollapsibleSection>
  );
}

function ResultCard({
  rank,
  result,
  onOpen,
}: {
  rank: number;
  result: SearchResult;
  onOpen: () => void;
}) {
  const scoreColor =
    result.displayScore >= 80
      ? "bg-green-100 text-green-900 dark:bg-green-950 dark:text-green-200"
      : result.displayScore >= 50
      ? "bg-accent text-accent-foreground"
      : "bg-muted text-muted-foreground";

  return (
    <div
      onClick={onOpen}
      className="group cursor-pointer rounded-lg border bg-background p-4 shadow-sm transition hover:border-accent-foreground/40 hover:shadow-md"
    >
      <div className="flex items-start gap-3">
        <div
          className={cn(
            "grid h-12 w-12 shrink-0 place-items-center rounded-lg text-center",
            scoreColor
          )}
          title={`Raw score ${result.rawScore}`}
        >
          <div>
            <div className="text-base font-bold leading-none">
              {result.displayScore}
            </div>
            <div className="text-[9px] uppercase tracking-wider opacity-70">
              match
            </div>
          </div>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="truncate text-base font-semibold">
                <span className="text-xs text-muted-foreground">#{rank}</span>{" "}
                {result.company}
              </div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-0.5 text-xs text-muted-foreground">
                {result.entityType && (
                  <span className="inline-flex items-center gap-1">
                    <Building2 className="h-3 w-3" /> {result.entityType}
                  </span>
                )}
                {result.contactName && <span>{result.contactName}</span>}
                {result.phone && (
                  <span className="inline-flex items-center gap-1">
                    <Phone className="h-3 w-3" /> {result.phone}
                  </span>
                )}
                {result.email && (
                  <span className="inline-flex items-center gap-1">
                    <Mail className="h-3 w-3" /> {result.email}
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
            {(result.fundingAmountMin || result.fundingAmountMax) && (
              <span className="inline-flex items-center gap-1">
                <DollarSign className="h-3 w-3 text-muted-foreground" />
                <span>
                  {result.fundingAmountMin || "—"} → {result.fundingAmountMax || "—"}
                </span>
              </span>
            )}
            {result.statesServed && (
              <span className="inline-flex items-center gap-1 truncate">
                <MapPin className="h-3 w-3 text-muted-foreground" />
                <span className="truncate" title={result.statesServed}>
                  {result.statesServed.length > 60
                    ? result.statesServed.slice(0, 60) + "…"
                    : result.statesServed}
                </span>
              </span>
            )}
            {result.primaryNiche && (
              <span className="truncate text-muted-foreground">
                {result.primaryNiche.length > 70
                  ? result.primaryNiche.slice(0, 70) + "…"
                  : result.primaryNiche}
              </span>
            )}
          </div>

          {(result.reasons.length > 0 || result.concerns.length > 0) && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {result.reasons.slice(0, 4).map((r, i) => (
                <Badge key={`r-${i}`} variant="accent" className="gap-1">
                  <CheckCircle2 className="h-3 w-3" /> {r}
                </Badge>
              ))}
              {result.concerns.slice(0, 2).map((c, i) => (
                <Badge key={`c-${i}`} variant="warning" className="gap-1">
                  <AlertTriangle className="h-3 w-3" /> {c}
                </Badge>
              ))}
            </div>
          )}

          {result.matchedProgram && (result.matchedProgram.requirements || result.matchedProgram.minFico) && (
            <div className="mt-3 rounded-md border bg-muted/30 p-2.5 text-xs">
              <div className="font-semibold">
                Matched program: {result.matchedProgram.name}
                {result.matchedProgram.minFico && (
                  <span className="ml-2 text-muted-foreground">
                    (min FICO {result.matchedProgram.minFico})
                  </span>
                )}
              </div>
              {result.matchedProgram.requirements && (
                <div className="mt-1 whitespace-pre-wrap leading-5 text-muted-foreground">
                  {result.matchedProgram.requirements}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-xl border border-dashed p-10 text-center">
      <Sparkles className="mx-auto h-10 w-10 text-muted-foreground" />
      <div className="mt-3 text-lg font-semibold">
        Describe the deal
      </div>
      <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
        Fill in the scenario on the left — funding amount, type, state, FICO,
        property type — and the system will rank your entire lender database
        by how well each one fits.
      </p>
      <div className="mx-auto mt-5 grid max-w-md grid-cols-1 gap-2 text-left text-xs">
        <ExampleRow>
          <strong>Fix &amp; flip, $450k, FL, 680 FICO</strong> → returns hard
          money and fix-flip lenders that lend in Florida
        </ExampleRow>
        <ExampleRow>
          <strong>SBA 7(a), $2M, Texas, 720 FICO</strong> → returns SBA
          lenders that operate in TX
        </ExampleRow>
        <ExampleRow>
          <strong>Working capital, $150k, restaurant</strong> → filters out
          lenders that exclude restaurants
        </ExampleRow>
      </div>
    </div>
  );
}

function ExampleRow({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-md bg-muted px-3 py-2 leading-relaxed">
      {children}
    </div>
  );
}
