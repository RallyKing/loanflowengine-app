import { cn } from "@/lib/cn";
import {
  workspaceSectionGapClass,
  workspaceSectionSpaceClass,
} from "@/lib/design-system/tokens";

/** Distinct cool-gray canvas — pure white cards pop on top. */
export const premiumWorkspaceCanvasClass = cn(
  "bg-slate-100 dark:bg-slate-900/50",
  "-mx-1 rounded-dlc-md px-2.5 py-2 sm:px-3 sm:py-2.5",
);

/** Pure white card shell with crisp border and premium shadow lift on hover. */
export const premiumCardClassName =
  "bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm hover:shadow-md transition-shadow duration-dlc-standard ease-dlc-standard";

/** Header/body divider inside premium cards. */
export const premiumCardDividerClass =
  "border-gray-100 dark:border-gray-800";

export const premiumCardHeaderPaddingClass =
  "px-5 py-2.5 sm:px-6 sm:py-3";

export const premiumCardBodyPaddingClass =
  "px-5 py-4 sm:px-6 sm:py-5";

/** Vertical rhythm between cards on a premium canvas (16px). */
export const premiumSectionStackClass = cn(
  "flex flex-col",
  workspaceSectionGapClass,
);

/** Tab-level vertical stack spacing (16px). */
export const premiumTabStackClass = workspaceSectionGapClass;
export const premiumTabSectionSpaceClass = workspaceSectionSpaceClass;

/** Re-export — canonical container lives in WorkspaceContentContainer. */
export { PREMIUM_WORKSPACE_CONTAINER_CLASS } from "@/components/WorkspaceContentContainer";

/** Premium field labels — muted but readable on white card surfaces. */
export const premiumFieldLabelClass =
  "text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400";
