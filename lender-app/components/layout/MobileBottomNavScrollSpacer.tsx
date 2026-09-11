import { cn } from "@/lib/cn";
import {
  FILE_WORKSPACE_BOTTOM_NAV_SPACER_CLASS,
  GLOBAL_BOTTOM_NAV_SPACER_CLASS,
} from "@/lib/ui/safeArea";

/** Physical tail spacer so fixed bottom nav never covers the last scrollable content. */
export function MobileBottomNavScrollSpacer({
  variant = "global",
}: {
  /** `global` — AppChrome `<main>`; `file` — `[data-pipeline-workspace-scroll]`. */
  variant?: "global" | "file";
}) {
  return (
    <div
      className={cn(
        "w-full shrink-0 pointer-events-none",
        /* File: tighter dock clearance. Global/hub: taller list tail (unchanged). */
        variant === "file"
          ? FILE_WORKSPACE_BOTTOM_NAV_SPACER_CLASS
          : GLOBAL_BOTTOM_NAV_SPACER_CLASS,
      )}
      aria-hidden="true"
      data-testid={
        variant === "file"
          ? "pipeline-file-bottom-nav-spacer"
          : "app-main-bottom-nav-spacer"
      }
    />
  );
}
