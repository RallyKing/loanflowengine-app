"use client";

import {
  cloneElement,
  isValidElement,
  useId,
  type ReactElement,
  type ReactNode,
} from "react";
import { cn } from "@/lib/cn";

/**
 * Financial form field shell: label, support, error with shared `aria-describedby`.
 * The direct child should be a single input-like element; props are merged (id, aria-*).
 */
export function FinanceField({
  label,
  labelHint,
  supportText,
  errorText,
  children,
  className,
}: {
  label: ReactNode;
  /** Optional short hint next to label (e.g. optional, mask). */
  labelHint?: ReactNode;
  /** Persistent helper — not a replacement for `errorText`. */
  supportText?: ReactNode;
  errorText?: string | null;
  children: ReactElement<
    { id?: string; "aria-describedby"?: string; "aria-invalid"?: boolean }
  >;
  className?: string;
}) {
  const uid = useId().replace(/:/g, "");
  const controlId = `${uid}-control`;
  const supportId = supportText ? `${uid}-support` : undefined;
  const errorId = errorText ? `${uid}-error` : undefined;
  const describedBy = [supportId, errorId].filter(Boolean).join(" ") || undefined;

  const control = isValidElement(children)
    ? cloneElement(children, {
        id: (children.props as { id?: string }).id ?? controlId,
        "aria-describedby": describedBy,
        "aria-invalid": Boolean(errorText) || undefined,
      })
    : children;

  const resolvedControlId = isValidElement(children)
    ? (children.props as { id?: string }).id ?? controlId
    : controlId;

  return (
    <div className={cn("space-y-1.5", className)}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0">
        <label
          className="text-dlc-label-md font-medium leading-dlc-label-md tracking-dlc-label-md text-foreground"
          htmlFor={resolvedControlId}
        >
          {label}
          {labelHint ? (
            <span className="ms-1.5 font-normal text-muted-foreground">
              {labelHint}
            </span>
          ) : null}
        </label>
      </div>
      <div
        className={cn(
          errorText ? "rounded-dlc-sm ring-2 ring-destructive/20" : "",
        )}
      >
        {control}
      </div>
      {supportText ? (
        <p
          id={supportId}
          className="text-dlc-label-md leading-dlc-label-md tracking-dlc-label-md text-muted-foreground"
        >
          {supportText}
        </p>
      ) : null}
      {errorText ? (
        <p
          id={errorId}
          role="alert"
          className="text-dlc-label-md leading-dlc-label-md tracking-dlc-label-md text-destructive"
        >
          {errorText}
        </p>
      ) : null}
    </div>
  );
}
