"use client";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { parseMoneyInput } from "@/lib/parseMoneyInput";
import { useResourceAccess } from "@/components/ResourceAccessProvider";
import { inlineClasses, useInlineCommit } from "./useInlineCommit";
import { InlineFieldSync } from "./InlineFieldSync";

export type InlineNumberProps = {
  value: number | null | undefined;
  /**
   * Called with the parsed number, or `null` when the user clears the field
   * (only when `clearable` is true).
   */
  onCommit: (next: number | null) => Promise<unknown> | unknown;
  placeholder?: string;
  /** Render the resting value (e.g. `$500,000`, `7.50%`, `12 mo`). */
  format: (n: number) => string;
  /**
   * Custom parser. Default uses parseMoneyInput which understands `500k`,
   * `1.5M`, `$1,234`. Pass `Number` for plain numerics (rate, term).
   */
  parse?: (s: string) => number | null | undefined;
  validate?: (n: number) => string | null | undefined;
  /** Allow clearing to `null` (default true). */
  clearable?: boolean;
  className?: string;
  displayClassName?: string;
  inputClassName?: string;
  ariaLabel?: string;
};

const defaultParse = (s: string): number | null | undefined => {
  const trimmed = s.trim();
  if (!trimmed) return null;
  return parseMoneyInput(trimmed);
};

export function InlineNumber({
  value,
  onCommit,
  placeholder = "Click to add",
  format,
  parse = defaultParse,
  validate,
  clearable = true,
  className,
  displayClassName,
  inputClassName,
  ariaLabel,
}: InlineNumberProps) {
  const { readOnly, viewOnlyTooltip } = useResourceAccess();
  const [editing, setEditing] = useState(false);
  const initialDraft =
    value === null || value === undefined ? "" : String(value);
  const [draft, setDraft] = useState(initialDraft);
  const inputRef = useRef<HTMLInputElement>(null);
  const { loading, error, justSaved, commit, clearError } = useInlineCommit();

  useEffect(() => {
    if (!editing) {
      setDraft(value === null || value === undefined ? "" : String(value));
    }
  }, [value, editing]);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const stop = (cancel?: boolean) => {
    setEditing(false);
    if (cancel) {
      setDraft(value === null || value === undefined ? "" : String(value));
    }
  };

  const trySave = async () => {
    const trimmed = draft.trim();
    if (!trimmed) {
      if (!clearable) {
        stop(true);
        return;
      }
      if (value === null || value === undefined) {
        stop();
        return;
      }
      const ok = await commit(null, (n: number | null) => onCommit(n));
      if (ok) stop();
      return;
    }
    const parsed = parse(trimmed);
    if (parsed === undefined || parsed === null || !Number.isFinite(parsed)) {
      return;
    }
    if (parsed === value) {
      stop();
      return;
    }
    if (validate) {
      const msg = validate(parsed);
      if (msg) return;
    }
    const ok = await commit(parsed, (n: number | null) => onCommit(n));
    if (ok) stop();
  };

  if (editing) {
    return (
      <InlineFieldSync loading={loading} className={className}>
        <input
          ref={inputRef}
          type="text"
          inputMode="decimal"
          value={draft}
          aria-label={ariaLabel}
          disabled={loading}
          placeholder={placeholder}
          onChange={(e) => {
            setDraft(e.target.value);
            if (error) clearError();
          }}
          onBlur={() => void trySave()}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              stop(true);
            } else if (e.key === "Enter") {
              e.preventDefault();
              void trySave();
            }
          }}
          className={cn(
            inlineClasses.edit,
            error && inlineClasses.errored,
            inputClassName
          )}
        />
        {error ? <div className={inlineClasses.errorText}>{error}</div> : null}
      </InlineFieldSync>
    );
  }

  const hasValue = value !== null && value !== undefined;
  const display = hasValue ? format(value as number) : "";
  if (readOnly) {
    return (
      <span
        aria-label={ariaLabel}
        title={viewOnlyTooltip}
        className={cn(
          inlineClasses.display,
          "block w-full cursor-not-allowed opacity-60 tabular-nums",
          !hasValue && inlineClasses.displayEmpty,
          displayClassName,
          className,
        )}
      >
        {display || placeholder}
      </span>
    );
  }
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      onClick={() => setEditing(true)}
      className={cn(
        inlineClasses.display,
        "w-full text-left tabular-nums",
        !hasValue && inlineClasses.displayEmpty,
        justSaved && inlineClasses.saved,
        displayClassName,
        className
      )}
    >
      {display || placeholder}
    </button>
  );
}
