import { cn } from "@/lib/cn";
import { semanticBadgeClasses, type SemanticBadgeRole } from "@/lib/design-system/semanticTokens";

/**
 * Semantic **surfaces** — use plain `dlc-semantic-*` from `globals.css` (JIT-safe)
 * plus panel chrome. Do not duplicate RGB literals here.
 */

export type SemanticSurfaceRole = SemanticBadgeRole;

const ROLE_PANEL: Record<SemanticSurfaceRole, string> = {
  success: "dlc-semantic-success",
  warning: "dlc-semantic-warning",
  error: "dlc-semantic-error",
  info: "dlc-semantic-info",
  attention: "dlc-semantic-attention",
  neutral: "dlc-semantic-neutral",
  pending: "dlc-semantic-pending",
  approved: "dlc-semantic-approved",
  declined: "dlc-semantic-declined",
  active: "dlc-semantic-active",
  inactive: "dlc-semantic-inactive",
  destructive: "dlc-semantic-destructive",
};

export function semanticSurfacePanelClass(
  role: SemanticSurfaceRole,
  className?: string,
): string {
  return cn(
    "rounded-lg border border-solid px-3 py-2 text-sm leading-snug",
    ROLE_PANEL[role],
    className,
  );
}

export function semanticSurfaceBadgeClass(role: SemanticSurfaceRole): string {
  return semanticBadgeClasses[role];
}
