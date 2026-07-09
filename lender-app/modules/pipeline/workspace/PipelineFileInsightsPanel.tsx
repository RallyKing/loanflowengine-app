"use client";

import { useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  ChevronDown,
  Info,
  Lightbulb,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import { formatUSD } from "@/lib/intake/finance";
import type { PipelineBlockId } from "@/lib/pipelineBlockRegistry";
import type { PipelineFileInsightsSnapshot } from "@/lib/pipelineFileInsights";
import {
  pipelineWorkspaceCardBodyPadding,
  pipelineWorkspaceCardFrame,
  pipelineWorkspaceCardHeaderPadding,
  pipelineWorkspaceChevronTransition,
  pipelineWorkspaceCollapseGrid,
  pipelineWorkspaceCollapseClosed,
  pipelineWorkspaceCollapseInner,
  pipelineWorkspaceCollapseOpen,
  pipelineWorkspaceNestedChipClass,
} from "@/lib/pipelineWorkspaceCard";

type Props = {
  snapshot: PipelineFileInsightsSnapshot;
  onGoToSection: (section: PipelineBlockId) => void;
  className?: string;
  /** When true, renders body only (parent owns collapse chrome). */
  embedded?: boolean;
};

const QUICK: { label: string; section: PipelineBlockId }[] = [
  { label: "Deal workspace", section: "dealWorkspace" },
  { label: "Contacts", section: "contacts" },
  { label: "Lenders", section: "lenders" },
  { label: "Scenario match", section: "scenarioMatch" },
];

function HealthBadge({ tier }: { tier: PipelineFileInsightsSnapshot["healthTier"] }) {
  const cfg =
    tier === "strong"
      ? {
          label: "On track",
          className:
            "border-emerald-300/80 bg-emerald-50/90 text-emerald-900 dark:border-emerald-800/60 dark:bg-emerald-950/40 dark:text-emerald-100",
        }
      : tier === "needs_attention"
        ? {
            label: "Review",
            className:
              "border-amber-300/80 bg-amber-50/90 text-amber-950 dark:border-amber-800/60 dark:bg-amber-950/35 dark:text-amber-100",
          }
        : {
            label: "Needs focus",
            className:
              "border-rose-300/80 bg-rose-50/90 text-rose-950 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-100",
          };
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide",
        cfg.className,
      )}
    >
      {cfg.label}
    </span>
  );
}

function ItemIcon({
  category,
  severity,
}: {
  category: "alert" | "recommendation";
  severity: "warning" | "info" | "tip";
}) {
  if (category === "recommendation") {
    return (
      <Lightbulb
        className="mt-0.5 h-3.5 w-3.5 shrink-0 text-violet-600 dark:text-violet-400"
        aria-hidden
      />
    );
  }
  if (severity === "warning") {
    return (
      <AlertTriangle
        className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-700 dark:text-amber-400"
        aria-hidden
      />
    );
  }
  return (
    <Info
      className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground"
      aria-hidden
    />
  );
}

