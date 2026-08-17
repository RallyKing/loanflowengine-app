"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import Cropper, { type Area, type MediaSize } from "react-easy-crop";
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
import { useMutation, useQuery } from "convex/react";
import {
  Crop,
  FileImage,
  GripVertical,
  Loader2,
  RefreshCw,
  RotateCcw,
  RotateCw,
  Save,
  Trash2,
} from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import type { LibraryDocumentsProof } from "@/components/LibraryDocumentsPanel";
import {
  DocumentManipulationToolbar,
  type VaultPreviewBreadcrumb,
} from "@/components/pipeline/tabs/DocumentManipulationToolbar";
import { guessAttachmentKind } from "@/lib/uploadToConvexStorage";
import {
  normalizeDocumentToPageAssets,
  normalizeImageFilesToPageAssets,
} from "@/lib/library/normalizeDocumentToPageAssets";
import { finalizePageAssetDocument } from "@/lib/library/finalizePageAssetDocument";
import {
  defaultFullCrop,
  pixelCropToStored,
  storedCropToPixel,
} from "@/lib/library/pageAssetTypes";
import type { VaultUploadMutations } from "@/lib/library/uploadFileToVault";

/** US Letter aspect — default until page media dimensions load. */
const DEFAULT_DOCUMENT_ASPECT = 8.5 / 11;

export type DocumentEditorCanvasProps = {
  fileName: string;
  contentType?: string;
  url: string | null | undefined;
  className?: string;
  documentId: Id<"libraryDocuments">;
  versionNumber?: number;
  proof: LibraryDocumentsProof;
  memberUserKey: string;
  canMutate?: boolean;
  vaultMutations: VaultUploadMutations & {
    finalizeDocument?: (args: {
      documentId: Id<"libraryDocuments">;
      proof: LibraryDocumentsProof;
      storageId: Id<"_storage">;
      fileName: string;
      contentType?: string;
      size?: number;
      memberUserKey: string;
    }) => Promise<{ version: number }>;
  };
  onError?: (message: string) => void;
  onVersionCommitted?: (version: number) => void;
  onCancelEditMode?: () => void;
  breadcrumbs?: VaultPreviewBreadcrumb[];
  onBreadcrumbSelect?: (folderId: Id<"documentFolders"> | null) => void;
  onClosePreview?: () => void;
  onToggleFullscreen?: () => void;
  previewFullscreen?: boolean;
  onOpenInWindow?: () => void;
  onOpenProperties?: () => void;
  /** When set, manipulation + editor action chrome portals here (modal toolbar slot). */
  toolbarSlot?: HTMLElement | null;
};

type PageRow = {
  _id: Id<"documentPageAssets">;
  url: string | null;
  order: number;
  sourceWidth: number;
  sourceHeight: number;
  cropData?: { x: number; y: number; w: number; h: number };
  rotation: number;
};

function SortablePageThumb({
  page,
  selected,
  disabled,
  onSelect,
}: {
  page: PageRow;
  selected: boolean;
  disabled: boolean;
  onSelect: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: page._id, disabled });

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
      className={cn(
        "flex items-center gap-1 rounded-dlc-sm border bg-background p-1",
        selected ? "border-primary ring-1 ring-primary/30" : "border-border/70",
        isDragging && "opacity-70 shadow-dlc-2",
      )}
    >
      <button
        type="button"
        className={cn(
          "inline-flex h-8 w-6 shrink-0 touch-none items-center justify-center text-muted-foreground",
          disabled ? "cursor-not-allowed opacity-40" : "cursor-grab active:cursor-grabbing",
        )}
        aria-label="Drag to reorder"
        disabled={disabled}
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        className="min-w-0 flex-1 overflow-hidden rounded-dlc-sm"
        onClick={onSelect}
      >
        {page.url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={page.url}
            alt=""
            className="aspect-[3/4] w-full object-cover"
          />
        ) : (
          <div className="flex aspect-[3/4] items-center justify-center bg-muted/30 text-[10px] text-muted-foreground">
            …
          </div>
        )}
        <span className="block truncate px-0.5 py-0.5 text-[10px] tabular-nums text-muted-foreground">
          p.{page.order + 1}
        </span>
      </button>
    </div>
  );
}

