/**
 * Smoke: pdf.js can render a minimal PDF to canvas in Chromium.
 * Run: npx tsx scripts/pdf-inline-preview-smoke.ts
 */
import { chromium } from "@playwright/test";
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const worker = readFileSync(join(root, "public/pdf.worker.min.mjs"));
const pdfjsPath = join(root, "node_modules/pdfjs-dist/build/pdf.mjs");

// Minimal valid 1-page PDF
const MINI_PDF = Buffer.from(
  `%PDF-1.1
1 0 obj<< /Type /Catalog /Pages 2 0 R >>endobj
2 0 obj<< /Type /Pages /Kids [3 0 R] /Count 1 >>endobj
3 0 obj<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Contents 4 0 R /Resources<< /Font<< /F1 5 0 R >> >> >>endobj
4 0 obj<< /Length 44 >>stream
BT /F1 24 Tf 50 100 Td (Hello) Tj ET
endstream
endobj
5 0 obj<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>endobj
xref
0 6
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000266 00000 n 
0000000361 00000 n 
trailer<< /Size 6 /Root 1 0 R >>
startxref
433
%%EOF`.replace(/\n/g, "\r\n"),
);

const html = `<!doctype html>
<html><body>
<div id="host"></div>
<script type="module">
  import * as pdfjs from "/pdf.mjs";
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
  const res = await fetch("/sample.pdf");
  const data = new Uint8Array(await res.arrayBuffer());
  const pdf = await pdfjs.getDocument({ data }).promise;
  const page = await pdf.getPage(1);
  const viewport = page.getViewport({ scale: 1.25 });
  const canvas = document.createElement("canvas");
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  canvas.dataset.testid = "smoke-pdf-canvas";
  const ctx = canvas.getContext("2d");
  await page.render({ canvasContext: ctx, viewport }).promise;
  document.getElementById("host").appendChild(canvas);
  window.__pdfSmoke = { pages: pdf.numPages, w: canvas.width, h: canvas.height };
</script>
</body></html>`;

async function main() {
  const server = createServer((req, res) => {
    if (req.url === "/" || req.url === "/index.html") {
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(html);
      return;
    }
    if (req.url === "/sample.pdf") {
      res.writeHead(200, { "Content-Type": "application/pdf" });
      res.end(MINI_PDF);
      return;
    }
    if (req.url === "/pdf.worker.min.mjs") {
      res.writeHead(200, { "Content-Type": "text/javascript" });
      res.end(worker);
      return;
    }
    if (req.url === "/pdf.mjs") {
      res.writeHead(200, { "Content-Type": "text/javascript" });
      res.end(readFileSync(pdfjsPath));
      return;
    }
    res.writeHead(404);
    res.end();
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as { port: number };

  const browser = await chromium.launch();
  const page = await browser.newPage();
  page.on("pageerror", (e) => console.error("pageerror", e));
  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "networkidle" });
  await page.waitForFunction(
    () => Boolean((window as unknown as { __pdfSmoke?: unknown }).__pdfSmoke),
  );
  const smoke = await page.evaluate(
    () =>
      (window as unknown as { __pdfSmoke: { pages: number; w: number; h: number } })
        .__pdfSmoke,
  );
  const canvasCount = await page.locator("canvas").count();
  if (smoke.pages !== 1 || canvasCount !== 1 || smoke.w < 10 || smoke.h < 10) {
    console.error("fail", smoke, canvasCount);
    process.exitCode = 1;
  } else {
    console.log("ok - pdf.js canvas smoke", smoke);
  }
  await browser.close();
  server.close();
}

void main();
