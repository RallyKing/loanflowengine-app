"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { History, Loader2, RotateCcw } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/Button";
import { OverlayShell } from "@/components/ui/OverlayShell";
import { clientPortalBlockLabel } from "@/lib/documentVaultClientBlocks";
import { showOperationalToast } from "@/lib/ui/operationalToast";

export type FileTaskBlockVersionHistoryProps = {
  pipelineFileId: Id<"pipeline">;
  fileTaskId: Id<"documentVaultFileTasks">;
  assignedBlocks: string[];
  memberUserKey?: string;
};

export function FileTaskBlockVersionHistory({
  pipelineFileId,
  fileTaskId,
  assignedBlocks,
  memberUserKey,
}: FileTaskBlockVersionHistoryProps) {
  const [open, setOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const restoreSnapshot = useMutation(api.pipelineBlockSnapshots.restoreSnapshot);

  const blocks = assignedBlocks.filter(Boolean);
  if (blocks.length === 0) return null;

  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="h-7 gap-1 px-2 text-[10px]"
        onClick={() => setOpen(true)}
      >
        <History className="h-3 w-3" aria-hidden />
        Version history
      </Button>

      {open ? (
        <OverlayShell
          open
          onClose={() => setOpen(false)}
          aria-label="Pipeline block version history"
          panelClassName="w-full max-w-md p-5"
        >
          <h3 className="text-sm font-semibold">Block version history</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Restore broker data if a client form submission overwrote pipeline
            blocks.
          </p>
          <div className="mt-4 max-h-[min(24rem,60dvh)] space-y-4 overflow-y-auto">
            {blocks.map((blockId) => (
              <BlockSnapshotList
                key={blockId}
                blockId={blockId}
                pipelineFileId={pipelineFileId}
                fileTaskId={fileTaskId}
                memberUserKey={memberUserKey}
                busyId={busyId}
                onRestore={async (snapshotId) => {
                  if (!memberUserKey) return;
                  setBusyId(snapshotId);
                  try {
                    await restoreSnapshot({ snapshotId, memberUserKey });
                    showOperationalToast({
                      title: "Block restored",
                      description: clientPortalBlockLabel(blockId),
                    });
                  } catch (e) {
                    showOperationalToast({
                      title: "Restore failed",
                      description: e instanceof Error ? e.message : String(e),
                      variant: "destructive",
                    });
                  } finally {
                    setBusyId(null);
                  }
                }}
              />
            ))}
          </div>
          <div className="mt-4 flex justify-end">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setOpen(false)}
            >
              Close
            </Button>
          </div>
        </OverlayShell>
      ) : null}
    </>
  );
}

function BlockSnapshotList({
  blockId,
  pipelineFileId,
  fileTaskId,
  memberUserKey,
  busyId,
  onRestore,
}: {
  blockId: string;
  pipelineFileId: Id<"pipeline">;
  fileTaskId: Id<"documentVaultFileTasks">;
  memberUserKey?: string;
  busyId: string | null;
  onRestore: (snapshotId: Id<"pipelineBlockSnapshots">) => Promise<void>;
}) {
  const snapshots = useQuery(
    api.pipelineBlockSnapshots.listForBlock,
    memberUserKey
      ? { pipelineFileId, blockId, fileTaskId, memberUserKey }
      : "skip",
  );

  return (
    <div className="rounded-dlc-md border border-border/60 p-3">
      <p className="text-xs font-medium text-foreground">
        {clientPortalBlockLabel(blockId)}
      </p>
      {snapshots === undefined ? (
        <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
          Loading…
        </div>
      ) : snapshots.length === 0 ? (
        <p className="mt-2 text-[11px] text-muted-foreground">
          No snapshots yet.
        </p>
      ) : (
        <ul className="mt-2 space-y-1.5">
          {snapshots.map((snap) => (
            <li
              key={snap._id}
              className="flex items-center justify-between gap-2 rounded-dlc-sm bg-muted/20 px-2 py-1.5"
            >
              <div className="min-w-0">
                <p className="truncate text-[11px] font-medium text-foreground">
                  {snap.label ?? snap.source}
                </p>
                <p className="text-[10px] text-muted-foreground">
                  {new Date(snap.createdAt).toLocaleString()}
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7 shrink-0 gap-1 px-2 text-[10px]"
                disabled={!memberUserKey || busyId === snap._id}
                onClick={() => void onRestore(snap._id)}
              >
                {busyId === snap._id ? (
                  <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
                ) : (
                  <RotateCcw className="h-3 w-3" aria-hidden />
                )}
                Restore
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
