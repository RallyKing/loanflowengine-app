"use client";

import { useCallback, useMemo, useState } from "react";
import { useQuery } from "convex/react";
import {
  ChevronDown,
  ChevronRight,
  FileText,
  Folder,
  FolderOpen,
  Upload,
} from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { cn } from "@/lib/cn";
import {
  buildFolderTree,
  type DocumentFolderRow,
  type FolderTreeNode,
} from "@/lib/library/documentVaultFolders";
import {
  countFolderItems,
  formatFolderItemBadge,
  type VaultTreeDocumentRef,
} from "@/lib/library/vaultItemCounts";

export type ClientPortalFolderUploadTreeProps = {
  bundleToken: string;
  fileTaskId: Id<"documentVaultFileTasks">;
  disabled?: boolean;
  busy?: boolean;
  busyLabel?: string | null;
  onUpload: (
    files: File[],
    folderId: Id<"documentFolders"> | null,
  ) => Promise<void>;
};

type PortalFolderRow = {
  _id: Id<"documentFolders">;
  name: string;
  parentFolderId?: Id<"documentFolders">;
  fileTaskId?: Id<"documentVaultFileTasks">;
  sortOrder?: number;
};

type PortalDocumentRow = {
  documentId: Id<"libraryDocuments">;
  title: string;
  fileName?: string;
  folderId?: Id<"documentFolders">;
};

function FolderDropzone({
  folderId,
  folderName,
  disabled,
  busy,
  busyLabel,
  onFiles,
  compact = false,
}: {
  folderId: Id<"documentFolders"> | null;
  folderName: string;
  disabled?: boolean;
  busy?: boolean;
  busyLabel?: string | null;
  onFiles: (files: File[], folderId: Id<"documentFolders"> | null) => void;
  compact?: boolean;
}) {
  const [dragOver, setDragOver] = useState(false);
  const [inputEl, setInputEl] = useState<HTMLInputElement | null>(null);
  const [cameraEl, setCameraEl] = useState<HTMLInputElement | null>(null);

  const handleFiles = (files: FileList | File[]) => {
    const list = Array.from(files).filter((f) => f.size > 0);
    if (list.length === 0 || disabled || busy) return;
    onFiles(list, folderId);
  };

  const dropzoneLabel = busy
    ? busyLabel?.trim() || "Uploading…"
    : `Drop files into ${folderName}`;

  return (
    <div
      className={cn(
        "rounded-dlc-md border-2 border-dashed transition-colors duration-dlc-standard ease-dlc-standard",
        compact ? "px-2 py-2" : "px-3 py-4",
        dragOver
          ? "border-emerald-600 bg-emerald-50/80"
          : "border-neutral-200 bg-neutral-50/40 hover:border-emerald-500/50",
        (disabled || busy) && "pointer-events-none opacity-60",
      )}
      data-testid={
        folderId
          ? `client-portal-folder-dropzone-${folderId}`
          : "client-portal-root-dropzone"
      }
      onDragOver={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setDragOver(false);
        handleFiles(e.dataTransfer.files);
      }}
      onClick={() => inputEl?.click()}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          inputEl?.click();
        }
      }}
    >
      <input
        ref={setInputEl}
        type="file"
        className="sr-only"
        multiple
        accept="image/*,application/pdf,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt"
        disabled={disabled || busy}
        onChange={(e) => {
          if (e.target.files) handleFiles(e.target.files);
          e.target.value = "";
        }}
      />
      <input
        ref={setCameraEl}
        type="file"
        className="sr-only"
        accept="image/*"
        capture="environment"
        disabled={disabled || busy}
        onChange={(e) => {
          if (e.target.files) handleFiles(e.target.files);
          e.target.value = "";
        }}
      />
      <div className="flex flex-wrap items-center gap-2 text-center sm:text-left">
        <Upload
          className={cn(
            "shrink-0 text-emerald-700",
            compact ? "h-3.5 w-3.5" : "h-4 w-4",
          )}
          aria-hidden
        />
        <p
          className={cn(
            "min-w-0 flex-1 font-medium text-neutral-800",
            compact ? "text-[11px]" : "text-xs",
          )}
        >
          {dropzoneLabel}
        </p>
        {!busy ? (
          <button
            type="button"
            className={cn(
              "shrink-0 rounded-dlc-sm border border-emerald-200 bg-white px-2 py-0.5 font-medium text-emerald-800 hover:bg-emerald-50",
              compact ? "text-[10px]" : "text-[11px]",
            )}
            onClick={(e) => {
              e.stopPropagation();
              cameraEl?.click();
            }}
          >
            Take photo
          </button>
        ) : null}
      </div>
      {!busy ? (
        <p
          className={cn(
            "mt-1 text-neutral-500",
            compact ? "text-[10px]" : "text-[11px]",
          )}
        >
          Select multiple files at once · max 25 MB each
        </p>
      ) : null}
    </div>
  );
}

