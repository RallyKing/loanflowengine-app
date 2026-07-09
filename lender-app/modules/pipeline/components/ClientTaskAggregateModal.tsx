"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery } from "convex/react";
import { ListTodo, X } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { OverlayShell } from "@/components/ui/OverlayShell";
import { OperationalSkeletonList } from "@/components/ui/OperationalSkeleton";
import { FileTaskTriageFeedRow } from "@/components/pipeline/tasks/FileTaskTriageFeedRow";
import { TaskTriageQuickEditPopover } from "@/components/pipeline/tasks/triage/TaskTriageQuickEditPopover";
import { TaskAttemptSnoozeSheet } from "@/components/pipeline/tasks/TaskAttemptSnoozeSheet";
import { TaskAttemptAuditDialog } from "@/components/pipeline/tasks/TaskAttemptAuditDialog";
import { TaskDrawer } from "@/components/TaskDrawer";
import { useTriageClockTime } from "@/components/providers/TriageClockProvider";
import { useLiveConnection } from "@/lib/useLiveConnection";
import { useActorUserKey } from "@/lib/useActorUserKey";
import { buildTriageLabelsMap } from "@/lib/inFileTaskTriageUi";
import { pipelineDealEditorHref } from "@/lib/pipeline/routes";
import { DEFAULT_TASK_COLOR_PRESETS } from "@/lib/taskColorPresets";
import { roundTriageTimeToNearestMinute } from "@/lib/triageClock";
import type { ZLayer } from "@/lib/ui/layering";

export type ClientTaskAggregateModalProps = {
  open: boolean;
  onClose: () => void;
  clientId: Id<"clients">;
  organizationId: Id<"organizations">;
  memberUserKey: string;
  canEdit?: boolean;
  layer?: ZLayer;
};

function taskOriginLabel(row: {
  fileName: string;
  projectTitle?: string;
}): string {
  const file = row.fileName.trim() || "File";
  if (row.projectTitle?.trim()) {
    return `${row.projectTitle.trim()} · ${file}`;
  }
  return file;
}

