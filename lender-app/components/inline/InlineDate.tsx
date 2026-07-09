"use client";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { useResourceAccess } from "@/components/ResourceAccessProvider";
import { inlineClasses, useInlineCommit } from "./useInlineCommit";
import { InlineFieldSync } from "./InlineFieldSync";

/**
 * Inline date editor. Stores values as Unix-ms numbers (or null when cleared).
 */
export type InlineDateProps = {
  /** Unix ms timestamp, or null/undefined when unset. */
  value: number | null | undefined;
  onCommit: (next: number | null) => Promise<unknown> | unknown;
  placeholder?: string;
  className?: string;
  displayClassName?: string;
  inputClassName?: string;
  ariaLabel?: string;
  /** Format the resting display (default: locale date). */
  format?: (ms: number) => string;
  /** Show a small "today" / "in 3d" hint after the value. */
  showRelative?: boolean;
  /** When true, the control is read-only (no editing). */
  disabled?: boolean;
};

const toInputValue = (ms: number | null | undefined): string => {
  if (ms === null || ms === undefined) return "";
  const d = new Date(ms);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};

const fromInputValue = (s: string): number | null => {
  if (!s) return null;
  const [y, m, d] = s.split("-").map((p) => parseInt(p, 10));
  if (!y || !m || !d) return null;
  const date = new Date(y, m - 1, d);
  return date.getTime();
};

const defaultFormat = (ms: number) =>
  new Date(ms).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

const relative = (ms: number): string => {
  const now = Date.now();
  const diff = ms - now;
  const dayMs = 86_400_000;
  const days = Math.round(diff / dayMs);
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  if (days === -1) return "yesterday";
  if (days > 0 && days < 14) return `in ${days}d`;
  if (days < 0 && days > -14) return `${Math.abs(days)}d ago`;
  return "";
};

export function InlineDate({
  value,
  onCommit,
  placeholder = "Set date",
  className,
  displayClassName,
  inputClassName,
  ariaLabel,
  format = defaultFormat,
  showRelative,
  disabled: disabledProp = false,
}: InlineDateProps) {
  const { readOnly, viewOnlyTooltip } = useResourceAccess();
  const disabled = disabledProp || readOnly;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(toInputValue(value));
  const inputRef = useRef<HTMLInputElement>(null);
  const { loading, error, justSaved, commit, clearError } = useInlineCommit();

  useEffect(() => {
    if (!editing) setDraft(toInputValue(value));
  }, [value, editing]);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      try {
        inputRef.current.showPicker?.();
      } catch {
        /* noop — Safari < 16 doesn't support showPicker */
      }
    }
  }, [editing]);

  const trySave = async (rawNext?: string) => {
    const next = rawNext === undefined ? draft : rawNext;
    const parsed = fromInputValue(next);
    const current = value ?? null;
    if (parsed === current) {
      setEditing(false);
      return;
    }
    const ok = await commit(parsed, (n: number | null) => onCommit(n));
    if (ok) setEditing(false);
  };

  if (editing) {
    return (
      <InlineFieldSync
        loading={loading}
        className={cn("flex w-full items-center gap-1", className)}
      >
        <input
          ref={inputRef}
          type="date"
          value={draft}
          aria-label={ariaLabel}
          disabled={loading || disabled}
          onChange={(e) => {
            setDraft(e.target.value);
            if (error) clearError();
            void trySave(e.target.value);
          }}
          onBlur={() => void trySave()}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              setEditing(false);
            } else if (e.key === "Enter") {
              e.preventDefault();
              void trySave();
            }
          }}
          className={cn(
            inlineClasses.edit,
            "tabular-nums",
            error && inlineClasses.errored,
            inputClassName
          )}
        />
        {value !== null && value !== undefined ? (
          <button
            type="button"
            aria-label="Clear date"
            disabled={loading || disabled}
            className="inline-flex h-7 items-center justify-center rounded-md border px-2 text-xs text-muted-foreground hover:bg-muted"
            onMouseDown={(e) => e.preventDefault()}
            onClick={async () => {
              const ok = await commit(null, (n: number | null) => onCommit(n));
              if (ok) setEditing(false);
            }}
          >
            Clear
          </button>
        ) : null}
        {error ? <div className={inlineClasses.errorText}>{error}</div> : null}
      </InlineFieldSync>
    );
  }

  const hasValue = value !== null && value !== undefined;
  const rel = hasValue && showRelative ? relative(value as number) : "";
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={() => {
        if (disabled) return;
        setEditing(true);
      }}
      className={cn(
        inlineClasses.display,
        "w-full text-left",
        disabled && "cursor-not-allowed opacity-60",
        !hasValue && inlineClasses.displayEmpty,
        justSaved && inlineClasses.saved,
        displayClassName,
        className
      )}
    >
      {hasValue ? (
        <span className="inline-flex items-baseline gap-2">
          <span className="tabular-nums">{format(value as number)}</span>
          {rel ? (
            <span className="text-xs text-muted-foreground">{rel}</span>
          ) : null}
        </span>
      ) : (
        placeholder
      )}
    </button>
  );
}
