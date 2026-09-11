"use client";

import { useCallback, useEffect, useState } from "react";
import { useMutation } from "convex/react";
import { TimerReset } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { cn } from "@/lib/cn";

type Props = {
  fileId: Id<"pipeline">;
  /** Raw pipeline flag; unset means ON. */
  enabled: boolean | undefined;
  preferencesAccountId?: string;
  readOnly?: boolean;
  className?: string;
};

/**
 * Per-deal toggle for the 15-minute client-upload auto-review package.
 * Requires the org master switch as well. Immediate upload alerts stay on.
 */
export function PipelineClientUploadAutoReviewControl({
  fileId,
  enabled,
  preferencesAccountId,
  readOnly = false,
  className,
}: Props) {
  const setEnabled = useMutation(api.pipeline.setClientUploadAutoReviewEnabled);
  const effective = enabled !== false;
  const [local, setLocal] = useState(effective);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLocal(enabled !== false);
  }, [enabled]);

  const onToggle = useCallback(
    async (next: boolean) => {
      if (readOnly) return;
      setBusy(true);
      setError(null);
      setLocal(next);
      try {
        await setEnabled({
          id: fileId,
          enabled: next,
          ...(preferencesAccountId
            ? { preferencesAccountId }
            : {}),
        });
      } catch (caught) {
        setLocal(!next);
        setError(
          caught instanceof Error ? caught.message : "Could not save setting",
        );
      } finally {
        setBusy(false);
      }
    },
    [fileId, preferencesAccountId, readOnly, setEnabled],
  );

  return (
    <div
      className={cn(
        "rounded-lg border border-border/70 bg-muted/5 px-3 py-2.5",
        className,
      )}
      data-testid="pipeline-client-upload-auto-review-control"
    >
      <div className="flex items-start gap-2">
        <TimerReset
          className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground"
          aria-hidden
        />
        <label className="flex min-w-0 flex-1 cursor-pointer items-start gap-2">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={local}
            disabled={readOnly || busy}
            onChange={(e) => void onToggle(e.target.checked)}
            data-testid="pipeline-client-upload-auto-review-toggle"
          />
          <span className="min-w-0">
            <span className="block text-sm font-medium text-foreground">
              Auto client-upload review (15 min)
            </span>
            <span className="mt-0.5 block text-xs text-muted-foreground">
              After the last client upload on this deal, prepare a gap report and
              draft follow-ups for broker approval. Per-upload Alerts still fire
              immediately. Account master switch must also be on.
            </span>
          </span>
        </label>
      </div>
      {error ? (
        <p className="mt-1 text-xs text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
