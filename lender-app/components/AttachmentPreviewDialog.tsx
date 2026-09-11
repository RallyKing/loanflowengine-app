"use client";

import { ExternalLink, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { OverlayShell } from "@/components/ui/OverlayShell";
import { RichFilePreview } from "@/components/library/preview/RichFilePreview";

export type AttachmentPreviewRow = {
  fileName: string;
  contentType?: string;
  label?: string;
  url: string | null;
  /** Optional zoom (0.5–2). Defaults to 1. */
  previewScale?: number;
};

export function AttachmentPreviewDialog({
  file,
  onClose,
  actionTitle,
  onPreviewScaleChange,
}: {
  file: AttachmentPreviewRow | null;
  onClose: () => void;
  actionTitle: (hint: string) => string;
  onPreviewScaleChange?: (scale: number) => void;
}) {
  const open = file !== null;
  const url = file?.url ?? null;
  const scale = file?.previewScale ?? 1;

  if (!open || !file) return null;

  return (
    <OverlayShell
      open
      onClose={onClose}
      layer="MODAL"
      wrapPanel={false}
      aria-label={`Preview: ${file.fileName}`}
      className="items-center justify-center p-4"
      scrimClassName="backdrop-blur-none"
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
            {onPreviewScaleChange && (
              <div className="mr-1 flex items-center gap-1">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 px-2 text-xs"
                  disabled={scale <= 0.5}
                  onClick={() =>
                    onPreviewScaleChange(
                      Math.max(0.5, Math.round((scale - 0.25) * 100) / 100),
                    )
                  }
                  title={actionTitle("Zoom out")}
                >
                  −
                </Button>
                <span className="min-w-[2.5rem] text-center text-xs text-muted-foreground">
                  {Math.round(scale * 100)}%
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 px-2 text-xs"
                  disabled={scale >= 2}
                  onClick={() =>
                    onPreviewScaleChange(
                      Math.min(2, Math.round((scale + 0.25) * 100) / 100),
                    )
                  }
                  title={actionTitle("Zoom in")}
                >
                  +
                </Button>
              </div>
            )}
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
        <div className="max-h-[min(80vh,720px)] overflow-auto bg-muted/20">
          {!url ? (
            <p className="p-4 text-sm text-muted-foreground">
              No download URL is available. Try refreshing the list.
            </p>
          ) : (
            <div
              style={{
                transform: `scale(${scale})`,
                transformOrigin: "top left",
                width: `${100 / scale}%`,
              }}
            >
              <RichFilePreview
                url={url}
                fileName={file.fileName}
                contentType={file.contentType}
                className="max-h-[min(80vh,720px)]"
                viewportClassName="max-h-[min(80vh,720px)] min-h-[min(50vh,420px)]"
              />
            </div>
          )}
        </div>
        <p className="border-t px-3 py-2 text-[10px] text-muted-foreground">
          Preview runs in-app for PDF, images, text, Excel/CSV, and Word (.docx).
          If a preview stays blank, use Open in a new tab.
        </p>
      </div>
    </OverlayShell>
  );
}
