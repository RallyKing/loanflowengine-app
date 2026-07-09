import type { CSSProperties } from "react";

/** Mobile layout tokens for /settings/pipeline-stages — keep Add Stage above bottom nav + keyboard. */
export const PIPELINE_STAGES_MOBILE_NAV_CLEARANCE =
  "max(5.5rem, calc(4.25rem + env(safe-area-inset-bottom, 0px)))";

/** Height reserved for the fixed “Add stage” action bar (portrait). */
export const PIPELINE_STAGES_MOBILE_ACTION_BAR_HEIGHT = "4.25rem";

export const pipelineStagesPageMobilePaddingClass =
  "max-md:pb-[calc(var(--pipeline-stages-mobile-scroll-pad,9.75rem)+env(safe-area-inset-bottom,0px))]";

export const pipelineStagesMobileScrollPadStyle: CSSProperties = {
  ["--pipeline-stages-mobile-scroll-pad" as string]:
    "calc(4.25rem + 5.5rem)",
};
