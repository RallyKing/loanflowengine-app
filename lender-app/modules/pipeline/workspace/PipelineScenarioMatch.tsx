"use client";

/**
 * Per-file scenario editor + lender matcher embedded in the pipeline file workspace.
 *
 * The Pipeline file owns a structured `scenarioCriteria` object that mirrors
 * the global Scenario Search form. Edits autosave to the file via
 * `pipeline.patch`. Pressing **Match top 50 lenders** runs
 * `api.scenario.matchScenario({ ...criteria, fundingAmount, freeText, limit: 50 })`
 * and renders an inline result list. Each result has an Attach button that
 * adds the lender straight to this file (`pipeline.attachLender`).
 *
 * The editor is intentionally compact (single column on narrow drawers,
 * 2-column on wider) so it nests cleanly inside the drawer's existing
 * section rhythm.
 */

import type { ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import {
  Sparkles,
  Search,
  CheckCircle2,
  AlertTriangle,
  Plus,
  Building2,
  Phone,
  Mail,
  DollarSign,
  MapPin,
  RotateCcw,
  Eye,
} from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useUserPreferences } from "@/lib/userPreferencesContext";
import { useLiveConnection } from "@/lib/useLiveConnection";
import { useOrgConvexQueryArgs } from "@/lib/useOrgConvexQueryArgs";
import { useOfflineSync } from "@/lib/offline/OfflineSyncContext";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Input, Label, Select, Textarea } from "@/components/ui/Input";
import { LenderDrawer } from "@/components/LenderDrawer";
import { CollapsibleSection } from "@/components/CollapsibleSection";
import { cn } from "@/lib/cn";
import {
  FUNDING_TYPE_OPTIONS,
  PROPERTY_TYPE_OPTIONS,
  TRANSACTION_TYPE_OPTIONS,
  ENTITY_TYPE_PREFERENCE_OPTIONS,
  US_STATES,
} from "@/lib/scenario";
import { DealBlockAiAssistPanel } from "@/components/intake/DealBlockAiAssistPanel";
import { sanitizeLenderCriteriaAiPatch } from "@/lib/dealBlockAiAssistModel";

// ---- Public types ---------------------------------------------------------

export type ScenarioCriteria = {
  fundingTypeLabel?: string;
  propertyTypeLabel?: string;
  state?: string;
  transactionType?: string;
  ficoScore?: number;
  annualRevenue?: number;
  timeInBusinessMonths?: number;
  ltv?: number;
  ownerOccupied?: "Owner" | "Investor" | "Either";
  entityTypePreference?: string;
  industry?: string;
};

export type PipelineScenarioMatchProps = {
  fileId: Id<"pipeline">;
  /** Server `pipeline.updatedAt` when the parent loaded — offline conflict guard. */
  fileUpdatedAt: number;
  fundingAmount: number;
  /** Free-text scenario stored on the pipeline file (one-liner / pitch). */
  scenarioText: string | undefined;
  /** Persisted criteria (or undefined for a brand-new file). */
  criteria: ScenarioCriteria | undefined;
  /** Lenders already attached to this file — used to flip Attach → Attached. */
  attachedLenderIds: Set<Id<"lenders">>;
  /** Drawer layout: controlled expand/collapse for the outer shell. */
  sectionOpen?: boolean;
  onSectionOpenChange?: (open: boolean) => void;
  sectionAnimated?: boolean;
  /** Optional field-count badge (from parent file workspace). */
  sectionBadge?: ReactNode;
  /** Tab 3 inline shell — skip outer drawer card; parent owns the accordion. */
  embedded?: boolean;
};

// ---- Form state -----------------------------------------------------------

type FormState = {
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
};

const EMPTY_FORM: FormState = {
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
};

