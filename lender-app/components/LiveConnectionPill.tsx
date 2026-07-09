"use client";

import type { ReactNode } from "react";
import { Loader2, WifiOff } from "lucide-react";
import { useLiveConnection, livePhaseLabel } from "@/lib/useLiveConnection";
import { useUserSettings } from "@/lib/userSettingsContext";
import { useShellMotionReady } from "@/components/layout/ShellMotionReadyContext";
import { cn } from "@/lib/cn";
import {
  useConvexSubPillTrace,
  useConvexSubRenderTrace,
} from "@/lib/convexSubDiagnosticsHooks";

const pillShell = cn(
  "ml-1 flex max-w-[12rem] items-center gap-1.5 truncate rounded-full border px-2 py-0.5 text-[10px] font-medium",
  "max-md:ml-0 max-md:h-8 max-md:max-w-8 max-md:min-w-8 max-md:justify-center max-md:gap-0 max-md:px-1.5 max-md:py-0",
);

/** Reserves header width so status text / minimal-mode toggles never reflow siblings. */
function PillSlot({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-8 max-w-[12rem] shrink-0 items-center justify-end max-md:w-8 max-md:min-w-8 md:min-w-[12rem]">
      {children}
    </div>
  );
}

/**
 * Header status for the Convex real-time WebSocket. On sm+ it is visible by
 * default; when Settings → “minimal” live pill is on, the healthy idle “Live”
 * chip is hidden so the bar stays quieter (connecting / busy / offline still
 * show).
 *
 * - `data-hub-state`: `browser-offline` | `connecting` | `reconnecting` | `live`
 * - `data-hub-activity`: `idle` | `busy` (in-flight work when live)
 */
export function LiveConnectionPill() {
  useConvexSubRenderTrace("LiveConnectionPill");
  const motionReady = useShellMotionReady();
  const { settings } = useUserSettings();
  const {
    phase,
    canUseHub,
    hasPendingInvocations,
    state: s,
    browserOnline,
  } = useLiveConnection();

  const hubState = !browserOnline
    ? "browser-offline"
    : !canUseHub
      ? phase
      : "live";
  const hubActivity = hasPendingInvocations ? "busy" : "idle";
  useConvexSubPillTrace(hubState, hubActivity);

  if (!browserOnline) {
    return (
      <PillSlot>
        <div
          data-hub-state="browser-offline"
          data-hub-activity="idle"
          className={cn(
            pillShell,
            "border-border bg-muted text-foreground",
            !motionReady && "transition-none",
          )}
          title="Browser reports offline. Reconnect the network to sync with Convex."
          aria-label="No network"
          role="status"
        >
          <WifiOff className="h-2.5 w-2.5 shrink-0" aria-hidden />
          <span className="min-w-0 hidden md:inline">No network</span>
        </div>
      </PillSlot>
    );
  }

  if (!canUseHub) {
    const first = phase === "connecting";
    const label = livePhaseLabel(phase);
    return (
      <PillSlot>
        <div
          data-hub-state={phase}
          data-hub-activity="idle"
          className={cn(
            pillShell,
            "border-amber-200/80 bg-amber-50/90 text-amber-900 dark:border-amber-800/50 dark:bg-amber-950/50 dark:text-amber-100",
            !motionReady && "transition-none",
          )}
          title={
            first
              ? "Connect live data — opening the real-time WebSocket to your deployment."
              : "Live data dropped — client is reconnecting; refresh the page to retry now."
          }
          aria-label={label}
          role="status"
        >
          {first ? (
            <Loader2
              className="h-2.5 w-2.5 shrink-0 animate-spin"
              aria-hidden
            />
          ) : (
            <WifiOff className="h-2.5 w-2.5 shrink-0 opacity-80" aria-hidden />
          )}
          <span className="min-w-0 hidden md:inline">{label}</span>
        </div>
      </PillSlot>
    );
  }

  const detailParts: string[] = [];
  if (s.inflightMutations > 0) {
    detailParts.push(
      `${s.inflightMutations} mutation${s.inflightMutations === 1 ? "" : "s"}`,
    );
  }
  if (s.inflightActions > 0) {
    detailParts.push(
      `${s.inflightActions} action${s.inflightActions === 1 ? "" : "s"}`,
    );
  }
  if (s.hasInflightRequests && detailParts.length === 0) {
    detailParts.push("sync");
  }
  const titleBusy =
    detailParts.length > 0
      ? `In flight: ${detailParts.join(", ")}.`
      : "Request in progress on the live channel…";
  const titleIdle =
    "WebSocket connected — list and edits sync in real time.";

  if (
    settings.liveStatusPill === "minimal" &&
    phase === "connected" &&
    !hasPendingInvocations
  ) {
    return (
      <PillSlot>
        <div
          className={cn(
            pillShell,
            "invisible pointer-events-none border-transparent bg-transparent",
          )}
          aria-hidden
          data-hub-state="live"
          data-hub-activity="idle"
        >
          <span className="h-2.5 w-2.5 shrink-0" aria-hidden />
          <span className="min-w-0 hidden md:inline">Live</span>
        </div>
      </PillSlot>
    );
  }

  const busyText = hasPendingInvocations
    ? `${livePhaseLabel(phase)} · activity`
    : livePhaseLabel(phase);

  return (
    <PillSlot>
      <div
        data-hub-state="live"
        data-hub-activity={hasPendingInvocations ? "busy" : "idle"}
        className={cn(
          pillShell,
          hasPendingInvocations
            ? "border-amber-200/90 bg-amber-50/90 text-amber-900 dark:border-amber-800/60 dark:bg-amber-950/50 dark:text-amber-100"
            : "border-emerald-200/80 bg-emerald-50 text-emerald-800 dark:border-emerald-800/50 dark:bg-emerald-950/40 dark:text-emerald-200",
          !motionReady && "transition-none",
        )}
        title={hasPendingInvocations ? titleBusy : titleIdle}
        aria-label={busyText}
      >
        {hasPendingInvocations ? (
          <Loader2
            className="h-2.5 w-2.5 shrink-0 animate-spin"
            aria-hidden
          />
        ) : (
          <span className="relative flex h-2 w-2 shrink-0" aria-hidden>
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
          </span>
        )}
        <span className="min-w-0 hidden md:inline">{busyText}</span>
      </div>
    </PillSlot>
  );
}
