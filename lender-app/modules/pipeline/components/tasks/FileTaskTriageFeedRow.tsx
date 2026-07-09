"use client";

import { useRef } from "react";
import {
  AlarmClock,
  CalendarClock,
  Moon,
  Tag,
  Trash2,
  Zap,
} from "lucide-react";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import type { TaskColorPreset } from "@/lib/taskColorPresets";
import {
  formatScheduledTriggerLabel,
  inFileTaskTriageVisualState,
  triageColorTint,
  type OrganizationTriageLabelView,
} from "@/lib/inFileTaskTriageUi";
import { LabelAppliedAtCaption } from "@/components/pipeline/tasks/triage/LabelAppliedAtCaption";
import { SnoozeMenu, SnoozedBadge } from "@/components/SnoozeMenu";
import { pipelineMobilePrimaryTitleClass } from "@/lib/pipeline/mobileInformationHierarchy";
import { formatRelativeTimestamp } from "@/lib/formatRelativeTimestamp";
import { formatSnoozeUntilLabel } from "@/lib/taskSnoozePresets";

const taskTitleTextClass = cn(
  "text-sm font-medium leading-snug",
  pipelineMobilePrimaryTitleClass,
  "transition-[color,text-decoration] duration-dlc-standard",
);

export function FileTaskCompletedRow({
  task,
  onToggleDone,
  onDelete,
}: {
  task: Doc<"tasks">;
  onToggleDone: (task: Doc<"tasks">) => Promise<void>;
  onDelete: (task: Doc<"tasks">) => Promise<void>;
}) {
  return (
    <div
      className="group flex min-h-8 items-center gap-2 rounded-dlc-sm px-1.5 py-0.5 hover:bg-muted/40"
      data-testid="file-task-completed-row"
    >
      <input
        type="checkbox"
        className="h-3.5 w-3.5 shrink-0 rounded border-input accent-primary"
        checked
        onChange={() => void onToggleDone(task)}
        aria-label={`Mark "${task.title}" as todo`}
      />
      <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground line-through decoration-muted-foreground/70">
        {task.title}
      </span>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="h-6 w-6 shrink-0 px-0 text-muted-foreground opacity-60 hover:text-destructive group-hover:opacity-100"
        onClick={() => void onDelete(task)}
        aria-label={`Delete task ${task.title}`}
      >
        <Trash2 className="h-3 w-3" />
      </Button>
    </div>
  );
}

