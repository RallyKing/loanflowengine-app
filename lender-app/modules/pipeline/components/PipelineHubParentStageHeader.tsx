"use client";

import type { Doc, Id } from "@/convex/_generated/dataModel";
import { cn } from "@/lib/cn";

export type PipelineHubParentStageHeaderVariant = "default" | "nested";

function stageHeaderDomId(
  stageId: Id<"organizationPipelineStages">,
  entityPrefixId?: string,
): string {
  const base = `pipeline-hub-stage-${String(stageId)}`;
  return entityPrefixId ? `${base}-${entityPrefixId}` : base;
}

/** Phase 27.2 / 27.4 — horizontal parent-stage section divider (hub list + entity cards). */
export function PipelineHubParentStageHeader({
  stage,
  fileCount,
  id,
  className,
  variant = "default",
  entityPrefixId,
  isFirstInSection = false,
}: {
  stage: Doc<"organizationPipelineStages">;
  fileCount: number;
  id?: string;
  className?: string;
  variant?: PipelineHubParentStageHeaderVariant;
  /** Scopes DOM id when multiple entities share stage ids on one page (27.4). */
  entityPrefixId?: string;
  /** Nested entity card: omit top border on first stage group. */
  isFirstInSection?: boolean;
}) {
  const headerId = id ?? stageHeaderDomId(stage._id, entityPrefixId);
  const nested = variant === "nested";

  return (
    <div
      id={headerId}
      role="heading"
      aria-level={nested ? 3 : 2}
      data-testid={
        nested
          ? "pipeline-hub-entity-stage-header"
          : "pipeline-hub-parent-stage-header"
      }
      data-pipeline-hub-stage-id={String(stage._id)}
      data-pipeline-hub-entity-id={entityPrefixId}
      className={cn(
        "flex w-full min-w-0 items-center gap-2",
        nested
          ? cn(
              "rounded-md border border-border/50 bg-muted/25 px-2 py-1.5",
              isFirstInSection ? "border-t-0" : "border-t",
            )
          : cn(
              "sticky top-0 z-[1] border-t border-slate-200/80 bg-slate-50/70 px-3 py-2 backdrop-blur-sm dark:border-slate-700/60 dark:bg-slate-900/50",
              isFirstInSection && "border-t-0",
            ),
        className,
      )}
    >
      <span
        className={cn(
          "shrink-0 rounded-full",
          nested ? "h-1.5 w-1.5" : "h-2 w-2",
        )}
        style={{ backgroundColor: stage.color }}
        aria-hidden
      />
      <h2
        className={cn(
          "min-w-0 truncate text-xs font-semibold uppercase tracking-wider",
          nested
            ? "text-muted-foreground"
            : "text-slate-500 dark:text-slate-400",
        )}
      >
        {stage.name}
        <span
          className={cn(
            "font-medium normal-case tracking-normal",
            nested ? "text-muted-foreground/80" : "text-slate-400 dark:text-slate-500",
          )}
        >
          {" "}
          ({fileCount})
        </span>
      </h2>
    </div>
  );
}

/** Unassigned files bucket (edge-case rows without an active parent stage). */
export function PipelineHubUnassignedStageHeader({
  fileCount,
  className,
  variant = "default",
  entityPrefixId,
  isFirstInSection = false,
}: {
  fileCount: number;
  className?: string;
  variant?: PipelineHubParentStageHeaderVariant;
  entityPrefixId?: string;
  isFirstInSection?: boolean;
}) {
  const nested = variant === "nested";
  const headerId = entityPrefixId
    ? `pipeline-hub-stage-unassigned-${entityPrefixId}`
    : "pipeline-hub-stage-unassigned";

  return (
    <div
      id={headerId}
      role="heading"
      aria-level={nested ? 3 : 2}
      data-testid={
        nested
          ? "pipeline-hub-entity-stage-header-unassigned"
          : "pipeline-hub-parent-stage-header-unassigned"
      }
      data-pipeline-hub-entity-id={entityPrefixId}
      className={cn(
        "flex w-full min-w-0 items-center gap-2",
        nested
          ? cn(
              "rounded-md border border-border/50 bg-muted/25 px-2 py-1.5",
              isFirstInSection ? "border-t-0" : "border-t",
            )
          : cn(
              "sticky top-0 z-[1] border-t border-slate-200/80 bg-slate-50/70 px-3 py-2 backdrop-blur-sm dark:border-slate-700/60 dark:bg-slate-900/50",
              isFirstInSection && "border-t-0",
            ),
        className,
      )}
    >
      <h2
        className={cn(
          "text-xs font-semibold uppercase tracking-wider",
          nested
            ? "text-muted-foreground"
            : "text-slate-500 dark:text-slate-400",
        )}
      >
        Unassigned
        <span
          className={cn(
            "font-medium normal-case tracking-normal",
            nested ? "text-muted-foreground/80" : "text-slate-400 dark:text-slate-500",
          )}
        >
          {" "}
          ({fileCount})
        </span>
      </h2>
    </div>
  );
}
