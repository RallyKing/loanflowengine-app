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
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
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
  MoreVertical,
  Pencil,
  Trash2,
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
import { cn } from "@/lib/cn";
import {
  buildFolderTree,
  type DocumentFolderRow,
  type FolderTreeNode,
} from "@/lib/library/documentVaultFolders";
import { useDocumentVaultState } from "@/lib/library/documentVaultState";
import { vaultFolderDropId } from "@/lib/library/documentVaultDnD";
import {
  isOsFileDragEvent,
  readOsFilesFromDragEvent,
} from "@/lib/library/documentVaultOsFileDrop";
import { FolderNameDialog } from "@/components/pipeline/tabs/DocumentVaultFolderDialogs";
import { DocumentVaultExplorerFileRow } from "@/components/library/DocumentVaultExplorerFileRow";
import type { LibraryDocumentListRow } from "@/components/library/LibraryDocumentsList";
import type { LibraryDocumentsProof } from "@/components/LibraryDocumentsPanel";

export type VaultTreeDocument = {
  _id: Id<"libraryDocuments">;
  title: string;
  folderId?: Id<"documentFolders">;
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
  onToggleExpanded: (id: Id<"libraryDocuments">) => void;
  onMoveDoc: (row: LibraryDocumentListRow) => void;
  onOpenProperties: (id: Id<"libraryDocuments">) => void;
  onSaveToContact: (row: LibraryDocumentListRow) => void;
  onAssignToRegistry: (row: LibraryDocumentListRow) => void;
  onDownloadAsPdf: (row: LibraryDocumentListRow) => void;
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
  optimisticSiblingOrder?: Record<string, Id<"documentFolders">[]>;
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
const ROW_H = "h-8";

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
          (isNestTarget || isOver) &&
          "border border-blue-400/80 bg-blue-50 font-medium text-foreground ring-2 ring-inset ring-blue-400/40 dark:bg-blue-950/40",
        enabled &&
          !osDragOver &&
          isOver &&
          !isNestTarget &&
          "bg-primary/15 ring-2 ring-inset ring-primary/40",
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
        className="min-w-0 flex-1 rounded-dlc-sm border border-border/80 bg-dlc-surface px-1.5 py-0.5 text-xs outline-none ring-1 ring-primary/20 focus:ring-primary/40"
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
}: {
  doc: VaultTreeDocument;
  depth: number;
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
        onToggleExpanded={() => handlers.onToggleExpanded(row._id)}
        onMoveDoc={() => handlers.onMoveDoc(row)}
        onOpenProperties={() => handlers.onOpenProperties(row._id)}
        onSaveToContact={() => handlers.onSaveToContact(row)}
        onAssignToRegistry={() => handlers.onAssignToRegistry(row)}
        onDownloadAsPdf={() => handlers.onDownloadAsPdf(row)}
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
      />
    );
  }

  return (
    <li>
      <div
        className={cn(
          "group/doc flex min-w-0 items-center gap-0.5 rounded-dlc-sm pr-1",
          ROW_H,
          isSelected && "bg-primary/10 text-primary",
        )}
        style={{ paddingLeft: `${depth * 12 + 28}px` }}
      >
        <button
          type="button"
          className={cn(
            "flex min-w-0 flex-1 items-center gap-1.5 text-left text-xs",
            isSelected ? "font-semibold" : "font-medium text-foreground",
          )}
          data-testid={`document-vault-tree-document-${doc._id}`}
          onClick={onSelect}
        >
          <FileText
            className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
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
            className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-dlc-sm text-muted-foreground opacity-0 transition-opacity hover:bg-muted/60 group-hover/doc:opacity-100"
            aria-label={`Rename ${doc.title}`}
            onClick={(e) => {
              e.stopPropagation();
              onStartEdit();
            }}
          >
            <Pencil className="h-3 w-3" aria-hidden />
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

function TreeNode({
  node,
  depth,
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
  folderDragVisual,
  osFileDropEnabled,
  onOsFilesDropped,
}: {
  node: FolderTreeNode;
  depth: number;
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
  folderDragVisual?: FolderDragVisualState;
  osFileDropEnabled?: boolean;
  onOsFilesDropped?: (
    files: File[],
    parentFolderId: Id<"documentFolders"> | null,
  ) => void;
}) {
  const id = node.folder._id;
  const sortableId = vaultFolderSortableId(id);
  const isEditing =
    editing?.type === "folder" && editing.folderId === id;
  const {
    attributes,
    listeners,
    setNodeRef,
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
  const hasChildren = node.children.length > 0;
  const hasDocs = folderDocs.length > 0;
  const hasExpandable = hasChildren || hasDocs;
  const isExpanded = expandedIds.has(String(id));
  const isNestTarget =
    folderDragVisual?.mode === "nest" &&
    folderDragVisual.nestTargetFolderId === id;
  const showInsertLine =
    folderDragVisual?.mode === "insert" &&
    folderDragVisual.insertBeforeFolderId === id;
  const childSortableIds = node.children.map((c) =>
    vaultFolderSortableId(c.folder._id),
  );

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
          "group/folder flex min-w-0 items-center gap-0.5 rounded-dlc-sm pr-1",
          ROW_H,
          isSelected && "bg-primary/10 text-primary",
        )}
        style={{ paddingLeft: `${depth * 12 + 4}px` }}
      >
        {hasExpandable ? (
          <button
            type="button"
            className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-dlc-sm text-muted-foreground hover:bg-muted/60"
            aria-label={isExpanded ? "Collapse folder" : "Expand folder"}
            onClick={() => onToggleExpand(id)}
          >
            {isExpanded ? (
              <ChevronDown className="h-3.5 w-3.5" aria-hidden />
            ) : (
              <ChevronRight className="h-3.5 w-3.5" aria-hidden />
            )}
          </button>
        ) : (
          <span className="inline-block h-6 w-6 shrink-0" aria-hidden />
        )}
        <button
          type="button"
          className={cn(
            "relative z-[1] flex min-w-0 flex-1 items-center gap-1.5 text-left text-xs",
            isSelected ? "font-semibold" : "font-medium text-foreground",
          )}
          data-testid={`document-vault-tree-folder-${id}`}
          onClick={() => onSelectFolder(id)}
        >
          {isSelected ? (
            <FolderOpen className="h-3.5 w-3.5 shrink-0 text-amber-600" aria-hidden />
          ) : (
            <Folder className="h-3.5 w-3.5 shrink-0 text-amber-500" aria-hidden />
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
        </button>
        {canMutate && !isEditing ? (
          <>
            <button
              type="button"
              className={cn(
                "inline-flex h-6 w-6 shrink-0 cursor-grab touch-none items-center justify-center rounded-dlc-sm text-muted-foreground opacity-70 transition-opacity hover:bg-muted/60 hover:opacity-100 active:cursor-grabbing",
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
            <button
              type="button"
              className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-dlc-sm p-1 text-muted-foreground opacity-70 transition-colors hover:bg-destructive/10 hover:text-destructive hover:opacity-100"
              aria-label={`Delete folder ${node.folder.name}`}
              data-testid={`document-vault-folder-delete-btn-${id}`}
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                onDeleteFolder(id, node.folder.name);
              }}
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden />
            </button>
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
          </>
        ) : null}
      </FolderDropZone>
      {isExpanded ? (
        <SortableContext
          items={childSortableIds}
          strategy={verticalListSortingStrategy}
        >
          <ul className="min-w-0">
            {node.children.map((child) => (
              <MemoTreeNode
                key={child.folder._id}
                node={child}
                depth={depth + 1}
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
                folderDragVisual={folderDragVisual}
                osFileDropEnabled={osFileDropEnabled}
                onOsFilesDropped={onOsFilesDropped}
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
        </SortableContext>
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
  optimisticSiblingOrder,
}: DocumentVaultDirectoryTreeProps) {
  const {
    currentFolderId,
    selectedDocumentId,
    navigateToFolder,
    selectDocument,
  } = useDocumentVaultState();
  const createFolder = useMutation(api.documentFolders.createFolder);
  const renameFolder = useMutation(api.documentFolders.renameFolder);
  const patchDocumentTitle = useMutation(api.libraryDocuments.patchDocumentTitle);

  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set());
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [editing, setEditing] = useState<EditingState | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{
    id: Id<"documentFolders">;
    name: string;
  } | null>(null);
  const [navOsDragOver, setNavOsDragOver] = useState(false);

  const handleNavOsDragOver = useCallback(
    (e: React.DragEvent) => {
      if (!osFileDropEnabled || !isOsFileDragEvent(e)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
      setNavOsDragOver(true);
    },
    [osFileDropEnabled],
  );

  const handleNavOsDragLeave = useCallback(
    (e: React.DragEvent) => {
      if (!osFileDropEnabled || !isOsFileDragEvent(e)) return;
      const related = e.relatedTarget as Node | null;
      if (!e.currentTarget.contains(related)) {
        setNavOsDragOver(false);
      }
    },
    [osFileDropEnabled],
  );

  const handleNavOsDrop = useCallback(
    (e: React.DragEvent) => {
      if (!osFileDropEnabled || !isOsFileDragEvent(e)) return;
      e.preventDefault();
      setNavOsDragOver(false);
      const files = readOsFilesFromDragEvent(e);
      if (files.length > 0) {
        onOsFilesDropped?.(files, null);
      }
    },
    [onOsFilesDropped, osFileDropEnabled],
  );

  const tree = useMemo(
    () => buildFolderTree(folders ?? [], null, optimisticSiblingOrder),
    [folders, optimisticSiblingOrder],
  );

  const docsByFolderKey = useMemo(() => {
    const source: TreeDoc[] =
      documentRows ??
      (documents ?? []).map((d) => ({ ...d }));
    const map = new Map<string, TreeDoc[]>();
    for (const doc of source) {
      const folderId =
        "folderId" in doc ? doc.folderId : undefined;
      const key = folderId ? String(folderId) : ROOT_KEY;
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

  const visibleTree = useMemo(
    () => filterFolderTree(tree, vaultSearchQuery, docsByFolderKey),
    [tree, vaultSearchQuery, docsByFolderKey],
  );

  const rootDocs = docsByFolderKey.get(ROOT_KEY) ?? [];
  const searchActive = vaultSearchQuery.trim().length > 0;
  const explorerVisible =
    !searchActive || rootDocs.length > 0 || visibleTree.length > 0;

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
          parentFolderId: currentFolderId ?? undefined,
          memberUserKey,
        });
      } catch (e) {
        onError(e instanceof Error ? e.message : String(e));
        throw e;
      }
    },
    [createFolder, currentFolderId, memberUserKey, onError, pipelineFileId],
  );

  const handleDeleteFolder = useCallback(
    (folderId: Id<"documentFolders">, name: string) => {
      setDeleteTarget({ id: folderId, name });
    },
    [],
  );

  const rootSortableIds = useMemo(
    () => visibleTree.map((n) => vaultFolderSortableId(n.folder._id)),
    [visibleTree],
  );
  const rootNestTarget =
    folderDragVisual?.mode === "nest" &&
    folderDragVisual.nestTargetFolderId === null;

  return (
    <div
      className={cn(
        "dlc-surface-card flex min-h-[28rem] min-w-0 w-full flex-col shadow-dlc-2",
        className,
      )}
      data-testid="document-vault-unified-explorer"
      aria-label="Document vault explorer"
    >
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border/60 px-3 py-2">
        <div className="flex items-center gap-3">
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
                  onClick={() => setNewFolderOpen(true)}
                  data-testid="document-vault-new-folder"
                  title="New folder"
                >
                  <FolderPlus className="h-3 w-3" aria-hidden />
                </Button>
              </>
            ) : null}
          </div>
        </div>
      </div>

      <nav
        className={cn(
          "min-h-0 flex-1 overflow-y-auto overscroll-contain px-1.5 py-1.5",
          osFileDropEnabled &&
            navOsDragOver &&
            "rounded-dlc-sm bg-emerald-50/30 ring-2 ring-inset ring-emerald-600/30 dark:bg-emerald-950/20",
        )}
        onDragOver={handleNavOsDragOver}
        onDragLeave={handleNavOsDragLeave}
        onDrop={handleNavOsDrop}
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
              <li className="min-w-0">
                <FolderDropZone
                  folderId={null}
                  enabled={dropEnabled}
                  isNestTarget={rootNestTarget}
                  osFileDropEnabled={osFileDropEnabled}
                  onOsFilesDrop={(files) => onOsFilesDropped?.(files, null)}
                  className="min-w-0"
                >
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
                          isSelected={selectedDocumentId === docId}
                          canMutate={canMutate}
                          fileRowHandlers={fileRowHandlers}
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
                          onSelect={() => selectDocument(docId)}
                        />
                      );
                    })}
                    <SortableContext
                      items={rootSortableIds}
                      strategy={verticalListSortingStrategy}
                    >
                      {visibleTree.map((node) => (
                        <MemoTreeNode
                          key={node.folder._id}
                          node={node}
                          depth={0}
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
                          onSelectDocument={selectDocument}
                          onStartEdit={setEditing}
                          onEditChange={(v) =>
                            setEditing((prev) =>
                              prev ? { ...prev, value: v } : prev,
                            )
                          }
                          onCommitEdit={() => void commitEdit()}
                          onCancelEdit={cancelEdit}
                          onDeleteFolder={handleDeleteFolder}
                          folderDragVisual={folderDragVisual}
                          osFileDropEnabled={osFileDropEnabled}
                          onOsFilesDropped={onOsFilesDropped}
                        />
                      ))}
                    </SortableContext>
                  </ul>
                </FolderDropZone>
              </li>
            ) : (
              <li className="px-2 py-3 text-xs text-muted-foreground">
                No folders or files match your search.
              </li>
            )}
          </ul>
        )}
      </nav>

      <FolderNameDialog
        open={newFolderOpen}
        title="New folder"
        confirmLabel="Create folder"
        onClose={() => setNewFolderOpen(false)}
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
    </div>
  );
}
