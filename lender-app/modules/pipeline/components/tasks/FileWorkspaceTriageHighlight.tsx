"use client";

import type { HubTriageHighlightView } from "@/lib/pipeline/hubTriageHighlight";
import { HubTriageHighlightBadge } from "@/components/pipeline/tasks/HubTriageHighlightChrome";
import {
  pipelineHeaderTriageSlotClass,
  pipelineHeaderTriageTaskTruncateClass,
} from "@/lib/pipeline/pipelineHeaderFlex";
import { cn } from "@/lib/cn";

/** Active labeled-task bubble for pipeline file workspace header (Phase 24.2A). */
export function FileWorkspaceTriageHighlight({
  highlight,
  className,
  layout = "stacked",
}: {
  highlight: HubTriageHighlightView | null | undefined;
  className?: string;
  /** `inline` — single row beside file title (desktop). `stacked` — below title (mobile). */
  layout?: "inline" | "stacked";
}) {
  if (!highlight) return null;

  if (layout === "inline") {
    return (
      <div
        className={cn(
          pipelineHeaderTriageSlotClass,
          "flex items-center gap-1.5",
          className,
        )}
        data-testid="file-workspace-triage-highlight"
        data-triage-layout="inline"
        title={`${highlight.label}: ${highlight.taskTitle}`}
      >
        <HubTriageHighlightBadge
          highlight={highlight}
          className="max-w-[8rem] shrink-0"
        />
        <span
          className={pipelineHeaderTriageTaskTruncateClass}
          data-testid="file-workspace-triage-task-title"
        >
          {highlight.taskTitle}
        </span>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "mt-1 min-w-0 max-w-full overflow-hidden rounded-dlc-sm border border-border/50 bg-muted/10 px-2 py-1.5",
        className,
      )}
      data-testid="file-workspace-triage-highlight"
      data-triage-layout="stacked"
      style={{
        borderLeftWidth: 3,
        borderLeftColor: highlight.hexCode,
        boxShadow: `inset 3px 0 10px -4px ${highlight.hexCode}40`,
      }}
    >
      <div className="flex min-w-0 max-w-full items-center gap-2 overflow-hidden">
        <HubTriageHighlightBadge
          highlight={highlight}
          className="max-w-full min-w-0 shrink-0"
        />
      </div>
      <p className="mt-1 min-w-0 max-w-full overflow-hidden text-xs text-muted-foreground">
        Source:{" "}
        <span
          className="block min-w-0 max-w-full font-medium text-foreground break-words [overflow-wrap:anywhere]"
          data-testid="file-workspace-triage-task-title"
          title={highlight.taskTitle}
        >
          {highlight.taskTitle}
        </span>
      </p>
    </div>
  );
}
