"use client";

import { cn } from "@/lib/cn";
import type { TaskColorPreset } from "@/lib/taskColorPresets";

/** Approved 8-preset color picker — no custom hex/RGB. */
export function TriageColorPresetPicker({
  presets,
  value,
  onChange,
  disabled,
  className,
}: {
  presets: TaskColorPreset[];
  value: string;
  onChange: (colorId: string) => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn("flex flex-wrap gap-2", className)}
      role="listbox"
      aria-label="Highlight color"
      data-testid="triage-color-preset-picker"
    >
      {presets.map((preset) => {
        const selected = value === preset.id;
        return (
          <button
            key={preset.id}
            type="button"
            role="option"
            aria-selected={selected}
            aria-label={preset.label}
            disabled={disabled}
            className={cn(
              "h-9 w-9 rounded-full border-2 transition-transform duration-dlc-standard ease-dlc-standard",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
              selected
                ? "scale-110 border-foreground"
                : "border-transparent opacity-85 hover:opacity-100",
            )}
            style={{ backgroundColor: preset.hexCode }}
            onClick={() => onChange(preset.id)}
            data-testid={`triage-color-${preset.id}`}
          />
        );
      })}
    </div>
  );
}
