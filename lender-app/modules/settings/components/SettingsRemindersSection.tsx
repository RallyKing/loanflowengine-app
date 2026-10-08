"use client";

import { useCallback, useMemo, useState } from "react";
import {
  useMutation,
  useQueries,
  type RequestForQueries,
} from "convex/react";
import { getFunctionName } from "convex/server";
import { api } from "@/convex/_generated/api";
import { useAuth } from "@/lib/sessionUiClient";
import { useActorUserKey } from "@/lib/useActorUserKey";
import { useConvexJwtReady } from "@/lib/useConvexOrgQueryReady";
import { useOrgPermissions } from "@/lib/useOrgPermissions";
import {
  ALERT_CATEGORIES,
  DEFAULT_ALERT_PREFERENCES,
  type AlertCategory,
  type AlertPreferencesResolved,
} from "@/lib/alerts/alertCategories";
import { Button } from "@/components/ui/Button";
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
    label: "Task due / reminder",
    hint: "When a hub or vault file task due date or reminder time is reached.",
  },
  task_scheduled: {
    label: "Task schedule",
    hint: "When an in-file triage scheduled trigger time is reached.",
  },
};

export function SettingsRemindersSection() {
  const actorKey = useActorUserKey().trim();
  const { isLoaded, isSignedIn, userId } = useAuth();
  const jwtReady = useConvexJwtReady();
  const { activeOrganizationId } = useOrgPermissions();
  const sessionKey = isSignedIn && userId ? userId.trim() : "";
  /** Prefer session userKey; never fall back to browser accountId while signed in. */
  const userKey = sessionKey || (isSignedIn ? "" : actorKey);
  const sessionReady = isLoaded && isSignedIn === true && userKey.length > 0;
  /** Wait for Convex RS256 JWT — unauthenticated getPreferences throws and crashes the route. */
  const ready = sessionReady && jwtReady;

  const prefsQueries = useMemo((): RequestForQueries => {
    if (!ready) return {};
    return {
      prefs: {
        query: api.alerts.getPreferences,
        args: { userKey, memberUserKey: userKey },
      },
    };
  }, [ready, userKey]);

  const prefsResults = useQueries(prefsQueries);
  const prefsRaw = ready ? prefsResults.prefs : undefined;
  const prefsError = prefsRaw instanceof Error ? prefsRaw : null;
  const prefs =
    prefsRaw instanceof Error || prefsRaw === undefined
      ? undefined
      : (prefsRaw as AlertPreferencesResolved);

  const upsertPreferences = useMutation(api.alerts.upsertPreferences);
  const scheduleSelfTest = useMutation(api.alerts.scheduleSelfTestReminder);
  const upsertName = getFunctionName(api.alerts.upsertPreferences);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [testBusy, setTestBusy] = useState(false);
  const [testMessage, setTestMessage] = useState<string | null>(null);

  const resolved: AlertPreferencesResolved =
    prefs ?? DEFAULT_ALERT_PREFERENCES;
  const loaded = prefs !== undefined;
  const canEdit = ready && loaded && !prefsError;

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

  const runSelfTest = useCallback(() => {
    if (!ready || !activeOrganizationId) return;
    setTestBusy(true);
    setTestMessage(null);
    void (async () => {
      try {
        const result = await scheduleSelfTest({
          orgId: activeOrganizationId,
          memberUserKey: userKey,
          delayMs: 5000,
        });
        const secs = Math.max(1, Math.round(result.delayMs / 1000));
        setTestMessage(
          result.alreadyPending
            ? `A test reminder is already scheduled — check the Reminders bell in about ${secs}s.`
            : `Test reminder scheduled — check the Reminders bell in about ${secs}s.`,
        );
      } catch (e) {
        setTestMessage(
          e instanceof Error ? e.message : "Could not schedule test reminder.",
        );
      } finally {
        setTestBusy(false);
      }
    })();
  }, [ready, activeOrganizationId, scheduleSelfTest, userKey]);

  return (
    <SettingsSectionCard
      id="reminders"
      title="Reminders"
      description="Reminder channels for file snooze and task due — separate from Notifications (the Alerts bell)."
    >
      {!sessionReady ? (
        <p className="text-sm text-muted-foreground">
          Sign in to load and save reminder preferences for this account.
        </p>
      ) : prefsError ? (
        <p className="text-sm text-destructive" role="alert">
          Could not load reminder preferences. Wait a moment and refresh — if
          this continues, sign out and back in.
        </p>
      ) : !ready || !loaded ? (
        <p className="text-sm text-muted-foreground" aria-live="polite">
          Loading reminder preferences…
        </p>
      ) : (
        <div className="max-w-xl space-y-4">
          <p className="text-xs text-muted-foreground">
            In-app reminders appear in the Reminders bell. Push toggles are
            stored for later and are not delivered until Web Push ships. File
            snooze reminders fire at the snooze end time (usually end of day) —
            use Send test reminder to verify the bell sooner.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={!canEdit || !activeOrganizationId || testBusy}
              onClick={runSelfTest}
              data-testid="settings-reminders-self-test"
            >
              {testBusy ? "Scheduling…" : "Send test reminder"}
            </Button>
            {testMessage ? (
              <p className="text-xs text-muted-foreground" role="status">
                {testMessage}
              </p>
            ) : null}
          </div>
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
