"use client";

import { useCallback, useEffect, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Moon } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { OrgScopedConvexArgs } from "@/lib/useOrgConvexQueryArgs";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Input";
import {
  DEFAULT_TASK_SNOOZE_DEFAULTS,
  normalizeTaskSnoozeDefaults,
} from "@/lib/taskSnoozePresets";

const TIMEZONE_OPTIONS = [
  "America/Chicago",
  "America/New_York",
  "America/Denver",
  "America/Los_Angeles",
  "America/Phoenix",
  "UTC",
];

export function OrganizationTaskSnoozeDefaultsPanel({
  orgScope,
}: {
  orgScope: OrgScopedConvexArgs;
}) {
  const defaults = useQuery(api.organizationSettings.getTaskSnoozeDefaults, {
    organizationId: orgScope.organizationId,
    memberUserKey: orgScope.memberUserKey,
  });

  const updateDefaults = useMutation(
    api.organizationSettings.updateTaskSnoozeDefaults,
  );

  const [timezone, setTimezone] = useState(
    DEFAULT_TASK_SNOOZE_DEFAULTS.timezone,
  );
  const [hour, setHour] = useState(
    String(DEFAULT_TASK_SNOOZE_DEFAULTS.nextMorningHour),
  );
  const [minute, setMinute] = useState(
    String(DEFAULT_TASK_SNOOZE_DEFAULTS.nextMorningMinute).padStart(2, "0"),
  );
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!defaults) return;
    const n = normalizeTaskSnoozeDefaults(defaults);
    setTimezone(n.timezone);
    setHour(String(n.nextMorningHour));
    setMinute(String(n.nextMorningMinute).padStart(2, "0"));
  }, [defaults]);

  const save = useCallback(async () => {
    setBusy(true);
    setMsg(null);
    try {
      const h = Number(hour);
      const m = Number(minute);
      await updateDefaults({
        organizationId: orgScope.organizationId,
        memberUserKey: orgScope.memberUserKey,
        taskSnoozeDefaults: {
          timezone,
          nextMorningHour: Number.isFinite(h) ? Math.min(23, Math.max(0, h)) : 8,
          nextMorningMinute: Number.isFinite(m)
            ? Math.min(59, Math.max(0, m))
            : 0,
        },
      });
      setMsg("Saved task snooze defaults.");
    } catch (caught) {
      setMsg(
        caught instanceof Error ? caught.message : "Could not save settings",
      );
    } finally {
      setBusy(false);
    }
  }, [
    hour,
    minute,
    orgScope.memberUserKey,
    orgScope.organizationId,
    timezone,
    updateDefaults,
  ]);

  return (
    <div
      className="rounded-lg border border-border/80 bg-muted/10 p-4 sm:p-5"
      data-testid="org-task-snooze-defaults-panel"
    >
      <div className="flex items-start gap-2">
        <Moon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-foreground">
            Task attempt snooze
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Controls when the &quot;Next morning&quot; preset wakes snoozed tasks
            after a logged attempt.
          </p>
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <div className="space-y-1 sm:col-span-1">
          <label className="text-xs font-medium text-muted-foreground">
            Timezone
          </label>
          <Select
            value={timezone}
            onChange={(e) => setTimezone(e.target.value)}
            disabled={busy || defaults === undefined}
          >
            {TIMEZONE_OPTIONS.map((tz) => (
              <option key={tz} value={tz}>
                {tz}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">
            Hour (0–23)
          </label>
          <Input
            type="number"
            min={0}
            max={23}
            value={hour}
            onChange={(e) => setHour(e.target.value)}
            disabled={busy || defaults === undefined}
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">
            Minute
          </label>
          <Input
            type="number"
            min={0}
            max={59}
            value={minute}
            onChange={(e) => setMinute(e.target.value)}
            disabled={busy || defaults === undefined}
          />
        </div>
      </div>

      {msg ? (
        <p className="mt-3 text-xs text-muted-foreground" role="status">
          {msg}
        </p>
      ) : null}

      <Button
        type="button"
        size="sm"
        className="mt-4 min-h-10"
        onClick={() => void save()}
        disabled={busy || defaults === undefined}
      >
        Save snooze defaults
      </Button>
    </div>
  );
}
