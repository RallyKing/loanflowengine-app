"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import {
  OP_WORKSPACE_DIVIDER,
  OP_WORKSPACE_ISLAND,
  OP_WORKSPACE_SECTION_SUBTITLE,
  OP_WORKSPACE_SECTION_TITLE,
} from "@/lib/ui/operationalInputs";

type WorkspaceInteriorSectionProps = {
  title?: string;
  subtitle?: string;
  children: ReactNode;
  className?: string;
  headerTrailing?: ReactNode;
  "data-testid"?: string;
};

/**
 * Phase 18.5 — open interior band with consistent section typography.
 */
export function WorkspaceInteriorSection({
  title,
  subtitle,
  children,
  className,
  headerTrailing,
  "data-testid": testId,
}: WorkspaceInteriorSectionProps) {
  return (
    <section
      data-testid={testId}
      className={cn(OP_WORKSPACE_ISLAND, className)}
    >
      {title || subtitle || headerTrailing ? (
        <header
          className={cn(
            "mb-3 flex flex-wrap items-start justify-between gap-2",
            title || subtitle ? "pb-3" : "",
            (title || subtitle) && OP_WORKSPACE_DIVIDER,
          )}
        >
          <div className="min-w-0">
            {title ? (
              <h3 className={OP_WORKSPACE_SECTION_TITLE}>{title}</h3>
            ) : null}
            {subtitle ? (
              <p className={cn("mt-1", OP_WORKSPACE_SECTION_SUBTITLE)}>
                {subtitle}
              </p>
            ) : null}
          </div>
          {headerTrailing ? (
            <div className="flex shrink-0 items-center gap-2">
              {headerTrailing}
            </div>
          ) : null}
        </header>
      ) : null}
      {children}
    </section>
  );
}
