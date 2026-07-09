/**
 * Phase 24.4I — hub scroll layout-shift forensics + temporary stabilization.
 *
 * Revert flags after the shifting component is identified or scroll is stable.
 */

export const PHASE_24_4I_HUB_STABILIZATION = {
  /** ResizeObserver on `[data-pipeline-hub-list]` — logs `[LAYOUT SHIFT DETECTED]`. */
  layoutShiftTracker: true,
  /** Skip OperationalContentReveal fade; render hub content at full opacity immediately. */
  omitEntryAnimations: true,
  /** Phase 24.8 — must be false so hub chevrons collapse nested loan rows. */
  forceFullHierarchyMount: false,
  /** Chevron rotation uses DLC motion tokens when false. */
  omitHierarchyExpandMotion: false,
  /** `content-visibility` + `contain-intrinsic-size` on hub list rows (globals.css). */
  layoutContainment: false,
} as const;

export type Phase24_4IHubStabilizationFlag = keyof typeof PHASE_24_4I_HUB_STABILIZATION;

/** Expansion gate — when forcing full mount, always render nested rows. */
export function hubHierarchySectionVisible(expanded: boolean): boolean {
  return PHASE_24_4I_HUB_STABILIZATION.forceFullHierarchyMount || expanded;
}