export function PipelineFileInsightsPanel({
  snapshot,
  onGoToSection,
  className,
  embedded = false,
}: Props) {
  const [expanded, setExpanded] = useState(false);
  const [showAllItems, setShowAllItems] = useState(false);

  const visibleItems = useMemo(
    () =>
      showAllItems ? snapshot.items : snapshot.items.slice(0, 6),
    [snapshot.items, showAllItems],
  );

  const hiddenCount = showAllItems
    ? 0
    : Math.max(0, snapshot.items.length - visibleItems.length);

  const body = (
    <div className={cn("space-y-3", embedded ? undefined : pipelineWorkspaceCardBodyPadding)}>
      {embedded ? (
        <div className="flex flex-wrap items-center gap-2">
          <HealthBadge tier={snapshot.healthTier} />
          <p className="text-xs leading-relaxed text-muted-foreground">
            {snapshot.healthSummary}
          </p>
        </div>
      ) : null}
      <div className="grid min-w-0 grid-cols-2 gap-2 sm:grid-cols-4">
              {snapshot.metrics.map((m) => (
                <div
                  key={m.id}
                  className={cn(
                    pipelineWorkspaceNestedChipClass,
                    "bg-background/80 px-2.5 py-2",
                  )}
                >
                  <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                    {m.label}
                  </div>
                  <div className="truncate text-xs font-semibold text-foreground">
                    {m.text ??
                      (typeof m.amount === "number"
                        ? m.amount > 0
                          ? formatUSD(m.amount, 0)
                          : "—"
                        : "—")}
                  </div>
                </div>
              ))}
            </div>

            <div>
              <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                <Sparkles className="h-3.5 w-3.5" aria-hidden />
                Prioritized notes
              </div>
              {snapshot.items.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  No alerts or suggestions right now.
                </p>
              ) : (
                <>
                  <ul className="space-y-1.5">
                    {visibleItems.map((row) => (
                      <li
                        key={row.id}
                        className={cn(
                          pipelineWorkspaceNestedChipClass,
                          "flex gap-2 px-2.5 py-2",
                        )}
                      >
                        <ItemIcon
                          category={row.category}
                          severity={row.severity}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-medium text-foreground">
                            {row.title}
                          </div>
                          {row.detail ? (
                            <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
                              {row.detail}
                            </p>
                          ) : null}
                          {row.targetSection ? (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="mt-1 h-7 px-2 text-[11px] text-primary"
                              onClick={() => onGoToSection(row.targetSection!)}
                            >
                              Go to section
                            </Button>
                          ) : null}
                        </div>
                      </li>
                    ))}
                  </ul>
                  {hiddenCount > 0 ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="mt-2 h-7 text-[11px] text-muted-foreground"
                      onClick={() => setShowAllItems((v) => !v)}
                    >
                      {showAllItems
                        ? "Show fewer"
                        : `Show ${hiddenCount} more`}
                    </Button>
                  ) : null}
                </>
              )}
            </div>

            <div>
              <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Quick actions
              </div>
              <div className="flex flex-wrap gap-1.5">
                {QUICK.map((q) => (
                  <Button
                    key={q.section}
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 text-[11px]"
                    onClick={() => onGoToSection(q.section)}
                  >
                    {q.label}
                  </Button>
                ))}
              </div>
            </div>
    </div>
  );

  if (embedded) {
    return <div className={cn("min-w-0", className)}>{body}</div>;
  }

  return (
    <section
      id="pipeline-ws-file-overview"
      className={cn(
        pipelineWorkspaceCardFrame(),
        "w-full min-w-0 border border-border/60 bg-background",
        "max-sm:rounded-lg max-sm:shadow-none",
        className,
      )}
      aria-label="File overview"
    >
      <button
        type="button"
        className={cn(
          "flex w-full items-start gap-3 text-left transition-colors duration-200 ease-out hover:bg-muted/25",
          pipelineWorkspaceCardHeaderPadding,
        )}
        aria-expanded={expanded}
        onClick={() => setExpanded((e) => !e)}
      >
        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border/60 bg-muted/10">
          <Activity className="h-4 w-4 text-muted-foreground" aria-hidden />
        </div>
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-foreground">
              File overview
            </span>
            <HealthBadge tier={snapshot.healthTier} />
          </div>
          <p className="text-xs leading-relaxed text-muted-foreground">
            {snapshot.healthSummary}
          </p>
        </div>
        <ChevronDown
          className={cn(
            "mt-1 h-4 w-4 shrink-0 text-muted-foreground",
            pipelineWorkspaceChevronTransition,
            expanded && "rotate-180",
          )}
          aria-hidden
        />
      </button>

      <div
        className={cn(
          pipelineWorkspaceCollapseGrid,
          expanded ? pipelineWorkspaceCollapseOpen : pipelineWorkspaceCollapseClosed,
        )}
        aria-hidden={!expanded}
      >
        <div className={pipelineWorkspaceCollapseInner}>
          <div
            className={cn(
              "border-t border-border/60",
              !expanded && "pointer-events-none",
            )}
          >
            {body}
          </div>
        </div>
      </div>
    </section>
  );
}
