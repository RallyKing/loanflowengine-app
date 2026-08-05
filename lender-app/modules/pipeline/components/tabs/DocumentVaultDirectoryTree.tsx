"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  memo,
  type KeyboardEvent,
} from "react";
import { useMutation } from "convex/react";
import { useDroppable } from "@dnd-kit/core";
import { useSortable } from "@dnd-kit/sortable";
import {
  Check,
  ChevronDown,
  ChevronRight,
  ChevronsDownUp,
  ChevronsUpDown,
  FileText,
  Folder,
  FolderOpen,
  FolderPlus,
  GripVertical,
  Link2,
  MoreVertical,
  Pencil,
  Plus,
  Archive,
  ArchiveRestore,
  Copy,
  Download,
  Layers,
  Loader2,
  Trash2,
  Upload,
  UserPlus,
  X,
} from "lucide-react";
import { CSS } from "@dnd-kit/utilities";
import { DropdownMenu, DropdownMenuItem } from "@/components/ui/DropdownMenu";
import { FolderDeleteConfirmModal } from "@/components/library/FolderDeleteConfirmModal";
import type { FolderDragVisualState } from "@/lib/library/documentVaultFolderDragUi";
import { vaultFolderSortableId } from "@/lib/library/documentVaultDnD";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/Button";
import { OverlayShell } from "@/components/ui/OverlayShell";
import { cn } from "@/lib/cn";
import {
  buildFolderTree,
  type DocumentFolderRow,
  type FolderTreeNode,
} from "@/lib/library/documentVaultFolders";
import {
  collectFolderSubtreeIds,
  countFileTaskItems,
  countFolderItems,
  formatFolderItemBadge,
  formatTaskItemBadge,
  type VaultTreeDocumentRef,
} from "@/lib/library/vaultItemCounts";
import { useDocumentVaultState } from "@/lib/library/documentVaultState";
import { vaultFolderDropId } from "@/lib/library/documentVaultDnD";
import {
  isOsFileDragEvent,
  readOsFilesFromDragEvent,
} from "@/lib/library/documentVaultOsFileDrop";
import { FolderNameDialog } from "@/components/pipeline/tabs/DocumentVaultFolderDialogs";
import { DocumentVaultExplorerFileRow } from "@/components/library/DocumentVaultExplorerFileRow";
import { VaultRegistryAssignMicroAction } from "@/components/library/VaultRegistryAssignMicroAction";
import {
  FileTaskContainer,
  type DocumentVaultFileTaskRow,
} from "@/components/library/FileTaskContainer";
import { FileTaskRejectModal } from "@/components/library/FileTaskRejectModal";
import { FileTaskConfigModal } from "@/components/library/FileTaskConfigModal";
import { FileTaskExecutionModal } from "@/components/library/FileTaskExecutionModal";
import { FileTaskInlineBlockList } from "@/components/library/FileTaskInlineBlockList";
import {
  assignedBlockIdsOrdered,
  resolveTaskType,
} from "@/lib/documentVaultTaskTypes";
import type { LibraryDocumentListRow } from "@/components/library/LibraryDocumentsList";
import type { LibraryDocumentsProof } from "@/components/LibraryDocumentsPanel";

export type VaultTreeDocument = {
  _id: Id<"libraryDocuments">;
  title: string;
  folderId?: Id<"documentFolders">;
  fileTaskId?: Id<"documentVaultFileTasks">;
};

export type DocumentVaultExplorerFileHandlers = {
  highlightDocumentId: Id<"libraryDocuments"> | null;
  bulkSelectedIds: Set<string>;
  busyDoc: Id<"libraryDocuments"> | null;
  dragEnabled: boolean;
  proofForRow: (row: LibraryDocumentListRow) => LibraryDocumentsProof;
  onToggleBulkSelect: (id: Id<"libraryDocuments">) => void;
  onPreview: (
    documentId: Id<"libraryDocuments">,
    versionId: Id<"libraryDocumentVersions">,
    fileName: string,
    contentType?: string,
  ) => void;
  /** Float one document without floating the Document Vault block. */
  onOpenInWindow?: (
    documentId: Id<"libraryDocuments">,
    versionId: Id<"libraryDocumentVersions">,
    fileName: string,
    contentType?: string,
  ) => void;
  onToggleExpanded: (id: Id<"libraryDocuments">) => void;
  onMoveDoc: (row: LibraryDocumentListRow) => void;
  onMoveCopyToFile?: (row: LibraryDocumentListRow) => void;
  crossFileTransferEnabled?: boolean;
  onOpenProperties: (id: Id<"libraryDocuments">) => void;
  onSaveToContact: (row: LibraryDocumentListRow) => void;
  onAssignToRegistry: (row: LibraryDocumentListRow) => void;
  onDownload: (row: LibraryDocumentListRow) => void;
  onDownloadAsPdf: (row: LibraryDocumentListRow) => void;
  downloadingDocId: Id<"libraryDocuments"> | null;
  exportingPdfDocId: Id<"libraryDocuments"> | null;
  onRemoveLink: (
    documentId: Id<"libraryDocuments">,
    proof: LibraryDocumentsProof,
    isGlobalContactDoc: boolean,
    title: string,
  ) => void;
  onRejectDocument?: (
    documentId: Id<"libraryDocuments">,
    reason: string,
  ) => void;
  onToggleClientVisibility?: (row: LibraryDocumentListRow) => void;
};

export type DocumentVaultDirectoryTreeProps = {
  pipelineFileId: Id<"pipeline">;
  memberUserKey?: string;
  canMutate: boolean;
  folders: DocumentFolderRow[] | undefined;
  /** Full document rows embedded in the explorer tree. */
  documentRows?: LibraryDocumentListRow[];
  documents?: VaultTreeDocument[];
  fileRowHandlers?: DocumentVaultExplorerFileHandlers;
  rootLabel?: string;
  onImportFromContact?: () => void;
  onError: (message: string) => void;
  vaultSearchQuery?: string;
  dropEnabled?: boolean;
  osFileDropEnabled?: boolean;
  onOsFilesDropped?: (
    files: File[],
    parentFolderId: Id<"documentFolders"> | null,
  ) => void;
  className?: string;
  folderDragVisual?: FolderDragVisualState;
  /** Folders to expand while dragging (auto-expand on hover). */
  autoExpandFolderIds?: Id<"documentFolders">[];
  optimisticSiblingOrder?: Record<string, Id<"documentFolders">[]>;
  /** File Task requirement containers. */
  fileTasks?: DocumentVaultFileTaskRow[];
  optimisticFileTaskOrder?: Id<"documentVaultFileTasks">[];
  onAddFileTasks?: () => void;
  onOsFilesDroppedToTask?: (
    files: File[],
    fileTaskId: Id<"documentVaultFileTasks">,
  ) => void;
  organizationId?: Id<"organizations">;
  onApplyTemplates?: () => void;
  archivedFileTasks?: DocumentVaultFileTaskRow[];
  showArchived?: boolean;
  onToggleShowArchived?: () => void;
  /** Download every downloadable vault file as one ZIP. */
  onDownloadAll?: () => void;
  /** Download currently selected files as a ZIP (file rows only). */
  onDownloadSelected?: () => void;
  /** Download one folder and all nested files as a ZIP (structure preserved). */
  onDownloadFolder?: (
    folderId: Id<"documentFolders">,
    folderName: string,
  ) => void;
  downloadingFolderId?: Id<"documentFolders"> | null;
  downloadBusy?: boolean;
  bulkSelectedCount?: number;
  downloadableCount?: number;
  /**
   * When true, folder / task / file rows offer Move / copy to another
   * loan file (dialog shows empty state when no targets exist).
   */
  crossFileTransferEnabled?: boolean;
  onMoveCopyFolder?: (
    folderId: Id<"documentFolders">,
    folderName: string,
  ) => void;
  onMoveCopyFileTask?: (
    fileTaskId: Id<"documentVaultFileTasks">,
    title: string,
  ) => void;
  /**
   * Override row-open (defaults to vault `selectDocument` / modal).
   * Pipeline file workspace uses this to open a floating document window.
   */
  onOpenDocument?: (id: Id<"libraryDocuments"> | null) => void;
};

type EditingType = "root" | "folder" | "document";

type EditingState = {
  id: string;
  type: EditingType;
  value: string;
  documentId?: Id<"libraryDocuments">;
  folderId?: Id<"documentFolders">;
};

const ROOT_KEY = "__root__";
const FOLDER_DEPTH_PX = 14;

function treeIndentPx(depth: number, compact = false): number {
  return depth * FOLDER_DEPTH_PX + (compact ? 6 : 10);
}

function taskRootKey(fileTaskId: Id<"documentVaultFileTasks">): string {
  return `task:${fileTaskId}`;
}
const ROW_H = "h-7";

type TreeDoc = VaultTreeDocument | LibraryDocumentListRow;

function filterFolderTree(
  nodes: FolderTreeNode[],
  query: string,
  docsByFolderKey: Map<string, TreeDoc[]>,
): FolderTreeNode[] {
  const q = query.trim().toLowerCase();
  if (!q) return nodes;

  const filtered: FolderTreeNode[] = [];
  for (const node of nodes) {
    const childFiltered = filterFolderTree(
      node.children,
      query,
      docsByFolderKey,
    );
    const folderMatches = node.folder.name.toLowerCase().includes(q);
    const hasDocs =
      (docsByFolderKey.get(String(node.folder._id)) ?? []).length > 0;
    if (folderMatches || childFiltered.length > 0 || hasDocs) {
      filtered.push({ ...node, children: childFiltered });
    }
  }
  return filtered;
}

