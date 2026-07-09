"use client";

import { forwardRef, type InputHTMLAttributes } from "react";
import { Search, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { opSearchFieldClass } from "@/lib/ui/operationalInputs";

export type SearchFieldProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "type"
> & {
  /** Wrapper (positions icon + optional clear). */
  containerClassName?: string;
  /** Extra classes on the `<input>`. */
  inputClassName?: string;
  /** Dense toolbar height (`h-8`) instead of default `h-10`. */
  compact?: boolean;
  /** When set, shows a clear control while `value` is non-empty. */
  onClear?: () => void;
};

export const SearchField = forwardRef<HTMLInputElement, SearchFieldProps>(
  function SearchField(
    {
      containerClassName,
      inputClassName,
      compact = false,
      onClear,
      value,
      className,
      ...inputProps
    },
    ref
  ) {
    const hasValue =
      value !== undefined && value !== null && String(value).length > 0;
    const showClear = Boolean(onClear && hasValue);

    return (
      <div className={cn("relative min-w-0", containerClassName)}>
        <Search
          className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-foreground/55"
          aria-hidden
        />
        <input
          ref={ref}
          type="search"
          enterKeyHint="search"
          value={value}
          className={cn(
            opSearchFieldClass({ compact }),
            "pl-9",
            showClear && "pr-9",
            className,
            inputClassName
          )}
          {...inputProps}
        />
        {showClear ? (
          <button
            type="button"
            aria-label="Clear search"
            onClick={onClear}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:bg-dlc-surface-high/40 hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        ) : null}
      </div>
    );
  }
);

SearchField.displayName = "SearchField";
