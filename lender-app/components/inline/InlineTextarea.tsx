"use client";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { useResourceAccess } from "@/components/ResourceAccessProvider";
import { inlineClasses, useInlineCommit } from "./useInlineCommit";
import { InlineFieldSync } from "./InlineFieldSync";

export type InlineTextareaProps = {
  value: string;
  onCommit: (next: string) => Promise<unknown> | unknown;
  placeholder?: string;
  className?: string;
  displayClassName?: string;
  inputClassName?: string;
  ariaLabel?: string;
  /** Number of rows when editing (default 3). */
  rows?: number;
};

export function InlineTextarea({
  value,
  onCommit,
  placeholder = "Click to add notes",
  className,
  displayClassName,
  inputClassName,
  ariaLabel,
  rows = 3,
}: InlineTextareaProps) {
  const { readOnly, viewOnlyTooltip } = useResourceAccess();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const ref = useRef<HTMLTextAreaElement>(null);
  const { loading, error, justSaved, commit, clearError } = useInlineCommit();

  useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);

  useEffect(() => {
    if (editing && ref.current) {
      ref.current.focus();
      ref.current.setSelectionRange(
        ref.current.value.length,
        ref.current.value.length
      );
    }
  }, [editing]);

  const stop = (cancel?: boolean) => {
    setEditing(false);
    if (cancel) setDraft(value);
  };

  const trySave = async () => {
    const next = draft.replace(/\s+$/g, "");
    if (next === value) {
      stop();
      return;
    }
    const ok = await commit(next, onCommit);
    if (ok) stop();
  };

  if (editing) {
    return (
      <InlineFieldSync loading={loading} className={className}>
        <textarea
          ref={ref}
          value={draft}
          rows={rows}
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
            } else if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              void trySave();
            }
          }}
          className={cn(
            inlineClasses.editTextarea,
            error && inlineClasses.errored,
            inputClassName
          )}
        />
        {error ? <div className={inlineClasses.errorText}>{error}</div> : null}
        <div className="mt-1 text-[11px] text-muted-foreground">
          ⌘/Ctrl + Enter to save, Esc to cancel
        </div>
      </InlineFieldSync>
    );
  }

  if (readOnly) {
    return (
      <span
        aria-label={ariaLabel}
        title={viewOnlyTooltip}
        className={cn(
          inlineClasses.displayTextarea,
          "block w-full cursor-not-allowed whitespace-pre-wrap break-words [overflow-wrap:anywhere] opacity-60",
          !value && inlineClasses.displayEmpty,
          displayClassName,
          className,
        )}
      >
        {value || placeholder}
      </span>
    );
  }
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      onClick={() => setEditing(true)}
      className={cn(
        inlineClasses.displayTextarea,
        "w-full whitespace-pre-wrap break-words text-left [overflow-wrap:anywhere]",
        !value && inlineClasses.displayEmpty,
        justSaved && inlineClasses.saved,
        displayClassName,
        className
      )}
    >
      {value || placeholder}
    </button>
  );
}