export function ClientTaskAggregateModal({
  open,
  onClose,
  clientId,
  organizationId,
  memberUserKey,
  canEdit = false,
  layer = "MODAL",
}: ClientTaskAggregateModalProps) {
  const actorUserKey = useActorUserKey();
  const { canUseHub } = useLiveConnection();
  const triageClock = useTriageClockTime();
  const evaluationTime =
    triageClock || roundTriageTimeToNearestMinute(Date.now());

  const aggregate = useQuery(
    api.pipelineClientWorkspace.getClientAggregatedTasks,
    open
      ? { organizationId, clientId, memberUserKey }
      : "skip",
  );

  const presets =
    useQuery(api.organizationSettings.getTaskColorPresets, {
      organizationId,
      memberUserKey,
    }) ?? DEFAULT_TASK_COLOR_PRESETS;

  const triageLabels =
    useQuery(api.organizationTriageLabels.listTriageLabels, {
      organizationId,
      memberUserKey,
    }) ?? [];

  const labelsById = useMemo(
    () => buildTriageLabelsMap(triageLabels),
    [triageLabels],
  );

  const patchTaskMutation = useMutation(api.tasks.patch);
  const completeTask = useMutation(api.tasks.complete);
  const removeTask = useMutation(api.tasks.remove);
  const wakeUpTask = useMutation(api.tasks.wakeUpTask);

  const [openTaskId, setOpenTaskId] = useState<Id<"tasks"> | null>(null);
  const [quickEdit, setQuickEdit] = useState<{
    task: Doc<"tasks">;
    anchor: HTMLElement | null;
  } | null>(null);
  const [attemptSheetTask, setAttemptSheetTask] = useState<Doc<"tasks"> | null>(
    null,
  );
  const [auditTask, setAuditTask] = useState<Doc<"tasks"> | null>(null);
  const [wakingTaskId, setWakingTaskId] = useState<Id<"tasks"> | null>(null);

  const orgScope = useMemo(
    () => ({ organizationId, memberUserKey }),
    [organizationId, memberUserKey],
  );

  const runPatchTask = useCallback(
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

  const handleWakeUp = useCallback(
    async (task: Doc<"tasks">) => {
      setWakingTaskId(task._id);
      try {
        await wakeUpTask({
          id: task._id,
          ...orgScope,
          ...(actorUserKey.trim() ? { actorUserKey: actorUserKey.trim() } : {}),
        });
      } finally {
        setWakingTaskId(null);
      }
    },
    [actorUserKey, orgScope, wakeUpTask],
  );

  const rows = aggregate?.tasks ?? [];
  const openCount = aggregate?.activeCount ?? 0;
  const canMutateTasks = canEdit && aggregate !== null;

  return (
    <>
      <OverlayShell
        open={open}
        onClose={onClose}
        layer={layer}
        panelClassName="flex max-h-[min(90dvh,720px)] w-full max-w-lg flex-col overflow-hidden p-0"
        aria-labelledby="client-task-aggregate-title"
        data-testid="pipeline-client-task-aggregate-modal"
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-border/70 px-4 py-3 sm:px-5">
          <div className="min-w-0">
            <h2
              id="client-task-aggregate-title"
              className="flex items-center gap-2 text-base font-semibold text-foreground"
            >
              <ListTodo className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
              Client tasks
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {aggregate === undefined
                ? "Loading tasks across projects and files…"
                : `${openCount} open · ${rows.length} total across this client`}
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

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">
          {aggregate === undefined ? (
            <OperationalSkeletonList rows={4} />
          ) : aggregate === null ? (
            <p className="text-sm text-muted-foreground">
              You do not have access to this client&apos;s tasks.
            </p>
          ) : rows.length === 0 ? (
            <p
              className="rounded-dlc-md border border-dashed border-border/70 px-4 py-8 text-center text-sm text-muted-foreground"
              data-testid="pipeline-client-task-aggregate-empty"
            >
              No tasks are linked to this client&apos;s loan files yet.
            </p>
          ) : (
            <ul className="space-y-3" aria-label="Client aggregated tasks">
              {rows.map((row) => (
                <li key={String(row.task._id)} className="space-y-1.5">
                  <div className="flex min-w-0 flex-wrap items-center gap-2 px-0.5">
                    <Badge
                      variant="outline"
                      className="max-w-full truncate text-[10px] font-normal"
                      data-testid={`pipeline-client-task-origin-${String(row.task._id)}`}
                    >
                      {taskOriginLabel(row)}
                    </Badge>
                    <Link
                      href={pipelineDealEditorHref(String(row.fileId))}
                      className="truncate text-[10px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                      onClick={onClose}
                    >
                      Open file
                    </Link>
                  </div>
                  <FileTaskTriageFeedRow
                    task={row.task}
                    presets={presets}
                    labelsById={labelsById}
                    evaluationTime={evaluationTime}
                    attachmentCount={0}
                    onToggleDone={onToggleDone}
                    onDelete={onDelete}
                    onOpen={(id) => setOpenTaskId(id)}
                    onLabelPillClick={
                      canMutateTasks
                        ? (task, anchor) => setQuickEdit({ task, anchor })
                        : undefined
                    }
                    attemptActionsEnabled={canMutateTasks}
                    onAttemptSnooze={
                      canMutateTasks
                        ? (task) => setAttemptSheetTask(task)
                        : undefined
                    }
                    onOpenAttemptAudit={
                      canMutateTasks
                        ? (task) => setAuditTask(task)
                        : undefined
                    }
                    onWakeUp={canMutateTasks ? handleWakeUp : undefined}
                    wakingUp={wakingTaskId != null}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex shrink-0 justify-end border-t border-border/70 px-4 py-3 sm:px-5">
          <Button type="button" variant="outline" size="sm" onClick={onClose}>
            Done
          </Button>
        </div>
      </OverlayShell>

      <TaskTriageQuickEditPopover
        open={quickEdit != null}
        onClose={() => setQuickEdit(null)}
        anchorEl={quickEdit?.anchor ?? null}
        task={quickEdit?.task ?? null}
        organizationId={organizationId}
        memberUserKey={memberUserKey}
        onOpenManager={() => setQuickEdit(null)}
        onPatchTask={runPatchTask}
      />

      <TaskAttemptSnoozeSheet
        open={attemptSheetTask != null}
        onClose={() => setAttemptSheetTask(null)}
        task={attemptSheetTask}
        organizationId={organizationId}
        memberUserKey={memberUserKey}
        actorUserKey={actorUserKey.trim() || undefined}
      />

      <TaskAttemptAuditDialog
        open={auditTask != null}
        onClose={() => setAuditTask(null)}
        task={auditTask}
        organizationId={organizationId}
        memberUserKey={memberUserKey}
      />

      <TaskDrawer
        taskId={openTaskId}
        onClose={() => setOpenTaskId(null)}
        onOpenTask={(id) => setOpenTaskId(id)}
      />
    </>
  );
}
