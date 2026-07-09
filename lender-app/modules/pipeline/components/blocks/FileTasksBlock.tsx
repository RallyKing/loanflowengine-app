"use client";

import { useCallback, useMemo, useState } from "react";
import { useOrgMemberQueryArgs } from "@/lib/convex/useStableConvexArgs";
import { useMutation, useQuery } from "convex/react";
import { SlidersHorizontal, CheckCircle2, ChevronDown } from "lucide-react";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { api } from "@/convex/_generated/api";
import { OperationalSkeletonList } from "@/components/ui/OperationalSkeleton";
import { Button } from "@/components/ui/Button";
import { FileTaskTriageComposer } from "@/components/pipeline/tasks/FileTaskTriageComposer";
import { FileTaskTriageFeedRow, FileTaskCompletedRow } from "@/components/pipeline/tasks/FileTaskTriageFeedRow";
import { TaskTemplateApplyModal } from "@/components/pipeline/tasks/TaskTemplateApplyModal";
import {
  TaskTriageLabelManagerSheet,
  type TaskTriageLabelManagerMode,
} from "@/components/pipeline/tasks/triage/TaskTriageLabelManagerSheet";
import { TaskTriageQuickEditPopover } from "@/components/pipeline/tasks/triage/TaskTriageQuickEditPopover";
import { TaskAttemptSnoozeSheet } from "@/components/pipeline/tasks/TaskAttemptSnoozeSheet";
import { TaskAttemptAuditDialog } from "@/components/pipeline/tasks/TaskAttemptAuditDialog";
import { useTriageClockTime } from "@/components/providers/TriageClockProvider";
import { DEFAULT_TASK_COLOR_PRESETS } from "@/lib/taskColorPresets";
import type { FileTaskCreatePayload } from "@/lib/inFileTaskTriageUi";
import { buildTriageLabelsMap } from "@/lib/inFileTaskTriageUi";
import { roundTriageTimeToNearestMinute } from "@/lib/triageClock";

export type FileTasksBlockProps = {
  tasks: Doc<"tasks">[];
  loading: boolean;
  attachmentCounts?: Record<string, number>;
  organizationId?: Id<"organizations">;
  memberUserKey?: string;
  pipelineFileId?: Id<"pipeline">;
  actorUserKey?: string;
  onAdd: (payload: FileTaskCreatePayload) => Promise<void>;
  onToggleDone: (t: Doc<"tasks">) => Promise<void>;
  onDelete: (t: Doc<"tasks">) => Promise<void>;
  onOpen: (id: Id<"tasks">) => void;
  onPatchTask?: (
    task: Doc<"tasks">,
    patch: { triageLabelId: Id<"organizationTriageLabels"> | null },
  ) => Promise<void>;
  disabled?: boolean;
};

