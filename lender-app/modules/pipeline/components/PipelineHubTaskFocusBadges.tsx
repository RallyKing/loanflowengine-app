"use client";

import Link from "next/link";
import { graphLinksForRow } from "@/lib/pipeline/graphProjection";
import {
  PIPELINE_HUB_CLIENT_QUERY,
  PIPELINE_HUB_PROJECT_QUERY,
  PIPELINE_HUB_PROJECTION_QUERY,
} from "@/lib/pipeline/routes";
import type { TaskFocusNode } from "@/lib/pipeline/graphProjection";

const BADGE_CLASS =
  "inline-flex max-w-[8rem] truncate rounded-full bg-muted/60 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground transition-colors hover:bg-primary/15 hover:text-foreground no-underline";

export function PipelineHubTaskFocusBadges({ node }: { node: TaskFocusNode }) {
  const gl = graphLinksForRow(node.row);
  const clients = gl.clients.slice(0, 3);
  const projects = gl.projects.slice(0, 2);

  return (
    <div
      className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1"
      data-testid="pipeline-task-focus-badges"
    >
      <Link
        href={`/pipeline/file/${node.fileId}`}
        className={BADGE_CLASS}
        onClick={(e) => e.stopPropagation()}
        data-testid={`task-focus-file-${node.fileId}`}
      >
        {node.fileName}
      </Link>
      {clients.map((c) => (
        <Link
          key={c.id}
          href={`/pipeline?${PIPELINE_HUB_PROJECTION_QUERY}=client&${PIPELINE_HUB_CLIENT_QUERY}=${encodeURIComponent(c.id)}`}
          className={BADGE_CLASS}
          onClick={(e) => e.stopPropagation()}
        >
          {c.label}
        </Link>
      ))}
      {projects.map((p) => (
        <Link
          key={p.id}
          href={`/pipeline?${PIPELINE_HUB_PROJECTION_QUERY}=project&${PIPELINE_HUB_PROJECT_QUERY}=${encodeURIComponent(p.id)}`}
          className={BADGE_CLASS}
          onClick={(e) => e.stopPropagation()}
        >
          {p.label}
        </Link>
      ))}
    </div>
  );
}
