"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import {
  OP_EMPTY_SURFACE,
  OP_SCAN_SECONDARY,
  OP_ENTITY_TITLE,
} from "@/lib/ui/operationalElegance";

type OperationalEmptyStateProps = {
  title: string;
  description?: string;
  action?: ReactNode;
  icon?: ReactNode;
  className?: string;
  "data-testid"?: string;
};

/**
 * Phase 18.4 — calm empty states with a single next-action emphasis.
 */
export function OperationalEmptyState({
  title,
  description,
  action,
  icon,
  className,
  "data-testid": testId,
}: OperationalEmptyStateProps) {
  return (
    <div
      data-testid={testId}
      className={cn(
        OP_EMPTY_SURFACE,
        "mx-auto flex max-w-md flex-col items-center text-center",
        className,
      )}
      role="status"
    >
      {icon ? (
        <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-muted/30 text-muted-foreground">
          {icon}
        </div>
      ) : null}
      <p className={OP_ENTITY_TITLE}>{title}</p>
      {description ? (
        <p className={cn("mt-2 max-w-sm", OP_SCAN_SECONDARY)}>{description}</p>
      ) : null}
      {action ? <div className="mt-4 flex flex-wrap justify-center gap-2">{action}</div> : null}
    </div>
  );
}
