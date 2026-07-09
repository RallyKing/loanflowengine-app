"use client";

import { useEffect, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import {
  OP_BATCH_BAR_ENTERED,
  OP_BATCH_BAR_EXITED,
  OP_BATCH_BAR_MOTION,
  OP_BATCH_BAR_POSITION,
  OP_BATCH_BAR_SURFACE,
} from "@/lib/ui/operationalFeedback";
import { layerZIndexStyle } from "@/lib/ui/layering";

type OperationalBatchBarProps = {
  open: boolean;
  count: number;
  itemNoun?: string;
  sublabel?: string;
  onClear: () => void;
  children: ReactNode;
  busy?: boolean;
  className?: string;
  "data-testid"?: string;
};

/**
 * Floating multi-select action anchor — slide-up when selection is active.
 */
export function OperationalBatchBar({
  open,
  count,
  itemNoun = "item",
  sublabel,
  onClear,
  children,
  busy = false,
  className,
  "data-testid": testId = "operational-batch-bar",
}: OperationalBatchBarProps) {
  const [mounted, setMounted] = useState(open);
  const [entered, setEntered] = useState(false);

  useEffect(() => {
    if (open) {
      setMounted(true);
      const id = requestAnimationFrame(() => setEntered(true));
      return () => cancelAnimationFrame(id);
    }
    setEntered(false);
    const t = window.setTimeout(() => setMounted(false), 220);
    return () => window.clearTimeout(t);
  }, [open]);

  if (!mounted && !open) return null;

  const label = `${count.toLocaleString()} ${itemNoun}${count === 1 ? "" : "s"} selected`;

  return (
    <div
      className={cn(
        OP_BATCH_BAR_POSITION,
        OP_BATCH_BAR_MOTION,
        "pointer-events-none",
        className,
      )}
      style={layerZIndexStyle("SHEET")}
      data-testid={testId}
      role="region"
      aria-label="Batch actions for selected items"
      aria-hidden={!open}
    >
      <div
        className={cn(
          OP_BATCH_BAR_SURFACE,
          "pointer-events-auto flex flex-wrap items-center gap-3 px-3 py-2.5 sm:px-4",
          entered ? OP_BATCH_BAR_ENTERED : OP_BATCH_BAR_EXITED,
        )}
      >
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground">{label}</p>
          {sublabel ? (
            <p className="text-[11px] text-muted-foreground/75">{sublabel}</p>
          ) : null}
        </div>
        <div
          className={cn(
            "flex flex-wrap items-center justify-end gap-1.5 sm:gap-2",
            busy && "pointer-events-none opacity-70",
          )}
        >
          {children}
          <button
            type="button"
            className="h-9 shrink-0 rounded-md px-2.5 text-xs font-medium text-muted-foreground hover:bg-muted/40 hover:text-foreground max-md:min-h-10"
            onClick={onClear}
            disabled={busy}
          >
            Clear
          </button>
        </div>
      </div>
    </div>
  );
}
