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
): StatChip[] {
  const chips: StatChip[] = [
    {
      id: "signals",
      label: "Signals",
      value: stats.signalCount,
      title: "Permit / news rows in the current filtered list (capped at 200)",
    },
  ];
  if (viewMode === "grouped") {
    chips.push({
      id: "campuses",
      label: "Campuses",
      value: stats.campusGroupCount,
      title: "Campus groups in the current filtered list (company fallback)",
    });
  }
  chips.push(
    {
      id: "contacts",
      label: "Contacts",
      value: stats.uniqueContactCount,
      title: CONTACT_UNIQUENESS_TITLE,
    },
    {
      id: "phone",
      label: "Phone",
      value: stats.contactsWithPhone,
      title: "Unique contacts with a non-empty phone",
    },
    {
      id: "email",
      label: "Email",
      value: stats.contactsWithEmail,
      title: "Unique contacts with a non-empty email",
    },
    {
      id: "linkedin",
      label: "LinkedIn",
      value: stats.contactsWithLinkedIn,
      title: "Unique contacts with a LinkedIn URL",
    },
    {
      id: "cell",
      label: "Cell",
      value: stats.contactsWithCell,
      title: "Unique contacts with phoneType = cell",
    },
    {
      id: "high",
      label: "High conf.",
      value: stats.highConfidenceSignalCount,
      title: "High-confidence signals in the current filtered list",
    },
  );
  return chips;
}

export function DcAwardRadarLeadStatsBar({
  stats,
  viewMode,
  truncated,
  market,
}: {
  stats: DcAwardRadarLeadStats;
  viewMode: "grouped" | "flat";
  truncated: boolean;
  market: string;
}) {
  const chips = chipsForStats(stats, viewMode);
  return (
    <div
      data-testid="dc-award-lead-stats"
      className="flex flex-col gap-1.5"
    >
      <p id="dc-award-lead-stats-help" className="sr-only">
        {CONTACT_UNIQUENESS_TITLE} Counts follow the market and confidence
        filters. List is capped at 200 rows.
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
      {market || truncated ? (
        <p className="text-[11px] text-muted-foreground">
          {market ? `Filtered to ${market}` : "All markets on this page"}
          {truncated ? " · list capped at 200" : ""}
        </p>
      ) : null}
    </div>
  );
}
