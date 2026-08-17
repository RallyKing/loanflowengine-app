"use client";

import { useCallback, useMemo, useState } from "react";
import { useMutation } from "convex/react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { useConvex } from "convex/react";
import { Button } from "@/components/ui/Button";
import { OverlayShell } from "@/components/ui/OverlayShell";
import { OperationalCheckbox } from "@/components/ui/OperationalCheckbox";
import { cn } from "@/lib/cn";
import {
  buildFolderTree,
  type DocumentFolderRow,
  type FolderTreeNode,
} from "@/lib/library/documentVaultFolders";
import {
  compileDealBible,
  dealBibleFileName,
  downloadDealBiblePdf,
  type DealBibleCompileProgress,
} from "@/lib/library/pdfCompiler";
import { uploadFileToVault, type VaultUploadMutations } from "@/lib/library/uploadFileToVault";
import { vaultDocumentOutboundFileName } from "@/lib/library/vaultOutboundFileName";
import { pdfBytesToFile } from "@/lib/library/pdfManipulation";
import { compileVaultPackageZip } from "@/lib/library/compileVaultPackageZip";
import { buildVaultDocumentZipPath } from "@/lib/library/vaultZipPaths";
import { showOperationalToast } from "@/lib/ui/operationalToast";
import {
  BookOpen,
  ChevronDown,
  ChevronRight,
  FileText,
  Folder,
  GripVertical,
  Loader2,
  Trash2,
  X,
} from "lucide-react";

const COMPILED_PACKAGES_FOLDER = "Compiled Packages";
const ROOT_KEY = "__root__";

export type CompilerFileTask = Pick<
  Doc<"documentVaultFileTasks">,
  "_id" | "title" | "status" | "isArchived"
>;

export type CompilerOutputFormat = "pdf" | "zip";

export type DealBibleCompilerDocument = {
  _id: Id<"libraryDocuments">;
  title: string;
  latestVersionId?: Id<"libraryDocumentVersions">;
  latestFileName?: string;
  latestContentType?: string;
  folderId?: Id<"documentFolders">;
  fileTaskId?: Id<"documentVaultFileTasks">;
  linkScope: string;
  latestVersionNumber: number;
};

export type DealBibleStagingItem = {
  key: string;
  documentId: Id<"libraryDocuments">;
  versionId: Id<"libraryDocumentVersions">;
  title: string;
  folderId?: Id<"documentFolders">;
  fileName: string;
};

export type DealBibleCompilerModalProps = {
  open: boolean;
  onClose: () => void;
  pipelineFileId: Id<"pipeline">;
  organizationId?: Id<"organizations">;
  memberUserKey?: string;
  packageLabel: string;
  folders: DocumentFolderRow[] | undefined;
  fileTasks?: CompilerFileTask[];
  documents: DealBibleCompilerDocument[];
  vaultUploadMutations: VaultUploadMutations;
  onError: (message: string) => void;
};

function collectFolderIds(
  node: FolderTreeNode,
  out: Set<string>,
): void {
  out.add(String(node.folder._id));
  for (const child of node.children) collectFolderIds(child, out);
}

function folderSubtreeIds(
  folders: DocumentFolderRow[],
  folderId: Id<"documentFolders">,
): Set<string> {
  const tree = buildFolderTree(folders);
  const findNode = (nodes: FolderTreeNode[]): FolderTreeNode | null => {
    for (const n of nodes) {
      if (n.folder._id === folderId) return n;
      const child = findNode(n.children);
      if (child) return child;
    }
    return null;
  };
  const node = findNode(tree);
  const out = new Set<string>();
  if (node) collectFolderIds(node, out);
  return out;
}

