"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  CalendarDays,
  Calculator,
  ChevronDown,
  ChevronUp,
  Eye,
  EyeOff,
  GitCompareArrows,
  Layers,
  RotateCcw,
  Settings2,
  TrendingUp,
} from "lucide-react";
import { CollapsibleSection } from "@/components/CollapsibleSection";
import { Button as UiButton } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import { isLegacyBusinessDebtAnalysisHidden } from "@/lib/pipeline/fileWorkspaceLegacyVisibility";
import {
  type DealAnalysisLayoutV1,
  type DealAnalysisSectionId,
  DEAL_ANALYSIS_SECTION_LABELS,
  defaultDealAnalysisLayout,
  loadDealAnalysisLayout,
  moveDealAnalysisSection,
  parseDealAnalysisLayoutFromUnknown,
} from "@/lib/file/dealAnalysisLayoutStorage";
import type { DealSectionProps } from "@/lib/file/dealSectionTypes";
import {
  ComparisonSection,
  DayCounterSection,
  DtiSection,
  PayoffSection,
  WeightedInterestSection,
} from "./IntakeSections2";
import { dealAnalysisToolFieldCount } from "@/lib/file/fileSectionMetrics";
import { SectionFieldCountBadge } from "@/components/SectionFieldCountBadge";

const SECTION_ICONS: Record<
  DealAnalysisSectionId,
  React.ComponentType<{ className?: string }>
> = {
  dti: Calculator,
  comparison: GitCompareArrows,
  weighted: Layers,
  payoff: TrendingUp,
  daycounter: CalendarDays,
};

