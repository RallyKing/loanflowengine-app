"use client";

import { Star } from "lucide-react";
import { cn } from "@/lib/cn";

interface StarsProps {
  value: number;
  onChange?: (next: number) => void;
  size?: "sm" | "md" | "lg";
  readOnly?: boolean;
  className?: string;
}

const sizes: Record<NonNullable<StarsProps["size"]>, string> = {
  sm: "h-3.5 w-3.5",
  md: "h-4 w-4",
  lg: "h-5 w-5",
};

export function Stars({
  value,
  onChange,
  size = "md",
  readOnly = false,
  className,
}: StarsProps) {
  const v = Math.max(0, Math.min(5, Math.round(value || 0)));
  const interactive = !readOnly && !!onChange;
  return (
    <div className={cn("inline-flex items-center gap-0.5", className)}>
      {[1, 2, 3, 4, 5].map((n) => {
        const filled = n <= v;
        return (
          <button
            key={n}
            type="button"
            tabIndex={interactive ? 0 : -1}
            aria-label={`${n} star${n === 1 ? "" : "s"}`}
            disabled={!interactive}
            onClick={() => {
              if (!interactive) return;
              // Click same star to clear.
              onChange?.(v === n ? 0 : n);
            }}
            className={cn(
              "rounded-sm transition-colors",
              interactive ? "cursor-pointer hover:scale-110" : "cursor-default"
            )}
          >
            <Star
              className={cn(
                sizes[size],
                filled
                  ? "fill-amber-400 text-amber-500"
                  : "fill-transparent text-muted-foreground/60"
              )}
            />
          </button>
        );
      })}
    </div>
  );
}
