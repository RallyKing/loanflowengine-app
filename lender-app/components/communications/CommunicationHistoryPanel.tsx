"use client";

import { useMemo } from "react";
import { useQuery } from "convex/react";
import type { Id } from "@/convex/_generated/dataModel";
import { api } from "@/convex/_generated/api";
import { cn } from "@/lib/cn";
import { useDocumentTabVisible } from "@/lib/hooks/useDocumentTabVisible";
import {
  useConvexSubMountTrace,
  useConvexSubQueryArgsTrace,
} from "@/lib/convexSubDiagnosticsHooks";
import { Mail, MessageSquareMore, Send, Clock3, AlertTriangle } from "lucide-react";

function formatWhen(at: number): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(at));
  } catch {
    return new Date(at).toLocaleString();
  }
}

function statusTone(status: string): string {
  if (status === "failed" || status === "bounced") {
    return "border-destructive/30 bg-destructive/[0.04] text-destructive";
  }
  if (status === "queued" || status === "scheduled" || status === "sending") {
    return "border-amber-300/40 bg-amber-50/60 text-amber-900 dark:border-amber-800/50 dark:bg-amber-950/20 dark:text-amber-200";
  }
  return "border-border/60 bg-muted/15 text-foreground";
}

function sourceIcon(channel: string) {
  if (channel === "portal") return MessageSquareMore;
  if (channel === "email") return Mail;
  return Send;
}

export function CommunicationHistoryPanel(props: {
  organizationId: Id<"organizations">;
  memberUserKey?: string;
  relatedPipelineFileId?: Id<"pipeline">;
  relatedContactId?: Id<"contacts">;
  relatedLenderId?: Id<"lenders">;
  className?: string;
  emptyLabel?: string;
  maxHeightClassName?: string;
}) {
  const tabVisible = useDocumentTabVisible();

  const historyArgs = useMemo(
    () => {
      if (!tabVisible) return "skip" as const;
      return {
        organizationId: props.organizationId,
        memberUserKey: props.memberUserKey,
        relatedPipelineFileId: props.relatedPipelineFileId,
        relatedContactId: props.relatedContactId,
        relatedLenderId: props.relatedLenderId,
        limit: 18,
      };
    },
    [
      tabVisible,
      props.organizationId,
      props.memberUserKey,
      props.relatedPipelineFileId,
      props.relatedContactId,
      props.relatedLenderId,
    ],
  );

  useConvexSubMountTrace("CommunicationHistoryPanel");
  useConvexSubQueryArgsTrace("CommunicationHistoryPanel", historyArgs, {
    queryKey: "communications.listHistory",
    route: "communications",
  });
  const rows = useQuery(api.communications.listHistory, historyArgs);

  const content = useMemo(() => {
    if (rows === undefined) {
      return <p className="text-xs text-muted-foreground">Loading communication history…</p>;
    }
    if (!rows.length) {
      return (
        <p className="text-xs text-muted-foreground">
          {props.emptyLabel ?? "No communication history yet."}
        </p>
      );
    }
    return (
      <ul
        className={cn(
          "space-y-2 overflow-y-auto pr-1",
          props.maxHeightClassName ?? "max-h-72",
        )}
      >
        {rows.map((row) => {
          const Icon = sourceIcon(row.channel);
          return (
            <li
              key={`${row.source}-${row.id}`}
              className={cn("rounded-xl border px-3 py-2", statusTone(row.status))}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                    <Icon className="h-3.5 w-3.5" aria-hidden />
                    <span>{row.channel}</span>
                    <span className="rounded-full border border-current/15 px-1.5 py-0.5 normal-case tracking-normal">
                      {row.status}
                    </span>
                  </div>
                  {row.subject ? (
                    <div className="mt-1 truncate text-sm font-medium text-foreground">
                      {row.subject}
                    </div>
                  ) : null}
                  <p className="mt-1 whitespace-pre-wrap text-xs text-muted-foreground">
                    {row.summary}
                  </p>
                  {row.recipients?.length ? (
                    <p className="mt-1 truncate text-[11px] text-muted-foreground">
                      To: {row.recipients.join(", ")}
                    </p>
                  ) : null}
                </div>
                <div className="shrink-0 text-[11px] text-muted-foreground">
                  {formatWhen(row.at)}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    );
  }, [props.emptyLabel, props.maxHeightClassName, rows]);

  return (
    <div className={cn("space-y-2", props.className)}>
      <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
        <Clock3 className="h-3.5 w-3.5" aria-hidden />
        Communication history
      </div>
      {content}
      <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
        <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
        Email and portal threads are unified here, while older legacy items remain visible
        until migrated.
      </p>
    </div>
  );
}
