"use client";

import { useId, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * Progressive disclosure card — summary always visible; details expand in place.
 * Prefer over blocking dialogs for non-destructive secondary information.
 */
export function ProgressiveDisclosureCard({
  summary,
  children,
  defaultOpen = false,
  className,
  toggleLabelCollapsed = "Show details",
  toggleLabelExpanded = "Hide details",
  id,
}: {
  summary: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
  className?: string;
  toggleLabelCollapsed?: string;
  toggleLabelExpanded?: string;
  /** Optional stable prefix for ids; a unique suffix is always appended. */
  id?: string;
}) {
  const uid = useId().replace(/:/g, "");
  const base = id ? `${id}-${uid}` : uid;
  const [open, setOpen] = useState(defaultOpen);
  const panelId = `${base}-panel`;
  const btnId = `${base}-toggle`;

  return (
    <section
      className={cn(
        "rounded-dlc-md border border-border bg-dlc-surface shadow-dlc-1",
        className,
      )}
      aria-labelledby={btnId}
    >
      <div className="flex items-start gap-3 px-4 py-3">
        <div className="min-w-0 flex-1 text-dlc-body-md leading-dlc-body-md tracking-dlc-body-md">
          {summary}
        </div>
        <button
          id={btnId}
          type="button"
          className="shrink-0 rounded-dlc-sm px-2 py-1 text-dlc-label-md font-medium text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? toggleLabelExpanded : toggleLabelCollapsed}
        </button>
      </div>
      {open ? (
        <div
          id={panelId}
          className="dlc-motion-status-settle border-t border-border px-4 py-3 text-dlc-body-md leading-dlc-body-md tracking-dlc-body-md text-muted-foreground"
        >
          {children}
        </div>
      ) : null}
    </section>
  );
}
