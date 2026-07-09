"use client";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { useResourceAccess } from "@/components/ResourceAccessProvider";
import { inlineClasses, useInlineCommit } from "./useInlineCommit";
import { InlineFieldSync } from "./InlineFieldSync";

export type InlineSelectOption = {
  value: string;
  label: string;
  /** Optional Tailwind classes applied to the resting display chip. */
  badgeClassName?: string;
  /** Optional inline style for the resting display chip. */
  badgeStyle?: React.CSSProperties;
};

export type InlineSelectProps = {
  value: string;
  options: InlineSelectOption[];
  onCommit: (next: string) => Promise<unknown> | unknown;
  className?: string;
  displayClassName?: string;
  selectClassName?: string;
  ariaLabel?: string;
  /** Render selected value as a colored pill (uses `badgeClassName`). */
  asBadge?: boolean;
  placeholder?: string;
  /** Allow committing the value but stop event bubbling — used in table rows. */
  stopPropagation?: boolean;
};

export function InlineSelect({
  value,
  options,
  onCommit,
  className,
  displayClassName,
  selectClassName,
  ariaLabel,
  asBadge,
  placeholder = "Choose…",
  stopPropagation,
}: InlineSelectProps) {
  const { readOnly, viewOnlyTooltip } = useResourceAccess();
  const [editing, setEditing] = useState(false);
  const ref = useRef<HTMLSelectElement>(null);
  const { loading, error, justSaved, commit } = useInlineCommit();

  useEffect(() => {
    if (editing && ref.current) ref.current.focus();
  }, [editing]);

  const trySave = async (next: string) => {
    if (next === value) {
      setEditing(false);
      return;
    }
    const ok = await commit(next, onCommit);
    if (ok) setEditing(false);
  };

  if (editing) {
    return (
      <InlineFieldSync
        loading={loading}
        className={className}
        onClick={(e) => stopPropagation && e.stopPropagation()}
      >
        <select
          ref={ref}
          value={value}
          aria-label={ariaLabel}
          disabled={loading}
          onChange={(e) => void trySave(e.target.value)}
          onBlur={() => setEditing(false)}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              setEditing(false);
            }
          }}
          className={cn(
            inlineClasses.edit,
            error && inlineClasses.errored,
            selectClassName
          )}
        >
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        {error ? <div className={inlineClasses.errorText}>{error}</div> : null}
      </InlineFieldSync>
    );
  }

  const current = options.find((o) => o.value === value);

  if (readOnly) {
    const label = current?.label || placeholder;
    return (
      <span
        aria-label={ariaLabel}
        title={viewOnlyTooltip}
        className={cn(
          asBadge
            ? "inline-flex cursor-not-allowed items-center rounded-full border px-2.5 py-0.5 text-xs font-medium opacity-60"
            : cn(inlineClasses.display, "block w-full cursor-not-allowed opacity-60"),
          current?.badgeClassName,
          displayClassName,
          className,
        )}
        style={current?.badgeStyle}
      >
        {label}
      </span>
    );
  }

  if (asBadge) {
    return (
      <button
        type="button"
        aria-label={ariaLabel}
        onClick={(e) => {
          if (stopPropagation) e.stopPropagation();
          setEditing(true);
        }}
        className={cn(
          "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-foreground/40",
          current?.badgeClassName ?? "border-muted bg-muted text-foreground",
          justSaved && inlineClasses.saved,
          displayClassName,
          className
        )}
        style={current?.badgeStyle}
      >
        {current?.label || placeholder}
      </button>
    );
  }

  return (
    <button
      type="button"
      aria-label={ariaLabel}
      onClick={(e) => {
        if (stopPropagation) e.stopPropagation();
        setEditing(true);
      }}
      className={cn(
        inlineClasses.display,
        "w-full text-left",
        !current && inlineClasses.displayEmpty,
        justSaved && inlineClasses.saved,
        displayClassName,
        className
      )}
    >
      {current?.label || placeholder}
    </button>
  );
}
