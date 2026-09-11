"use client";
import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
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
  /** When set, overrides ResourceAccess context read-only (used by pipeline stage selector). */
  readOnly?: boolean;
  /** Allow committing the value but stop event bubbling — used in table rows. */
  stopPropagation?: boolean;
};

function stopBubble(
  e: { stopPropagation: () => void },
  stopPropagation: boolean | undefined,
) {
  if (stopPropagation) e.stopPropagation();
}

/**
 * Open the native chooser inside the same user gesture as the click.
 * Calling `showPicker` from a `useEffect` after `setEditing(true)` fails in
 * Chromium (“requires a user gesture”) — that was the hub stage-pill regression.
 */
function openNativeSelectPicker(el: HTMLSelectElement | null) {
  if (!el) return;
  el.focus();
  try {
    el.showPicker?.();
  } catch {
    /* Safari < 16 / NotAllowedError — focused select is still usable */
  }
}

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
  readOnly: readOnlyOverride,
  stopPropagation,
}: InlineSelectProps) {
  const { readOnly: resourceReadOnly, viewOnlyTooltip } = useResourceAccess();
  const readOnly =
    readOnlyOverride !== undefined ? readOnlyOverride : resourceReadOnly;
  const [editing, setEditing] = useState(false);
  const ref = useRef<HTMLSelectElement>(null);
  const { loading, error, justSaved, commit } = useInlineCommit();

  // Non-badge path: focus after mount (picker already requested in click via flushSync).
  useEffect(() => {
    if (!editing || !ref.current || asBadge) return;
    ref.current.focus();
  }, [editing, asBadge]);

  const trySave = async (next: string) => {
    if (next === value) {
      setEditing(false);
      return;
    }
    const ok = await commit(next, onCommit);
    if (ok) setEditing(false);
  };

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

  /**
   * Badge mode: opaque label + transparent native <select> hit target.
   * First click opens the OS chooser (no edit-state / showPicker race).
   */
  if (asBadge) {
    return (
      <div
        className={cn(
          "relative z-[1] inline-flex max-w-full shrink-0",
          loading && "opacity-70",
          className,
        )}
        onPointerDown={(e) => stopBubble(e, stopPropagation)}
        onClick={(e) => stopBubble(e, stopPropagation)}
      >
        <span
          aria-hidden
          className={cn(
            "pointer-events-none inline-flex max-w-full items-center rounded-full border px-2.5 py-0.5 text-xs font-medium",
            current?.badgeClassName ?? "border-muted bg-muted text-foreground",
            justSaved && inlineClasses.saved,
            displayClassName,
          )}
          style={current?.badgeStyle}
        >
          <span className="truncate">{current?.label || placeholder}</span>
        </span>
        <select
          ref={ref}
          value={value}
          aria-label={ariaLabel}
          disabled={loading}
          data-testid="inline-select-badge-native"
          onPointerDown={(e) => stopBubble(e, stopPropagation)}
          onClick={(e) => stopBubble(e, stopPropagation)}
          onChange={(e) => void trySave(e.target.value)}
          className={cn(
            "absolute inset-0 z-[1] cursor-pointer opacity-0",
            "disabled:cursor-not-allowed",
            selectClassName,
          )}
        >
          {options.map((o) => (
            <option key={o.value || "__empty"} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        {error ? <div className={inlineClasses.errorText}>{error}</div> : null}
      </div>
    );
  }

  if (editing) {
    return (
      <InlineFieldSync
        loading={loading}
        className={className}
        onClick={(e) => stopBubble(e, stopPropagation)}
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
            <option key={o.value || "__empty"} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        {error ? <div className={inlineClasses.errorText}>{error}</div> : null}
      </InlineFieldSync>
    );
  }

  return (
    <button
      type="button"
      aria-label={ariaLabel}
      onClick={(e) => {
        stopBubble(e, stopPropagation);
        flushSync(() => setEditing(true));
        openNativeSelectPicker(ref.current);
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
