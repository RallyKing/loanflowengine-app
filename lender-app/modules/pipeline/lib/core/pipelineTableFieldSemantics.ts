/**
 * Canonical meanings for pipeline **table** / board preview columns.
 * Projection logic lives in `convex/pipeline.ts` (`buildTablePreviewRow` and helpers).
 * Writes from the table use `pipeline.patch`, `pipeline.patchDeal`, and
 * `lib/pipeline/pipelineTableCommits.ts` so the file workspace stays the source of truth.
 */
export const PIPELINE_TABLE_COLUMNS = {
  source: {
    title: "Source",
    summary:
      "Where the lead or file originated (referral, internet lead, text, networking, etc.).",
    storage:
      "Deal root field `sourceType` (same intake-shaped document as the file workspace). The visible label may combine `sourceType` with borrower / project / business names for context.",
  },
  subjectAddress: {
    title: "Subject address",
    summary:
      "Address of the collateral or subject property tied to the funding, when applicable.",
    storage:
      "Structured `subjectProperty` / `primaryProperty`, coversheet `cover.subjectProperty`, then legacy `pipeline.propertyAddress`. Empty for non–property-backed deals is valid.",
  },
  fundingType: {
    title: "Funding type",
    summary:
      "How this file is funded at a high level (residential, business line of credit, bridge, etc.).",
    storage:
      "Deal root field **`fundingType`** (File → Overview). Editable on the pipeline table (deal-backed rows) and in the file workspace; not inferred from `dealType` or loan product fields.",
  },
  fundingProgram: {
    title: "Funding program",
    summary:
      "Specific program or product name chosen for this deal (lender program line).",
    storage:
      "Deal only: `cover.program` (residential / general coversheet) or `business.fundingProduct` (business). Not `pipeline.scenario` (that is lender-search scratch text).",
  },
  fundingAmount: {
    title: "Funding amount",
    summary:
      "Requested or approved funding amount used for fees, ledger, and reporting.",
    storage:
      "The pipeline table subscribes to `listTablePreview`: **`fundingAmount` is recomputed on every query from the live file** (`dealData` or linked intake). When **`cover.fundingAmount`** exists on that payload (including cleared empty string → 0), it is the single source of truth for the column; otherwise `resolvePipelineTableFundingAmount` derives from other deal tabs, then `pipeline.fundingAmount`. Edits use `commitPipelineFundingAmount` → `patchDeal` (`cover.fundingAmount`), which keeps the stored pipeline column aligned for fees.",
  },
  selectedLender: {
    title: "Selected lender",
    summary:
      "The lender record the user marked as the chosen funding partner for this file.",
    storage:
      "`pipeline.selectedLenderId` → `lenders.company`. Must be one of `pipeline.lenders`. Set from the file drawer, not duplicated on the deal JSON.",
  },
  lenderSent: {
    title: "Lender sent",
    summary:
      "Calendar date you sent this file to the selected lender (manual tracking).",
    storage:
      "`pipeline.selectedLenderSentAt` (Unix ms, date-only in UI). Editable from the pipeline table; independent of when the lender was selected.",
  },
} as const;

export type PipelineTableColumnKey = keyof typeof PIPELINE_TABLE_COLUMNS;

export function pipelineTableColumnTooltip(key: PipelineTableColumnKey): string {
  const c = PIPELINE_TABLE_COLUMNS[key];
  return `${c.summary}\n\nStored: ${c.storage}`;
}
