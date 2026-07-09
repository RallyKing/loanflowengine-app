"use client";

import { X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useOfflineSync } from "@/lib/offline/OfflineSyncContext";
import { useLiveConnection } from "@/lib/useLiveConnection";
import { cn } from "@/lib/cn";

/**
 * Shows pending offline mutations and conflict resolution copy (Convex reconnects
 * automatically; this banner explains what happened).
 */
export function OfflineSyncBanner() {
  const { phase, canUseHub, browserOnline } = useLiveConnection();
  const { pendingCount, conflictNotice, clearConflictNotice } =
    useOfflineSync();

  if (conflictNotice) {
    return (
      <div
        role="alert"
        className="flex items-start justify-center gap-2 border-b border-amber-200 bg-amber-50 px-4 py-2 text-center text-xs text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100"
      >
        <span className="max-w-2xl flex-1">{conflictNotice}</span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 shrink-0 px-2 text-amber-900 dark:text-amber-50"
          onClick={clearConflictNotice}
          aria-label="Dismiss"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    );
  }

  if (pendingCount > 0 && (!canUseHub || phase === "reconnecting")) {
    return (
      <div
        role="status"
        className={cn(
          "border-b px-4 py-1.5 text-center text-xs",
          browserOnline
            ? "border-sky-200 bg-sky-50 text-sky-950 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-100"
            : "border-muted-foreground/25 bg-muted text-foreground",
        )}
      >
        {pendingCount} offline change{pendingCount === 1 ? "" : "s"} queued
        {canUseHub ? " — syncing…" : " — will sync when you are back online."}
      </div>
    );
  }

  return null;
}