function FolderDropZone({
  folderId,
  enabled,
  isNestTarget,
  osFileDropEnabled = false,
  onOsFilesDrop,
  className,
  style,
  children,
}: {
  folderId: Id<"documentFolders"> | null;
  enabled: boolean;
  isNestTarget?: boolean;
  osFileDropEnabled?: boolean;
  onOsFilesDrop?: (files: File[]) => void;
  className?: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
}) {
  const [osDragOver, setOsDragOver] = useState(false);
  const { setNodeRef, isOver } = useDroppable({
    id: vaultFolderDropId(folderId),
    disabled: !enabled,
  });

  const handleOsDragOver = useCallback(
    (e: React.DragEvent) => {
      if (!osFileDropEnabled || !isOsFileDragEvent(e)) return;
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = "copy";
      setOsDragOver(true);
    },
    [osFileDropEnabled],
  );

  const handleOsDragLeave = useCallback(
    (e: React.DragEvent) => {
      if (!osFileDropEnabled || !isOsFileDragEvent(e)) return;
      const related = e.relatedTarget as Node | null;
      if (!e.currentTarget.contains(related)) {
        setOsDragOver(false);
      }
    },
    [osFileDropEnabled],
  );

  const handleOsDrop = useCallback(
    (e: React.DragEvent) => {
      if (!osFileDropEnabled || !isOsFileDragEvent(e)) return;
      e.preventDefault();
      e.stopPropagation();
      setOsDragOver(false);
      const files = readOsFilesFromDragEvent(e);
      if (files.length > 0) {
        onOsFilesDrop?.(files);
      }
    },
    [onOsFilesDrop, osFileDropEnabled],
  );

  useEffect(() => {
    const resetOsDrag = () => setOsDragOver(false);
    window.addEventListener("dragend", resetOsDrag);
    window.addEventListener("drop", resetOsDrag);
    return () => {
      window.removeEventListener("dragend", resetOsDrag);
      window.removeEventListener("drop", resetOsDrag);
    };
  }, []);

  return (
    <div
      ref={setNodeRef}
      style={style}
      onDragOver={handleOsDragOver}
      onDragLeave={handleOsDragLeave}
      onDrop={handleOsDrop}
      className={cn(
        className,
        osFileDropEnabled &&
          osDragOver &&
          "rounded-dlc-sm border-2 border-dashed border-emerald-600 bg-emerald-50/50 dark:bg-emerald-950/30",
        enabled &&
          !osDragOver &&
          isNestTarget &&
          "border-2 border-blue-500/90 bg-blue-100/90 font-medium text-foreground ring-2 ring-inset ring-blue-500/50 dark:bg-blue-950/55",
        enabled &&
          !osDragOver &&
          (isOver || isNestTarget) &&
          !isNestTarget &&
          "border border-primary/50 bg-primary/15 ring-2 ring-inset ring-primary/40",
      )}
      data-testid={
        folderId == null
          ? "document-vault-drop-root"
          : `document-vault-drop-folder-${folderId}`
      }
      data-os-drop={
        folderId == null
          ? "document-vault-os-drop-root"
          : `document-vault-os-drop-folder-${folderId}`
      }
    >
      {children}
    </div>
  );
}

function folderAncestorIds(
  folders: DocumentFolderRow[],
  folderId: Id<"documentFolders"> | null | undefined,
): Id<"documentFolders">[] {
  if (!folderId) return [];
  const byId = new Map(folders.map((f) => [String(f._id), f]));
  const out: Id<"documentFolders">[] = [];
  let cursor: Id<"documentFolders"> | undefined = folderId;
  const guard = new Set<string>();
  while (cursor && !guard.has(String(cursor))) {
    guard.add(String(cursor));
    out.unshift(cursor);
    cursor = byId.get(String(cursor))?.parentFolderId;
  }
  return out;
}

function InlineEditInput({
  value,
  onChange,
  onCommit,
  onCancel,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  onCommit: () => void;
  onCancel: () => void;
  className?: string;
}) {
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === " ") {
      e.stopPropagation();
    } else if (e.key === "Enter") {
      e.preventDefault();
      onCommit();
    } else if (e.key === "Escape") {
      e.preventDefault();
      onCancel();
    }
  };

  return (
    <input
      ref={ref}
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onBlur={onCommit}
      onKeyDown={onKeyDown}
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      className={cn(
        "min-w-0 flex-1 border-0 bg-transparent px-0 text-sm outline-none ring-0 focus:ring-0",
        className,
      )}
      aria-label="Rename"
    />
  );
}

function FolderInlineRenameInput({
  value,
  onChange,
  onCommit,
  onCancel,
}: {
  value: string;
  onChange: (v: string) => void;
  onCommit: () => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === " ") {
      e.stopPropagation();
    } else if (e.key === "Enter") {
      e.preventDefault();
      onCommit();
    } else if (e.key === "Escape") {
      e.preventDefault();
      onCancel();
    }
  };

  return (
    <span
      className="flex min-w-0 flex-1 items-center gap-0.5"
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <input
        ref={ref}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        onMouseDown={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
        className="min-w-0 flex-1 rounded-dlc-sm border border-border/80 bg-dlc-surface px-1.5 py-0.5 text-base outline-none ring-1 ring-primary/20 focus:ring-primary/40 md:text-xs"
        aria-label="Rename folder"
        data-testid="document-vault-folder-rename-input"
      />
      <button
        type="button"
        className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-dlc-sm text-emerald-600 hover:bg-emerald-500/10"
        aria-label="Save folder name"
        data-testid="document-vault-folder-rename-save"
        onClick={(e) => {
          e.stopPropagation();
          onCommit();
        }}
      >
        <Check className="h-3.5 w-3.5" aria-hidden />
      </button>
      <button
        type="button"
        className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-dlc-sm text-destructive hover:bg-destructive/10"
        aria-label="Cancel folder rename"
        data-testid="document-vault-folder-rename-cancel"
        onClick={(e) => {
          e.stopPropagation();
          onCancel();
        }}
      >
        <X className="h-3.5 w-3.5" aria-hidden />
      </button>
    </span>
  );
}

function collectFolderIds(folders: DocumentFolderRow[]): Set<string> {
  return new Set(folders.map((f) => String(f._id)));
}

function DocumentTreeRow({
  doc,
  depth,
  density = "default",
  isSelected,
  canMutate,
  isEditing,
  editValue,
  onStartEdit,
  onEditChange,
  onCommitEdit,
  onCancelEdit,
  onSelect,
  fileRowHandlers,
  row,
  organizationId,
  memberUserKey,
}: {
  doc: VaultTreeDocument;
  depth: number;
  density?: "default" | "compact";
  isSelected: boolean;
  canMutate: boolean;
  isEditing: boolean;
  editValue: string;
  onStartEdit: () => void;
  onEditChange: (v: string) => void;
  onCommitEdit: () => void;
  onCancelEdit: () => void;
  onSelect: () => void;
  fileRowHandlers?: DocumentVaultExplorerFileHandlers;
  row?: LibraryDocumentListRow;
  organizationId?: Id<"organizations">;
  memberUserKey?: string;
}) {
  if (fileRowHandlers && row) {
    const handlers = fileRowHandlers;
    const isGlobalContactDoc = row.linkScope === "contact";
    const showBulkCheckbox =
      row.linkScope === "pipeline" && row.latestVersionNumber > 0;
    return (
      <DocumentVaultExplorerFileRow
        row={row}
        depth={depth}
        density={density}
        isSelected={isSelected}
        isHighlighted={handlers.highlightDocumentId === row._id}
        canMutate={canMutate}
        isBulkChecked={handlers.bulkSelectedIds.has(String(row._id))}
        showBulkCheckbox={showBulkCheckbox}
        dragEnabled={handlers.dragEnabled}
        busyDoc={handlers.busyDoc}
        isEditing={isEditing}
        editValue={editValue}
        proof={handlers.proofForRow(row)}
        onSelect={onSelect}
        onToggleBulkSelect={() => handlers.onToggleBulkSelect(row._id)}
        onStartEdit={onStartEdit}
        onEditChange={onEditChange}
        onCommitEdit={onCommitEdit}
        onCancelEdit={onCancelEdit}
        onPreview={() => {
          if (row.latestVersionId) {
            handlers.onPreview(
              row._id,
              row.latestVersionId,
              row.latestFileName ?? row.title,
              row.latestContentType,
            );
          }
        }}
        onOpenInWindow={
          handlers.onOpenInWindow && row.latestVersionId
            ? () => {
                handlers.onOpenInWindow!(
                  row._id,
                  row.latestVersionId!,
                  row.latestFileName ?? row.title,
                  row.latestContentType,
                );
              }
            : undefined
        }
        onToggleExpanded={() => handlers.onToggleExpanded(row._id)}
        onMoveDoc={() => handlers.onMoveDoc(row)}
        onMoveCopyToFile={
          handlers.onMoveCopyToFile
            ? () => handlers.onMoveCopyToFile!(row)
            : undefined
        }
        crossFileTransferEnabled={handlers.crossFileTransferEnabled}
        onOpenProperties={() => handlers.onOpenProperties(row._id)}
        onSaveToContact={() => handlers.onSaveToContact(row)}
        onAssignToRegistry={() => handlers.onAssignToRegistry(row)}
        onDownload={() => handlers.onDownload(row)}
        onDownloadAsPdf={() => handlers.onDownloadAsPdf(row)}
        downloading={handlers.downloadingDocId === row._id}
        exportingPdf={handlers.exportingPdfDocId === row._id}
        onRemoveLink={() =>
          handlers.onRemoveLink(
            row._id,
            handlers.proofForRow(row),
            isGlobalContactDoc,
            row.title,
          )
        }
        onRejectDocument={
          handlers.onRejectDocument
            ? (reason) => handlers.onRejectDocument!(row._id, reason)
            : undefined
        }
        onToggleClientVisibility={
          handlers.onToggleClientVisibility
            ? () => handlers.onToggleClientVisibility!(row)
            : undefined
        }
        organizationId={organizationId}
        memberUserKey={memberUserKey}
      />
    );
  }

  return (
    <li className="min-w-0">
      <div
        className={cn(
          "group/doc flex min-w-0 items-center gap-0.5 border-b border-border/40 py-0.5 pr-1",
          density === "compact" ? "min-h-6" : ROW_H,
          isSelected && "bg-primary/10 text-primary",
        )}
        style={{ paddingLeft: `${treeIndentPx(depth, density === "compact")}px` }}
      >
        <button
          type="button"
          className={cn(
            "flex min-w-0 flex-1 items-center gap-1 text-left",
            density === "compact" ? "text-[11px]" : "text-xs",
            isSelected ? "font-semibold" : "font-medium text-foreground",
          )}
          data-testid={`document-vault-tree-document-${doc._id}`}
          onClick={onSelect}
        >
          <FileText
            className="h-3 w-3 shrink-0 text-muted-foreground"
            aria-hidden
          />
          {isEditing ? (
            <InlineEditInput
              value={editValue}
              onChange={onEditChange}
              onCommit={onCommitEdit}
              onCancel={onCancelEdit}
            />
          ) : (
            <span className="truncate">{doc.title}</span>
          )}
        </button>
        {canMutate && !isEditing ? (
          <button
            type="button"
            className="inline-flex items-center gap-0.5 px-1 text-[10px] font-medium text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover/doc:opacity-100"
            aria-label={`Rename ${doc.title}`}
            onClick={(e) => {
              e.stopPropagation();
              onStartEdit();
            }}
          >
            <Pencil className="h-2.5 w-2.5" aria-hidden />
            Edit
          </button>
        ) : null}
      </div>
    </li>
  );
}

