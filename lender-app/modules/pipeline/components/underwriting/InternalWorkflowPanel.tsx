"use client";

import { useMemo } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { OperationalSkeletonList } from "@/components/ui/OperationalSkeleton";
import { cn } from "@/lib/cn";
import {
  internalWorkflowProgress,
  parseInternalWorkflowItems,
  type InternalWorkflowItem,
} from "@/lib/pipeline/internalWorkflow";
import { Check, ClipboardList } from "lucide-react";

export type InternalWorkflowPanelProps = {
  fileId: Id<"pipeline">;
  memberUserKey?: string;
};

function WorkflowStatusIcon({ done }: { done: boolean }) {
  if (done) {
    return (
      <span
        className="relative z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 border-emerald-500 bg-emerald-500 text-white shadow-dlc-1"
        aria-hidden
        data-testid="pipeline-underwriting-workflow-icon-done"
      >
        <Check className="h-3.5 w-3.5 stroke-[3]" />
      </span>
    );
  }

  return (
    <span
      className="relative z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 border-border/80 bg-background"
      aria-hidden
      data-testid="pipeline-underwriting-workflow-icon-pending"
    />
  );
}

function WorkflowTrackItem({
  item,
  index,
  isLast,
}: {
  item: InternalWorkflowItem;
  index: number;
  isLast: boolean;
}) {
  return (
    <li
      className="grid grid-cols-[1.5rem_minmax(0,1fr)] gap-x-3 pb-5 last:pb-0"
      data-testid={`pipeline-underwriting-workflow-item-${index}`}
      data-workflow-done={item.done ? "true" : "false"}
    >
      <div className="relative flex justify-center">
        <WorkflowStatusIcon done={item.done} />
        {!isLast ? (
          <span
            className="absolute top-6 bottom-0 left-1/2 w-px -translate-x-1/2 bg-border/70"
            aria-hidden
          />
        ) : null}
      </div>
      <div className="min-w-0 pt-0.5">
        <p
          className={cn(
            "text-sm font-medium leading-snug break-words",
            item.done ? "text-foreground" : "text-foreground/90",
          )}
        >
          {item.label}
        </p>
        {item.date ? (
          <p className="mt-0.5 text-xs text-muted-foreground tabular-nums">
            {item.date}
          </p>
        ) : null}
      </div>
    </li>
  );
}

export function InternalWorkflowPanel({
  fileId,
  memberUserKey,
}: InternalWorkflowPanelProps) {
  const detailArgs = useMemo(
    () => (memberUserKey ? { id: fileId, memberUserKey } : { id: fileId }),
    [fileId, memberUserKey],
  );

  const detail = useQuery(api.pipeline.getDetail, detailArgs);

  const workflowItems = useMemo(() => {
    if (!detail) return undefined;
    const dealData = detail.pipeline.dealData as
      | { workflow?: unknown }
      | undefined;
    return parseInternalWorkflowItems(dealData?.workflow);
  }, [detail]);

  const progress =
    workflowItems === undefined
      ? null
      : internalWorkflowProgress(workflowItems);

  return (
    <div className="dlc-surface-card min-w-0 rounded-dlc-md border border-border/80">
      <div className="flex items-start gap-2 border-b border-border/60 px-3 py-3 sm:px-5">
        <ClipboardList
          className="mt-0.5 h-4 w-4 shrink-0 text-dlc-accent"
          aria-hidden
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-semibold text-foreground">
              Internal workflow
            </h2>
            {progress ? (
              <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold tabular-nums text-muted-foreground">
                {progress.completed}/{progress.total} complete
              </span>
            ) : null}
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Broker-internal mileposts from{" "}
            <code className="rounded bg-muted px-1 text-[10px]">
              dealData.workflow
            </code>{" "}
            — read-only snapshot for underwriting visibility.
          </p>
        </div>
      </div>

      <div className="px-3 py-4 sm:px-5 sm:py-5">
        {workflowItems === undefined ? (
          <div data-testid="pipeline-underwriting-workflow-skeleton">
            <OperationalSkeletonList rows={4} />
          </div>
        ) : workflowItems.length === 0 ? (
          <div
            className="rounded-dlc-md border border-dashed border-border/60 bg-dlc-surface-high/40 px-4 py-8 text-center"
            data-testid="pipeline-underwriting-workflow-empty"
          >
            <p className="text-sm font-medium text-foreground">
              No internal workflow milestones configured
            </p>
            <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">
              Add checklist items in Deal Info / intake workflow to track
              broker-operational steps on this file.
            </p>
          </div>
        ) : (
          <ol
            className="space-y-0"
            data-testid="pipeline-underwriting-workflow-track"
            aria-label="Internal workflow milestones"
          >
            {workflowItems.map((item, index) => (
              <WorkflowTrackItem
                key={`${index}-${item.label}`}
                item={item}
                index={index}
                isLast={index === workflowItems.length - 1}
              />
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}
