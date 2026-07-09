"use client";

import { Star } from "lucide-react";
import type { ReactNode } from "react";
import type { PipelineTablePreviewRow } from "@/lib/pipelineTablePreview";
import { cn } from "@/lib/cn";
import {
  pipelineFileRowClientLabel,
  pipelineFileRowPrimaryTitle,
  pipelineFileRowProjectLabel,
} from "@/lib/pipeline/pipelineFileRowHierarchyLabels";

/**
 * Phase 26.3–26.5 — always-visible file / client / project / lender stack
 * (no hover-only reveal; used in table rows and hub file list rows).
 */
export function PipelineFileRowHierarchyStack({
  row,
  fileTitleSlot,
  className,
}: {
  row: PipelineTablePreviewRow;
  /** Optional slot for inline-editable file name (table); static title if omitted. */
  fileTitleSlot?: ReactNode;
  className?: string;
}) {
  const clientLabel = pipelineFileRowClientLabel(row);
  const projectLabel = pipelineFileRowProjectLabel(row);
  const primaryLender = row.primaryLender ?? null;
  const staticPrimaryTitle = pipelineFileRowPrimaryTitle(row);

  return (
    <div
      className={cn("flex min-w-0 flex-col gap-1", className)}
      data-testid="pipeline-file-row-hierarchy"
    >
      <div className="flex min-w-0 flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
        {fileTitleSlot ?? (
          <span className="min-w-0 truncate text-sm font-medium leading-snug text-slate-900 dark:text-slate-100">
            {staticPrimaryTitle}
          </span>
        )}
        {fileTitleSlot && clientLabel ? (
          <>
            <span
              className="shrink-0 text-sm font-medium text-slate-400"
              aria-hidden
            >
              ·
            </span>
            <span className="min-w-0 truncate text-sm font-medium leading-snug text-slate-900 dark:text-slate-100">
              {clientLabel}
            </span>
          </>
        ) : null}
      </div>
      <p className="truncate text-xs leading-snug text-slate-500 dark:text-slate-400">
        {projectLabel}
      </p>
      {primaryLender ? (
        <p
          className={cn(
            "flex min-w-0 items-center gap-1 truncate text-[11px] font-medium uppercase leading-snug tracking-wide",
            primaryLender.source === "selected"
              ? "text-primary/85"
              : "text-slate-400 dark:text-slate-500",
          )}
        >
          {primaryLender.source === "selected" ? (
            <Star
              className="h-2.5 w-2.5 shrink-0 fill-current"
              aria-hidden
            />
          ) : null}
          <span className="truncate normal-case">{primaryLender.company}</span>
        </p>
      ) : null}
    </div>
  );
}
