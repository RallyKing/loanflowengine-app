"use client";

import { useMemo } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { cn } from "@/lib/cn";
import { filterLivePresenceRows } from "@/lib/collaboration/presenceLiveness";
import { useDocumentTabVisible } from "@/lib/hooks/useDocumentTabVisible";
import {
  useConvexSubQueryArgsTrace,
} from "@/lib/convexSubDiagnosticsHooks";
import { AlertTriangle } from "lucide-react";

/**
 * Warns when another operator is actively editing the same pipeline workspace slice.
 * Uses org presence heartbeats — no ghost locks after TTL (`presence` cron purge).
 */
export function OccupancyConflictCallout(props: {
  organizationId: Id<"organizations"> | null | undefined;
  memberUserKey?: string;
  pipelineFileId: Id<"pipeline">;
  /** Current client's `surfaceKey` from drawer / task focus (e.g. block id). */
  surfaceKey: string | undefined;
  /** True when this tab is in `editing_file` presence. */
  selfEditing: boolean;
  className?: string;
}) {
  const tabVisible = useDocumentTabVisible();

  const presenceArgs = useMemo(():
    | {
        organizationId: Id<"organizations">;
        memberUserKey?: string;
        pipelineFileId: Id<"pipeline">;
      }
    | "skip" => {
    if (!props.organizationId || !tabVisible) return "skip";
    return {
      organizationId: props.organizationId,
      memberUserKey: props.memberUserKey,
      pipelineFileId: props.pipelineFileId,
    };
  }, [props.organizationId, props.memberUserKey, props.pipelineFileId, tabVisible]);

  useConvexSubQueryArgsTrace("OccupancyConflictCallout", presenceArgs, {
    queryKey: "presence.listActiveInOrganization",
    route: "file",
  });

  const rows = useQuery(api.presence.listActiveInOrganization, presenceArgs);

  const conflict = useMemo(() => {
    if (
      !rows?.length ||
      !props.selfEditing ||
      props.surfaceKey == null ||
      !props.memberUserKey?.trim()
    ) {
      return null;
    }
    const my = props.memberUserKey.trim();
    const others = filterLivePresenceRows(rows).filter(
      (r) =>
        r.userKey !== my &&
        r.status === "editing_file" &&
        !r.observationOnly &&
        r.surfaceKey === props.surfaceKey,
    );
    if (!others.length) return null;
    return others;
  }, [props.memberUserKey, props.selfEditing, props.surfaceKey, rows]);

  if (!conflict?.length) return null;

  return (
    <div
      role="status"
      className={cn(
        "flex items-start gap-2 rounded-lg border border-amber-400/60 bg-amber-50/90 px-3 py-2 text-xs text-amber-950 dark:border-amber-700/60 dark:bg-amber-950/40 dark:text-amber-100",
        props.className,
      )}
    >
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <div className="min-w-0">
        <div className="font-semibold">Concurrent edit risk</div>
        <p className="mt-0.5 text-[11px] opacity-90">
          {conflict.map((c) => c.userKey).join(", ")} may be editing the same
          section. Changes use version checks; refresh or coordinate before
          saving critical fields.
        </p>
      </div>
    </div>
  );
}
