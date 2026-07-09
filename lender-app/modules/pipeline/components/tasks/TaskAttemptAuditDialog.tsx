"use client";

import { useQuery } from "convex/react";
import { Loader2, Zap } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { OperationalOverlayShell } from "@/components/ui/OperationalOverlayShell";
import { normalizePipelineFileNoteRow } from "@/lib/pipeline/normalizePipelineFileNotes";
import { formatTaskAttemptNoteLabel } from "@/lib/pipeline/taskAttemptNoteLabel";

const NOTE_TIME_FMT = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

export function TaskAttemptAuditDialog({
  open,
  onClose,
  task,
  organizationId,
  memberUserKey,
}: {
  open: boolean;
  onClose: () => void;
  task: Doc<"tasks"> | null;
  organizationId: Id<"organizations">;
  memberUserKey: string;
}) {
  const raw = useQuery(
    api.pipelineFileNotes.getTaskAttemptNotes,
    open && task
      ? {
          taskId: task._id,
          organizationId,
          memberUserKey,
        }
      : "skip",
  );

  const notes =
    raw === undefined
      ? undefined
      : raw.map((row) => normalizePipelineFileNoteRow(row));

  return (
    <OperationalOverlayShell
      open={open}
      onClose={onClose}
      align="center"
      layer="MODAL"
      aria-label="Task attempt history"
      data-testid="task-attempt-audit-dialog"
      panelClassName="w-full max-w-lg max-h-[min(85dvh,calc(100dvh-6rem))] overflow-hidden flex flex-col p-0"
    >
      <header className="shrink-0 border-b border-border/50 px-4 py-3 sm:px-5">
        <h2 className="text-base font-semibold text-foreground">
          Attempt history
        </h2>
        {task ? (
          <p className="mt-0.5 truncate text-sm text-muted-foreground">
            {task.title}
          </p>
        ) : null}
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3 sm:px-5">
        {notes === undefined ? (
          <div className="flex items-center justify-center py-10 text-muted-foreground">
            <Loader2
              className="h-5 w-5 animate-spin motion-reduce:animate-none"
              aria-hidden
            />
            <span className="sr-only">Loading attempts</span>
          </div>
        ) : notes.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No attempts logged yet.
          </p>
        ) : (
          <ol className="space-y-3" aria-label="Attempt log entries">
            {notes.map((note) => (
              <li
                key={note._id}
                className="rounded-dlc-md border border-border/60 bg-muted/10 px-3 py-2.5"
                data-testid={`task-attempt-audit-row-${note._id}`}
              >
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  <span
                    className="inline-flex max-w-full items-center gap-1 rounded-full border border-amber-500/35 bg-amber-500/10 px-2 py-0.5 text-[11px] font-semibold text-amber-950 dark:text-amber-100"
                    title={formatTaskAttemptNoteLabel(
                      note.attemptNumber,
                      note.taskName,
                    )}
                  >
                    <Zap className="h-3 w-3 shrink-0" aria-hidden />
                    <span className="truncate">
                      {formatTaskAttemptNoteLabel(
                        note.attemptNumber,
                        note.taskName,
                      )}
                    </span>
                  </span>
                  <time
                    className="text-[11px] text-muted-foreground"
                    dateTime={new Date(note._creationTime).toISOString()}
                  >
                    {NOTE_TIME_FMT.format(new Date(note._creationTime))}
                  </time>
                </div>
                <p className="text-sm text-foreground whitespace-pre-wrap break-words">
                  {note.content}
                </p>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {note.authorDisplayName || "Unknown"}
                </p>
              </li>
            ))}
          </ol>
        )}
      </div>

      <footer className="shrink-0 border-t border-border/50 px-4 py-3 sm:px-5">
        <button
          type="button"
          className="min-h-10 w-full rounded-dlc-md border border-border bg-background px-3 text-sm font-medium hover:bg-muted/40"
          onClick={onClose}
        >
          Close
        </button>
      </footer>
    </OperationalOverlayShell>
  );
}