/** Registry-aligned surface for **`tasks`**: triage composer + playbook apply + feed. */
export function FileTasksBlock({
  tasks,
  loading,
  attachmentCounts,
  organizationId,
  memberUserKey,
  pipelineFileId,
  actorUserKey,
  onAdd,
  onToggleDone,
  onDelete,
  onOpen,
  onPatchTask,
  disabled,
}: FileTasksBlockProps) {
  const [templateModalOpen, setTemplateModalOpen] = useState(false);
  const [applyNotice, setApplyNotice] = useState<string | null>(null);
  const [managerOpen, setManagerOpen] = useState(false);
  const [managerMode, setManagerMode] = useState<TaskTriageLabelManagerMode>({
    kind: "list",
  });
  const [quickEdit, setQuickEdit] = useState<{
    task: Doc<"tasks">;
    anchor: HTMLElement | null;
  } | null>(null);
  const [attemptSheetTask, setAttemptSheetTask] = useState<Doc<"tasks"> | null>(
    null,
  );
  const [auditTask, setAuditTask] = useState<Doc<"tasks"> | null>(null);
  const [wakingTaskId, setWakingTaskId] = useState<Id<"tasks"> | null>(null);
  const patchTaskMutation = useMutation(api.tasks.patch);
  const wakeUpTask = useMutation(api.tasks.wakeUpTask);
  const snoozeTask = useMutation(api.tasks.snooze);

  const triageClock = useTriageClockTime();
  const evaluationTime =
    triageClock || roundTriageTimeToNearestMinute(Date.now());

  const orgMemberArgs = useOrgMemberQueryArgs(organizationId, memberUserKey);

  const presets =
    useQuery(api.organizationSettings.getTaskColorPresets, orgMemberArgs) ??
    DEFAULT_TASK_COLOR_PRESETS;

  const triageLabels =
    useQuery(api.organizationTriageLabels.listTriageLabels, orgMemberArgs) ?? [];

  const labelsById = useMemo(
    () => buildTriageLabelsMap(triageLabels),
    [triageLabels],
  );

  const canManageLabels = Boolean(organizationId && memberUserKey && !disabled);

  const openManager = useCallback(
    (mode: TaskTriageLabelManagerMode = { kind: "list" }) => {
      setManagerMode(mode);
      setManagerOpen(true);
    },
    [],
  );

  const patchTaskLabel = useCallback(
    async (
      task: Doc<"tasks">,
      patch: { triageLabelId: Id<"organizationTriageLabels"> | null },
    ) => {
      if (onPatchTask) {
        await onPatchTask(task, patch);
        return;
      }
      if (!organizationId || !memberUserKey) {
        throw new Error("Organization required to update task label.");
      }
      await patchTaskMutation({
        id: task._id,
        organizationId,
        memberUserKey,
        triageLabelId: patch.triageLabelId,
        ...(actorUserKey ? { actorUserKey } : {}),
      });
    },
    [
      actorUserKey,
      memberUserKey,
      onPatchTask,
      organizationId,
      patchTaskMutation,
    ],
  );

  const { openTasks, completedTasks } = useMemo(() => {
    const open: Doc<"tasks">[] = [];
    const completed: Doc<"tasks">[] = [];
    for (const task of tasks) {
      if (task.status === "done") completed.push(task);
      else open.push(task);
    }
    const sortOpen = (a: Doc<"tasks">, b: Doc<"tasks">) => {
      const aLabeled = a.triageLabelId ? 0 : 1;
      const bLabeled = b.triageLabelId ? 0 : 1;
      if (aLabeled !== bLabeled) return aLabeled - bLabeled;
      const aDue = a.dueDate ?? Number.POSITIVE_INFINITY;
      const bDue = b.dueDate ?? Number.POSITIVE_INFINITY;
      if (aDue !== bDue) return aDue - bDue;
      return b._creationTime - a._creationTime;
    };
    open.sort(sortOpen);
    completed.sort(
      (a, b) =>
        (b.completedAt ?? b._creationTime) - (a.completedAt ?? a._creationTime),
    );
    return { openTasks: open, completedTasks: completed };
  }, [tasks]);

  const openCount = openTasks.length;
  const totalTasksCount = tasks.length;
  const canBrowseTemplates = Boolean(
    organizationId && memberUserKey && pipelineFileId && !disabled,
  );

  const canLogAttempts = Boolean(
    organizationId && memberUserKey && pipelineFileId && !disabled,
  );

  const handleSnoozeUntil = useCallback(
    async (task: Doc<"tasks">, until: number) => {
      if (!organizationId || !memberUserKey) return;
      await snoozeTask({
        id: task._id,
        until,
        organizationId,
        memberUserKey,
      });
    },
    [memberUserKey, organizationId, snoozeTask],
  );

  const handleWakeUp = useCallback(
    async (task: Doc<"tasks">) => {
      if (!organizationId || !memberUserKey) return;
      setWakingTaskId(task._id);
      try {
        await wakeUpTask({
          id: task._id,
          organizationId,
          memberUserKey,
          ...(actorUserKey ? { actorUserKey } : {}),
        });
      } finally {
        setWakingTaskId(null);
      }
    },
    [actorUserKey, memberUserKey, organizationId, wakeUpTask],
  );

  return (
    <div
      className="w-full min-w-0 space-y-1.5"
      data-testid="file-tasks-triage-block"
      data-file-tasks-triage="true"
      id="pipeline-block-tasks-inner"
    >
      {applyNotice ? (
        <p
          className="rounded-dlc-sm border border-primary/30 bg-primary/5 px-3 py-2 text-xs text-foreground"
          role="status"
        >
          {applyNotice}
        </p>
      ) : null}

      <div
        className="mb-2 flex flex-wrap items-center justify-between gap-x-2 gap-y-2 border-b border-slate-100/80 px-1 py-2 text-xs text-slate-500 sm:flex-nowrap dark:border-slate-800/80"
        data-testid="file-tasks-sub-toolbar"
      >
        <div className="flex min-w-0 flex-wrap items-center gap-2 sm:flex-nowrap">
          <span className="text-slate-500">
            File-level triage and follow-ups.
          </span>
          <span className="hidden text-slate-300 sm:inline" aria-hidden>
            |
          </span>
          <span className="font-semibold tabular-nums text-slate-700 dark:text-slate-300">
            {openCount} open · {totalTasksCount} total
          </span>
        </div>

        {canManageLabels ? (
          <button
            type="button"
            onClick={() => openManager({ kind: "list" })}
            className="inline-flex shrink-0 items-center gap-1.5 rounded px-2 py-0.5 font-medium text-slate-600 transition-colors hover:bg-slate-50 hover:text-emerald-700 dark:text-slate-400 dark:hover:bg-slate-800/50 dark:hover:text-emerald-400"
            data-testid="file-tasks-toolbar-manage-labels"
          >
            <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden />
            <span>Manage triage labels</span>
          </button>
        ) : null}
      </div>

      {loading ? (
        <OperationalSkeletonList rows={3} className="mb-1" />
      ) : openTasks.length === 0 && completedTasks.length === 0 ? (
        <div className="rounded-dlc-sm border border-dashed border-border/70 p-3 text-center text-sm text-muted-foreground">
          <p>No tasks on this file yet. Add a task below or apply a playbook.</p>
          {canManageLabels ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="mt-3 min-h-9"
              onClick={() => openManager({ kind: "create" })}
              data-testid="file-tasks-empty-create-label"
            >
              Create your first triage label
            </Button>
          ) : null}
        </div>
      ) : (
        <>
          {openTasks.length > 0 ? (
            <ul className="w-full min-w-0 space-y-1.5" aria-label="Open file tasks">
              {openTasks.map((task) => (
                <FileTaskTriageFeedRow
                  key={task._id}
                  task={task}
                  presets={presets}
                  labelsById={labelsById}
                  evaluationTime={evaluationTime}
                  attachmentCount={attachmentCounts?.[String(task._id)] ?? 0}
                  onToggleDone={onToggleDone}
                  onDelete={onDelete}
                  onOpen={onOpen}
                  onLabelPillClick={
                    canManageLabels
                      ? (t, anchor) => setQuickEdit({ task: t, anchor })
                      : undefined
                  }
                  attemptActionsEnabled={canLogAttempts}
                  onAttemptSnooze={
                    canLogAttempts ? (t) => setAttemptSheetTask(t) : undefined
                  }
                  onSnoozeUntil={
                    organizationId && memberUserKey && !disabled
                      ? handleSnoozeUntil
                      : undefined
                  }
                  onOpenAttemptAudit={
                    canLogAttempts ? (t) => setAuditTask(t) : undefined
                  }
                  onWakeUp={canLogAttempts ? handleWakeUp : undefined}
                  wakingUp={wakingTaskId != null}
                />
              ))}
            </ul>
          ) : null}

          {completedTasks.length > 0 ? (
            <details
              className="group mt-4 border-t border-slate-100 pt-3 dark:border-slate-800"
              data-testid="file-tasks-completed-accordion"
            >
              <summary className="flex cursor-pointer list-none items-center justify-between rounded px-2 py-1.5 text-xs font-semibold text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-700 dark:hover:bg-slate-800/50 [&::-webkit-details-marker]:hidden">
                <span className="flex items-center gap-1.5">
                  <CheckCircle2
                    className="h-4 w-4 text-emerald-600"
                    aria-hidden
                  />
                  Completed Tasks ({completedTasks.length})
                </span>
                <ChevronDown
                  className="h-4 w-4 text-slate-400 transition-transform group-open:rotate-180"
                  aria-hidden
                />
              </summary>
              <div className="mt-2 space-y-1 border-l-2 border-slate-100 pl-2 dark:border-slate-800">
                {completedTasks.map((task) => (
                  <FileTaskCompletedRow
                    key={task._id}
                    task={task}
                    onToggleDone={onToggleDone}
                    onDelete={onDelete}
                  />
                ))}
              </div>
            </details>
          ) : null}
        </>
      )}

      <FileTaskTriageComposer
        organizationId={organizationId}
        memberUserKey={memberUserKey}
        onAdd={onAdd}
        disabled={disabled}
        onBrowseTemplates={
          canBrowseTemplates ? () => setTemplateModalOpen(true) : undefined
        }
        onManageLabels={
          canManageLabels ? () => openManager({ kind: "list" }) : undefined
        }
        onNewLabel={
          canManageLabels ? () => openManager({ kind: "create" }) : undefined
        }
        onEditLabel={
          canManageLabels
            ? (labelId) => openManager({ kind: "edit", labelId })
            : undefined
        }
      />

      {templateModalOpen &&
      organizationId &&
      memberUserKey &&
      pipelineFileId ? (
        <TaskTemplateApplyModal
          organizationId={organizationId}
          memberUserKey={memberUserKey}
          pipelineFileId={pipelineFileId}
          actorUserKey={actorUserKey}
          onClose={() => setTemplateModalOpen(false)}
          onApplied={({ count, groupName }) => {
            setApplyNotice(
              `Applied “${groupName}” — ${count} task${count === 1 ? "" : "s"} created.`,
            );
          }}
        />
      ) : null}

      {organizationId && memberUserKey ? (
        <>
          <TaskTriageLabelManagerSheet
            open={managerOpen}
            onClose={() => setManagerOpen(false)}
            organizationId={organizationId}
            memberUserKey={memberUserKey}
            initialMode={managerMode}
          />
          <TaskTriageQuickEditPopover
            open={quickEdit != null}
            onClose={() => setQuickEdit(null)}
            anchorEl={quickEdit?.anchor ?? null}
            task={quickEdit?.task ?? null}
            organizationId={organizationId}
            memberUserKey={memberUserKey}
            onOpenManager={(labelId) => {
              setQuickEdit(null);
              openManager(
                labelId
                  ? { kind: "edit", labelId }
                  : { kind: "list" },
              );
            }}
            onPatchTask={patchTaskLabel}
          />
          <TaskAttemptSnoozeSheet
            open={attemptSheetTask != null}
            onClose={() => setAttemptSheetTask(null)}
            task={attemptSheetTask}
            organizationId={organizationId}
            memberUserKey={memberUserKey}
            actorUserKey={actorUserKey}
          />
          <TaskAttemptAuditDialog
            open={auditTask != null}
            onClose={() => setAuditTask(null)}
            task={auditTask}
            organizationId={organizationId}
            memberUserKey={memberUserKey}
          />
        </>
      ) : null}
    </div>
  );
}
