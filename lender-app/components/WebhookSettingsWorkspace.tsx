"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Activity, Loader2, Radio, Send } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { cn } from "@/lib/cn";
import { dataTableClassNames } from "@/lib/dataTableClasses";
import { useOrgConvexQueryArgs } from "@/lib/useOrgConvexQueryArgs";
import { useOrgPermissions } from "@/lib/useOrgPermissions";
import { useUserSettings } from "@/lib/userSettingsContext";
import { showOperationalToast } from "@/lib/ui/operationalToast";
import {
  MAX_WEBHOOK_DELIVERY_ATTEMPTS,
  type NotificationEventType,
} from "@/convex/notificationConstants";
import { MerchantChannelNotificationSettings } from "@/components/MerchantChannelNotificationSettings";

function deliveryStatusLabel(log: {
  status: string;
  attempts?: number;
  httpStatus?: number | null;
}): string {
  if (log.status === "retrying") {
    const nextAttempt = Math.min(
      (log.attempts ?? 1) + 1,
      MAX_WEBHOOK_DELIVERY_ATTEMPTS,
    );
    const http = log.httpStatus != null ? ` · ${log.httpStatus}` : "";
    return `Retrying (Attempt ${nextAttempt}/${MAX_WEBHOOK_DELIVERY_ATTEMPTS})${http}`;
  }
  const http = log.httpStatus != null ? ` · ${log.httpStatus}` : "";
  return `${log.status}${http}`;
}

function deliveryStatusClass(status: string): string {
  if (status === "success") return "bg-emerald-50 text-emerald-800";
  if (status === "retrying") return "bg-amber-50 text-amber-900";
  return "bg-red-50 text-red-700";
}

