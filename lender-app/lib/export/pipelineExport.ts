import type { PipelineTablePreviewRow } from "@/lib/pipelineTablePreview";
import { getPipelineStatusInfo } from "@/lib/pipelineStatus";
import { joinCsvDocument, joinCsvLine, joinTsvDocument, joinTsvLine } from "@/lib/export/csvEscape";

const CSV_HEADERS = [
  "File ID",
  "File name",
  "Source",
  "Subject address",
  "Funding type",
  "Funding program",
  "Purchase / refi",
  "Funding amount",
  "Status",
  "Selected lender",
  "Selected lender sent date",
  "Target close date",
  "Funding commission net to you",
  "Notes",
  "Updated at",
  "Intake linked",
] as const;

function rowCells(r: PipelineTablePreviewRow): unknown[] {
  return [
    r._id,
    r.fileName,
    r.sourceLabel,
    r.subjectAddressDisplay,
    r.fundingTypeDisplay,
    r.fundingProgramDisplay,
    r.purchaseRefiDisplay,
    r.fundingAmountDisplay,
    getPipelineStatusInfo(r.status).label,
    r.selectedLenderDisplay,
    r.selectedLenderSentDisplay,
    r.targetCloseDisplay,
    r.netToUserDisplay,
    r.notesDisplay,
    new Date(r.updatedAt).toISOString(),
    r.intakeSheetId ? "yes" : "",
  ];
}

export function buildPipelineListCsv(rows: PipelineTablePreviewRow[]): string {
  const lines = [joinCsvLine([...CSV_HEADERS])];
  for (const r of rows) {
    lines.push(joinCsvLine(rowCells(r)));
  }
  return joinCsvDocument(lines);
}

export function buildPipelineListTsv(rows: PipelineTablePreviewRow[]): string {
  const lines = [joinTsvLine([...CSV_HEADERS])];
  for (const r of rows) {
    lines.push(joinTsvLine(rowCells(r)));
  }
  return joinTsvDocument(lines);
}

export function buildPipelineListJson(rows: PipelineTablePreviewRow[]): string {
  return JSON.stringify(
    {
      exportVersion: 2,
      exportedAt: new Date().toISOString(),
      rowCount: rows.length,
      rows,
    },
    null,
    2
  );
}
