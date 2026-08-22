/**
 * Block fillable PDF export — shared API for pipeline / workspace blocks.
 *
 * Other blocks plug in: build a `BlockPdfExportSpec` (sections + fields), then
 * `await downloadBlockFillablePdf(spec)` or `exportBlockToFillablePdf(spec)`.
 * For vault: `saveBlockFillablePdfToVault` / `uploadBlockFillablePdfResultToVault`,
 * or pass `onSaveToVault` to `BlockPdfExportButton`.
 */
export type {
  BlockPdfColumn,
  BlockPdfExportResult,
  BlockPdfExportSpec,
  BlockPdfField,
  BlockPdfFieldKind,
  BlockPdfSection,
  BlockPdfTableRow,
} from "./types";

export { exportBlockToFillablePdf } from "./exportBlockToFillablePdf";
export { buildPfsBlockPdfSpec } from "./blocks/pfsBlockPdf";
export { buildReoBlockPdfSpec } from "./blocks/reoBlockPdf";
export { buildTrackRecordBlockPdfSpec } from "./blocks/trackRecordBlockPdf";
export { buildBusinessDebtBlockPdfSpec } from "./blocks/businessDebtBlockPdf";
export { buildConstructionBudgetBlockPdfSpec } from "./blocks/constructionBudgetBlockPdf";
export { buildSimplePlBlockPdfSpec } from "./blocks/simplePlBlockPdf";
export {
  BLOCK_PDF_VAULT_DEFAULT_FOLDER,
  BLOCK_PDF_VAULT_FOLDER_CANDIDATES,
  buildBlockPdfVaultFileName,
  resolveBlockPdfVaultFolder,
  saveBlockFillablePdfToVault,
  sanitizeBlockPdfFileLabel,
  uploadBlockFillablePdfResultToVault,
  type BlockPdfVaultFolderRow,
  type SaveBlockFillablePdfToVaultOptions,
  type SaveBlockFillablePdfToVaultResult,
} from "./saveToVault";

import { downloadPdfBytes } from "@/lib/documents/pdfExport";
import { exportBlockToFillablePdf } from "./exportBlockToFillablePdf";
import type { BlockPdfExportResult, BlockPdfExportSpec } from "./types";

/** Generate + trigger browser download of a fillable block PDF. */
export async function downloadBlockFillablePdf(
  spec: BlockPdfExportSpec,
): Promise<BlockPdfExportResult> {
  const result = await exportBlockToFillablePdf(spec);
  downloadPdfBytes(result.bytes, result.fileName);
  return result;
}