export function WebhookSettingsWorkspace() {
  const orgScope = useOrgConvexQueryArgs();
  const { can } = useOrgPermissions();
  const { settings } = useUserSettings();
  const canManage = can("settings.access");

  const eventTypes = useQuery(api.webhooks.listNotificationEventTypes, {});
  const webhooks = useQuery(
    api.webhooks.listWebhooks,
    orgScope
      ? {
          organizationId: orgScope.organizationId,
          memberUserKey: orgScope.memberUserKey,
        }
      : "skip",
  );
  const recentLogs = useQuery(
    api.webhooks.listWebhookLogs,
    orgScope
      ? {
          organizationId: orgScope.organizationId,
          memberUserKey: orgScope.memberUserKey,
          limit: 20,
        }
      : "skip",
  );

  const createWebhook = useMutation(api.webhooks.createWebhook);
  const sendTestPing = useMutation(api.webhooks.sendTestPing);
  const setWebhookActive = useMutation(api.webhooks.setWebhookActive);

  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [selectedEvents, setSelectedEvents] = useState<Set<NotificationEventType>>(
    () => new Set(["test_ping"]),
  );
  const [busy, setBusy] = useState(false);
  const [pingingId, setPingingId] = useState<Id<"webhooks"> | null>(null);

  const eventLabelById = useMemo(() => {
    const map = new Map<string, string>();
    for (const e of eventTypes ?? []) {
      map.set(e.id, e.label);
    }
    return map;
  }, [eventTypes]);

  function toggleEvent(id: NotificationEventType) {
    setSelectedEvents((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!orgScope) return;
    if (selectedEvents.size === 0) {
      showOperationalToast({
        title: "Select events",
        description: "Choose at least one event subscription.",
      });
      return;
    }
    setBusy(true);
    try {
      await createWebhook({
        organizationId: orgScope.organizationId,
        memberUserKey: orgScope.memberUserKey,
        name,
        url,
        subscribedEvents: [...selectedEvents],
      });
      setName("");
      setUrl("");
      showOperationalToast({
        title: "Webhook registered",
        variant: "success",
      });
    } catch (err) {
      showOperationalToast({
        title: "Could not save webhook",
        description: err instanceof Error ? err.message : "Unknown error",
      });
    } finally {
      setBusy(false);
    }
  }

  if (!canManage) {
    return (
      <p className="text-sm text-muted-foreground">
        You need settings access to manage notification webhooks.
      </p>
    );
  }

  if (!orgScope) {
    return (
      <p className="text-sm text-muted-foreground">
        Join or select an organization to configure webhooks.
      </p>
    );
  }

  return (
    <div className="space-y-8" data-testid="webhook-settings-workspace">
      <form
        onSubmit={(e) => void handleCreate(e)}
        className="max-w-xl space-y-4 rounded-dlc-lg border border-border/70 bg-dlc-surface p-4"
      >
        <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Radio className="h-4 w-4 text-primary" aria-hidden />
          Register endpoint
        </div>
        <p className="text-xs text-muted-foreground">
          HTTPS POST endpoints receive JSON when subscribed events fire. Deliveries
          run in the background and never block the UI.
        </p>
        <label className="block text-xs font-medium text-foreground">
          Name
          <Input
            className="mt-1"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="GoHighLevel intake bridge"
            required
            data-testid="webhook-form-name"
          />
        </label>
        <label className="block text-xs font-medium text-foreground">
          URL
          <Input
            className="mt-1 font-mono text-[11px]"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://hooks.example.com/lfe"
            required
            data-testid="webhook-form-url"
          />
        </label>
        <fieldset>
          <legend className="text-xs font-medium text-foreground">
            Subscribed events
          </legend>
          <ul className="mt-2 space-y-1.5">
            {(eventTypes ?? []).map((ev) => (
              <li key={ev.id}>
                <label className="flex cursor-pointer items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={selectedEvents.has(ev.id as NotificationEventType)}
                    onChange={() => toggleEvent(ev.id as NotificationEventType)}
                  />
                  <span>{ev.label}</span>
                  <span className="font-mono text-[10px] text-muted-foreground">
                    {ev.id}
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </fieldset>
        <Button
          type="submit"
          size="sm"
          variant="primary"
          disabled={busy}
          data-testid="webhook-form-submit"
        >
          {busy ? "Saving…" : "Add webhook"}
        </Button>
      </form>

      <section>
        <h4 className="text-sm font-semibold text-foreground">Active connections</h4>
        {webhooks === undefined ? (
          <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            Loading…
          </div>
        ) : webhooks.length === 0 ? (
          <p className="mt-2 text-xs text-muted-foreground">
            No webhooks registered yet.
          </p>
        ) : (
          <div className="mt-3 overflow-x-auto rounded-lg border border-border/80">
            <table
              className={dataTableClassNames(
                settings.tableDensity,
                "min-w-full text-xs",
              )}
            >
              <thead className="bg-muted text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left">Name</th>
                  <th className="px-3 py-2 text-left">URL</th>
                  <th className="px-3 py-2 text-left">Events</th>
                  <th className="px-3 py-2 text-left">Status</th>
                  <th className="px-3 py-2 text-left">Actions</th>
                </tr>
              </thead>
              <tbody>
                {webhooks.map((hook) => (
                  <tr
                    key={hook._id}
                    className="border-b border-border/60 odd:bg-muted/15"
                  >
                    <td className="px-3 py-2">{hook.name}</td>
                    <td
                      className={cn(
                        "max-w-[200px] truncate px-3 py-2 font-mono text-[10px]",
                      )}
                    >
                      {hook.url}
                    </td>
                    <td className="px-3 py-2">
                      {hook.subscribedEvents
                        .map((e) => eventLabelById.get(e) ?? e)
                        .join(", ")}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={cn(
                          "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase",
                          hook.isActive
                            ? "bg-emerald-50 text-emerald-800"
                            : "bg-muted text-muted-foreground",
                        )}
                      >
                        {hook.isActive ? "active" : "paused"}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-1">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-7 gap-1 text-[10px]"
                          disabled={pingingId === hook._id || !hook.isActive}
                          data-testid={`webhook-ping-${hook._id}`}
                          onClick={() => {
                            setPingingId(hook._id);
                            void sendTestPing({
                              organizationId: orgScope.organizationId,
                              memberUserKey: orgScope.memberUserKey,
                              webhookId: hook._id,
                            })
                              .then(() =>
                                showOperationalToast({
                                  title: "Test ping queued",
                                  description:
                                    "Check delivery logs below in a few seconds.",
                                  variant: "success",
                                }),
                              )
                              .catch((err) =>
                                showOperationalToast({
                                  title: "Ping failed",
                                  description:
                                    err instanceof Error ? err.message : "Error",
                                }),
                              )
                              .finally(() => setPingingId(null));
                          }}
                        >
                          <Send className="h-3 w-3" aria-hidden />
                          Ping
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="h-7 text-[10px]"
                          onClick={() =>
                            void setWebhookActive({
                              organizationId: orgScope.organizationId,
                              memberUserKey: orgScope.memberUserKey,
                              webhookId: hook._id,
                              isActive: !hook.isActive,
                            })
                          }
                        >
                          {hook.isActive ? "Pause" : "Resume"}
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section>
        <h4 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Activity className="h-4 w-4" aria-hidden />
          Recent delivery log
        </h4>
        {recentLogs === undefined ? (
          <p className="mt-2 text-xs text-muted-foreground">Loading logs…</p>
        ) : recentLogs.length === 0 ? (
          <p className="mt-2 text-xs text-muted-foreground">
            No deliveries logged yet. Send a test ping to verify connectivity.
          </p>
        ) : (
          <ul className="mt-3 max-h-64 space-y-2 overflow-y-auto text-xs">
            {recentLogs.map((log) => (
              <li
                key={log._id}
                className="rounded-dlc-md border border-border/60 bg-background/80 px-2 py-1.5"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-medium">{log.event}</span>
                  <span
                    className={cn(
                      "rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase",
                      deliveryStatusClass(log.status),
                    )}
                  >
                    {deliveryStatusLabel(log)}
                  </span>
                </div>
                <p className="mt-0.5 text-[10px] text-muted-foreground">
                  {new Date(log.createdAt).toLocaleString()}
                  {log.status === "retrying" && log.nextRetryAt
                    ? ` — next retry ${new Date(log.nextRetryAt).toLocaleTimeString()}`
                    : ""}
                  {log.errorMessage ? ` — ${log.errorMessage}` : ""}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <MerchantChannelNotificationSettings />
    </div>
  );
}