function criteriaToForm(c: ScenarioCriteria | undefined): FormState {
  if (!c) return { ...EMPTY_FORM };
  const numStr = (n: number | undefined) =>
    typeof n === "number" && isFinite(n) && n > 0 ? String(n) : "";
  return {
    fundingTypeLabel: c.fundingTypeLabel ?? "",
    propertyTypeLabel: c.propertyTypeLabel ?? "",
    state: c.state ?? "",
    transactionType: c.transactionType ?? "",
    ficoText: numStr(c.ficoScore),
    annualRevenueText: numStr(c.annualRevenue),
    timeInBusinessText: numStr(c.timeInBusinessMonths),
    ltvText: numStr(c.ltv),
    ownerOccupied: c.ownerOccupied ?? "Either",
    entityTypePreference: c.entityTypePreference ?? "No preference",
    industry: c.industry ?? "",
  };
}

function formToCriteria(f: FormState): ScenarioCriteria {
  const num = (s: string) => {
    const n = parseFloat(s.replace(/[, $%]/g, ""));
    return isFinite(n) && n > 0 ? n : undefined;
  };
  return {
    fundingTypeLabel: f.fundingTypeLabel || undefined,
    propertyTypeLabel: f.propertyTypeLabel || undefined,
    state: f.state || undefined,
    transactionType: f.transactionType || undefined,
    ficoScore: num(f.ficoText),
    annualRevenue: num(f.annualRevenueText),
    timeInBusinessMonths: num(f.timeInBusinessText),
    ltv: num(f.ltvText),
    ownerOccupied: f.ownerOccupied === "Either" ? undefined : f.ownerOccupied,
    entityTypePreference:
      f.entityTypePreference === "No preference"
        ? undefined
        : f.entityTypePreference,
    industry: f.industry || undefined,
  };
}

function isEmptyCriteria(c: ScenarioCriteria | undefined): boolean {
  if (!c) return true;
  return Object.values(c).every((v) => v === undefined);
}

function criteriaEqual(
  a: ScenarioCriteria | undefined,
  b: ScenarioCriteria | undefined
): boolean {
  const norm = (c: ScenarioCriteria | undefined) => ({
    fundingTypeLabel: c?.fundingTypeLabel ?? "",
    propertyTypeLabel: c?.propertyTypeLabel ?? "",
    state: c?.state ?? "",
    transactionType: c?.transactionType ?? "",
    ficoScore: c?.ficoScore ?? 0,
    annualRevenue: c?.annualRevenue ?? 0,
    timeInBusinessMonths: c?.timeInBusinessMonths ?? 0,
    ltv: c?.ltv ?? 0,
    ownerOccupied: c?.ownerOccupied ?? "",
    entityTypePreference: c?.entityTypePreference ?? "",
    industry: c?.industry ?? "",
  });
  const an = norm(a);
  const bn = norm(b);
  return (Object.keys(an) as (keyof typeof an)[]).every(
    (k) => an[k] === bn[k]
  );
}

// ---- Match-query result types --------------------------------------------

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
  "not-a-lender": "non-lenders",
  "loan-amount-below-min": "loan below their min",
  "loan-amount-above-max": "loan above their max",
  "state-excluded": "wrong state",
  "fico-below-min": "FICO too low",
  "industry-excluded": "industry excluded",
  "funding-type-incompatible": "wrong funding type",
  "zero-signal": "no matching signal",
};

