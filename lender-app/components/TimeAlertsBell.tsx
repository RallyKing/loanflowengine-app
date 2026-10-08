"use client";

import { useLayoutEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useMutation, useQueries, type RequestForQueries } from "convex/react";
import { useRouter } from "next/navigation";
import { AlarmClock, BellRing, ListTodo, Moon } from "lucide-react";
import { useAuth } from "@/lib/sessionUiClient";
import { api } from "@/convex/_generated/api";
import type { Doc } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/Button";
import { PortalOverlayPanel } from "@/components/ui/PortalOverlayPanel";
import { cn } from "@/lib/cn";
import {
  TriageClockProvider,
  useTriageClockTime,
} from "@/components/providers/TriageClockProvider";
import { formatRelativeTimestamp } from "@/lib/formatRelativeTimestamp";
import { isInternalAppPath } from "@/lib/alerts/internalPath";
import { settingsHref } from "@/lib/settingsRegistry";
import { useOrgPermissions } from "@/lib/useOrgPermissions";

type AlertRow = Doc<"alerts">;
type FilterTab = "all" | "unread" | "snooze" | "tasks";

const LIST_LIMIT = 50;

const FILTER_TABS: { id: FilterTab; label: string }[] = [
  { id: "all", label: "All" },
  { id: "unread", label: "Unread" },
  { id: "snooze", label: "Snooze" },
  { id: "tasks", label: "Tasks" },
];

type TimeAlertsBellProps = {
  /** Optional explicit user key; when absent, the signed-in session userKey is used. */
  userKey?: string;
  className?: string;
};

function categoryIcon(category: AlertRow["category"]) {
  switch (category) {
    case "file_snooze_due":
      return Moon;
    case "task_due":
      return ListTodo;
    default: {
      const _exhaustive: never = category;
      return _exhaustive;
    }
  }
}

function entityLabel(entityType: AlertRow["entityType"]): string {
  switch (entityType) {
    case "pipeline":
      return "File";
    case "task":
      return "Task";
    case "documentVaultFileTask":
      return "Vault task";
    default: {
      const _exhaustive: never = entityType;
      return _exhaustive;
    }
  }
}

function isCurrentlyHidden(row: AlertRow, nowBucket: number): boolean {
  return row.hiddenUntil != null && row.hiddenUntil > nowBucket;
}

/**
 * Time Alerts (Reminders) inbox — separate from `UserNotificationsBell` (Alerts).
 * Queries are clock-free; `hiddenUntil` is filtered against TriageClockProvider.
 */
export function TimeAlertsBell(props: TimeAlertsBellProps) {
  return (
    <TriageClockProvider>
      <TimeAlertsBellInner {...props} />
    </TriageClockProvider>
  );
}

