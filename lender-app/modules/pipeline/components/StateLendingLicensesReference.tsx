"use client";

import Link from "next/link";

type StateEntry = { name: string; note: string };

const NO_LICENSE: StateEntry[] = [
  { name: "Alabama", note: "No license required" },
  { name: "Alaska", note: "No license required" },
  { name: "Arkansas", note: "No license required" },
  { name: "Delaware", note: "No license required" },
  { name: "Florida", note: "No license required" },
  { name: "Georgia", note: "No license required" },
  { name: "Hawaii", note: "No license required" },
  { name: "Illinois", note: "No license required" },
  { name: "Indiana", note: "No license required" },
  { name: "Iowa", note: "No license required" },
  { name: "Kansas", note: "No license required" },
  { name: "Kentucky", note: "No license required" },
  { name: "Louisiana", note: "No license required" },
  { name: "Maine", note: "No license required" },
  { name: "Michigan", note: "No license required" },
  { name: "Mississippi", note: "No license required" },
  { name: "Missouri", note: "No license required" },
  { name: "Montana", note: "No license required" },
  { name: "Nebraska", note: "No license required" },
  { name: "New Hampshire", note: "No license required" },
  { name: "North Dakota", note: "No license required" },
  { name: "Ohio", note: "No license required" },
  { name: "Oklahoma", note: "No license required" },
  { name: "Rhode Island", note: "No license required" },
  { name: "South Carolina", note: "No license required" },
  { name: "Tennessee", note: "No license required" },
  { name: "Texas", note: "No license required" },
  { name: "Vermont", note: "No license required" },
  { name: "Virginia", note: "No license required" },
  {
    name: "Washington",
    note: "No license required (commercial loans exempt)",
  },
  { name: "West Virginia", note: "No license required" },
  { name: "Wyoming", note: "No license required" },
];

const CONDITIONAL: StateEntry[] = [
  { name: "Colorado", note: "Conditional" },
  { name: "Connecticut", note: "Conditional" },
  { name: "Massachusetts", note: "Conditional" },
  { name: "Minnesota", note: "Conditional" },
  { name: "New Jersey", note: "Conditional" },
  { name: "New York", note: "Conditional" },
  { name: "Pennsylvania", note: "Conditional" },
  { name: "Wisconsin", note: "Conditional" },
];

const LICENSE_REQUIRED: StateEntry[] = [
  {
    name: "Arizona",
    note: "License required (Commercial Mortgage Broker License)",
  },
  {
    name: "California",
    note: "License required (DRE or DFPI depending on activity)",
  },
  {
    name: "Idaho",
    note: "License required (varies by collateral / exemptions)",
  },
  {
    name: "Maryland",
    note: "License required (Mortgage Lender / Mortgage Broker License applies)",
  },
  { name: "Nevada", note: "License required (Commercial Mortgage Broker)" },
  { name: "New Mexico", note: "License required" },
  {
    name: "North Carolina",
    note: "License required (Mortgage Broker Act can apply)",
  },
  { name: "Oregon", note: "License required" },
  {
    name: "South Dakota",
    note: "License required in certain mortgage scenarios",
  },
  {
    name: "Utah",
    note: "License required (mortgage-related licensing applies)",
  },
];

function Column({
  title,
  accent,
  entries,
}: {
  title: string;
  accent: "emerald" | "amber" | "rose";
  entries: StateEntry[];
}) {
  const styles = {
    emerald:
      "border-emerald-200 bg-emerald-50 dark:border-emerald-900/60 dark:bg-emerald-950/30",
    amber:
      "border-amber-200 bg-amber-50 dark:border-amber-900/60 dark:bg-amber-950/30",
    rose: "border-rose-200 bg-rose-50 dark:border-rose-900/60 dark:bg-rose-950/30",
  } as const;
  const badge = {
    emerald: "bg-emerald-600 text-white",
    amber: "bg-amber-500 text-amber-950",
    rose: "bg-rose-600 text-white",
  } as const;
  return (
    <section
      className={`flex flex-col gap-3 rounded-2xl border p-5 ${styles[accent]}`}
    >
      <header className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-semibold ${badge[accent]}`}
        >
          {entries.length}
        </span>
      </header>
      <ul className="flex flex-col divide-y divide-border/80 text-sm">
        {entries.map((e) => (
          <li key={e.name} className="flex flex-col gap-0.5 py-2">
            <span className="font-medium text-foreground">{e.name}</span>
            <span className="text-xs text-muted-foreground">{e.note}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function StateLendingLicensesReference({
  backHref,
  backLabel,
}: {
  backHref: string;
  backLabel: string;
}) {
  return (
    <div className="mx-auto flex min-w-0 w-full max-w-6xl flex-col gap-6 py-6 sm:gap-8 sm:py-10">
      <header className="flex flex-col gap-2 border-b border-border pb-6">
        <Link
          href={backHref}
          className="inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <path d="m15 18-6-6 6-6" />
          </svg>
          {backLabel}
        </Link>
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Pipeline · Reference
        </p>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          State Real Estate Lending Licenses
        </h1>
        <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">
          Quick reference for where commercial / private real estate lending
          licenses are required. Always confirm with counsel before closing —
          regulations change.
        </p>
      </header>

      <div className="grid gap-5 lg:grid-cols-3">
        <Column
          title="No license required"
          accent="emerald"
          entries={NO_LICENSE}
        />
        <Column title="Conditional" accent="amber" entries={CONDITIONAL} />
        <Column
          title="License required"
          accent="rose"
          entries={LICENSE_REQUIRED}
        />
      </div>
    </div>
  );
}