function FolderUploadNode({
  node,
  depth,
  folders,
  documents,
  expanded,
  onToggle,
  disabled,
  busy,
  busyLabel,
  onUpload,
}: {
  node: FolderTreeNode;
  depth: number;
  folders: PortalFolderRow[];
  documents: PortalDocumentRow[];
  expanded: Set<string>;
  onToggle: (id: string) => void;
  disabled?: boolean;
  busy?: boolean;
  busyLabel?: string | null;
  onUpload: (
    files: File[],
    folderId: Id<"documentFolders"> | null,
  ) => void;
}) {
  const folderId = node.folder._id;
  const isOpen = expanded.has(String(folderId));
  const docRefs: VaultTreeDocumentRef[] = documents.map((d) => ({
    _id: d.documentId,
    folderId: d.folderId,
  }));
  const badge = formatFolderItemBadge(
    countFolderItems(folderId, folders as DocumentFolderRow[], docRefs),
  );
  const folderDocs = documents.filter(
    (d) => d.folderId && String(d.folderId) === String(folderId),
  );

  return (
    <li className="min-w-0" data-testid={`client-portal-folder-node-${folderId}`}>
      <div
        className="flex items-center gap-1.5 rounded-dlc-sm py-1"
        style={{ paddingLeft: depth * 12 }}
      >
        <button
          type="button"
          className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-dlc-sm text-muted-foreground hover:bg-muted/40"
          aria-expanded={isOpen}
          onClick={() => onToggle(String(folderId))}
        >
          {isOpen ? (
            <ChevronDown className="h-3.5 w-3.5" aria-hidden />
          ) : (
            <ChevronRight className="h-3.5 w-3.5" aria-hidden />
          )}
        </button>
        {isOpen ? (
          <FolderOpen className="h-3.5 w-3.5 shrink-0 text-amber-600" aria-hidden />
        ) : (
          <Folder className="h-3.5 w-3.5 shrink-0 text-amber-600" aria-hidden />
        )}
        <span className="min-w-0 flex-1 truncate text-xs font-medium text-foreground">
          {node.folder.name}
        </span>
        <span
          className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground"
          data-testid={`client-portal-folder-badge-${folderId}`}
        >
          {badge}
        </span>
      </div>

      {isOpen ? (
        <div className="space-y-2 pb-2" style={{ paddingLeft: depth * 12 + 24 }}>
          <FolderDropzone
            folderId={folderId}
            folderName={node.folder.name}
            disabled={disabled}
            busy={busy}
            busyLabel={busyLabel}
            compact
            onFiles={onUpload}
          />
          {folderDocs.length > 0 ? (
            <ul className="space-y-1">
              {folderDocs.map((doc) => (
                <li
                  key={String(doc.documentId)}
                  className="flex items-center gap-1.5 text-[11px] text-muted-foreground"
                  data-testid={`client-portal-uploaded-doc-${doc.documentId}`}
                >
                  <FileText className="h-3 w-3 shrink-0" aria-hidden />
                  <span className="truncate">{doc.fileName ?? doc.title}</span>
                </li>
              ))}
            </ul>
          ) : null}
          {node.children.length > 0 ? (
            <ul className="space-y-1">
              {node.children.map((child) => (
                <FolderUploadNode
                  key={String(child.folder._id)}
                  node={child}
                  depth={0}
                  folders={folders}
                  documents={documents}
                  expanded={expanded}
                  onToggle={onToggle}
                  disabled={disabled}
                  busy={busy}
                  busyLabel={busyLabel}
                  onUpload={onUpload}
                />
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

export function ClientPortalFolderUploadTree({
  bundleToken,
  fileTaskId,
  disabled,
  busy,
  busyLabel,
  onUpload,
}: ClientPortalFolderUploadTreeProps) {
  const treeData = useQuery(api.documentVaultClientBundlePortal.getBundleTaskUploadTree, {
    bundleToken,
    fileTaskId,
  });

  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());

  const toggleFolder = useCallback((id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const folders = useMemo(
    () => (treeData?.status === "ok" ? treeData.folders : []),
    [treeData],
  );
  const documents = useMemo(
    () => (treeData?.status === "ok" ? treeData.documents : []),
    [treeData],
  );

  const folderTree = useMemo(
    () =>
      buildFolderTree(
        folders as DocumentFolderRow[],
        null,
        undefined,
        fileTaskId,
      ),
    [folders, fileTaskId],
  );

  const rootDocs = useMemo(
    () => documents.filter((d) => !d.folderId),
    [documents],
  );

  const handleUpload = useCallback(
    (files: File[], folderId: Id<"documentFolders"> | null) => {
      void onUpload(files, folderId);
    },
    [onUpload],
  );

  if (treeData === undefined) {
    return (
      <p className="text-xs text-muted-foreground" data-testid="client-portal-upload-tree-loading">
        Loading folder structure…
      </p>
    );
  }

  if (treeData.status !== "ok") {
    return (
      <p className="text-xs text-red-700" role="alert">
        Unable to load upload folders.
      </p>
    );
  }

  if (folders.length === 0) {
    return (
      <div data-testid="client-portal-upload-tree-flat">
        <FolderDropzone
          folderId={null}
          folderName="this request"
          disabled={disabled}
          busy={busy}
          busyLabel={busyLabel}
          onFiles={handleUpload}
        />
        {rootDocs.length > 0 ? (
          <ul className="mt-3 space-y-1">
            {rootDocs.map((doc) => (
              <li
                key={String(doc.documentId)}
                className="flex items-center gap-1.5 text-[11px] text-muted-foreground"
              >
                <FileText className="h-3 w-3" aria-hidden />
                <span className="truncate">{doc.fileName ?? doc.title}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-3" data-testid="client-portal-upload-tree">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        Upload into folders
      </p>
      <ul className="space-y-1 rounded-dlc-md border border-border/60 bg-muted/5 p-2">
        {folderTree.map((node) => (
          <FolderUploadNode
            key={String(node.folder._id)}
            node={node}
            depth={0}
            folders={folders}
            documents={documents}
            expanded={expanded}
            onToggle={toggleFolder}
            disabled={disabled}
            busy={busy}
            busyLabel={busyLabel}
            onUpload={handleUpload}
          />
        ))}
      </ul>
      <div>
        <p className="mb-1.5 text-[10px] font-medium text-muted-foreground">
          Or upload to task root
        </p>
        <FolderDropzone
          folderId={null}
          folderName="task root"
          disabled={disabled}
          busy={busy}
          busyLabel={busyLabel}
          compact
          onFiles={handleUpload}
        />
        {rootDocs.length > 0 ? (
          <ul className="mt-2 space-y-1">
            {rootDocs.map((doc) => (
              <li
                key={String(doc.documentId)}
                className="flex items-center gap-1.5 text-[11px] text-muted-foreground"
              >
                <FileText className="h-3 w-3" aria-hidden />
                <span className="truncate">{doc.fileName ?? doc.title}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );
}
