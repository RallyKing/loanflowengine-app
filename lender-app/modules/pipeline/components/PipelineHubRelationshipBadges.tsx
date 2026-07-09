"use client";

import { cn } from "@/lib/cn";
import { graphLinksForRow } from "@/lib/pipeline/graphProjection";
import type { PipelineTablePreviewRow } from "@/lib/pipelineTablePreview";

const BADGE_CLASS =
  "inline-flex max-w-[8rem] truncate rounded-full bg-muted/60 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground";

function BadgeGroup({
  label,
  items,
}: {
  label: string;
  items: Array<{ id: string; label: string }>;
}) {
  if (items.length === 0) return null;
  const shown = items.slice(0, 2);
  const extra = items.length - shown.length;
  return (
    <span
      className="inline-flex flex-wrap items-center gap-1"
      data-testid={`graph-badge-${label.toLowerCase()}`}
    >
      <span className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground/70">
        {label}
      </span>
      {shown.map((it) => (
        <span key={it.id} className={BADGE_CLASS} title={it.label}>
          {it.label}
        </span>
      ))}
      {extra > 0 ? (
        <span className={cn(BADGE_CLASS, "max-w-none")}>+{extra}</span>
      ) : null}
    </span>
  );
}

export function PipelineHubRelationshipBadges({
  row,
  compact = false,
}: {
  row: PipelineTablePreviewRow;
  compact?: boolean;
}) {
  const gl = graphLinksForRow(row);
  const hasAny =
    gl.clients.length > 0 ||
    gl.projects.length > 0 ||
    gl.lenders.length > 0 ||
    gl.referrals.length > 0 ||
    gl.team.length > 0 ||
    gl.tasks.length > 0;
  if (!hasAny) return null;

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-x-2 gap-y-1",
        compact ? "mt-0.5" : "mt-1",
      )}
      data-testid="pipeline-graph-relationship-badges"
    >
      <BadgeGroup label="Clients" items={gl.clients} />
      <BadgeGroup label="Projects" items={gl.projects} />
      <BadgeGroup label="Lenders" items={gl.lenders} />
      <BadgeGroup label="Referrals" items={gl.referrals} />
      <BadgeGroup label="Team" items={gl.team} />
      <BadgeGroup label="Tasks" items={gl.tasks} />
    </div>
  );
}
