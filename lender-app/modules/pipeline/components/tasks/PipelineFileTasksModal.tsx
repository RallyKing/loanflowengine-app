"use client";

import { useCallback, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { ListTodo, X } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/Button";
import { OverlayShell } from "@/components/ui/OverlayShell";
import { FileTasksBlock } from "@/components/pipeline/blocks/FileTasksBlock";
import { TaskDrawer } from "@/components/TaskDrawer";
import { useLiveConnection } from "@/lib/useLiveConnection";
import { useActorUserKey } from "@/lib/useActorUserKey";
import type { FileTaskCreatePayload } from "@/lib/inFileTaskTriageUi";
import { showOperationalToast } from "@/lib/ui/operationalToast";
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
 * Hub / board file-card tasks modal — full {@link FileTasksBlock} capabilities
 * without navigating into the pipeline file workspace.
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
  const { canUseHub } = useLiveConnection();
  const [openTaskId, setOpenTaskId] = useState<Id<"tasks"> | null>(null);

  const orgScope = useMemo(
    () => ({ organizationId, memberUserKey }),
    [organizationId, memberUserKey],
  );

  const linkedTasks = useQuery(
    api.tasks.byRelatedFile,
    open ? { fileId: pipelineFileId, ...orgScope } : "skip",
  );

  const taskIds = useMemo(
    () => (linkedTasks ?? []).map((t) => t._id),
    [linkedTasks],
  );

  const attachmentCounts = useQuery(
    api.tasks.countTaskFilesForTasks,
    open && taskIds.length > 0 ? { taskIds, ...orgScope } : "skip",
  );

  const createTask = useMutation(api.tasks.create);
  const patchTaskMutation = useMutation(api.tasks.patch);
  const completeTask = useMutation(api.tasks.complete);
  const removeTask = useMutation(api.tasks.remove);

  const canMutate = canEdit && canUseHub;

  const onAdd = useCallback(
    async (payload: FileTaskCreatePayload) => {
      if (!canUseHub) {
        const msg = "Reconnect to the server to add tasks to this file.";
        showOperationalToast({
          title: "Offline",
          description: msg,
          variant: "destructive",
        });
        throw new Error(msg);
      }
      if (!canEdit) {
        const msg = "You do not have permission to add tasks on this file.";
        showOperationalToast({
          title: "Read only",
          description: msg,
          variant: "destructive",
        });
        throw new Error(msg);
      }
      await createTask({
        title: payload.title,
        type: "work",
        status: "todo",
        quadrant: 2,
        category: "admin",
        priority: 0,
        relatedFileId: pipelineFileId,
        ...(payload.triageLabelId
          ? { triageLabelId: payload.triageLabelId }
          : {}),
        ...(payload.scheduledTriggerTime != null
          ? { scheduledTriggerTime: payload.scheduledTriggerTime }
          : {}),
        ...orgScope,
        ...(actorUserKey.trim() ? { actorUserKey: actorUserKey.trim() } : {}),
      });
    },
    [
      actorUserKey,
      canEdit,
      canUseHub,
      createTask,
      orgScope,
      pipelineFileId,
    ],
  );

  const onToggleDone = useCallback(
    async (task: Doc<"tasks">) => {
      if (task.status === "done") {
        await patchTaskMutation({
          id: task._id,
          status: "todo",
          ...orgScope,
          ...(actorUserKey.trim() ? { actorUserKey: actorUserKey.trim() } : {}),
        });
        return;
      }
      if (!canUseHub) {
        window.alert("Reconnect to the server to mark a task as done.");
        return;
      }
      await completeTask({
        id: task._id,
        ...orgScope,
        ...(actorUserKey.trim() ? { actorUserKey: actorUserKey.trim() } : {}),
      });
    },
    [actorUserKey, canUseHub, completeTask, orgScope, patchTaskMutation],
  );

  const onDelete = useCallback(
    async (task: Doc<"tasks">) => {
      await removeTask({
        id: task._id,
        ...orgScope,
        ...(actorUserKey.trim() ? { actorUserKey: actorUserKey.trim() } : {}),
      });
    },
    [actorUserKey, orgScope, removeTask],
  );

  const onPatchTask = useCallback(
    async (
      task: Doc<"tasks">,
      patch: { triageLabelId: Id<"organizationTriageLabels"> | null },
    ) => {
      await patchTaskMutation({
        id: task._id,
        ...patch,
        ...orgScope,
        ...(actorUserKey.trim() ? { actorUserKey: actorUserKey.trim() } : {}),
      });
    },
    [actorUserKey, orgScope, patchTaskMutation],
  );

  const openCount = useMemo(
    () => (linkedTasks ?? []).filter((t) => t.status !== "done").length,
    [linkedTasks],
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
              {linkedTasks === undefined
                ? " · Loading…"
                : ` · ${openCount} open · ${linkedTasks.length} total`}
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
          <FileTasksBlock
            tasks={linkedTasks ?? []}
            loading={linkedTasks === undefined}
            attachmentCounts={attachmentCounts ?? undefined}
            organizationId={organizationId}
            memberUserKey={memberUserKey}
            pipelineFileId={pipelineFileId}
            actorUserKey={actorUserKey.trim() || undefined}
            disabled={!canMutate}
            onAdd={onAdd}
            onToggleDone={onToggleDone}
            onDelete={onDelete}
            onPatchTask={onPatchTask}
            onOpen={(id) => setOpenTaskId(id)}
          />
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
