"use client";

import { useEffect, useId, useRef } from "react";
import { X, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { SearchField } from "@/components/ui/SearchField";
import { cn } from "@/lib/cn";
import { shellPanelZIndex, shellZIndexStyle } from "@/lib/ui/layerTokens";
import {
  PIPELINE_STATUSES,
  getPipelineStatusBadgeStyle,
  getPipelineStatusDotStyle,
  type PipelineStageStyleMap,
} from "@/lib/pipelineStatus";
import type { PipelineHubSortKey } from "@/lib/pipeline/pipelineHubPersistence";
import {
  CLIENT_MOMENTUM_FILTER_OPTIONS,
  type ClientMomentumFilterToken,
} from "@/lib/clientMomentum";

type SortKey = PipelineHubSortKey;

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "updatedDesc", label: "Recently updated" },
  { value: "createdDesc", label: "Recently created" },
  { value: "loanDesc", label: "Funding (high → low)" },
  { value: "loanAsc", label: "Funding (low → high)" },
  { value: "stageAsc", label: "Stage (funnel)" },
  { value: "stageDesc", label: "Stage (funnel · reverse)" },
  { value: "momentumDesc", label: "Client confidence (high → low)" },
  { value: "momentumAsc", label: "Client confidence (low → high)" },
];

export function PipelineHubMobileFilterSheetTrigger({
  open,
  onOpen,
  activeCount,
}: {
  open: boolean;
  onOpen: () => void;
  activeCount: number;
}) {
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className={cn(
        "h-8 gap-1.5 px-2.5 text-xs md:hidden",
        open && "border-primary/50 bg-primary/10",
      )}
      aria-expanded={open}
      aria-controls="pipeline-hub-mobile-filters"
      onClick={onOpen}
    >
      <SlidersHorizontal className="h-3.5 w-3.5 shrink-0" aria-hidden />
      Filters
      {activeCount > 0 ? (
        <span className="inline-flex min-w-[1.125rem] justify-center rounded-dlc-full bg-primary/15 px-1 text-[10px] font-semibold tabular-nums text-primary">
          {activeCount}
        </span>
      ) : null}
    </Button>
  );
}

