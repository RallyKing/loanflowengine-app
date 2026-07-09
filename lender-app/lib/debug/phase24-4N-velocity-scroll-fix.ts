/**
 * Phase 24.4N — velocity / async scroll stabilization on `/pipeline` hub.
 *
 * Fast momentum swipes desync when:
 * - `content-visibility: auto` guesses intrinsic heights (24.4I)
 * - body + `#app-main-scroll` both scroll with loose overscroll (24.4K)
 * - @tanstack/react-virtual uses fixed estimates (not wired on hub today)
 */
export const PHASE_24_4N_VELOCITY_SCROLL_FIX = {
  /** Disable 24.4I `content-visibility` hub rows (lazy paint + intrinsic-size guessing). */
  disableHubLayoutContainment: true,
  /** Revert 24.4K window scroll test — restore single `#app-main-scroll` owner. */
  revertNativeScrollTest: true,
  /** `overscroll-behavior-y: none` on html/body/main for pipeline surfaces. */
  velocityOverscrollNone: true,
  /** Hub must not use @tanstack/react-virtual until `measureElement` is wired. */
  hubVirtualizationDisabled: true,
} as const;

export const PIPELINE_VELOCITY_OVERSCROLL_HTML_ATTR =
  "data-pipeline-velocity-overscroll-none";
