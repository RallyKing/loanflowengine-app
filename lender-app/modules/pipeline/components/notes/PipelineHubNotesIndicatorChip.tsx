"use client";

import { MessageSquare } from "lucide-react";
import { cn } from "@/lib/cn";
import { hubNotesChipClass } from "@/lib/ui/pipelineHubSurfaces";

export type PipelineHubNotesIndicatorChipProps = {
  noteCount: number;
  fileName: string;
  onOpenNotes: () => void;
  className?: string;
};

/**
 * Hub hierarchy / file row — surfaces relational note count (Phase 19.6).
 * Shown only when `noteCount > 0`; opens file workspace at `?block=fileNotes`.
 */
export function PipelineHubNotesIndicatorChip({
  noteCount,
  fileName,
  onOpenNotes,
  className,
}: PipelineHubNotesIndicatorChipProps) {
  if (noteCount <= 0) return null;

  return (
    <button
      type="button"
      className={cn(
        hubNotesChipClass,
        className,
      )}
      onClick={(e) => {
        e.stopPropagation();
        e.preventDefault();
        onOpenNotes();
      }}
      aria-label={`${noteCount} file note${noteCount === 1 ? "" : "s"} for ${fileName}. Open notes.`}
    >
      <MessageSquare className="h-3 w-3 shrink-0 opacity-80" aria-hidden />
      <span>{noteCount}</span>
    </button>
  );
}
