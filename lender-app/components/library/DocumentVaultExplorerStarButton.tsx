"use client";

import { Star } from "lucide-react";
import { cn } from "@/lib/cn";

export type DocumentVaultExplorerStarButtonProps = {
  starred: boolean;
  label: string;
  onToggle: () => void;
  compact?: boolean;
  disabled?: boolean;
  className?: string;
  testId?: string;
};

export function DocumentVaultExplorerStarButton({
  starred,
  label,
  onToggle,
  compact = false,
  disabled = false,
  className,
  testId,
}: DocumentVaultExplorerStarButtonProps) {
  const action = starred ? "Unstar" : "Star";
  return (
    <div
      className={cn(
        "relative flex shrink-0 items-center justify-center",
        compact ? "h-5 w-5" : "h-6 w-5",
      )}
    >
      <button
        type="button"
        className={cn(
          "relative -m-2.5 inline-flex cursor-pointer items-center justify-center rounded-dlc-sm p-2.5 transition-colors duration-dlc-short ease-dlc-standard",
          "hover:bg-amber-500/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/40",
          disabled && "pointer-events-none opacity-40",
          className,
        )}
        aria-pressed={starred}
        aria-label={`${action} ${label}`}
        title={action}
        data-testid={testId}
        disabled={disabled}
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
          onToggle();
        }}
      >
        <Star
          className={cn(
            compact ? "h-3 w-3" : "h-3.5 w-3.5",
            starred
              ? "fill-amber-400 text-amber-500"
              : "fill-transparent text-muted-foreground/70 hover:text-amber-500",
          )}
          aria-hidden
        />
      </button>
    </div>
  );
}
