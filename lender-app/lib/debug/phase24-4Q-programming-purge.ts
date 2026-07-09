/**
 * Phase 24.4Q — mute resize/visualViewport/scroll-driven React churn on `/pipeline`.
 *
 * Primary suspect: `useViewportNavSignals` (window + visualViewport resize/scroll).
 */
export const PHASE_24_4Q_PROGRAMMING_PURGE = {
  /** Freeze `useViewportNavSignals` / `useResponsiveNavLayout` after first paint. */
  freezeViewportSignals: true,
  /** Freeze `useNarrowViewport` (matchMedia) on pipeline hub. */
  freezeNarrowViewport: true,
  /** Disable 24.4I hub ResizeObserver shift tracker. */
  disableHubResizeObserver: true,
  /** Log resize/scroll listener registration on pipeline (console forensics). */
  interceptResizeScrollListeners: false,
  /** `scroll-behavior: auto !important` on pipeline mobile scroll chain. */
  forceScrollBehaviorAuto: true,
} as const;

export const PIPELINE_SCROLL_BEHAVIOR_AUTO_HTML_ATTR =
  "data-pipeline-scroll-behavior-auto";

export const PIPELINE_PROGRAMMING_PURGE_HTML_ATTR =
  "data-pipeline-programming-purge";
