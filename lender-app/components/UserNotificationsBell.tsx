"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQueries, type RequestForQueries } from "convex/react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/sessionUiClient";
import { Bell, CalendarClock } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import type { FunctionReturnType } from "convex/server";
import { Button } from "@/components/ui/Button";
import { PortalOverlayPanel } from "@/components/ui/PortalOverlayPanel";
import { cn } from "@/lib/cn";
import { APP_DISPLAY_NAME } from "@/lib/brandIdentity";
import { overlaySurfaceClass } from "@/lib/ui/layering";
import { useOrgPermissions } from "@/lib/useOrgPermissions";

type AttentionPreview = FunctionReturnType<
  typeof api.tasks.assigneeAttentionPreview
>;

function categoryLabel(c: Doc<"userNotifications">["category"]): string {
  switch (c) {
    case "task_assignment":
      return "Task";
    case "file_update":
      return "File";
    case "mention":
      return "Mention";
    case "deadline":
      return "Deadline";
    case "assignment_change":
      return "Assignment";
    case "comment_activity":
      return "Comment";
    case "document_activity":
      return "Document";
    case "status_change":
      return "Status";
    case "digest_group":
      return "Digest";
    default:
      return "Alert";
  }
}

type UserNotificationsBellProps = {
  /**
   * Optional explicit user key; when absent, the signed-in session userKey is used.
   */
  userKey?: string;
  /** When set (e.g. on Tasks page), opens the task drawer instead of navigating. */
  onOpenTask?: (id: Id<"tasks">) => void;
  className?: string;
};

