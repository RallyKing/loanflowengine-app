"use client";

import Link from "next/link";
import { Fragment, useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { ChevronDown, ChevronRight, Radar } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { PageErrorBoundary } from "@/components/PageErrorBoundary";
import { ConvexQueryBoundary } from "@/components/ConvexQueryBoundary";
import { Button } from "@/components/ui/Button";
import { Input, Label, Select } from "@/components/ui/Input";
import { OperationalEmptyState } from "@/components/ui/OperationalEmptyState";
import { OperationalSkeletonList } from "@/components/ui/OperationalSkeleton";
import { cn } from "@/lib/cn";
import { dataTableClassNames } from "@/lib/dataTableClasses";
import {
  DC_AWARD_RADAR_CONFIDENCE,
  dcAwardEmailUiLabel,
  dcAwardPhoneUiLabel,
  type DcAwardRadarConfidence,
  type DcAwardRadarEmailType,
  type DcAwardRadarPhoneType,
} from "@/lib/dcAwardRadar";
import {
  dcAwardRowHasContact,
  groupDcAwardRadarSignals,
  type DcAwardRadarCampusGroup,
  type DcAwardRadarGroupableRow,
  type DcAwardRadarListContact,
} from "@/lib/dcAwardRadarCampus";
import { useActorUserKey } from "@/lib/useActorUserKey";
import { useUserSettings } from "@/lib/userSettingsContext";
import { DcAwardRadarOpsPanel } from "./DcAwardRadarOpsPanel";

type RadarViewMode = "grouped" | "flat";

const CONFIDENCE_LABEL: Record<DcAwardRadarConfidence, string> = {
  high: "High",
  med: "Med",
  low: "Low",
};

const MARKET_DATALIST_ID = "dc-award-radar-markets";

function ConfidenceBadge({ value }: { value: DcAwardRadarConfidence }) {
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide",
        value === "high" && "bg-emerald-500/15 text-emerald-800 dark:text-emerald-200",
        value === "med" && "bg-amber-500/15 text-amber-800 dark:text-amber-200",
        value === "low" && "bg-muted text-muted-foreground",
      )}
    >
      {CONFIDENCE_LABEL[value]}
    </span>
  );
}

