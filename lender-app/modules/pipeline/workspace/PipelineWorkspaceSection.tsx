"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export type PipelineWorkspaceSectionProps = {
  /** Stable id for automation / hash links (optional `id` attribute). */
  htmlId?: string;
  /** Logical workspace section id (block id, region key, etc.). */
  sectionId: string;
  /** High-level grouping: chrome, quick-panel, modular-block, overlay, … */
  sectionType: string;
  /** Human-readable name for tools, debugging, and `aria-label`. */
  sectionLabel: string;
  header?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
  className?: string;
  contentClassName?: string;
};

/**
 * Standard DOM contract for the pipeline file workspace.
 * Every major region shares the same attributes and three child slots
 * (`header`, `actions`, `content`) for consistent tooling and layout.
 */
export function PipelineWorkspaceSection({
  htmlId,
  sectionId,
  sectionType,
  sectionLabel,
  header,
  actions,
  children,
  className,
  contentClassName,
}: PipelineWorkspaceSectionProps) {
  return (
    <section
      id={htmlId}
      data-section-id={sectionId}
      data-section-type={sectionType}
      data-section-label={sectionLabel}
      aria-label={sectionLabel}
      className={cn("min-w-0 isolate", className)}
    >
      <div
        data-workspace-section-part="header"
        className={cn("min-w-0", !header && "hidden")}
      >
        {header ?? null}
      </div>
      <div
        data-workspace-section-part="actions"
        className={cn("min-w-0", !actions && "hidden")}
      >
        {actions ?? null}
      </div>
      <div
        data-workspace-section-part="content"
        className={cn("min-w-0", contentClassName)}
      >
        {children}
      </div>
    </section>
  );
}
