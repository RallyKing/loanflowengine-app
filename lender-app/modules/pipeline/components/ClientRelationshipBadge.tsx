"use client";

import { cn } from "@/lib/cn";
import {
  CLIENT_RELATIONSHIP_LABELS,
  type LinkedClientLike,
} from "@/lib/pipeline/clientRelationshipUi";
import type { ClientRelationshipType } from "@/lib/pipelineClientRelationships";

export function ClientRelationshipBadge({
  type,
  compact = false,
  className,
}: {
  type: ClientRelationshipType;
  compact?: boolean;
  className?: string;
}) {
  const label = CLIENT_RELATIONSHIP_LABELS[type];
  const isPrimary = type === "primary";
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full font-medium",
        compact ? "px-1.5 py-0 text-[10px]" : "px-2 py-0.5 text-[11px]",
        isPrimary
          ? "bg-primary/15 text-primary"
          : "bg-muted text-muted-foreground",
        className,
      )}
    >
      {label}
    </span>
  );
}

export function LinkedClientChipRow({
  linkedClients,
  expanded = false,
  className,
}: {
  linkedClients: LinkedClientLike[];
  expanded?: boolean;
  className?: string;
}) {
  if (linkedClients.length === 0) return null;
  const primary =
    linkedClients.find(
      (l) => l.relationshipType === "primary" || l.isAuthoritativePrimary,
    ) ?? linkedClients[0]!;
  const secondary = linkedClients.filter((l) => l.clientId !== primary.clientId);

  if (!expanded) {
    return (
      <span className={cn("text-xs text-muted-foreground", className)}>
        {primary.displayName}
        {secondary.length > 0 ? (
          <span className="ml-1 font-medium text-foreground/70">
            +{secondary.length}
          </span>
        ) : null}
      </span>
    );
  }

  return (
    <ul
      className={cn("flex flex-wrap gap-1.5", className)}
      data-testid="linked-clients-expanded"
    >
      {linkedClients.map((l) => (
        <li
          key={l.clientId}
          className="inline-flex max-w-full items-center gap-1 rounded-dlc-md border border-border/60 bg-dlc-surface px-2 py-1 text-xs"
        >
          <span className="font-medium text-foreground max-md:break-words max-md:whitespace-normal md:truncate">
            {l.displayName}
          </span>
          <ClientRelationshipBadge type={l.relationshipType} compact />
        </li>
      ))}
    </ul>
  );
}
