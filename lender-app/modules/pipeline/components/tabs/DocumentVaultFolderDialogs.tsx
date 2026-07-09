"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { Folder } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { OverlayShell } from "@/components/ui/OverlayShell";
import { cn } from "@/lib/cn";
import {
  folderDisplayPath,
  type DocumentFolderRow,
} from "@/lib/library/documentVaultFolders";

type FolderNameDialogProps = {
  open: boolean;
  title: string;
  initialName?: string;
  confirmLabel: string;
  onClose: () => void;
  onSubmit: (name: string) => Promise<void>;
};

export function FolderNameDialog({
  open,
  title,
  initialName = "",
  confirmLabel,
  onClose,
  onSubmit,
}: FolderNameDialogProps) {
  const [name, setName] = useState(initialName);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) setName(initialName);
  }, [open, initialName]);

  return (
    <OverlayShell
      open={open}
      onClose={onClose}
      aria-label={title}
      panelClassName="w-full max-w-md p-5"
    >
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      <label className="mt-4 flex flex-col gap-1 text-xs">
        <span className="font-medium text-muted-foreground">Folder name</span>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Tax Returns"
          className="h-10"
          autoFocus
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void (async () => {
                const trimmed = name.trim();
                if (!trimmed) return;
                setBusy(true);
                try {
                  await onSubmit(trimmed);
                  setName("");
                  onClose();
                } finally {
                  setBusy(false);
                }
              })();
            }
          }}
        />
      </label>
      <div className="mt-5 flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onClose}>
          Cancel
        </Button>
        <Button
          type="button"
          size="sm"
          disabled={busy || !name.trim()}
          onClick={() => {
            void (async () => {
              const trimmed = name.trim();
              if (!trimmed) return;
              setBusy(true);
              try {
                await onSubmit(trimmed);
                setName("");
                onClose();
              } finally {
                setBusy(false);
              }
            })();
          }}
        >
          {busy ? "Saving…" : confirmLabel}
        </Button>
      </div>
    </OverlayShell>
  );
}

export type MoveToFolderDialogProps = {
  open: boolean;
  onClose: () => void;
  folders: DocumentFolderRow[];
  currentFolderId: Id<"documentFolders"> | null | undefined;
  onSelect: (folderId: Id<"documentFolders"> | null) => Promise<void>;
  documentTitle?: string;
  rootLabel?: string;
};

export function MoveToFolderDialog({
  open,
  onClose,
  folders,
  currentFolderId,
  onSelect,
  documentTitle,
  rootLabel = "Root",
}: MoveToFolderDialogProps) {
  const [busy, setBusy] = useState(false);

  const options = useMemo(() => {
    return [...folders].sort((a, b) =>
      folderDisplayPath(folders, a._id).localeCompare(
        folderDisplayPath(folders, b._id),
        undefined,
        { sensitivity: "base" },
      ),
    );
  }, [folders]);

  return (
    <OverlayShell
      open={open}
      onClose={onClose}
      aria-label="Move to folder"
      panelClassName="w-full max-w-md p-5"
    >
      <h3 className="text-sm font-semibold text-foreground">Move to folder</h3>
      {documentTitle ? (
        <p className="mt-1 text-xs text-muted-foreground">
          Choose a destination for{" "}
          <span className="font-medium text-foreground">{documentTitle}</span>.
        </p>
      ) : null}
      <ul className="mt-4 max-h-64 space-y-1 overflow-y-auto" role="listbox">
        <li>
          <button
            type="button"
            role="option"
            aria-selected={(currentFolderId ?? null) === null}
            disabled={busy || (currentFolderId ?? null) === null}
            className={cn(
              "flex w-full min-h-10 items-center gap-2 rounded-dlc-sm px-3 py-2 text-left text-sm",
              "hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none",
              (currentFolderId ?? null) === null && "opacity-50",
            )}
            onClick={() => {
              void (async () => {
                setBusy(true);
                try {
                  await onSelect(null);
                  onClose();
                } finally {
                  setBusy(false);
                }
              })();
            }}
          >
            <Folder className="h-4 w-4 shrink-0 text-amber-600" aria-hidden />
            {rootLabel}
          </button>
        </li>
        {options.map((folder) => {
          const path = folderDisplayPath(folders, folder._id);
          const isCurrent = currentFolderId === folder._id;
          return (
            <li key={folder._id}>
              <button
                type="button"
                role="option"
                aria-selected={isCurrent}
                disabled={busy || isCurrent}
                className={cn(
                  "flex w-full min-h-10 items-center gap-2 rounded-dlc-sm px-3 py-2 text-left text-sm",
                  "hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none",
                  isCurrent && "opacity-50",
                )}
                onClick={() => {
                  void (async () => {
                    setBusy(true);
                    try {
                      await onSelect(folder._id);
                      onClose();
                    } finally {
                      setBusy(false);
                    }
                  })();
                }}
              >
                <Folder className="h-4 w-4 shrink-0 text-amber-600" aria-hidden />
                <span className="min-w-0 truncate">{path}</span>
              </button>
            </li>
          );
        })}
      </ul>
      <div className="mt-4 flex justify-end">
        <Button type="button" variant="ghost" size="sm" onClick={onClose}>
          Cancel
        </Button>
      </div>
    </OverlayShell>
  );
}

export function useDocumentVaultFolders(
  pipelineFileId: Id<"pipeline"> | null,
  memberUserKey?: string,
) {
  return useQuery(
    api.documentFolders.listFoldersByPipeline,
    pipelineFileId
      ? memberUserKey
        ? { pipelineFileId, memberUserKey }
        : { pipelineFileId }
      : "skip",
  );
}
