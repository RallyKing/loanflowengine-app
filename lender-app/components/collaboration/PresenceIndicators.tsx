"use client";

import { useMemo } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { cn } from "@/lib/cn";
import { humanizeWorkspaceSurface } from "@/lib/collaboration/workspaceSurface";
import { useDocumentTabVisible } from "@/lib/hooks/useDocumentTabVisible";
import {
  useConvexSubMountTrace,
  useConvexSubQueryArgsTrace,
} from "@/lib/convexSubDiagnosticsHooks";

const statusColor: Record<string, string> = {
  online: "bg-emerald-500",
  viewing_file: "bg-sky-500",
  editing_file: "bg-amber-500",
  typing: "bg-violet-500",
  idle: "bg-muted-foreground/40",
  away: "bg-muted-foreground/25",
};

export function PresenceIndicators(props: {
  organizationId: Id<"organizations"> | null | undefined;
  memberUserKey?: string;
  pipelineFileId?: Id<"pipeline">;
  className?: string;
}) {
  const tabVisible = useDocumentTabVisible();

  const presenceArgs = useMemo(():
    | {
        organizationId: Id<"organizations">;
        memberUserKey?: string;
        pipelineFileId?: Id<"pipeline">;
      }
    | "skip" => {
    if (!props.organizationId || !tabVisible) return "skip";
    return {
      organizationId: props.organizationId,
      memberUserKey: props.memberUserKey,
      pipelineFileId: props.pipelineFileId,
    };
  }, [props.organizationId, props.memberUserKey, props.pipelineFileId, tabVisible]);

  useConvexSubMountTrace("PresenceIndicators");
  useConvexSubQueryArgsTrace("PresenceIndicators", presenceArgs, {
    queryKey: "presence.listActiveInOrganization",
    route: "file",
  });
  const rows = useQuery(api.presence.listActiveInOrganization, presenceArgs);

  if (!rows?.length) return null;

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground",
        props.className,
      )}
      aria-label="Team presence"
    >
      {rows.slice(0, 8).map((r) => {
        const surface = r.workspaceSurface
          ? humanizeWorkspaceSurface(r.workspaceSurface)
          : "";
        const detail = [r.surfaceKey, surface].filter(Boolean).join(" · ");
        return (
          <span
            key={`${r.userKey}-${r.tabSessionId ?? ""}`}
            className={cn(
              "inline-flex items-center gap-1 rounded-full border border-border/80 bg-muted/20 px-2 py-0.5",
              r.observationOnly && "opacity-80",
            )}
            title={
              detail
                ? `${r.userKey} · ${r.status} · ${detail}`
                : `${r.userKey} · ${r.status}`
            }
          >
            <span
              className={cn(
                "h-1.5 w-1.5 shrink-0 rounded-full ring-2 ring-background",
                statusColor[r.status] ?? "bg-muted-foreground",
                r.observationOnly && "ring-amber-200/50 dark:ring-amber-900/40",
              )}
            />
            <span className="max-w-[7rem] truncate">{r.userKey}</span>
            {surface ? (
              <span className="hidden text-[9px] normal-case text-muted-foreground/90 sm:inline">
                ({surface})
              </span>
            ) : null}
          </span>
        );
      })}
    </div>
  );
}
