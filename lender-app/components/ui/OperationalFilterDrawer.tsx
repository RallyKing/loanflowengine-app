"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Filter, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import { OP_BORDER_SOFT, OP_DISCLOSURE_TRANSITION } from "@/lib/ui/operationalTokens";
import { layerZIndexStyle, overlayScrimClass } from "@/lib/ui/layering";
import type { OrientationPill } from "@/components/ui/OperationalOrientationStrip";
import {
  opMotionDrawerTransition,
  opMotionFastTransition,
  opMotionSheetPanelClass,
} from "@/lib/ui/operationalMotion";
import {
  focusOperationalContainer,
  useOperationalEscape,
  useOperationalFocusReturn,
} from "@/lib/ui/operationalFocus";

type OperationalFilterDrawerProps = {
  title?: string;
  activeCount: number;
  summaryPills?: OrientationPill[];
  onClearAll?: () => void;
  children: ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  className?: string;
  "data-testid"?: string;
};

/**
 * Advanced filters — inline expandable on md+, bottom sheet on narrow viewports.
 */
export function OperationalFilterDrawer({
  title = "Filters",
  activeCount,
  summaryPills = [],
  onClearAll,
  children,
  open: controlledOpen,
  onOpenChange,
  className,
  "data-testid": testId = "operational-filter-drawer",
}: OperationalFilterDrawerProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = onOpenChange ?? setInternalOpen;
  const sheetRef = useRef<HTMLDivElement>(null);
  const [sheetEntered, setSheetEntered] = useState(false);

  useOperationalEscape(open, () => setOpen(false));
  useOperationalFocusReturn(open);

  useEffect(() => {
    if (!open) {
      setSheetEntered(false);
      return;
    }
    const id = requestAnimationFrame(() => setSheetEntered(true));
    return () => cancelAnimationFrame(id);
  }, [open]);

  useEffect(() => {
    if (!open || typeof window === "undefined") return;
    if (window.matchMedia("(min-width: 768px)").matches) return;
    const t = requestAnimationFrame(() => focusOperationalContainer(sheetRef.current));
    return () => cancelAnimationFrame(t);
  }, [open]);

  const triggerLabel =
    activeCount > 0 ? `${title} (${activeCount})` : title;

  return (
    <div className={cn("min-w-0", className)} data-testid={testId}>
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={cn("h-9 shrink-0 gap-1.5 min-h-10 max-md:min-h-11", opMotionFastTransition)}
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          <Filter className="h-3.5 w-3.5" aria-hidden />
          <span className="max-md:sr-only">{triggerLabel}</span>
          {activeCount > 0 ? (
            <span className="rounded-full bg-muted/50 px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-muted-foreground md:hidden">
              {activeCount}
            </span>
          ) : null}
        </Button>
        {summaryPills.length > 0 ? (
          <div className="hidden min-w-0 flex-1 flex-wrap items-center gap-1 md:flex">
            {summaryPills.slice(0, 4).map((p) => (
              <span
                key={p.id}
                className="inline-flex max-w-[10rem] items-center gap-1 truncate rounded-full border border-border/40 bg-muted/20 px-2 py-0.5 text-[11px] text-muted-foreground"
              >
                {p.label}
              </span>
            ))}
            {summaryPills.length > 4 ? (
              <span className="text-[11px] text-muted-foreground/80">
                +{summaryPills.length - 4}
              </span>
            ) : null}
          </div>
        ) : null}
        {activeCount > 0 && onClearAll ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="hidden h-8 text-xs text-muted-foreground md:inline-flex"
            onClick={onClearAll}
          >
            Clear all
          </Button>
        ) : null}
      </div>

      <div
        className={cn(
          "hidden overflow-hidden md:block",
          OP_DISCLOSURE_TRANSITION,
          open ? "max-h-[min(70vh,32rem)] opacity-100" : "max-h-0 opacity-0",
        )}
      >
        <div
          className={cn(
            "mt-2 space-y-3 rounded-lg border bg-background p-3 shadow-sm",
            OP_BORDER_SOFT,
          )}
        >
          <FilterDrawerHeader
            title={title}
            onClose={() => setOpen(false)}
            onClearAll={onClearAll}
            showClear={activeCount > 0}
          />
          {children}
        </div>
      </div>

      {open ? (
        <div
          className="fixed inset-0 flex flex-col justify-end md:hidden"
          style={layerZIndexStyle("SHEET")}
          role="dialog"
          aria-modal="true"
          aria-label={title}
        >
          <button
            type="button"
            className={cn("absolute inset-0", overlayScrimClass(), opMotionFastTransition)}
            aria-label="Close filters"
            onClick={() => setOpen(false)}
          />
          <div
            ref={sheetRef}
            className={cn(
              opMotionSheetPanelClass,
              "max-h-[min(88dvh,640px)]",
              OP_BORDER_SOFT,
              opMotionDrawerTransition,
              sheetEntered ? "translate-y-0" : "translate-y-full",
            )}
            data-nested-scroll
            onClick={(e) => e.stopPropagation()}
          >
            <FilterDrawerHeader
              title={title}
              onClose={() => setOpen(false)}
              onClearAll={onClearAll}
              showClear={activeCount > 0}
            />
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3 touch-scroll-y">
              {children}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function FilterDrawerHeader({
  title,
  onClose,
  onClearAll,
  showClear,
}: {
  title: string;
  onClose: () => void;
  onClearAll?: () => void;
  showClear: boolean;
}) {
  return (
    <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border/40 px-3 py-2.5">
      <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      <div className="flex items-center gap-1">
        {showClear && onClearAll ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 text-xs"
            onClick={onClearAll}
          >
            Clear all
          </Button>
        ) : null}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-9 w-9 min-h-10 min-w-10 p-0"
          aria-label="Close filters"
          onClick={onClose}
        >
          <X className="h-4 w-4" aria-hidden />
        </Button>
      </div>
    </div>
  );
}
