/**
 * Phase 24.4R — native document scroll + PWA viewport hints (Track A).
 *
 * Dismantles nested `#app-main-scroll` on mobile pipeline hub so URL bar
 * physics target html/body, not a hidden overflow parent.
 */
export const PHASE_24_4R_NATIVE_SCROLL_PWA = {
  /** Mobile pipeline hub (not convex file workspace): window owns vertical scroll. */
  enableNativeDocumentScroll: true,
  /** Root viewport + apple-mobile-web-app meta (layout.tsx). */
  enablePwaViewportMeta: true,
  /** Force bottom nav `z-index: 40` when document scroll is active. */
  forceBottomNavZIndex40: true,
} as const;

export const NATIVE_DOCUMENT_SCROLL_HTML_ATTR = "data-native-document-scroll";