const MemoDocumentTreeRow = memo(DocumentTreeRow);

function FolderInsertLine({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <div
      className="pointer-events-none mx-1 border-t-2 border-blue-600"
      aria-hidden
      data-testid="document-vault-folder-insert-line"
    />
  );
}

function VaultItemCountBadge({
  label,
  icon,
  compact = false,
}: {
  label: string;
  icon: "folder" | "document";
  compact?: boolean;
}) {
  const Icon = icon === "folder" ? Folder : FileText;
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-0.5 rounded-full bg-muted/50 px-1.5 py-0.5 font-medium text-muted-foreground",
        compact ? "text-[9px]" : "text-[10px]",
      )}
      data-testid="vault-item-count-badge"
    >
      <Icon className="h-2.5 w-2.5" aria-hidden />
      {label}
    </span>
  );
}

function TreeNode({
  node,
  depth,
  compact = false,
  currentFolderId,
  selectedDocumentId,
  expandedIds,
  docsByFolderKey,
  editing,
  canMutate,
  onToggleExpand,
  onSelectFolder,
  onSelectDocument,
  onStartEdit,
  onEditChange,
  onCommitEdit,
  onCancelEdit,
  dropEnabled,
  fileRowHandlers,
  rowById,
  onDeleteFolder,
  onNewSubfolder,
  onDownloadFolder,
  downloadingFolderId,
  downloadBusy,
  folderDragVisual,
  osFileDropEnabled,
  onOsFilesDropped,
  organizationId,
  memberUserKey,
  folderCountById,
  folderDownloadableCountById,
  crossFileTransferEnabled = false,
  onMoveCopyFolder,
}: {
  node: FolderTreeNode;
  depth: number;
  compact?: boolean;
  currentFolderId: Id<"documentFolders"> | null;
  selectedDocumentId: Id<"libraryDocuments"> | null;
  expandedIds: Set<string>;
  docsByFolderKey: Map<string, TreeDoc[]>;
  editing: EditingState | null;
  canMutate: boolean;
  dropEnabled: boolean;
  fileRowHandlers?: DocumentVaultExplorerFileHandlers;
  rowById: Map<string, LibraryDocumentListRow>;
  onToggleExpand: (id: Id<"documentFolders">) => void;
  onSelectFolder: (id: Id<"documentFolders">) => void;
  onSelectDocument: (id: Id<"libraryDocuments">) => void;
  onStartEdit: (state: EditingState) => void;
  onEditChange: (v: string) => void;
  onCommitEdit: () => void;
  onCancelEdit: () => void;
  onDeleteFolder: (folderId: Id<"documentFolders">, name: string) => void;
  onNewSubfolder?: (folderId: Id<"documentFolders">) => void;
  onDownloadFolder?: (
    folderId: Id<"documentFolders">,
    folderName: string,
  ) => void;
  downloadingFolderId?: Id<"documentFolders"> | null;
  downloadBusy?: boolean;
  folderDragVisual?: FolderDragVisualState;
  osFileDropEnabled?: boolean;
  onOsFilesDropped?: (
    files: File[],
    parentFolderId: Id<"documentFolders"> | null,
  ) => void;
  organizationId?: Id<"organizations">;
  memberUserKey?: string;
  folderCountById?: Map<string, string>;
  folderDownloadableCountById?: Map<string, number>;
  crossFileTransferEnabled?: boolean;
  onMoveCopyFolder?: (
    folderId: Id<"documentFolders">,
    folderName: string,
  ) => void;
}) {
  const id = node.folder._id;
  const folderItemBadge = folderCountById?.get(String(id));
  const folderDownloadableCount =
    folderDownloadableCountById?.get(String(id)) ?? 0;
  const folderDownloading = downloadingFolderId === id;
  const folderDownloadDisabled =
    folderDownloadableCount === 0 ||
    folderDownloading ||
    Boolean(downloadBusy && !folderDownloading);
  const sortableId = vaultFolderSortableId(id);
  const isEditing =
    editing?.type === "folder" && editing.folderId === id;
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: sortableId,
    disabled: !dropEnabled || !canMutate || isEditing,
  });
  const sortableStyle = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const folderDocs = docsByFolderKey.get(String(id)) ?? [];
  const isSelected = currentFolderId === id;
  const isExpanded = expandedIds.has(String(id));
  const isNestTarget =
    folderDragVisual?.mode === "nest" &&
    folderDragVisual.nestTargetFolderId === id;
  const showInsertLine =
    folderDragVisual?.mode === "insert" &&
    folderDragVisual.insertBeforeFolderId === id;

  return (
    <li ref={setNodeRef} style={sortableStyle} className={cn(isDragging && "opacity-60")}>
      <FolderInsertLine show={showInsertLine} />
      <FolderDropZone
        folderId={id}
        enabled={dropEnabled}
        isNestTarget={isNestTarget}
        osFileDropEnabled={osFileDropEnabled}
        onOsFilesDrop={(files) => onOsFilesDropped?.(files, id)}
        className={cn(
          "group/folder flex min-w-0 items-center gap-0.5 pr-1",
          compact ? "min-h-6 border-b border-border/40 py-0.5" : cn("rounded-dlc-sm", ROW_H),
          isSelected && "bg-primary/10 text-primary",
        )}
        style={{ paddingLeft: `${treeIndentPx(depth, compact)}px` }}
      >
        {canMutate && !isEditing ? (
          <button
            ref={setActivatorNodeRef}
            type="button"
            className={cn(
              "inline-flex h-6 w-4 shrink-0 cursor-grab touch-none items-center justify-center text-muted-foreground/60 hover:text-foreground active:cursor-grabbing",
              !compact && "opacity-70 hover:opacity-100",
              isDragging && "opacity-100",
            )}
            style={{ touchAction: "none" }}
            aria-label={`Drag folder ${node.folder.name}`}
            data-testid={`document-vault-folder-drag-${id}`}
            {...listeners}
            {...attributes}
            onClick={(e) => e.stopPropagation()}
          >
            <GripVertical className="h-3 w-3" aria-hidden />
          </button>
        ) : (
          <span className="inline-block h-6 w-4 shrink-0" aria-hidden />
        )}

        <button
          type="button"
          className="inline-flex h-5 w-4 shrink-0 items-center justify-center rounded-dlc-sm text-muted-foreground hover:bg-muted/60"
          aria-label={isExpanded ? "Collapse folder" : "Expand folder"}
          onClick={() => onToggleExpand(id)}
        >
          {isExpanded ? (
            <ChevronDown className="h-3 w-3" aria-hidden />
          ) : (
            <ChevronRight className="h-3 w-3" aria-hidden />
          )}
        </button>
        <button
          type="button"
          className={cn(
            "relative z-[1] flex min-w-0 flex-1 items-center gap-1 text-left",
            compact ? "text-[11px]" : "text-xs",
            isSelected ? "font-semibold" : "font-medium text-foreground",
          )}
          data-testid={`document-vault-tree-folder-${id}`}
          onClick={() => onSelectFolder(id)}
        >
          {isSelected ? (
            <FolderOpen className="h-3 w-3 shrink-0 text-amber-600" aria-hidden />
          ) : (
            <Folder className="h-3 w-3 shrink-0 text-amber-500" aria-hidden />
          )}
          {isEditing ? (
            <FolderInlineRenameInput
              value={editing!.value}
              onChange={onEditChange}
              onCommit={onCommitEdit}
              onCancel={onCancelEdit}
            />
          ) : (
            <span
              role="button"
              tabIndex={0}
              className={cn(
                "min-w-0 flex-1 truncate",
                canMutate && "cursor-text hover:underline decoration-dotted underline-offset-2",
              )}
              onClick={(e) => {
                e.stopPropagation();
                if (!canMutate) return;
                onStartEdit({
                  id: `folder:${id}`,
                  type: "folder",
                  value: node.folder.name,
                  folderId: id,
                });
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  e.stopPropagation();
                  if (!canMutate) return;
                  onStartEdit({
                    id: `folder:${id}`,
                    type: "folder",
                    value: node.folder.name,
                    folderId: id,
                  });
                }
              }}
            >
              {node.folder.name}
            </span>
          )}
          {folderItemBadge ? (
            <VaultItemCountBadge label={folderItemBadge} icon="folder" compact={compact} />
          ) : null}
        </button>
        {!isEditing && onDownloadFolder ? (
          <button
            type="button"
            className={cn(
              "inline-flex shrink-0 items-center gap-0.5 text-[10px] font-medium text-muted-foreground hover:text-foreground disabled:opacity-50",
              compact
                ? "opacity-100"
                : "h-6 justify-center rounded-dlc-sm px-1 opacity-70 hover:bg-muted/60 hover:opacity-100",
            )}
            disabled={folderDownloadDisabled}
            title={
              folderDownloadableCount === 0
                ? "This folder has no downloadable files"
                : folderDownloading
                  ? "Downloading folder…"
                  : `Download ${node.folder.name} as ZIP`
            }
            aria-label={`Download folder ${node.folder.name} as ZIP`}
            data-testid={`document-vault-folder-download-${id}`}
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              onDownloadFolder(id, node.folder.name);
            }}
          >
            {folderDownloading ? (
              <Loader2
                className={cn(
                  "animate-spin",
                  compact ? "h-2.5 w-2.5" : "h-3.5 w-3.5",
                )}
                aria-hidden
              />
            ) : (
              <Download
                className={cn(compact ? "h-2.5 w-2.5" : "h-3.5 w-3.5")}
                aria-hidden
              />
            )}
            {compact ? <span>Download</span> : null}
          </button>
        ) : null}
        {canMutate &&
        !isEditing &&
        compact &&
        crossFileTransferEnabled &&
        onMoveCopyFolder ? (
          <button
            type="button"
            className="inline-flex shrink-0 items-center gap-0.5 text-[10px] font-medium text-muted-foreground opacity-100 hover:text-foreground"
            title={`Move or copy ${node.folder.name} to another file`}
            aria-label={`Move or copy folder ${node.folder.name} to another file`}
            data-testid={`document-vault-folder-move-copy-${id}`}
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              onMoveCopyFolder(id, node.folder.name);
            }}
          >
            <Copy className="h-2.5 w-2.5" aria-hidden />
            <span>Move</span>
          </button>
        ) : null}
        {canMutate && !isEditing ? (
          <>
            {onNewSubfolder ? (
              <button
                type="button"
                className={cn(
                  "inline-flex shrink-0 items-center justify-center rounded-dlc-sm text-muted-foreground transition-opacity hover:bg-muted/60 hover:text-foreground",
                  compact
                    ? "h-6 w-6 opacity-0 group-hover/folder:opacity-100"
                    : "h-6 w-6 opacity-0 group-hover/folder:opacity-100",
                )}
                aria-label={`New subfolder in ${node.folder.name}`}
                data-testid={`document-vault-folder-new-subfolder-${id}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onNewSubfolder(id);
                }}
              >
                <Plus className="h-3 w-3" aria-hidden />
              </button>
            ) : null}
            <VaultRegistryAssignMicroAction
              organizationId={organizationId}
              memberUserKey={memberUserKey}
              target={{ kind: "folder", folderId: id }}
              assignedContactId={node.folder.assignedContactId}
              assignedClientId={node.folder.assignedClientId}
              assignedLenderId={node.folder.assignedLenderId}
              compact
            />
            <button
              type="button"
              className={cn(
                "ml-auto inline-flex shrink-0 items-center gap-0.5 px-1 text-[10px] font-medium text-red-600 hover:text-red-800 dark:text-red-400",
                compact ? "opacity-100" : "h-6 w-6 justify-center rounded-dlc-sm text-muted-foreground opacity-70 hover:bg-destructive/10 hover:text-destructive hover:opacity-100",
              )}
              aria-label={`Delete folder ${node.folder.name}`}
              data-testid={`document-vault-folder-delete-btn-${id}`}
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                onDeleteFolder(id, node.folder.name);
              }}
            >
              <Trash2 className={cn(compact ? "h-2.5 w-2.5" : "h-3.5 w-3.5")} aria-hidden />
              {compact ? <span>Trash</span> : null}
            </button>
            {!compact ? (
            <DropdownMenu
              trigger={
                <button
                  type="button"
                  className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-dlc-sm text-muted-foreground opacity-70 transition-opacity hover:bg-muted/60 hover:opacity-100"
                  aria-label={`Folder actions for ${node.folder.name}`}
                  data-testid={`document-vault-folder-menu-${id}`}
                  onClick={(e) => e.stopPropagation()}
                >
                  <MoreVertical className="h-3 w-3" aria-hidden />
                </button>
              }
              align="end"
            >
              {onDownloadFolder ? (
                <DropdownMenuItem
                  disabled={folderDownloadDisabled}
                  onClick={() => {
                    if (folderDownloadDisabled) return;
                    onDownloadFolder(id, node.folder.name);
                  }}
                >
                  <Download className="h-4 w-4" aria-hidden />
                  Download ZIP
                </DropdownMenuItem>
              ) : null}
              {crossFileTransferEnabled && onMoveCopyFolder ? (
                <DropdownMenuItem
                  onClick={() => onMoveCopyFolder(id, node.folder.name)}
                >
                  <Copy className="h-4 w-4" aria-hidden />
                  Move / copy to file…
                </DropdownMenuItem>
              ) : null}
              <DropdownMenuItem
                onClick={() =>
                  onStartEdit({
                    id: `folder:${id}`,
                    type: "folder",
                    value: node.folder.name,
                    folderId: id,
                  })
                }
              >
                <Pencil className="h-4 w-4" aria-hidden />
                Rename
              </DropdownMenuItem>
              <DropdownMenuItem
                className="text-destructive"
                onClick={() => {
                  onDeleteFolder(id, node.folder.name);
                }}
              >
                <Trash2 className="h-4 w-4" aria-hidden />
                Delete
              </DropdownMenuItem>
            </DropdownMenu>
            ) : null}
          </>
        ) : null}
      </FolderDropZone>
      {isExpanded ? (
          <ul className="min-w-0">
            {node.children.map((child) => (
              <MemoTreeNode
                key={child.folder._id}
                node={child}
                depth={depth + 1}
                compact={compact}
                currentFolderId={currentFolderId}
                selectedDocumentId={selectedDocumentId}
                expandedIds={expandedIds}
                docsByFolderKey={docsByFolderKey}
                editing={editing}
                canMutate={canMutate}
                onToggleExpand={onToggleExpand}
                onSelectFolder={onSelectFolder}
                onSelectDocument={onSelectDocument}
                onStartEdit={onStartEdit}
                onEditChange={onEditChange}
                onCommitEdit={onCommitEdit}
                onCancelEdit={onCancelEdit}
                dropEnabled={dropEnabled}
                fileRowHandlers={fileRowHandlers}
                rowById={rowById}
                onDeleteFolder={onDeleteFolder}
                onNewSubfolder={onNewSubfolder}
                onDownloadFolder={onDownloadFolder}
                downloadingFolderId={downloadingFolderId}
                downloadBusy={downloadBusy}
                folderDragVisual={folderDragVisual}
                osFileDropEnabled={osFileDropEnabled}
                onOsFilesDropped={onOsFilesDropped}
                organizationId={organizationId}
                memberUserKey={memberUserKey}
                folderCountById={folderCountById}
                folderDownloadableCountById={folderDownloadableCountById}
                crossFileTransferEnabled={crossFileTransferEnabled}
                onMoveCopyFolder={onMoveCopyFolder}
              />
            ))}
          {folderDocs.map((doc) => {
            const docId =
              "_id" in doc ? doc._id : (doc as VaultTreeDocument)._id;
            const docTitle =
              "title" in doc ? doc.title : (doc as VaultTreeDocument).title;
            const vaultDoc: VaultTreeDocument = {
              _id: docId,
              title: docTitle,
              folderId: "folderId" in doc ? doc.folderId : undefined,
            };
            const fullRow = rowById.get(String(docId));
            return (
            <MemoDocumentTreeRow
              key={String(docId)}
              doc={vaultDoc}
              row={fullRow}
              depth={depth + 1}
              density={compact ? "compact" : "default"}
              isSelected={selectedDocumentId === docId}
              canMutate={canMutate}
              isEditing={
                editing?.type === "document" && editing.documentId === docId
              }
              editValue={
                editing?.type === "document" && editing.documentId === docId
                  ? editing.value
                  : docTitle
              }
              fileRowHandlers={fileRowHandlers}
              organizationId={organizationId}
              memberUserKey={memberUserKey}
              onStartEdit={() =>
                onStartEdit({
                  id: `document:${docId}`,
                  type: "document",
                  value: docTitle,
                  documentId: docId,
                })
              }
              onEditChange={onEditChange}
              onCommitEdit={onCommitEdit}
              onCancelEdit={onCancelEdit}
              onSelect={() => onSelectDocument(docId)}
            />
            );
          })}
          </ul>
      ) : null}
    </li>
  );
}

const MemoTreeNode = memo(TreeNode);

export function DocumentVaultDirectoryTree({
  pipelineFileId,
  memberUserKey,
  canMutate,
  folders,
  documentRows,
  documents,
  fileRowHandlers,
  rootLabel: _rootLabelProp,
  onImportFromContact,
  onError,
  vaultSearchQuery = "",
  dropEnabled = false,
  osFileDropEnabled = false,
  onOsFilesDropped,
  className,
  folderDragVisual,
  autoExpandFolderIds,
  optimisticSiblingOrder,
  fileTasks,
  optimisticFileTaskOrder,
  onAddFileTasks,
  onOsFilesDroppedToTask,
  organizationId,
  onApplyTemplates,
  archivedFileTasks,
  showArchived = false,
  onToggleShowArchived,
  onDownloadAll,
  onDownloadSelected,
  onDownloadFolder,
  downloadingFolderId = null,
  downloadBusy = false,
  bulkSelectedCount = 0,
  downloadableCount = 0,
  crossFileTransferEnabled = false,
  onMoveCopyFolder,
  onMoveCopyFileTask,
  onOpenDocument,
}: DocumentVaultDirectoryTreeProps) {
  const {
    currentFolderId,
    selectedDocumentId,
    navigateToFolder,
    selectDocument,
  } = useDocumentVaultState();
  const openDocument = onOpenDocument ?? selectDocument;
  const createFolder = useMutation(api.documentFolders.createFolder);
  const renameFolder = useMutation(api.documentFolders.renameFolder);
  const patchDocumentTitle = useMutation(api.libraryDocuments.patchDocumentTitle);
  const toggleFileTaskStatus = useMutation(api.documentVaultFileTasks.toggleStatus);
  const toggleFileTaskRequired = useMutation(api.documentVaultFileTasks.toggleRequired);
  const updateFileTaskTitle = useMutation(api.documentVaultFileTasks.updateTitle);
  const toggleFileTaskPortal = useMutation(
    api.documentVaultFileTasks.togglePortalVisible,
  );
  const archiveFileTask = useMutation(api.documentVaultFileTasks.archiveFileTask);
  const restoreFileTask = useMutation(api.documentVaultFileTasks.restoreFileTask);
  const deleteFileTask = useMutation(api.documentVaultFileTasks.deleteFileTask);
  const acceptReview = useMutation(api.documentVaultFileTasks.acceptFileTaskReview);
  const rejectReview = useMutation(api.documentVaultFileTasks.rejectFileTaskReview);
  const resetForClient = useMutation(api.documentVaultFileTasks.resetFileTaskForClient);
  const updateTaskConfig = useMutation(api.documentVaultFileTasks.updateTaskConfig);

  const [archiveFileTaskTarget, setArchiveFileTaskTarget] =
    useState<DocumentVaultFileTaskRow | null>(null);
  const [deleteFileTaskTarget, setDeleteFileTaskTarget] =
    useState<DocumentVaultFileTaskRow | null>(null);
  const [rejectFileTaskTarget, setRejectFileTaskTarget] =
    useState<DocumentVaultFileTaskRow | null>(null);
  const [executionFileTask, setExecutionFileTask] =
    useState<DocumentVaultFileTaskRow | null>(null);
  const [configFileTask, setConfigFileTask] =
    useState<DocumentVaultFileTaskRow | null>(null);

  const [expandedFileTaskIds, setExpandedFileTaskIds] = useState<Set<string>>(
    () => new Set(),
  );

  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set());
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [newFolderTaskId, setNewFolderTaskId] =
    useState<Id<"documentVaultFileTasks"> | null>(null);
  const [newFolderParentId, setNewFolderParentId] =
    useState<Id<"documentFolders"> | null>(null);
  const [editing, setEditing] = useState<EditingState | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{
    id: Id<"documentFolders">;
    name: string;
  } | null>(null);
  const unassignedUploadInputRef = useRef<HTMLInputElement>(null);

  const tree = useMemo(
    () => buildFolderTree(folders ?? [], null, optimisticSiblingOrder, null),
    [folders, optimisticSiblingOrder],
  );

  const orderedFileTasks = useMemo(() => {
    const rows = fileTasks ?? [];
    if (!optimisticFileTaskOrder?.length) return rows;
    const byId = new Map(rows.map((t) => [String(t._id), t]));
    const ordered: DocumentVaultFileTaskRow[] = [];
    for (const id of optimisticFileTaskOrder) {
      const row = byId.get(String(id));
      if (row) ordered.push(row);
    }
    for (const row of rows) {
      if (!optimisticFileTaskOrder.some((id) => id === row._id)) {
        ordered.push(row);
      }
    }
    return ordered;
  }, [fileTasks, optimisticFileTaskOrder]);

  const docsByFolderKey = useMemo(() => {
    const source: TreeDoc[] =
      documentRows ??
      (documents ?? []).map((d) => ({ ...d }));
    const map = new Map<string, TreeDoc[]>();
    for (const doc of source) {
      const folderId = "folderId" in doc ? doc.folderId : undefined;
      const fileTaskId = "fileTaskId" in doc ? doc.fileTaskId : undefined;
      const key = folderId
        ? String(folderId)
        : fileTaskId
          ? taskRootKey(fileTaskId)
          : ROOT_KEY;
      const list = map.get(key) ?? [];
      list.push(doc);
      map.set(key, list);
    }
    for (const [, list] of map) {
      list.sort((a, b) => {
        const ta = "title" in a ? a.title : "";
        const tb = "title" in b ? b.title : "";
        return ta.localeCompare(tb, undefined, { sensitivity: "base" });
      });
    }
    return map;
  }, [documentRows, documents]);

  const rowById = useMemo(() => {
    const map = new Map<string, LibraryDocumentListRow>();
    if (documentRows) {
      for (const row of documentRows) {
        map.set(String(row._id), row);
      }
    }
    return map;
  }, [documentRows]);

  const docsForEdit = documentRows ?? documents;

  const vaultDocRefs = useMemo((): VaultTreeDocumentRef[] => {
    const source = documentRows ?? documents ?? [];
    const taskStatusById = new Map(
      (fileTasks ?? []).map((t) => [String(t._id), t.status]),
    );
    return source.map((doc) => {
      const fileTaskId = "fileTaskId" in doc ? doc.fileTaskId : undefined;
      const status = fileTaskId
        ? (taskStatusById.get(String(fileTaskId)) as VaultTreeDocumentRef["status"])
        : undefined;
      return {
        _id: doc._id,
        folderId: "folderId" in doc ? doc.folderId : undefined,
        fileTaskId,
        status,
      };
    });
  }, [documentRows, documents, fileTasks]);

  const folderCountById = useMemo(() => {
    const map = new Map<string, string>();
    if (!folders) return map;
    for (const folder of folders) {
      const summary = countFolderItems(folder._id, folders, vaultDocRefs);
      map.set(String(folder._id), formatFolderItemBadge(summary));
    }
    return map;
  }, [folders, vaultDocRefs]);

  const folderDownloadableCountById = useMemo(() => {
    const map = new Map<string, number>();
    if (!folders) return map;
    for (const folder of folders) {
      const subtree = collectFolderSubtreeIds(folders, folder._id);
      let count = 0;
      for (const doc of vaultDocRefs) {
        if (!doc.folderId || !subtree.has(String(doc.folderId))) continue;
        const row = rowById.get(String(doc._id));
        if (row && row.latestVersionNumber > 0) {
          count += 1;
          continue;
        }
        if (!row && documentRows === undefined) {
          // Fallback when only lightweight tree docs are provided.
          count += 1;
        }
      }
      map.set(String(folder._id), count);
    }
    return map;
  }, [folders, vaultDocRefs, rowById, documentRows]);

  const taskCountById = useMemo(() => {
    const map = new Map<string, string>();
    for (const task of fileTasks ?? []) {
      const blockCount =
        resolveTaskType(task.taskType) === "block_assignment"
          ? assignedBlockIdsOrdered(task).length
          : 0;
      const summary = countFileTaskItems(
        task._id,
        folders ?? [],
        vaultDocRefs,
        { assignedBlockCount: blockCount },
      );
      map.set(
        String(task._id),
        formatTaskItemBadge(summary, task.status, blockCount),
      );
    }
    return map;
  }, [fileTasks, folders, vaultDocRefs]);

  const visibleTree = useMemo(
    () => filterFolderTree(tree, vaultSearchQuery, docsByFolderKey),
    [tree, vaultSearchQuery, docsByFolderKey],
  );

  const rootDocs = docsByFolderKey.get(ROOT_KEY) ?? [];
  const searchActive = vaultSearchQuery.trim().length > 0;
  const explorerVisible =
    !searchActive ||
    rootDocs.length > 0 ||
    visibleTree.length > 0 ||
    (orderedFileTasks?.length ?? 0) > 0;

  useEffect(() => {
    if (!fileTasks?.length) return;
    setExpandedFileTaskIds((prev) => {
      const next = new Set(prev);
      for (const task of fileTasks) {
        next.add(String(task._id));
      }
      return next;
    });
  }, [fileTasks]);

  useEffect(() => {
    if (!autoExpandFolderIds?.length) return;
    setExpandedIds((prev) => {
      const next = new Set(prev);
      for (const folderId of autoExpandFolderIds) {
        next.add(String(folderId));
      }
      return next;
    });
  }, [autoExpandFolderIds]);

  useEffect(() => {
    if (!folders) return;
    const toExpand = new Set<string>();
    if (currentFolderId) {
      for (const id of folderAncestorIds(folders, currentFolderId)) {
        toExpand.add(String(id));
      }
    }
    if (selectedDocumentId && docsForEdit) {
      const doc = docsForEdit.find((d) => {
        const docId = "_id" in d ? d._id : (d as VaultTreeDocument)._id;
        return docId === selectedDocumentId;
      });
      const folderId =
        doc && "folderId" in doc ? doc.folderId : undefined;
      if (folderId) {
        for (const id of folderAncestorIds(folders, folderId)) {
          toExpand.add(String(id));
        }
      }
    }
    if (toExpand.size > 0) {
      setExpandedIds((prev) => new Set([...prev, ...toExpand]));
    }
  }, [currentFolderId, selectedDocumentId, folders, docsForEdit]);

  useEffect(() => {
    if (!searchActive || !folders) return;
    const allFolderIds = folders.map((f) => String(f._id));
    setExpandedIds((prev) => new Set([...prev, ...allFolderIds]));
  }, [searchActive, folders, vaultSearchQuery]);

  const toggleExpand = useCallback((id: Id<"documentFolders">) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      const key = String(id);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const expandAll = useCallback(() => {
    if (!folders?.length) return;
    setExpandedIds(collectFolderIds(folders));
  }, [folders]);

  const collapseAll = useCallback(() => {
    setExpandedIds(new Set());
  }, []);

  const cancelEdit = useCallback(() => setEditing(null), []);

  const commitEdit = useCallback(async () => {
    if (!editing || !memberUserKey) {
      setEditing(null);
      return;
    }
    const trimmed = editing.value.trim();
    if (!trimmed) {
      cancelEdit();
      return;
    }

    try {
      if (editing.type === "folder" && editing.folderId) {
        if (trimmed !== folders?.find((f) => f._id === editing.folderId)?.name) {
          await renameFolder({
            folderId: editing.folderId,
            name: trimmed,
            memberUserKey,
          });
        }
      } else if (editing.type === "document" && editing.documentId) {
        const doc = docsForEdit?.find((d) => {
          const docId = "_id" in d ? d._id : (d as VaultTreeDocument)._id;
          return docId === editing.documentId;
        });
        const currentTitle =
          doc && "title" in doc ? doc.title : undefined;
        if (trimmed !== currentTitle) {
          await patchDocumentTitle({
            documentId: editing.documentId,
            title: trimmed,
            proof: { kind: "pipeline", pipelineFileId },
            memberUserKey,
          });
        }
      }
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    } finally {
      setEditing(null);
    }
  }, [
    cancelEdit,
    docsForEdit,
    editing,
    folders,
    memberUserKey,
    onError,
    patchDocumentTitle,
    pipelineFileId,
    renameFolder,
  ]);

  const openNewSubfolder = useCallback(
    (parentFolderId: Id<"documentFolders">) => {
      const parent = folders?.find((f) => f._id === parentFolderId);
      setNewFolderParentId(parentFolderId);
      setNewFolderTaskId(parent?.fileTaskId ?? null);
      setExpandedIds((prev) => new Set([...prev, String(parentFolderId)]));
      setNewFolderOpen(true);
    },
    [folders],
  );

  const handleCreateFolder = useCallback(
    async (name: string) => {
      if (!memberUserKey) {
        onError("Sign in to create folders.");
        return;
      }
      try {
        await createFolder({
          pipelineFileId,
          name,
          parentFolderId: newFolderParentId
            ? newFolderParentId
            : newFolderTaskId
              ? undefined
              : (currentFolderId ?? undefined),
          fileTaskId: newFolderTaskId ?? undefined,
          memberUserKey,
        });
        if (newFolderTaskId) {
          setExpandedFileTaskIds((prev) => {
            const next = new Set(prev);
            next.add(String(newFolderTaskId));
            return next;
          });
        }
        if (newFolderParentId) {
          setExpandedIds((prev) => new Set([...prev, String(newFolderParentId)]));
        }
      } catch (e) {
        onError(e instanceof Error ? e.message : String(e));
        throw e;
      } finally {
        setNewFolderTaskId(null);
        setNewFolderParentId(null);
      }
    },
    [
      createFolder,
      currentFolderId,
      memberUserKey,
      newFolderParentId,
      newFolderTaskId,
      onError,
      pipelineFileId,
    ],
  );

  const handleDeleteFolder = useCallback(
    (folderId: Id<"documentFolders">, name: string) => {
      setDeleteTarget({ id: folderId, name });
    },
    [],
  );

  const rootNestTarget =
    folderDragVisual?.mode === "nest" &&
    folderDragVisual.nestTargetFolderId === null;

  return (
    <div
      className={cn(
        "dlc-surface-card min-w-0 w-full shadow-dlc-2",
        className,
      )}
      data-testid="document-vault-unified-explorer"
      aria-label="Document vault explorer"
    >
      <div className="flex shrink-0 flex-wrap items-center gap-1.5 border-b border-border/60 px-2 py-1.5">
        <div className="flex items-center gap-2">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Explorer
          </h3>
          <div className="flex shrink-0 items-center gap-0.5 border-l border-border/60 pl-2.5">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0"
              onClick={expandAll}
              disabled={folders === undefined || folders.length === 0}
              data-testid="document-vault-tree-expand-all"
              title="Expand all folders"
              aria-label="Expand all folders"
            >
              <ChevronsUpDown className="h-3.5 w-3.5" aria-hidden />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0"
              onClick={collapseAll}
              disabled={folders === undefined}
              data-testid="document-vault-tree-collapse-all"
              title="Collapse all folders"
              aria-label="Collapse all folders"
            >
              <ChevronsDownUp className="h-3.5 w-3.5" aria-hidden />
            </Button>
            {canMutate ? (
              <>
                {onImportFromContact ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 gap-1 px-1.5 text-[10px]"
                    onClick={onImportFromContact}
                    data-testid="document-vault-import-from-contact"
                    title="Import from Contact"
                  >
                    <UserPlus className="h-3 w-3" aria-hidden />
                  </Button>
                ) : null}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 gap-1 px-1.5 text-[10px]"
                  onClick={() => {
                    setNewFolderParentId(null);
                    setNewFolderTaskId(null);
                    setNewFolderOpen(true);
                  }}
                  data-testid="document-vault-new-folder"
                  title="New folder"
                >
                  <FolderPlus className="h-3 w-3" aria-hidden />
                </Button>
                {onAddFileTasks ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 gap-1 px-1.5 text-[10px] font-medium"
                    onClick={onAddFileTasks}
                    data-testid="document-vault-add-file-tasks"
                    title="Add file tasks"
                  >
                    <Plus className="h-3 w-3" aria-hidden />
                    <span className="hidden sm:inline">Tasks</span>
                  </Button>
                ) : null}
                {onApplyTemplates ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 gap-1 px-1.5 text-[10px] font-medium"
                    onClick={onApplyTemplates}
                    data-testid="document-vault-apply-templates"
                    title="Apply template"
                  >
                    <Layers className="h-3 w-3" aria-hidden />
                    <span className="hidden sm:inline">Template</span>
                  </Button>
                ) : null}
              </>
            ) : null}
            {onDownloadAll || onDownloadSelected ? (
              <>
                {onDownloadAll ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 gap-1 px-1.5 text-[10px] font-medium"
                    onClick={onDownloadAll}
                    disabled={downloadBusy || downloadableCount <= 0}
                    data-testid="document-vault-download-all"
                    title={
                      downloadableCount <= 0
                        ? "No downloadable documents"
                        : "Download all documents as ZIP"
                    }
                  >
                    <Download className="h-3 w-3" aria-hidden />
                    <span className="hidden sm:inline">
                      {downloadBusy ? "Downloading…" : "Download all"}
                    </span>
                  </Button>
                ) : null}
                {onDownloadSelected ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 gap-1 px-1.5 text-[10px] font-medium"
                    onClick={onDownloadSelected}
                    disabled={downloadBusy || bulkSelectedCount <= 0}
                    data-testid="document-vault-download-selected"
                    title={
                      bulkSelectedCount <= 0
                        ? "Select one or more files to download"
                        : `Download ${bulkSelectedCount} selected as ZIP`
                    }
                  >
                    <Download className="h-3 w-3" aria-hidden />
                    <span className="hidden sm:inline">
                      {bulkSelectedCount > 0
                        ? `Download selected (${bulkSelectedCount})`
                        : "Download selected"}
                    </span>
                  </Button>
                ) : null}
              </>
            ) : null}
          </div>
        </div>
      </div>

      <nav
        className="min-w-0 px-1 pt-1 pb-0"
        data-testid="document-vault-explorer-scroll"
      >
        {folders === undefined ? (
          <div className="space-y-1 px-1 py-1">
            <div className="h-8 animate-pulse rounded-dlc-sm bg-muted/40" />
            <div className="h-8 animate-pulse rounded-dlc-sm bg-muted/30" />
          </div>
        ) : (
          <ul className="min-w-0 space-y-0">
            {explorerVisible ? (
              <>
                {orderedFileTasks.length > 0 ? (
                  <li className="min-w-0">
                    <ul className="min-w-0 space-y-2">
                      {orderedFileTasks.map((task) => {
                          const taskTree = buildFolderTree(
                            folders ?? [],
                            null,
                            optimisticSiblingOrder,
                            task._id,
                          );
                          const taskVisibleTree = filterFolderTree(
                            taskTree,
                            vaultSearchQuery,
                            docsByFolderKey,
                          );
                          const taskRootDocs =
                            docsByFolderKey.get(taskRootKey(task._id)) ?? [];
                          const taskExpanded = expandedFileTaskIds.has(
                            String(task._id),
                          );

                          return (
                            <FileTaskContainer
                              key={task._id}
                              fileTask={task}
                              itemCountBadge={taskCountById.get(String(task._id))}
                              canMutate={canMutate}
                              memberUserKey={memberUserKey}
                              expanded={taskExpanded}
                              onToggleExpand={() =>
                                setExpandedFileTaskIds((prev) => {
                                  const next = new Set(prev);
                                  const key = String(task._id);
                                  if (next.has(key)) next.delete(key);
                                  else next.add(key);
                                  return next;
                                })
                              }
                              dropEnabled={dropEnabled}
                              osFileDropEnabled={osFileDropEnabled}
                              onOsFilesDropped={(files) =>
                                onOsFilesDroppedToTask?.(files, task._id)
                              }
                              onToggleStatus={async (status) => {
                                if (!memberUserKey) return;
                                await toggleFileTaskStatus({
                                  fileTaskId: task._id,
                                  status,
                                  memberUserKey,
                                });
                              }}
                              onToggleRequired={async (required) => {
                                if (!memberUserKey) return;
                                await toggleFileTaskRequired({
                                  fileTaskId: task._id,
                                  isRequired: required,
                                  memberUserKey,
                                });
                              }}
                              onUpdateTitle={async (title) => {
                                if (!memberUserKey) return;
                                await updateFileTaskTitle({
                                  fileTaskId: task._id,
                                  title,
                                  memberUserKey,
                                });
                              }}
                              onTogglePortalVisible={async (visible) => {
                                if (!memberUserKey) return;
                                await toggleFileTaskPortal({
                                  fileTaskId: task._id,
                                  isPortalVisible: visible,
                                  memberUserKey,
                                });
                              }}
                              onArchive={() => setArchiveFileTaskTarget(task)}
                              onDelete={() => setDeleteFileTaskTarget(task)}
                              pipelineFileId={pipelineFileId}
                              onAcceptReview={async () => {
                                if (!memberUserKey) return;
                                await acceptReview({
                                  fileTaskId: task._id,
                                  memberUserKey,
                                });
                              }}
                              onRejectReview={() => setRejectFileTaskTarget(task)}
                              onResetForClient={async () => {
                                if (!memberUserKey) return;
                                await resetForClient({
                                  fileTaskId: task._id,
                                  memberUserKey,
                                });
                              }}
                              onOpenExecution={() => setExecutionFileTask(task)}
                              onOpenFullscreen={() => setExecutionFileTask(task)}
                              onOpenConfig={() => setConfigFileTask(task)}
                              crossFileTransferEnabled={crossFileTransferEnabled}
                              onMoveCopyToFile={
                                crossFileTransferEnabled && onMoveCopyFileTask
                                  ? () =>
                                      onMoveCopyFileTask(task._id, task.title)
                                  : undefined
                              }
                              onNewFolder={() => {
                                setNewFolderParentId(null);
                                setNewFolderTaskId(task._id);
                                setNewFolderOpen(true);
                              }}
                              onLinkDocument={() => onImportFromContact?.()}
                              organizationId={organizationId}
                            >
                              <ul className="min-w-0 space-y-0">
                                <FileTaskInlineBlockList
                                  fileTask={task}
                                  pipelineFileId={pipelineFileId}
                                  memberUserKey={memberUserKey}
                                  canMutate={canMutate}
                                  depth={1}
                                />
                                {taskRootDocs.map((doc) => {
                                  const docId =
                                    "_id" in doc
                                      ? doc._id
                                      : (doc as VaultTreeDocument)._id;
                                  const docTitle =
                                    "title" in doc
                                      ? doc.title
                                      : (doc as VaultTreeDocument).title;
                                  const vaultDoc: VaultTreeDocument = {
                                    _id: docId,
                                    title: docTitle,
                                    fileTaskId: task._id,
                                  };
                                  return (
                                    <MemoDocumentTreeRow
                                      key={String(docId)}
                                      doc={vaultDoc}
                                      row={rowById.get(String(docId))}
                                      depth={1}
                                      density="compact"
                                      isSelected={selectedDocumentId === docId}
                                      canMutate={canMutate}
                                      fileRowHandlers={fileRowHandlers}
                                      organizationId={organizationId}
                                      memberUserKey={memberUserKey}
                                      isEditing={
                                        editing?.type === "document" &&
                                        editing.documentId === docId
                                      }
                                      editValue={
                                        editing?.type === "document" &&
                                        editing.documentId === docId
                                          ? editing.value
                                          : docTitle
                                      }
                                      onStartEdit={() =>
                                        setEditing({
                                          id: `document:${docId}`,
                                          type: "document",
                                          value: docTitle,
                                          documentId: docId,
                                        })
                                      }
                                      onEditChange={(v) =>
                                        setEditing((prev) =>
                                          prev ? { ...prev, value: v } : prev,
                                        )
                                      }
                                      onCommitEdit={() => void commitEdit()}
                                      onCancelEdit={cancelEdit}
                                      onSelect={() => openDocument(docId)}
                                    />
                                  );
                                })}
                                {taskVisibleTree.map((node) => (
                                  <MemoTreeNode
                                    key={node.folder._id}
                                    node={node}
                                    depth={1}
                                    compact
                                    currentFolderId={currentFolderId}
                                    selectedDocumentId={selectedDocumentId}
                                    expandedIds={expandedIds}
                                    docsByFolderKey={docsByFolderKey}
                                    editing={editing}
                                    canMutate={canMutate}
                                    dropEnabled={dropEnabled}
                                    fileRowHandlers={fileRowHandlers}
                                    rowById={rowById}
                                    onToggleExpand={toggleExpand}
                                    onSelectFolder={navigateToFolder}
                                    onSelectDocument={openDocument}
                                    onStartEdit={setEditing}
                                    onEditChange={(v) =>
                                      setEditing((prev) =>
                                        prev ? { ...prev, value: v } : prev,
                                      )
                                    }
                                    onCommitEdit={() => void commitEdit()}
                                    onCancelEdit={cancelEdit}
                                    onDeleteFolder={handleDeleteFolder}
                                    onNewSubfolder={openNewSubfolder}
                                    onDownloadFolder={onDownloadFolder}
                                    downloadingFolderId={downloadingFolderId}
                                    downloadBusy={downloadBusy}
                                    folderDragVisual={folderDragVisual}
                                    osFileDropEnabled={osFileDropEnabled}
                                    onOsFilesDropped={onOsFilesDropped}
                                    organizationId={organizationId}
                                    memberUserKey={memberUserKey}
                                    folderCountById={folderCountById}
                                    folderDownloadableCountById={
                                      folderDownloadableCountById
                                    }
                                    crossFileTransferEnabled={
                                      crossFileTransferEnabled
                                    }
                                    onMoveCopyFolder={onMoveCopyFolder}
                                  />
                                ))}
                              </ul>
                            </FileTaskContainer>
                          );
                        })}
                    </ul>
                  </li>
                ) : null}

                <li className="min-w-0">
                  {orderedFileTasks.length > 0 ? (
                    <div className="px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Unassigned
                    </div>
                  ) : null}
                  <FolderDropZone
                    folderId={null}
                    enabled={dropEnabled}
                    isNestTarget={rootNestTarget}
                    osFileDropEnabled={osFileDropEnabled}
                    onOsFilesDrop={(files) => onOsFilesDropped?.(files, null)}
                    className="min-w-0 rounded-dlc-sm"
                  >
                    {rootDocs.length === 0 &&
                    visibleTree.length === 0 &&
                    orderedFileTasks.length === 0 ? (
                      <div
                        className="px-3 py-4 text-center"
                        data-testid="document-vault-explorer-empty"
                      >
                        <p className="text-xs text-muted-foreground">
                          Drop files here, upload, or use{" "}
                          <span className="font-medium text-foreground">
                            + Tasks
                          </span>{" "}
                          to get started.
                        </p>
                      </div>
                    ) : null}
                    <ul className="min-w-0 space-y-0">
                        {rootDocs.map((doc) => {
                      const docId =
                        "_id" in doc
                          ? doc._id
                          : (doc as VaultTreeDocument)._id;
                      const docTitle =
                        "title" in doc
                          ? doc.title
                          : (doc as VaultTreeDocument).title;
                      const vaultDoc: VaultTreeDocument = {
                        _id: docId,
                        title: docTitle,
                        folderId:
                          "folderId" in doc ? doc.folderId : undefined,
                      };
                      return (
                        <MemoDocumentTreeRow
                          key={String(docId)}
                          doc={vaultDoc}
                          row={rowById.get(String(docId))}
                          depth={0}
                          density="compact"
                          isSelected={selectedDocumentId === docId}
                          canMutate={canMutate}
                          fileRowHandlers={fileRowHandlers}
                          organizationId={organizationId}
                          memberUserKey={memberUserKey}
                          isEditing={
                            editing?.type === "document" &&
                            editing.documentId === docId
                          }
                          editValue={
                            editing?.type === "document" &&
                            editing.documentId === docId
                              ? editing.value
                              : docTitle
                          }
                          onStartEdit={() =>
                            setEditing({
                              id: `document:${docId}`,
                              type: "document",
                              value: docTitle,
                              documentId: docId,
                            })
                          }
                          onEditChange={(v) =>
                            setEditing((prev) =>
                              prev ? { ...prev, value: v } : prev,
                            )
                          }
                          onCommitEdit={() => void commitEdit()}
                          onCancelEdit={cancelEdit}
                          onSelect={() => openDocument(docId)}
                        />
                      );
                    })}
                        {visibleTree.map((node) => (
                          <MemoTreeNode
                            key={node.folder._id}
                            node={node}
                            depth={0}
                            compact
                            currentFolderId={currentFolderId}
                        selectedDocumentId={selectedDocumentId}
                        expandedIds={expandedIds}
                        docsByFolderKey={docsByFolderKey}
                        editing={editing}
                        canMutate={canMutate}
                        dropEnabled={dropEnabled}
                        fileRowHandlers={fileRowHandlers}
                        rowById={rowById}
                        onToggleExpand={toggleExpand}
                        onSelectFolder={navigateToFolder}
                        onSelectDocument={openDocument}
                        onStartEdit={setEditing}
                        onEditChange={(v) =>
                          setEditing((prev) =>
                            prev ? { ...prev, value: v } : prev,
                          )
                        }
                        onCommitEdit={() => void commitEdit()}
                        onCancelEdit={cancelEdit}
                        onDeleteFolder={handleDeleteFolder}
                        onNewSubfolder={openNewSubfolder}
                        onDownloadFolder={onDownloadFolder}
                        downloadingFolderId={downloadingFolderId}
                        downloadBusy={downloadBusy}
                        folderDragVisual={folderDragVisual}
                        osFileDropEnabled={osFileDropEnabled}
                        onOsFilesDropped={onOsFilesDropped}
                        organizationId={organizationId}
                        memberUserKey={memberUserKey}
                            folderCountById={folderCountById}
                            folderDownloadableCountById={
                              folderDownloadableCountById
                            }
                            crossFileTransferEnabled={crossFileTransferEnabled}
                            onMoveCopyFolder={onMoveCopyFolder}
                          />
                        ))}
                      </ul>
                      {canMutate ? (
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 border-t border-border/30 px-2 pt-1 pb-1.5">
                          <input
                            ref={unassignedUploadInputRef}
                            type="file"
                            className="sr-only"
                            multiple
                            onChange={(e) => {
                              const files = e.target.files
                                ? Array.from(e.target.files)
                                : [];
                              e.target.value = "";
                              if (files.length > 0) {
                                onOsFilesDropped?.(files, null);
                              }
                            }}
                          />
                          <button
                            type="button"
                            className="inline-flex items-center gap-0.5 rounded-dlc-sm px-1 py-0.5 text-[10px] font-medium text-sky-700 hover:text-sky-900 dark:text-sky-400"
                            onClick={() => unassignedUploadInputRef.current?.click()}
                          >
                            <Upload className="h-3 w-3 shrink-0" aria-hidden />
                            Upload
                          </button>
                          {onImportFromContact ? (
                            <button
                              type="button"
                              className="inline-flex items-center gap-0.5 rounded-dlc-sm px-1 py-0.5 text-[10px] font-medium text-amber-700 hover:text-amber-900 dark:text-amber-400"
                              onClick={onImportFromContact}
                            >
                              <Link2 className="h-3 w-3 shrink-0" aria-hidden />
                              Link Document
                            </button>
                          ) : null}
                          <button
                            type="button"
                            className="inline-flex items-center gap-0.5 rounded-dlc-sm px-1 py-0.5 text-[10px] font-medium text-sky-700 hover:text-sky-900 dark:text-sky-400"
                            onClick={() => {
                              setNewFolderParentId(null);
                              setNewFolderTaskId(null);
                              setNewFolderOpen(true);
                            }}
                          >
                            <FolderPlus className="h-3 w-3 shrink-0" aria-hidden />
                            New Folder
                          </button>
                        </div>
                      ) : null}
                    </FolderDropZone>
                  </li>
              </>
            ) : (
              <li className="px-2 py-3 text-xs text-muted-foreground">
                No folders or files match your search.
              </li>
            )}
          </ul>
        )}
      </nav>

      {onToggleShowArchived ? (
        <div className="border-t border-border/40 px-2 py-1">
          <button
            type="button"
            className="text-[10px] font-medium text-muted-foreground hover:text-foreground"
            onClick={onToggleShowArchived}
            data-testid="document-vault-show-archived-tasks"
          >
            {showArchived ? "Hide archived tasks" : "Show archived tasks"}
            {archivedFileTasks && archivedFileTasks.length > 0
              ? ` (${archivedFileTasks.length})`
              : ""}
          </button>
          {showArchived && archivedFileTasks && archivedFileTasks.length > 0 ? (
            <ul className="mt-1 space-y-0.5">
              {archivedFileTasks.map((task) => (
                <li
                  key={task._id}
                  className="flex items-center justify-between rounded-dlc-sm border border-border/50 bg-muted/20 px-2 py-1"
                >
                  <span className="truncate text-xs text-muted-foreground">
                    {task.title}
                  </span>
                  {canMutate && memberUserKey ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-6 gap-1 px-1.5 text-[10px]"
                      onClick={() => {
                        void restoreFileTask({
                          fileTaskId: task._id,
                          memberUserKey,
                        });
                      }}
                    >
                      <ArchiveRestore className="h-3 w-3" aria-hidden />
                      Restore
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      <FolderNameDialog
        open={newFolderOpen}
        title={
          newFolderParentId
            ? `New folder in ${
                folders?.find((f) => f._id === newFolderParentId)?.name ??
                "folder"
              }`
            : newFolderTaskId
              ? "New folder in file task"
              : "New folder"
        }
        confirmLabel="Create folder"
        onClose={() => {
          setNewFolderOpen(false);
          setNewFolderTaskId(null);
          setNewFolderParentId(null);
        }}
        onSubmit={handleCreateFolder}
      />

      {deleteTarget ? (
        <FolderDeleteConfirmModal
          open
          folderId={deleteTarget.id}
          memberUserKey={memberUserKey}
          onClose={() => setDeleteTarget(null)}
          onDeleted={() => {
            if (currentFolderId === deleteTarget.id) {
              const parent =
                folders?.find((f) => f._id === deleteTarget.id)
                  ?.parentFolderId ?? null;
              navigateToFolder(parent);
            }
          }}
          onError={onError}
        />
      ) : null}

      {archiveFileTaskTarget ? (
        <OverlayShell
          open
          onClose={() => setArchiveFileTaskTarget(null)}
          aria-label="Archive file task"
          panelClassName="w-full max-w-md p-5"
        >
          <h3 className="text-sm font-semibold text-foreground">
            Archive file task?
          </h3>
          <p className="mt-2 text-xs text-muted-foreground">
            &ldquo;{archiveFileTaskTarget.title}&rdquo; will be hidden from the
            active vault and client portal. Contents stay assigned. You can
            restore it later.
          </p>
          <div className="mt-5 flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setArchiveFileTaskTarget(null)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                void (async () => {
                  if (!memberUserKey) return;
                  try {
                    await archiveFileTask({
                      fileTaskId: archiveFileTaskTarget._id,
                      memberUserKey,
                    });
                  } catch (e) {
                    onError(e instanceof Error ? e.message : String(e));
                  } finally {
                    setArchiveFileTaskTarget(null);
                  }
                })();
              }}
            >
              <Archive className="h-3.5 w-3.5" aria-hidden />
              Archive
            </Button>
          </div>
        </OverlayShell>
      ) : null}

      {deleteFileTaskTarget ? (
        <OverlayShell
          open
          onClose={() => setDeleteFileTaskTarget(null)}
          aria-label="Delete file task"
          panelClassName="w-full max-w-md p-5"
        >
          <h3 className="text-sm font-semibold text-destructive">
            Permanently delete file task?
          </h3>
          <p className="mt-2 text-xs text-muted-foreground">
            &ldquo;{deleteFileTaskTarget.title}&rdquo; and all linked documents
            will be permanently removed. Storage files will be deleted. This
            cannot be undone.
          </p>
          <div className="mt-5 flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setDeleteFileTaskTarget(null)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="primary"
              size="sm"
              className="bg-destructive hover:bg-destructive/90"
              onClick={() => {
                void (async () => {
                  if (!memberUserKey) return;
                  try {
                    await deleteFileTask({
                      fileTaskId: deleteFileTaskTarget._id,
                      strategy: "delete_contents",
                      memberUserKey,
                    });
                  } catch (e) {
                    onError(e instanceof Error ? e.message : String(e));
                  } finally {
                    setDeleteFileTaskTarget(null);
                  }
                })();
              }}
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden />
              Delete forever
            </Button>
          </div>
        </OverlayShell>
      ) : null}

      {rejectFileTaskTarget ? (
        <FileTaskRejectModal
          open
          taskTitle={rejectFileTaskTarget.title}
          onClose={() => setRejectFileTaskTarget(null)}
          onConfirm={async (note) => {
            if (!memberUserKey) return;
            await rejectReview({
              fileTaskId: rejectFileTaskTarget._id,
              rejectionNote: note,
              memberUserKey,
            });
          }}
        />
      ) : null}

      {executionFileTask ? (
        <FileTaskExecutionModal
          open
          onClose={() => setExecutionFileTask(null)}
          fileTask={executionFileTask}
          pipelineFileId={pipelineFileId}
          memberUserKey={memberUserKey}
          canMutate={canMutate}
          onAcceptReview={
            canMutate && memberUserKey
              ? async () => {
                  await acceptReview({
                    fileTaskId: executionFileTask._id,
                    memberUserKey,
                  });
                }
              : undefined
          }
          onRejectReview={
            canMutate
              ? () => setRejectFileTaskTarget(executionFileTask)
              : undefined
          }
          onResetForClient={
            canMutate && memberUserKey
              ? async () => {
                  await resetForClient({
                    fileTaskId: executionFileTask._id,
                    memberUserKey,
                  });
                }
              : undefined
          }
          onEdit={
            canMutate
              ? () => {
                  setConfigFileTask(executionFileTask);
                  setExecutionFileTask(null);
                }
              : undefined
          }
        />
      ) : null}

      {configFileTask && memberUserKey ? (
        <FileTaskConfigModal
          open
          mode="edit"
          initialTask={configFileTask}
          pipelineFileId={pipelineFileId}
          memberUserKey={memberUserKey}
          onClose={() => setConfigFileTask(null)}
          onSubmit={async (payload) => {
            await updateTaskConfig({
              fileTaskId: configFileTask._id,
              title: payload.title,
              description: payload.description,
              taskType: payload.taskType,
              clientInstructionText: payload.clientInstructionText,
              instructionUrl: payload.instructionUrl,
              assignedBlockEntries: payload.assignedBlockEntries,
              clientTemplateAttachments: payload.clientTemplateAttachments?.map(
                (a) => ({
                  storageId: a.storageId as Id<"_storage">,
                  fileName: a.fileName,
                  mimeType: a.mimeType,
                  size: a.size,
                }),
              ),
              isRequired: payload.isRequired,
              isPortalVisible: payload.isPortalVisible,
              dueDate: payload.dueDate ?? null,
              priority: payload.priority ?? null,
              memberUserKey,
            });
            setConfigFileTask(null);
          }}
        />
      ) : null}
    </div>
  );
}
