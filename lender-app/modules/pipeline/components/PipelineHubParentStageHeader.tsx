"use client";

import type { Doc, Id } from "@/convex/_generated/dataModel";
import { cn } from "@/lib/cn";
import {
  hubStageCountClass,
  hubStageHeaderClass,
  hubStageHeaderNestedClass,
  hubStageTitleClass,
} from "@/lib/ui/pipelineHubSurfaces";

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
              hubStageHeaderNestedClass,
              "px-2 py-1.5",
              isFirstInSection ? "border-t-0" : "border-t",
            )
          : cn(
              hubStageHeaderClass,
              "px-3 py-2",
              isFirstInSection && "border-t-0",
            ),
        className,
      )}
    >
      <span
        className={cn(
          "shrink-0 rounded-dlc-full shadow-dlc-1 ring-2 ring-background/80",
          nested ? "h-1.5 w-1.5" : "h-2 w-2",
        )}
        style={{ backgroundColor: stage.color }}
        aria-hidden
      />
      <h2 className={cn(hubStageTitleClass, nested && "text-muted-foreground")}>
        {stage.name}
        <span className={hubStageCountClass}>
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
              hubStageHeaderNestedClass,
              "px-2 py-1.5",
              isFirstInSection ? "border-t-0" : "border-t",
            )
          : cn(
              hubStageHeaderClass,
              "px-3 py-2",
              isFirstInSection && "border-t-0",
            ),
        className,
      )}
    >
      <h2 className={hubStageTitleClass}>
        Unassigned
        <span className={hubStageCountClass}>
          {" "}
          ({fileCount})
        </span>
      </h2>
    </div>
  );
}
