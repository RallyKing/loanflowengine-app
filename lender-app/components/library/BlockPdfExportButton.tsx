"use client";

/**
 * Header action: export a block as a client-ready fillable PDF.
 * Place via CollapsibleBlock `headerRight` so it sits immediately after
 * Direct Link / client-assign chrome (composedHeaderRight order).
 *
 * When `onSaveToVault` is provided, the control opens a small menu with
 * Download to computer + Save to Document Vault (OverlayShell sheet on mobile).
 */
import { useCallback, useEffect, useId, useState } from "react";
import { Download, FileDown, FolderPlus, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import {
  DropdownMenu,
  DropdownMenuItem,
} from "@/components/ui/DropdownMenu";
import { OverlayShell } from "@/components/ui/OverlayShell";
import {
  downloadBlockFillablePdf,
  type BlockPdfExportResult,
  type BlockPdfExportSpec,
} from "@/lib/blockPdfExport";
import { downloadPdfBytes } from "@/lib/documents/pdfExport";
import { cn } from "@/lib/cn";
import { showOperationalToast } from "@/lib/ui/operationalToast";

export type BlockPdfExportButtonProps = {
  /** Build the export spec at click time (fresh draft values). */
  buildSpec: () => BlockPdfExportSpec | Promise<BlockPdfExportSpec>;
  /**
   * When set, clicking the control offers Download + Save to Document Vault.
   * Implement with `saveBlockFillablePdfToVault` (or upload helpers) so other
   * blocks can reuse the same two-option UX later.
   */
  onSaveToVault?: () => Promise<void>;
  /** Accessible name + tooltip for the trigger. */
  label?: string;
  className?: string;
  disabled?: boolean;
  testId?: string;
};

function useIsMdUp() {
  const [mdUp, setMdUp] = useState(true);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const apply = () => setMdUp(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);
  return mdUp;
}

export function BlockPdfExportButton({
  buildSpec,
  onSaveToVault,
  label = "Fillable PDF",
  className,
  disabled = false,
  testId = "block-pdf-export",
}: BlockPdfExportButtonProps) {
  const [busy, setBusy] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const mdUp = useIsMdUp();
  const titleId = useId();
  const hasVault = typeof onSaveToVault === "function";

  const runDownload = useCallback(async () => {
    if (busy || disabled) return;
    setBusy(true);
    setSheetOpen(false);
    try {
      const spec = await buildSpec();
      const result = await downloadBlockFillablePdf(spec);
      showOperationalToast({
        title: "Fillable PDF ready",
        description: `${result.fileName} · ${result.fieldCount} fields · ${result.pageCount} page${result.pageCount === 1 ? "" : "s"}`,
        variant: "success",
      });
    } catch (e) {
      showOperationalToast({
        title: "Could not export PDF",
        description: e instanceof Error ? e.message : "Try again.",
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  }, [busy, disabled, buildSpec]);

  const runSaveToVault = useCallback(async () => {
    if (busy || disabled || !onSaveToVault) return;
    setBusy(true);
    setSheetOpen(false);
    showOperationalToast({
      title: "Saving fillable PDF…",
      description: "Generating and uploading to Document Vault.",
      durationMs: 2500,
    });
    try {
      await onSaveToVault();
    } catch (e) {
      showOperationalToast({
        title: "Could not save to Document Vault",
        description: e instanceof Error ? e.message : "Try again.",
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  }, [busy, disabled, onSaveToVault]);

  const triggerClass = cn(
    "h-10 min-h-[40px] w-10 min-w-[40px] shrink-0 p-0",
    className,
  );

  const icon = busy ? (
    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
  ) : (
    <FileDown className="h-4 w-4" aria-hidden />
  );

  // Download-only: click runs immediately (legacy / portal).
  if (!hasVault) {
    return (
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className={triggerClass}
        disabled={disabled || busy}
        aria-label={label}
        title={label}
        data-testid={testId}
        onClick={(e) => {
          e.stopPropagation();
          void runDownload();
        }}
      >
        {icon}
      </Button>
    );
  }

  // Desktop: DropdownMenu owns open/close; do not stopPropagation on the trigger
  // (wrapper already stops header collapse). Mobile: OverlayShell bottom sheet.
  if (mdUp) {
    return (
      <DropdownMenu
        aria-label={`${label} options`}
        align="end"
        trigger={
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className={triggerClass}
            disabled={disabled || busy}
            aria-label={`${label} options`}
            title={`${label} — download or save to vault`}
            data-testid={testId}
          >
            {icon}
          </Button>
        }
      >
        <DropdownMenuItem
          onClick={() => {
            void runDownload();
          }}
          disabled={busy || disabled}
        >
          <Download className="h-4 w-4 shrink-0" aria-hidden />
          Download to computer
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => {
            void runSaveToVault();
          }}
          disabled={busy || disabled}
        >
          <FolderPlus className="h-4 w-4 shrink-0" aria-hidden />
          Save to Document Vault
        </DropdownMenuItem>
      </DropdownMenu>
    );
  }

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className={triggerClass}
        disabled={disabled || busy}
        aria-label={`${label} options`}
        title={`${label} — download or save to vault`}
        data-testid={testId}
        aria-haspopup="dialog"
        onClick={(e) => {
          e.stopPropagation();
          if (!busy && !disabled) setSheetOpen(true);
        }}
      >
        {icon}
      </Button>
      <OverlayShell
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        align="bottom-sheet"
        layer="MODAL"
        aria-labelledby={titleId}
        data-testid={`${testId}-sheet`}
        panelClassName="p-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
      >
        <h2
          id={titleId}
          className="mb-3 text-sm font-semibold text-foreground"
        >
          Fillable PDF
        </h2>
        <div className="flex flex-col gap-1" role="menu">
          <Button
            type="button"
            variant="ghost"
            className="h-10 min-h-[40px] w-full justify-start gap-2 px-3"
            disabled={busy || disabled}
            data-testid={`${testId}-download`}
            onClick={() => {
              void runDownload();
            }}
          >
            <Download className="h-4 w-4 shrink-0" aria-hidden />
            Download to computer
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="h-10 min-h-[40px] w-full justify-start gap-2 px-3"
            disabled={busy || disabled}
            data-testid={`${testId}-vault`}
            onClick={() => {
              void runSaveToVault();
            }}
          >
            <FolderPlus className="h-4 w-4 shrink-0" aria-hidden />
            Save to Document Vault
          </Button>
        </div>
      </OverlayShell>
    </>
  );
}

/** Optional helper for callers that already hold bytes and only need a download. */
export function downloadBlockPdfExportResult(result: BlockPdfExportResult) {
  downloadPdfBytes(result.bytes, result.fileName);
}
