"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Loader2 } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/Button";
import { OperationalOverlayShell } from "@/components/ui/OperationalOverlayShell";
import { OP_INLINE_TEXTAREA_CLASS } from "@/lib/ui/operationalInputs";
import {
  computeSnoozeUntilFromPreset,
  formatSnoozeUntilLabel,
  TASK_SNOOZE_PRESET_LABELS,
  type TaskSnoozePresetKey,
} from "@/lib/taskSnoozePresets";
import { cn } from "@/lib/cn";

const PRESET_KEYS: TaskSnoozePresetKey[] = [
  "next_morning",
  "3_days",
  "5_days",
  "1_week",
];

export function TaskAttemptSnoozeSheet({
  open,
  onClose,
  task,
  organizationId,
  memberUserKey,
  actorUserKey,
  onRecorded,
}: {
  open: boolean;
  onClose: () => void;
  task: Doc<"tasks"> | null;
  organizationId: Id<"organizations">;
  memberUserKey: string;
  actorUserKey?: string;
  onRecorded?: () => void;
}) {
  const [draft, setDraft] = useState("");
  const [preset, setPreset] = useState<TaskSnoozePresetKey>("next_morning");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const snoozeDefaults = useQuery(api.organizationSettings.getTaskSnoozeDefaults, {
    organizationId,
    memberUserKey,
  });

  const recordAttempt = useMutation(api.tasks.recordTaskAttempt);

  useEffect(() => {
    if (!open) return;
    setDraft("");
    setPreset("next_morning");
    setError(null);
    setBusy(false);
  }, [open, task?._id]);

  const previewUntil = useMemo(() => {
    if (!snoozeDefaults) return null;
    return computeSnoozeUntilFromPreset(preset, Date.now(), snoozeDefaults);
  }, [preset, snoozeDefaults]);

  const submit = useCallback(async () => {
    if (!task) return;
    const content = draft.trim();
    if (!content) {
      setError("Describe what you tried or learned on this attempt.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await recordAttempt({
        id: task._id,
        organizationId,
        memberUserKey,
        content,
        snoozePreset: preset,
        ...(actorUserKey ? { actorUserKey } : {}),
      });
      onRecorded?.();
      onClose();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Could not log attempt",
      );
    } finally {
      setBusy(false);
    }
  }, [
    actorUserKey,
    draft,
    memberUserKey,
    onClose,
    onRecorded,
    organizationId,
    preset,
    recordAttempt,
    task,
  ]);

  if (!task) return null;

  return (
    <OperationalOverlayShell
      open={open}
      onClose={onClose}
      align="center"
      layer="MODAL"
      aria-label="Log task attempt and snooze"
      data-testid="task-attempt-snooze-sheet"
      panelClassName="w-full max-w-md max-h-[min(90dvh,calc(100dvh-6rem))] overflow-y-auto p-4 sm:p-5"
    >
      <div className="space-y-4">
        <header>
          <h2 className="text-base font-semibold text-foreground">
            Log attempt &amp; snooze
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Adds a note on the file timeline and hides triage color on the hub
            until wake-up.
          </p>
          <p className="mt-1 text-xs font-medium text-foreground truncate">
            {task.title}
          </p>
        </header>

        <div className="space-y-1.5">
          <label
            htmlFor="task-attempt-note"
            className="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
          >
            Attempt note
          </label>
          <textarea
            id="task-attempt-note"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={4}
            className={cn(OP_INLINE_TEXTAREA_CLASS, "min-h-[6rem]")}
            placeholder="Called borrower, left voicemail, waiting on docs…"
            disabled={busy}
            data-testid="task-attempt-note-input"
          />
        </div>

        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Snooze until
          </p>
          <div className="flex flex-wrap gap-2">
            {PRESET_KEYS.map((key) => (
              <Button
                key={key}
                type="button"
                size="sm"
                variant={preset === key ? "primary" : "outline"}
                className="min-h-9"
                disabled={busy}
                onClick={() => setPreset(key)}
                data-testid={`task-attempt-preset-${key}`}
              >
                {TASK_SNOOZE_PRESET_LABELS[key]}
              </Button>
            ))}
          </div>
          {previewUntil != null ? (
            <p className="text-xs text-muted-foreground" role="status">
              Wakes {formatSnoozeUntilLabel(previewUntil)}
            </p>
          ) : null}
        </div>

        {error ? (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}

        <div className="flex flex-wrap justify-end gap-2 pt-1">
          <Button
            type="button"
            variant="outline"
            className="min-h-10"
            onClick={onClose}
            disabled={busy}
          >
            Cancel
          </Button>
          <Button
            type="button"
            className="min-h-10"
            onClick={() => void submit()}
            disabled={busy || !draft.trim()}
            data-testid="task-attempt-submit"
          >
            {busy ? (
              <Loader2
                className="h-4 w-4 animate-spin motion-reduce:animate-none"
                aria-hidden
              />
            ) : null}
            Save attempt
          </Button>
        </div>
      </div>
    </OperationalOverlayShell>
  );
}
