"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { cn } from "@/lib/cn";
import { configurePdfjsWorker } from "@/lib/library/pdfjsWorker";

const DEFAULT_MAX_PAGES = 40;
const RENDER_SCALE = 1.25;

export type PdfInlinePreviewProps = {
  /** Raw PDF bytes (already fetched from storage). */
  data: Uint8Array;
  fileName: string;
  className?: string;
  /** Cap rendered pages for memory; remaining pages need download / open. */
  maxPages?: number;
};

/**
 * Renders PDF pages to canvas via pdf.js.
 * Avoids native PDF-in-iframe, which often paints a blank white frame for
 * blob:/storage URLs under production CSP and some Chromium builds.
 */
export function PdfInlinePreview({
  data,
  fileName,
  className,
  maxPages = DEFAULT_MAX_PAGES,
}: PdfInlinePreviewProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [pageInfo, setPageInfo] = useState<{ total: number; shown: number } | null>(
    null,
  );

  useEffect(() => {
    let cancelled = false;
    const host = hostRef.current;
    if (!host) return;

    host.replaceChildren();
    setBusy(true);
    setErr(null);
    setPageInfo(null);

    void (async () => {
      let pdf: PDFDocumentProxy | null = null;
      try {
        await configurePdfjsWorker();
        const pdfjs = await import("pdfjs-dist");
        // Copy buffer — pdf.js may transfer/detach the underlying ArrayBuffer.
        const copy = new Uint8Array(data);
        pdf = await pdfjs.getDocument({ data: copy }).promise;
        if (cancelled) return;

        const total = pdf.numPages;
        const shown = Math.min(total, maxPages);
        const fragment = document.createDocumentFragment();

        for (let pageNum = 1; pageNum <= shown; pageNum++) {
          if (cancelled) break;
          const page = await pdf.getPage(pageNum);
          const viewport = page.getViewport({ scale: RENDER_SCALE });
          const canvas = document.createElement("canvas");
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          canvas.className = "mx-auto mb-3 max-w-full bg-white shadow-sm";
          canvas.setAttribute("aria-label", `${fileName} page ${pageNum}`);
          const ctx = canvas.getContext("2d");
          if (!ctx) throw new Error("Canvas unavailable for PDF preview.");
          await page.render({ canvasContext: ctx, viewport }).promise;
          fragment.appendChild(canvas);
        }

        if (cancelled) return;

        host.replaceChildren(fragment);
        setPageInfo({ total, shown });
        setBusy(false);
      } catch (e) {
        if (cancelled) return;
        setErr(e instanceof Error ? e.message : String(e));
        setBusy(false);
      } finally {
        if (pdf) {
          try {
            await pdf.destroy();
          } catch {
            // Ignore destroy races after cancel/unmount.
          }
        }
      }
    })();

    return () => {
      cancelled = true;
      host.replaceChildren();
    };
  }, [data, fileName, maxPages]);

  if (err) {
    return (
      <div
        className={cn(
          "flex min-h-[12rem] items-center justify-center p-4 text-sm text-muted-foreground",
          className,
        )}
        data-testid="pdf-inline-preview-error"
      >
        <p className="text-center">{err}</p>
      </div>
    );
  }

  return (
    <div className={cn("relative w-full", className)} data-testid="pdf-inline-preview">
      {busy ? (
        <div
          className="flex min-h-[12rem] items-center justify-center gap-2 text-sm text-muted-foreground"
          data-testid="pdf-inline-preview-loading"
        >
          <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
          Rendering PDF…
        </div>
      ) : null}
      <div
        ref={hostRef}
        className={cn("w-full overflow-auto p-2", busy && "hidden")}
        data-testid="pdf-inline-preview-pages"
      />
      {pageInfo && pageInfo.shown < pageInfo.total ? (
        <p className="border-t border-border/50 px-3 py-2 text-center text-[11px] text-muted-foreground">
          Showing {pageInfo.shown} of {pageInfo.total} pages. Download the file for the
          full document.
        </p>
      ) : null}
    </div>
  );
}
