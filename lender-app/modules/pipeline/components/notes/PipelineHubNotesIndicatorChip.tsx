"use client";

import { MessageSquare } from "lucide-react";
import { cn } from "@/lib/cn";

export type PipelineHubNotesIndicatorChipProps = {
  /** `undefined` = enrichment pending — do not treat as zero. */
  noteCount: number | undefined;
  fileName: string;
  onOpenNotes: () => void;
  className?: string;
};

/**
 * Hub hierarchy / file row — surfaces relational note count (Phase 19.6).
 * Shown only when count is known and `> 0`; opens file workspace at `?block=fileNotes`.
 * Unknown (enrichment pending) and zero both hide the chip — never claim "0 notes".
 */
export function PipelineHubNotesIndicatorChip({
  noteCount,
  fileName,
  onOpenNotes,
  className,
}: PipelineHubNotesIndicatorChipProps) {
  if (noteCount == null || noteCount <= 0) return null;

  return (
    <button
      type="button"
      className={cn(
        "relative z-[1] inline-flex shrink-0 items-center gap-0.5 rounded-full",
        "border border-border/60 bg-muted/40 px-1.5 py-0.5",
        "text-[10px] font-medium tabular-nums text-muted-foreground",
        "transition-colors hover:border-border hover:bg-muted/70 hover:text-foreground",
        className,
      )}
      onClick={(e) => {
        e.stopPropagation();
        e.preventDefault();
        onOpenNotes();
      }}
      aria-label={`${noteCount} file note${noteCount === 1 ? "" : "s"} for ${fileName}. Open notes.`}
    >
      <MessageSquare className="h-3 w-3 shrink-0 opacity-75" aria-hidden />
      <span>{noteCount}</span>
    </button>
  );
}
