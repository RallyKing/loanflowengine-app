"use client";

import { Check, RotateCcw, XCircle } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";

export type FileTaskReviewActionsProps = {
  className?: string;
  onApprove: () => void | Promise<void>;
  onRequestRevision: () => void;
  onResetForClient?: () => void | Promise<void>;
  busy?: boolean;
  compact?: boolean;
};

/** Approve / request revision controls for tasks in `pending_review`. */
export function FileTaskReviewActions({
  className,
  onApprove,
  onRequestRevision,
  onResetForClient,
  busy = false,
  compact = false,
}: FileTaskReviewActionsProps) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-2 rounded-dlc-md border border-blue-200/80 bg-blue-50/60 px-3 py-2 dark:border-blue-900/50 dark:bg-blue-950/30",
        className,
      )}
      data-testid="file-task-review-actions"
    >
      <p className="w-full text-[11px] font-medium text-blue-900 dark:text-blue-100">
        Client submitted this requirement — approve or request a revision.
      </p>
      <Button
        type="button"
        size="sm"
        variant="primary"
        className="h-8 gap-1.5"
        disabled={busy}
        data-testid="file-task-approve-review"
        onClick={() => void onApprove()}
      >
        <Check className="h-3.5 w-3.5" aria-hidden />
        Approve
      </Button>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="h-8 gap-1.5 border-amber-300 text-amber-900 hover:bg-amber-50"
        disabled={busy}
        data-testid="file-task-request-revision"
        onClick={onRequestRevision}
      >
        <XCircle className="h-3.5 w-3.5" aria-hidden />
        Request revision
      </Button>
      {onResetForClient ? (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-8 gap-1.5"
          disabled={busy}
          onClick={() => void onResetForClient()}
        >
          <RotateCcw className="h-3.5 w-3.5" aria-hidden />
          {compact ? "Reset" : "Reopen for client"}
        </Button>
      ) : null}
    </div>
  );
}

export function ClientPortalRevisionBanner({
  note,
  className,
}: {
  note: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-dlc-md border border-amber-300/90 bg-amber-50 px-3 py-2.5 shadow-dlc-1 dark:border-amber-800/60 dark:bg-amber-950/40",
        className,
      )}
      role="status"
      data-testid="client-portal-revision-banner"
    >
      <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-900 dark:text-amber-100">
        Revision requested
      </p>
      <p className="mt-1 text-sm text-amber-950 dark:text-amber-50 whitespace-pre-wrap">
        {note}
      </p>
      <p className="mt-1.5 text-[11px] text-amber-800 dark:text-amber-200">
        Please address the note below, then resubmit.
      </p>
    </div>
  );
}
