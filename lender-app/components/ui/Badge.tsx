import { cn } from "@/lib/cn";
import {
  semanticBadgeClasses,
  type SemanticBadgeRole,
} from "@/lib/design-system/semanticTokens";

const BASE =
  "inline-flex items-center transition-shadow duration-dlc-short1 ease-dlc-standard text-dlc-label-md leading-dlc-label-md tracking-dlc-label-md";

const BRAND_STYLES: Record<"default" | "accent" | "secondary" | "outline", string> = {
  default:
    "rounded-dlc-full border border-border/70 bg-background px-2.5 py-0.5 font-medium text-foreground/85 shadow-dlc-1",
  accent:
    "rounded-dlc-full bg-accent px-2.5 py-0.5 font-medium text-accent-foreground shadow-dlc-1",
  secondary:
    "rounded-dlc-full border border-border/60 bg-muted/80 px-2.5 py-0.5 font-semibold text-foreground shadow-dlc-1",
  outline:
    "rounded-dlc-full border border-border/80 bg-transparent px-2.5 py-0.5 font-medium text-muted-foreground",
};

export type BadgeVariant =
  | "default"
  | "accent"
  | "secondary"
  | "outline"
  | SemanticBadgeRole;

export function Badge({
  children,
  className,
  variant = "default",
}: {
  children: React.ReactNode;
  className?: string;
  variant?: BadgeVariant;
}) {
  const isSemantic =
    variant !== "default" &&
    variant !== "accent" &&
    variant !== "secondary" &&
    variant !== "outline";
  const classes = isSemantic
    ? cn("px-2.5 py-0.5", semanticBadgeClasses[variant as SemanticBadgeRole])
    : BRAND_STYLES[variant as "default" | "accent" | "secondary" | "outline"];

  return <span className={cn(BASE, classes, className)}>{children}</span>;
}
