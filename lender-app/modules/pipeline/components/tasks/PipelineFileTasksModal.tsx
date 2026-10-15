"use client";

import { useMemo, useState } from "react";
import { ListTodo, X } from "lucide-react";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/Button";
import { OverlayShell } from "@/components/ui/OverlayShell";
import { FileTasksBlock } from "@/components/pipeline/blocks/FileTasksBlock";
import { TaskDrawer } from "@/components/TaskDrawer";
import { useRelatedFileTasksBlockHost } from "@/hooks/useRelatedFileTasksBlockHost";
import { useActorUserKey } from "@/lib/useActorUserKey";
import type { ZLayer } from "@/lib/ui/layering";

export type PipelineFileTasksModalProps = {
  open: boolean;
  onClose: () => void;
  pipelineFileId: Id<"pipeline">;
  fileName: string;
  organizationId: Id<"organizations">;
  memberUserKey: string;
  canEdit?: boolean;
  layer?: ZLayer;
};

/**
 * Hub / board file-card tasks modal — full {@link FileTasksBlock} via the
 * shared related-file host (same orchestration as the loan-file overview).
 */
export function PipelineFileTasksModal({
  open,
  onClose,
  pipelineFileId,
  fileName,
  organizationId,
  memberUserKey,
  canEdit = false,
  layer = "MODAL",
}: PipelineFileTasksModalProps) {
  const actorUserKey = useActorUserKey();
  const [openTaskId, setOpenTaskId] = useState<Id<"tasks"> | null>(null);

  const tasksBlock = useRelatedFileTasksBlockHost({
    enabled: open,
    pipelineFileId,
    organizationId,
    memberUserKey,
    actorUserKey,
    canEdit,
    onOpenTask: setOpenTaskId,
  });

  const openCount = useMemo(
    () => tasksBlock.tasks.filter((t) => t.status !== "done").length,
    [tasksBlock.tasks],
  );

  return (
    <>
      <OverlayShell
        open={open}
        onClose={onClose}
        layer={layer}
        align="bottom-sheet"
        panelClassName="flex max-h-[min(90dvh,720px)] w-full max-w-lg flex-col overflow-hidden p-0 sm:max-w-xl"
        aria-labelledby="pipeline-file-tasks-modal-title"
        data-testid="pipeline-file-tasks-modal"
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-border/70 px-4 py-3 sm:px-5">
          <div className="min-w-0">
            <h2
              id="pipeline-file-tasks-modal-title"
              className="flex items-center gap-2 text-base font-semibold text-foreground"
            >
              <ListTodo
                className="h-4 w-4 shrink-0 text-muted-foreground"
                aria-hidden
              />
              File tasks
            </h2>
            <p className="mt-1 truncate text-sm text-muted-foreground">
              {fileName}
              {tasksBlock.loading
                ? " · Loading…"
                : ` · ${openCount} open · ${tasksBlock.tasks.length} total`}
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 w-8 shrink-0 p-0"
            aria-label="Close"
            onClick={onClose}
          >
            <X className="h-4 w-4 shrink-0" aria-hidden />
          </Button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-3 sm:px-4">
          <FileTasksBlock {...tasksBlock} />
        </div>

        <div className="flex shrink-0 justify-end border-t border-border/70 px-4 py-3 sm:px-5">
          <Button type="button" variant="outline" size="sm" onClick={onClose}>
            Done
          </Button>
        </div>
      </OverlayShell>

      <TaskDrawer
        taskId={openTaskId}
        onClose={() => setOpenTaskId(null)}
        onOpenTask={(id) => setOpenTaskId(id)}
      />
    </>
  );
}
