"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/cn";
import { pipelineHierarchyCrumbClass } from "@/lib/pipeline/mobileInformationHierarchy";
import {
  pipelineHubClientHref,
  pipelineHubProjectHref,
} from "@/lib/pipeline/routes";
import type { Id } from "@/convex/_generated/dataModel";

export type PipelineHierarchyCrumb = {
  label: string;
  href?: string;
  onClick?: () => void;
};

export function PipelineHierarchyBreadcrumb({
  crumbs,
  className,
  size = "default",
}: {
  crumbs: PipelineHierarchyCrumb[];
  className?: string;
  size?: "default" | "compact";
}) {
  if (crumbs.length === 0) return null;
  return (
    <nav
      aria-label="Client, project, and loan file"
      data-testid="pipeline-workspace-hierarchy-breadcrumb"
      className={cn(
        "flex min-w-0 w-full flex-wrap items-center gap-1 text-muted-foreground max-md:[overflow-wrap:anywhere]",
        size === "compact" ? "text-xs" : "text-sm",
        className,
      )}
    >
      {crumbs.map((crumb, i) => {
        const isLast = i === crumbs.length - 1;
        const inner = crumb.href ? (
          <Link
            href={crumb.href}
            className={cn(
              pipelineHierarchyCrumbClass(isLast),
              "underline-offset-2 hover:text-foreground hover:underline",
            )}
          >
            {crumb.label}
          </Link>
        ) : crumb.onClick ? (
          <button
            type="button"
            onClick={crumb.onClick}
            className={cn(
              pipelineHierarchyCrumbClass(false),
              "hover:text-foreground hover:underline",
            )}
          >
            {crumb.label}
          </button>
        ) : (
          <span
            className={pipelineHierarchyCrumbClass(isLast)}
          >
            {crumb.label}
          </span>
        );
        return (
          <span
            key={`${crumb.label}-${i}`}
            className="inline-flex min-w-0 max-w-full items-center gap-1 max-md:w-full"
          >
            {i > 0 ? (
              <ChevronRight className="h-3.5 w-3.5 shrink-0 opacity-50" aria-hidden />
            ) : null}
            {inner}
          </span>
        );
      })}
    </nav>
  );
}

export {
  pipelineHubClientHref,
  pipelineHubProjectHref,
} from "@/lib/pipeline/routes";

export function pipelineFileCrumb(
  fileId: Id<"pipeline">,
  fileName: string,
): PipelineHierarchyCrumb {
  return { label: fileName.trim() || "Loan file" };
}
