"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { cn } from "@/lib/cn";
import { kindLabel } from "@/lib/pipelineFileActivityModel";
import { ChevronDown, History } from "lucide-react";
import { Button } from "@/components/ui/Button";
import {
  TrustErrorBlock,
  TrustListSkeleton,
} from "@/components/trust/TrustSurfaces";
import { formatTrustSafeError } from "@/lib/portalTrustErrors";

import { useUserPreferences } from "@/lib/userPreferencesContext";
import {
  pipelineWorkspaceCardBodyPadding,
  pipelineWorkspaceCardFrame,
  pipelineWorkspaceCardHeaderPadding,
  pipelineWorkspaceChevronTransition,
  pipelineWorkspaceCollapseGrid,
  pipelineWorkspaceCollapseClosed,
  pipelineWorkspaceCollapseInner,
  pipelineWorkspaceCollapseOpen,
  pipelineWorkspaceNestedChipClass,
} from "@/lib/pipelineWorkspaceCard";

function formatWhen(at: number): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(at));
  } catch {
    return new Date(at).toLocaleString();
  }
}

export function PipelineFileActivityPanel({
  fileId,
  embedded = false,
}: {
  fileId: Id<"pipeline">;
  /** When true, parent owns collapse chrome (CollapsibleBlock). */
  embedded?: boolean;
}) {
  const { accountId } = useUserPreferences();
  const memberUserKey = accountId.trim() || undefined;
  const [open, setOpen] = useState(embedded);
  const [busyRow, setBusyRow] = useState<Id<"pipelineFileActivity"> | null>(null);
  const [busyLast, setBusyLast] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const shouldLoad = embedded || open;
  const rows = useQuery(
    api.pipelineFileActivity.listForFile,
    shouldLoad
      ? {
          fileId,
          limit: 120,
          ...(memberUserKey ? { memberUserKey } : {}),
        }
      : "skip",
  );
  const undoActivity = useMutation(api.pipelineFileActivity.undoActivity);
  const undoMostRecent = useMutation(api.pipelineFileActivity.undoMostRecentForFile);

  const subtitle = useMemo(() => {
    if (!shouldLoad || rows === undefined) return null;
    if (rows.length === 0) return "No recorded changes yet.";
    return `${rows.length} event${rows.length === 1 ? "" : "s"} loaded (newest first).`;
  }, [shouldLoad, rows]);

  const hasUndoable = useMemo(() => {
    if (!rows?.length) return false;
    return rows.some(
      (r) =>
        r.undoSpec != null &&
        r.revertedAt == null &&
        r.kind !== "undo" &&
        r.kind !== "file_created" &&
        r.kind !== "deal_patch" &&
        r.kind !== "automation" &&
        r.kind !== "share_grant" &&
        r.kind !== "share_revoke" &&
        r.kind !== "share_update" &&
        r.kind !== "client_momentum",
    );
  }, [rows]);

  async function onUndoRow(activityId: Id<"pipelineFileActivity">) {
    setErr(null);
    setBusyRow(activityId);
    try {
      await undoActivity({ activityId });
    } catch (e) {
      const raw = e instanceof Error ? e.message : "Could not undo this change.";
      setErr(formatTrustSafeError(raw).detail ?? raw);
    } finally {
      setBusyRow(null);
    }
  }

  async function onUndoLast() {
    setErr(null);
    setBusyLast(true);
    try {
      await undoMostRecent({ fileId });
    } catch (e) {
      const raw = e instanceof Error ? e.message : "Could not undo the last change.";
      setErr(formatTrustSafeError(raw).detail ?? raw);
    } finally {
      setBusyLast(false);
    }
  }

  const activityBody = (
    <>
      {rows === undefined ? (
        <TrustListSkeleton rows={5} label="Loading file history" />
      ) : (
        <>
          <p className="mb-3 text-[11px] leading-snug text-muted-foreground">
            Recorded actions for compliance and operator traceability. Undo reverses
            the last eligible server-side write when policy allows — not a full
            version restore.
          </p>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            {subtitle ? (
              <p className="text-[11px] text-muted-foreground">{subtitle}</p>
            ) : (
              <span />
            )}
            {hasUndoable ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 text-[11px]"
                disabled={busyLast || busyRow !== null}
                onClick={() => void onUndoLast()}
              >
                {busyLast ? "Undoing…" : "Undo last change"}
              </Button>
            ) : null}
          </div>
          {err ? (
            <TrustErrorBlock
              title="Could not apply undo"
              description={err}
              className="mb-2 border-destructive/30 bg-destructive/[0.03] py-2.5"
            />
          ) : null}
          <ul
            data-nested-scroll
            className="max-h-72 touch-scroll-y space-y-2 overflow-y-auto overscroll-contain pr-1 text-xs"
          >
            {rows.map((r) => {
              const showUndo =
                r.undoSpec != null &&
                r.revertedAt == null &&
                r.kind !== "undo" &&
                r.kind !== "file_created" &&
                r.kind !== "deal_patch" &&
                r.kind !== "automation" &&
                r.kind !== "client_momentum";
              return (
                <li
                  key={r._id}
                  className={cn(
                    pipelineWorkspaceNestedChipClass,
                    "bg-background/80 px-2 py-1.5",
                  )}
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
                    <span className="font-medium text-foreground">{kindLabel(r.kind)}</span>
                    <div className="flex items-center gap-2">
                      {showUndo ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-6 px-2 text-[10px] text-muted-foreground hover:text-foreground"
                          disabled={busyRow !== null || busyLast}
                          onClick={() => void onUndoRow(r._id)}
                        >
                          {busyRow === r._id ? "…" : "Undo"}
                        </Button>
                      ) : null}
                      {r.revertedAt != null ? (
                        <span className="text-[10px] font-medium text-muted-foreground">
                          Reverted
                        </span>
                      ) : null}
                      <time
                        className="text-[11px] tabular-nums text-muted-foreground"
                        dateTime={new Date(r.at).toISOString()}
                      >
                        {formatWhen(r.at)}
                      </time>
                    </div>
                  </div>
                  {r.summary ? (
                    <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
                      {r.summary}
                    </p>
                  ) : null}
                  {r.blocksShown?.length || r.blocksHidden?.length ? (
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {r.blocksShown?.length ? (
                        <span className="mr-2">+ {r.blocksShown.join(", ")}</span>
                      ) : null}
                      {r.blocksHidden?.length ? (
                        <span>− {r.blocksHidden.join(", ")}</span>
                      ) : null}
                    </p>
                  ) : null}
                  {r.keys?.length ? (
                    <p
                      className={cn(
                        "mt-1 break-words font-mono text-[10px] text-muted-foreground/90",
                      )}
                    >
                      {r.keys.slice(0, 16).join(" · ")}
                      {r.keys.length > 16 ? ` · +${r.keys.length - 16}` : ""}
                    </p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </>
      )}
    </>
  );

  if (embedded) {
    return (
      <div data-testid="pipeline-settings-file-history-panel">{activityBody}</div>
    );
  }

  return (
    <div
      id="pipeline-ws-file-history"
      className={cn(
        pipelineWorkspaceCardFrame(),
        "w-full min-w-0 border border-border/60 bg-background",
        "max-sm:rounded-lg max-sm:shadow-none",
      )}
    >
      <Button
        type="button"
        variant="ghost"
        className={cn(
          "flex h-auto w-full items-center justify-between gap-2 text-left font-medium text-foreground transition-colors duration-200 ease-out hover:bg-muted/25",
          pipelineWorkspaceCardHeaderPadding,
        )}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <span className="flex items-center gap-2 text-sm">
          <History className="h-4 w-4 text-muted-foreground" aria-hidden />
          File history
        </span>
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 text-muted-foreground",
            pipelineWorkspaceChevronTransition,
            open && "rotate-180",
          )}
          aria-hidden
        />
      </Button>
      <div
        className={cn(
          pipelineWorkspaceCollapseGrid,
          open ? pipelineWorkspaceCollapseOpen : pipelineWorkspaceCollapseClosed,
        )}
        aria-hidden={!open}
      >
        <div className={pipelineWorkspaceCollapseInner}>
          <div
            className={cn(
              "border-t border-border/60",
              pipelineWorkspaceCardBodyPadding,
              !open && "pointer-events-none",
            )}
          >
            {activityBody}
          </div>
        </div>
      </div>
    </div>
  );
}
