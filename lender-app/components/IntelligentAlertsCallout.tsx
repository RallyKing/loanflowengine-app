"use client";

import { AlertTriangle, Info } from "lucide-react";
import { cn } from "@/lib/cn";
import type { IntelligentAlert } from "@/lib/intelligentAlerts";

type Props = {
  alerts: readonly IntelligentAlert[];
  /** Cap visible rows to stay subtle; remainder summarized. */
  maxVisible?: number;
  className?: string;
};

export function IntelligentAlertsCallout({
  alerts,
  maxVisible = 3,
  className,
}: Props) {
  if (!alerts.length) return null;
  const shown = alerts.slice(0, maxVisible);
  const extra = alerts.length - shown.length;

  return (
    <div
      role="status"
      className={cn(
        "rounded-lg border border-amber-200/70 bg-amber-50/40 px-3 py-2 text-xs dark:border-amber-900/50 dark:bg-amber-950/25",
        className,
      )}
    >
      <ul className="space-y-1.5">
        {shown.map((a) => (
          <li key={a.id} className="flex gap-2">
            {a.severity === "warning" ? (
              <AlertTriangle
                className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-700 dark:text-amber-400"
                aria-hidden
              />
            ) : (
              <Info
                className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground"
                aria-hidden
              />
            )}
            <div className="min-w-0 leading-snug">
              <span className="font-medium text-foreground">{a.message}</span>
              {a.detail ? (
                <span className="mt-0.5 block text-[11px] text-muted-foreground">
                  {a.detail}
                </span>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
      {extra > 0 ? (
        <p className="mt-1.5 text-[11px] text-muted-foreground">
          +{extra} more note{extra === 1 ? "" : "s"} in this section
        </p>
      ) : null}
    </div>
  );
}