function ContactExpanded({
  email,
  emailType,
  phone,
  phoneType,
  linkedinUrl,
  companyWebsite,
  contactNotes,
}: {
  email?: string;
  emailType?: DcAwardRadarEmailType;
  phone?: string;
  phoneType?: DcAwardRadarPhoneType;
  linkedinUrl?: string;
  companyWebsite?: string;
  contactNotes?: string;
}) {
  return (
    <dl className="grid gap-2 text-xs sm:grid-cols-2">
      <div>
        <dt className="text-muted-foreground">{dcAwardEmailUiLabel(emailType)}</dt>
        <dd>{email || "—"}</dd>
      </div>
      <div>
        <dt className="text-muted-foreground">{dcAwardPhoneUiLabel(phoneType)}</dt>
        <dd>{phone || "—"}</dd>
      </div>
      <div>
        <dt className="text-muted-foreground">LinkedIn</dt>
        <dd>
          {linkedinUrl ? (
            <a
              href={linkedinUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="break-all text-primary hover:underline"
            >
              {linkedinUrl}
            </a>
          ) : (
            "—"
          )}
        </dd>
      </div>
      <div>
        <dt className="text-muted-foreground">Company website</dt>
        <dd>
          {companyWebsite ? (
            <a
              href={companyWebsite}
              target="_blank"
              rel="noopener noreferrer"
              className="break-all text-primary hover:underline"
            >
              {companyWebsite}
            </a>
          ) : (
            "—"
          )}
        </dd>
      </div>
      <div className="sm:col-span-2">
        <dt className="text-muted-foreground">
          Why this is cell/direct (source / confidence)
        </dt>
        <dd>{contactNotes || "—"}</dd>
      </div>
    </dl>
  );
}

function ContactSummary({
  contact,
  expanded,
  onToggle,
  buttonId,
}: {
  contact: DcAwardRadarListContact;
  expanded: boolean;
  onToggle: () => void;
  buttonId: string;
}) {
  const hasContact = dcAwardRowHasContact(contact);
  return (
    <button
      type="button"
      id={buttonId}
      className="inline-flex min-h-10 items-center gap-1 text-left"
      aria-expanded={expanded}
      onClick={onToggle}
    >
      {expanded ? (
        <ChevronDown className="h-3.5 w-3.5 shrink-0" aria-hidden />
      ) : (
        <ChevronRight className="h-3.5 w-3.5 shrink-0" aria-hidden />
      )}
      <span>
        <span className="block font-medium">
          {contact.contactName ||
            (hasContact ? "Owner / principal on file" : "No owner / principal")}
        </span>
        {contact.contactTitle ? (
          <span className="block text-muted-foreground">
            {contact.contactTitle}
          </span>
        ) : null}
        {contact.phone ? (
          <span className="block text-muted-foreground">
            {dcAwardPhoneUiLabel(contact.phoneType)}: {contact.phone}
          </span>
        ) : null}
        {contact.email ? (
          <span className="block text-muted-foreground">
            {dcAwardEmailUiLabel(contact.emailType)}: {contact.email}
          </span>
        ) : null}
      </span>
    </button>
  );
}

function FlatSignalRow({
  row,
  expanded,
  onToggle,
}: {
  row: DcAwardRadarGroupableRow;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <Fragment>
      <tr className="border-b border-border/60 align-top">
        <td className="px-2 py-2 text-xs whitespace-nowrap">{row.market}</td>
        <td className="px-2 py-2 text-sm font-medium">{row.projectOrCampus}</td>
        <td className="px-2 py-2 text-xs">{row.stageSignal}</td>
        <td className="px-2 py-2 text-xs">
          <div>{row.company}</div>
          <div className="text-muted-foreground">{row.roleIfKnown}</div>
        </td>
        <td className="px-2 py-2 text-xs">
          <ContactSummary
            contact={row}
            expanded={expanded}
            onToggle={onToggle}
            buttonId={`dc-award-flat-contact-${row._id}`}
          />
        </td>
        <td className="px-2 py-2">
          <ConfidenceBadge value={row.confidence} />
        </td>
        <td className="px-2 py-2 text-xs whitespace-nowrap">{row.signalDate}</td>
        <td className="px-2 py-2 text-xs">
          <div>{row.whyItMattersForDlc}</div>
          {row.notes ? (
            <div className="mt-1 text-muted-foreground">{row.notes}</div>
          ) : null}
          <div className="mt-1 text-muted-foreground">{row.tradeFocus}</div>
        </td>
        <td className="px-2 py-2 text-xs">
          <div>{row.sourceType}</div>
          <a
            href={row.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="break-all text-primary hover:underline"
          >
            Open source
          </a>
        </td>
      </tr>
      {expanded ? (
        <tr className="border-b border-border/60 bg-muted/30">
          <td colSpan={9} className="px-3 py-3">
            <ContactExpanded
              email={row.email}
              emailType={row.emailType}
              phone={row.phone}
              phoneType={row.phoneType}
              linkedinUrl={row.linkedinUrl}
              companyWebsite={row.companyWebsite}
              contactNotes={row.contactNotes}
            />
          </td>
        </tr>
      ) : null}
    </Fragment>
  );
}

function GroupedCampusRow({
  group,
  expanded,
  onToggle,
}: {
  group: DcAwardRadarCampusGroup;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <Fragment>
      <tr
        className="border-b border-border/60 align-top"
        data-testid="dc-award-campus-group"
        data-campus-key={group.campusKey ?? ""}
      >
        <td className="px-2 py-2 text-xs whitespace-nowrap">{group.market}</td>
        <td className="px-2 py-2 text-sm font-medium">
          <div>{group.campusName}</div>
          <div className="text-xs font-normal text-muted-foreground">
            {group.companies.join(" · ")}
          </div>
        </td>
        <td className="px-2 py-2 text-xs">
          <ContactSummary
            contact={group.contact}
            expanded={expanded}
            onToggle={onToggle}
            buttonId={`dc-award-group-contact-${group.groupKey}`}
          />
        </td>
        <td className="px-2 py-2">
          <ConfidenceBadge value={group.confidence} />
        </td>
        <td className="px-2 py-2 text-xs whitespace-nowrap">{group.signalDate}</td>
        <td className="px-2 py-2 text-xs">
          <button
            type="button"
            className="inline-flex min-h-10 items-center gap-1 text-left font-medium"
            aria-expanded={expanded}
            aria-controls={`dc-award-group-children-${group.groupKey}`}
            onClick={onToggle}
          >
            {expanded ? (
              <ChevronDown className="h-3.5 w-3.5 shrink-0" aria-hidden />
            ) : (
              <ChevronRight className="h-3.5 w-3.5 shrink-0" aria-hidden />
            )}
            {group.signals.length} signal
            {group.signals.length === 1 ? "" : "s"}
          </button>
        </td>
      </tr>
      {expanded ? (
        <tr className="border-b border-border/60 bg-muted/30">
          <td colSpan={6} className="px-3 py-3">
            <div
              id={`dc-award-group-children-${group.groupKey}`}
              className="space-y-3"
            >
              <ContactExpanded
                email={group.contact.email}
                emailType={group.contact.emailType}
                phone={group.contact.phone}
                phoneType={group.contact.phoneType}
                linkedinUrl={group.contact.linkedinUrl}
                companyWebsite={group.contact.companyWebsite}
                contactNotes={group.contact.contactNotes}
              />
              <div className="overflow-x-auto max-md:touch-pan-x">
                <table className="w-full min-w-[48rem] text-left text-xs">
                  <caption className="sr-only">
                    Child signals for {group.campusName}
                  </caption>
                  <thead>
                    <tr className="text-[11px] uppercase tracking-wide text-muted-foreground">
                      <th className="px-2 py-1 font-medium">Project</th>
                      <th className="px-2 py-1 font-medium">Stage</th>
                      <th className="px-2 py-1 font-medium">Date</th>
                      <th className="px-2 py-1 font-medium">Trade</th>
                      <th className="px-2 py-1 font-medium">Company</th>
                      <th className="px-2 py-1 font-medium">Conf.</th>
                      <th className="px-2 py-1 font-medium">Source</th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.signals.map((child) => (
                      <tr key={child._id} className="align-top">
                        <td className="px-2 py-1.5 font-medium">
                          {child.projectOrCampus}
                        </td>
                        <td className="px-2 py-1.5">{child.stageSignal}</td>
                        <td className="px-2 py-1.5 whitespace-nowrap">
                          {child.signalDate}
                        </td>
                        <td className="px-2 py-1.5">{child.tradeFocus}</td>
                        <td className="px-2 py-1.5">
                          <div>{child.company}</div>
                          <div className="text-muted-foreground">
                            {child.roleIfKnown}
                          </div>
                        </td>
                        <td className="px-2 py-1.5">
                          <ConfidenceBadge value={child.confidence} />
                        </td>
                        <td className="px-2 py-1.5">
                          <div>{child.sourceType}</div>
                          <a
                            href={child.sourceUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="break-all text-primary hover:underline"
                          >
                            Open source
                          </a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </td>
        </tr>
      ) : null}
    </Fragment>
  );
}

function RadarTable() {
  const memberUserKey = useActorUserKey().trim();
  const { settings } = useUserSettings();
  const [marketDraft, setMarketDraft] = useState("");
  const [market, setMarket] = useState("");
  const [confidence, setConfidence] = useState<"" | DcAwardRadarConfidence>("");
  const [viewMode, setViewMode] = useState<RadarViewMode>("grouped");
  const [expandedIds, setExpandedIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [collapsedGroupKeys, setCollapsedGroupKeys] = useState<
    ReadonlySet<string>
  >(() => new Set());

  const result = useQuery(
    api.dcAwardSignals.list,
    memberUserKey
      ? {
          memberUserKey,
          ...(market ? { market } : {}),
          ...(confidence ? { confidence } : {}),
        }
      : "skip",
  );

  const signals = result?.signals;
  const groups = useMemo(
    () => groupDcAwardRadarSignals(signals ?? []),
    [signals],
  );
  const markets = useMemo(() => {
    const fromData = new Set<string>();
    for (const row of signals ?? []) {
      if (row.market) fromData.add(row.market);
    }
    return [...fromData].sort((a, b) => a.localeCompare(b));
  }, [signals]);

  function applyMarketFilter() {
    setMarket(marketDraft.trim());
  }

  function toggleExpanded(id: string) {
    setExpandedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleGroup(groupKey: string) {
    setCollapsedGroupKeys((current) => {
      const next = new Set(current);
      if (next.has(groupKey)) next.delete(groupKey);
      else next.add(groupKey);
      return next;
    });
  }

  if (!memberUserKey) {
    return (
      <p className="text-sm text-muted-foreground">
        Sign in to load award-radar signals.
      </p>
    );
  }

  if (signals === undefined) {
    return <OperationalSkeletonList rows={6} />;
  }

  return (
    <div className="space-y-4">
      <DcAwardRadarOpsPanel />

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
        <Label className="min-w-[14rem] flex-1">
          Market
          <Input
            list={MARKET_DATALIST_ID}
            aria-label="Filter by market (any US market)"
            placeholder="Any US market (exact name)"
            value={marketDraft}
            onChange={(event) => setMarketDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                applyMarketFilter();
              }
            }}
          />
        </Label>
        <datalist id={MARKET_DATALIST_ID}>
          {markets.map((item) => (
            <option key={item} value={item} />
          ))}
        </datalist>
        <div className="flex gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={applyMarketFilter}
          >
            Apply market
          </Button>
          {market ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => {
                setMarketDraft("");
                setMarket("");
              }}
            >
              Clear
            </Button>
          ) : null}
        </div>
        <Label className="min-w-[10rem]">
          Confidence
          <Select
            aria-label="Filter by confidence"
            value={confidence}
            onChange={(event) =>
              setConfidence(
                event.target.value as "" | DcAwardRadarConfidence,
              )
            }
          >
            <option value="">All confidence</option>
            {DC_AWARD_RADAR_CONFIDENCE.map((item) => (
              <option key={item} value={item}>
                {CONFIDENCE_LABEL[item]}
              </option>
            ))}
          </Select>
        </Label>
        <div
          className="inline-flex rounded-lg border border-border p-0.5"
          role="group"
          aria-label="Signal list view"
        >
          <Button
            type="button"
            size="sm"
            variant={viewMode === "grouped" ? "primary" : "ghost"}
            aria-pressed={viewMode === "grouped"}
            data-testid="dc-award-view-grouped"
            onClick={() => setViewMode("grouped")}
          >
            Grouped
          </Button>
          <Button
            type="button"
            size="sm"
            variant={viewMode === "flat" ? "primary" : "ghost"}
            aria-pressed={viewMode === "flat"}
            data-testid="dc-award-view-flat"
            onClick={() => setViewMode("flat")}
          >
            Flat
          </Button>
        </div>
        <p className="text-xs text-muted-foreground sm:ml-auto">
          {viewMode === "grouped"
            ? `${groups.length} campus${groups.length === 1 ? "" : "es"} · `
            : ""}
          {signals.length} signal{signals.length === 1 ? "" : "s"}
          {market ? ` in ${market}` : ""}
          {result?.truncated ? " (list capped)" : ""}
        </p>
      </div>
      <p className="text-xs text-muted-foreground">
        Market filter is exact free-text (indexed), not a hard-coded three-market
        list. Grouped view merges by campusKey (company fallback) and shows the
        owner/principal once — Equinix DC17 is not DC21. Flat is the raw
        permit list.
      </p>

      {signals.length === 0 ? (
        <OperationalEmptyState
          title="No award signals"
          description="Nothing matches these filters. Import a nationwide Hermes CSV or run the one-shot Phase 2 seed if the table is empty."
        />
      ) : (
        <div className="overflow-x-auto max-md:touch-pan-x">
          {viewMode === "grouped" ? (
            <table
              className={dataTableClassNames(
                settings.tableDensity,
                "w-full min-w-[64rem] text-left",
              )}
            >
              <thead>
                <tr className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="sticky top-0 bg-card px-2 py-2 font-medium">Market</th>
                  <th className="sticky top-0 bg-card px-2 py-2 font-medium">
                    Campus / company
                  </th>
                  <th className="sticky top-0 bg-card px-2 py-2 font-medium">
                    Owner / principal
                  </th>
                  <th className="sticky top-0 bg-card px-2 py-2 font-medium">Conf.</th>
                  <th className="sticky top-0 bg-card px-2 py-2 font-medium">Date</th>
                  <th className="sticky top-0 bg-card px-2 py-2 font-medium">Signals</th>
                </tr>
              </thead>
              <tbody>
                {groups.map((group) => (
                  <GroupedCampusRow
                    key={group.groupKey}
                    group={group}
                    expanded={!collapsedGroupKeys.has(group.groupKey)}
                    onToggle={() => toggleGroup(group.groupKey)}
                  />
                ))}
              </tbody>
            </table>
          ) : (
            <table
              className={dataTableClassNames(
                settings.tableDensity,
                "w-full min-w-[80rem] text-left",
              )}
            >
              <thead>
                <tr className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="sticky top-0 bg-card px-2 py-2 font-medium">Market</th>
                  <th className="sticky top-0 bg-card px-2 py-2 font-medium">Project</th>
                  <th className="sticky top-0 bg-card px-2 py-2 font-medium">Stage</th>
                  <th className="sticky top-0 bg-card px-2 py-2 font-medium">Company</th>
                  <th className="sticky top-0 bg-card px-2 py-2 font-medium">
                    Owner / principal
                  </th>
                  <th className="sticky top-0 bg-card px-2 py-2 font-medium">Conf.</th>
                  <th className="sticky top-0 bg-card px-2 py-2 font-medium">Date</th>
                  <th className="sticky top-0 bg-card px-2 py-2 font-medium">
                    Why it matters
                  </th>
                  <th className="sticky top-0 bg-card px-2 py-2 font-medium">Source</th>
                </tr>
              </thead>
              <tbody>
                {signals.map((row) => (
                  <FlatSignalRow
                    key={row._id}
                    row={row}
                    expanded={expandedIds.has(row._id)}
                    onToggle={() => toggleExpanded(row._id)}
                  />
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}

export function DcAwardRadarClient() {
  return (
    <PageErrorBoundary>
      <div className="mx-auto min-h-0 w-full max-w-7xl flex-1 px-4 py-6 sm:px-6">
        <header className="mb-6 border-b border-border pb-4">
          <nav aria-label="Breadcrumb" className="mb-3 text-sm text-muted-foreground">
            <Link href="/operations" className="hover:text-foreground hover:underline">
              Operations
            </Link>
            <span aria-hidden> › </span>
            <span className="font-medium text-foreground">DC award radar</span>
          </nav>
          <div className="flex flex-wrap items-start gap-3">
            <Radar className="mt-0.5 h-8 w-8 text-primary" aria-hidden />
            <div>
              <h1 className="text-xl font-semibold tracking-tight">
                Data-center award radar
              </h1>
              <p className="text-sm text-muted-foreground">
                Public permit, registration, and construction signals for DLC —
                nationwide. Grouped view shows one owner/principal per campus
                (or company) with child permits nested. Equinix DC17 is not
                DC21. GHL sync and outbound messages are out of scope.
              </p>
            </div>
          </div>
        </header>
        <ConvexQueryBoundary
          fallback={
            <p className="text-sm text-destructive">
              Could not load award-radar signals. Refresh after Convex has this
              function deployed.
            </p>
          }
        >
          <RadarTable />
        </ConvexQueryBoundary>
      </div>
    </PageErrorBoundary>
  );
}
