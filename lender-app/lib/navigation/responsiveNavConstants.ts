import { SCREEN_MD_MIN, SCREEN_XL_MIN, SCREEN_LG_MIN, SCREEN_2XL_MIN } from "@/lib/ui/breakpoints";

/**
 * Navigation layout — must match `deriveResponsiveNavLayout` thresholds.
 * @deprecated Import from `@/lib/ui/breakpoints` for new code; kept for stable imports.
 */
export const NAV_BREAKPOINT_MD = SCREEN_MD_MIN;
export const NAV_BREAKPOINT_XL = SCREEN_XL_MIN;

/** Optional: laptop band inside tablet/desktop (not used by deriveResponsiveNavLayout). */
export const NAV_BREAKPOINT_LG = SCREEN_LG_MIN;
export const NAV_BREAKPOINT_2XL = SCREEN_2XL_MIN;

/** Treat very short usable height as needing thumb-primary navigation (foldables, landscape phones). */
export const NAV_SHORT_VIEWPORT_PX = 520;

/** Narrow landscape width: prefer bottom bar + rail hybrid. */
export const NAV_LANDSCAPE_NARROW_PX = 880;

export const LS_TABLET_BOTTOM_NAV = "dlc-nav-tablet-bottom-v1";
export const LS_LAST_NAV_ROUTE = "dlc-nav-last-primary-v1";
