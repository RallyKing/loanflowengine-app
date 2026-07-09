"use client";

import { useCallback, useState, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";
import { HubExpandChevron } from "@/components/pipeline/HubExpandChevron";
import {
  loadHubClientNotesExpanded,
  saveHubClientNotesExpanded,
} from "@/lib/pipeline/hubClientNotesExpansion";
import {
  loadHubProjectSubsectionExpanded,
  saveHubProjectSubsectionExpanded,
  type HubProjectSubsectionId,
} from "@/lib/pipeline/hubProjectSubsectionExpansion";
import {
  pipelineWorkspaceCollapseClosed,
  pipelineWorkspaceCollapseGrid,
  pipelineWorkspaceCollapseInner,
  pipelineWorkspaceCollapseOpen,
} from "@/lib/pipelineWorkspaceCard";

type HubCollapsibleSubsectionBase = {
  title: string;
  icon: LucideIcon;
  children: ReactNode;
  className?: string;
  "data-testid"?: string;
  expanded?: boolean;
  onExpandedChange?: (expanded: boolean) => void;
};

export type HubCollapsibleSubsectionProps = HubCollapsibleSubsectionBase &
  (
    | { projectId: string; sectionId: HubProjectSubsectionId; clientId?: never }
    | { clientId: string; projectId?: never; sectionId?: never }
  );

/**
 * Collapsible hub subsection (Project clients, Capital stack). Collapsed by default.
 */
export function HubCollapsibleSubsection({
  title,
  icon: Icon,
  projectId,
  sectionId,
  clientId,
  children,
  className,
  "data-testid": testId,
  expanded: expandedControlled,
  onExpandedChange,
}: HubCollapsibleSubsectionProps) {
  const loadInitial = clientId
    ? () => loadHubClientNotesExpanded(clientId)
    : () => loadHubProjectSubsectionExpanded(projectId!, sectionId!);

  const [expandedInternal, setExpandedInternal] = useState(loadInitial);
  const expanded = expandedControlled ?? expandedInternal;

  const persist = useCallback(
    (next: boolean) => {
      if (clientId) {
        saveHubClientNotesExpanded(clientId, next);
      } else {
        saveHubProjectSubsectionExpanded(projectId!, sectionId!, next);
      }
    },
    [clientId, projectId, sectionId],
  );

  const setExpanded = useCallback(
    (next: boolean) => {
      if (expandedControlled === undefined) {
        setExpandedInternal(next);
      }
      persist(next);
      onExpandedChange?.(next);
    },
    [expandedControlled, onExpandedChange, persist],
  );

  const toggle = useCallback(() => {
    setExpanded(!expanded);
  }, [expanded, setExpanded]);

  return (
    <section
      className={cn(
        "rounded-dlc-md border border-border/70 bg-dlc-surface/60",
        className,
      )}
      data-testid={testId}
      data-expanded={expanded ? "true" : "false"}
    >
      <div className="flex w-full items-center gap-2 px-2 py-2 sm:px-3">
        <HubExpandChevron
          expanded={expanded}
          onToggle={toggle}
          label={title}
        />
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-2 text-left text-sm font-semibold text-foreground"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            toggle();
          }}
          aria-expanded={expanded}
        >
          <Icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
          <span className="truncate">{title}</span>
        </button>
      </div>
      <div
        className={cn(
          pipelineWorkspaceCollapseGrid,
          "border-t border-border/50",
          expanded ? pipelineWorkspaceCollapseOpen : pipelineWorkspaceCollapseClosed,
        )}
        aria-hidden={!expanded}
      >
        <div
          className={cn(
            pipelineWorkspaceCollapseInner,
            !expanded && "opacity-0",
          )}
        >
          <div
            className={cn(
              "px-2 pb-2 pt-1 sm:px-3 sm:pb-3",
              !expanded && "pointer-events-none",
            )}
          >
            {children}
          </div>
        </div>
      </div>
    </section>
  );
}
