"use client";

import { useEffect, useState } from "react";
import { X, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { OverlayShell } from "@/components/ui/OverlayShell";
import { guessAttachmentKind } from "@/lib/uploadToConvexStorage";

export type AttachmentPreviewRow = {
  fileName: string;
  contentType?: string;
  label?: string;
  url: string | null;
};

export function AttachmentPreviewDialog({
  file,
  onClose,
  actionTitle,
}: {
  file: AttachmentPreviewRow | null;
  onClose: () => void;
  actionTitle: (hint: string) => string;
}) {
  const [textBody, setTextBody] = useState<string | null>(null);
  const [textErr, setTextErr] = useState(false);
  const [textLoading, setTextLoading] = useState(false);
  const open = file !== null;
  const url = file?.url ?? null;
  const kind = file
    ? guessAttachmentKind(file.contentType, file.fileName)
    : "other";

  useEffect(() => {
    if (!file?.url || kind !== "text") {
      setTextBody(null);
      setTextErr(false);
      setTextLoading(false);
      return;
    }
    let cancelled = false;
    setTextLoading(true);
    setTextErr(false);
    setTextBody(null);
    void (async () => {
      try {
        const r = await fetch(file.url!);
        if (!r.ok) throw new Error(String(r.status));
        const t = await r.text();
        if (!cancelled) {
          setTextBody(t.length > 120_000 ? `${t.slice(0, 120_000)}\n\n…` : t);
        }
      } catch {
        if (!cancelled) {
          setTextErr(true);
        }
      } finally {
        if (!cancelled) setTextLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [file, kind]);

  if (!open || !file) return null;

  return (
    <OverlayShell
      open
      onClose={onClose}
      layer="MODAL"
      wrapPanel={false}
      aria-label={`Preview: ${file.fileName}`}
      className="items-center justify-center p-4"
    >
      <div
        className="relative max-h-[90vh] w-full max-w-4xl overflow-hidden rounded-lg border bg-background shadow-dlc-3"
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-center justify-between gap-3 border-b px-4 py-2">
          <div className="min-w-0">
            <div className="truncate text-sm font-medium">{file.fileName}</div>
            {file.label && (
              <div className="truncate text-xs text-muted-foreground">
                {file.label}
              </div>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {url && (
              <a
                href={url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-10 items-center gap-1 rounded-md px-2 text-sm text-primary hover:underline"
                title={actionTitle("Open in a new tab")}
              >
                <ExternalLink className="h-4 w-4" />
                Open
              </a>
            )}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-10 px-2"
              onClick={onClose}
              title="Close (Esc)"
              aria-label="Close preview"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <div className="max-h-[min(80vh,720px)] overflow-auto bg-muted/20 p-2">
          {!url ? (
            <p className="p-4 text-sm text-muted-foreground">
              No download URL is available. Try refreshing the list.
            </p>
          ) : kind === "image" ? (
            // eslint-disable-next-line @next/next/no-img-element -- dynamic Convex / signed URLs; not in next/images remote config
            <img
              src={url}
              alt={file.fileName}
              className="mx-auto max-h-[min(70vh,680px)] w-auto max-w-full object-contain"
            />
          ) : kind === "pdf" ? (
            <iframe
              title={file.fileName}
              src={url}
              className="h-[min(70vh,680px)] w-full rounded border bg-white"
            />
          ) : kind === "text" ? (
            textLoading ? (
              <p className="p-4 text-sm text-muted-foreground">Loading text…</p>
            ) : textErr || textBody === null ? (
              <p className="p-4 text-sm text-muted-foreground">
                Text preview is not available (CORS or network). Use &quot;Open&quot;
                to view in a new tab.
                {url && (
                  <a
                    href={url}
                    className="ml-1 text-primary hover:underline"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open file
                  </a>
                )}
              </p>
            ) : (
              <pre className="max-h-[min(70vh,680px)] overflow-auto whitespace-pre-wrap break-words rounded border bg-background p-3 text-xs">
                {textBody}
              </pre>
            )
          ) : (
            <div className="space-y-3 p-4 text-sm">
              <p className="text-muted-foreground">
                Inline preview is not available for this file type. Open the file
                in a new tab to view or download it.
              </p>
              {url && (
                <a
                  href={url}
                  className="inline-flex items-center gap-2 text-primary hover:underline"
                  target="_blank"
                  rel="noreferrer"
                >
                  <ExternalLink className="h-4 w-4" />
                  Open in new tab
                </a>
              )}
            </div>
          )}
        </div>
        <p className="border-t px-3 py-2 text-[10px] text-muted-foreground">
          Files are served from your Convex deployment. If a PDF or document
          preview stays blank, your browser or the file host may block embedding
          — use Open in a new tab.
        </p>
      </div>
    </OverlayShell>
  );
}
