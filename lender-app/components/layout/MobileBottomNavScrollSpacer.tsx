import { cn } from "@/lib/cn";

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
        variant === "file" ? "h-32" : "h-28",
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
