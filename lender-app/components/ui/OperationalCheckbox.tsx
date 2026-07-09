"use client";

import type { InputHTMLAttributes } from "react";
import { cn } from "@/lib/cn";
import {
  OP_MICRO_CONTROL_CLASS,
  OP_MICRO_CONTROL_WRAP_CLASS,
} from "@/lib/ui/operationalInputs";

type OperationalCheckboxProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "type"
> & {
  /** Skip touch wrapper when already inside a large hit target (e.g. row). */
  bare?: boolean;
};

/**
 * Touch-safe checkbox — visual control + expanded hit area.
 */
export function OperationalCheckbox({
  className,
  bare = false,
  ...props
}: OperationalCheckboxProps) {
  const input = (
    <input
      type="checkbox"
      className={cn(OP_MICRO_CONTROL_CLASS, className)}
      {...props}
    />
  );
  if (bare) return input;
  return <span className={OP_MICRO_CONTROL_WRAP_CLASS}>{input}</span>;
}
