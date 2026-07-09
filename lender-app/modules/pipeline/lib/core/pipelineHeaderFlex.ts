/**
 * Phase 24.12 — flex boundaries for pipeline file workspace chrome.
 * Prevents long triage task strings from expanding past 100% and pushing the file title off-screen.
 */

/** Outer chrome stack — never wider than the viewport. */
export const pipelineHeaderChromeRootClass =
  "min-h-0 min-w-0 w-full max-w-full overflow-hidden";

/** Desktop compact row: back + title cluster + actions. */
export const pipelineHeaderCompactRowClass =
  "flex h-9 min-h-9 w-full min-w-0 max-w-full flex-nowrap items-center gap-1.5 overflow-hidden sm:gap-2";

/**
 * Title + triage share one row on md+.
 * File title slot does not flex-shrink; triage column absorbs overflow via min-w-0 + truncate.
 */
export const pipelineHeaderTitleClusterClass =
  "flex min-w-0 flex-1 basis-0 max-w-full items-center gap-2 overflow-hidden";

/** File title — anchored; truncates inside a bounded slot instead of being pushed out. */
export const pipelineHeaderFileTitleSlotClass =
  "min-w-0 shrink-0 max-w-[min(52%,16rem)] overflow-hidden";

/** Triage task text column — must shrink below content width (min-w-0). */
export const pipelineHeaderTriageSlotClass =
  "min-w-0 flex-1 basis-0 overflow-hidden";

export const pipelineHeaderTriageTaskTruncateClass =
  "block min-w-0 max-w-full truncate text-xs font-medium text-foreground";

/** Mobile title tier — full width, clip horizontal bleed from long tokens. */
export const pipelineHeaderMobileTitleTierClass =
  "flex w-full min-w-0 max-w-full flex-col gap-1 overflow-hidden";

export const pipelineHeaderMobileFileTitleSlotClass =
  "min-w-0 max-w-full shrink-0 overflow-hidden";

export const pipelineHeaderMobileTriageSlotClass =
  "min-w-0 max-w-full overflow-hidden";
