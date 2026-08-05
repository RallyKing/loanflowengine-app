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
      className={cn(
        "flex w-full min-w-0 flex-1 flex-col gap-1 opacity-100",
        className,
      )}
      data-testid="pipeline-file-row-hierarchy"
    >
      <div className="flex w-full min-w-0 flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
        {fileTitleSlot ?? (
          <span
            className="block min-w-0 text-sm font-semibold leading-snug text-foreground max-md:w-full max-md:whitespace-normal max-md:break-words max-md:[overflow-wrap:anywhere] md:max-w-full md:truncate"
            title={staticPrimaryTitle}
            data-testid="pipeline-file-row-title"
          >
            {staticPrimaryTitle}
          </span>
        )}
        {fileTitleSlot && clientLabel ? (
          <>
            <span
              className="shrink-0 text-sm font-medium text-muted-foreground"
              aria-hidden
            >
              ·
            </span>
            <span
              className="min-w-0 text-sm font-semibold leading-snug text-foreground max-md:whitespace-normal max-md:break-words md:truncate"
              data-testid="pipeline-file-row-client"
            >
              {clientLabel}
            </span>
          </>
        ) : null}
      </div>
      <p
        className="w-full min-w-0 text-xs leading-snug text-muted-foreground opacity-100 max-md:whitespace-normal max-md:break-words max-md:[overflow-wrap:anywhere] md:truncate"
        title={projectLabel}
        data-testid="pipeline-file-row-project"
      >
        {projectLabel}
      </p>
      {primaryLender ? (
        <p
          className={cn(
            "flex min-w-0 items-center gap-1 text-[11px] font-medium uppercase leading-snug tracking-wide opacity-100",
            "max-md:flex-wrap md:truncate",
            primaryLender.source === "selected"
              ? "text-primary/85"
              : "text-slate-400 dark:text-slate-500",
          )}
          data-testid="pipeline-file-row-lender"
        >
          {primaryLender.source === "selected" ? (
            <Star
              className="h-2.5 w-2.5 shrink-0 fill-current"
              aria-hidden
            />
          ) : null}
          <span className="min-w-0 normal-case max-md:whitespace-normal max-md:break-words md:truncate">
            {primaryLender.company}
          </span>
        </p>
      ) : null}
    </div>
  );
}
