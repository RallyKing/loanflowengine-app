"use client";

import { useCallback, useId } from "react";
import { Input } from "@/components/ui/Input";
import { cn } from "@/lib/cn";
import type { TaskColorPreset } from "@/lib/taskColorPresets";
import { normalizeTriageLabelHex } from "@/lib/triageLabelColor";

export function TriageLabelCustomColorField({
  valueHex,
  onChangeHex,
  presets,
  disabled,
  className,
  testId,
}: {
  valueHex: string;
  onChangeHex: (hex: string) => void;
  presets: TaskColorPreset[];
  disabled?: boolean;
  className?: string;
  testId?: string;
}) {
  const colorInputId = useId();
  const hexTextId = useId();
  const displayHex = normalizeTriageLabelHex(valueHex) ?? "#64748B";

  const commitHex = useCallback(
    (raw: string) => {
      const next = normalizeTriageLabelHex(raw);
      if (next) onChangeHex(next);
    },
    [onChangeHex],
  );

  return (
    <div
      className={cn("space-y-2", className)}
      data-testid={testId ?? "triage-label-custom-color"}
    >
      <div className="flex flex-wrap items-center gap-3">
        <label
          htmlFor={colorInputId}
          className="text-xs font-medium text-muted-foreground"
        >
          Color
        </label>
        <input
          id={colorInputId}
          type="color"
          value={displayHex}
          disabled={disabled}
          className="h-10 w-14 shrink-0 cursor-pointer rounded-dlc-sm border border-border bg-background p-0.5 disabled:opacity-50"
          aria-label="Pick label color"
          data-testid="triage-label-color-input"
          onChange={(e) => commitHex(e.currentTarget.value)}
        />
        <label htmlFor={hexTextId} className="sr-only">
          Hex color
        </label>
        <Input
          id={hexTextId}
          value={displayHex}
          disabled={disabled}
          className="min-h-10 max-w-[8.5rem] font-mono text-xs uppercase"
          placeholder="#RRGGBB"
          spellCheck={false}
          data-testid="triage-label-hex-input"
          onChange={(e) => commitHex(e.currentTarget.value)}
          onBlur={(e) => commitHex(e.currentTarget.value)}
        />
      </div>
      {presets.length > 0 ? (
        <div className="flex flex-wrap gap-2" aria-label="Quick colors">
          {presets.map((preset) => (
            <button
              key={preset.id}
              type="button"
              disabled={disabled}
              className={cn(
                "h-8 w-8 rounded-full border-2 transition-transform duration-dlc-standard ease-dlc-standard",
                displayHex.toUpperCase() === preset.hexCode.toUpperCase()
                  ? "scale-110 border-foreground"
                  : "border-transparent opacity-85 hover:opacity-100",
              )}
              style={{ backgroundColor: preset.hexCode }}
              aria-label={`Use ${preset.label}`}
              aria-pressed={
                displayHex.toUpperCase() === preset.hexCode.toUpperCase()
              }
              onClick={() => onChangeHex(preset.hexCode)}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
