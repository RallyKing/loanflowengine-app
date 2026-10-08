"use client";

import { useCallback, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { getFunctionName } from "convex/server";
import { api } from "@/convex/_generated/api";
import { useAuth } from "@/lib/sessionUiClient";
import { useActorUserKey } from "@/lib/useActorUserKey";
import {
  ALERT_CATEGORIES,
  DEFAULT_ALERT_PREFERENCES,
  type AlertCategory,
  type AlertPreferencesResolved,
} from "@/lib/alerts/alertCategories";
import { SettingsSectionCard } from "./SettingsHubChrome";

const CATEGORY_COPY: Record<
  AlertCategory,
  { label: string; hint: string }
> = {
  file_snooze_due: {
    label: "File snooze due",
    hint: "When a snoozed pipeline file comes due again.",
  },
  task_due: {
    label: "Task due",
    hint: "When a hub or vault file task is due.",
  },
};

export function SettingsRemindersSection() {
  const actorKey = useActorUserKey().trim();
  const { isLoaded, isSignedIn, userId } = useAuth();
  const sessionKey = isSignedIn && userId ? userId.trim() : "";
  const userKey = sessionKey || actorKey;
  const ready = isLoaded && isSignedIn === true && userKey.length > 0;

  const prefsArgs = useMemo(() => {
    if (!ready) return "skip" as const;
    return { userKey, memberUserKey: userKey };
  }, [ready, userKey]);

  const prefs = useQuery(api.alerts.getPreferences, prefsArgs);
  const upsertPreferences = useMutation(api.alerts.upsertPreferences);
  const upsertName = getFunctionName(api.alerts.upsertPreferences);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const resolved: AlertPreferencesResolved =
    prefs ?? DEFAULT_ALERT_PREFERENCES;
  const loaded = prefs !== undefined;
  const canEdit = ready && loaded;

  const toggleChannel = useCallback(
    (category: AlertCategory, channel: "inApp" | "push", enabled: boolean) => {
      if (!canEdit) return;
      if (resolved[category][channel] === enabled) return;
      const key = `${category}:${channel}`;
      setBusyKey(key);
      void (async () => {
        try {
          await upsertPreferences({
            userKey,
            memberUserKey: userKey,
            category,
            channel,
            enabled,
          });
        } finally {
          setBusyKey(null);
        }
      })();
    },
    [canEdit, resolved, upsertName, upsertPreferences, userKey],
  );

  return (
    <SettingsSectionCard
      id="reminders"
      title="Reminders"
      description="Reminder channels for file snooze and task due — separate from Notifications (the Alerts bell)."
    >
      {!ready ? (
        <p className="text-sm text-muted-foreground">
          Sign in to load and save reminder preferences for this account.
        </p>
      ) : !loaded ? (
        <p className="text-sm text-muted-foreground" aria-live="polite">
          Loading reminder preferences…
        </p>
      ) : (
        <div className="max-w-xl space-y-4">
          <p className="text-xs text-muted-foreground">
            In-app reminders appear in the Reminders bell. Push toggles are
            stored for later and are not delivered until Web Push ships.
          </p>
          <div className="space-y-3">
            {ALERT_CATEGORIES.map((id) => {
              const copy = CATEGORY_COPY[id];
              const channels = resolved[id];
              return (
                <div
                  key={id}
                  className="flex flex-col gap-2 rounded-dlc-md border border-border/60 bg-dlc-surface-high/40 px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
                  data-testid={`settings-reminders-row-${id}`}
                >
                  <span>
                    <span className="text-sm font-medium">{copy.label}</span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      {copy.hint}
                    </span>
                  </span>
                  <div className="flex flex-wrap gap-4">
                    <label className="flex min-h-10 cursor-pointer items-center gap-2 text-xs">
                      <input
                        type="checkbox"
                        className="h-4 w-4 accent-primary"
                        checked={channels.inApp}
                        disabled={!canEdit || busyKey === `${id}:inApp`}
                        onChange={(e) =>
                          toggleChannel(id, "inApp", e.target.checked)
                        }
                      />
                      In-app
                    </label>
                    <label className="flex min-h-10 cursor-pointer items-center gap-2 text-xs">
                      <input
                        type="checkbox"
                        className="h-4 w-4 accent-primary"
                        checked={channels.push}
                        disabled={!canEdit || busyKey === `${id}:push`}
                        onChange={(e) =>
                          toggleChannel(id, "push", e.target.checked)
                        }
                      />
                      Push
                    </label>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </SettingsSectionCard>
  );
}
