"use client";

import { useEffect, useRef, useState } from "react";
import { ExternalLink, Loader2 } from "lucide-react";
import { cn } from "@/lib/cn";
import { guessAttachmentKind, type AttachmentKind } from "@/lib/uploadToConvexStorage";
import {
  fetchAsBlobUrl,
  isLegacyBinaryOfficeName,
  loadDocxPreview,
  loadSpreadsheetPreview,
  loadTextPreview,
  type SpreadsheetPreviewTable,
} from "@/lib/library/richFilePreviewLoaders";

export type RichFilePreviewProps = {
  url: string;
  fileName: string;
  contentType?: string;
  className?: string;
  /** Extra classes for the scroll/media viewport. */
  viewportClassName?: string;
  /** When true, suppress context menu on media (lender view-only). */
  protectMedia?: boolean;
  onError?: (message: string) => void;
};

function OpenFallback({
  url,
  message,
}: {
  url: string;
  message: string;
}) {
  return (
    <div className="flex h-full min-h-[12rem] flex-col items-center justify-center gap-3 p-4 text-sm text-muted-foreground">
      <p className="text-center">{message}</p>
      <a
        href={url}
        className="inline-flex items-center gap-2 text-primary hover:underline"
        target="_blank"
        rel="noreferrer"
      >
        <ExternalLink className="h-4 w-4" aria-hidden />
        Open in new tab
      </a>
    </div>
  );
}

