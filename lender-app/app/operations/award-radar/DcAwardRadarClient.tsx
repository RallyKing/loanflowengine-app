"use client";

import Link from "next/link";
import {
  Fragment,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useAction, useConvex, useQuery } from "convex/react";
import { ChevronDown, ChevronRight, Radar } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { PageErrorBoundary } from "@/components/PageErrorBoundary";
import { ConvexQueryBoundary } from "@/components/ConvexQueryBoundary";
import { Button } from "@/components/ui/Button";
import { useOperationalConfirmOptional } from "@/components/ui/OperationalConfirmDialog";
import { Input, Label, Select } from "@/components/ui/Input";
import { OperationalEmptyState } from "@/components/ui/OperationalEmptyState";
import { OperationalSkeletonList } from "@/components/ui/OperationalSkeleton";
import { cn } from "@/lib/cn";
import { dataTableClassNames } from "@/lib/dataTableClasses";
import {
  DC_AWARD_RADAR_CONFIDENCE,
  dcAwardCategoryUiLabel,
  dcAwardEmailUiLabel,
  dcAwardPhoneUiLabel,
  dcAwardSafeHttpUrl,
  type DcAwardRadarCategory,
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
import {
  DEFAULT_DC_AWARD_GROUP_EXPANSION,
  areAllDcAwardCampusGroupsCollapsed,
  areAllDcAwardCampusGroupsExpanded,
  collapseAllDcAwardCampusGroups,
  expandAllDcAwardCampusGroups,
  isDcAwardCampusGroupExpanded,
  persistDcAwardRadarGroupExpansion,
  readDcAwardRadarGroupExpansion,
  toggleDcAwardCampusGroup,
} from "@/lib/dcAwardRadarGroupExpansion";
import {
  collectUniqueDcAwardContacts,
  filterSignalsByContactFilters,
  toggleDcAwardContactFilter,
  type DcAwardRadarContactFilterId,
} from "@/lib/dcAwardRadarContacts";
import {
  describeDcAwardGhlSendBatch,
  selectDcAwardGhlContactBatch,
  uniqueContactToGhlPush,
} from "@/lib/dcAwardRadarGhl";
import {
  buildDcAwardRadarContactsCsv,
  buildDcAwardRadarGhlHandoffCsv,
  dcAwardRadarContactsCsvFilename,
  dcAwardRadarGhlHandoffCsvFilename,
} from "@/lib/export/dcAwardRadarContactsExport";
import { downloadTextFile } from "@/lib/export/downloadClient";
import {
  summarizeDcAwardRadarLeads,
  type DcAwardRadarLeadStats,
} from "@/lib/dcAwardRadarStats";
import { resolveDcAwardRadarLeadStatsDisplay } from "@/lib/dcAwardRadarLeadStatsScan";
import {
  DC_AWARD_RADAR_MAX_LOAD_ALL_PAGES,
  DC_AWARD_RADAR_PAGE_SIZE,
  dcAwardRadarEmptyButMoreAvailable,
  dcAwardRadarGhlRequiresLoadAllFirst,
  dcAwardRadarLoadAllCanContinue,
  formatDcAwardRadarEmptyButMoreCopy,
  formatDcAwardRadarGhlTruncatedCaveat,
  formatDcAwardRadarListStatus,
  mergeDcAwardRadarSignalPages,
} from "@/lib/dcAwardRadarPagination";
import { useActorUserKey } from "@/lib/useActorUserKey";
import { useUserSettings } from "@/lib/userSettingsContext";
import {
  DcAwardRadarContactActions,
  DcAwardRadarContactFilterChips,
} from "./DcAwardRadarContactTools";
import { DcAwardRadarLeadStatsBar } from "./DcAwardRadarLeadStatsBar";
import { DcAwardRadarOpsPanel } from "./DcAwardRadarOpsPanel";

type RadarViewMode = "grouped" | "flat";

/** List filter: All, stored verticals, or data_center + blank legacy DC rows. */
type CategoryFilter = "" | DcAwardRadarCategory | "data_center_or_blank";

type DcAwardRadarLeadStatsQueryArgs =
  | "skip"
  | {
      memberUserKey: string;
      market?: string;
      confidence?: DcAwardRadarConfidence;
      category?: Exclude<CategoryFilter, "">;
      contactFilters?: DcAwardRadarContactFilterId[];
    };

function DcAwardRadarConnectedLeadStats({
  leadStatsArgs,
  loadedLeadStats,
  listTruncated,
  hitPageCap,
  viewMode,
  loadedCount,
  listStatus,
  market,
  contactFiltersActive,
}: {
  leadStatsArgs: DcAwardRadarLeadStatsQueryArgs;
  loadedLeadStats: DcAwardRadarLeadStats;
  listTruncated: boolean;
  hitPageCap: boolean;
  viewMode: RadarViewMode;
  loadedCount: number;
  listStatus: string;
  market: string;
  contactFiltersActive: boolean;
}) {
  const serverLeadStats = useQuery(
    api.dcAwardSignals.leadStats,
    leadStatsArgs,
  );
  const leadStatsDisplay = resolveDcAwardRadarLeadStatsDisplay({
    server: serverLeadStats,
    loaded: loadedLeadStats,
    listTruncated,
    hitPageCap,
  });
  return (
    <DcAwardRadarLeadStatsBar
      stats={leadStatsDisplay.stats}
      viewMode={viewMode}
      truncated={listTruncated}
      loadedCount={loadedCount}
      listStatus={listStatus}
      market={market}
      contactFiltersActive={contactFiltersActive}
      hitPageCap={hitPageCap}
      statsSource={leadStatsDisplay.source}
      statsPartial={leadStatsDisplay.partial}
      statsLoading={leadStatsDisplay.statsLoading}
      statsNote={leadStatsDisplay.note}
    />
  );
}

type DcAwardRadarListSignal = DcAwardRadarGroupableRow & {
  category?: DcAwardRadarCategory;
  contactTitle?: string;
  emailType?: DcAwardRadarEmailType;
  phoneType?: DcAwardRadarPhoneType;
  companyWebsite?: string;
  contactNotes?: string;
  sourceKey: string;
};

const CONFIDENCE_LABEL: Record<DcAwardRadarConfidence, string> = {
  high: "High",
  med: "Med",
  low: "Low",
};

const CATEGORY_FILTER_OPTIONS: Array<{
  value: CategoryFilter;
  label: string;
}> = [
  { value: "", label: "All verticals" },
  { value: "hospital", label: dcAwardCategoryUiLabel("hospital") },
  { value: "dot_civil", label: dcAwardCategoryUiLabel("dot_civil") },
  {
    value: "industrial_warehouse",
    label: dcAwardCategoryUiLabel("industrial_warehouse"),
  },
  {
    value: "k12_higher_ed",
    label: dcAwardCategoryUiLabel("k12_higher_ed"),
  },
  { value: "multifamily", label: dcAwardCategoryUiLabel("multifamily") },
  {
    value: "hospitality_mixed_use",
    label: dcAwardCategoryUiLabel("hospitality_mixed_use"),
  },
  {
    value: "federal_municipal",
    label: dcAwardCategoryUiLabel("federal_municipal"),
  },
  {
    value: "energy_renewables",
    label: dcAwardCategoryUiLabel("energy_renewables"),
  },
  {
    value: "data_center_or_blank",
    label: "Data center (incl. blank)",
  },
  { value: "data_center", label: "Data center (explicit)" },
];

const MARKET_DATALIST_ID = "dc-award-radar-markets";

function SafeExternalLink({
  href,
  children,
}: {
  href?: string;
  children: ReactNode;
}) {
  const safe = dcAwardSafeHttpUrl(href);
  if (!safe) return <>{href || "—"}</>;
  return (
    <a
      href={safe}
      target="_blank"
      rel="noopener noreferrer"
      className="break-all text-primary hover:underline"
    >
      {children}
    </a>
  );
}

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
          <SafeExternalLink href={linkedinUrl}>{linkedinUrl}</SafeExternalLink>
        </dd>
      </div>
      <div>
        <dt className="text-muted-foreground">Company website</dt>
        <dd>
          <SafeExternalLink href={companyWebsite}>
            {companyWebsite}
          </SafeExternalLink>
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
  testId,
}: {
  contact: DcAwardRadarListContact;
  expanded: boolean;
  onToggle: () => void;
  buttonId: string;
  testId?: string;
}) {
  const hasContact = dcAwardRowHasContact(contact);
  return (
    <button
      type="button"
      id={buttonId}
      data-testid={testId}
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
          <SafeExternalLink href={row.sourceUrl}>Open source</SafeExternalLink>
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
        data-expanded={expanded ? "true" : "false"}
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
            testId="dc-award-group-contact"
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
              data-testid="dc-award-group-children"
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
              <div>
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
                          <SafeExternalLink href={child.sourceUrl}>
                            Open source
                          </SafeExternalLink>
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
  const convex = useConvex();
  const { settings } = useUserSettings();
  const confirmApi = useOperationalConfirmOptional();
  const pushFilteredContactsToGhl = useAction(
    api.dcAwardRadarActions.pushFilteredContactsToGhl,
  );
  const [marketDraft, setMarketDraft] = useState("");
  const [market, setMarket] = useState("");
  const [confidence, setConfidence] = useState<"" | DcAwardRadarConfidence>("");
  const [category, setCategory] = useState<CategoryFilter>("");
  const [contactFilters, setContactFilters] = useState<
    ReadonlySet<DcAwardRadarContactFilterId>
  >(() => new Set());
  const [viewMode, setViewMode] = useState<RadarViewMode>("grouped");
  const [expandedIds, setExpandedIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [groupExpansion, setGroupExpansion] = useState(
    DEFAULT_DC_AWARD_GROUP_EXPANSION,
  );
  const [groupExpansionHydrated, setGroupExpansionHydrated] = useState(false);
  const [contactActionStatus, setContactActionStatus] = useState<
    | { kind: "idle" }
    | { kind: "busy"; label: string }
    | { kind: "ok"; detail: string }
    | { kind: "error"; message: string }
  >({ kind: "idle" });
  /** Rows from Load more / Load all after the reactive first page. */
  const [appendedSignals, setAppendedSignals] = useState<
    DcAwardRadarListSignal[]
  >([]);
  const [continueCursor, setContinueCursor] = useState<string | null>(null);
  const [listTruncated, setListTruncated] = useState(false);
  const [pagesLoaded, setPagesLoaded] = useState(0);
  const [hitPageCap, setHitPageCap] = useState(false);
  const [pageBusy, setPageBusy] = useState<
    | { kind: "idle" }
    | { kind: "more" }
    | { kind: "all"; loadedCount: number }
  >({ kind: "idle" });
  const [pageError, setPageError] = useState<string | null>(null);
  /**
   * Generation token: filter / firstPage resets bump this so in-flight
   * Load more / Load all ignore stale results and do not corrupt busy state.
   */
  const loadGenerationRef = useRef(0);

  useEffect(() => {
    setGroupExpansion(readDcAwardRadarGroupExpansion());
    setGroupExpansionHydrated(true);
  }, []);

  useEffect(() => {
    if (!groupExpansionHydrated) return;
    persistDcAwardRadarGroupExpansion(groupExpansion);
  }, [groupExpansion, groupExpansionHydrated]);

  const listArgs = useMemo(
    () =>
      memberUserKey
        ? {
            memberUserKey,
            cursor: null as string | null,
            pageSize: DC_AWARD_RADAR_PAGE_SIZE,
            ...(market ? { market } : {}),
            ...(confidence ? { confidence } : {}),
            ...(category ? { category } : {}),
          }
        : null,
    [memberUserKey, market, confidence, category],
  );

  const firstPage = useQuery(
    api.dcAwardSignals.list,
    listArgs ?? "skip",
  );

  const contactFilterList = useMemo(
    () => [...contactFilters].sort(),
    [contactFilters],
  );
  const leadStatsArgs = useMemo(
    () =>
      memberUserKey
        ? {
            memberUserKey,
            ...(market ? { market } : {}),
            ...(confidence ? { confidence } : {}),
            ...(category ? { category } : {}),
            ...(contactFilterList.length > 0
              ? { contactFilters: contactFilterList }
              : {}),
          }
        : "skip",
    [memberUserKey, market, confidence, category, contactFilterList],
  );

  // When filters change, `firstPage` goes undefined then refreshes — drop
  // appended pages so GA/NC loads are not mixed with a stale first page.
  // Bump generation so mid-flight Load more / Load all cannot append or
  // clear busy after this reset.
  useEffect(() => {
    loadGenerationRef.current += 1;
    setAppendedSignals([]);
    setHitPageCap(false);
    setPageBusy({ kind: "idle" });
    setPageError(null);
    if (!firstPage) {
      setContinueCursor(null);
      setListTruncated(false);
      setPagesLoaded(0);
      return;
    }
    setContinueCursor(firstPage.continueCursor);
    setListTruncated(firstPage.truncated);
    setPagesLoaded(1);
  }, [firstPage]);

  const signals = firstPage
    ? mergeDcAwardRadarSignalPages(
        firstPage.signals as DcAwardRadarListSignal[],
        appendedSignals,
      )
    : undefined;
  const filteredSignals = useMemo(() => {
    if (!signals) return [];
    return filterSignalsByContactFilters(signals, contactFilters);
  }, [signals, contactFilters]);
  const groups = useMemo(
    () => groupDcAwardRadarSignals(filteredSignals),
    [filteredSignals],
  );
  const uniqueContacts = useMemo(
    () => collectUniqueDcAwardContacts(filteredSignals),
    [filteredSignals],
  );
  const ghlSendBatch = useMemo(
    () => selectDcAwardGhlContactBatch(uniqueContacts),
    [uniqueContacts],
  );
  const groupKeys = useMemo(
    () => groups.map((group) => group.groupKey),
    [groups],
  );
  const allGroupsCollapsed = areAllDcAwardCampusGroupsCollapsed(
    groupKeys,
    groupExpansion,
  );
  const allGroupsExpanded = areAllDcAwardCampusGroupsExpanded(
    groupKeys,
    groupExpansion,
  );
  const loadedLeadStats = useMemo(
    () => summarizeDcAwardRadarLeads(filteredSignals, groups.length),
    [filteredSignals, groups],
  );
  const contactFiltersActive = contactFilters.size > 0;
  const markets = useMemo(() => {
    const fromData = new Set<string>();
    for (const row of signals ?? []) {
      if (row.market) fromData.add(row.market);
    }
    return [...fromData].sort((a, b) => a.localeCompare(b));
  }, [signals]);
  const listStatus = formatDcAwardRadarListStatus({
    loadedCount: signals?.length ?? 0,
    truncated: listTruncated,
    pageSize: DC_AWARD_RADAR_PAGE_SIZE,
    hitPageCap,
  });
  const canLoadMore =
    pageBusy.kind === "idle" &&
    dcAwardRadarLoadAllCanContinue({
      pagesLoaded,
      maxPages: DC_AWARD_RADAR_MAX_LOAD_ALL_PAGES,
      truncated: listTruncated,
      continueCursor,
    });
  const emptyButMore = dcAwardRadarEmptyButMoreAvailable({
    loadedCount: signals?.length ?? 0,
    truncated: listTruncated,
    continueCursor,
  });
  const emptyButMoreCopy = formatDcAwardRadarEmptyButMoreCopy();
  const showPaginationControls =
    emptyButMore ||
    listTruncated ||
    hitPageCap ||
    pageBusy.kind !== "idle" ||
    pageError !== null ||
    pagesLoaded > 1 ||
    (signals !== undefined && signals.length > 0);

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
    setGroupExpansion((current) => toggleDcAwardCampusGroup(groupKey, current));
  }

  async function fetchNextPage(cursor: string) {
    if (!listArgs) {
      throw new Error("Sign in required to load more award-radar signals.");
    }
    return await convex.query(api.dcAwardSignals.list, {
      ...listArgs,
      cursor,
    });
  }

  async function handleLoadMore() {
    if (!canLoadMore || !continueCursor) return;
    const generation = loadGenerationRef.current;
    setPageBusy({ kind: "more" });
    setPageError(null);
    try {
      const page = await fetchNextPage(continueCursor);
      if (generation !== loadGenerationRef.current) return;
      setAppendedSignals((current) =>
        mergeDcAwardRadarSignalPages(
          current,
          page.signals as DcAwardRadarListSignal[],
        ),
      );
      const nextPages = pagesLoaded + 1;
      setPagesLoaded(nextPages);
      setContinueCursor(page.continueCursor);
      setListTruncated(page.truncated);
      if (
        page.truncated &&
        nextPages >= DC_AWARD_RADAR_MAX_LOAD_ALL_PAGES
      ) {
        setHitPageCap(true);
      }
    } catch (error) {
      if (generation !== loadGenerationRef.current) return;
      setPageError(
        error instanceof Error
          ? error.message
          : "Failed to load the next page of signals.",
      );
    } finally {
      if (generation === loadGenerationRef.current) {
        setPageBusy({ kind: "idle" });
      }
    }
  }

  async function handleLoadAll() {
    if (!listTruncated || !continueCursor || pageBusy.kind !== "idle") return;
    const generation = loadGenerationRef.current;
    setPageBusy({ kind: "all", loadedCount: signals?.length ?? 0 });
    setPageError(null);
    let cursor: string | null = continueCursor;
    let truncated: boolean = listTruncated;
    let pages = pagesLoaded;
    let appended = appendedSignals;
    let loadedCount = signals?.length ?? 0;
    try {
      while (
        generation === loadGenerationRef.current &&
        dcAwardRadarLoadAllCanContinue({
          pagesLoaded: pages,
          maxPages: DC_AWARD_RADAR_MAX_LOAD_ALL_PAGES,
          truncated,
          continueCursor: cursor,
        })
      ) {
        const page = await fetchNextPage(cursor!);
        if (generation !== loadGenerationRef.current) return;
        appended = mergeDcAwardRadarSignalPages(
          appended,
          page.signals as DcAwardRadarListSignal[],
        );
        pages += 1;
        cursor = page.continueCursor;
        truncated = page.truncated;
        loadedCount = mergeDcAwardRadarSignalPages(
          (firstPage?.signals as DcAwardRadarListSignal[] | undefined) ?? [],
          appended,
        ).length;
        setAppendedSignals(appended);
        setPagesLoaded(pages);
        setContinueCursor(cursor);
        setListTruncated(truncated);
        setPageBusy({ kind: "all", loadedCount });
      }
      if (generation !== loadGenerationRef.current) return;
      if (truncated && pages >= DC_AWARD_RADAR_MAX_LOAD_ALL_PAGES) {
        setHitPageCap(true);
      }
    } catch (error) {
      if (generation !== loadGenerationRef.current) return;
      setPageError(
        error instanceof Error
          ? error.message
          : "Failed while loading all award-radar pages.",
      );
    } finally {
      if (generation === loadGenerationRef.current) {
        setPageBusy({ kind: "idle" });
      }
    }
  }

  function downloadFilteredContacts(kind: "contacts" | "ghl") {
    if (kind === "ghl") {
      const csv = buildDcAwardRadarGhlHandoffCsv(
        ghlSendBatch.batch,
        ghlSendBatch,
      );
      downloadTextFile(
        dcAwardRadarGhlHandoffCsvFilename(),
        csv,
        "text/csv;charset=utf-8",
        { utf8Bom: true },
      );
      return;
    }
    downloadTextFile(
      dcAwardRadarContactsCsvFilename(),
      buildDcAwardRadarContactsCsv(uniqueContacts),
      "text/csv;charset=utf-8",
      { utf8Bom: true },
    );
  }

  function handleDownloadContacts() {
    if (uniqueContacts.length === 0) return;
    downloadFilteredContacts("contacts");
    setContactActionStatus({
      kind: "ok",
      detail: `Downloaded full filtered set: ${uniqueContacts.length} unique contact${
        uniqueContacts.length === 1 ? "" : "s"
      }.`,
    });
  }

  async function handleGhlPush() {
    if (ghlSendBatch.sent === 0) {
      setContactActionStatus({
        kind: "error",
        message:
          "No GHL-eligible contacts (need email or phone). Nothing sent.",
      });
      return;
    }
    if (
      dcAwardRadarGhlRequiresLoadAllFirst({
        truncated: listTruncated,
        hitPageCap,
      })
    ) {
      setContactActionStatus({
        kind: "error",
        message:
          "List is still truncated. Use Load all (or Load more until exhausted) before sending to HighLevel — send uses loaded pages only.",
      });
      return;
    }
    const sendCopy = describeDcAwardGhlSendBatch(ghlSendBatch);
    const truncatedCaveat = listTruncated
      ? formatDcAwardRadarGhlTruncatedCaveat({ hitPageCap })
      : null;
    const confirmed = confirmApi
      ? await confirmApi.confirm({
          title: "Send filtered contacts to HighLevel",
          entityName: sendCopy.entityName,
          impact:
            "Tag/create only. No SMS, email, sequences, workflows, campaigns, or Conversation AI.",
          preview: {
            rows: [
              {
                label: "Filtered unique",
                value: String(ghlSendBatch.uniqueTotal),
              },
              {
                label: "GHL-eligible (email or phone)",
                value: String(ghlSendBatch.total),
              },
              {
                label: "This send (all eligible)",
                value: String(ghlSendBatch.sent),
              },
              {
                label: "Internal write chunks",
                value: String(ghlSendBatch.chunkCount),
              },
              {
                label: "Tags",
                value: "award-radar + category tag when known",
              },
              {
                label: "Source",
                value: "award-radar or award-radar | LinkedIn: …",
              },
              { label: "Outbound", value: "None — no email or SMS" },
            ],
          },
          cascade: [
            {
              text: "Creates or updates HighLevel contacts. Existing HighLevel tags are not overwritten — tags are appended.",
            },
            ...(sendCopy.chunkNote
              ? [
                  {
                    text: sendCopy.chunkNote.trim(),
                    tone: "attention" as const,
                  },
                ]
              : []),
            ...(truncatedCaveat
              ? [
                  {
                    text: truncatedCaveat,
                    tone: "attention" as const,
                  },
                ]
              : []),
            {
              text: "If HighLevel credentials are unset on Convex, a tag-only CSV downloads for the same full eligible send set (not a truncated subset).",
              tone: "attention",
            },
          ],
          confirmLabel: `Send all ${ghlSendBatch.sent} eligible`,
          cancelLabel: "Cancel",
          variant: "transfer",
          testId: "dc-award-ghl-confirm",
        })
      : window.confirm(
          truncatedCaveat
            ? `${sendCopy.confirmPrompt}\n\n${truncatedCaveat}`
            : sendCopy.confirmPrompt,
        );
    if (!confirmed) return;

    setContactActionStatus({ kind: "busy", label: "Send to GHL" });
    try {
      const result = await pushFilteredContactsToGhl({
        memberUserKey: memberUserKey || undefined,
        contacts: ghlSendBatch.batch.map(uniqueContactToGhlPush),
      });
      const sendNote = ` Sending all ${ghlSendBatch.sent} GHL-eligible.`;
      if (!result.configured) {
        downloadFilteredContacts("ghl");
        setContactActionStatus({
          kind: "error",
          message: `HighLevel is not configured (${result.skipped} skipped).${sendNote} Downloaded tag-only CSV for that same full eligible set. Use Download contacts CSV for the full filtered unique set. No SMS or email.`,
        });
        return;
      }
      const tagNote =
        result.tagFailed > 0
          ? ` ${result.tagFailed} tag-add failed.`
          : "";
      const counts = `${result.created} created, ${result.updated} updated, ${result.skipped} skipped.${sendNote}${tagNote} Tag-only — no email/SMS.`;
      if (!result.ok) {
        setContactActionStatus({
          kind: "error",
          message:
            result.reason === "all_skipped_or_failed"
              ? `HighLevel write failed: ${counts}`
              : `HighLevel push did not succeed: ${counts}`,
        });
        return;
      }
      setContactActionStatus({
        kind: "ok",
        detail: counts,
      });
    } catch (error) {
      setContactActionStatus({
        kind: "error",
        message:
          error instanceof Error
            ? error.message
            : "HighLevel push failed.",
      });
    }
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
        <Label className="min-w-[12rem]">
          Vertical
          <Select
            aria-label="Filter by category vertical"
            data-testid="dc-award-category-filter"
            value={category}
            onChange={(event) =>
              setCategory(event.target.value as CategoryFilter)
            }
          >
            {CATEGORY_FILTER_OPTIONS.map((option) => (
              <option key={option.value || "all"} value={option.value}>
                {option.label}
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
        {viewMode === "grouped" ? (
          <div
            className="flex flex-wrap gap-2"
            role="group"
            aria-label="Campus group expansion"
          >
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setGroupExpansion(collapseAllDcAwardCampusGroups())}
              disabled={groupKeys.length === 0 || allGroupsCollapsed}
              aria-label="Collapse all campus groups"
              data-testid="dc-award-collapse-all"
            >
              Collapse all
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setGroupExpansion(expandAllDcAwardCampusGroups())}
              disabled={groupKeys.length === 0 || allGroupsExpanded}
              aria-label="Expand all campus groups"
              data-testid="dc-award-expand-all"
            >
              Expand all
            </Button>
          </div>
        ) : null}
      </div>
      <div className="space-y-2">
        <DcAwardRadarContactFilterChips
          filters={contactFilters}
          onToggle={(id) =>
            setContactFilters((current) =>
              toggleDcAwardContactFilter(current, id),
            )
          }
        />
        {contactFiltersActive ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => setContactFilters(new Set())}
            data-testid="dc-award-contact-filters-clear"
          >
            Clear contact filters
          </Button>
        ) : null}
        <DcAwardRadarContactActions
          uniqueCount={uniqueContacts.length}
          ghlEligibleCount={ghlSendBatch.total}
          ghlSendCount={ghlSendBatch.sent}
          downloadBusy={false}
          ghlBusy={contactActionStatus.kind === "busy"}
          onDownload={handleDownloadContacts}
          onGhlPush={() => void handleGhlPush()}
        />
        {contactActionStatus.kind === "ok" ? (
          <p
            className="text-xs text-emerald-800 dark:text-emerald-200"
            role="status"
            data-testid="dc-award-contact-action-toast"
          >
            {contactActionStatus.detail}
          </p>
        ) : null}
        {contactActionStatus.kind === "error" ? (
          <p
            className="text-xs text-destructive"
            role="alert"
            data-testid="dc-award-contact-action-error"
          >
            {contactActionStatus.message}
          </p>
        ) : null}
      </div>
      <ConvexQueryBoundary
        silent
        recoverOnKeys={[
          memberUserKey,
          market,
          confidence,
          category,
          contactFilterList.join(","),
        ]}
        fallback={
          <DcAwardRadarLeadStatsBar
            stats={loadedLeadStats}
            viewMode={viewMode}
            truncated={listTruncated}
            loadedCount={signals?.length ?? 0}
            listStatus={listStatus}
            market={market}
            contactFiltersActive={contactFiltersActive}
            hitPageCap={hitPageCap}
            statsSource="loaded"
            statsPartial={listTruncated || hitPageCap}
            statsNote="full-filter totals unavailable — showing loaded pages"
          />
        }
      >
        <DcAwardRadarConnectedLeadStats
          leadStatsArgs={leadStatsArgs}
          loadedLeadStats={loadedLeadStats}
          listTruncated={listTruncated}
          hitPageCap={hitPageCap}
          viewMode={viewMode}
          loadedCount={signals?.length ?? 0}
          listStatus={listStatus}
          market={market}
          contactFiltersActive={contactFiltersActive}
        />
      </ConvexQueryBoundary>
      <p className="text-xs text-muted-foreground">
        Market filter is exact free-text (indexed), not a hard-coded three-market
        list. Vertical filter uses optional `category` (`hospital` /
        `dot_civil` / `industrial_warehouse` / `k12_higher_ed` /
        `multifamily` / `hospitality_mixed_use` / `federal_municipal` /
        `energy_renewables` / `data_center`); legacy DC rows with blank
        category still appear under
        All and &quot;Data center (incl. blank)&quot;. Grouped view merges by
        campusKey (company fallback) and
        shows the owner/principal once — Equinix DC17 is not DC21. Collapse all
        hides child permits; owner/principal stays on the group header. Flat is
        the raw permit list. Contact chips dedupe campus children by company +
        name. Contact filters and CSV / GHL actions use those unique contacts.
        Lead chips prefer full-filter totals from a bounded server scan (not
        the first 200 list rows); table, CSV, and GHL still use loaded pages.
        List pages are {DC_AWARD_RADAR_PAGE_SIZE} rows each — use Load more /
        Load all to reach later markets for the table, CSV, and GHL send.
        HighLevel send requires Load all (or exhausted pages) first so the
        send is not a silent truncated subset.
      </p>

      {signals.length === 0 ? (
        <OperationalEmptyState
          title={
            emptyButMore ? emptyButMoreCopy.title : "No award signals"
          }
          description={
            emptyButMore
              ? emptyButMoreCopy.description
              : "Nothing matches these filters. Import a nationwide Hermes CSV or run the one-shot Phase 2 seed if the table is empty."
          }
        />
      ) : filteredSignals.length === 0 ? (
        <OperationalEmptyState
          title="No contacts match"
          description="Contact-channel filters hid every row. Clear Has phone / Has email / Has LinkedIn / Has cell / Missing phone / Missing email to see the list again."
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
                    expanded={isDcAwardCampusGroupExpanded(
                      group.groupKey,
                      groupExpansion,
                    )}
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
                {filteredSignals.map((row) => (
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
      {showPaginationControls ? (
        <div
          className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center"
          data-testid="dc-award-list-pagination"
        >
          <p
            className="text-xs text-muted-foreground"
            data-testid="dc-award-list-status"
            role="status"
          >
            {pageBusy.kind === "all"
              ? `Loading… ${pageBusy.loadedCount}`
              : listStatus}
            {pagesLoaded > 0
              ? ` · ${pagesLoaded} page${pagesLoaded === 1 ? "" : "s"}`
              : ""}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={!canLoadMore}
              onClick={() => void handleLoadMore()}
              data-testid="dc-award-load-more"
            >
              {pageBusy.kind === "more" ? "Loading…" : "Load more"}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={!canLoadMore}
              onClick={() => void handleLoadAll()}
              data-testid="dc-award-load-all"
            >
              {pageBusy.kind === "all" ? "Loading all…" : "Load all"}
            </Button>
          </div>
          {pageError ? (
            <p
              className="text-xs text-destructive"
              role="alert"
              data-testid="dc-award-pagination-error"
            >
              {pageError}
            </p>
          ) : null}
        </div>
      ) : null}
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
            <span className="font-medium text-foreground">Award Radar</span>
          </nav>
          <div className="flex flex-wrap items-start gap-3">
            <Radar className="mt-0.5 h-8 w-8 text-primary" aria-hidden />
            <div>
              <h1 className="text-xl font-semibold tracking-tight">
                Award Radar
              </h1>
              <p className="text-sm text-muted-foreground">
                Public permit, registration, and construction signals for DLC —
                nationwide. Grouped view shows one owner/principal per campus
                (or company) with child permits nested. Equinix DC17 is not
                DC21. HighLevel push is tag/create only — no SMS, email, or
                campaigns.
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
