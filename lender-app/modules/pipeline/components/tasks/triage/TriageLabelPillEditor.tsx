"use client";

import { cn } from "@/lib/cn";
import { triageColorTint } from "@/lib/inFileTaskTriageUi";
import { LabelAppliedAtCaption } from "@/components/pipeline/tasks/triage/LabelAppliedAtCaption";

/** Selectable / clickable triage label pill (composer + task rows). */
export function TriageLabelPillEditor({
  label,
  hex,
  selected,
  onClick,
  onEdit,
  disabled,
  className,
  testId,
  labelAppliedAt,
  evaluationTime,
}: {
  label: string;
  hex: string;
  selected?: boolean;
  onClick?: () => void;
  onEdit?: () => void;
  disabled?: boolean;
  className?: string;
  testId?: string;
  /** When set, shows subtle relative time next to the pill (pipeline file tasks). */
  labelAppliedAt?: number;
  evaluationTime?: number;
}) {
  return (
    <span className={cn("inline-flex items-center", className)}>
      <button
        type="button"
        disabled={disabled}
        onClick={onClick}
        className={cn(
          "inline-flex min-h-10 items-center gap-2 rounded-full border px-3 text-xs font-medium",
          "transition-colors duration-dlc-standard ease-dlc-standard",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
          selected
            ? "border-primary text-foreground shadow-dlc-1"
            : "text-foreground/90 hover:opacity-95",
        )}
        style={{
          borderColor: selected ? undefined : `${hex}66`,
          backgroundColor: triageColorTint(hex, selected ? "22" : "12"),
        }}
        data-testid={testId}
      >
        <span
          className="h-2.5 w-2.5 shrink-0 rounded-full"
          style={{ backgroundColor: hex }}
          aria-hidden
        />
        <span className="max-w-[10rem] truncate">{label}</span>
      </button>
      <LabelAppliedAtCaption
        appliedAt={labelAppliedAt}
        now={evaluationTime}
      />
      {onEdit ? (
        <button
          type="button"
          disabled={disabled}
          onClick={(e) => {
            e.stopPropagation();
            onEdit();
          }}
          className={cn(
            "ml-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
            "text-[10px] font-semibold text-muted-foreground hover:bg-muted/60 hover:text-foreground",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          )}
          aria-label={`Edit label ${label}`}
          data-testid={testId ? `${testId}-edit` : undefined}
        >
          ···
        </button>
      ) : null}
    </span>
  );
}