export function PipelineHubMobileFilterSheet({
  open,
  onClose,
  search,
  setSearch,
  statusFilter,
  toggleStatus,
  showArchived,
  setShowArchived,
  showSnoozed,
  setShowSnoozed,
  sort,
  setSort,
  momentumFilter,
  toggleMomentum,
  clearFilters,
  globalUiIndicator,
  pipelineStageStyles,
}: {
  open: boolean;
  onClose: () => void;
  search: string;
  setSearch: (v: string) => void;
  statusFilter: Set<string>;
  toggleStatus: (value: string) => void;
  showArchived: boolean;
  setShowArchived: (v: boolean | ((p: boolean) => boolean)) => void;
  showSnoozed: boolean;
  setShowSnoozed: (v: boolean | ((p: boolean) => boolean)) => void;
  sort: SortKey;
  setSort: (v: SortKey) => void;
  momentumFilter: Set<ClientMomentumFilterToken>;
  toggleMomentum: (value: ClientMomentumFilterToken) => void;
  clearFilters: () => void;
  globalUiIndicator?: string | null;
  pipelineStageStyles: PipelineStageStyleMap;
}) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      onClose();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 flex md:hidden"
      style={shellZIndexStyle("sheet")}
      role="presentation"
      aria-hidden={false}
    >
      <button
        type="button"
        className="absolute inset-0 bg-dlc-scrim/80 backdrop-blur-[2px]"
        aria-label="Close filters"
        onClick={onClose}
      />
      <div
        ref={panelRef}
        id="pipeline-hub-mobile-filters"
        role="dialog"
        aria-modal
        aria-labelledby={titleId}
        className={cn(
          "relative mt-auto flex max-h-[min(92dvh,100dvh)] w-full min-h-0 flex-col rounded-t-dlc-xl border border-border/55 bg-dlc-surface-high shadow-dlc-4",
          "pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-1",
          "motion-safe:animate-slide-in-up motion-reduce:animate-none",
        )}
        style={shellPanelZIndex("sheet")}
        data-record-inspector-ignore-escape
      >
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border/50 px-4 py-3">
          <h2 id={titleId} className="text-base font-semibold tracking-tight text-foreground">
            Filters &amp; sort
          </h2>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 w-8 shrink-0 p-0"
            aria-label="Close filters"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="min-h-0 flex-1 touch-scroll-y overflow-y-auto overscroll-contain px-4 py-4">
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-muted-foreground">
              Search
            </span>
            <SearchField
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="File, stage, address…"
              autoComplete="off"
            />
          </label>

          <div className="mt-5">
            <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Stage
            </span>
            <div className="flex flex-wrap gap-1.5">
              {PIPELINE_STATUSES.map((s) => {
                const active = statusFilter.has(s.value);
                const badgeStyle = getPipelineStatusBadgeStyle(
                  s.value,
                  pipelineStageStyles,
                  { selected: active, globalIndicator: globalUiIndicator },
                );
                const dotStyle = getPipelineStatusDotStyle(
                  s.value,
                  pipelineStageStyles,
                  globalUiIndicator,
                );
                return (
                  <button
                    key={s.value}
                    type="button"
                    onClick={() => toggleStatus(s.value)}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-xs font-medium",
                      active
                        ? `${s.badgeClassName} ring-2 ring-brand-accent/35`
                        : "border-border bg-background hover:bg-muted",
                    )}
                    style={badgeStyle}
                    aria-pressed={active}
                  >
                    <span
                      className={cn(
                        "h-1.5 w-1.5 rounded-full",
                        s.dotClassName,
                      )}
                      style={dotStyle}
                      aria-hidden
                    />
                    {s.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mt-5">
            <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Client confidence
            </span>
            <div className="flex flex-wrap gap-1.5">
              {CLIENT_MOMENTUM_FILTER_OPTIONS.map((o) => {
                const active = momentumFilter.has(o.value);
                return (
                  <button
                    key={o.value}
                    type="button"
                    onClick={() => toggleMomentum(o.value)}
                    className={cn(
                      "inline-flex items-center gap-1 rounded-full border px-2.5 py-1.5 text-xs font-medium transition-colors",
                      active
                        ? "border-amber-400/80 bg-amber-50 text-amber-950 ring-2 ring-brand-accent/35 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-50"
                        : "border-border bg-background hover:bg-muted/60",
                    )}
                    aria-pressed={active}
                  >
                    {o.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setShowArchived((v) => !v)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium",
                showArchived
                  ? "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-700 dark:bg-amber-950/50 dark:text-amber-100"
                  : "border-border bg-muted/40",
              )}
              aria-pressed={showArchived}
            >
              Archived
            </button>
            <button
              type="button"
              onClick={() => setShowSnoozed((v) => !v)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium",
                showSnoozed
                  ? "border-blue-300 bg-blue-50 text-blue-900 dark:border-blue-700 dark:bg-blue-950/50 dark:text-blue-100"
                  : "border-border bg-muted/40",
              )}
              aria-pressed={showSnoozed}
            >
              Snoozed
            </button>
          </div>

          <div className="mt-5">
            <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Sort
            </span>
            <div className="grid gap-1.5">
              {SORT_OPTIONS.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => setSort(o.value)}
                  className={cn(
                    "rounded-lg border px-3 py-2.5 text-left text-sm font-medium transition-colors",
                    sort === o.value
                      ? "border-primary/50 bg-primary/10 text-primary"
                      : "border-border/80 bg-background hover:bg-muted/60",
                  )}
                  aria-pressed={sort === o.value}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-6 flex flex-wrap gap-2 border-t border-border/70 pt-4">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="text-xs"
              onClick={() => {
                clearFilters();
              }}
            >
              Clear search &amp; filters
            </Button>
            <Button
              type="button"
              variant="primary"
              size="sm"
              className="ml-auto text-xs"
              onClick={onClose}
            >
              Apply
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
