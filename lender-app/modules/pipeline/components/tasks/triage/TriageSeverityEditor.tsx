"use client";

import { Input } from "@/components/ui/Input";
import { cn } from "@/lib/cn";

const MIN = 1;
const MAX = 2000;

/** Compact severity weight control for triage label manager / quick edit. */
export function TriageSeverityEditor({
  value,
  onChange,
  disabled,
  className,
}: {
  value: number;
  onChange: (next: number) => void;
  disabled?: boolean;
  className?: string;
}) {
  const clamp = (n: number) =>
    Math.min(MAX, Math.max(MIN, Math.round(Number.isFinite(n) ? n : MIN)));

  return (
    <div className={cn("space-y-2", className)} data-testid="triage-severity-editor">
      <div className="flex items-center gap-3">
        <input
          type="range"
          min={MIN}
          max={MAX}
          step={10}
          value={clamp(value)}
          disabled={disabled}
          className="h-2 min-h-0 flex-1 accent-primary"
          aria-label="Severity weight"
          onChange={(e) => onChange(clamp(Number(e.currentTarget.value)))}
        />
        <Input
          type="number"
          min={MIN}
          max={MAX}
          step={1}
          value={String(clamp(value))}
          disabled={disabled}
          className="h-9 w-20 shrink-0 px-2 text-center text-sm"
          aria-label="Severity weight value"
          onChange={(e) => onChange(clamp(Number(e.currentTarget.value)))}
        />
      </div>
      <p className="text-[11px] leading-snug text-muted-foreground">
        Higher weight wins when multiple labeled tasks bubble on the same hub row.
      </p>
    </div>
  );
}
