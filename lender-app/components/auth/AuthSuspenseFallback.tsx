"use client";

import { cn } from "@/lib/cn";
import type { AuthMachineState } from "@/lib/auth/authTypes";
import { livePhaseLabel } from "@/lib/useLiveConnection";

export function AuthSuspenseFallback({
  state,
  className,
}: {
  state?: AuthMachineState;
  className?: string;
}) {
  const label =
    state === "reconnecting"
      ? livePhaseLabel("reconnecting")
      : state === "degraded"
        ? "Working offline or reconnecting"
        : state === "loading"
          ? "Loading session…"
          : "Loading…";

  return (
    <div
      role="status"
      aria-busy="true"
      className={cn(
        "flex min-h-[120px] flex-col items-center justify-center gap-3 rounded-lg border border-border/60 bg-muted/20 px-4 py-8 text-center text-sm text-muted-foreground",
        state === "degraded" && "border-amber-200/60 bg-amber-50/30 dark:border-amber-900/40 dark:bg-amber-950/20",
        className,
      )}
    >
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-foreground/70" />
      <p>{label}</p>
    </div>
  );
}

