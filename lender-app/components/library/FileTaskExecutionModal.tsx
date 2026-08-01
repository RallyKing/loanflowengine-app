"use client";

import { useState, type ReactNode } from "react";
import {
  Calendar,
  ExternalLink,
  Maximize2,
  Minimize2,
  X,
} from "lucide-react";
import { OverlayShell } from "@/components/ui/OverlayShell";
import { Button } from "@/components/ui/Button";
import {
  FILE_TASK_PRIORITY_LABELS,
  FILE_TASK_TYPE_LABELS,
  assignedBlockIdsOrdered,
  resolveTaskType,
  type FileTaskPriority,
} from "@/lib/documentVaultTaskTypes";
import { cn } from "@/lib/cn";
import type { DocumentVaultFileTaskRow } from "@/components/library/FileTaskContainer";
import { AtomicPortalBlockList } from "@/components/library/AtomicPortalBlockRenderer";
import { FileTaskReviewActions } from "@/components/library/FileTaskReviewActions";
import type { Id } from "@/convex/_generated/dataModel";

function formatDueDate(ms: number | undefined): string | null {
  if (ms == null || !Number.isFinite(ms)) return null;
  return new Date(ms).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function PriorityBadge({ priority }: { priority: FileTaskPriority }) {
  const tone =
    priority === "high"
      ? "bg-red-100 text-red-800 dark:bg-red-950/50 dark:text-red-200"
      : priority === "medium"
        ? "bg-amber-100 text-amber-900 dark:bg-amber-950/50 dark:text-amber-200"
        : "bg-slate-100 text-slate-700 dark:bg-slate-800/60 dark:text-slate-300";
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide",
        tone,
      )}
    >
      {FILE_TASK_PRIORITY_LABELS[priority]}
    </span>
  );
}

export type FileTaskExecutionModalProps = {
  open: boolean;
  onClose: () => void;
  fileTask: DocumentVaultFileTaskRow;
  pipelineFileId: Id<"pipeline">;
  memberUserKey?: string;
  canMutate?: boolean;
  onEdit?: () => void;
  onAcceptReview?: () => void | Promise<void>;
  onRejectReview?: () => void;
  onResetForClient?: () => void | Promise<void>;
  reviewBusy?: boolean;
  /** Vault document tree rendered for document_upload tasks. */
  vaultContent?: ReactNode;
};

