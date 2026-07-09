import type { Id } from "@/convex/_generated/dataModel";
import { joinCsvDocument, joinCsvLine, joinTsvDocument, joinTsvLine } from "@/lib/export/csvEscape";

export type ScenarioMatchExportResult = {
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

export type ScenarioExportBundle = {
  scenario: Record<string, unknown>;
  summary: {
    totalConsidered: number;
    totalMatched: number;
    filterCounts?: Partial<Record<string, number>>;
    usedSearchNarrow?: boolean;
  };
  results: ScenarioMatchExportResult[];
};

const CSV_HEADERS = [
  "Rank",
  "Match %",
  "Raw score",
  "Company",
  "Contact",
  "Phone",
  "Email",
  "Website",
  "Entity type",
  "Primary niche",
  "Programs",
  "States",
  "Loan min",
  "Loan max",
  "Matched program",
  "Program min FICO",
  "Program requirements",
  "Reasons",
  "Concerns",
] as const;

function rowCells(rank: number, r: ScenarioMatchExportResult): unknown[] {
  const mp = r.matchedProgram;
  return [
    rank,
    r.displayScore,
    r.rawScore,
    r.company,
    r.contactName,
    r.phone,
    r.email,
    r.website,
    r.entityType,
    r.primaryNiche,
    r.programs,
    r.statesServed,
    r.fundingAmountMin,
    r.fundingAmountMax,
    mp?.name ?? "",
    mp?.minFico ?? "",
    mp?.requirements ?? "",
    (r.reasons ?? []).join(" | "),
    (r.concerns ?? []).join(" | "),
  ];
}

export function buildScenarioResultsCsv(bundle: ScenarioExportBundle): string {
  const lines = [joinCsvLine([...CSV_HEADERS])];
  bundle.results.forEach((r, i) => {
    lines.push(joinCsvLine(rowCells(i + 1, r)));
  });
  return joinCsvDocument(lines);
}

export function buildScenarioResultsTsv(bundle: ScenarioExportBundle): string {
  const lines = [joinTsvLine([...CSV_HEADERS])];
  bundle.results.forEach((r, i) => {
    lines.push(joinTsvLine(rowCells(i + 1, r)));
  });
  return joinTsvDocument(lines);
}

export function buildScenarioResultsJson(bundle: ScenarioExportBundle): string {
  return JSON.stringify(
    {
      exportVersion: 1,
      exportedAt: new Date().toISOString(),
      ...bundle,
    },
    null,
    2
  );
}
