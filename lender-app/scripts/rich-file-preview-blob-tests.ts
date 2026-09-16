/**
 * Ensures PDF bytes are re-hosted as blob URLs (fixes blank lender-link iframes).
 * Run: npx tsx scripts/rich-file-preview-blob-tests.ts
 */
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { fetchAsBlobUrl } from "../lib/library/richFilePreviewLoaders";

async function main() {
  const pdfBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]); // %PDF-1.4
  const server = createServer((_req, res) => {
    res.writeHead(200, {
      "Content-Type": "application/pdf",
      "Access-Control-Allow-Origin": "*",
    });
    res.end(Buffer.from(pdfBytes));
  });

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const url = `http://127.0.0.1:${address.port}/doc.pdf`;

  const blobUrl = await fetchAsBlobUrl(url, "application/pdf");
  assert.ok(blobUrl.startsWith("blob:"), "expected blob URL");

  const res = await fetch(blobUrl);
  assert.equal(res.headers.get("content-type"), "application/pdf");
  const buf = new Uint8Array(await res.arrayBuffer());
  assert.deepEqual([...buf], [...pdfBytes]);

  URL.revokeObjectURL(blobUrl);
  await new Promise<void>((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });

  console.log("ok - fetchAsBlobUrl produces same-origin PDF blob");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
