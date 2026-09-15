import type { DcAwardRadarLeadStats } from "@/lib/dcAwardRadarStats";

const CONTACT_UNIQUENESS_TITLE =
  "Unique contacts: company + contact name when both are present; otherwise email, phone, or LinkedIn. Campus children that share a key count once.";

type StatChip = {
  id: string;
  label: string;
  value: number;
  title?: string;
};

function chipsForStats(
  stats: DcAwardRadarLeadStats,
  viewMode: "grouped" | "flat",
  statsNote: string | null,
  statsSource: "server" | "loaded",
  statsPartial: boolean,
): StatChip[] {
  const note = statsNote ? ` (${statsNote})` : "";
  const scope =
    statsSource === "server"
      ? statsPartial
        ? "bounded full-filter scan"
        : "full filtered result set"
      : "loaded filtered list";
  const chips: StatChip[] = [
    {
      id: "signals",
      label: "Signals",
      value: stats.signalCount,
      title: `Permit / news rows in the ${scope}${note}`,
    },
  ];
  if (viewMode === "grouped") {
    chips.push({
      id: "campuses",
      label: "Campuses",
      value: stats.campusGroupCount,
      title: `Campus groups in the ${scope} (company fallback)${note}`,
    });
  }
  chips.push(
    {
      id: "contacts",
      label: "Contacts",
      value: stats.uniqueContactCount,
      title: CONTACT_UNIQUENESS_TITLE + note,
    },
    {
      id: "phone",
      label: "Phone",
      value: stats.contactsWithPhone,
      title: `Unique contacts with a non-empty phone${note}`,
    },
    {
      id: "email",
      label: "Email",
      value: stats.contactsWithEmail,
      title: `Unique contacts with a non-empty email${note}`,
    },
    {
      id: "linkedin",
      label: "LinkedIn",
      value: stats.contactsWithLinkedIn,
      title: `Unique contacts with a LinkedIn URL${note}`,
    },
    {
      id: "cell",
      label: "Cell",
      value: stats.contactsWithCell,
      title: `Unique contacts with phoneType = cell${note}`,
    },
    {
      id: "high",
      label: "High conf.",
      value: stats.highConfidenceSignalCount,
      title: `High-confidence signals in the ${scope}${note}`,
    },
  );
  return chips;
}

export function DcAwardRadarLeadStatsBar({
  stats,
  viewMode,
  truncated,
  loadedCount,
  listStatus,
  market,
  contactFiltersActive = false,
  hitPageCap = false,
  statsSource = "loaded",
  statsPartial = false,
  statsLoading = false,
  statsNote = null,
}: {
  stats: DcAwardRadarLeadStats;
  viewMode: "grouped" | "flat";
  truncated: boolean;
  loadedCount: number;
  listStatus: string;
  market: string;
  contactFiltersActive?: boolean;
  /** True when Load-all hit the hard page cap (more may still exist). */
  hitPageCap?: boolean;
  statsSource?: "server" | "loaded";
  statsPartial?: boolean;
  statsLoading?: boolean;
  statsNote?: string | null;
}) {
  const fullFilter = statsSource === "server" && !statsPartial && !statsLoading;
  const chips = chipsForStats(
    stats,
    viewMode,
    statsNote,
    statsSource,
    statsPartial,
  );
  return (
    <div
      data-testid="dc-award-lead-stats"
      data-stats-source={statsSource}
      data-stats-partial={statsPartial ? "true" : "false"}
      data-stats-loading={statsLoading ? "true" : "false"}
      aria-busy={statsLoading || undefined}
      className="flex flex-col gap-1.5"
    >
      <p id="dc-award-lead-stats-help" className="sr-only">
        {CONTACT_UNIQUENESS_TITLE} Counts follow the market, confidence,
        category, and contact-channel filters.
        {fullFilter
          ? " Lead chips are full-filter totals from a bounded server scan."
          : statsLoading
            ? " Full-filter totals are loading."
            : statsPartial
              ? " Lead chips are a bounded scan or loaded pages — more may exist."
              : " Lead chips use loaded pages only."}
      </p>
      <ul
        aria-label="Lead counts for current filters"
        aria-describedby="dc-award-lead-stats-help"
        className="flex flex-wrap gap-1.5"
      >
        {chips.map((chip) => (
          <li key={chip.id}>
            <span
              data-testid={`dc-award-stat-${chip.id}`}
              title={chip.title}
              className="inline-flex items-center gap-1 rounded-full border border-border/40 bg-muted/20 px-2 py-0.5 text-[11px] leading-5"
            >
              <span className="text-muted-foreground">{chip.label}</span>
              <span className="font-semibold tabular-nums text-foreground">
                {chip.value}
              </span>
            </span>
          </li>
        ))}
      </ul>
      {market ||
      truncated ||
      hitPageCap ||
      contactFiltersActive ||
      loadedCount > 0 ||
      statsLoading ||
      statsPartial ? (
        <p
          className="text-[11px] text-muted-foreground"
          data-testid="dc-award-lead-stats-footnote"
        >
          {market ? `Filtered to ${market}` : "All markets"}
          {contactFiltersActive ? " · contact filters on" : ""}
          {statsNote ? ` · stats ${statsNote}` : ""}
          {" · "}
          {listStatus}
        </p>
      ) : null}
    </div>
  );
}
