"use client";

import { Plus } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import {
  getPipelineBlock,
  type PipelineBlockId,
  type PipelineParentTabId,
} from "@/lib/pipelineBlockRegistry";
import {
  PIPELINE_DRAWER_SECTION_LABELS,
  unhideDrawerBlockInLayout,
  type PipelineDrawerLayoutV1,
} from "@/lib/pipelineDrawerLayoutStorage";

/**
 * Compact “show optional block” control for a parent tab (e.g. Financials).
 * Ensures older files can enable PFS / construction budget without recreating
 * the file — Layout settings still remains the full manager.
 */
export function PipelineOptionalBlocksAddBar({
  layout,
  onLayoutChange,
  parentTab,
  blockIds,
  className,
}: {
  layout: PipelineDrawerLayoutV1;
  onLayoutChange: (next: PipelineDrawerLayoutV1) => void;
  parentTab: PipelineParentTabId;
  /** Candidate block ids for this surface (filtered to hidden). */
  blockIds: readonly PipelineBlockId[];
  className?: string;
}) {
  const hidden = new Set(layout.hidden);
  const available = blockIds.filter((id) => {
    if (!hidden.has(id)) return false;
    const def = getPipelineBlock(id);
    return def.parentTab === parentTab && !def.isMandatory;
  });

  if (available.length === 0) return null;

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-2 rounded-dlc-md border border-dashed border-border/70 bg-dlc-surface-high/30 px-3 py-2",
        className,
      )}
      data-testid={`pipeline-optional-blocks-add-${parentTab}`}
      role="region"
      aria-label={`Add ${parentTab} sections`}
    >
      <span className="text-[11px] font-semibold uppercase tracking-dlc-wide text-muted-foreground">
        Add section
      </span>
      {available.map((blockId) => (
        <Button
          key={blockId}
          type="button"
          size="sm"
          variant="outline"
          className="h-8 gap-1 px-2 text-xs"
          data-testid={`pipeline-optional-add-${blockId}`}
          onClick={() =>
            onLayoutChange(unhideDrawerBlockInLayout(layout, blockId))
          }
        >
          <Plus className="h-3.5 w-3.5" aria-hidden />
          {PIPELINE_DRAWER_SECTION_LABELS[blockId]}
        </Button>
      ))}
    </div>
  );
}
