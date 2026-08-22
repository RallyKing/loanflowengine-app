import { cn } from "@/lib/cn";
import { OP_WORKSPACE_ISLAND } from "@/lib/ui/operationalInputs";

/** Single radius for workspace cards, blocks, and surfaces. */
export const PIPELINE_WORKSPACE_CARD_RADIUS = "rounded-xl";

/** Phase 18.5 — soft edge (interiors use surface bands, not heavy frames). */
export const pipelineWorkspaceCardBorder = "border border-border/30";

/** Premium-soft elevation (no heavy drop shadow). */
export const pipelineWorkspaceCardShadow = cn(
  "shadow-none",
  "transition-[background-color] duration-200 ease-out",
);

/** Inner padding: primary content (drawer bodies, surfaces). */
export const pipelineWorkspaceCardBodyPadding =
  "px-3.5 py-3.5 sm:px-5 sm:py-4";

/** Inner padding: header / trigger rows (collapsible headers, overview trigger). */
export const pipelineWorkspaceCardHeaderPadding =
  "px-3.5 py-3 sm:px-5 sm:py-3.5";

/**
 * Outer frame only: radius, clip, shadow — border/background set per component
 * so variants (danger, CSS variables) merge cleanly.
 */
export function pipelineWorkspaceCardFrame(extra?: string) {
  return cn(
    "overflow-hidden",
    PIPELINE_WORKSPACE_CARD_RADIUS,
    pipelineWorkspaceCardShadow,
    extra,
  );
}

/**
 * Expandable regions: grid row snap — **no** animated `grid-template-rows` (scroll-safe).
 */
export const pipelineWorkspaceCollapseGrid = cn(
  "grid w-full min-w-0 grid-cols-[minmax(0,1fr)] transition-[grid-template-rows] duration-dlc-standard ease-dlc-standard motion-reduce:transition-none",
);

export const pipelineWorkspaceCollapseOpen = "grid-rows-[1fr]";
export const pipelineWorkspaceCollapseClosed = "grid-rows-[0fr]";

export const pipelineWorkspaceCollapseInner = cn(
  "w-full min-w-0 min-h-0 overflow-hidden [overflow-anchor:none]",
  "transition-opacity duration-dlc-standard ease-dlc-standard motion-reduce:transition-none",
);

/** Chevron rotation shared timing (matches collapse grid). */
export const pipelineWorkspaceChevronTransition =
  "transition-transform duration-200 ease-dlc-standard motion-reduce:transition-none";

/** Nested card / chip inside a workspace card (metrics, list rows). */
export const pipelineWorkspaceNestedChipClass = cn(
  "rounded-lg border border-border/25 bg-muted/10",
);

/** Shell for flat workspace surfaces (scheduling, sharing, quick panel chrome). */
export function pipelineWorkspaceSurfaceShell(extra?: string) {
  return cn(
    OP_WORKSPACE_ISLAND,
    pipelineWorkspaceCardBodyPadding,
    "max-sm:rounded-lg",
    extra,
  );
}

/** Muted collapsible shell (workspace utilities stack). */
export function pipelineWorkspaceMutedBlockShell(extra?: string) {
  return cn(
    OP_WORKSPACE_ISLAND,
    "max-sm:rounded-none",
    extra,
  );
}
