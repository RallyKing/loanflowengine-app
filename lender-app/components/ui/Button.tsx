import { ButtonHTMLAttributes, forwardRef } from "react";
import { cn } from "@/lib/cn";

type Variant = "primary" | "outline" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

/*
 * `primary`: brand accent fill with `brand-accent-foreground` for WCAG AA
 * (dark ink on gold in classic; white on blue in SaaS). Hover deepens to forest + white in classic.
 */
const variants: Record<Variant, string> = {
  primary:
    "bg-brand-accent text-brand-accent-foreground shadow-dlc-1 hover:bg-brand hover:text-brand-foreground hover:shadow-dlc-2 active:scale-[0.98]",
  outline:
    "border border-border bg-background text-foreground shadow-dlc-1 hover:bg-muted hover:border-primary/35 hover:shadow-dlc-2 active:bg-muted/80 active:scale-[0.98]",
  ghost:
    "text-foreground hover:bg-muted/80 active:bg-muted active:scale-[0.98]",
  danger:
    "bg-destructive text-destructive-foreground shadow-dlc-1 hover:bg-destructive/90 hover:shadow-dlc-2 focus-visible:ring-destructive/60 active:scale-[0.98]",
};

const sizes: Record<Size, string> = {
  sm: "h-8 min-h-8 px-3 text-dlc-label-md leading-dlc-label-md tracking-dlc-label-md",
  md: "h-10 min-h-[40px] px-4 text-dlc-body-md leading-dlc-body-md tracking-dlc-body-md sm:h-11 sm:min-h-[44px]",
  lg: "h-12 min-h-[48px] px-6 text-dlc-body-lg leading-dlc-body-lg tracking-dlc-body-lg",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", size = "md", ...props }, ref) => (
    <button
      ref={ref}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-dlc-sm font-medium transition-[color,background-color,box-shadow,transform] duration-dlc-short1 ease-dlc-standard",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent focus-visible:ring-offset-1 focus-visible:ring-offset-background",
        "disabled:pointer-events-none disabled:opacity-[0.48]",
        variants[variant],
        sizes[size],
        className
      )}
      {...props}
    />
  )
);
Button.displayName = "Button";
