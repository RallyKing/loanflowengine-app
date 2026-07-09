"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Loader2 } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/Button";
import { OverlayShell } from "@/components/ui/OverlayShell";
import { cn } from "@/lib/cn";

export type FolderDeleteStrategy = "move_to_parent" | "delete_contents";

export type FolderDeleteConfirmModalProps = {
  open: boolean;
  onClose: () => void;
  folderId: Id<"documentFolders">;
  memberUserKey?: string;
  onDeleted?: () => void;
  onError: (message: string) => void;
};

export function FolderDeleteConfirmModal({
  open,
  onClose,
  folderId,
  memberUserKey,
  onDeleted,
  onError,
}: FolderDeleteConfirmModalProps) {
  const preview = useQuery(
    api.documentFolders.getFolderDeletePreview,
    open && memberUserKey ? { folderId, memberUserKey } : "skip",
  );
  const deleteFolder = useMutation(api.documentFolders.deleteFolder);

  const [strategy, setStrategy] =
    useState<FolderDeleteStrategy>("move_to_parent");
  const [busy, setBusy] = useState(false);

  const hasContents =
    (preview?.subfolderCount ?? 0) > 0 || (preview?.documentCount ?? 0) > 0;

  const handleDelete = async () => {
    if (!memberUserKey) return;
    setBusy(true);
    try {
      await deleteFolder({
        folderId,
        strategy: hasContents ? strategy : "move_to_parent",
        memberUserKey,
      });
      onDeleted?.();
      onClose();
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <OverlayShell
      open={open}
      onClose={onClose}
      aria-label="Delete folder"
      data-testid="folder-delete-confirm-overlay"
      panelClassName="w-full max-w-md p-5"
    >
      <div data-testid="folder-delete-confirm-modal">
        <h3 className="text-sm font-semibold text-foreground">Delete folder</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          {preview === undefined ? (
            "Loading folder details…"
          ) : (
            <>
              You are deleting{" "}
              <span className="font-medium text-foreground">
                {preview.folderName}
              </span>
              {hasContents ? (
                <>
                  {" "}
                  containing {preview.subfolderCount} subfolder
                  {preview.subfolderCount === 1 ? "" : "s"} and{" "}
                  {preview.documentCount} document
                  {preview.documentCount === 1 ? "" : "s"}.
                </>
              ) : (
                ". This folder is empty."
              )}
            </>
          )}
        </p>

        {hasContents ? (
          <fieldset className="mt-4 space-y-2">
            <legend className="text-xs font-medium text-muted-foreground">
              Choose what happens to the contents
            </legend>
            <label
              className={cn(
                "flex cursor-pointer gap-2 rounded-dlc-md border px-3 py-2.5 text-sm",
                strategy === "move_to_parent"
                  ? "border-primary/50 bg-primary/5"
                  : "border-border/70",
              )}
            >
              <input
                type="radio"
                name="folder-delete-strategy"
                className="mt-0.5"
                checked={strategy === "move_to_parent"}
                onChange={() => setStrategy("move_to_parent")}
              />
              <span>
                <span className="font-medium text-foreground">
                  Move contents to parent & delete folder
                </span>
                <span className="mt-0.5 block text-xs text-muted-foreground">
                  Subfolders and documents move to{" "}
                  {preview?.isRootChild
                    ? "the vault root"
                    : preview?.parentFolderName ?? "the parent folder"}
                  . Recommended.
                </span>
              </span>
            </label>
            <label
              className={cn(
                "flex cursor-pointer gap-2 rounded-dlc-md border px-3 py-2.5 text-sm",
                strategy === "delete_contents"
                  ? "border-destructive/50 bg-destructive/5"
                  : "border-border/70",
              )}
            >
              <input
                type="radio"
                name="folder-delete-strategy"
                className="mt-0.5"
                checked={strategy === "delete_contents"}
                onChange={() => setStrategy("delete_contents")}
              />
              <span>
                <span className="font-medium text-destructive">
                  Delete folder and all contents
                </span>
                <span className="mt-0.5 block text-xs text-muted-foreground">
                  Removes this folder tree and unlinks all contained documents
                  from this deal (storage blobs stay if linked elsewhere).
                </span>
              </span>
            </label>
          </fieldset>
        ) : null}

        <div className="mt-5 flex justify-end gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="danger"
            size="sm"
            disabled={busy || preview === undefined}
            onClick={() => void handleDelete()}
            data-testid="folder-delete-confirm-submit"
          >
            {busy ? (
              <>
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden />
                Deleting…
              </>
            ) : (
              "Delete folder"
            )}
          </Button>
        </div>
      </div>
    </OverlayShell>
  );
}
