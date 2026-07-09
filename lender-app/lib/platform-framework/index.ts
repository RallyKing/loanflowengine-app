export {
  elevationVar,
  elevationShadowClass,
  type ElevationLevel,
} from "./elevation";
export {
  OVERLAY_Z_BASE,
  acquireOverlayZOffset,
  releaseOverlayZOffset,
  peekNextOverlayZ,
  zIndexStyle,
  type OverlayTier,
} from "./overlayStack";
export {
  captureActiveElement,
  restoreFocus,
  type FocusSnapshot,
} from "./focusRestoration";
export { motionTransitionClass, motionUtilityClass, type MotionClass } from "./motion";
export {
  semanticSurfacePanelClass,
  semanticSurfaceBadgeClass,
  type SemanticSurfaceRole,
} from "./semanticSurfaces";
export {
  DENSITY_DATA_ATTR,
  densityDocumentProps,
  densityRowHeightPx,
  densityTableCellPaddingClass,
  type PlatformDensity,
} from "./density";
export {
  APP_MAIN_SCROLL_SELECTOR,
  PIPELINE_WORKSPACE_SCROLL_SELECTOR,
  getDefaultAppMainScrollElement,
  getScrollElementForAnchor,
  type VirtualizationAnchor,
} from "./virtualization";
export {
  combineFieldValidation,
  fieldAriaDescribedBy,
  validationToSemanticRole,
  type FieldValidationSeverity,
  type FieldValidationState,
} from "./validation";
export {
  PLATFORM_DATA_TABLE_CLASS,
  PLATFORM_TABLE_HEADER_STICKY_CLASS,
} from "./tablePrimitives";
export type { InspectorBodyScrollContract } from "./inspectorContract";
export {
  platformLiveRegion,
  PLATFORM_TOUCH_TARGET_MIN_PX,
} from "./accessibility";
export {
  PLATFORM_CAPABILITY_REGISTRY,
  type AiWorkflowAssistanceTier,
  type AutomationVisibilityTier,
  type EnterpriseAnalyticsMaturity,
  type InspectorRailMode,
  type MaterialHarmonizationPhase,
  type MultiTenantScaleTrack,
  type TabletSplitPreset,
} from "./futureCapabilities";