export function DocumentEditorCanvas({
  fileName,
  contentType,
  url,
  className,
  documentId,
  versionNumber = 0,
  proof,
  memberUserKey,
  canMutate = false,
  vaultMutations,
  onError,
  onVersionCommitted,
  onCancelEditMode,
  breadcrumbs,
  onBreadcrumbSelect,
  onClosePreview,
  onToggleFullscreen,
  previewFullscreen,
  onOpenInWindow,
  onOpenProperties,
  toolbarSlot = null,
}: DocumentEditorCanvasProps) {
  const pageAssetsQuery = useQuery(api.documentProcessing.listPageAssets, {
    documentId,
    memberUserKey,
  });
  const uploadAndNormalize = useMutation(
    api.documentProcessing.uploadAndNormalize,
  );
  const appendPageAssets = useMutation(api.documentProcessing.appendPageAssets);
  const patchPageAsset = useMutation(api.documentProcessing.patchPageAsset);
  const reorderPageAssets = useMutation(
    api.documentProcessing.reorderPageAssets,
  );
  const removePageAsset = useMutation(api.documentProcessing.removePageAsset);
  const finalizeDocumentMutation = useMutation(
    api.documentAssembly.finalizeDocument,
  );

  const [selectedId, setSelectedId] = useState<Id<"documentPageAssets"> | null>(
    null,
  );
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [busy, setBusy] = useState(false);
  const [normalizing, setNormalizing] = useState(false);
  const [convertMode, setConvertMode] = useState(false);
  const [isCropping, setIsCropping] = useState(false);
  const [aspect, setAspect] = useState(DEFAULT_DOCUMENT_ASPECT);
  const normalizeAttempted = useRef(false);
  const cropSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cropViewportRef = useRef<HTMLDivElement>(null);
  const mediaSizeRef = useRef<MediaSize | null>(null);

  const nudgeCropperLayout = useCallback(() => {
    window.dispatchEvent(new Event("resize"));
  }, []);

  useEffect(() => {
    normalizeAttempted.current = false;
    setSelectedId(null);
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setIsCropping(false);
    setAspect(DEFAULT_DOCUMENT_ASPECT);
    mediaSizeRef.current = null;
  }, [documentId, url]);

  const pages = useMemo(
    () => (pageAssetsQuery ?? []) as PageRow[],
    [pageAssetsQuery],
  );

  const selectedPage = pages.find((p) => p._id === selectedId) ?? pages[0];

  useEffect(() => {
    setIsCropping(false);
    mediaSizeRef.current = null;
    if (selectedPage?.sourceWidth && selectedPage?.sourceHeight) {
      setAspect(selectedPage.sourceWidth / selectedPage.sourceHeight);
    } else {
      setAspect(DEFAULT_DOCUMENT_ASPECT);
    }
  }, [selectedId, selectedPage?.sourceHeight, selectedPage?.sourceWidth]);

  useEffect(() => {
    if (pages.length > 0 && !selectedId) {
      setSelectedId(pages[0]._id);
    }
  }, [pages, selectedId]);

  useEffect(() => {
    if (!selectedPage) return;
    const stored = selectedPage.cropData
      ? storedCropToPixel(selectedPage.cropData)
      : storedCropToPixel(
          defaultFullCrop(selectedPage.sourceWidth, selectedPage.sourceHeight),
        );
    setCroppedAreaPixels({
      x: stored.x,
      y: stored.y,
      width: stored.width,
      height: stored.height,
    });
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    // reactivity-allow: reset crop UI when page identity/geometry changes, not on every selectedPage object identity
    // eslint-disable-next-line react-hooks/exhaustive-deps -- selectedPage primitives above
  }, [selectedPage?._id, selectedPage?.cropData, selectedPage?.sourceWidth, selectedPage?.sourceHeight]);

  const reportError = useCallback(
    (e: unknown) => {
      onError?.(e instanceof Error ? e.message : String(e));
    },
    [onError],
  );

  const runNormalize = useCallback(async () => {
    if (!url || !canMutate) return;
    const kind = guessAttachmentKind(contentType, fileName);
    if (kind !== "pdf" && kind !== "image") {
      throw new Error("Only PDF and image files can be opened in the editor.");
    }
    setNormalizing(true);
    try {
      const normalized = await normalizeDocumentToPageAssets({
        url,
        contentType,
        fileName,
        generateUploadUrl: vaultMutations.generateUploadUrl,
        proof,
        memberUserKey,
      });
      await uploadAndNormalize({
        documentId,
        proof,
        pages: normalized,
        memberUserKey,
      });
    } finally {
      setNormalizing(false);
    }
  }, [
    canMutate,
    contentType,
    documentId,
    fileName,
    memberUserKey,
    proof,
    uploadAndNormalize,
    url,
    vaultMutations.generateUploadUrl,
  ]);

  useEffect(() => {
    if (
      pageAssetsQuery === undefined ||
      normalizing ||
      normalizeAttempted.current ||
      !url ||
      !canMutate
    ) {
      return;
    }
    if (pageAssetsQuery.length === 0) {
      normalizeAttempted.current = true;
      void runNormalize().catch(reportError);
    }
  }, [
    pageAssetsQuery,
    normalizing,
    url,
    canMutate,
    runNormalize,
    reportError,
    documentId,
  ]);

  const persistCrop = useCallback(
    (pageAssetId: Id<"documentPageAssets">, area: Area) => {
      if (cropSaveTimer.current) clearTimeout(cropSaveTimer.current);
      cropSaveTimer.current = setTimeout(() => {
        void patchPageAsset({
          pageAssetId,
          proof,
          cropData: pixelCropToStored(area),
          memberUserKey,
        }).catch(reportError);
      }, 400);
    },
    [memberUserKey, patchPageAsset, proof, reportError],
  );

  const onCropComplete = useCallback(
    (_: Area, areaPixels: Area) => {
      setCroppedAreaPixels(areaPixels);
      if (selectedPage && canMutate) {
        persistCrop(selectedPage._id, areaPixels);
      }
    },
    [canMutate, persistCrop, selectedPage],
  );

  const normalizeToPage = useCallback(() => {
    setZoom(1);
    setCrop({ x: 0, y: 0 });

    const page = selectedPage;
    if (!page) return;

    const media = mediaSizeRef.current;
    const width = media?.naturalWidth ?? page.sourceWidth;
    const height = media?.naturalHeight ?? page.sourceHeight;

    if (width > 0 && height > 0) {
      setAspect(width / height);
      const fullArea: Area = { x: 0, y: 0, width, height };
      setCroppedAreaPixels(fullArea);
      if (canMutate) {
        persistCrop(page._id, fullArea);
      }
    }

    requestAnimationFrame(() => {
      nudgeCropperLayout();
      window.setTimeout(nudgeCropperLayout, 50);
    });
  }, [canMutate, nudgeCropperLayout, persistCrop, selectedPage]);

  const handleMediaLoaded = useCallback(
    (media: MediaSize) => {
      mediaSizeRef.current = media;
      const width = media.naturalWidth || media.width;
      const height = media.naturalHeight || media.height;
      if (width > 0 && height > 0) {
        setAspect(width / height);
        setZoom(1);
        setCrop({ x: 0, y: 0 });
        const fullArea: Area = { x: 0, y: 0, width, height };
        setCroppedAreaPixels(fullArea);
        if (selectedPage && canMutate) {
          persistCrop(selectedPage._id, fullArea);
        }
      }
      requestAnimationFrame(nudgeCropperLayout);
    },
    [canMutate, nudgeCropperLayout, persistCrop, selectedPage],
  );

  useEffect(() => {
    if (!isCropping || !selectedPage?.url) return;
    const t = window.setTimeout(() => normalizeToPage(), 0);
    return () => window.clearTimeout(t);
  }, [isCropping, normalizeToPage, selectedPage?._id, selectedPage?.url]);

  const handleRotate = useCallback(
    async (direction: "cw" | "ccw") => {
      if (!selectedPage || !canMutate) return;
      const delta = direction === "cw" ? 90 : -90;
      setBusy(true);
      try {
        await patchPageAsset({
          pageAssetId: selectedPage._id,
          proof,
          rotation: selectedPage.rotation + delta,
          memberUserKey,
        });
      } catch (e) {
        reportError(e);
      } finally {
        setBusy(false);
      }
    },
    [canMutate, memberUserKey, patchPageAsset, proof, reportError, selectedPage],
  );

  const handleRemovePage = useCallback(async () => {
    if (!selectedPage || !canMutate || pages.length <= 1) return;
    setBusy(true);
    try {
      await removePageAsset({
        pageAssetId: selectedPage._id,
        proof,
        memberUserKey,
      });
      setSelectedId(null);
    } catch (e) {
      reportError(e);
    } finally {
      setBusy(false);
    }
  }, [
    canMutate,
    memberUserKey,
    pages.length,
    proof,
    removePageAsset,
    reportError,
    selectedPage,
  ]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      if (!canMutate) return;
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      const oldIndex = pages.findIndex((p) => p._id === active.id);
      const newIndex = pages.findIndex((p) => p._id === over.id);
      if (oldIndex < 0 || newIndex < 0) return;
      const next = arrayMove(pages, oldIndex, newIndex);
      setBusy(true);
      try {
        await reorderPageAssets({
          documentId,
          proof,
          orderedPageAssetIds: next.map((p) => p._id),
          memberUserKey,
        });
      } catch (e) {
        reportError(e);
      } finally {
        setBusy(false);
      }
    },
    [
      canMutate,
      documentId,
      memberUserKey,
      pages,
      proof,
      reorderPageAssets,
      reportError,
    ],
  );

  const handleConvertFiles = useCallback(
    async (files: FileList | File[]) => {
      if (!canMutate) return;
      const list = [...files];
      if (list.length === 0) return;
      setBusy(true);
      try {
        const normalized = await normalizeImageFilesToPageAssets({
          files: list,
          generateUploadUrl: vaultMutations.generateUploadUrl,
          proof,
          memberUserKey,
          startOrder: pages.length,
        });
        if (pages.length === 0) {
          await uploadAndNormalize({
            documentId,
            proof,
            pages: normalized,
            memberUserKey,
          });
        } else {
          await appendPageAssets({
            documentId,
            proof,
            pages: normalized,
            memberUserKey,
          });
        }
      } catch (e) {
        reportError(e);
      } finally {
        setBusy(false);
      }
    },
    [
      appendPageAssets,
      canMutate,
      documentId,
      memberUserKey,
      pages.length,
      proof,
      reportError,
      uploadAndNormalize,
      vaultMutations.generateUploadUrl,
    ],
  );

  const handleBuildPdf = useCallback(async () => {
    if (!canMutate || pages.length === 0) return;
    setBusy(true);
    try {
      const assemblyPages = pages
        .filter((p): p is PageRow & { url: string } => Boolean(p.url))
        .map((p) => ({
          url: p.url,
          sourceWidth: p.sourceWidth,
          sourceHeight: p.sourceHeight,
          cropData: p.cropData,
          rotation: p.rotation,
        }));
      const { version } = await finalizePageAssetDocument({
        pages: assemblyPages,
        fileName,
        documentId,
        proof,
        memberUserKey,
        generateUploadUrl: vaultMutations.generateUploadUrl,
        finalizeDocument: finalizeDocumentMutation,
      });
      onVersionCommitted?.(version);
    } catch (e) {
      reportError(e);
    } finally {
      setBusy(false);
    }
  }, [
    canMutate,
    documentId,
    fileName,
    finalizeDocumentMutation,
    memberUserKey,
    onVersionCommitted,
    pages,
    proof,
    reportError,
    vaultMutations.generateUploadUrl,
  ]);

  const loading =
    !url ||
    pageAssetsQuery === undefined ||
    normalizing ||
    (pages.length === 0 && !!url);

  useEffect(() => {
    if (loading || !selectedPage?.url || !isCropping) return;

    let t1 = 0;
    let t2 = 0;
    const raf = requestAnimationFrame(() => {
      nudgeCropperLayout();
      t1 = window.setTimeout(nudgeCropperLayout, 50);
      t2 = window.setTimeout(nudgeCropperLayout, 200);
    });

    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [isCropping, loading, nudgeCropperLayout, selectedPage?._id, selectedPage?.url]);

  const loadingMessage = !url
    ? "Waiting for document source…"
    : normalizing
      ? "Normalizing document for editing…"
      : pageAssetsQuery === undefined
        ? "Loading editor…"
        : "Normalizing document for editing…";

  const renderToolbarChrome = () => (
  <>
    <DocumentManipulationToolbar
      versionNumber={versionNumber}
      pageIndex={selectedPage ? pages.indexOf(selectedPage) : 0}
      pageCount={pages.length}
      busy={busy || loading}
      annotationMode="view"
      mergeCandidates={[]}
      canMutate={canMutate}
      onRotate={(dir) => void handleRotate(dir)}
      onExtractPages={() => {}}
      onMergeSelect={() => {}}
      onAnnotationModeChange={() => {}}
      onSaveAnnotations={() => void handleBuildPdf()}
      onFinalize={() => void handleBuildPdf()}
      onPageChange={(idx) => {
        const p = pages[idx];
        if (p) setSelectedId(p._id);
      }}
      breadcrumbs={breadcrumbs}
      onBreadcrumbSelect={onBreadcrumbSelect}
      onClosePreview={onClosePreview}
      onToggleFullscreen={onToggleFullscreen}
      previewFullscreen={previewFullscreen}
      onOpenInWindow={onOpenInWindow}
      onOpenProperties={onOpenProperties}
      fileName={fileName}
      onCancelEditMode={onCancelEditMode}
      className="relative z-20 shrink-0"
    />

    <div className="relative z-20 flex shrink-0 flex-wrap items-center gap-2 border-b border-border/60 bg-dlc-surface-high/60 px-3 py-2">
      <Button
        type="button"
        variant={convertMode ? "primary" : "outline"}
        size="sm"
        className="h-8 gap-1 text-xs"
        disabled={!canMutate || busy}
        onClick={() => setConvertMode((v) => !v)}
        data-testid="document-editor-convert-toggle"
      >
        <FileImage className="h-3.5 w-3.5" />
        Convert photos
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-8 gap-1 text-xs"
        disabled={!canMutate || busy || !selectedPage?.url}
        onClick={() => setIsCropping((v) => !v)}
        data-testid="document-editor-crop-toggle"
      >
        <Crop className="h-3.5 w-3.5" />
        {isCropping ? "Exit crop" : "Crop page"}
      </Button>
      {isCropping ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 gap-1 text-xs"
          disabled={!canMutate || busy || !selectedPage?.url}
          onClick={normalizeToPage}
          data-testid="document-editor-reset-view"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Reset view
        </Button>
      ) : null}
      <Button
        type="button"
        variant={isCropping ? "outline" : "primary"}
        size="sm"
        className="ml-auto h-8 gap-1 text-xs"
        disabled={!canMutate || busy || pages.length === 0}
        onClick={() => void handleBuildPdf()}
        data-testid="document-editor-build-pdf"
      >
        {busy ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Save className="h-3.5 w-3.5" />
        )}
        Build PDF version
      </Button>
    </div>
  </>
  );

  const toolbarChrome =
    toolbarSlot != null
      ? createPortal(renderToolbarChrome(), toolbarSlot)
      : null;

  const renderWorkspace = () => {
    if (loading) {
      return (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin" />
          {loadingMessage}
        </div>
      );
    }

    return (
      <div className="flex min-h-0 flex-1 flex-row overflow-hidden">
        <aside className="relative z-10 flex h-full min-h-0 w-48 shrink-0 flex-col border-r border-border/60 bg-background">
          <p className="shrink-0 px-2 py-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Pages
          </p>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 pb-2">
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={(e) => void handleDragEnd(e)}
            >
              <SortableContext
                items={pages.map((p) => p._id)}
                strategy={verticalListSortingStrategy}
                disabled={!canMutate || busy}
              >
                <div className="flex flex-col gap-1.5">
                  {pages.map((page) => (
                    <SortablePageThumb
                      key={page._id}
                      page={page}
                      selected={page._id === selectedPage?._id}
                      disabled={!canMutate || busy}
                      onSelect={() => setSelectedId(page._id)}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          </div>
          {canMutate && selectedPage && pages.length > 1 ? (
            <div className="shrink-0 border-t border-border/60 p-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 w-full gap-1 text-xs text-destructive"
                disabled={busy}
                onClick={() => void handleRemovePage()}
              >
                <Trash2 className="h-3.5 w-3.5" />
                Remove page
              </Button>
            </div>
          ) : null}
        </aside>

        {/* Workbench / crop viewport */}
        <div
          ref={cropViewportRef}
          className="relative isolate z-0 h-full min-h-0 min-w-0 flex-1 overflow-hidden"
          data-testid={
            isCropping
              ? "document-editor-crop-viewport"
              : "document-editor-workbench"
          }
        >
          {convertMode ? (
            <label
              className="absolute inset-3 z-20 flex cursor-pointer flex-col items-center justify-center rounded-dlc-md border-2 border-dashed border-primary/40 bg-primary/5 p-6 text-center"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                void handleConvertFiles(e.dataTransfer.files);
              }}
            >
              <FileImage className="mb-2 h-8 w-8 text-primary" />
              <p className="text-sm font-medium">Drop photos to add pages</p>
              <p className="mt-1 text-xs text-muted-foreground">
                JPG, PNG, or WebP — appended to this document
              </p>
              <input
                type="file"
                accept="image/*"
                multiple
                className="sr-only"
                onChange={(e) => {
                  if (e.target.files) void handleConvertFiles(e.target.files);
                  e.target.value = "";
                }}
              />
            </label>
          ) : null}

          {selectedPage?.url ? (
            isCropping ? (
              <div className="relative h-full w-full overflow-hidden bg-muted/20">
                <Cropper
                  key={`crop-${selectedPage._id}-${selectedPage.rotation}-${aspect}`}
                  image={selectedPage.url}
                  crop={crop}
                  zoom={zoom}
                  rotation={selectedPage.rotation}
                  aspect={aspect}
                  objectFit="contain"
                  restrictPosition
                  onMediaLoaded={handleMediaLoaded}
                  onCropChange={setCrop}
                  onZoomChange={setZoom}
                  onCropComplete={onCropComplete}
                  classes={{
                    containerClassName: "!relative !h-full !w-full",
                    cropAreaClassName:
                      "!border-2 !border-blue-500 !shadow-[0_0_0_9999px_rgba(0,0,0,0.6)]",
                  }}
                />
              </div>
            ) : (
              <div className="relative flex h-full w-full items-center justify-center overflow-hidden bg-slate-900">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={selectedPage.url}
                  alt={`Document page ${selectedPage.order + 1}`}
                  className="h-full w-full object-contain p-4"
                  style={{
                    transform: `rotate(${selectedPage.rotation}deg)`,
                  }}
                  draggable={false}
                />
              </div>
            )
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-slate-900 text-sm text-muted-foreground">
              Select a page to preview
            </div>
          )}

          {isCropping && canMutate && selectedPage ? (
            <div className="pointer-events-auto absolute bottom-3 left-1/2 z-10 flex -translate-x-1/2 items-center gap-2 rounded-full border border-border/70 bg-background/95 px-3 py-1.5 shadow-dlc-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0"
                disabled={busy}
                onClick={() => void handleRotate("ccw")}
                aria-label="Rotate counter-clockwise"
              >
                <RotateCcw className="h-4 w-4" />
              </Button>
              <input
                type="range"
                min={1}
                max={3}
                step={0.05}
                value={zoom}
                onChange={(e) => setZoom(Number(e.target.value))}
                className="w-24"
                aria-label="Zoom"
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0"
                disabled={busy}
                onClick={() => void handleRotate("cw")}
                aria-label="Rotate clockwise"
              >
                <RotateCw className="h-4 w-4" />
              </Button>
            </div>
          ) : null}
        </div>
      </div>
    );
  };

  const wrapEditorBody = (body: ReactNode) => (
    <div
      className={cn(
        "flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-background",
        className,
      )}
      data-testid="document-editor-canvas"
    >
      {toolbarSlot == null ? renderToolbarChrome() : toolbarChrome}
      {body}
    </div>
  );

  if (!url) {
    return wrapEditorBody(
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin" />
        {loadingMessage}
      </div>,
    );
  }

  return wrapEditorBody(renderWorkspace());
}
