"use client";

/**
 * Bring Track Record rows or the full block into another pipeline file.
 * Destination picker reuses Document Vault sibling-file query (same as REO).
 */
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Copy, Loader2 } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/Button";
import { OverlayShell } from "@/components/ui/OverlayShell";
import { cn } from "@/lib/cn";
import { showOperationalToast } from "@/lib/ui/operationalToast";

type DestinationSibling = {
  _id: Id<"pipeline">;
  fileName: string;
  status: string;
  updatedAt: number;
  sameProject: boolean;
  primaryBorrowerLabel: string;
};

export type TrackRecordCopyToFileDialogProps = {
  open: boolean;
  onClose: () => void;
  sourceFileId: Id<"pipeline">;
  memberUserKey?: string;
  selectedRowIndexes: readonly number[];
  defaultMode?: "rows" | "block";
};

export function TrackRecordCopyToFileDialog({
  open,
  onClose,
  sourceFileId,
  memberUserKey,
  selectedRowIndexes,
  defaultMode = "rows",
}: TrackRecordCopyToFileDialogProps) {
  const selectedRowCount = selectedRowIndexes.length;
  const [targetId, setTargetId] = useState<Id<"pipeline"> | null>(null);
  const [mode, setMode] = useState<"rows" | "block">(defaultMode);
  const [busy, setBusy] = useState(false);

  const siblingQuery = useQuery(
    api.documentVaultCrossFile.listSiblingFiles,
    open
      ? memberUserKey
        ? { pipelineFileId: sourceFileId, memberUserKey }
        : { pipelineFileId: sourceFileId }
      : "skip",
  );

  const copyTrackRecord = useMutation(api.pipelineContacts.copyTrackRecordToFile);

  useEffect(() => {
    if (!open) return;
    setTargetId(null);
    setMode(defaultMode);
    setBusy(false);
  }, [open, defaultMode, selectedRowCount]);

  const sameProjectFiles = useMemo(
    () => (siblingQuery?.siblings ?? []).filter((f) => f.sameProject),
    [siblingQuery],
  );
  const otherFiles = useMemo(
    () => (siblingQuery?.siblings ?? []).filter((f) => !f.sameProject),
    [siblingQuery],
  );
  const siblings = siblingQuery?.siblings ?? [];
  const canConfirm =
    Boolean(targetId && !busy) &&
    (mode === "block" || selectedRowCount > 0);

  return (
    <OverlayShell
      open={open}
      onClose={onClose}
      align="bottom-sheet"
      aria-label="Copy Track Record into another file"
      panelClassName="w-full max-w-md p-5"
      data-testid="track-record-copy-to-file-dialog"
    >
      <h3 className="text-sm font-semibold text-foreground">
        Bring into another file
      </h3>
      <p className="mt-1 text-xs text-muted-foreground">
        Copy selected properties or the entire Track Record into another loan
        file you can edit. Assignees and guarantor names travel with the data.
      </p>

      <fieldset className="mt-4">
        <legend className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          What to copy
        </legend>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <button
            type="button"
            className={cn(
              "inline-flex min-h-10 items-center justify-center rounded-dlc-sm border px-3 text-sm transition-colors duration-dlc-short ease-dlc-standard",
              mode === "rows"
                ? "border-primary/40 bg-primary/10 text-foreground"
                : "border-border/60 bg-dlc-surface text-muted-foreground hover:bg-muted/40",
            )}
            aria-pressed={mode === "rows"}
            onClick={() => setMode("rows")}
          >
            Selected rows
            {selectedRowCount > 0 ? ` (${selectedRowCount})` : ""}
          </button>
          <button
            type="button"
            className={cn(
              "inline-flex min-h-10 items-center justify-center rounded-dlc-sm border px-3 text-sm transition-colors duration-dlc-short ease-dlc-standard",
              mode === "block"
                ? "border-primary/40 bg-primary/10 text-foreground"
                : "border-border/60 bg-dlc-surface text-muted-foreground hover:bg-muted/40",
            )}
            aria-pressed={mode === "block"}
            onClick={() => setMode("block")}
          >
            Entire block
          </button>
        </div>
        {mode === "rows" && selectedRowCount === 0 ? (
          <p className="mt-2 text-[11px] text-amber-700 dark:text-amber-400">
            Check one or more property rows first.
          </p>
        ) : null}
      </fieldset>

      {siblingQuery === undefined ? (
        <div className="mt-6 flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          Loading destination files…
        </div>
      ) : siblings.length === 0 ? (
        <div className="mt-4 rounded-dlc-sm border border-border/60 bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
          No other loan files in this organization that you can edit.
        </div>
      ) : (
        <fieldset className="mt-4">
          <legend className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Destination file
          </legend>
          <div
            className="mt-2 max-h-[min(40dvh,280px)] space-y-3 overflow-y-auto overscroll-contain"
            role="listbox"
            aria-label="Destination loan files"
          >
            <DestinationGroup
              label="Same project"
              files={sameProjectFiles}
              targetId={targetId}
              busy={busy}
              onSelect={setTargetId}
            />
            <DestinationGroup
              label={sameProjectFiles.length > 0 ? "Other files" : "All files"}
              files={otherFiles}
              targetId={targetId}
              busy={busy}
              onSelect={setTargetId}
            />
          </div>
        </fieldset>
      )}

      <div className="mt-5 flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onClose}>
          Cancel
        </Button>
        <Button
          type="button"
          size="sm"
          className="min-h-10"
          disabled={!canConfirm || siblings.length === 0}
          data-testid="track-record-copy-to-file-confirm"
          onClick={() => {
            if (!targetId) return;
            void (async () => {
              setBusy(true);
              try {
                const result = await copyTrackRecord({
                  sourceFileId,
                  targetFileId: targetId,
                  mode,
                  ...(mode === "rows"
                    ? { rowIndexes: [...selectedRowIndexes] }
                    : {}),
                  ...(memberUserKey
                    ? { preferencesAccountId: memberUserKey }
                    : {}),
                });
                if (!result.ok) {
                  throw new Error(
                    "Destination file changed. Refresh and try again.",
                  );
                }
                showOperationalToast({
                  title: "Copied into destination file",
                  description: `${result.copiedRowCount} propert${result.copiedRowCount === 1 ? "y" : "ies"} added.`,
                  variant: "success",
                });
                onClose();
              } catch (e) {
                showOperationalToast({
                  title: "Could not copy Track Record",
                  description:
                    e instanceof Error ? e.message : "Try again.",
                  variant: "destructive",
                });
              } finally {
                setBusy(false);
              }
            })();
          }}
        >
          <Copy className="h-4 w-4" aria-hidden />
          Copy
        </Button>
      </div>
    </OverlayShell>
  );
}

