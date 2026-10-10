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
    case "task_scheduled":
      return AlarmClock;
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

function formatLoanAmount(amount: number | undefined): string | null {
  if (amount == null || !Number.isFinite(amount) || amount <= 0) return null;
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `$${Math.round(amount).toLocaleString("en-US")}`;
  }
}

/** Compact context lines under the reminder title (omit missing fields). */
function reminderContextLines(row: AlertRow): string[] {
  const lines: string[] = [];
  const task = row.taskName?.trim();
  if (task) lines.push(task);
  const contact = row.contactName?.trim();
  if (contact) lines.push(contact);
  const file = row.fileName?.trim();
  if (file) lines.push(file);
  const lender = row.lenderName?.trim();
  if (lender) lines.push(lender);
  const loan = formatLoanAmount(row.loanAmount);
  if (loan) lines.push(loan);
  return lines;
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
  /**
   * Same key resolution as UserNotificationsBell / ProductUpdatesBell so the
   * chrome control stays mounted whenever Updates/Alerts are. Prefer session
   * userId; fall back to the AppChrome `userKey` prop.
   */
  const k = sessionKey || (userKey?.trim() ?? "");
  const { activeOrganizationId } = useOrgPermissions();
  const [open, setOpen] = useState(false);
  const [panelPos, setPanelPos] = useState({ top: 0, left: 0, width: 384 });
  const [filter, setFilter] = useState<FilterTab>("unread");
  const [showHidden, setShowHidden] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  /** Run legacy deep-link repair once per mounted bell (idempotent; not on every open). */
  const deepLinkRepairAttemptedRef = useRef(false);
  /** Bounded one-shot enrich of legacy alerts missing denormalized row fields. */
  const displayContextBackfillAttemptedRef = useRef(false);

  /** Mount the Reminders control for signed-in chrome — never gate UI on JWT. */
  const chromeVisible = authLoaded && isSignedIn && k.length > 0;
  /**
   * Same session gate as UserNotificationsBell (Alerts). Do not wait on
   * `useConvexJwtReady`: when the token probe fails or never reaches "ready",
   * `queryReady && jwtReady` stayed false and the open panel showed
   * "Loading reminders…" forever. Backend `requireAuthenticatedCaller` accepts
   * verified workspace members via `memberUserKey` without JWT; Unauthorized is
   * soft-handled by `useQueries` (Error result → panel message, not crash).
   */
  const queryReady = chromeVisible;

  /**
   * Always subscribe to unread + list when the control is mounted (same as
   * Alerts / `UserNotificationsBell`). Open-gating `listForUser` left the panel
   * on "Loading reminders…" forever when the dynamic `useQueries` key never
   * settled, while the badge still worked. Args stay clock-free.
   */
  const alertQueries = useMemo((): RequestForQueries => {
    if (!queryReady) return {};
    const base = {
      userKey: k,
      memberUserKey: k,
      ...(activeOrganizationId ? { orgId: activeOrganizationId } : {}),
    };
    return {
      unread: {
        query: api.alerts.unreadCountForUser,
        args: base,
      },
      items: {
        query: api.alerts.listForUser,
        args: {
          ...base,
          limit: LIST_LIMIT,
          includeDismissed: showHidden,
        },
      },
    };
  }, [queryReady, k, activeOrganizationId, showHidden]);

  const alertResults = useQueries(alertQueries);
  const unreadRaw = queryReady ? alertResults.unread : undefined;
  const itemsRaw = queryReady ? alertResults.items : undefined;

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
  const unreadSettled = unreadRaw !== undefined;
  const itemsSettled = itemsRaw !== undefined;
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
          return (
            row.category === "task_due" || row.category === "task_scheduled"
          );
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
  const markAllReadForUser = useMutation(api.alerts.markAllReadForUser);
  const clearAllForUser = useMutation(api.alerts.clearAllForUser);
  const repairDeepLinksForUser = useMutation(api.alerts.repairDeepLinksForUser);
  const backfillDisplayContextForUser = useMutation(
    api.alerts.backfillDisplayContextForUser,
  );

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

  if (!chromeVisible) return null;

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
    // markRead also repairs legacy `/tasks?task=` links → `/pipeline/{fileId}?block=tasks&task=…`
    const result = await markRead({ id: row._id, memberUserKey: k });
    const path = (result?.deepLinkPath || row.deepLinkPath || "").trim();
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

  const orgScope = activeOrganizationId
    ? { orgId: activeOrganizationId }
    : {};

  /**
   * Mark all unread reminders read — badge → 0; rows stay visible (not dismissed).
   * Paginated server mutation; does not depend on the list query having loaded.
   */
  const markAllRead = async () => {
    if (busy || !queryReady) return;
    setBusy(true);
    try {
      let guard = 0;
      let hasMore = true;
      while (hasMore && guard < 20) {
        guard += 1;
        const result = await markAllReadForUser({
          userKey: k,
          memberUserKey: k,
          ...orgScope,
        });
        hasMore = result.hasMore;
        if (result.updated === 0) break;
      }
      setSelected(new Set());
    } finally {
      setBusy(false);
    }
  };

  /**
   * Clear all — mark read + dismiss/hide. Zeros the badge and removes rows from
   * the default inbox. Paginated; independent of list load state.
   */
  const clearAll = async () => {
    if (busy || !queryReady) return;
    setBusy(true);
    try {
      let guard = 0;
      let hasMore = true;
      while (hasMore && guard < 20) {
        guard += 1;
        const result = await clearAllForUser({
          userKey: k,
          memberUserKey: k,
          hide: true,
          ...orgScope,
        });
        hasMore = result.hasMore;
        if (result.updated === 0) break;
      }
      setSelected(new Set());
    } finally {
      setBusy(false);
    }
  };

  /** One-shot repair of legacy task deep links when the panel opens (bounded). */
  const repairDeepLinksOnce = async () => {
    if (!queryReady) return;
    let guard = 0;
    let hasMore = true;
    while (hasMore && guard < 10) {
      guard += 1;
      const result = await repairDeepLinksForUser({
        userKey: k,
        memberUserKey: k,
        ...orgScope,
      });
      hasMore = result.hasMore;
      if (result.repaired === 0 && !hasMore) break;
      if (result.scanned === 0) break;
    }
  };

  const backfillDisplayContextOnce = async () => {
    if (!queryReady) return;
    let guard = 0;
    let hasMore = true;
    while (hasMore && guard < 6) {
      guard += 1;
      const result = await backfillDisplayContextForUser({
        userKey: k,
        memberUserKey: k,
        ...orgScope,
      });
      hasMore = result.hasMore;
      if (result.updated === 0 && !hasMore) break;
      if (result.scanned === 0) break;
    }
  };

  // Loading only while subscribed queries are unresolved. Never treat skipped
  // queries or a settled unread + pending list as an endless spinner.
  const loading =
    open &&
    queryReady &&
    !queryError &&
    (!unreadSettled || !itemsSettled);
  // Panel children are evaluated even when PortalOverlayPanel returns null
  // (open=false). List is always subscribed when ready — still guard .map.
  const listRows = visibleItems ?? [];
  const empty =
    open && !loading && !queryError && itemsSettled && listRows.length === 0;

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
        onClick={() => {
          const next = !open;
          setOpen(next);
          if (next && !deepLinkRepairAttemptedRef.current) {
            deepLinkRepairAttemptedRef.current = true;
            void repairDeepLinksOnce();
          }
          if (next && !displayContextBackfillAttemptedRef.current) {
            displayContextBackfillAttemptedRef.current = true;
            void backfillDisplayContextOnce();
          }
        }}
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
              <>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs"
                  disabled={busy}
                  data-testid="time-alerts-mark-all-read"
                  title="Mark all reminders read without hiding them"
                  onClick={() => void markAllRead()}
                >
                  Mark all read
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs"
                  disabled={busy}
                  data-testid="time-alerts-clear-all"
                  title="Mark all read and hide them from the inbox"
                  onClick={() => void clearAll()}
                >
                  Clear all
                </Button>
              </>
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
              {open
                ? badgeCount > 0
                  ? "Reminders are ready — use Clear all to zero the badge, or adjust filters."
                  : "No reminders in this view."
                : null}
            </p>
          ) : (
            <ul className="space-y-1" aria-label="Reminder list">
              {listRows.map((row) => {
                const Icon = categoryIcon(row.category);
                const unread = row.readAt == null;
                const hidden = isCurrentlyHidden(row, nowBucket);
                const dismissed = row.dismissedAt != null;
                const checked = selected.has(row._id);
                const contextLines = reminderContextLines(row);
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
                          {contextLines.length > 0 ? (
                            <span className="mt-0.5 block space-y-0.5 text-[11px] leading-snug text-foreground/85">
                              {contextLines.map((line) => (
                                <span
                                  key={line}
                                  className="block truncate"
                                  title={line}
                                >
                                  {line}
                                </span>
                              ))}
                            </span>
                          ) : null}
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
