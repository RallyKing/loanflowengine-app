"use client";

import { useCallback, useState } from "react";
import { useOrgMemberQueryArgs } from "@/lib/convex/useStableConvexArgs";
import { useQuery } from "convex/react";
import { BookOpen, CalendarClock, Plus } from "lucide-react";
import type { Id } from "@/convex/_generated/dataModel";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import type { FileTaskCreatePayload } from "@/lib/inFileTaskTriageUi";
import { showOperationalToast } from "@/lib/ui/operationalToast";

function submitBlockedReason(args: {
  title: string;
  adding: boolean;
  disabled?: boolean;
  scheduleEnabled: boolean;
  scheduledLocal: string;
}): string | null {
  if (args.disabled) {
    return "Reconnect or select an organization before adding tasks.";
  }
  if (args.adding) return "Already adding a task…";
  if (!args.title.trim()) return "Enter a task description first.";
  if (args.scheduleEnabled && !args.scheduledLocal.trim()) {
    return "Pick a schedule date or turn off Schedule date.";
  }
  return null;
}

export function FileTaskTriageComposer({
  organizationId,
  memberUserKey,
  onAdd,
  onBrowseTemplates,
  onManageLabels,
  disabled,
}: {
  organizationId?: Id<"organizations">;
  memberUserKey?: string;
  onAdd: (payload: FileTaskCreatePayload) => Promise<void>;
  onBrowseTemplates?: () => void;
  onManageLabels?: () => void;
  onNewLabel?: () => void;
  onEditLabel?: (labelId: Id<"organizationTriageLabels">) => void;
  disabled?: boolean;
}) {
  const [draft, setDraft] = useState("");
  const [selectedLabelId, setSelectedLabelId] =
    useState<Id<"organizationTriageLabels"> | null>(null);
  const [scheduleEnabled, setScheduleEnabled] = useState(false);
  const [scheduledLocal, setScheduledLocal] = useState("");
  const [adding, setAdding] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const orgMemberArgs = useOrgMemberQueryArgs(organizationId, memberUserKey);

  const triageLabels =
    useQuery(api.organizationTriageLabels.listTriageLabels, orgMemberArgs) ?? [];

  const canSubmit =
    draft.trim().length > 0 &&
    !adding &&
    !disabled &&
    (!scheduleEnabled || scheduledLocal.trim().length > 0);

  const resetComposer = useCallback(() => {
    setDraft("");
    setSelectedLabelId(null);
    setScheduleEnabled(false);
    setScheduledLocal("");
    setSubmitError(null);
  }, []);

  const submit = async () => {
    const title = draft.trim();
    const blocked = submitBlockedReason({
      title,
      adding,
      disabled,
      scheduleEnabled,
      scheduledLocal,
    });
    if (blocked) {
      setSubmitError(blocked);
      showOperationalToast({
        title: "Cannot add task",
        description: blocked,
        variant: "destructive",
      });
      return;
    }

    let scheduledTriggerTime: number | undefined;
    if (scheduleEnabled && scheduledLocal.trim()) {
      const parsed = new Date(scheduledLocal).getTime();
      if (!Number.isFinite(parsed)) {
        const msg = "Scheduled date and time are invalid.";
        setSubmitError(msg);
        showOperationalToast({
          title: "Cannot add task",
          description: msg,
          variant: "destructive",
        });
        return;
      }
      scheduledTriggerTime = parsed;
    }

    const payload: FileTaskCreatePayload = {
      title,
      ...(selectedLabelId ? { triageLabelId: selectedLabelId } : {}),
      ...(scheduledTriggerTime != null ? { scheduledTriggerTime } : {}),
    };

    setAdding(true);
    setSubmitError(null);
    try {
      await onAdd(payload);
      resetComposer();
      showOperationalToast({
        title: "Task added",
        description: title,
        variant: "success",
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Could not add task.";
      console.error("[FileTaskTriageComposer] onAdd failed", error, payload);
      setSubmitError(message);
      showOperationalToast({
        title: "Could not add task",
        description: message,
        variant: "destructive",
      });
    } finally {
      setAdding(false);
    }
  };

  return (
    <div
      className="rounded-dlc-md border border-gray-100 bg-dlc-surface/40 p-3 shadow-dlc-1 dark:border-gray-800"
      data-testid="file-task-triage-composer"
    >
      <textarea
        placeholder="Describe the next task for this file…"
        value={draft}
        onChange={(e) => {
          setDraft(e.currentTarget.value);
          if (submitError) setSubmitError(null);
        }}
        onKeyDown={(e) => {
          if (e.key !== "Enter" || e.shiftKey) return;
          e.preventDefault();
          void submit();
        }}
        aria-label="Task description"
        disabled={adding || disabled}
        rows={2}
        className={cn(
          "w-full resize-none rounded-lg border border-slate-200 bg-slate-50/50 px-3.5 py-2.5",
          "text-sm font-medium outline-none transition-all",
          "focus:border-emerald-600 focus:bg-white focus:ring-2 focus:ring-emerald-600/10",
          "disabled:cursor-not-allowed disabled:opacity-60",
        )}
      />

      <div
        className="mt-2 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-2"
        role="toolbar"
        aria-label="Add task controls"
      >
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Triage:
          </span>
          <select
            value={selectedLabelId ?? ""}
            onChange={(e) => {
              const v = e.target.value;
              setSelectedLabelId(
                v ? (v as Id<"organizationTriageLabels">) : null,
              );
            }}
            disabled={adding || disabled}
            className={cn(
              "cursor-pointer rounded-md border border-slate-200 bg-white px-2.5 py-1.5",
              "text-xs font-medium text-slate-700 shadow-sm hover:border-slate-300",
              "focus:border-emerald-600 focus:outline-none",
            )}
            data-testid="file-task-triage-select"
            aria-label="Triage label"
          >
            <option value="">No triage label (optional)</option>
            {triageLabels.map((label) => (
              <option key={label._id} value={label._id}>
                {label.label}
              </option>
            ))}
          </select>
          {onManageLabels ? (
            <button
              type="button"
              className="text-[11px] text-slate-400 underline hover:text-slate-600"
              onClick={onManageLabels}
              disabled={adding || disabled}
              data-testid="file-task-manage-labels"
            >
              Manage
            </button>
          ) : null}

          <Button
            type="button"
            size="sm"
            variant={scheduleEnabled ? "primary" : "outline"}
            className="h-7 gap-1 px-2.5 py-0.5 text-[11px]"
            aria-pressed={scheduleEnabled}
            disabled={adding || disabled}
            onClick={() => {
              setScheduleEnabled((prev) => {
                const next = !prev;
                if (!next) setScheduledLocal("");
                return next;
              });
              if (submitError) setSubmitError(null);
            }}
            data-testid="file-task-toggle-schedule"
          >
            <CalendarClock className="h-3 w-3 shrink-0" aria-hidden />
            Schedule date
          </Button>

          {scheduleEnabled ? (
            <input
              type="datetime-local"
              className="h-7 rounded-md border border-slate-200 bg-white px-2 text-xs"
              value={scheduledLocal}
              onChange={(e) => {
                setScheduledLocal(e.currentTarget.value);
                if (submitError) setSubmitError(null);
              }}
              disabled={adding || disabled}
              aria-label="Scheduled follow-up date and time"
              data-testid="file-task-scheduled-datetime"
            />
          ) : null}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {onBrowseTemplates ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 text-xs"
              disabled={adding || disabled}
              onClick={onBrowseTemplates}
              data-testid="file-task-browse-templates"
            >
              <BookOpen className="h-3.5 w-3.5 shrink-0" aria-hidden />
              Browse templates
            </Button>
          ) : null}
          <Button
            type="button"
            size="sm"
            className={cn(
              "h-8 gap-1.5 rounded-md px-4 text-xs font-medium text-white shadow-sm",
              "bg-emerald-600 hover:bg-emerald-700",
            )}
            onClick={() => void submit()}
            disabled={!canSubmit}
            data-testid="file-task-submit"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden />
            {adding ? "Adding…" : "Add task"}
          </Button>
        </div>
      </div>

      {submitError ? (
        <p className="mt-2 text-xs text-destructive" role="alert">
          {submitError}
        </p>
      ) : null}
    </div>
  );
}
