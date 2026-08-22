/**
 * Unit checks for vault outbound file naming (rename → download identity).
 * Run: npx tsx scripts/vault-outbound-file-name-tests.ts
 */
import {
  resolveVaultOutboundFileName,
  vaultFileIdentityFromRename,
  splitVaultFileName,
  isCreatedVaultHtmlDocument,
  isVaultImageDocument,
  defaultVaultDownloadFormat,
  vaultOutboundPdfFileName,
} from "../lib/library/vaultOutboundFileName";

let failed = 0;

function assert(cond: boolean, message: string) {
  if (!cond) {
    failed += 1;
    console.error(`FAIL: ${message}`);
  } else {
    console.log(`ok: ${message}`);
  }
}

assert(splitVaultFileName("ABC file.pdf").stem === "ABC file", "split stem");
assert(splitVaultFileName("ABC file.pdf").ext === ".pdf", "split ext");

assert(
  resolveVaultOutboundFileName("ABC file", "ABC file.pdf") === "ABC file.pdf",
  "upload title without ext keeps stored name",
);

assert(
  resolveVaultOutboundFileName("XYZ file", "ABC file.pdf") === "XYZ file.pdf",
  "historical rename prefers title + preserves ext",
);

assert(
  resolveVaultOutboundFileName("XYZ file.pdf", "ABC file.pdf") ===
    "XYZ file.pdf",
  "title with same ext strips duplicate",
);

assert(
  resolveVaultOutboundFileName("XYZ file.docx", "ABC file.pdf") ===
    "XYZ file.docx",
  "explicit different short ext allowed",
);

assert(
  resolveVaultOutboundFileName("My.Report", "notes.pdf") === "My.Report.pdf",
  "dotted display name is not treated as extension",
);

const renamed = vaultFileIdentityFromRename("XYZ file", "ABC file.pdf");
assert(renamed.title === "XYZ file", "rename write title");
assert(renamed.fileName === "XYZ file.pdf", "rename write fileName with ext");

const synced = vaultFileIdentityFromRename("XYZ file", "XYZ file.pdf");
assert(synced.fileName === "XYZ file.pdf", "idempotent after sync");

assert(
  isCreatedVaultHtmlDocument({
    latestContentType: "text/html",
    latestFileName: "Term Sheet.html",
    title: "Term Sheet",
  }),
  "editor HTML content type is created",
);

assert(
  isCreatedVaultHtmlDocument({
    latestFileName: "Letter of Explanation.html",
    title: "Letter of Explanation",
  }),
  "html filename is created even without content type",
);

assert(
  !isCreatedVaultHtmlDocument({
    latestContentType: "application/pdf",
    latestFileName: "W-2.pdf",
    title: "W-2",
  }),
  "uploaded PDF is not created HTML",
);

assert(
  !isCreatedVaultHtmlDocument({
    latestContentType: "image/png",
    latestFileName: "id.png",
    title: "ID",
  }),
  "uploaded image is not created HTML",
);

assert(
  isVaultImageDocument({
    latestContentType: "image/png",
    latestFileName: "id.png",
    title: "ID",
  }),
  "png upload is vault image",
);

assert(
  isVaultImageDocument({
    latestFileName: "photo.JPEG",
    title: "Photo",
  }),
  "jpeg extension detects vault image",
);

assert(
  !isVaultImageDocument({
    latestContentType: "text/html",
    latestFileName: "Letter.html",
    title: "Letter",
  }),
  "created HTML is not vault image",
);

assert(
  !isVaultImageDocument({
    latestContentType: "application/pdf",
    latestFileName: "W-2.pdf",
    title: "W-2",
  }),
  "PDF is not vault image",
);

assert(
  defaultVaultDownloadFormat({
    latestContentType: "text/html",
    latestFileName: "Term Sheet.html",
    title: "Acme Term Sheet",
  }) === "pdf",
  "created HTML defaults to PDF",
);

assert(
  defaultVaultDownloadFormat({
    latestContentType: "application/pdf",
    latestFileName: "bank-stmt.pdf",
    title: "Bank statement",
  }) === "original",
  "uploaded PDF stays original",
);

assert(
  vaultOutboundPdfFileName("Acme Term Sheet", "Term Sheet.html") ===
    "Acme Term Sheet.pdf",
  "PDF export uses renamed title + .pdf",
);

assert(
  vaultOutboundPdfFileName("Bank statement", "bank-stmt.pdf") ===
    "Bank statement.pdf",
  "PDF name keeps renamed title when stored was already pdf",
);

if (failed > 0) {
  console.error(`\n${failed} failure(s)`);
  process.exit(1);
}
console.log("\nAll vault outbound file name tests passed.");
