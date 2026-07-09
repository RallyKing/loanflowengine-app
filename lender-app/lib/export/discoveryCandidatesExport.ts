import type { Doc } from "@/convex/_generated/dataModel";
import { joinCsvDocument, joinCsvLine, joinTsvDocument, joinTsvLine } from "@/lib/export/csvEscape";

export type CandidateRow = Doc<"lenderCandidates">;

const CSV_HEADERS = [
  "Candidate ID",
  "Status",
  "Company",
  "Website",
  "Contact",
  "Phone",
  "Email",
  "Entity type",
  "Primary niche",
  "Programs",
  "Property types",
  "States served",
  "Loan min",
  "Loan max",
  "Notes",
  "Source URL",
  "Confidence",
  "Discovery query",
  "Provider",
  "Duplicate of lender ID",
  "Created at",
  "Updated at",
] as const;

function rowCells(c: CandidateRow): unknown[] {
  return [
    c._id,
    c.status,
    c.company,
    c.website,
    c.contactName,
    c.phone,
    c.email,
    c.entityType,
    c.primaryNiche,
    c.programs,
    c.propertyTypes,
    c.statesServed,
    c.fundingAmountMin,
    c.fundingAmountMax,
    c.notes,
    c.sourceUrl,
    c.confidence,
    c.query,
    c.provider,
    c.duplicateOfLenderId ?? "",
    new Date(c.createdAt).toISOString(),
    new Date(c.updatedAt).toISOString(),
  ];
}

export function buildDiscoveryCandidatesCsv(rows: CandidateRow[]): string {
  const lines = [joinCsvLine([...CSV_HEADERS])];
  for (const c of rows) {
    lines.push(joinCsvLine(rowCells(c)));
  }
  return joinCsvDocument(lines);
}

export function buildDiscoveryCandidatesTsv(rows: CandidateRow[]): string {
  const lines = [joinTsvLine([...CSV_HEADERS])];
  for (const c of rows) {
    lines.push(joinTsvLine(rowCells(c)));
  }
  return joinTsvDocument(lines);
}

export function buildDiscoveryCandidatesJson(rows: CandidateRow[]): string {
  return JSON.stringify(
    {
      exportVersion: 1,
      exportedAt: new Date().toISOString(),
      rowCount: rows.length,
      candidates: rows,
    },
    null,
    2
  );
}
