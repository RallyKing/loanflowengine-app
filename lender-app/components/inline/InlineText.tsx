"use client";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { useResourceAccess } from "@/components/ResourceAccessProvider";
import { inlineClasses, useInlineCommit } from "./useInlineCommit";
import { InlineFieldSync } from "./InlineFieldSync";

export type InlineTextProps = {
  value: string;
  onCommit: (next: string) => Promise<unknown> | unknown;
  placeholder?: string;
  /** Return an error message string to block the commit, or null/undefined to allow it. */
  validate?: (next: string) => string | null | undefined;
  /** Allow committing the empty string (default false — empty value will revert). */
  allowEmpty?: boolean;
  className?: string;
  displayClassName?: string;
  inputClassName?: string;
  ariaLabel?: string;
  /** Optional formatter used when not editing (e.g. capitalize). */
  format?: (value: string) => string;
  readOnly?: boolean;
  readOnlyTitle?: string;
};

export function InlineText({
  value,
  onCommit,
  placeholder = "Click to add",
  validate,
  allowEmpty = false,
  className,
  displayClassName,
  inputClassName,
  ariaLabel,
  format,
  readOnly: readOnlyProp = false,
  readOnlyTitle: readOnlyTitleProp,
}: InlineTextProps) {
  const access = useResourceAccess();
  const readOnly = readOnlyProp || access.readOnly;
  const readOnlyTitle = readOnlyTitleProp ?? access.viewOnlyTooltip;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);
  const { loading, error, justSaved, commit, clearError } = useInlineCommit();

  useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const stop = (cancel?: boolean) => {
    setEditing(false);
    if (cancel) setDraft(value);
  };

  const trySave = async () => {
    const next = draft.trim();
    if (!allowEmpty && !next) {
      stop(true);
      return;
    }
    if (next === value) {
      stop();
      return;
    }
    if (validate) {
      const msg = validate(next);
      if (msg) {
        return;
      }
    }
    const ok = await commit(next, onCommit);
    if (ok) stop();
  };

  if (editing) {
    return (
      <InlineFieldSync loading={loading} className={className}>
        <input
          ref={inputRef}
          type="text"
          value={draft}
          aria-label={ariaLabel}
          disabled={loading}
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

  const displayed = value ? (format ? format(value) : value) : "";
  if (readOnly) {
    return (
      <span
        aria-label={ariaLabel}
        title={readOnlyTitle}
        className={cn(
          inlineClasses.display,
          "block w-full cursor-not-allowed opacity-60",
          !displayed && inlineClasses.displayEmpty,
          displayClassName,
          className,
        )}
      >
        {displayed || placeholder}
      </span>
    );
  }
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      onClick={() => setEditing(true)}
      onFocus={(e) => {
        if (e.currentTarget === document.activeElement) setEditing(true);
      }}
      className={cn(
        inlineClasses.display,
        "w-full text-left",
        !displayed && inlineClasses.displayEmpty,
        justSaved && inlineClasses.saved,
        displayClassName,
        className
      )}
    >
      {displayed || placeholder}
    </button>
  );
}