function DestinationGroup({
  label,
  files,
  targetId,
  busy,
  onSelect,
}: {
  label: string;
  files: DestinationSibling[];
  targetId: Id<"pipeline"> | null;
  busy: boolean;
  onSelect: (id: Id<"pipeline">) => void;
}) {
  if (files.length === 0) return null;
  return (
    <div className="space-y-1">
      <p className="sticky top-0 z-[1] bg-dlc-surface/95 px-1 py-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground backdrop-blur-sm">
        {label}
      </p>
      <ul className="space-y-1" role="group" aria-label={label}>
        {files.map((file) => {
          const borrowers =
            file.primaryBorrowerLabel.trim() || "No primary borrower";
          const selected = targetId === file._id;
          return (
            <li key={file._id}>
              <button
                type="button"
                role="option"
                aria-selected={selected}
                disabled={busy}
                className={cn(
                  "flex w-full min-h-10 flex-col items-stretch justify-center gap-0.5 rounded-dlc-sm px-3 py-2 text-left",
                  "hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none",
                  selected && "bg-primary/10 ring-1 ring-primary/30",
                )}
                onClick={() => onSelect(file._id)}
              >
                <span className="min-w-0 truncate text-sm font-medium text-foreground">
                  {file.fileName}
                </span>
                <span className="min-w-0 truncate text-xs text-muted-foreground">
                  {borrowers}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
