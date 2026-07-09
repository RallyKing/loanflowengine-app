/**
 * Phase 24.4K — delegate vertical scroll to the native window on mobile pipeline
 * hub surfaces (diagnostic). Revert to `false` after A/B on device.
 */
/** Superseded by Phase 24.4R (`data-native-document-scroll`). */
export const PHASE_24_4K_NATIVE_SCROLL_TEST = false;

export const PIPELINE_NATIVE_SCROLL_HTML_ATTR = "data-pipeline-native-scroll-test";
