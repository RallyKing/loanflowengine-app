"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/cn";
import { OP_BORDER_SOFT, OP_TEXT_SECONDARY } from "@/lib/ui/operationalTokens";
import {
  OperationalOrientationStrip,
  type OrientationCrumb,
  type OrientationPill,
} from "@/components/ui/OperationalOrientationStrip";

type WorkspaceContextAnchorProps = {
  entityLabel: string;
  entityType: string;
  backHref?: string;
  backLabel?: string;
  crumbs?: OrientationCrumb[];
  pills?: OrientationPill[];
  accessHint?: string;
  trailing?: ReactNode;
  /** Dense pipeline header — single crumbs+utilities row, no back link or scoped hint. */
  layout?: "default" | "dense";
  className?: string;
  "data-testid"?: string;
};

/**
 * Sticky workspace identity — parent path, scope, quick return to hub/list.
 */
export function WorkspaceContextAnchor({
  entityLabel,
  entityType,
  backHref,
  backLabel = "Back",
  crumbs = [],
  pills = [],
  accessHint,
  trailing,
  layout = "default",
  className,
  "data-testid": testId = "workspace-context-anchor",
}: WorkspaceContextAnchorProps) {
  const dense = layout === "dense";

  return (
    <div className={cn("min-w-0", className)} data-testid={testId}>
      {!dense && backHref ? (
        <Link
          href={backHref}
          className={cn(
            "mb-1 inline-flex min-h-9 max-w-full items-center gap-1.5 rounded-md px-1 text-xs font-medium text-muted-foreground",
            "hover:bg-muted/50 hover:text-foreground max-md:min-h-11",
          )}
        >
          <ArrowLeft className="h-3.5 w-3.5 shrink-0" aria-hidden />
          <span className="max-md:break-words max-md:whitespace-normal md:truncate">
            {backLabel}
          </span>
        </Link>
      ) : null}
      <OperationalOrientationStrip
        scopeLabel={dense ? undefined : entityType}
        modeLabel={dense ? undefined : entityLabel}
        crumbs={crumbs}
        pills={pills}
        accessHint={accessHint}
        trailing={trailing}
        sticky={false}
        suppressScopeWhenMode={dense}
        compactLayout={dense}
        className={cn(dense ? "border-0 bg-transparent p-0 shadow-none" : "rounded-md border", !dense && OP_BORDER_SOFT)}
      />
      {!dense ? (
        <p className={cn("mt-1 hidden px-2 text-[11px] sm:px-3 lg:block", OP_TEXT_SECONDARY)}>
          Scoped to this {entityType.toLowerCase()}.
        </p>
      ) : null}
    </div>
  );
}