function TimeAlertsBellInner({
  userKey,
  className,
}: TimeAlertsBellProps) {
  const router = useRouter();
  const nowBucket = useTriageClockTime();
  const { isLoaded: authLoaded, isSignedIn, userId } = useAuth();
  const sessionKey = isSignedIn && userId ? userId.trim() : "";
  const k = sessionKey || (userKey?.trim() ?? "");
  const { activeOrganizationId } = useOrgPermissions();
  const [open, setOpen] = useState(false);
  const [panelPos, setPanelPos] = useState({ top: 0, left: 0, width: 384 });
  const [filter, setFilter] = useState<FilterTab>("all");
  const [showHidden, setShowHidden] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const ready = authLoaded && isSignedIn && k.length > 0;

  /**
   * Badge always subscribes to unread count. List only while the panel is open
   * (shell cost — no always-on listForUser). Args stay clock-free.
   */
  const alertQueries = useMemo((): RequestForQueries => {
    if (!ready) return {};
    const base = {
      userKey: k,
      memberUserKey: k,
      ...(activeOrganizationId ? { orgId: activeOrganizationId } : {}),
    };
    const req: RequestForQueries = {
      unread: {
        query: api.alerts.unreadCountForUser,
        args: base,
      },
    };
    if (open) {
      req.items = {
        query: api.alerts.listForUser,
        args: {
          ...base,
          limit: LIST_LIMIT,
          includeDismissed: showHidden,
        },
      };
    }
    return req;
  }, [ready, k, activeOrganizationId, showHidden, open]);

  const alertResults = useQueries(alertQueries);
  const unreadRaw = ready ? alertResults.unread : undefined;
  const itemsRaw = ready ? alertResults.items : undefined;

  const queryError =
    unreadRaw instanceof Error
      ? unreadRaw
      : itemsRaw instanceof Error
        ? itemsRaw
        : null;

  const unreadPayload =
    unreadRaw instanceof Error || unreadRaw === undefined
      ? undefined
      : (unreadRaw as { count: number; capped: boolean });
  const allItems: AlertRow[] | undefined =
    itemsRaw instanceof Error || itemsRaw === undefined
      ? undefined
      : (itemsRaw as AlertRow[]);

  const visibleItems = useMemo(() => {
    if (!allItems) return undefined;
    return allItems.filter((row) => {
      if (!showHidden && isCurrentlyHidden(row, nowBucket)) return false;
      if (!showHidden && row.dismissedAt != null) return false;
      switch (filter) {
        case "unread":
          return row.readAt == null;
        case "snooze":
          return row.category === "file_snooze_due";
        case "tasks":
          return row.category === "task_due";
        case "all":
          return true;
        default: {
          const _exhaustive: never = filter;
          return _exhaustive;
        }
      }
    });
  }, [allItems, filter, nowBucket, showHidden]);

  const markRead = useMutation(api.alerts.markRead);
  const dismiss = useMutation(api.alerts.dismiss);

  useLayoutEffect(() => {
    if (!open || !rootRef.current) return;
    const rect = rootRef.current.getBoundingClientRect();
    const width = Math.min(384, window.innerWidth - 16);
    const left = Math.max(
      8,
      Math.min(rect.right - width, window.innerWidth - width - 8),
    );
    setPanelPos({ top: rect.bottom + 6, left, width });
  }, [open]);

  // Clear selection when the filtered list identity changes.
  const visibleIdsKey = visibleItems?.map((r) => r._id).join(",") ?? "";
  useLayoutEffect(() => {
    setSelected(new Set());
  }, [visibleIdsKey, filter, showHidden]);

  if (!ready) return null;

  const badgeCount = unreadPayload?.count ?? 0;
  const badgeCapped = unreadPayload?.capped === true || badgeCount > 99;
  const badgeLabel = badgeCapped ? "99+" : String(badgeCount);

  const toggleSelected = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const openRow = async (row: AlertRow) => {
    if (row.readAt == null) {
      await markRead({ id: row._id, memberUserKey: k });
    }
    // Task deep links use `/tasks?task=` — Tasks page opens the drawer from searchParams.
    const path = row.deepLinkPath?.trim() ?? "";
    if (path && isInternalAppPath(path)) {
      router.push(path);
    }
    setOpen(false);
  };

  const runBulk = async (action: "read" | "hide") => {
    if (!visibleItems || selected.size === 0 || busy) return;
    setBusy(true);
    try {
      const ids = visibleItems
        .filter((r) => selected.has(r._id))
        .map((r) => r._id);
      await Promise.all(
        ids.map((id) =>
          action === "read"
            ? markRead({ id, memberUserKey: k })
            : dismiss({ id, memberUserKey: k }),
        ),
      );
      setSelected(new Set());
    } finally {
      setBusy(false);
    }
  };

  const markAllRead = async () => {
    if (!allItems || busy) return;
    const unread = allItems.filter(
      (r) =>
        r.readAt == null &&
        r.dismissedAt == null &&
        (showHidden || !isCurrentlyHidden(r, nowBucket)),
    );
    if (unread.length === 0) return;
    setBusy(true);
    try {
      await Promise.all(
        unread.map((r) => markRead({ id: r._id, memberUserKey: k })),
      );
      setSelected(new Set());
    } finally {
      setBusy(false);
    }
  };

  const loading =
    ready &&
    open &&
    !queryError &&
    (allItems === undefined || unreadPayload === undefined);
  // Panel children are evaluated even when PortalOverlayPanel returns null
  // (open=false). List query is skipped while closed, so visibleItems is
  // undefined — never call .map without a defined array.
  const listRows = visibleItems ?? [];
  const empty = open && !loading && !queryError && listRows.length === 0;

  return (
    <div
      ref={rootRef}
      className={cn("relative", className)}
      data-portal-overlay-trigger
    >
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="relative h-11 min-h-11 min-w-11 shrink-0 gap-1.5 max-md:px-2 sm:min-w-0"
        data-testid="time-alerts-bell"
        aria-label="Reminders"
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((v) => !v)}
      >
        <AlarmClock className="h-4 w-4" aria-hidden />
        <span className="hidden sm:inline">Reminders</span>
        {badgeCount > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-destructive-foreground">
            {badgeLabel}
          </span>
        )}
      </Button>

      <PortalOverlayPanel
        open={open}
        onClose={() => setOpen(false)}
        position={panelPos}
        layer="CHROME_MENU"
        className="p-3"
        aria-label="Reminders"
        data-testid="time-alerts-panel"
      >
        <div className="mb-2 flex items-center justify-between gap-2">
          <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <BellRing className="h-3.5 w-3.5" aria-hidden />
            Reminders
          </span>
          <div className="flex items-center gap-1">
            {badgeCount > 0 ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                disabled={busy}
                onClick={() => void markAllRead()}
              >
                Mark all read
              </Button>
            ) : null}
          </div>
        </div>

        <div
          role="tablist"
          aria-label="Filter reminders"
          className="mb-2 flex flex-wrap gap-1"
        >
          {FILTER_TABS.map((tab) => {
            const active = filter === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={active}
                id={`time-alerts-tab-${tab.id}`}
                className={cn(
                  "h-8 min-h-8 rounded-dlc-sm px-2.5 text-xs font-medium transition-colors duration-dlc-short1 ease-dlc-standard",
                  active
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted/50 text-muted-foreground hover:bg-muted",
                )}
                onClick={() => setFilter(tab.id)}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <label className="flex min-h-8 cursor-pointer items-center gap-1.5 text-xs text-muted-foreground">
            <input
              type="checkbox"
              className="h-3.5 w-3.5 accent-primary"
              checked={showHidden}
              onChange={(e) => setShowHidden(e.target.checked)}
            />
            Show hidden
          </label>
          {selected.size > 0 ? (
            <div className="flex items-center gap-1">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                disabled={busy}
                onClick={() => void runBulk("read")}
              >
                Mark read
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                disabled={busy}
                onClick={() => void runBulk("hide")}
              >
                Hide
              </Button>
            </div>
          ) : null}
        </div>

        <div
          className="max-h-[min(60dvh,24rem)] space-y-1 overflow-y-auto pr-0.5"
          role="tabpanel"
          aria-labelledby={`time-alerts-tab-${filter}`}
        >
          {queryError ? (
            <p className="text-xs text-destructive" role="alert">
              Could not load reminders. Try again in a moment.
            </p>
          ) : loading ? (
            <p className="text-xs text-muted-foreground" aria-live="polite">
              Loading reminders…
            </p>
          ) : empty || listRows.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              {open ? "No reminders in this view." : null}
            </p>
          ) : (
            <ul className="space-y-1" aria-label="Reminder list">
              {listRows.map((row) => {
                const Icon = categoryIcon(row.category);
                const unread = row.readAt == null;
                const hidden = isCurrentlyHidden(row, nowBucket);
                const dismissed = row.dismissedAt != null;
                const checked = selected.has(row._id);
                return (
                  <li key={row._id}>
                    <div
                      className={cn(
                        "flex w-full items-start gap-2 rounded-dlc-sm border border-transparent px-1.5 py-1.5 transition-colors duration-dlc-short1 ease-dlc-standard hover:border-border hover:bg-muted/60",
                        unread && "bg-muted/30",
                        (hidden || dismissed) && "opacity-70",
                      )}
                    >
                      <input
                        type="checkbox"
                        className="mt-2 h-3.5 w-3.5 shrink-0 accent-primary"
                        checked={checked}
                        aria-label={`Select ${row.title}`}
                        onChange={() => toggleSelected(row._id)}
                      />
                      <button
                        type="button"
                        className="flex min-h-10 min-w-0 flex-1 items-start gap-2 text-left text-sm"
                        onClick={() => void openRow(row)}
                      >
                        <span
                          className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-dlc-sm bg-muted text-muted-foreground"
                          aria-hidden
                        >
                          <Icon className="h-3.5 w-3.5" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span
                            className={cn(
                              "line-clamp-2",
                              unread ? "font-semibold" : "font-medium",
                            )}
                          >
                            {row.title}
                          </span>
                          <span className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[10px] text-muted-foreground">
                            <span>{entityLabel(row.entityType)}</span>
                            <span aria-hidden>·</span>
                            <span>
                              {formatRelativeTimestamp(row.createdAt, nowBucket)}
                            </span>
                            {unread ? (
                              <>
                                <span aria-hidden>·</span>
                                <span className="font-medium text-foreground/80">
                                  Unread
                                </span>
                              </>
                            ) : null}
                            {dismissed ? (
                              <>
                                <span aria-hidden>·</span>
                                <span>Hidden</span>
                              </>
                            ) : null}
                            {hidden && !dismissed ? (
                              <>
                                <span aria-hidden>·</span>
                                <span>Snoozed</span>
                              </>
                            ) : null}
                          </span>
                          {row.body?.trim() ? (
                            <span className="mt-0.5 block line-clamp-1 text-[10px] text-muted-foreground">
                              {row.body.trim()}
                            </span>
                          ) : null}
                        </span>
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <p className="mt-2 border-t border-border pt-2 text-[10px] text-muted-foreground">
          File snooze and task due reminders. Notification Alerts stay in the
          Alerts bell.{" "}
          <Link
            href={settingsHref("reminders")}
            className="font-medium text-primary underline-offset-2 hover:underline"
            data-testid="time-alerts-settings-link"
            onClick={() => setOpen(false)}
          >
            Reminder preferences
          </Link>
        </p>
      </PortalOverlayPanel>
    </div>
  );
}
