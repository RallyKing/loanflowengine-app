/**
 * Smoke: PFS fillable PDF builds with AcroForm fields.
 * Run: npx tsx scripts/block-pdf-export-smoke.ts
 */
import { PDFDocument } from "pdf-lib";
import {
  buildPfsBlockPdfSpec,
  exportBlockToFillablePdf,
} from "../lib/blockPdfExport";
import { createEmptyPersonalFinancialStatement } from "../lib/pfs/personalFinancialStatementModel";

async function main() {
  const pfs = createEmptyPersonalFinancialStatement();
  pfs.header.names = "Jane Client";
  pfs.assets.cashOnHandAndBanks = "25000";
  const spec = buildPfsBlockPdfSpec(pfs);
  const result = await exportBlockToFillablePdf(spec);
  const doc = await PDFDocument.load(result.bytes);
  const form = doc.getForm();
  const fields = form.getFields();
  if (result.pageCount < 2) {
    throw new Error(`Expected multi-page PDF, got ${result.pageCount}`);
  }
  if (fields.length < 40) {
    throw new Error(`Expected many fillable fields, got ${fields.length}`);
  }
  const namesField = form.getTextField("header.names");
  if (namesField.getText() !== "Jane Client") {
    throw new Error("Prefill failed for header.names");
  }
  console.log(
    `OK: ${result.fileName} pages=${result.pageCount} fields=${fields.length}`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
