"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Copy, FolderInput, Loader2 } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/Button";
import { OverlayShell } from "@/components/ui/OverlayShell";
import { cn } from "@/lib/cn";
import { showOperationalToast } from "@/lib/ui/operationalToast";

export type VaultMoveCopyEntity =
  | { kind: "document"; documentId: Id<"libraryDocuments">; label: string }
  | { kind: "folder"; folderId: Id<"documentFolders">; label: string }
  | {
      kind: "fileTask";
      fileTaskId: Id<"documentVaultFileTasks">;
      label: string;
    };

export type VaultMoveCopyToFileDialogProps = {
  open: boolean;
  onClose: () => void;
  sourcePipelineFileId: Id<"pipeline">;
  memberUserKey?: string;
  entity: VaultMoveCopyEntity | null;
};

const KIND_LABEL: Record<VaultMoveCopyEntity["kind"], string> = {
  document: "file",
  folder: "folder",
  fileTask: "task",
};

export function VaultMoveCopyToFileDialog({
  open,
  onClose,
  sourcePipelineFileId,
  memberUserKey,
  entity,
}: VaultMoveCopyToFileDialogProps) {
  const [targetId, setTargetId] = useState<Id<"pipeline"> | null>(null);
  const [mode, setMode] = useState<"move" | "copy">("move");
  const [busy, setBusy] = useState(false);

  const siblingQuery = useQuery(
    api.documentVaultCrossFile.listSiblingFiles,
    open
      ? memberUserKey
        ? { pipelineFileId: sourcePipelineFileId, memberUserKey }
        : { pipelineFileId: sourcePipelineFileId }
      : "skip",
  );

  const transfer = useMutation(api.documentVaultCrossFile.transferToSiblingFile);

  const siblings = siblingQuery?.siblings ?? [];

  const entityResetKey =
    entity == null
      ? ""
      : entity.kind === "document"
        ? `document:${entity.documentId}`
        : entity.kind === "folder"
          ? `folder:${entity.folderId}`
          : `fileTask:${entity.fileTaskId}`;

  useEffect(() => {
    if (!open) return;
    setTargetId(null);
    setMode("move");
    setBusy(false);
  }, [open, entityResetKey]);

  const entityArgs = useMemo(() => {
    if (!entity) return null;
    if (entity.kind === "document") {
      return { kind: "document" as const, documentId: entity.documentId };
    }
    if (entity.kind === "folder") {
      return { kind: "folder" as const, folderId: entity.folderId };
    }
    return { kind: "fileTask" as const, fileTaskId: entity.fileTaskId };
  }, [entity]);

  const canConfirm = Boolean(entityArgs && targetId && !busy);

  return (
    <OverlayShell
      open={open && entity != null}
      onClose={onClose}
      align="bottom-sheet"
      aria-label="Move or copy to another file"
      panelClassName="w-full max-w-md p-5"
      data-testid="vault-move-copy-to-file-dialog"
    >
      <h3 className="text-sm font-semibold text-foreground">
        Move / copy to file
      </h3>
      {entity ? (
        <p className="mt-1 text-xs text-muted-foreground">
          {mode === "move" ? "Move" : "Copy"}{" "}
          <span className="font-medium text-foreground">{entity.label}</span>{" "}
          ({KIND_LABEL[entity.kind]}) to another loan file you can edit.
        </p>
      ) : null}

      {siblingQuery === undefined ? (
        <div className="mt-6 flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          Loading destination files…
        </div>
      ) : siblings.length === 0 ? (
        <div className="mt-4 space-y-2 rounded-dlc-sm border border-border/60 bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
          <p className="font-medium text-foreground">No destination files yet</p>
          <p>
            Move / copy needs at least one other loan file in this organization
            that you can edit.
            {siblingQuery.projectId
              ? " Add another file to this project, or open another file in the org."
              : " Create or open another loan file, or associate this file with a project that has multiple loans."}
          </p>
        </div>
      ) : (
        <>
          <fieldset className="mt-4">
            <legend className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Action
            </legend>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <button
                type="button"
                className={cn(
                  "inline-flex min-h-10 items-center justify-center gap-1.5 rounded-dlc-sm border px-3 text-sm transition-colors duration-dlc-short ease-dlc-standard",
                  mode === "move"
                    ? "border-primary/40 bg-primary/10 text-foreground"
                    : "border-border/60 bg-dlc-surface text-muted-foreground hover:bg-muted/40",
                )}
                aria-pressed={mode === "move"}
                onClick={() => setMode("move")}
              >
                <FolderInput className="h-4 w-4" aria-hidden />
                Move
              </button>
              <button
                type="button"
                className={cn(
                  "inline-flex min-h-10 items-center justify-center gap-1.5 rounded-dlc-sm border px-3 text-sm transition-colors duration-dlc-short ease-dlc-standard",
                  mode === "copy"
                    ? "border-primary/40 bg-primary/10 text-foreground"
                    : "border-border/60 bg-dlc-surface text-muted-foreground hover:bg-muted/40",
                )}
                aria-pressed={mode === "copy"}
                onClick={() => setMode("copy")}
              >
                <Copy className="h-4 w-4" aria-hidden />
                Copy
              </button>
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground">
              {mode === "move"
                ? "Removes it from this file and places it on the target. Folders keep their structure."
                : "Keeps the original here and creates a copy on the target (documents share storage; no re-upload)."}
            </p>
          </fieldset>

          <fieldset className="mt-4">
            <legend className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Destination file
            </legend>
            <ul
              className="mt-2 max-h-[min(40dvh,280px)] space-y-1 overflow-y-auto overscroll-contain"
              role="listbox"
              aria-label="Destination loan files"
            >
              {siblings.map((file) => {
                const selected = targetId === file._id;
                return (
                  <li key={file._id}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={selected}
                      disabled={busy}
                      className={cn(
                        "flex w-full min-h-10 items-center gap-2 rounded-dlc-sm px-3 py-2 text-left text-sm",
                        "hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none",
                        selected && "bg-primary/10 ring-1 ring-primary/30",
                      )}
                      onClick={() => setTargetId(file._id)}
                    >
                      <span className="min-w-0 flex-1 truncate font-medium">
                        {file.fileName}
                      </span>
                      <span className="shrink-0 text-[10px] uppercase tracking-wide text-muted-foreground">
                        {file.sameProject ? "Project" : file.status}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </fieldset>
        </>
      )}

      <div className="mt-5 flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onClose}>
          Cancel
        </Button>
        <Button
          type="button"
          size="sm"
          disabled={!canConfirm || siblings.length === 0}
          data-testid="vault-move-copy-confirm"
          onClick={() => {
            if (!entityArgs || !targetId) return;
            void (async () => {
              setBusy(true);
              try {
                const result = await transfer({
                  sourcePipelineFileId,
                  targetPipelineFileId: targetId,
                  mode,
                  entity: entityArgs,
                  ...(memberUserKey ? { memberUserKey } : {}),
                });
                const verb = mode === "move" ? "Moved" : "Copied";
                const extra =
                  result.foldersTransferred > 0 ||
                  result.documentsTransferred > 1
                    ? ` (${result.foldersTransferred} folder${result.foldersTransferred === 1 ? "" : "s"}, ${result.documentsTransferred} file${result.documentsTransferred === 1 ? "" : "s"})`
                    : "";
                showOperationalToast({
                  title: `${verb} to destination file${extra}`,
                  variant: "success",
                });
                onClose();
              } catch (e) {
                showOperationalToast({
                  title:
                    e instanceof Error
                      ? e.message
                      : "Could not move or copy. Try again.",
                  variant: "destructive",
                });
              } finally {
                setBusy(false);
              }
            })();
          }}
        >
          {busy ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
              Working…
            </>
          ) : mode === "move" ? (
            "Move"
          ) : (
            "Copy"
          )}
        </Button>
      </div>
    </OverlayShell>
  );
}

/** Hook: whether the current vault file has ≥1 project sibling. */
export function useVaultSiblingFilesAvailable(
  pipelineFileId: Id<"pipeline"> | null | undefined,
  memberUserKey?: string,
): { ready: boolean; hasSiblings: boolean; siblingCount: number } {
  const data = useQuery(
    api.documentVaultCrossFile.listSiblingFiles,
    pipelineFileId
      ? memberUserKey
        ? { pipelineFileId, memberUserKey }
        : { pipelineFileId }
      : "skip",
  );
  if (!pipelineFileId || data === undefined) {
    return { ready: false, hasSiblings: false, siblingCount: 0 };
  }
  return {
    ready: true,
    hasSiblings: data.siblings.length > 0,
    siblingCount: data.siblings.length,
  };
}