type MatchResult = {
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

// ---- Component ------------------------------------------------------------

export function PipelineScenarioMatch({
  fileId,
  fileUpdatedAt,
  fundingAmount,
  scenarioText,
  criteria,
  attachedLenderIds,
  sectionOpen,
  onSectionOpenChange,
  sectionAnimated,
  sectionBadge,
  embedded = false,
}: PipelineScenarioMatchProps) {
  const { accountId } = useUserPreferences();
  const preferencesAccountId = accountId.trim() || undefined;
  const orgScope = useOrgConvexQueryArgs();
  const { canUseHub } = useLiveConnection();
  const offline = useOfflineSync();
  const patchPipelineMut = useMutation(api.pipeline.patch);
  const attachLender = useMutation(api.pipeline.attachLender);

  // Local form mirror (autosave on change, debounced).
  const [form, setForm] = useState<FormState>(() => criteriaToForm(criteria));
  const lastSavedRef = useRef<ScenarioCriteria | undefined>(criteria);
  const fileUpdatedAtRef = useRef(fileUpdatedAt);
  fileUpdatedAtRef.current = fileUpdatedAt;

  // Re-hydrate when the underlying file or criteria object identity changes.
  // We use a stable JSON representation as the dep so we don't loop on the
  // same content arriving as a fresh object reference from Convex.
  const criteriaKey = useMemo(() => JSON.stringify(criteria ?? null), [criteria]);
  useEffect(() => {
    setForm(criteriaToForm(criteria));
    lastSavedRef.current = criteria;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fileId, criteriaKey]);

  // Debounced autosave back to the server (or offline queue).
  useEffect(() => {
    const next = formToCriteria(form);
    if (criteriaEqual(next, lastSavedRef.current)) return;
    const handle = window.setTimeout(() => {
      const payload = {
        id: fileId,
        scenarioCriteria: isEmptyCriteria(next) ? null : next,
        ...(preferencesAccountId ? { preferencesAccountId } : {}),
        expectedUpdatedAt: fileUpdatedAtRef.current,
      };
      void (async () => {
        try {
          if (canUseHub) {
            await patchPipelineMut(payload);
          } else {
            await offline.enqueue({
              kind: "pipeline.patch",
              queueKey: `pipeline.patch::${fileId}`,
              args: { ...payload } as Record<string, unknown>,
            });
          }
          lastSavedRef.current = next;
        } catch {
          /* swallow — explicit edits will surface errors */
        }
      })();
    }, 500);
    return () => window.clearTimeout(handle);
  }, [form, fileId, patchPipelineMut, preferencesAccountId, canUseHub, offline]);

  // Search controls.
  const [searching, setSearching] = useState(false);
  const [submitted, setSubmitted] = useState<ScenarioCriteria | null>(null);
  const [openLenderId, setOpenLenderId] = useState<Id<"lenders"> | null>(null);
  const [attachingId, setAttachingId] =
    useState<Id<"lenders"> | null>(null);
  const [attachError, setAttachError] = useState<string | null>(null);

  const update = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setForm((p) => ({ ...p, [k]: v }));

  // Compose the args we'll pass to matchScenario, pulling funding-type keywords
  // from the dropdown option (so the search can use `lender_scenario`).
  const queryArgs = useMemo(() => {
    if (!searching || !submitted || !orgScope) return null;
    const fundingTypeOption = FUNDING_TYPE_OPTIONS.find(
      (o) => o.label === submitted.fundingTypeLabel
    );
    const propertyTypeOption = PROPERTY_TYPE_OPTIONS.find(
      (o) => o.label === submitted.propertyTypeLabel
    );
    return {
      ...orgScope,
      fundingAmount: fundingAmount > 0 ? fundingAmount : undefined,
      fundingTypeLabel: submitted.fundingTypeLabel,
      fundingTypeKeywords: fundingTypeOption?.keywords,
      propertyTypeLabel: submitted.propertyTypeLabel,
      propertyTypeKeywords: propertyTypeOption?.keywords,
      state: submitted.state,
      transactionType: submitted.transactionType,
      ficoScore: submitted.ficoScore,
      annualRevenue: submitted.annualRevenue,
      timeInBusinessMonths: submitted.timeInBusinessMonths,
      ltv: submitted.ltv,
      ownerOccupied:
        submitted.ownerOccupied === "Either"
          ? undefined
          : submitted.ownerOccupied,
      entityTypePreference: submitted.entityTypePreference,
      industry: submitted.industry,
      freeText: scenarioText?.trim() || undefined,
      limit: 50,
    };
  }, [searching, submitted, fundingAmount, scenarioText, orgScope]);

  const data = useQuery(
    api.scenario.matchScenario,
    queryArgs ?? "skip"
  ) as
    | {
        totalConsidered: number;
        totalMatched: number;
        filterCounts: Partial<Record<FilterReason, number>>;
        results: MatchResult[];
        usedSearchNarrow?: boolean;
      }
    | undefined;

  const liveCriteria = formToCriteria(form);
  const hasAnySignal =
    !isEmptyCriteria(liveCriteria) ||
    fundingAmount > 0 ||
    Boolean(scenarioText && scenarioText.trim().length > 2);

  function runMatch() {
    setAttachError(null);
    setSubmitted(formToCriteria(form));
    setSearching(true);
  }

  function clearCriteria() {
    setForm({ ...EMPTY_FORM });
    setSearching(false);
    setSubmitted(null);
  }

  async function onAttach(lenderId: Id<"lenders">) {
    setAttachError(null);
    setAttachingId(lenderId);
    try {
      await attachLender({
        fileId,
        lenderId,
        preferencesAccountId: accountId || undefined,
      });
    } catch (e) {
      setAttachError(e instanceof Error ? e.message : String(e));
    } finally {
      setAttachingId(null);
    }
  }

  const headerActions = (
    <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={clearCriteria}
        disabled={isEmptyCriteria(liveCriteria) && !searching}
        title="Clear criteria"
      >
        <RotateCcw className="h-3.5 w-3.5" />
        Clear
      </Button>
      <Button
        type="button"
        size="sm"
        onClick={runMatch}
        disabled={!hasAnySignal}
        title={
          hasAnySignal
            ? "Score every lender against this scenario"
            : "Add at least one criterion"
        }
      >
        <Search className="h-3.5 w-3.5" />
        Match top 50 lenders
      </Button>
    </div>
  );

  const fundingDescription = (
    <>
      Saved with the file. Funding amount comes from the file
      {fundingAmount > 0 ? (
        <>
          {" "}
          (
          <span className="font-medium">
            ${fundingAmount.toLocaleString()}
          </span>
          )
        </>
      ) : null}
      . Scenario notes above are also fed into the match.
    </>
  );

  const matchPanel = (
    <>
      <CollapsibleSection
        defaultOpen={false}
        title={
          <span className="text-sm font-semibold normal-case text-foreground">
            Match criteria
          </span>
        }
        description="Narrow the lender search for this file."
      >
      <DealBlockAiAssistPanel
        fileId={fileId}
        blockKind="lender_match"
        fingerprint={[criteriaKey, String(fundingAmount), scenarioText ?? ""].join(
          "|",
        )}
        buildContext={() => ({
          fundingAmount,
          scenarioText: scenarioText ?? "",
          hasCriteria: !isEmptyCriteria(liveCriteria),
          criteria: liveCriteria,
        })}
        onApply={(s) => {
          if (!s.patch) return;
          const p = sanitizeLenderCriteriaAiPatch(s.patch);
          if (!p) return;
          setForm((prev) => ({ ...prev, ...p }));
        }}
      />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
          Transaction type
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
        <Label>
          Property type
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

        <div className="grid grid-cols-2 gap-3">
          <Label>
            FICO
            <Input
              className="mt-1"
              placeholder="680"
              inputMode="numeric"
              value={form.ficoText}
              onChange={(e) => update("ficoText", e.target.value)}
            />
          </Label>
          <Label hint="%">
            LTV
            <Input
              className="mt-1"
              placeholder="75"
              inputMode="numeric"
              value={form.ltvText}
              onChange={(e) => update("ltvText", e.target.value)}
            />
          </Label>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Label>
            Annual rev.
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
            Time in biz
            <Input
              className="mt-1"
              placeholder="24"
              inputMode="numeric"
              value={form.timeInBusinessText}
              onChange={(e) =>
                update("timeInBusinessText", e.target.value)
              }
            />
          </Label>
        </div>

        <Label>
          Owner / Investor
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
        <Label>
          Preferred lender type
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

        <Label className="sm:col-span-2">
          Industry / niche notes
          <Textarea
            className="mt-1"
            rows={2}
            placeholder="e.g. restaurant, cannabis, auto sales"
            value={form.industry}
            onChange={(e) => update("industry", e.target.value)}
          />
        </Label>
      </div>
      </CollapsibleSection>

      {/* ---------- Results ---------- */}
      {searching && (
        <CollapsibleSection
          className="mt-4"
          defaultOpen={false}
          title={
            <span className="text-sm font-semibold normal-case text-foreground">
              Match results
            </span>
          }
          description="Lenders scored against your criteria. Attach to add to this file."
        >
        <div className="space-y-2">
          {!data && (
            <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
              Scoring against your lender database…
            </div>
          )}
          {attachError && (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {attachError}
            </div>
          )}
          {data && (
            <>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div className="text-sm">
                  <span className="text-base font-semibold">
                    {data.totalMatched}
                  </span>{" "}
                  <span className="text-muted-foreground">
                    of {data.totalConsidered} lenders match
                  </span>
                </div>
                <div className="text-[11px] text-muted-foreground">
                  Showing top {data.results.length}
                </div>
              </div>

              {data.filterCounts &&
                Object.keys(data.filterCounts).length > 0 && (
                  <div className="rounded-md border border-dashed bg-muted/30 p-2 text-[11px] text-muted-foreground">
                    <span className="mr-2 font-medium text-foreground">
                      Filtered:
                    </span>
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
                          className="mr-1 inline-flex items-center gap-1 rounded-full bg-background px-1.5 py-0.5"
                        >
                          <span className="font-semibold">{n}</span>
                          <span>{FILTER_LABELS[k] ?? k}</span>
                        </span>
                      ))}
                  </div>
                )}

              {data.results.length === 0 && (
                <div className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
                  No lenders pass the hard filters. Try loosening loan
                  amount, state, or FICO.
                </div>
              )}

              <ul className="space-y-2">
                {data.results.map((r, i) => (
                  <ResultRow
                    key={r._id}
                    rank={i + 1}
                    result={r}
                    attached={attachedLenderIds.has(r._id)}
                    attaching={attachingId === r._id}
                    onAttach={() => onAttach(r._id)}
                    onOpen={() => setOpenLenderId(r._id)}
                  />
                ))}
              </ul>
            </>
          )}
        </div>
        </CollapsibleSection>
      )}

      <LenderDrawer
        id={openLenderId}
        onClose={() => setOpenLenderId(null)}
        onLenderReplaced={(keepId) => setOpenLenderId(keepId)}
      />
    </>
  );

  if (embedded) {
    return (
      <div
        className="min-w-0 space-y-4"
        data-testid="pipeline-scenario-match-embedded"
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <p className="min-w-0 text-xs text-muted-foreground">
            {fundingDescription}
          </p>
          {headerActions}
        </div>
        {matchPanel}
      </div>
    );
  }

  return (
    <CollapsibleSection
      variant="card"
      animated={Boolean(sectionAnimated)}
      lazyMount={Boolean(sectionAnimated)}
      open={sectionOpen}
      onOpenChange={onSectionOpenChange}
      title={
        <span className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          <Sparkles className="h-3.5 w-3.5 shrink-0" aria-hidden />
          Scenario &amp; lender match
        </span>
      }
      description={fundingDescription}
      headerRight={
        <span className="inline-flex max-w-full flex-wrap items-center justify-end gap-2">
          {sectionBadge}
          {headerActions}
        </span>
      }
      contentClassName="space-y-4"
    >
      {matchPanel}
    </CollapsibleSection>
  );
}

