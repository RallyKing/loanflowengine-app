import type { Id } from "@/convex/_generated/dataModel";
import type { PipelineListRow } from "@/lib/pipelineListRow";
import type { ResourceOwnershipPresentationClient } from "@/lib/resourceOwnershipUi";

export type PipelineScenarioCriteriaForRow = {
  fundingTypeLabel?: string;
  propertyTypeLabel?: string;
  state?: string;
  transactionType?: string;
  ficoScore?: number;
  annualRevenue?: number;
  timeInBusinessMonths?: number;
  ltv?: number;
  ownerOccupied?: "Owner" | "Investor" | "Either";
  entityTypePreference?: string;
  industry?: string;
};

/**
 * Row from `api.pipeline.listTablePreview` — extends `listLight` with joined
 * display strings for the pipeline **table**, **board** cards, and CSV/TSV/JSON
 * exports. Each query reads fresh `pipeline` rows plus the live file deal payload
 * (`pipeline.dealData` when embedded, else linked `intakeSheets`). Any
 * `patchDeal` / workspace change updates that payload on the same document (or
 * mirrored intake), so `useQuery(api.pipeline.listTablePreview)` re-runs and
 * **`fundingAmount` on each row is recomputed from the fresher deal snapshot**
 * (`updatedAt` / `_creationTime` on embedded `dealData` vs linked intake); when **`cover.fundingAmount`** is present on
 * that payload it is the SSOT (including cleared → 0), else derivation and
 * `pipeline.fundingAmount` fallback.
 *
 * Column → Convex source mapping: see JSDoc on `buildTablePreviewRow` in
 * `convex/pipeline.ts` and `lib/pipeline/pipelineTableFieldSemantics.ts`.
 * Pipeline-only fields (`status`, fees, notes, target close, **lender sent**,
 * selected lender id, assignee) read from `pipeline`; deal-facing columns resolve
 * from `resolveDealPayloadForPreview`. Purchase/refi may still fall back to
 * `scenarioCriteria` when there is no deal document. **Funding type** uses only
 * deal `fundingType`; **funding program** uses only `cover.program` /
 * `business.fundingProduct`. **Funding amount** is `resolvePipelineTableFundingAmount`
 * over the live deal payload (full derivation, then `pipeline.fundingAmount` fallback).
 *
 * **`intakeSheetId`**: when set, the file is still **deal-backed** even if
 * `dealData` is not embedded yet — use `isDealBackedPipelineRow` and
 * **`patchDeal`** for file name, subject address, funding amount, and funding type so the
 * linked intake (and materialized `dealData`) stay in sync with the table.
 */
export type PipelineTablePreviewRow = Omit<PipelineListRow, "fundingAmount"> & {
  /**
   * Funding amount from the **file** deal document (same resolver as the drawer).
   * When **`cover.fundingAmount`** exists on the file payload it drives this value;
   * otherwise derived amounts / stored `pipeline.fundingAmount`.
   */
  fundingAmount: number;
} & {
  intakeSheetId?: Id<"intakeSheets">;
  scenarioCriteria?: PipelineScenarioCriteriaForRow;
  selectedLenderId?: Id<"lenders">;
  selectedLenderSentAt?: number;
  targetCloseDate?: number;
  sourceLabel: string;
  /**
   * Deal root `sourceType` for inline table edit. Always set by `listTablePreview`;
   * marked optional so client types stay compatible with Convex inference.
   */
  dealSourceType?: string;
  subjectAddressDisplay: string;
  fundingTypeDisplay: string;
  fundingProgramDisplay: string;
  purchaseRefiDisplay: string;
  selectedLenderDisplay: string;
  selectedLenderSentDisplay: string;
  targetCloseDisplay: string;
  fundingAmountDisplay: string;
  netToUserDisplay: string;
  /** Legacy `pipeline.notes` string (export/search only — UI uses `fileNotesCount`). */
  notesDisplay: string;
  /** Phase 19.5 — relational audit log entry count (`pipelineFileNotes`). */
  fileNotesCount: number;
  searchText: string;
  /** True when the current member may edit org-scoped file fields (not view-only). */
  canEditFile: boolean;
  /** Phase 13.2 — canonical owner line + badge for the current viewer. */
  ownership: ResourceOwnershipPresentationClient | null;
  /** Phase 13.3 — normalized hierarchy FKs + display (from clients/projects or legacy deal). */
  clientId?: Id<"clients">;
  projectId?: Id<"projects">;
  clientDisplayName: string;
  projectDisplayTitle: string;
  /** Phase 14 — linked clients on loan file (primary first). */
  linkedClients?: import("@/lib/pipelineClientRelationships").LinkedClientSummary[];
  /** Phase 14 — linked clients on parent project. */
  projectLinkedClients?: import("@/lib/pipelineClientRelationships").LinkedClientSummary[];
  /** Phase 14 Step 3 — project capital stack rollup (when `projectId` set). */
  projectCapitalRollup?: import("@/lib/projectCapitalStack").ProjectCapitalRollup;
  /** Phase 15 Step 4 — indexed graph link badges (from junction + legacy dual-read). */
  graphLinks?: import("@/convex/pipelineGraphPreviewLinks").PipelineRowGraphLinks;
  /** Phase 26.3 — chosen lender, else newest active (non-declined) for table at-a-glance. */
  primaryLender?: import("@/lib/pipeline/resolvePrimaryTableLender").PrimaryTableLenderPreview | null;
  /** True when `pipeline.dealData` holds the embedded deal document. */
  hasEmbeddedDealData: boolean;
};
