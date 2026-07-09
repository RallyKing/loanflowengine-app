"use client";

import { CircleHelp } from "lucide-react";
import { cn } from "@/lib/cn";
import { useHelpSupport } from "@/lib/helpSupportContext";

type Props = {
  className?: string;
  /** When true, show only the icon (square control). */
  iconOnly?: boolean;
};

export function HelpHubTrigger({ className, iconOnly }: Props) {
  const { toggleHelp } = useHelpSupport();

  return (
    <button
      type="button"
      onClick={() => toggleHelp()}
      className={cn(
        "inline-flex items-center justify-center gap-1.5 rounded-md border border-border bg-background text-sm font-medium text-foreground shadow-sm transition-colors",
        "hover:bg-muted hover:border-primary/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent focus-visible:ring-offset-1",
        iconOnly ? "h-9 w-9 shrink-0 p-0" : "px-3 py-1.5",
        className,
      )}
      title="Help and support — click to toggle. Press ? when not typing."
      aria-label="Help and support"
    >
      <CircleHelp className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
      {iconOnly ? null : (
        <span className="hidden sm:inline">Help</span>
      )}
    </button>
  );
}
