"use client";

import { RefreshCw } from "lucide-react";
import { cn } from "@/lib/cn";

export type HardRefreshButtonProps = {
  className?: string;
  /** `header` matches masterpage icon cluster; `banner` is subtler for pipeline file chrome. */
  variant?: "header" | "banner";
};

export function HardRefreshButton({
  className,
  variant = "header",
}: HardRefreshButtonProps) {
  return (
    <button
      type="button"
      onClick={() => window.location.reload()}
      data-testid="app-hard-refresh"
      title="Refresh App"
      aria-label="Refresh App"
      className={cn(
        "inline-flex shrink-0 items-center justify-center transition-colors duration-dlc-short ease-dlc-standard",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent focus-visible:ring-offset-1",
        variant === "header"
          ? "h-9 w-9 rounded-md border border-border bg-background text-foreground shadow-sm hover:border-primary/35 hover:bg-muted"
          : "h-8 w-8 rounded-dlc-sm text-muted-foreground hover:bg-muted/70 hover:text-foreground",
        className,
      )}
    >
      <RefreshCw
        className={cn("shrink-0", variant === "banner" ? "h-4 w-4" : "h-4 w-4")}
        aria-hidden
      />
    </button>
  );
}
