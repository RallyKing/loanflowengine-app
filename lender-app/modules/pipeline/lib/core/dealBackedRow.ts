import type { Id } from "@/convex/_generated/dataModel";
import { embeddedDealPayloadIsSubstantive } from "@/lib/file/embeddedDealPresence";

/**
 * Rows backed by an intake-shaped deal document: either embedded
 * `pipeline.dealData` **or** a linked `intakeSheetId` (same mutations via
 * `patchDeal` — the server resolves the base payload from the linked row when
 * `dealData` is still empty and materializes `dealData` on write).
 *
 * Prefer substantive embedded `dealData` (or `intakeSheetId`) over a bare
 * `{}` placeholder so linked-intake files still route file/workspace edits
 * through **`patchDeal`**.
 *
 * Accepts either a preview row (`hasEmbeddedDealData`) or a raw pipeline doc
 * (`dealData`) from **`getDetail`** / **`getDealForEditor`**.
 */
export function isDealBackedPipelineRow(row: {
  hasEmbeddedDealData?: boolean;
  dealData?: unknown;
  intakeSheetId?: Id<"intakeSheets">;
}): boolean {
  const hasEmbedded =
    typeof row.hasEmbeddedDealData === "boolean"
      ? row.hasEmbeddedDealData
      : embeddedDealPayloadIsSubstantive(row.dealData);
  return hasEmbedded || row.intakeSheetId != null;
}
