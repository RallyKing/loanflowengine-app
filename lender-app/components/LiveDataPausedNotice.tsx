"use client";

import Link from "next/link";
import { WifiOff } from "lucide-react";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/Button";
import { settingsHref } from "@/lib/settingsRegistry";

const SCOPE_TEXT: Record<
  "scenario" | "browse" | "discover" | "add" | "upload",
  string
> = {
  scenario:
    "Match results and counts won’t refresh until the connection is restored; you may be seeing a cached snapshot.",
  browse:
    "The lender list and filter stats won’t refresh until the connection is restored; you may be seeing a cached snapshot.",
  discover:
    "The discovery queue and run history won’t refresh until the connection is restored; you may be seeing a cached snapshot.",
  add:
    "Saving to the database requires a live channel. You can still fill the form; Save stays disabled until the connection is back.",
  upload:
    "Sending rows to the server requires a live channel. You can still choose a file; Upload stays disabled until the connection is back.",
};

export type LiveDataPausedScope = keyof typeof SCOPE_TEXT;

type Props = {
  scope: LiveDataPausedScope;
  className?: string;
  /** From the parent’s `useLiveConnection()` so this component does not open a second subscription. */
  canUseHub: boolean;
  browserOnline: boolean;
};

/**
 * In-page copy when the **WebSocket** is not live but the browser still
 * reports online. If the browser is offline, the global `ConvexConnectionStatus`
 * bar is the single transport message — this notice is skipped.
 *
 * **SignalR-style:** one logical subscription per surface; pass hub flags from
 * a parent that already calls `useLiveConnection()`.
 *
 * When visible: `data-hub-stale="true"`, `data-hub-scope` = scenario | browse | …
 * (for E2E: page may show stale data while the channel reconnects).
 */
export function LiveDataPausedNotice({ scope, className, canUseHub, browserOnline }: Props) {
  if (canUseHub) return null;
  if (!browserOnline) return null;
  return (
    <div
      data-hub-stale="true"
      data-hub-scope={scope}
      role="status"
      aria-live="polite"
      className={cn(
        "flex items-start gap-2 rounded-md border border-orange-200/80 bg-orange-50/80 px-3 py-2 text-xs text-orange-900 dark:border-orange-800/50 dark:bg-orange-950/40 dark:text-orange-100",
        className
      )}
    >
      <WifiOff className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="m-0">
          Live data channel is down. {SCOPE_TEXT[scope]}
        </p>
        <p className="mt-1.5 flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 border-orange-300/80 bg-white/60 text-[11px] text-orange-950 hover:bg-white dark:border-orange-700/60 dark:bg-orange-900/30 dark:text-orange-50"
            onClick={() => {
              if (typeof window !== "undefined") window.location.reload();
            }}
          >
            Refresh to connect live data
          </Button>
          <Link
            href={settingsHref("data")}
            className="text-[11px] font-medium text-orange-900 underline-offset-2 hover:underline dark:text-orange-100"
          >
            Data and connectivity settings
          </Link>
        </p>
      </div>
    </div>
  );
}