function SortableStagingRow({
  item,
  onRemove,
}: {
  item: DealBibleStagingItem;
  onRemove: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.key });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={cn(
        "flex items-center gap-2 rounded-dlc-sm border border-border/60 bg-dlc-surface-high/80 px-2 py-1.5 text-xs",
        isDragging && "opacity-60 shadow-dlc-2",
      )}
      data-testid={`deal-bible-staging-${item.documentId}`}
    >
      <button
        type="button"
        className="inline-flex h-7 w-7 shrink-0 cursor-grab items-center justify-center rounded-dlc-sm text-muted-foreground hover:bg-muted/50 active:cursor-grabbing"
        aria-label={`Reorder ${item.title}`}
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-3.5 w-3.5" aria-hidden />
      </button>
      <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
      <span className="min-w-0 flex-1 truncate font-medium">{item.title}</span>
      <button
        type="button"
        className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-dlc-sm text-muted-foreground hover:bg-muted hover:text-destructive"
        aria-label={`Remove ${item.title}`}
        onClick={onRemove}
      >
        <X className="h-3.5 w-3.5" aria-hidden />
      </button>
    </li>
  );
}

function SourceTreeNode({
  node,
  depth,
  docsByFolder,
  folders,
  stagingDocIds,
  expandedIds,
  onToggleExpand,
  onToggleFolder,
  onToggleDocument,
}: {
  node: FolderTreeNode;
  depth: number;
  docsByFolder: Map<string, DealBibleCompilerDocument[]>;
  folders: DocumentFolderRow[];
  stagingDocIds: Set<string>;
  expandedIds: Set<string>;
  onToggleExpand: (id: Id<"documentFolders">) => void;
  onToggleFolder: (folderId: Id<"documentFolders">, checked: boolean) => void;
  onToggleDocument: (doc: DealBibleCompilerDocument, checked: boolean) => void;
}) {
  const id = node.folder._id;
  const folderDocs = docsByFolder.get(String(id)) ?? [];
  const subtree = folderSubtreeIds(folders, id);
  const folderCompilable = [...subtree].flatMap(
    (fid) => docsByFolder.get(fid) ?? [],
  );
  const folderChecked =
    folderCompilable.length > 0 &&
    folderCompilable.every((d) => stagingDocIds.has(String(d._id)));
  const isExpanded = expandedIds.has(String(id));
  const hasChildren = node.children.length > 0 || folderDocs.length > 0;

  return (
    <li>
      <div
        className="flex min-w-0 items-center gap-1 py-0.5"
        style={{ paddingLeft: `${depth * 12 + 4}px` }}
      >
        {hasChildren ? (
          <button
            type="button"
            className="inline-flex h-6 w-6 shrink-0 items-center justify-center text-muted-foreground"
            onClick={() => onToggleExpand(id)}
            aria-label={isExpanded ? "Collapse" : "Expand"}
          >
            {isExpanded ? (
              <ChevronDown className="h-3.5 w-3.5" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5" />
            )}
          </button>
        ) : (
          <span className="inline-block h-6 w-6 shrink-0" />
        )}
        <OperationalCheckbox
          checked={folderChecked}
          onChange={(e) => onToggleFolder(id, e.target.checked)}
          aria-label={`Select folder ${node.folder.name}`}
          disabled={folderCompilable.length === 0}
        />
        <Folder className="h-3.5 w-3.5 shrink-0 text-amber-500" aria-hidden />
        <span className="truncate text-xs font-medium">{node.folder.name}</span>
        {folderCompilable.length > 0 ? (
          <span className="text-[10px] text-muted-foreground">
            ({folderCompilable.length})
          </span>
        ) : null}
      </div>
      {isExpanded ? (
        <ul>
          {folderDocs.map((doc) => (
            <li key={doc._id}>
              <label
                className="flex min-w-0 cursor-pointer items-center gap-1.5 py-0.5"
                style={{ paddingLeft: `${(depth + 1) * 12 + 28}px` }}
              >
                <OperationalCheckbox
                  checked={stagingDocIds.has(String(doc._id))}
                  onChange={(e) => onToggleDocument(doc, e.target.checked)}
                  aria-label={`Select ${doc.title}`}
                />
                <FileText className="h-3 w-3 shrink-0 text-muted-foreground" />
                <span className="truncate text-xs">{doc.title}</span>
              </label>
            </li>
          ))}
          {node.children.map((child) => (
            <SourceTreeNode
              key={child.folder._id}
              node={child}
              depth={depth + 1}
              docsByFolder={docsByFolder}
              folders={folders}
              stagingDocIds={stagingDocIds}
              expandedIds={expandedIds}
              onToggleExpand={onToggleExpand}
              onToggleFolder={onToggleFolder}
              onToggleDocument={onToggleDocument}
            />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

export function DealBibleCompilerModal({
  open,
  onClose,
  pipelineFileId,
  organizationId,
  memberUserKey,
  packageLabel,
  folders,
  fileTasks,
  documents,
  vaultUploadMutations,
  onError,
}: DealBibleCompilerModalProps) {
  const convex = useConvex();
  const createFolder = useMutation(api.documentFolders.createFolder);
  const recordPackageCompiled = useMutation(api.webhooks.recordBrokerDealPackageCompiled);

  const notifyPackageCompiled = useCallback(
    (documentCount: number) => {
      if (!organizationId) return;
      void recordPackageCompiled({
        organizationId,
        pipelineFileId,
        packageLabel,
        documentCount,
        memberUserKey,
      }).catch(() => {
        /* webhook fan-out must not block compile UX */
      });
    },
    [
      memberUserKey,
      organizationId,
      packageLabel,
      pipelineFileId,
      recordPackageCompiled,
    ],
  );

  const [staging, setStaging] = useState<DealBibleStagingItem[]>([]);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [rootExpanded, setRootExpanded] = useState(true);
  const [compiling, setCompiling] = useState(false);
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState<DealBibleCompileProgress | null>(
    null,
  );
  const [compiledBytes, setCompiledBytes] = useState<Uint8Array | null>(null);
  const [compiledZipBlob, setCompiledZipBlob] = useState<Blob | null>(null);
  const [outputFormat, setOutputFormat] =
    useState<CompilerOutputFormat>("pdf");

  const compilableDocs = useMemo(
    () =>
      documents.filter(
        (d) =>
          d.linkScope === "pipeline" &&
          d.latestVersionNumber > 0 &&
          d.latestVersionId,
      ),
    [documents],
  );

  const docsByFolder = useMemo(() => {
    const map = new Map<string, DealBibleCompilerDocument[]>();
    for (const doc of compilableDocs) {
      const key = doc.folderId ? String(doc.folderId) : ROOT_KEY;
      const list = map.get(key) ?? [];
      list.push(doc);
      map.set(key, list);
    }
    for (const [, list] of map) {
      list.sort((a, b) =>
        a.title.localeCompare(b.title, undefined, { sensitivity: "base" }),
      );
    }
    return map;
  }, [compilableDocs]);

  const rootDocs = docsByFolder.get(ROOT_KEY) ?? [];
  const tree = useMemo(() => buildFolderTree(folders ?? []), [folders]);
  const stagingDocIds = useMemo(
    () => new Set(staging.map((s) => String(s.documentId))),
    [staging],
  );

  const addDocToStaging = useCallback((doc: DealBibleCompilerDocument) => {
    if (!doc.latestVersionId) return;
    setStaging((prev) => {
      if (prev.some((p) => p.documentId === doc._id)) return prev;
      return [
        ...prev,
        {
          key: `doc:${doc._id}`,
          documentId: doc._id,
          versionId: doc.latestVersionId!,
          title: doc.title,
          folderId: doc.folderId,
          fileName: vaultDocumentOutboundFileName(doc),
        },
      ];
    });
    setCompiledBytes(null);
    setCompiledZipBlob(null);
  }, []);

  const removeDocFromStaging = useCallback((documentId: Id<"libraryDocuments">) => {
    setStaging((prev) => prev.filter((p) => p.documentId !== documentId));
    setCompiledBytes(null);
    setCompiledZipBlob(null);
  }, []);

  const onToggleDocument = useCallback(
    (doc: DealBibleCompilerDocument, checked: boolean) => {
      if (checked) addDocToStaging(doc);
      else removeDocFromStaging(doc._id);
    },
    [addDocToStaging, removeDocFromStaging],
  );

  const onToggleFolder = useCallback(
    (folderId: Id<"documentFolders">, checked: boolean) => {
      if (!folders) return;
      const ids = folderSubtreeIds(folders, folderId);
      const docs = [...ids].flatMap((fid) => docsByFolder.get(fid) ?? []);
      if (checked) {
        setStaging((prev) => {
          const next = [...prev];
          for (const doc of docs) {
            if (!doc.latestVersionId) continue;
            if (next.some((p) => p.documentId === doc._id)) continue;
            next.push({
              key: `doc:${doc._id}`,
              documentId: doc._id,
              versionId: doc.latestVersionId,
              title: doc.title,
              folderId: doc.folderId,
              fileName: vaultDocumentOutboundFileName(doc),
            });
          }
          return next;
        });
      } else {
        const removeIds = new Set(docs.map((d) => String(d._id)));
        setStaging((prev) =>
          prev.filter((p) => !removeIds.has(String(p.documentId))),
        );
      }
      setCompiledBytes(null);
      setCompiledZipBlob(null);
    },
    [docsByFolder, folders],
  );

  const activeFileTasks = useMemo(
    () => (fileTasks ?? []).filter((t) => !t.isArchived),
    [fileTasks],
  );

  const docsForTask = useCallback(
    (taskId: Id<"documentVaultFileTasks">) =>
      compilableDocs.filter((d) => d.fileTaskId === taskId),
    [compilableDocs],
  );

  const onToggleFileTask = useCallback(
    (taskId: Id<"documentVaultFileTasks">, checked: boolean) => {
      const docs = docsForTask(taskId);
      if (checked) {
        for (const doc of docs) addDocToStaging(doc);
      } else {
        const removeIds = new Set(docs.map((d) => String(d._id)));
        setStaging((prev) =>
          prev.filter((p) => !removeIds.has(String(p.documentId))),
        );
        setCompiledBytes(null);
        setCompiledZipBlob(null);
      }
    },
    [addDocToStaging, docsForTask],
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const handleStagingDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setStaging((prev) => {
      const oldIndex = prev.findIndex((p) => p.key === active.id);
      const newIndex = prev.findIndex((p) => p.key === over.id);
      if (oldIndex < 0 || newIndex < 0) return prev;
      return arrayMove(prev, oldIndex, newIndex);
    });
    setCompiledBytes(null);
    setCompiledZipBlob(null);
  };

  const runCompileZip = async (): Promise<Blob> => {
    if (!memberUserKey || staging.length === 0) {
      throw new Error("Add documents to the package first.");
    }
    setCompiling(true);
    setCompiledZipBlob(null);
    try {
      const items = [];
      for (const row of staging) {
        const urlResult = await convex.query(api.libraryDocuments.getVersionUrl, {
          documentId: row.documentId,
          versionId: row.versionId,
          memberUserKey,
        });
        if (urlResult.status !== "ok" || !urlResult.url) {
          throw new Error(`Could not load ${row.title}`);
        }
        const zipPath = buildVaultDocumentZipPath(
          folders ?? [],
          row.folderId,
          row.fileName,
        );
        items.push({
          documentId: row.documentId,
          versionId: row.versionId,
          fileName: row.fileName,
          url: urlResult.url,
          zipPath,
        });
      }
      const blob = await compileVaultPackageZip(items);
      setCompiledZipBlob(blob);
      notifyPackageCompiled(staging.length);
      return blob;
    } finally {
      setCompiling(false);
    }
  };

  const runCompile = async (): Promise<Uint8Array> => {
    if (!memberUserKey || staging.length === 0) {
      throw new Error("Add documents to the package first.");
    }
    setCompiling(true);
    setProgress(null);
    setCompiledBytes(null);
    try {
      const items: Array<{
        title: string;
        url: string;
        contentType?: string;
      }> = [];
      for (const row of staging) {
        const doc = compilableDocs.find((d) => d._id === row.documentId);
        const urlResult = await convex.query(api.libraryDocuments.getVersionUrl, {
          documentId: row.documentId,
          versionId: row.versionId,
          memberUserKey,
        });
        if (urlResult.status !== "ok" || !urlResult.url) {
          throw new Error(`Could not load ${row.title}`);
        }
        items.push({
          title: row.title,
          url: urlResult.url,
          contentType: doc?.latestContentType ?? urlResult.contentType,
        });
      }
      const bytes = await compileDealBible({
        items,
        packageTitle: packageLabel,
        subtitle: `${staging.length} document${staging.length === 1 ? "" : "s"}`,
        onProgress: setProgress,
      });
      setCompiledBytes(bytes);
      notifyPackageCompiled(staging.length);
      return bytes;
    } finally {
      setCompiling(false);
    }
  };

  const handleCompile = () => {
    if (outputFormat === "zip") {
      void runCompileZip().catch((e) =>
        onError(e instanceof Error ? e.message : String(e)),
      );
      return;
    }
    void runCompile().catch((e) =>
      onError(e instanceof Error ? e.message : String(e)),
    );
  };

  const handleDownload = async () => {
    try {
      if (outputFormat === "zip") {
        const blob = compiledZipBlob ?? (await runCompileZip());
        const href = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = href;
        a.download = `${packageLabel.replace(/[^\w.-]+/g, "_")}-package.zip`;
        a.click();
        URL.revokeObjectURL(href);
        showOperationalToast({
          title: "ZIP download started",
          variant: "success",
        });
        return;
      }
      const bytes = compiledBytes ?? (await runCompile());
      downloadDealBiblePdf(bytes, dealBibleFileName(packageLabel));
      showOperationalToast({
        title: "Deal Bible downloaded",
        variant: "success",
      });
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    }
  };

  const resolveCompiledPackagesFolder = async (): Promise<Id<"documentFolders">> => {
    const existing = folders?.find(
      (f) => !f.parentFolderId && f.name === COMPILED_PACKAGES_FOLDER,
    );
    if (existing) return existing._id;
    const { folderId } = await createFolder({
      pipelineFileId,
      name: COMPILED_PACKAGES_FOLDER,
      memberUserKey,
    });
    return folderId;
  };

  const handleSaveToVault = async () => {
    if (!memberUserKey) return;
    setSaving(true);
    try {
      const folderId = await resolveCompiledPackagesFolder();
      if (outputFormat === "zip") {
        const blob = compiledZipBlob ?? (await runCompileZip());
        const fileName = `${packageLabel.replace(/[^\w.-]+/g, "_")}-package.zip`;
        const file = new File([blob], fileName, { type: "application/zip" });
        const title = `Deal Package ZIP — ${new Date().toLocaleDateString()}`;
        await uploadFileToVault({
          file,
          proof: { kind: "pipeline", pipelineFileId },
          memberUserKey,
          title,
          folderId,
          mutations: vaultUploadMutations,
        });
      } else {
        const bytes = compiledBytes ?? (await runCompile());
        const fileName = dealBibleFileName(packageLabel);
        const file = pdfBytesToFile(bytes, fileName);
        const title = `Deal Bible — ${new Date().toLocaleDateString()}`;
        await uploadFileToVault({
          file,
          proof: { kind: "pipeline", pipelineFileId },
          memberUserKey,
          title,
          folderId,
          mutations: vaultUploadMutations,
        });
      }
      showOperationalToast({
        title: "Saved to vault",
        description: `Placed in ${COMPILED_PACKAGES_FOLDER}`,
        variant: "success",
      });
      onClose();
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const toggleExpand = (id: Id<"documentFolders">) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      const key = String(id);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const rootFolderDocs = rootDocs;
  const rootAllChecked =
    rootFolderDocs.length > 0 &&
    rootFolderDocs.every((d) => stagingDocIds.has(String(d._id)));

  return (
    <OverlayShell
      open={open}
      onClose={onClose}
      layer="MODAL"
      wrapPanel={false}
      className="p-3 sm:p-4"
      aria-label="Compile Deal Package"
      data-testid="deal-bible-compiler-modal"
    >
      <div className="dlc-surface-overlay flex max-h-[min(90vh,52rem)] w-full max-w-5xl flex-col overflow-hidden rounded-dlc-lg border border-border/80 shadow-dlc-3">
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-border/60 px-4 py-3">
          <div>
            <h2 className="flex items-center gap-2 text-base font-semibold text-foreground">
              <BookOpen className="h-4 w-4 text-primary" aria-hidden />
              Compile Deal Package
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Select tasks, folders, and files. Build a merged PDF or a ZIP that
              preserves nested folder paths.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <span>Output</span>
              <select
                className="h-8 rounded-dlc-sm border border-border/70 bg-background px-2 text-xs"
                value={outputFormat}
                onChange={(e) => {
                  setOutputFormat(e.target.value as CompilerOutputFormat);
                  setCompiledBytes(null);
                  setCompiledZipBlob(null);
                }}
                data-testid="deal-compiler-output-format"
              >
                <option value="pdf">Merged PDF</option>
                <option value="zip">ZIP (folder tree)</option>
              </select>
            </label>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 w-8 shrink-0 p-0"
            aria-label="Close"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </Button>
          </div>
        </header>

        <div className="grid min-h-0 flex-1 grid-cols-1 gap-0 md:grid-cols-2 md:divide-x md:divide-border/60">
          <section
            className="flex min-h-0 flex-col p-3"
            aria-label="Source documents"
          >
            <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Source
            </h3>
            {activeFileTasks.length > 0 ? (
              <div className="mb-2 rounded-dlc-md border border-border/50 bg-dlc-surface-high/30 p-2">
                <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  File tasks
                </p>
                <ul className="space-y-1">
                  {activeFileTasks.map((task) => {
                    const taskDocs = docsForTask(task._id);
                    const allChecked =
                      taskDocs.length > 0 &&
                      taskDocs.every((d) => stagingDocIds.has(String(d._id)));
                    return (
                      <li key={task._id}>
                        <label className="flex cursor-pointer items-center gap-1.5 py-0.5 text-xs">
                          <OperationalCheckbox
                            checked={allChecked}
                            disabled={taskDocs.length === 0}
                            onChange={(e) =>
                              onToggleFileTask(task._id, e.target.checked)
                            }
                            aria-label={`Select task ${task.title}`}
                          />
                          <span className="truncate font-medium">{task.title}</span>
                          <span className="text-[10px] text-muted-foreground">
                            ({taskDocs.length})
                          </span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ) : null}
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain rounded-dlc-md border border-border/60 bg-dlc-surface-high/40 p-2">
              {folders === undefined ? (
                <div className="space-y-2 p-2">
                  <div className="h-6 animate-pulse rounded bg-muted/40" />
                  <div className="h-6 animate-pulse rounded bg-muted/30" />
                </div>
              ) : (
                <ul className="min-w-0">
                  <li>
                    <div className="flex items-center gap-1 py-0.5">
                      <button
                        type="button"
                        className="inline-flex h-6 w-6 items-center justify-center text-muted-foreground"
                        onClick={() => setRootExpanded((v) => !v)}
                      >
                        {rootExpanded ? (
                          <ChevronDown className="h-3.5 w-3.5" />
                        ) : (
                          <ChevronRight className="h-3.5 w-3.5" />
                        )}
                      </button>
                      <OperationalCheckbox
                        checked={rootAllChecked}
                        onChange={(e) => {
                          for (const doc of rootFolderDocs) {
                            onToggleDocument(doc, e.target.checked);
                          }
                        }}
                        aria-label="Select root documents"
                        disabled={rootFolderDocs.length === 0}
                      />
                      <Folder className="h-3.5 w-3.5 text-amber-500" />
                      <span className="text-xs font-medium">Root</span>
                    </div>
                    {rootExpanded ? (
                      <ul>
                        {rootFolderDocs.map((doc) => (
                          <li key={doc._id}>
                            <label className="flex cursor-pointer items-center gap-1.5 py-0.5 pl-10">
                              <OperationalCheckbox
                                checked={stagingDocIds.has(String(doc._id))}
                                onChange={(e) =>
                                  onToggleDocument(doc, e.target.checked)
                                }
                              />
                              <FileText className="h-3 w-3 text-muted-foreground" />
                              <span className="truncate text-xs">{doc.title}</span>
                            </label>
                          </li>
                        ))}
                        {tree.map((node) => (
                          <SourceTreeNode
                            key={node.folder._id}
                            node={node}
                            depth={0}
                            docsByFolder={docsByFolder}
                            folders={folders}
                            stagingDocIds={stagingDocIds}
                            expandedIds={expandedIds}
                            onToggleExpand={toggleExpand}
                            onToggleFolder={onToggleFolder}
                            onToggleDocument={onToggleDocument}
                          />
                        ))}
                      </ul>
                    ) : null}
                  </li>
                </ul>
              )}
            </div>
          </section>

          <section
            className="flex min-h-0 flex-col p-3"
            aria-label="Package staging"
          >
            <div className="mb-2 flex items-center justify-between gap-2">
              <h3 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Staging ({staging.length})
              </h3>
              {staging.length > 0 ? (
                <button
                  type="button"
                  className="inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-destructive"
                  onClick={() => {
                    setStaging([]);
                    setCompiledBytes(null);
                  }}
                >
                  <Trash2 className="h-3 w-3" />
                  Clear
                </button>
              ) : null}
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain rounded-dlc-md border border-border/60 bg-dlc-surface-high/40 p-2">
              {staging.length === 0 ? (
                <p className="px-2 py-6 text-center text-xs text-muted-foreground">
                  Select folders or files from the source tree. Drag rows here
                  to set the final package order.
                </p>
              ) : (
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={handleStagingDragEnd}
                >
                  <SortableContext
                    items={staging.map((s) => s.key)}
                    strategy={verticalListSortingStrategy}
                  >
                    <ul className="space-y-1">
                      {staging.map((item) => (
                        <SortableStagingRow
                          key={item.key}
                          item={item}
                          onRemove={() => removeDocFromStaging(item.documentId)}
                        />
                      ))}
                    </ul>
                  </SortableContext>
                </DndContext>
              )}
            </div>
          </section>
        </div>

        <footer className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-border/60 px-4 py-3">
          <div className="min-w-0 text-xs text-muted-foreground">
            {compiling && progress ? (
              <span className="inline-flex items-center gap-1.5">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                {progress.message ?? progress.phase} ({progress.current}/
                {progress.total})
              </span>
            ) : compiledBytes || compiledZipBlob ? (
              <span className="text-emerald-600 dark:text-emerald-400">
                Package ready
              </span>
            ) : (
              <span>{staging.length} file(s) queued</span>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={staging.length === 0 || compiling || saving}
              onClick={handleCompile}
              data-testid="deal-bible-compile"
            >
              {compiling ? (
                <>
                  <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                  Compiling…
                </>
              ) : outputFormat === "zip" ? (
                "Compile ZIP"
              ) : (
                "Compile PDF"
              )}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={staging.length === 0 || compiling || saving}
              onClick={() => void handleDownload()}
              data-testid="deal-bible-download"
            >
              {outputFormat === "zip" ? "Download ZIP" : "Download PDF"}
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={
                staging.length === 0 || compiling || saving || !memberUserKey
              }
              onClick={() => void handleSaveToVault()}
              data-testid="deal-bible-save-vault"
            >
              {saving ? (
                <>
                  <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                  Saving…
                </>
              ) : (
                "Save to Vault"
              )}
            </Button>
          </div>
        </footer>
      </div>
    </OverlayShell>
  );
}