function AnalysisLayoutSettings({
  layout,
  onChange,
}: {
  layout: DealAnalysisLayoutV1;
  onChange: React.Dispatch<React.SetStateAction<DealAnalysisLayoutV1>>;
}) {
  const [open, setOpen] = useState(false);

  const toggleHidden = useCallback(
    (id: DealAnalysisSectionId) => {
      onChange((prev) => {
        const isHidden = prev.hidden.includes(id);
        return {
          ...prev,
          hidden: isHidden
            ? prev.hidden.filter((x) => x !== id)
            : [...prev.hidden, id],
        };
      });
    },
    [onChange]
  );

  const move = useCallback(
    (id: DealAnalysisSectionId, dir: -1 | 1) => {
      onChange((prev) => ({
        ...prev,
        order: moveDealAnalysisSection(prev.order, id, dir),
      }));
    },
    [onChange]
  );

  const reset = useCallback(() => {
    onChange(defaultDealAnalysisLayout());
  }, [onChange]);

  return (
    <div className="rounded-xl border border-border/80 bg-muted/20 shadow-sm">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left text-sm font-medium text-foreground transition hover:bg-muted/40 sm:px-4"
        aria-expanded={open}
      >
        <span className="inline-flex items-center gap-2">
          <Settings2 className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
          Layout & visibility
        </span>
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 text-muted-foreground transition motion-reduce:transition-none",
            open && "rotate-180"
          )}
          aria-hidden
        />
      </button>
      {open ? (
        <div className="border-t border-border/70 px-3 pb-3 pt-1 sm:px-4">
          <p className="mb-3 text-xs leading-relaxed text-muted-foreground">
            Reorder tools, hide ones you rarely use, and collapse sections to stay
            focused. Saved on this device only.
          </p>
          <ul className="max-h-[min(40vh,18rem)] space-y-1 overflow-y-auto pr-1">
            {layout.order.map((id) => {
              const hidden = layout.hidden.includes(id);
              return (
                <li
                  key={id}
                  className={cn(
                    "flex flex-wrap items-center gap-2 rounded-lg border border-border/60 bg-background px-2 py-1.5 sm:flex-nowrap",
                    hidden && "opacity-60"
                  )}
                >
                  <span className="min-w-0 flex-1 text-xs font-medium text-foreground">
                    {DEAL_ANALYSIS_SECTION_LABELS[id]}
                  </span>
                  <div className="flex shrink-0 items-center gap-0.5">
                    <UiButton
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-8 w-8 px-0"
                      title="Move up"
                      aria-label={`Move ${DEAL_ANALYSIS_SECTION_LABELS[id]} up`}
                      onClick={() => move(id, -1)}
                    >
                      <ChevronUp className="h-4 w-4" />
                    </UiButton>
                    <UiButton
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-8 w-8 px-0"
                      title="Move down"
                      aria-label={`Move ${DEAL_ANALYSIS_SECTION_LABELS[id]} down`}
                      onClick={() => move(id, 1)}
                    >
                      <ChevronDown className="h-4 w-4" />
                    </UiButton>
                    <UiButton
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-8 w-8 px-0"
                      title={hidden ? "Show tool" : "Hide tool"}
                      aria-label={
                        hidden
                          ? `Show ${DEAL_ANALYSIS_SECTION_LABELS[id]}`
                          : `Hide ${DEAL_ANALYSIS_SECTION_LABELS[id]}`
                      }
                      onClick={() => toggleHidden(id)}
                    >
                      {hidden ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </UiButton>
                  </div>
                </li>
              );
            })}
          </ul>
          <div className="mt-3 flex flex-wrap justify-end gap-2 border-t border-border/60 pt-3">
            <UiButton type="button" size="sm" variant="outline" onClick={reset}>
              <RotateCcw className="h-3.5 w-3.5" />
              Reset layout
            </UiButton>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function sectionDescription(id: DealAnalysisSectionId): string {
  switch (id) {
    case "dti":
      return "Front / back ratios from income, housing, and consumer debts.";
    case "comparison":
      return "Current vs proposed loan side-by-side.";
    case "weighted":
      return "Blended rate across balances and APRs.";
    case "payoff":
      return "Amortization with optional extra payments.";
    case "daycounter":
      return "Business-day and calendar math between key dates.";
  }
}

export type DealAnalysisWorkspaceProps = DealSectionProps & {
  /** Resets one-time localStorage migration when switching files. */
  dealFileKey?: string;
};

export function DealAnalysisWorkspace(props: DealAnalysisWorkspaceProps) {
  const { draft, update, dealFileKey } = props;
  const layout = parseDealAnalysisLayoutFromUnknown(
    draft.dealAnalysisLayout
  );
  const didMigrate = useRef(false);
  const lastFileKey = useRef(dealFileKey ?? "");

  useEffect(() => {
    const k = dealFileKey ?? "";
    if (k !== lastFileKey.current) {
      lastFileKey.current = k;
      didMigrate.current = false;
    }
  }, [dealFileKey]);

  useEffect(() => {
    const raw = draft.dealAnalysisLayout;
    if (
      raw &&
      typeof raw === "object" &&
      !Array.isArray(raw) &&
      (raw as { v?: unknown }).v === 1
    ) {
      didMigrate.current = true;
      return;
    }
    if (didMigrate.current) return;
    didMigrate.current = true;
    update("dealAnalysisLayout", loadDealAnalysisLayout() as never);
  }, [draft.dealAnalysisLayout, update]);

  const setLayout = useCallback(
    (action: React.SetStateAction<DealAnalysisLayoutV1>) => {
      const cur = parseDealAnalysisLayoutFromUnknown(
        draft.dealAnalysisLayout
      );
      const resolved = typeof action === "function" ? action(cur) : action;
      update("dealAnalysisLayout", resolved as never);
    },
    [draft.dealAnalysisLayout, update]
  );

  const sectionExpanded = (sid: DealAnalysisSectionId) =>
    layout.expanded[sid] === true;

  const setSectionExpanded = (sid: DealAnalysisSectionId, next: boolean) => {
    setLayout((prev) => ({
      ...prev,
      expanded: { ...prev.expanded, [sid]: next },
    }));
  };

  const toolProps: DealSectionProps = {
    ...props,
    analysisWorkspaceNested: true,
  };

  const renderBody = (id: DealAnalysisSectionId) => {
    switch (id) {
      case "dti":
        return <DtiSection {...toolProps} />;
      case "comparison":
        return <ComparisonSection {...toolProps} />;
      case "weighted":
        return isLegacyBusinessDebtAnalysisHidden() ? null : (
          <WeightedInterestSection {...toolProps} />
        );
      case "payoff":
        return <PayoffSection {...toolProps} />;
      case "daycounter":
        return <DayCounterSection {...toolProps} />;
      default:
        return null;
    }
  };

  const visible = layout.order.filter((id) => {
    if (layout.hidden.includes(id)) return false;
    if (id === "weighted" && isLegacyBusinessDebtAnalysisHidden()) return false;
    return true;
  });

  return (
    <div className="flex min-w-0 flex-col gap-5">
      <div className="rounded-2xl border border-border/80 bg-gradient-to-b from-muted/30 to-background px-4 py-4 sm:px-5">
        <h2 className="text-base font-semibold tracking-tight text-foreground">
          Analysis workspace
        </h2>
        <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          Run DTI, comparisons, weighted rate, payoff, and date math in one place.
          Expand only the tools you need; use layout settings to reorder or hide
          sections.
        </p>
      </div>

      <AnalysisLayoutSettings layout={layout} onChange={setLayout} />

      {visible.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border px-4 py-12 text-center text-sm text-muted-foreground">
          All analysis tools are hidden. Open{" "}
          <span className="font-medium text-foreground">Layout & visibility</span>{" "}
          and show the ones you want.
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {visible.map((id) => {
            const Icon = SECTION_ICONS[id];
            return (
              <div
                key={id}
                id={`deal-analysis-${id}`}
                className="scroll-mt-24"
              >
                <CollapsibleSection
                  variant="card"
                  animated
                  open={sectionExpanded(id)}
                  onOpenChange={(o) => setSectionExpanded(id, o)}
                  headerRight={
                    <SectionFieldCountBadge
                      count={dealAnalysisToolFieldCount(id, props.draft)}
                    />
                  }
                  title={
                    <span className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
                      {DEAL_ANALYSIS_SECTION_LABELS[id]}
                    </span>
                  }
                  description={sectionDescription(id)}
                  contentClassName="space-y-4"
                >
                  {renderBody(id)}
                </CollapsibleSection>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
