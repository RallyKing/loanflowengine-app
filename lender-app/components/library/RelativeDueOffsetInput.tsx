"use client";

import { Input } from "@/components/ui/Input";
import { cn } from "@/lib/cn";

export type RelativeDueOffsetInputProps = {
  value: number | null;
  onChange: (days: number | null) => void;
  disabled?: boolean;
  className?: string;
};

export function RelativeDueOffsetInput({
  value,
  onChange,
  disabled = false,
  className,
}: RelativeDueOffsetInputProps) {
  const displayValue = value == null ? "" : String(value);

  return (
    <div className={cn("space-y-1", className)}>
      <label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        Due after application
      </label>
      <div className="flex items-center gap-2">
        <span className="shrink-0 text-xs text-muted-foreground">Due in</span>
        <Input
          type="number"
          min={0}
          max={3650}
          step={1}
          className="h-9 w-20"
          placeholder="—"
          value={displayValue}
          disabled={disabled}
          onChange={(e) => {
            const raw = e.target.value.trim();
            if (!raw) {
              onChange(null);
              return;
            }
            const parsed = Number.parseInt(raw, 10);
            if (!Number.isFinite(parsed) || parsed < 0) return;
            onChange(parsed);
          }}
          data-testid="template-due-offset-days"
        />
        <span className="text-xs text-muted-foreground">
          days after template is applied
        </span>
      </div>
    </div>
  );
}
