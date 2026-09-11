"use client";

import { useEffect, useId, useState } from "react";
import { Loader2 } from "lucide-react";
import type { Doc } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/Button";
import { OperationalOverlayShell } from "@/components/ui/OperationalOverlayShell";
import { fileTaskOutcomeHeadline } from "@/lib/pipeline/formatFileTaskOutcomeNote";
import type { FileTaskOutcomeKind } from "@/lib/pipeline/formatFileTaskOutcomeNote";
import { OP_INLINE_TEXTAREA_CLASS } from "@/lib/ui/operationalInputs";
import { useNarrowViewport } from "@/lib/useNarrowViewport";
import { cn } from "@/lib/cn";

export type FileTaskOutcomeNoteModalProps = {
  open: boolean;
  kind: FileTaskOutcomeKind;
  task: Doc<"tasks"> | null;
  /** When false, confirm still runs but the note field is hidden. */
  canSaveFileNote: boolean;
  onClose: () => void;
  onConfirm: (note: string) => Promise<void>;
};

export function FileTaskOutcomeNoteModal({
  open,
  kind,
  task,
  canSaveFileNote,
  onClose,
  onConfirm,
}: FileTaskOutcomeNoteModalProps) {
  const titleId = useId();
  const noteId = useId();
  const isNarrow = useNarrowViewport();
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setDraft("");
    setError(null);
    setBusy(false);
  }, [open, kind, task?._id]);

  const title =
    kind === "complete" ? "Complete task?" : "Delete task?";
  const confirmLabel = kind === "complete" ? "Complete" : "Delete";
  const confirmWithNoteLabel =
    kind === "complete" ? "Complete & add note" : "Delete & add note";
  const headline = task
    ? fileTaskOutcomeHeadline(kind, task.title)
    : fileTaskOutcomeHeadline(kind, "");
  const hasNote = draft.trim().length > 0;
  const actionLabel =
    canSaveFileNote && hasNote ? confirmWithNoteLabel : confirmLabel;

  const submit = async () => {
    if (!task || busy) return;
    setBusy(true);
    setError(null);
    try {
      await onConfirm(canSaveFileNote ? draft : "");
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Could not finish this action",
      );
      setBusy(false);
    }
  };

  return (
    <OperationalOverlayShell
      open={open && task != null}
      onClose={() => {
        if (!busy) onClose();
      }}
      align={isNarrow ? "bottom-sheet" : "center"}
      layer="MODAL"
      role="alertdialog"
      aria-labelledby={titleId}
      data-testid="file-task-outcome-note-modal"
      panelClassName={cn(
        "flex w-full max-w-md flex-col overflow-hidden p-0",
        "max-h-[min(90dvh,calc(100dvh-2rem))]",
      )}
    >
      <header className="shrink-0 border-b border-border/50 px-4 py-3 sm:px-5">
        <h2 id={titleId} className="text-base font-semibold text-foreground">
          {title}
        </h2>
        {task ? (
          <p className="mt-0.5 truncate text-sm text-muted-foreground" title={task.title}>
            {task.title}
          </p>
        ) : null}
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3 sm:px-5">
        <p className="text-sm text-muted-foreground">
          {kind === "complete"
            ? "Mark this task done. You can add an optional note to this file’s Notes block."
            : "This removes the task. You can add an optional note to this file’s Notes block."}
        </p>

        {canSaveFileNote ? (
          <div className="mt-3 space-y-1.5">
            <label
              htmlFor={noteId}
              className="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
            >
              Optional note
            </label>
            <p className="text-xs text-muted-foreground">{headline}</p>
            <textarea
              id={noteId}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={4}
              disabled={busy}
              placeholder="Add context for the file notes feed…"
              aria-label="Optional file note"
              className={cn(OP_INLINE_TEXTAREA_CLASS, "min-h-[6rem] resize-y")}
              data-testid="file-task-outcome-note-input"
            />
          </div>
        ) : null}

        {error ? (
          <p className="mt-3 text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}
      </div>

      <footer className="flex shrink-0 flex-wrap justify-end gap-2 border-t border-border/50 px-4 py-3 sm:px-5">
        <Button
          type="button"
          variant="outline"
          className="min-h-10"
          onClick={onClose}
          disabled={busy}
          data-testid="file-task-outcome-note-cancel"
        >
          Cancel
        </Button>
        <Button
          type="button"
          variant={kind === "delete" ? "danger" : "primary"}
          className="min-h-10"
          onClick={() => void submit()}
          disabled={busy}
          data-testid="file-task-outcome-note-confirm"
        >
          {busy ? (
            <Loader2
              className="h-4 w-4 animate-spin motion-reduce:animate-none"
              aria-hidden
            />
          ) : null}
          {actionLabel}
        </Button>
      </footer>
    </OperationalOverlayShell>
  );
}