function SpreadsheetTable({
  table,
  sheetNames,
  activeSheet,
  onSheetChange,
}: {
  table: SpreadsheetPreviewTable;
  sheetNames: string[];
  activeSheet: string;
  onSheetChange: (name: string) => void;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      {sheetNames.length > 1 ? (
        <div className="flex shrink-0 gap-1 overflow-x-auto border-b border-border/60 bg-background px-2 py-1.5">
          {sheetNames.map((name) => (
            <button
              key={name}
              type="button"
              className={cn(
                "h-8 shrink-0 rounded-dlc-sm px-2.5 text-xs",
                name === activeSheet
                  ? "bg-primary/10 font-medium text-primary"
                  : "text-muted-foreground hover:bg-muted/60",
              )}
              onClick={() => onSheetChange(name)}
            >
              {name}
            </button>
          ))}
        </div>
      ) : null}
      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-max min-w-full border-collapse text-left text-xs">
          <thead className="sticky top-0 z-[1] bg-muted/90 backdrop-blur-sm">
            <tr>
              {table.headers.map((h, i) => (
                <th
                  key={`h-${i}`}
                  className="border border-border/50 px-2 py-1.5 font-semibold text-foreground whitespace-nowrap"
                >
                  {h || `Col ${i + 1}`}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.rows.length === 0 ? (
              <tr>
                <td
                  className="border border-border/40 px-2 py-4 text-muted-foreground"
                  colSpan={Math.max(table.headers.length, 1)}
                >
                  Sheet is empty.
                </td>
              </tr>
            ) : (
              table.rows.map((row, ri) => (
                <tr key={`r-${ri}`} className="odd:bg-background even:bg-muted/20">
                  {row.map((cell, ci) => (
                    <td
                      key={`c-${ri}-${ci}`}
                      className="border border-border/40 px-2 py-1 align-top whitespace-pre-wrap max-w-[18rem]"
                    >
                      {cell}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/**
 * First-class inline preview for vault + lender delivery.
 * PDFs are re-hosted as same-origin blob URLs so Convex storage framing / attachment headers do not break preview.
 */
export function RichFilePreview({
  url,
  fileName,
  contentType,
  className,
  viewportClassName,
  protectMedia = false,
  onError,
}: RichFilePreviewProps) {
  const kind: AttachmentKind = guessAttachmentKind(contentType, fileName);
  const sheetNameRef = useRef<string>("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [textBody, setTextBody] = useState<string | null>(null);
  const [htmlBody, setHtmlBody] = useState<string | null>(null);
  const [sheet, setSheet] = useState<SpreadsheetPreviewTable | null>(null);
  const [activeSheet, setActiveSheet] = useState<string>("");
  const [docxParas, setDocxParas] = useState<string[] | null>(null);
  const [docxTitle, setDocxTitle] = useState<string | undefined>();

  useEffect(() => {
    sheetNameRef.current = sheet?.sheetName ?? "";
  }, [sheet?.sheetName]);

  useEffect(() => {
    let cancelled = false;
    let revoke: string | null = null;
    setErr(null);
    setBlobUrl(null);
    setTextBody(null);
    setHtmlBody(null);
    setSheet(null);
    setDocxParas(null);
    setDocxTitle(undefined);
    setActiveSheet("");

    const fail = (message: string) => {
      if (cancelled) return;
      setErr(message);
      onError?.(message);
      setBusy(false);
    };

    void (async () => {
      try {
        if (kind === "pdf") {
          setBusy(true);
          const next = await fetchAsBlobUrl(url, "application/pdf");
          if (cancelled) {
            URL.revokeObjectURL(next);
            return;
          }
          revoke = next;
          setBlobUrl(next);
          setBusy(false);
          return;
        }

        if (kind === "text") {
          setBusy(true);
          const t = await loadTextPreview(url);
          if (!cancelled) setTextBody(t);
          setBusy(false);
          return;
        }

        if (kind === "html") {
          setBusy(true);
          const t = await loadTextPreview(url);
          if (!cancelled) setHtmlBody(t);
          setBusy(false);
          return;
        }

        if (kind === "spreadsheet") {
          if (isLegacyBinaryOfficeName(fileName) && fileName.toLowerCase().endsWith(".xls")) {
            // Attempt xlsx path; exceljs may reject legacy BIFF.
          }
          setBusy(true);
          const table = await loadSpreadsheetPreview(url, fileName);
          if (!cancelled) {
            setSheet(table);
            setActiveSheet(table.sheetName);
          }
          setBusy(false);
          return;
        }

        if (kind === "word") {
          if (fileName.toLowerCase().endsWith(".doc") && !fileName.toLowerCase().endsWith(".docx")) {
            fail(
              "Legacy .doc preview is limited. Download the file or convert to .docx for in-app preview.",
            );
            return;
          }
          setBusy(true);
          const doc = await loadDocxPreview(url);
          if (!cancelled) {
            setDocxParas(doc.paragraphs);
            setDocxTitle(doc.title);
          }
          setBusy(false);
          return;
        }

        // image / other — no async load
        setBusy(false);
      } catch (e) {
        fail(e instanceof Error ? e.message : String(e));
      }
    })();

    return () => {
      cancelled = true;
      if (revoke) URL.revokeObjectURL(revoke);
    };
    // Intentionally omit onError — parents often pass inline lambdas.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, fileName, contentType, kind]);

  useEffect(() => {
    if (kind !== "spreadsheet" || !activeSheet) return;
    if (activeSheet === sheetNameRef.current) return;
    let cancelled = false;
    setBusy(true);
    void (async () => {
      try {
        const table = await loadSpreadsheetPreview(url, fileName, activeSheet);
        if (!cancelled) setSheet(table);
      } catch (e) {
        if (!cancelled) {
          const message = e instanceof Error ? e.message : String(e);
          setErr(message);
          onError?.(message);
        }
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onError often inline
  }, [activeSheet, fileName, kind, url]);

  const viewport = cn(
    "relative h-full min-h-[min(70vh,32rem)] w-full overflow-auto bg-muted/20",
    viewportClassName,
  );

  if (busy && !blobUrl && !textBody && !htmlBody && !sheet && !docxParas) {
    return (
      <div
        className={cn("flex items-center justify-center gap-2 text-sm text-muted-foreground", className, viewport)}
        data-testid="rich-file-preview-loading"
      >
        <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
        Loading preview…
      </div>
    );
  }

  if (kind === "image") {
    return (
      <div className={cn(className, viewport)} data-testid="rich-file-preview-image">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url}
          alt={fileName}
          className="mx-auto max-h-full w-auto max-w-full object-contain p-3"
          draggable={!protectMedia}
          onContextMenu={protectMedia ? (e) => e.preventDefault() : undefined}
        />
      </div>
    );
  }

  if (kind === "pdf") {
    if (err || !blobUrl) {
      return (
        <div className={cn(className, viewport)} data-testid="rich-file-preview-pdf-error">
          <OpenFallback
            url={url}
            message={err ?? "PDF preview failed to load."}
          />
        </div>
      );
    }
    return (
      <div className={cn(className, viewport)} data-testid="rich-file-preview-pdf">
        <iframe
          title={fileName}
          src={blobUrl}
          className="h-full min-h-[min(70vh,32rem)] w-full border-0 bg-white"
        />
      </div>
    );
  }

  if (kind === "text") {
    if (err || textBody == null) {
      return (
        <div className={cn(className, viewport)}>
          <OpenFallback url={url} message={err ?? "Text preview is not available."} />
        </div>
      );
    }
    return (
      <div className={cn(className, viewport)} data-testid="rich-file-preview-text">
        <pre className="whitespace-pre-wrap break-words p-3 text-xs">{textBody}</pre>
      </div>
    );
  }

  if (kind === "html") {
    if (err || htmlBody == null) {
      return (
        <div className={cn(className, viewport)}>
          <OpenFallback url={url} message={err ?? "Could not render this HTML document."} />
        </div>
      );
    }
    return (
      <div className={cn(className, viewport)} data-testid="rich-file-preview-html">
        <div
          className="prose prose-slate mx-auto max-w-none rounded-dlc-md border border-border/60 bg-white p-6 shadow-dlc-1"
          dangerouslySetInnerHTML={{ __html: htmlBody }}
        />
      </div>
    );
  }

  if (kind === "spreadsheet") {
    if (err || !sheet) {
      return (
        <div className={cn(className, viewport)} data-testid="rich-file-preview-sheet-error">
          <OpenFallback
            url={url}
            message={
              err ??
              "Spreadsheet preview is not available for this file. Try .xlsx or .csv."
            }
          />
        </div>
      );
    }
    return (
      <div
        className={cn(className, viewport, "bg-background")}
        data-testid="rich-file-preview-spreadsheet"
      >
        {busy ? (
          <div className="absolute inset-x-0 top-0 z-[2] flex items-center justify-center gap-2 bg-background/80 py-1 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
            Loading sheet…
          </div>
        ) : null}
        <SpreadsheetTable
          table={sheet}
          sheetNames={sheet.sheetNames}
          activeSheet={activeSheet || sheet.sheetName}
          onSheetChange={setActiveSheet}
        />
      </div>
    );
  }

  if (kind === "word") {
    if (err || !docxParas) {
      return (
        <div className={cn(className, viewport)} data-testid="rich-file-preview-word-error">
          <OpenFallback
            url={url}
            message={err ?? "Word preview is not available for this file."}
          />
        </div>
      );
    }
    return (
      <div
        className={cn(className, viewport, "bg-white")}
        data-testid="rich-file-preview-word"
      >
        <article className="mx-auto max-w-3xl space-y-3 p-6 text-sm leading-relaxed text-foreground">
          {docxTitle ? (
            <h2 className="text-base font-semibold tracking-tight">{docxTitle}</h2>
          ) : null}
          {docxParas.map((p, i) => (
            <p key={`p-${i}`}>{p}</p>
          ))}
          {docxParas.length === 0 ? (
            <p className="text-muted-foreground">Document has no readable text.</p>
          ) : null}
        </article>
      </div>
    );
  }

  return (
    <div className={cn(className, viewport)} data-testid="rich-file-preview-other">
      <OpenFallback
        url={url}
        message="Inline preview is not available for this file type."
      />
    </div>
  );
}
