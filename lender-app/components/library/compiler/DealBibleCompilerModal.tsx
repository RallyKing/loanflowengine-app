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
import type { Id } from "@/convex/_generated/dataModel";
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
import { pdfBytesToFile } from "@/lib/library/pdfManipulation";
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

export type DealBibleCompilerDocument = {
  _id: Id<"libraryDocuments">;
  title: string;
  latestVersionId?: Id<"libraryDocumentVersions">;
  latestFileName?: string;
  latestContentType?: string;
  folderId?: Id<"documentFolders">;
  linkScope: string;
  latestVersionNumber: number;
};

export type DealBibleStagingItem = {
  key: string;
  documentId: Id<"libraryDocuments">;
  versionId: Id<"libraryDocumentVersions">;
  title: string;
};

export type DealBibleCompilerModalProps = {
  open: boolean;
  onClose: () => void;
  pipelineFileId: Id<"pipeline">;
  memberUserKey?: string;
  packageLabel: string;
  folders: DocumentFolderRow[] | undefined;
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
  memberUserKey,
  packageLabel,
  folders,
  documents,
  vaultUploadMutations,
  onError,
}: DealBibleCompilerModalProps) {
  const convex = useConvex();
  const createFolder = useMutation(api.documentFolders.createFolder);

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
        },
      ];
    });
    setCompiledBytes(null);
  }, []);

  const removeDocFromStaging = useCallback((documentId: Id<"libraryDocuments">) => {
    setStaging((prev) => prev.filter((p) => p.documentId !== documentId));
    setCompiledBytes(null);
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
    },
    [docsByFolder, folders],
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
      return bytes;
    } finally {
      setCompiling(false);
    }
  };

  const handleCompile = () => {
    void runCompile().catch((e) =>
      onError(e instanceof Error ? e.message : String(e)),
    );
  };

  const handleDownload = async () => {
    try {
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
      const bytes = compiledBytes ?? (await runCompile());
      const folderId = await resolveCompiledPackagesFolder();
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
              Select sources, reorder the staging list, then build a unified PDF
              with cover page and table of contents.
            </p>
          </div>
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
        </header>

        <div className="grid min-h-0 flex-1 grid-cols-1 gap-0 md:grid-cols-2 md:divide-x md:divide-border/60">
          <section
            className="flex min-h-0 flex-col p-3"
            aria-label="Source documents"
          >
            <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Source
            </h3>
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
            ) : compiledBytes ? (
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
              Download PDF
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
