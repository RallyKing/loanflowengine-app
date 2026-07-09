import { InputHTMLAttributes, TextareaHTMLAttributes, forwardRef } from "react";
import { cn } from "@/lib/cn";
import {
  opInputFieldClass,
  OP_INLINE_TEXTAREA_CLASS,
} from "@/lib/ui/operationalInputs";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(opInputFieldClass({ className }))}
      {...props}
    />
  )
);
Input.displayName = "Input";

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(OP_INLINE_TEXTAREA_CLASS, className)}
    {...props}
  />
));
Textarea.displayName = "Textarea";

export const Select = forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(({ className, children, ...props }, ref) => (
  <select
    ref={ref}
    className={cn(opInputFieldClass({ className }))}
    {...props}
  >
    {children}
  </select>
));
Select.displayName = "Select";

export function Label({
  children,
  hint,
  className,
  ...props
}: React.LabelHTMLAttributes<HTMLLabelElement> & { hint?: string }) {
  return (
    <label
      className={cn(
        "flex flex-col gap-1 text-dlc-body-md leading-dlc-body-md tracking-dlc-body-md",
        className
      )}
      {...props}
    >
      <span className="text-dlc-title-md font-medium leading-dlc-title-md tracking-dlc-title-md">
        {children}
      </span>
      {hint ? (
        <span className="text-dlc-label-md leading-dlc-label-md tracking-dlc-label-md text-muted-foreground">
          {hint}
        </span>
      ) : null}
    </label>
  );
}
