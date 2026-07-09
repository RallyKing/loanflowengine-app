"use client";

import { type ReactNode, useId } from "react";
import { Field } from "@/components/intake/ui/Field";
import { cn } from "@/lib/cn";
import {
  fieldAriaDescribedBy,
  semanticSurfacePanelClass,
  validationToSemanticRole,
  type FieldValidationState,
} from "@/lib/platform-framework";

/**
 * Finance-grade field wrapper: shared validation surface + semantic roles.
 * Wire `aria-describedby` on the control with {@link fieldAriaDescribedBy} when needed.
 */
export function FinanceField({
  label,
  hint,
  className,
  children,
  validation,
}: {
  label?: ReactNode;
  hint?: ReactNode;
  className?: string;
  children: ReactNode;
  validation?: FieldValidationState | null;
}) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errId = validation ? `${id}-err` : undefined;
  const describedBy = fieldAriaDescribedBy(hintId, errId);

  return (
    <div className={cn("flex min-w-0 flex-col gap-1.5", className)}>
      <Field
        label={label}
        hint={
          hint ? (
            <span id={hintId}>{hint}</span>
          ) : undefined
        }
      >
        {describedBy ? (
          <div aria-describedby={describedBy}>{children}</div>
        ) : (
          children
        )}
      </Field>
      {validation ? (
        <div
          id={errId}
          role={validation.severity === "error" ? "alert" : "status"}
          className={cn(
            "text-xs leading-snug",
            semanticSurfacePanelClass(
              validationToSemanticRole(validation.severity),
              "py-2",
            ),
          )}
        >
          {validation.message}
        </div>
      ) : null}
    </div>
  );
}
