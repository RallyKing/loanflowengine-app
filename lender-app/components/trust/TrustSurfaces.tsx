"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/** Calm list-style loading — no celebratory motion; respects reduced motion via opacity pulse alternative. */
export function TrustListSkeleton({
  rows = 4,
  label = "Loading",
  className,
}: {
  rows?: number;
  label?: string;
  className?: string;
}) {
  return (
    <div
      className={cn("space-y-3", className)}
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <p className="text-sm text-muted-foreground">{label}…</p>
      <ul className="space-y-2" aria-hidden>
        {Array.from({ length: rows }).map((_, i) => (
          <li
            key={i}
            className="h-[3.25rem] rounded-lg border border-border/40 dlc-surface-skeleton"
          />
        ))}
      </ul>
    </div>
  );
}

/** Institutional error surface — use for client portal and operator views where stack traces must not appear raw. */
export function TrustErrorBlock({
  title,
  description,
  children,
  className,
}: {
  title: string;
  description?: string;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-lg border border-destructive/35 bg-destructive/5 px-4 py-3",
        className,
      )}
      role="alert"
    >
      <p className="text-sm font-medium text-foreground">{title}</p>
      {description ? (
        <p className="mt-1.5 text-sm leading-snug text-muted-foreground">
          {description}
        </p>
      ) : null}
      {children ? <div className="mt-3 space-y-2">{children}</div> : null}
    </div>
  );
}

/** Reassurance line after uploads — factual, non-celebratory. */
export function TrustUploadReceipt({
  fileName,
  className,
}: {
  fileName: string;
  className?: string;
}) {
  return (
    <p
      className={cn(
        "text-sm text-muted-foreground border-l-2 border-border pl-3",
        className,
      )}
      role="status"
    >
      Upload received: <span className="font-medium text-foreground">{fileName}</span>.
      Your lending team can access it from this file.
    </p>
  );
}
