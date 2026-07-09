"use client";

import { Loader2 } from "lucide-react";
import { cn } from "@/lib/cn";
import {
  OP_FIELD_MUTATING_CLASS,
  OP_INLINE_SYNC_SPINNER,
  OP_INLINE_SYNC_TEXT,
} from "@/lib/ui/operationalFeedback";

/** Wraps inline editors during async commit — mutes field, shows micro sync. */
export function InlineFieldSync({
  loading,
  children,
  className,
  ...rest
}: {
  loading: boolean;
  children: React.ReactNode;
  className?: string;
} & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      {...rest}
      className={cn(
        "group/inline-edit w-full",
        loading && OP_FIELD_MUTATING_CLASS,
        className,
      )}
    >
      {children}
      {loading ? (
        <span
          className="mt-0.5 flex items-center gap-1.5"
          aria-live="polite"
          aria-busy="true"
        >
          <Loader2 className={OP_INLINE_SYNC_SPINNER} aria-hidden />
          <span className={OP_INLINE_SYNC_TEXT}>Saving…</span>
        </span>
      ) : null}
    </div>
  );
}
