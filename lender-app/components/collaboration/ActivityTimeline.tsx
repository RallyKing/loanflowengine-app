"use client";

import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { cn } from "@/lib/cn";
import type { CollaborationEventType } from "@/lib/activity/eventTypes";
import { useDocumentTabVisible } from "@/lib/hooks/useDocumentTabVisible";
import {
  useConvexSubMountTrace,
  useConvexSubQueryArgsTrace,
} from "@/lib/convexSubDiagnosticsHooks";
import { useOrgMemberDisplayLabel } from "@/lib/useOrgMemberDisplayLabel";

const EVENT_FILTER: CollaborationEventType[] = [
  "file_created",
  "file_updated",
  "status_changed",
  "task_assigned",
  "task_completed",
  "comment_added",
  "document_uploaded",
  "assignment_changed",
  "ownership_changed",
  "deadline_changed",
  "communication_sent",
  "communication_delivered",
  "communication_failed",
  "communication_retry_scheduled",
];

export function ActivityTimeline(props: {
  organizationId: Id<"organizations"> | null | undefined;
  memberUserKey?: string;
  className?: string;
}) {
  const [filter, setFilter] = useState<CollaborationEventType | "all">("all");
  const tabVisible = useDocumentTabVisible();
  const { labelFor } = useOrgMemberDisplayLabel(
    props.organizationId ?? undefined,
    props.memberUserKey,
  );

  const queryArgs = useMemo(():
    | {
        organizationId: Id<"organizations">;
        memberUserKey?: string;
        limit: number;
        eventType?: CollaborationEventType;
      }
    | "skip" => {
    if (!props.organizationId || !tabVisible) return "skip";
    return {
      organizationId: props.organizationId,
      memberUserKey: props.memberUserKey,
      limit: 60,
      ...(filter === "all" ? {} : { eventType: filter }),
    };
  }, [props.organizationId, props.memberUserKey, filter, tabVisible]);

  useConvexSubMountTrace("ActivityTimeline");
  useConvexSubQueryArgsTrace("ActivityTimeline", queryArgs, {
    queryKey: "activityEvents.listForOrganization",
    route: "file",
  });
  const rows = useQuery(api.activityEvents.listForOrganization, queryArgs);

  const grouped = useMemo(() => {
    if (!rows) return [];
    const byActor = new Map<string, typeof rows>();
    for (const r of rows) {
      const g = byActor.get(r.actorUserKey) ?? [];
      g.push(r);
      byActor.set(r.actorUserKey, g);
    }
    return [...byActor.entries()].sort(
      (a, b) => (b[1][0]?.at ?? 0) - (a[1][0]?.at ?? 0),
    );
  }, [rows]);

  return (
    <div
      className={cn(
        "flex min-h-0 flex-col rounded-dlc-md border border-border bg-background",
        props.className,
      )}
    >
      <div className="flex shrink-0 flex-wrap items-center gap-1 border-b border-border px-3 py-2">
        <span className="mr-2 text-xs font-semibold text-muted-foreground">
          Activity
        </span>
        <select
          className="h-8 rounded-md border border-border bg-background px-2 text-xs"
          value={filter}
          onChange={(e) =>
            setFilter((e.target.value as CollaborationEventType | "all") || "all")
          }
        >
          <option value="all">All</option>
          {EVENT_FILTER.map((t) => (
            <option key={t} value={t}>
              {t.replace(/_/g, " ")}
            </option>
          ))}
        </select>
      </div>
      <div className="min-h-0 flex-1 touch-scroll-y overflow-y-auto p-3 text-sm">
        {grouped.map(([actor, events]) => {
          const actorLabel =
            events[0]?.actorDisplayUsername?.trim() || labelFor(actor);
          return (
            <div key={actor} className="mb-4">
              <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                {actorLabel}
              </div>
              <ul className="space-y-2 border-l-2 border-border/60 pl-3">
                {events.map((e) => (
                  <li key={e._id} className="text-xs leading-snug">
                    <div className="font-medium text-foreground">{e.summary}</div>
                    <div className="text-[10px] text-muted-foreground">
                      {new Date(e.at).toLocaleString()} · {e.eventType}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
        {rows?.length === 0 ? (
          <p className="text-xs text-muted-foreground">No activity yet.</p>
        ) : null}
      </div>
    </div>
  );
}
