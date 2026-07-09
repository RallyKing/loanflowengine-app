"use client";

import Link from "next/link";
import { cn } from "@/lib/cn";
import { graphLinksForRow } from "@/lib/pipeline/graphProjection";
import {
  PIPELINE_HUB_CLIENT_QUERY,
  PIPELINE_HUB_PROJECT_QUERY,
  PIPELINE_HUB_PROJECTION_QUERY,
} from "@/lib/pipeline/routes";
import type { PipelineTablePreviewRow } from "@/lib/pipelineTablePreview";

const BADGE_CLASS =
  "inline-flex max-w-[8rem] truncate rounded-full bg-muted/60 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground transition-colors hover:bg-primary/15 hover:text-foreground";

function ClickableBadge({
  href,
  label,
  testId,
}: {
  href: string;
  label: string;
  testId: string;
}) {
  return (
    <Link
      href={href}
      className={cn(BADGE_CLASS, "no-underline")}
      title={`View ${label}`}
      data-testid={testId}
      onClick={(e) => e.stopPropagation()}
    >
      {label}
    </Link>
  );
}

export function PipelineHubFileFocusBadges({
  row,
  compact = false,
}: {
  row: PipelineTablePreviewRow;
  compact?: boolean;
}) {
  const gl = graphLinksForRow(row);
  const hasClients = gl.clients.length > 0;
  const hasProjects = gl.projects.length > 0;
  if (!hasClients && !hasProjects) return null;

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-x-2 gap-y-1",
        compact ? "mt-0.5" : "mt-1",
      )}
      data-testid="pipeline-file-focus-badges"
    >
      {hasClients ? (
        <span className="inline-flex flex-wrap items-center gap-1">
          <span className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground/70">
            Clients
          </span>
          {gl.clients.map((c) => (
            <ClickableBadge
              key={c.id}
              href={`/pipeline?${PIPELINE_HUB_PROJECTION_QUERY}=client&${PIPELINE_HUB_CLIENT_QUERY}=${encodeURIComponent(c.id)}`}
              label={c.label}
              testId={`file-focus-client-${c.id}`}
            />
          ))}
        </span>
      ) : null}
      {hasProjects ? (
        <span className="inline-flex flex-wrap items-center gap-1">
          <span className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground/70">
            Projects
          </span>
          {gl.projects.map((p) => (
            <ClickableBadge
              key={p.id}
              href={`/pipeline?${PIPELINE_HUB_PROJECTION_QUERY}=project&${PIPELINE_HUB_PROJECT_QUERY}=${encodeURIComponent(p.id)}`}
              label={p.label}
              testId={`file-focus-project-${p.id}`}
            />
          ))}
        </span>
      ) : null}
    </div>
  );
}