export function FileTaskExecutionModal({
  open,
  onClose,
  fileTask,
  pipelineFileId,
  memberUserKey,
  canMutate = false,
  onEdit,
  onAcceptReview,
  onRejectReview,
  onResetForClient,
  reviewBusy = false,
  vaultContent,
}: FileTaskExecutionModalProps) {
  const [fullscreen, setFullscreen] = useState(false);
  const taskType = resolveTaskType(fileTask.taskType);
  const dueLabel = formatDueDate(fileTask.dueDate);
  const assignedIds = assignedBlockIdsOrdered(fileTask);
  const isPendingReview = fileTask.status === "pending_review";

  if (!open) return null;

  return (
    <OverlayShell
      open
      onClose={onClose}
      wrapPanel={false}
      contentClassName={fullscreen ? "h-full w-full max-w-none" : "max-w-3xl"}
      aria-label={`Task: ${fileTask.title}`}
      data-testid="file-task-execution-modal"
    >
      <div
        role="dialog"
        aria-modal="true"
        className={cn(
          "relative flex flex-col overflow-hidden bg-dlc-surface shadow-dlc-3",
          fullscreen
            ? "h-[100dvh] w-[100dvw] rounded-none"
            : "max-h-[min(90dvh,680px)] w-full rounded-dlc-lg",
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex shrink-0 items-start gap-2 border-b border-border/50 px-4 py-3 sm:px-5">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="inline-flex shrink-0 items-center rounded-full bg-muted/60 px-1.5 py-0.5 text-[9px] font-medium text-muted-foreground">
                {FILE_TASK_TYPE_LABELS[taskType]}
              </span>
              {fileTask.priority ? (
                <PriorityBadge priority={fileTask.priority} />
              ) : null}
              {dueLabel ? (
                <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-blue-50 px-1.5 py-0.5 text-[9px] font-medium text-blue-800 dark:bg-blue-950/40 dark:text-blue-200">
                  <Calendar className="h-2.5 w-2.5" aria-hidden />
                  {dueLabel}
                </span>
              ) : null}
              {!fileTask.isPortalVisible ? (
                <span className="inline-flex shrink-0 items-center rounded-full bg-muted px-1.5 py-0.5 text-[9px] font-medium text-muted-foreground">
                  Internal
                </span>
              ) : null}
            </div>
            <h3 className="mt-1 truncate text-sm font-semibold text-foreground">
              {fileTask.title}
            </h3>
            {fileTask.description ? (
              <p className="mt-0.5 text-xs text-muted-foreground whitespace-pre-wrap">
                {fileTask.description}
              </p>
            ) : null}
          </div>
          <div className="flex shrink-0 items-center gap-0.5">
            {canMutate && onEdit ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 px-2 text-xs"
                onClick={onEdit}
              >
                Edit
              </Button>
            ) : null}
            <button
              type="button"
              className="inline-flex h-8 w-8 items-center justify-center rounded-dlc-sm text-muted-foreground hover:bg-muted/50 hover:text-foreground"
              aria-label={fullscreen ? "Exit full screen" : "Full screen"}
              onClick={() => setFullscreen((v) => !v)}
            >
              {fullscreen ? (
                <Minimize2 className="h-4 w-4" aria-hidden />
              ) : (
                <Maximize2 className="h-4 w-4" aria-hidden />
              )}
            </button>
            <button
              type="button"
              className="inline-flex h-8 w-8 items-center justify-center rounded-dlc-sm text-muted-foreground hover:bg-muted/50 hover:text-foreground"
              aria-label="Close"
              onClick={onClose}
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-5">
          {canMutate && isPendingReview && onAcceptReview && onRejectReview ? (
            <FileTaskReviewActions
              className="mb-4"
              busy={reviewBusy}
              onApprove={onAcceptReview}
              onRequestRevision={onRejectReview}
              onResetForClient={onResetForClient}
            />
          ) : null}

          {taskType === "client_instruction" ? (
            <div className="space-y-3">
              {fileTask.instructionUrl ? (
                <a
                  href={fileTask.instructionUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
                >
                  <ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  {fileTask.instructionUrl}
                </a>
              ) : null}
              {fileTask.clientInstructionText ? (
                <p className="rounded-dlc-md border border-border/60 bg-muted/20 p-3 text-sm whitespace-pre-wrap text-foreground">
                  {fileTask.clientInstructionText}
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  No instruction text configured.
                </p>
              )}
            </div>
          ) : null}

          {taskType === "internal_task" ? (
            <p className="text-sm text-muted-foreground">
              Internal checklist item for your team. Mark complete when done.
            </p>
          ) : null}

          {taskType === "block_assignment" ? (
            <AtomicPortalBlockList
              pipelineFileId={pipelineFileId}
              blockIds={assignedIds}
              memberUserKey={memberUserKey}
              readOnly={!canMutate}
              useCollapsibleChrome
            />
          ) : null}

          {taskType === "document_upload" ? (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">
                Upload and organize documents for this requirement below.
              </p>
              {vaultContent ?? (
                <p className="text-xs text-muted-foreground italic">
                  No vault content loaded.
                </p>
              )}
            </div>
          ) : null}

          {fileTask.rejectionNote && !isPendingReview ? (
            <p className="mt-4 rounded-dlc-md border border-amber-200/60 bg-amber-50/50 p-2.5 text-xs text-amber-900">
              Revision note: {fileTask.rejectionNote}
            </p>
          ) : null}
        </div>
      </div>
    </OverlayShell>
  );
}

/** Compact row badges for due date and priority. */
export function FileTaskRowMetaBadges({
  fileTask,
}: {
  fileTask: DocumentVaultFileTaskRow;
}) {
  const dueLabel = formatDueDate(fileTask.dueDate);
  return (
    <>
      {fileTask.priority ? (
        <PriorityBadge priority={fileTask.priority} />
      ) : null}
      {dueLabel ? (
        <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-blue-50 px-1.5 py-0.5 text-[9px] font-medium text-blue-800 dark:bg-blue-950/40 dark:text-blue-200">
          <Calendar className="h-2.5 w-2.5" aria-hidden />
          {dueLabel}
        </span>
      ) : null}
    </>
  );
}