export function UserNotificationsBell({
  userKey,
  onOpenTask,
  className,
}: UserNotificationsBellProps) {
  const router = useRouter();
  const { isLoaded: authLoaded, isSignedIn, userId } = useAuth();
  const sessionKey = isSignedIn && userId ? userId.trim() : "";
  const k = sessionKey || (userKey?.trim() ?? "");
  const { activeOrganizationId } = useOrgPermissions();
  const [open, setOpen] = useState(false);
  const [panelPos, setPanelPos] = useState({ top: 0, left: 0, width: 352 });
  const rootRef = useRef<HTMLDivElement>(null);
  const prevUnread = useRef<number | undefined>(undefined);

  // Wait for session identity before issuing user-scoped queries.
  const ready = authLoaded && isSignedIn && k.length > 0;

  /** `useQuery` throws on Convex server errors; `useQueries` returns `Error` (see convex/react `useQuery`). */
  const notificationQueries = useMemo((): RequestForQueries => {
    const q: RequestForQueries = {};
    if (ready) {
      q.unread = {
        query: api.notifications.unreadCountForUser,
        args: { userKey: k, memberUserKey: k },
      };
      q.items = {
        query: api.notifications.listUnreadForUser,
        args: { userKey: k, memberUserKey: k, limit: 25 },
      };
    }
    if (ready && activeOrganizationId) {
      q.attention = {
        query: api.tasks.assigneeAttentionPreview,
        args: { organizationId: activeOrganizationId, maxRows: 10 },
      };
    }
    return q;
  }, [ready, k, activeOrganizationId]);

  const notificationResults = useQueries(notificationQueries);
  const unreadRaw = ready ? notificationResults.unread : undefined;
  const unread =
    unreadRaw instanceof Error ? 0 : (unreadRaw ?? 0);
  const itemsRaw = ready ? notificationResults.items : undefined;
  const items: Doc<"userNotifications">[] | undefined =
    itemsRaw instanceof Error
      ? undefined
      : (itemsRaw as Doc<"userNotifications">[] | undefined);
  const attentionRaw =
    ready && activeOrganizationId
      ? notificationResults.attention
      : undefined;
  const attention: AttentionPreview | undefined =
    attentionRaw instanceof Error
      ? undefined
      : (attentionRaw as AttentionPreview | undefined);

  const markRead = useMutation(api.notifications.markRead);
  const markAllRead = useMutation(api.notifications.markAllReadForUser);

  useEffect(() => {
    if (unread === undefined) return;
    const p = prevUnread.current;
    prevUnread.current = unread;
    if (p === undefined) return;
    if (
      unread > p &&
      typeof Notification !== "undefined" &&
      Notification.permission === "granted"
    ) {
      new Notification(APP_DISPLAY_NAME, {
        body: "You have new notifications.",
      });
    }
  }, [unread]);

  useLayoutEffect(() => {
    if (!open || !rootRef.current) return;
    const rect = rootRef.current.getBoundingClientRect();
    const width = Math.min(352, window.innerWidth - 16);
    const left = Math.max(8, Math.min(rect.right - width, window.innerWidth - width - 8));
    setPanelPos({ top: rect.bottom + 6, left, width });
  }, [open]);

  if (!ready) return null;

  const count = unread ?? 0;

  const openRow = async (row: Doc<"userNotifications">) => {
    await markRead({ id: row._id, memberUserKey: k });
    if (row.taskId) {
      if (onOpenTask) onOpenTask(row.taskId);
      else router.push(`/tasks?task=${row.taskId}`);
    } else if (row.fileId) {
      router.push("/pipeline");
    }
    setOpen(false);
  };

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="relative h-11 min-h-11 min-w-11 shrink-0 gap-1.5 max-md:px-2 sm:min-w-0"
        data-testid="notifications-bell"
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => {
          setOpen((v) => !v);
          if (
            typeof Notification !== "undefined" &&
            Notification.permission === "default"
          ) {
            void Notification.requestPermission();
          }
        }}
      >
        <Bell className="h-4 w-4" aria-hidden />
        <span className="hidden sm:inline">Alerts</span>
        {count > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-destructive-foreground">
            {count > 99 ? "99+" : count}
          </span>
        )}
      </Button>

      <PortalOverlayPanel
        open={open}
        onClose={() => setOpen(false)}
        position={panelPos}
        layer="DROPDOWN"
        className="p-3"
        aria-label="Notifications"
        data-testid="notifications-inbox-panel"
      >
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Inbox
            </span>
            {count > 0 && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={() => void markAllRead({ userKey: k, memberUserKey: k })}
              >
                Mark all read
              </Button>
            )}
          </div>

          <div className="max-h-[min(60dvh,24rem)] space-y-3 overflow-y-auto pr-0.5">
            <section>
              <h3 className="mb-1.5 text-[11px] font-medium text-muted-foreground">
                Recent
              </h3>
              {!items || items.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  You&apos;re all caught up.
                </p>
              ) : (
                <ul className="space-y-1">
                  {items.map((row) => (
                    <li key={row._id}>
                      <button
                        type="button"
                        className="w-full rounded-md border border-transparent px-2 py-1.5 text-left text-sm transition-colors hover:border-border hover:bg-muted/60"
                        onClick={() => void openRow(row)}
                      >
                        <span className="line-clamp-2">{row.summary}</span>
                        <span className="mt-0.5 block text-[10px] text-muted-foreground">
                          {categoryLabel(row.category)}
                          {"actorDisplayUsername" in row &&
                          typeof row.actorDisplayUsername === "string" &&
                          row.actorDisplayUsername.trim() ? (
                            <>
                              {" "}
                              · {row.actorDisplayUsername}
                            </>
                          ) : null}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section>
              <h3 className="mb-1.5 flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
                <CalendarClock className="h-3 w-3" aria-hidden />
                Due &amp; reminders (assignee)
              </h3>
              {!attention || attention.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  Nothing due soon or ringing right now.
                </p>
              ) : (
                <ul className="space-y-1">
                  {attention.map(({ task: t, reason }) => (
                    <li key={t._id}>
                      <button
                        type="button"
                        className="w-full rounded-md border border-transparent px-2 py-1.5 text-left text-sm transition-colors hover:border-border hover:bg-muted/60"
                        onClick={() => {
                          if (onOpenTask) onOpenTask(t._id);
                          else router.push(`/tasks?task=${t._id}`);
                          setOpen(false);
                        }}
                      >
                        <span className="line-clamp-2 font-medium">
                          {t.title.trim()}
                        </span>
                        <span className="mt-0.5 block text-[10px] text-muted-foreground">
                          {reason === "overdue"
                            ? "Overdue"
                            : reason === "reminder"
                              ? "Reminder"
                              : "Due soon"}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          <p className="mt-2 border-t border-border pt-2 text-[10px] text-muted-foreground">
            Control categories and email in Settings → Notifications. Email
            uses Resend when{" "}
            <code className="rounded bg-muted px-0.5">RESEND_API_KEY</code> is
            set in Convex.
          </p>
      </PortalOverlayPanel>
    </div>
  );
}

/** @deprecated Use `UserNotificationsBell`; kept for existing imports. */
export const TaskNotificationsBell = UserNotificationsBell;
