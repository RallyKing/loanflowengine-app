/**
 * Accessibility expectations for enterprise surfaces — pair with governance `accessibility-policy`.
 */

export const platformLiveRegion = {
  /** Non-blocking status (save sync, uploads) */
  politeStatus: "status" as const,
  /** Blocking or trust-critical errors */
  assertiveAlert: "alert" as const,
};

/** Minimum touch target per `globals.css` `--dlc-touch-target-min` */
export const PLATFORM_TOUCH_TARGET_MIN_PX = 44;