export function FileTaskTriageFeedRow({
  task,
  presets,
  labelsById,
  evaluationTime,
  attachmentCount,
  onToggleDone,
  onDelete,
  onOpen,
  onLabelPillClick,
  onAttemptSnooze,
  onOpenAttemptAudit,
  onSnoozeUntil,
  onWakeUp,
  attemptActionsEnabled,
  wakingUp,
}: {
  task: Doc<"tasks">;
  presets: TaskColorPreset[];
  labelsById: Map<string, OrganizationTriageLabelView>;
  evaluationTime: number;
  attachmentCount: number;
  onToggleDone: (task: Doc<"tasks">) => Promise<void>;
  onDelete: (task: Doc<"tasks">) => Promise<void>;
  onOpen: (id: Id<"tasks">) => void;
  onLabelPillClick?: (task: Doc<"tasks">, anchor: HTMLElement) => void;
  onAttemptSnooze?: (task: Doc<"tasks">) => void;
  onOpenAttemptAudit?: (task: Doc<"tasks">) => void;
  onSnoozeUntil?: (task: Doc<"tasks">, until: number) => Promise<void>;
  onWakeUp?: (task: Doc<"tasks">) => Promise<void>;
  attemptActionsEnabled?: boolean;
  wakingUp?: boolean;
}) {
  const labelPillRef = useRef<HTMLButtonElement>(null);
  const { labelHex, labelName, isDone, active, pending } =
    inFileTaskTriageVisualState(task, presets, labelsById, evaluationTime);
  const hex = labelHex;
  const showTriageChrome = Boolean(hex && (active || pending) && !isDone);
  const attemptCount = task.attemptCount ?? 0;
  const isSnoozed =
    typeof task.snoozedUntil === "number" && task.snoozedUntil > evaluationTime;
  const trueAgeMs = task.createdAt ?? task._creationTime;

  if (isDone) {
    return (
      <li>
        <FileTaskCompletedRow
          task={task}
          onToggleDone={onToggleDone}
          onDelete={onDelete}
        />
      </li>
    );
  }

  return (
    <li
      className={cn(
        "w-full min-w-0 rounded-dlc-md border border-gray-100 p-3 dark:border-gray-800",
        "transition-[border-color,background-color,box-shadow] duration-dlc-standard ease-dlc-standard",
        showTriageChrome ? "shadow-dlc-1" : "bg-dlc-surface shadow-dlc-0 hover:shadow-dlc-1",
      )}
      style={
        showTriageChrome && hex
          ? {
              borderLeftWidth: active ? 4 : 3,
              borderLeftStyle: pending && !active ? "dashed" : "solid",
              borderLeftColor: hex,
              backgroundColor: triageColorTint(hex, active ? "1A" : "0D"),
            }
          : undefined
      }
      data-testid="file-task-triage-row"
      data-triage-active={active ? "true" : "false"}
    >
      {/* Row 1: checkbox + title + right actions */}
      <div className="flex min-w-0 items-start gap-2">
        <input
          type="checkbox"
          className="mt-0.5 h-4 w-4 shrink-0 rounded border-input accent-primary"
          checked={false}
          onChange={() => void onToggleDone(task)}
          aria-label="Mark as done"
        />
        <button
          type="button"
          className="min-w-0 flex-1 text-left"
          onClick={() => onOpen(task._id)}
          title="Open task details"
          data-testid="file-task-row-title"
        >
          <span className={cn(taskTitleTextClass, "text-slate-800 dark:text-foreground")}>
            {task.title}
          </span>
        </button>
        <div className="ml-auto flex shrink-0 items-center gap-0.5">
          {onSnoozeUntil ? (
            <SnoozeMenu
              snoozedUntil={task.snoozedUntil}
              onSnooze={(until) => onSnoozeUntil(task, until)}
              onWake={onWakeUp ? () => onWakeUp(task) : () => {}}
              stopPropagation
              className="mt-0"
            />
          ) : null}
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 w-7 shrink-0 px-0 text-muted-foreground hover:text-destructive"
            onClick={() => void onDelete(task)}
            aria-label={`Delete task ${task.title}`}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Row 2: compact metadata + secondary actions */}
      <div className="mt-1.5 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 pl-6 text-xs text-slate-500">
        {labelName ? (
          <button
            ref={labelPillRef}
            type="button"
            className={cn(
              "inline-flex max-w-full items-center gap-1 rounded-full border px-2 py-0.5",
              "text-[11px] font-semibold transition-colors duration-dlc-standard ease-dlc-standard",
              "hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            )}
            style={
              hex
                ? {
                    color: hex,
                    borderColor: `${hex}55`,
                    backgroundColor: triageColorTint(hex, "18"),
                  }
                : undefined
            }
            onClick={() => {
              if (labelPillRef.current && onLabelPillClick) {
                onLabelPillClick(task, labelPillRef.current);
              }
            }}
            data-testid="file-task-row-label-pill"
            aria-label={`Edit label ${labelName}`}
          >
            <Tag className="h-3 w-3 shrink-0" aria-hidden />
            <span className="truncate">{labelName}</span>
          </button>
        ) : onLabelPillClick ? (
          <button
            ref={labelPillRef}
            type="button"
            className="text-[11px] font-medium text-primary hover:underline"
            onClick={() => {
              const anchor = labelPillRef.current;
              if (anchor) onLabelPillClick(task, anchor);
            }}
            data-testid="file-task-row-add-label"
          >
            Add label
          </button>
        ) : null}

        {labelName ? (
          <LabelAppliedAtCaption appliedAt={task.labelAppliedAt} now={evaluationTime} />
        ) : null}

        {task.scheduledTriggerTime != null ? (
          <span
            className={cn(
              "inline-flex items-center gap-1",
              pending ? "text-muted-foreground" : "font-medium",
            )}
            style={active && hex ? { color: hex } : undefined}
          >
            <CalendarClock className="h-3 w-3 shrink-0 opacity-80" aria-hidden />
            Scheduled for: {formatScheduledTriggerLabel(task.scheduledTriggerTime)}
            {pending ? " (pending)" : ""}
          </span>
        ) : null}

        <span
          className="text-muted-foreground"
          data-testid="file-task-true-age"
          title={new Date(trueAgeMs).toLocaleString()}
        >
          Created {formatRelativeTimestamp(trueAgeMs, evaluationTime)}
          {attachmentCount > 0
            ? ` · ${attachmentCount} attachment${attachmentCount === 1 ? "" : "s"}`
            : ""}
        </span>

        {isSnoozed && typeof task.snoozedUntil === "number" ? (
          <SnoozedBadge until={task.snoozedUntil} />
        ) : null}

        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          {attemptCount > 0 && onOpenAttemptAudit ? (
            <button
              type="button"
              className="inline-flex h-6 items-center gap-1 rounded-full border border-amber-500/35 bg-amber-500/10 px-2 py-0.5 text-[11px] font-semibold text-amber-950 hover:opacity-90 dark:text-amber-100"
              onClick={() => onOpenAttemptAudit(task)}
              data-testid={`file-task-attempt-count-${task._id}`}
            >
              <Zap className="h-3 w-3 shrink-0" aria-hidden />
              {attemptCount}
            </button>
          ) : null}
          {isSnoozed && onWakeUp ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-6 gap-1 px-2 py-0.5 text-[11px]"
              disabled={wakingUp}
              onClick={() => void onWakeUp(task)}
              data-testid={`file-task-wake-up-${task._id}`}
            >
              <AlarmClock className="h-3 w-3 shrink-0" aria-hidden />
              Wake up
            </Button>
          ) : null}
          {attemptActionsEnabled && onAttemptSnooze ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-6 gap-1 px-2 py-0.5 text-[11px]"
              onClick={() => onAttemptSnooze(task)}
              data-testid={`file-task-attempt-snooze-${task._id}`}
            >
              <Moon className="h-3 w-3 shrink-0" aria-hidden />
              Attempt / Snooze
            </Button>
          ) : null}
        </div>
      </div>

      {isSnoozed && typeof task.snoozedUntil === "number" ? (
        <p className="mt-0.5 pl-6 text-[11px] text-muted-foreground">
          Snoozed until {formatSnoozeUntilLabel(task.snoozedUntil)}
        </p>
      ) : null}
    </li>
  );
}
