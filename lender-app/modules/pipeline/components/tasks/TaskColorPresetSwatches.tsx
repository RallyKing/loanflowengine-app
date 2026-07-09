"use client";

import { cn } from "@/lib/cn";
import type { TaskColorPreset } from "@/lib/taskColorPresets";

export function TaskColorPresetSwatches({
  presets,
  value,
  onChange,
  disabled,
  label = "Highlight color",
  layout = "stack",
}: {
  presets: TaskColorPreset[];
  value: string | null;
  onChange: (colorId: string) => void;
  disabled?: boolean;
  label?: string;
  /** Horizontal row for in-file triage composer (Phase 21.6). */
  layout?: "stack" | "row";
}) {
  if (presets.length === 0) return null;

  const swatchRow = (
    <div
      className={cn(
        "flex gap-2",
        layout === "row" ? "flex-nowrap overflow-x-auto pb-0.5" : "flex-wrap",
      )}
      role="radiogroup"
      aria-label={label}
    >
        {presets.map((preset) => {
          const selected = value === preset.id;
          return (
            <button
              key={preset.id}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={preset.label}
              title={preset.label}
              disabled={disabled}
              className={cn(
                "relative h-9 w-9 shrink-0 rounded-full border-2 transition-transform duration-dlc-short ease-dlc-standard",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                selected
                  ? "scale-110 border-foreground shadow-dlc-1"
                  : "border-transparent hover:scale-105",
              )}
              style={{ backgroundColor: preset.hexCode }}
              onClick={() => onChange(preset.id)}
              data-testid={`task-color-swatch-${preset.id}`}
            >
              {selected ? (
                <span className="absolute inset-0 m-auto h-2 w-2 rounded-full bg-white/90" />
              ) : null}
            </button>
          );
        })}
    </div>
  );

  if (layout === "row") {
    return (
      <div
        className="space-y-1.5"
        aria-label={label}
        aria-disabled={disabled || undefined}
      >
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        {swatchRow}
      </div>
    );
  }

  return (
    <fieldset className="space-y-1.5" disabled={disabled} aria-label={label}>
      <legend className="text-xs font-medium text-muted-foreground">{label}</legend>
      {swatchRow}
    </fieldset>
  );
}
