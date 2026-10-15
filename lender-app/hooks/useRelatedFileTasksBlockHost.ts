"use client";

import { useCallback, useMemo } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import type { FileTaskCreatePayload } from "@/lib/inFileTaskTriageUi";
import type { FileTasksBlockProps } from "@/components/pipeline/blocks/FileTasksBlock";
import { useLiveConnection } from "@/lib/useLiveConnection";
import { showOperationalToast } from "@/lib/ui/operationalToast";

export type RelatedFileTasksBlockHostArgs = {
  /** When false, Convex task queries are skipped (unless `tasks` is supplied). */
  enabled: boolean;
  pipelineFileId: Id<"pipeline">;
  organizationId: Id<"organizations">;
  memberUserKey: string;
  actorUserKey?: string;
  canEdit: boolean;
  onOpenTask: (id: Id<"tasks">) => void;
  /**
   * Preloaded tasks from an existing subscription (e.g. file workspace).
   * When set, this hook does not open a second `byRelatedFile` subscription.
   */
  tasks?: Doc<"tasks">[] | undefined;
  attachmentCounts?: Record<string, number> | undefined;
};

/**
 * Shared FileTasksBlock host for workspace overview + hub card modal.
 */
export function useRelatedFileTasksBlockHost(
  args: RelatedFileTasksBlockHostArgs,
): FileTasksBlockProps {
  const {
    enabled,
    pipelineFileId,
    organizationId,
    memberUserKey,
    actorUserKey,
    canEdit,
    onOpenTask,
    tasks: externalTasks,
    attachmentCounts: externalAttachmentCounts,
  } = args;

  const { canUseHub } = useLiveConnection();
  const useExternalTasks = externalTasks !== undefined;

  const orgScope = useMemo(
    () => ({ organizationId, memberUserKey }),
    [organizationId, memberUserKey],
  );

  const linkedTasks = useQuery(
    api.tasks.byRelatedFile,
    enabled && !useExternalTasks
      ? { fileId: pipelineFileId, ...orgScope }
      : "skip",
  );

  const resolvedTasks = useExternalTasks ? externalTasks : linkedTasks;

  const taskIds = useMemo(
    () => (resolvedTasks ?? []).map((t) => t._id),
    [resolvedTasks],
  );

  const queriedAttachmentCounts = useQuery(
    api.tasks.countTaskFilesForTasks,
    enabled &&
      !useExternalTasks &&
      taskIds.length > 0
      ? { taskIds, ...orgScope }
      : "skip",
  );

  const attachmentCounts = useExternalTasks
    ? externalAttachmentCounts
    : queriedAttachmentCounts;

  const createTask = useMutation(api.tasks.create);
  const patchTaskMutation = useMutation(api.tasks.patch);
  const completeTask = useMutation(api.tasks.complete);
  const removeTask = useMutation(api.tasks.remove);

  const actor = actorUserKey?.trim() || undefined;
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
        ...(actor ? { actorUserKey: actor } : {}),
      });
    },
    [actor, canEdit, canUseHub, createTask, orgScope, pipelineFileId],
  );

  const onToggleDone = useCallback(
    async (task: Doc<"tasks">) => {
      if (task.status === "done") {
        await patchTaskMutation({
          id: task._id,
          status: "todo",
          ...orgScope,
          ...(actor ? { actorUserKey: actor } : {}),
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
        ...(actor ? { actorUserKey: actor } : {}),
      });
    },
    [actor, canUseHub, completeTask, orgScope, patchTaskMutation],
  );

  const onDelete = useCallback(
    async (task: Doc<"tasks">) => {
      await removeTask({
        id: task._id,
        ...orgScope,
        ...(actor ? { actorUserKey: actor } : {}),
      });
    },
    [actor, orgScope, removeTask],
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
        ...(actor ? { actorUserKey: actor } : {}),
      });
    },
    [actor, orgScope, patchTaskMutation],
  );

  const loading = useExternalTasks
    ? resolvedTasks === undefined
    : enabled && linkedTasks === undefined;

  return {
    tasks: resolvedTasks ?? [],
    loading,
    attachmentCounts: attachmentCounts ?? undefined,
    organizationId,
    memberUserKey,
    pipelineFileId,
    actorUserKey: actor,
    disabled: !canMutate,
    onAdd,
    onToggleDone,
    onDelete,
    onPatchTask,
    onOpen: onOpenTask,
  };
}
