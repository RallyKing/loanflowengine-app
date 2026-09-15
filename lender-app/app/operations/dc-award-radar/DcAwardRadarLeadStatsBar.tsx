import type { DcAwardRadarLeadStats } from "@/lib/dcAwardRadarStats";
import { formatDcAwardRadarLoadedStatsNote } from "@/lib/dcAwardRadarPagination";

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
  loadedStatsNote: string | null,
): StatChip[] {
  const loadedNote = loadedStatsNote ? ` (${loadedStatsNote})` : "";
  const chips: StatChip[] = [
    {
      id: "signals",
      label: "Signals",
      value: stats.signalCount,
      title: `Permit / news rows in the loaded filtered list${loadedNote}`,
    },
  ];
  if (viewMode === "grouped") {
    chips.push({
      id: "campuses",
      label: "Campuses",
      value: stats.campusGroupCount,
      title: `Campus groups in the loaded filtered list (company fallback)${loadedNote}`,
    });
  }
  chips.push(
    {
      id: "contacts",
      label: "Contacts",
      value: stats.uniqueContactCount,
      title: CONTACT_UNIQUENESS_TITLE + loadedNote,
    },
    {
      id: "phone",
      label: "Phone",
      value: stats.contactsWithPhone,
      title: `Unique contacts with a non-empty phone${loadedNote}`,
    },
    {
      id: "email",
      label: "Email",
      value: stats.contactsWithEmail,
      title: `Unique contacts with a non-empty email${loadedNote}`,
    },
    {
      id: "linkedin",
      label: "LinkedIn",
      value: stats.contactsWithLinkedIn,
      title: `Unique contacts with a LinkedIn URL${loadedNote}`,
    },
    {
      id: "cell",
      label: "Cell",
      value: stats.contactsWithCell,
      title: `Unique contacts with phoneType = cell${loadedNote}`,
    },
    {
      id: "high",
      label: "High conf.",
      value: stats.highConfidenceSignalCount,
      title: `High-confidence signals in the loaded filtered list${loadedNote}`,
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
}) {
  const loadedStatsNote = formatDcAwardRadarLoadedStatsNote({
    truncated,
    hitPageCap,
  });
  const chips = chipsForStats(stats, viewMode, loadedStatsNote);
  return (
    <div
      data-testid="dc-award-lead-stats"
      className="flex flex-col gap-1.5"
    >
      <p id="dc-award-lead-stats-help" className="sr-only">
        {CONTACT_UNIQUENESS_TITLE} Counts follow the market, confidence, and
        contact-channel filters. Lead chips use loaded pages only
        {truncated
          ? hitPageCap
            ? " — page cap reached; more may exist."
            : " until you Load more or Load all."
          : "."}
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
      {market || truncated || contactFiltersActive || loadedCount > 0 ? (
        <p
          className="text-[11px] text-muted-foreground"
          data-testid="dc-award-lead-stats-footnote"
        >
          {market ? `Filtered to ${market}` : "All markets on loaded pages"}
          {contactFiltersActive ? " · contact filters on" : ""}
          {loadedStatsNote ? ` · stats ${loadedStatsNote}` : ""}
          {" · "}
          {listStatus}
        </p>
      ) : null}
    </div>
  );
}