function ResultRow({
  rank,
  result,
  attached,
  attaching,
  onAttach,
  onOpen,
}: {
  rank: number;
  result: MatchResult;
  attached: boolean;
  attaching: boolean;
  onAttach: () => void;
  onOpen: () => void;
}) {
  const scoreColor =
    result.displayScore >= 80
      ? "bg-green-100 text-green-900 dark:bg-green-950 dark:text-green-200"
      : result.displayScore >= 50
        ? "bg-accent text-accent-foreground"
        : "bg-muted text-muted-foreground";

  return (
    <li className="rounded-md border bg-background p-3 shadow-sm transition hover:border-accent-foreground/40">
      <div className="flex items-start gap-3">
        <div
          className={cn(
            "grid h-10 w-10 shrink-0 place-items-center rounded-md text-center",
            scoreColor
          )}
          title={`Raw score ${result.rawScore}`}
        >
          <div>
            <div className="text-sm font-bold leading-none">
              {result.displayScore}
            </div>
            <div className="text-[8px] uppercase tracking-wider opacity-70">
              match
            </div>
          </div>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <button
                type="button"
                onClick={onOpen}
                className="truncate text-left text-sm font-semibold hover:underline"
              >
                <span className="text-xs text-muted-foreground">
                  #{rank}
                </span>{" "}
                {result.company}
              </button>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 pt-0.5 text-[11px] text-muted-foreground">
                {result.entityType && (
                  <span className="inline-flex items-center gap-1">
                    <Building2 className="h-3 w-3" />
                    {result.entityType}
                  </span>
                )}
                {result.contactName && <span>{result.contactName}</span>}
                {result.phone && (
                  <span className="inline-flex items-center gap-1">
                    <Phone className="h-3 w-3" />
                    {result.phone}
                  </span>
                )}
                {result.email && (
                  <span className="inline-flex items-center gap-1">
                    <Mail className="h-3 w-3" />
                    {result.email}
                  </span>
                )}
              </div>
            </div>
            <div className="flex shrink-0 gap-1">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={onOpen}
                title="Open lender"
                aria-label="Open lender"
              >
                <Eye className="h-3.5 w-3.5" />
              </Button>
              {attached ? (
                <Badge variant="accent" className="gap-1">
                  <CheckCircle2 className="h-3 w-3" />
                  Attached
                </Badge>
              ) : (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={onAttach}
                  disabled={attaching}
                  title="Attach this lender to the file"
                >
                  <Plus className="h-3.5 w-3.5" />
                  {attaching ? "Attaching…" : "Attach"}
                </Button>
              )}
            </div>
          </div>

          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px]">
            {(result.fundingAmountMin || result.fundingAmountMax) && (
              <span className="inline-flex items-center gap-1 text-muted-foreground">
                <DollarSign className="h-3 w-3" />
                {result.fundingAmountMin || "—"} → {result.fundingAmountMax || "—"}
              </span>
            )}
            {result.statesServed && (
              <span className="inline-flex items-center gap-1 truncate text-muted-foreground">
                <MapPin className="h-3 w-3" />
                <span
                  className="truncate"
                  title={result.statesServed}
                >
                  {result.statesServed.length > 50
                    ? result.statesServed.slice(0, 50) + "…"
                    : result.statesServed}
                </span>
              </span>
            )}
            {result.primaryNiche && (
              <span className="truncate text-muted-foreground">
                {result.primaryNiche.length > 60
                  ? result.primaryNiche.slice(0, 60) + "…"
                  : result.primaryNiche}
              </span>
            )}
          </div>

          {(result.reasons.length > 0 || result.concerns.length > 0) && (
            <div className="mt-2 flex flex-wrap gap-1">
              {result.reasons.slice(0, 3).map((reason, i) => (
                <Badge
                  key={`r-${i}`}
                  variant="accent"
                  className="gap-1 text-[10px]"
                >
                  <CheckCircle2 className="h-3 w-3" />
                  {reason}
                </Badge>
              ))}
              {result.concerns.slice(0, 2).map((concern, i) => (
                <Badge
                  key={`c-${i}`}
                  variant="warning"
                  className="gap-1 text-[10px]"
                >
                  <AlertTriangle className="h-3 w-3" />
                  {concern}
                </Badge>
              ))}
            </div>
          )}
        </div>
      </div>
    </li>
  );
}
