/** Local worker path — keep in sync via `npm run sync:pdf-worker`. */
export const PDFJS_WORKER_SRC = "/pdf.worker.min.mjs";

let configured = false;

/** Configure pdfjs-dist to use the locally hosted worker (avoids CDN/CORS failures). */
export async function configurePdfjsWorker(): Promise<void> {
  if (configured) return;
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_SRC;
  configured = true;
}
