/**
 * Unit checks for vault PDF helper utilities (image MIME / HTML img src / data URLs).
 * Run: npx tsx scripts/vault-pdf-export-tests.ts
 */
import {
  extractHtmlImageSrcs,
  isVaultImageContentType,
  parseDataUrlImage,
} from "../lib/documents/pdfExport";

let failed = 0;

function assert(cond: boolean, message: string) {
  if (!cond) {
    failed += 1;
    console.error(`FAIL: ${message}`);
  } else {
    console.log(`ok: ${message}`);
  }
}

assert(
  isVaultImageContentType("image/png", "x.png"),
  "image/png MIME is vault image",
);
assert(
  isVaultImageContentType(undefined, "scan.JPEG"),
  "jpeg extension is vault image",
);
assert(
  isVaultImageContentType("image/webp", "shot.webp"),
  "webp is vault image",
);
assert(
  !isVaultImageContentType("application/pdf", "doc.pdf"),
  "pdf is not vault image",
);
assert(
  !isVaultImageContentType("text/html", "doc.html"),
  "html is not vault image",
);

const srcs = extractHtmlImageSrcs(
  `<html><body><p>Hi</p><img src="https://example.com/a.png" data-dlc-editor-image="1" /><img src='data:image/png;base64,abc' /><img src=unquoted.jpg /></body></html>`,
);
assert(srcs.length === 3, `extracts three img srcs (got ${srcs.length})`);
assert(
  srcs[0] === "https://example.com/a.png",
  "double-quoted https src",
);
assert(
  srcs[1]?.startsWith("data:image/png") === true,
  "single-quoted data URL src",
);
assert(srcs[2] === "unquoted.jpg", "unquoted src");

assert(
  extractHtmlImageSrcs("<p>no images</p>").length === 0,
  "no imgs → empty",
);

const tinyPngBase64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const parsed = parseDataUrlImage(`data:image/png;base64,${tinyPngBase64}`);
assert(parsed !== null, "parses data URL png");
assert(parsed?.contentType === "image/png", "data URL mime");
assert((parsed?.bytes.length ?? 0) > 0, "data URL bytes non-empty");

assert(
  parseDataUrlImage("https://example.com/a.png") === null,
  "https is not a data URL",
);
assert(parseDataUrlImage("blob:https://example.com/x") === null, "blob rejected");

if (failed > 0) {
  console.error(`\n${failed} failure(s)`);
  process.exit(1);
}
console.log("\nAll vault PDF export helper tests passed.");
