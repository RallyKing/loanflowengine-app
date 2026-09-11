"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useConvex } from "convex/react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  closestCenter,
  pointerWithin,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { AttachmentPreviewDialog } from "@/components/AttachmentPreviewDialog";
import {
  MAX_TASK_ATTACHMENT_BYTES,
  guessAttachmentKind,
  postFileToConvexUploadUrl,
  validateDocumentEditorImageFile,
} from "@/lib/uploadToConvexStorage";
import {
  uploadFileToVault,
  uploadNewVersionToVault,
  titleFromVaultFileName,
  type VaultUploadProgress,
} from "@/lib/library/uploadFileToVault";
import {
  defaultVaultDownloadFormat,
  vaultDocumentOutboundFileName,
  vaultOutboundPdfFileName,
} from "@/lib/library/vaultOutboundFileName";
import { useDocumentVaultStateOptional } from "@/lib/library/documentVaultState";
import { DocumentVaultPreviewModal } from "@/components/library/DocumentVaultPreviewModal";
import { DocumentVaultDirectoryTree, type DocumentVaultExplorerFileHandlers, type VaultTreeDocument } from "@/components/pipeline/tabs/DocumentVaultDirectoryTree";
import { DocumentVaultCommandBar } from "@/components/library/DocumentVaultCommandBar";
import {
  UploadAndOrganizeZone,
} from "@/components/library/UploadAndOrganizeZone";
import type { DocumentVaultMergeCandidate } from "@/components/pipeline/tabs/DocumentVaultPreviewCanvas";
import { Plus, FileText } from "lucide-react";
import { cn } from "@/lib/cn";
import {
  parseVaultDocumentDragId,
  parseVaultFolderActiveId,
  parseVaultFolderSortableId,
  parseVaultFileTaskSortableId,
  parseVaultFileTaskTargetId,
  isVaultFileTaskTargetId,
  resolveVaultDocumentDropTarget,
  vaultFolderSortableId,
  vaultFileTaskSortableId,
  VAULT_DROP_ROOT,
  VAULT_DROP_FOLDER_PREFIX,
  VAULT_SORT_FOLDER_PREFIX,
} from "@/lib/library/documentVaultDnD";
import {
  EMPTY_FOLDER_DRAG_VISUAL,
  resolveFolderDragHoverExpandTarget,
  resolveFolderDragVisual,
  type FolderDragVisualState,
} from "@/lib/library/documentVaultFolderDragUi";
import {
  convertVaultAssetToPdfBytes,
  downloadVaultDocumentAsPdf,
} from "@/lib/documents/pdfExport";
import { documentMatchesVaultSearch } from "@/lib/library/vaultDocumentSearch";
import { showOperationalToast } from "@/lib/ui/operationalToast";
import { extractClientPortalTokenFromPreview, extractCompanySlugFromPreview } from "@/lib/portalToken";
import { useOperationalConfirm } from "@/components/ui/OperationalConfirmDialog";
import {
  TriageClockProvider,
  useTriageClockTime,
} from "@/components/providers/TriageClockProvider";
import { unlinkConfirm } from "@/lib/ui/confirmDestructive";
import type {
  LibraryDocumentsContext,
  LibraryDocumentsProof,
} from "@/components/LibraryDocumentsPanel";
import { DocumentVaultLinkMetadataEditor } from "@/components/pipeline/tabs/DocumentVaultLinkMetadataEditor";
import {
  aggregateVaultTaxYears,
  filterVaultDocumentsWithTaxYear,
  isLibraryDocumentCategory,
  type LibraryDocumentCategory,
  type VaultCategoryFilter,
  type VaultTaxYearFilter,
} from "@/lib/library/documentVaultTaxonomy";
import type { LibraryDocumentLinkScope } from "@/lib/library/documentVaultHydration";
import type { DocumentVaultNavigationFocus } from "@/lib/pipeline/documentVaultNavigation";
import {
  MoveToFolderDialog,
  useDocumentVaultFolders,
} from "@/components/pipeline/tabs/DocumentVaultFolderDialogs";
import {
  ImportFromContactModal,
  SaveToContactModal,
} from "@/components/pipeline/tabs/DocumentVaultContactModals";
import { DocumentAssignModal } from "@/components/library/DocumentAssignModal";
import { RecallFromClientVaultDrawer } from "@/components/library/RecallFromClientVaultDrawer";
import { documentMatchesFolder, buildFolderBreadcrumbs, orderedSiblingFolderIds } from "@/lib/library/documentVaultFolders";
import {
  applyVaultGridFilters,
  type VaultGridStatusFilter,
  type VaultGridTypeFilter,
} from "@/lib/library/vaultGridFilters";
import { DocumentVaultBulkToolbar } from "@/components/library/DocumentVaultBulkToolbar";
import {
  VaultMoveCopyToFileDialog,
  type VaultMoveCopyEntity,
} from "@/components/library/VaultMoveCopyToFileDialog";
import { useFloatingBlockWindow } from "@/components/ui/FloatingBlockWindowProvider";
import { vaultDocumentFloatingBlockKey } from "@/lib/library/vaultDocumentFloatingKey";
import { FileTaskConfigModal } from "@/components/library/FileTaskConfigModal";
import { DocumentVaultApplyTemplateDrawer } from "@/components/library/DocumentVaultApplyTemplateDrawer";
import { ClientLinkGeneratorModal } from "@/components/library/ClientLinkGeneratorModal";
import { ClientPortalLinkRepository } from "@/components/library/ClientPortalLinkRepository";
import { DeliverToLenderModal } from "@/components/library/DeliverToLenderModal";
import { DueDiligenceWorkspaceSheet } from "@/components/library/DueDiligenceWorkspaceSheet";
import { DealBibleCompilerModal } from "@/components/library/compiler/DealBibleCompilerModal";
import { DocumentVaultCreatorModal } from "@/components/pipeline/deal/DocumentVaultCreatorModal";
import type { DocumentCreatorTokenContext } from "@/lib/pipeline/documentVaultCreator";
import {
  applyDocumentCreatorTokens,
  htmlDocumentToVaultFile,
  type DocumentCreatorTemplateSource,
} from "@/lib/pipeline/documentVaultCreator";
import { buildDocumentCreatorTokenContext } from "@/lib/pipeline/buildDocumentCreatorTokenContext";
import { useDealWorkspaceEditorOptional } from "@/lib/file/useDealWorkspaceEditor";
import { DocumentPropertiesPanel } from "@/components/library/DocumentPropertiesPanel";
import { LibraryDocumentsList } from "@/components/library/LibraryDocumentsList";
import { LibraryDocumentsVaultGridSkeleton } from "@/components/library/LibraryDocumentsVaultGrid";
import {
  downloadRemoteFile,
  downloadVaultDocumentsZip,
  type VaultDownloadItem,
} from "@/lib/library/downloadVaultDocumentsZip";
import {
  buildVaultDocumentZipPath,
  buildVaultFolderSubtreeZipPath,
  sanitizeZipPathSegment,
} from "@/lib/library/vaultZipPaths";
import { collectFolderSubtreeIds } from "@/lib/library/vaultItemCounts";
import { FileTaskReviewActions } from "@/components/library/FileTaskReviewActions";
import { FileTaskRejectModal } from "@/components/library/FileTaskRejectModal";
import {
  premiumWorkspaceCanvasClass,
  premiumTabStackClass,
} from "@/lib/pipeline/premiumWorkspaceUi";

function proofFromContext(ctx: LibraryDocumentsContext): LibraryDocumentsProof {
  if (ctx.kind === "pipeline") {
    return { kind: "pipeline", pipelineFileId: ctx.pipelineFileId };
  }
  if (ctx.kind === "contact") {
    return { kind: "contact", contactId: ctx.contactId };
  }
  return { kind: "task", taskId: ctx.taskId };
}

function proofForDocRow(
  ctx: LibraryDocumentsContext,
  row: DocRow,
): LibraryDocumentsProof {
  if (
    row.linkScope === "contact" &&
    row.hydratedContactId != null
  ) {
    return { kind: "contact", contactId: row.hydratedContactId };
  }
  return proofFromContext(ctx);
}

type DocRow = {
  _id: Id<"libraryDocuments">;
  linkId: Id<"libraryDocumentLinks">;
  title: string;
  latestVersionNumber: number;
  latestVersionId: Id<"libraryDocumentVersions"> | undefined;
  latestFileName: string | undefined;
  latestContentType: string | undefined;
  latestUploadedAt: number | undefined;
  updatedAt: number;
  documentCategory?: LibraryDocumentCategory;
  customDocumentCategoryId?: Id<"organizationDocumentCategories">;
  customDocumentCategoryName?: string;
  taxYear?: string;
  folderId?: Id<"documentFolders">;
  fileTaskId?: Id<"documentVaultFileTasks">;
  expiresAt?: number;
  expiryStatus?: "none" | "active" | "expiring_soon" | "expired";
  linkScope: LibraryDocumentLinkScope;
  hydratedContactId?: Id<"contacts">;
  savedToContactProfile?: boolean;
  aiSuggestedCategory?: LibraryDocumentCategory;
  aiConfidence?: number;
  aiSuggestedTaxYear?: string;
  aiSuggestedFolderName?: string;
  reviewStatus?: "rejected";
  rejectionReason?: string;
  isSharedWithClient?: boolean;
  assignedContactId?: Id<"contacts">;
  assignedClientId?: Id<"clients">;
  assignedLenderId?: Id<"lenders">;
};

type OptimisticLinkMeta = {
  documentCategory?: LibraryDocumentCategory | null;
  customDocumentCategoryId?: Id<"organizationDocumentCategories"> | null;
  customDocumentCategoryName?: string | null;
  taxYear?: string | null;
};

function formatWhen(ts: number | undefined) {
  if (ts == null) return "";
  return new Date(ts).toLocaleString();
}

export type LibraryDocumentsWorkspaceProps = {
  context: LibraryDocumentsContext;
  memberUserKey?: string;
  canUseHub: boolean;
  actionTitle: (hint: string) => string;
  /** `vault` — Tab 4 full-width shell; `embedded` — inner body for collapsible panel. */
  layout?: "vault" | "embedded";
  /** @deprecated Contact docs appear only after explicit Recall — do not hydrate. */
  hydrateContactIds?: Id<"contacts">[];
  /** Phase 37.7.UX — cross-tab category chip + row highlight from portal promote. */
  navigationFocus?: DocumentVaultNavigationFocus | null;
  onNavigationFocusConsumed?: () => void;
  /** Label for Deal Bible export filename (e.g. loan file / borrower name). */
  dealPackageLabel?: string;
  /** Deal tokens for the document creator modal. */
  documentCreatorTokenContext?: DocumentCreatorTokenContext;
  /** Organization scope for saved document templates. */
  organizationId?: Id<"organizations">;
};

export function LibraryDocumentsWorkspace(props: LibraryDocumentsWorkspaceProps) {
  return (
    <TriageClockProvider>
      <LibraryDocumentsWorkspaceBody {...props} />
    </TriageClockProvider>
  );
}

function LibraryDocumentsWorkspaceBody({
  context,
  memberUserKey,
  canUseHub,
  actionTitle,
  layout = "embedded",
  navigationFocus,
  onNavigationFocusConsumed,
  dealPackageLabel = "Deal Package",
  documentCreatorTokenContext,
  organizationId,
}: LibraryDocumentsWorkspaceProps) {
  const nowBucket = useTriageClockTime();
  const fallbackSelectDocument = useCallback(
    (_id: Id<"libraryDocuments"> | null) => {
      void _id;
    },
    [],
  );
  const fallbackClosePreview = useCallback(() => {}, []);
  const fallbackOpenProperties = useCallback(
    (_id: Id<"libraryDocuments">) => {
      void _id;
    },
    [],
  );
  const fallbackCloseProperties = useCallback(() => {}, []);
  const { confirm } = useOperationalConfirm();
  const convex = useConvex();
  const dealEditor = useDealWorkspaceEditorOptional();
  const proof = useMemo(() => proofFromContext(context), [context]);
  const listArgs = useMemo(() => {
    const base = { proof, limit: 80 as const };
    return memberUserKey ? { ...base, memberUserKey } : base;
  }, [proof, memberUserKey]);

  const rows = useQuery(api.libraryDocuments.listForProof, listArgs);
  const generateUploadUrl = useMutation(api.libraryDocuments.generateUploadUrl);
  const resolveEditorImageUrl = useMutation(
    api.libraryDocuments.resolveEditorImageUrl,
  );
  const createDocument = useMutation(api.libraryDocuments.createDocument);
  const commitVersion = useMutation(api.libraryDocuments.commitDocumentVersion);
  const removeLink = useMutation(api.libraryDocuments.removeDocumentLink);
  const patchTitle = useMutation(api.libraryDocuments.patchDocumentTitle);
  const patchLinkMetadata = useMutation(
    api.libraryDocuments.patchDocumentLinkMetadata,
  );
  const enqueueDocumentClassification = useMutation(
    api.documentIntelligence.enqueueDocumentClassification,
  );
  const acceptAiCategorySuggestion = useMutation(
    api.documentIntelligence.acceptAiCategorySuggestion,
  );
  const bulkMoveDocuments = useMutation(api.libraryDocuments.bulkMoveDocuments);
  const moveFolder = useMutation(api.documentFolders.moveFolder);
  const assignFolderToFileTask = useMutation(
    api.documentFolders.assignFolderToFileTask,
  );
  const reorderSiblingFolders = useMutation(
    api.documentFolders.reorderSiblingFolders,
  );
  const createFileTaskWithConfig = useMutation(
    api.documentVaultFileTasks.createWithConfig,
  );
  const reorderFileTasks = useMutation(api.documentVaultFileTasks.reorder);
  const acceptFileTaskReview = useMutation(
    api.documentVaultFileTasks.acceptFileTaskReview,
  );
  const rejectFileTaskReview = useMutation(
    api.documentVaultFileTasks.rejectFileTaskReview,
  );
  const rejectAndRequestDocument = useMutation(
    api.libraryDocuments.rejectAndRequestDocument,
  );
  const toggleDocumentVisibility = useMutation(
    api.libraryDocuments.toggleDocumentVisibility,
  );
  const bulkRemovePipelineLinks = useMutation(
    api.libraryDocuments.bulkRemovePipelineLinks,
  );
  const ensureStalePortalRequests = useMutation(
    api.documentVaultCompliance.ensureStalePortalRequests,
  );
  const createVaultTemplate = useMutation(api.documentVaultTemplates.create);

  const savedTemplateRows = useQuery(
    api.documentVaultTemplates.listForOrganization,
    organizationId && memberUserKey
      ? { organizationId, memberUserKey, limit: 40 }
      : organizationId
        ? { organizationId, limit: 40 }
        : "skip",
  );

  const vaultPipelineFileId =
    layout === "vault" && context.kind === "pipeline"
      ? context.pipelineFileId
      : null;

  const floatingHost = useFloatingBlockWindow();
  const vaultNav = useDocumentVaultStateOptional();
  const useVaultNav = layout === "vault" && vaultNav != null;

  const [embeddedFolderId, setEmbeddedFolderId] =
    useState<Id<"documentFolders"> | null>(null);
  const [embeddedCategoryFilter, setEmbeddedCategoryFilter] =
    useState<VaultCategoryFilter>("all");
  const [embeddedTaxYearFilter, setEmbeddedTaxYearFilter] =
    useState<VaultTaxYearFilter>("all");
  const [embeddedHighlightId, setEmbeddedHighlightId] =
    useState<Id<"libraryDocuments"> | null>(null);

  const currentFolderId = useVaultNav
    ? vaultNav.currentFolderId
    : embeddedFolderId;
  const setCurrentFolderId = useVaultNav
    ? vaultNav.setCurrentFolderId
    : setEmbeddedFolderId;
  const selectedDocumentId = useVaultNav ? vaultNav.selectedDocumentId : null;
  const selectDocument = useVaultNav
    ? vaultNav.selectDocument
    : fallbackSelectDocument;
  const activeCategoryFilter = useVaultNav
    ? vaultNav.activeCategoryFilter
    : embeddedCategoryFilter;
  const setActiveCategoryFilter = useVaultNav
    ? vaultNav.setActiveCategoryFilter
    : setEmbeddedCategoryFilter;
  const activeTaxYearFilter = useVaultNav
    ? vaultNav.activeTaxYearFilter
    : embeddedTaxYearFilter;
  const setActiveTaxYearFilter = useVaultNav
    ? vaultNav.setActiveTaxYearFilter
    : setEmbeddedTaxYearFilter;
  const highlightDocumentId = useVaultNav
    ? vaultNav.highlightDocumentId
    : embeddedHighlightId;
  const setHighlightDocumentId = useVaultNav
    ? vaultNav.setHighlightDocumentId
    : setEmbeddedHighlightId;
  const isModalOpen = useVaultNav ? vaultNav.isModalOpen : false;
  const closePreview = useVaultNav
    ? vaultNav.closePreview
    : fallbackClosePreview;
  const propertiesDocumentId = useVaultNav ? vaultNav.propertiesDocumentId : null;
  const openProperties = useVaultNav
    ? vaultNav.openProperties
    : fallbackOpenProperties;
  const closeProperties = useVaultNav
    ? vaultNav.closeProperties
    : fallbackCloseProperties;
  const navigateToFolder = useVaultNav ? vaultNav.navigateToFolder : setCurrentFolderId;

  const [moveDocTarget, setMoveDocTarget] = useState<DocRow | null>(null);
  const [bulkMoveOpen, setBulkMoveOpen] = useState(false);
  const [moveCopyEntity, setMoveCopyEntity] =
    useState<VaultMoveCopyEntity | null>(null);
  const [bulkSelectedIds, setBulkSelectedIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [bulkBusy, setBulkBusy] = useState(false);
  const [saveToContactTarget, setSaveToContactTarget] = useState<DocRow | null>(
    null,
  );
  const [importFromContactOpen, setImportFromContactOpen] = useState(false);
  const [recallClientVaultOpen, setRecallClientVaultOpen] = useState(false);
  const [assignTarget, setAssignTarget] = useState<DocRow | null>(null);
  const [exportingPdfDocId, setExportingPdfDocId] =
    useState<Id<"libraryDocuments"> | null>(null);
  const [downloadingDocId, setDownloadingDocId] =
    useState<Id<"libraryDocuments"> | null>(null);
  const [downloadingFolderId, setDownloadingFolderId] =
    useState<Id<"documentFolders"> | null>(null);
  const [showArchivedTasks, setShowArchivedTasks] = useState(false);
  const vaultFolders = useDocumentVaultFolders(vaultPipelineFileId, memberUserKey);
  const fileTasksQueryArgs = useMemo(() => {
    if (!vaultPipelineFileId) return "skip" as const;
    return memberUserKey
      ? { pipelineFileId: vaultPipelineFileId, memberUserKey }
      : { pipelineFileId: vaultPipelineFileId };
  }, [vaultPipelineFileId, memberUserKey]);
  const vaultFileTasks = useQuery(
    api.documentVaultFileTasks.listByPipeline,
    fileTasksQueryArgs,
  );
  const archivedFileTasksQueryArgs = useMemo(() => {
    if (!vaultPipelineFileId || !showArchivedTasks) return "skip" as const;
    return memberUserKey
      ? {
          pipelineFileId: vaultPipelineFileId,
          archivedOnly: true,
          memberUserKey,
        }
      : {
          pipelineFileId: vaultPipelineFileId,
          archivedOnly: true,
        };
  }, [vaultPipelineFileId, memberUserKey, showArchivedTasks]);
  const archivedVaultFileTasks = useQuery(
    api.documentVaultFileTasks.listByPipeline,
    archivedFileTasksQueryArgs,
  );
  const [fileTaskBatchOpen, setFileTaskBatchOpen] = useState(false);
  const [applyTemplateOpen, setApplyTemplateOpen] = useState(false);
  const [clientLinkOpen, setClientLinkOpen] = useState(false);
  const [linkRepositoryOpen, setLinkRepositoryOpen] = useState(false);
  const [deliverLenderOpen, setDeliverLenderOpen] = useState(false);
  const [dueDiligenceOpen, setDueDiligenceOpen] = useState(false);
  const issueViewAsClient = useMutation(
    api.documentVaultClientBundlePortal.issueViewAsClientPreview,
  );
  const [optimisticFileTaskOrder, setOptimisticFileTaskOrder] = useState<
    Id<"documentVaultFileTasks">[] | undefined
  >(undefined);
  const [activeDragFileTaskId, setActiveDragFileTaskId] =
    useState<Id<"documentVaultFileTasks"> | null>(null);
  const rootLabelQueryArgs = useMemo(() => {
    if (!vaultPipelineFileId) return "skip" as const;
    return memberUserKey
      ? { pipelineFileId: vaultPipelineFileId, memberUserKey }
      : { pipelineFileId: vaultPipelineFileId };
  }, [vaultPipelineFileId, memberUserKey]);
  const rootLabelQuery = useQuery(
    api.documentFolders.getVaultRootLabel,
    rootLabelQueryArgs,
  );
  const rootLabel =
    rootLabelQuery === undefined
      ? undefined
      : (rootLabelQuery.rootLabel ?? "Root");

  const staleComplianceArgs = useMemo(() => {
    if (!vaultPipelineFileId) return "skip" as const;
    return memberUserKey
      ? { pipelineFileId: vaultPipelineFileId, memberUserKey, nowBucket }
      : { pipelineFileId: vaultPipelineFileId, nowBucket };
  }, [vaultPipelineFileId, memberUserKey, nowBucket]);
  const staleCompliance = useQuery(
    api.documentVaultCompliance.listStaleDocuments,
    staleComplianceArgs,
  );
  const stalePortalSyncRef = useRef<string | null>(null);

  const linkedContactsForFile = useQuery(
    api.contactFileLinks.listLinkedContactsForFile,
    vaultPipelineFileId && memberUserKey
      ? { fileId: vaultPipelineFileId, memberUserKey }
      : vaultPipelineFileId
        ? { fileId: vaultPipelineFileId }
        : "skip",
  );
  const hasLinkedContacts = (linkedContactsForFile?.length ?? 0) > 0;

  const [newTitle, setNewTitle] = useState("");
  const [busyDoc, setBusyDoc] = useState<Id<"libraryDocuments"> | null>(null);
  const [batchUploading, setBatchUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<VaultUploadProgress | null>(
    null,
  );
  const [err, setErr] = useState<string | null>(null);
  const [vaultSearchQuery, setVaultSearchQuery] = useState("");
  const [gridTypeFilters, setGridTypeFilters] = useState<
    Set<VaultGridTypeFilter>
  >(() => new Set());
  const [gridStatusFilters, setGridStatusFilters] = useState<
    Set<VaultGridStatusFilter>
  >(() => new Set());
  const [activeDragDocId, setActiveDragDocId] = useState<
    Id<"libraryDocuments"> | null
  >(null);
  const [activeDragDocIds, setActiveDragDocIds] = useState<
    Id<"libraryDocuments">[]
  >([]);
  const [activeDragFolderId, setActiveDragFolderId] = useState<
    Id<"documentFolders"> | null
  >(null);
  const [folderDragVisual, setFolderDragVisual] =
    useState<FolderDragVisualState>(EMPTY_FOLDER_DRAG_VISUAL);
  const folderDragVisualRef = useRef<FolderDragVisualState>(
    EMPTY_FOLDER_DRAG_VISUAL,
  );
  const dragExpandTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dragExpandFolderRef = useRef<Id<"documentFolders"> | null>(null);
  const [dragAutoExpandFolderIds, setDragAutoExpandFolderIds] = useState<
    Id<"documentFolders">[]
  >([]);
  const [optimisticSiblingOrder, setOptimisticSiblingOrder] = useState<
    Record<string, Id<"documentFolders">[]>
  >({});
  const [compilerOpen, setCompilerOpen] = useState(false);
  const [previewRejectTask, setPreviewRejectTask] = useState<{
    _id: Id<"documentVaultFileTasks">;
    title: string;
  } | null>(null);
  const [previewReviewBusy, setPreviewReviewBusy] = useState(false);
  const [creatorOpen, setCreatorOpen] = useState(false);
  const [creatorSaving, setCreatorSaving] = useState(false);
  const [expanded, setExpanded] = useState<Id<"libraryDocuments"> | null>(null);
  const highlightScrollDoneRef = useRef<Id<"libraryDocuments"> | null>(null);
  const [optimisticMetaByDocId, setOptimisticMetaByDocId] = useState<
    Record<string, OptimisticLinkMeta>
  >({});
  const [preview, setPreview] = useState<{
    documentId: Id<"libraryDocuments">;
    versionId: Id<"libraryDocumentVersions">;
    fileName: string;
    contentType?: string;
  } | null>(null);

  const versions = useQuery(
    api.libraryDocuments.listVersions,
    expanded && memberUserKey
      ? { documentId: expanded, memberUserKey }
      : "skip",
  );

  const previewUrl = useQuery(
    api.libraryDocuments.getVersionUrl,
    preview && memberUserKey
      ? {
          documentId: preview.documentId,
          versionId: preview.versionId,
          memberUserKey,
        }
      : "skip",
  );

  const previewRow =
    preview && previewUrl?.status === "ok"
      ? {
          fileName: preview.fileName,
          contentType: preview.contentType,
          url: previewUrl.url ?? null,
        }
      : null;

  const canMutate = Boolean(memberUserKey) && canUseHub;
  /** Always offer Move / copy when the broker can mutate — dialog handles empty targets. */
  const crossFileTransferEnabled = canMutate && Boolean(vaultPipelineFileId);

  useEffect(() => {
    if (
      layout !== "vault" ||
      !vaultPipelineFileId ||
      !canMutate ||
      !memberUserKey ||
      !staleCompliance
    ) {
      return;
    }
    const expiredIds = staleCompliance.stale
      .filter((s) => s.status === "expired")
      .map((s) => String(s.documentId));
    if (expiredIds.length === 0) return;
    const syncKey = expiredIds.sort().join(",");
    if (stalePortalSyncRef.current === syncKey) return;
    stalePortalSyncRef.current = syncKey;
    void ensureStalePortalRequests({
      pipelineFileId: vaultPipelineFileId,
      memberUserKey,
    }).catch(() => {
      stalePortalSyncRef.current = null;
    });
  }, [
    canMutate,
    ensureStalePortalRequests,
    layout,
    memberUserKey,
    staleCompliance,
    vaultPipelineFileId,
  ]);

  const uploadBusy =
    batchUploading || busyDoc !== null || uploadProgress !== null;

  const vaultUploadMutations = useMemo(
    () => ({
      generateUploadUrl: (args: {
        proof: LibraryDocumentsProof;
        memberUserKey: string;
      }) => generateUploadUrl(args),
      createDocument: (args: {
        title: string;
        link: LibraryDocumentsProof;
        memberUserKey: string;
      }) => createDocument(args),
      commitDocumentVersion: (args: {
        documentId: Id<"libraryDocuments">;
        proof: LibraryDocumentsProof;
        storageId: Id<"_storage">;
        fileName: string;
        contentType?: string;
        size?: number;
        memberUserKey: string;
      }) => commitVersion(args),
      patchLinkMetadata:
        vaultPipelineFileId && memberUserKey
          ? (args: {
              documentId: Id<"libraryDocuments">;
              proof: LibraryDocumentsProof;
              folderId?: Id<"documentFolders">;
              fileTaskId?: Id<"documentVaultFileTasks">;
              memberUserKey: string;
            }) =>
              patchLinkMetadata({
                documentId: args.documentId,
                proof: args.proof,
                ...(args.folderId != null ? { folderId: args.folderId } : {}),
                ...(args.fileTaskId != null
                  ? { fileTaskId: args.fileTaskId }
                  : {}),
                memberUserKey: args.memberUserKey,
              })
          : undefined,
      enqueueDocumentClassification: memberUserKey
        ? (args: {
            documentId: Id<"libraryDocuments">;
            proof: LibraryDocumentsProof;
            previewText: string;
            fileName: string;
            memberUserKey: string;
          }) => enqueueDocumentClassification(args)
        : undefined,
    }),
    [
      commitVersion,
      createDocument,
      generateUploadUrl,
      memberUserKey,
      patchLinkMetadata,
      enqueueDocumentClassification,
      vaultPipelineFileId,
    ],
  );

  const liveTokenContext = useMemo((): DocumentCreatorTokenContext => {
    const editorMatches =
      vaultPipelineFileId && dealEditor?.fileId === vaultPipelineFileId
        ? dealEditor
        : null;
    const rebuilt = buildDocumentCreatorTokenContext({
      pipeline: editorMatches?.dealBundle?.pipeline ?? null,
      dealSheet: editorMatches?.sheet ?? null,
      dealPackageLabel,
      stageLabel: documentCreatorTokenContext?.pipeline_stage,
      chosenLenderLabel: documentCreatorTokenContext?.primary_lender,
      interestRateDisplay: documentCreatorTokenContext?.interest_rate,
    });
    return { ...rebuilt, ...documentCreatorTokenContext };
  }, [
    dealEditor,
    vaultPipelineFileId,
    documentCreatorTokenContext,
    dealPackageLabel,
  ]);

  const savedCreatorTemplates = useMemo((): DocumentCreatorTemplateSource[] => {
    if (!savedTemplateRows) return [];
    return savedTemplateRows.map((row) => ({
      id: row._id,
      title: row.title,
      description: row.description ?? "Saved organization template",
      bodyHtml: row.bodyHtml,
      source: "saved" as const,
    }));
  }, [savedTemplateRows]);

  const handleCreatorSaveDocument = useCallback(
    async (payload: {
      title: string;
      html: string;
      attachments: File[];
    }) => {
      if (!memberUserKey || !canMutate) {
        throw new Error("You do not have permission to save documents.");
      }
      setCreatorSaving(true);
      setErr(null);
      try {
        const resolvedHtml = applyDocumentCreatorTokens(
          payload.html,
          liveTokenContext,
        );
        const mainFile = htmlDocumentToVaultFile(payload.title, resolvedHtml);
        await uploadFileToVault({
          file: mainFile,
          proof,
          memberUserKey,
          title: payload.title,
          folderId: vaultPipelineFileId ? currentFolderId : null,
          mutations: vaultUploadMutations,
        });
        for (const attachment of payload.attachments) {
          await uploadFileToVault({
            file: attachment,
            proof,
            memberUserKey,
            folderId: vaultPipelineFileId ? currentFolderId : null,
            mutations: vaultUploadMutations,
          });
        }
        showOperationalToast({
          title: "Document saved",
          description: `"${payload.title}" was added to the vault.`,
          variant: "success",
        });
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        setErr(message);
        showOperationalToast({
          title: "Could not save document",
          description: message,
          variant: "destructive",
        });
        throw e;
      } finally {
        setCreatorSaving(false);
      }
    },
    [
      memberUserKey,
      canMutate,
      liveTokenContext,
      proof,
      vaultPipelineFileId,
      currentFolderId,
      vaultUploadMutations,
    ],
  );

  const handleCreatorSaveTemplate = useCallback(
    async (payload: { title: string; html: string; attachments: File[] }) => {
      if (!memberUserKey || !canMutate) {
        throw new Error("You do not have permission to save templates.");
      }
      if (!organizationId) {
        throw new Error("Organization is required to save templates.");
      }
      setCreatorSaving(true);
      setErr(null);
      try {
        await createVaultTemplate({
          organizationId,
          title: payload.title,
          bodyHtml: payload.html,
          memberUserKey,
        });
        showOperationalToast({
          title: "Template saved",
          description: `"${payload.title}" is available in the template library.`,
          variant: "success",
        });
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        setErr(message);
        showOperationalToast({
          title: "Could not save template",
          description: message,
          variant: "destructive",
        });
        throw e;
      } finally {
        setCreatorSaving(false);
      }
    },
    [memberUserKey, canMutate, organizationId, createVaultTemplate],
  );

  const uploadCreatorEditorImage = useCallback(
    async (file: File): Promise<string> => {
      if (!memberUserKey || !canMutate) {
        throw new Error("You do not have permission to upload images.");
      }
      const postUrl = await generateUploadUrl({ proof, memberUserKey });
      const { storageId } = await postFileToConvexUploadUrl(postUrl, file, {
        validateFile: validateDocumentEditorImageFile,
      });
      const resolved = await resolveEditorImageUrl({
        storageId: storageId as Id<"_storage">,
        proof,
        memberUserKey,
      });
      if (!resolved.url) {
        throw new Error("Could not resolve uploaded image URL.");
      }
      return resolved.url;
    },
    [canMutate, generateUploadUrl, memberUserKey, proof, resolveEditorImageUrl],
  );

  const resolveRowMeta = useCallback(
    (d: DocRow) => {
      const opt = optimisticMetaByDocId[d._id];
      return {
        documentCategory:
          opt?.documentCategory !== undefined
            ? (opt.documentCategory ?? undefined)
            : d.documentCategory,
        customDocumentCategoryId:
          opt?.customDocumentCategoryId !== undefined
            ? (opt.customDocumentCategoryId ?? undefined)
            : d.customDocumentCategoryId,
        customDocumentCategoryName:
          opt?.customDocumentCategoryName !== undefined
            ? (opt.customDocumentCategoryName ?? undefined)
            : d.customDocumentCategoryName,
        taxYear:
          opt?.taxYear !== undefined ? (opt.taxYear ?? undefined) : d.taxYear,
      };
    },
    [optimisticMetaByDocId],
  );

  const displayRows = useMemo((): DocRow[] | undefined => {
    if (rows === undefined) return undefined;
    return (rows as DocRow[]).map((d) => ({
      ...d,
      linkScope: d.linkScope ?? "pipeline",
      ...resolveRowMeta(d),
    }));
  }, [rows, resolveRowMeta]);

  const availableTaxYears = useMemo((): string[] => {
    if (activeCategoryFilter !== "tax_return" || !displayRows) return [];
    return aggregateVaultTaxYears(displayRows);
  }, [activeCategoryFilter, displayRows]);

  const handleCategoryFilterChange = useCallback(
    (filter: VaultCategoryFilter) => {
      setActiveCategoryFilter(filter);
      if (filter !== "tax_return") {
        setActiveTaxYearFilter("all");
      }
    },
    [setActiveCategoryFilter, setActiveTaxYearFilter],
  );

  useEffect(() => {
    if (activeCategoryFilter !== "tax_return") {
      setActiveTaxYearFilter("all");
      return;
    }
    if (
      activeTaxYearFilter !== "all" &&
      !availableTaxYears.includes(activeTaxYearFilter)
    ) {
      setActiveTaxYearFilter("all");
    }
  }, [activeCategoryFilter, activeTaxYearFilter, availableTaxYears, setActiveTaxYearFilter]);

  const categoryFilteredRows = useMemo((): DocRow[] | undefined => {
    if (displayRows === undefined) return undefined;
    if (layout !== "vault") return displayRows;
    return filterVaultDocumentsWithTaxYear(
      displayRows,
      activeCategoryFilter,
      activeTaxYearFilter,
    );
  }, [displayRows, layout, activeCategoryFilter, activeTaxYearFilter]);

  const gridFilteredRows = useMemo((): DocRow[] | undefined => {
    if (categoryFilteredRows === undefined) return undefined;
    if (layout !== "vault") return categoryFilteredRows;
    return applyVaultGridFilters(
      categoryFilteredRows,
      gridTypeFilters,
      gridStatusFilters,
    );
  }, [categoryFilteredRows, gridStatusFilters, gridTypeFilters, layout]);

  const searchFilteredRows = useMemo((): DocRow[] | undefined => {
    if (gridFilteredRows === undefined) return undefined;
    const q = vaultSearchQuery.trim();
    if (!q) return gridFilteredRows;
    return gridFilteredRows.filter((d) => documentMatchesVaultSearch(d, q));
  }, [gridFilteredRows, vaultSearchQuery]);

  const treeSearchFilteredRows = useMemo((): DocRow[] | undefined => {
    if (categoryFilteredRows === undefined) return undefined;
    const q = vaultSearchQuery.trim();
    if (!q) return categoryFilteredRows;
    return categoryFilteredRows.filter((d) => documentMatchesVaultSearch(d, q));
  }, [categoryFilteredRows, vaultSearchQuery]);

  const listRows = useMemo((): DocRow[] | undefined => {
    if (searchFilteredRows === undefined) return undefined;
    if (!vaultPipelineFileId || layout !== "vault") return searchFilteredRows;
    return searchFilteredRows.filter(
      (d) =>
        d.linkScope === "pipeline" &&
        documentMatchesFolder(d.folderId, currentFolderId),
    );
  }, [
    searchFilteredRows,
    layout,
    vaultPipelineFileId,
    currentFolderId,
  ]);

  const explorerDocumentRows = useMemo((): DocRow[] | undefined => {
    if (searchFilteredRows === undefined) return undefined;
    return searchFilteredRows.filter((d) => d.linkScope === "pipeline");
  }, [searchFilteredRows]);

  const treeDocuments = useMemo((): VaultTreeDocument[] | undefined => {
    if (treeSearchFilteredRows === undefined) return undefined;
    return treeSearchFilteredRows
      .filter((d) => d.linkScope === "pipeline")
      .map((d) => ({
        _id: d._id,
        title: d.title,
        folderId: d.folderId,
      }));
  }, [treeSearchFilteredRows]);

  const dueDiligenceDocuments = useMemo(() => {
    const source = displayRows ?? explorerDocumentRows ?? [];
    if (bulkSelectedIds.size === 0) return [];
    return source
      .filter((d) => bulkSelectedIds.has(String(d._id)))
      .map((d) => ({
        _id: d._id,
        title: d.title,
        latestVersionId: d.latestVersionId,
        latestFileName: d.latestFileName,
        latestContentType: d.latestContentType,
      }));
  }, [bulkSelectedIds, displayRows, explorerDocumentRows]);

  const openDueDiligence = useCallback(() => {
    if (!organizationId || !memberUserKey) {
      showOperationalToast({
        title: "Sign in required",
        description: "Due Diligence needs an organization session.",
        variant: "destructive",
      });
      return;
    }
    if (dueDiligenceDocuments.length === 0) {
      showOperationalToast({
        title: "Select files first",
        description: "Select at least one vault file, then run Due Diligence.",
        variant: "default",
      });
      return;
    }
    setDueDiligenceOpen(true);
  }, [dueDiligenceDocuments.length, memberUserKey, organizationId]);

  const compilerDocuments = useMemo(() => {
    if (!displayRows) return [];
    return displayRows.map((d) => ({
      _id: d._id,
      title: d.title,
      latestVersionId: d.latestVersionId,
      latestFileName: d.latestFileName,
      latestContentType: d.latestContentType,
      folderId: d.folderId,
      fileTaskId: d.fileTaskId,
      linkScope: d.linkScope,
      latestVersionNumber: d.latestVersionNumber,
    }));
  }, [displayRows]);

  const selectedRow = useMemo(
    () =>
      listRows?.find((d) => d._id === selectedDocumentId) ??
      displayRows?.find((d) => d._id === selectedDocumentId) ??
      null,
    [listRows, displayRows, selectedDocumentId],
  );

  const selectedPreviewUrl = useQuery(
    api.libraryDocuments.getVersionUrl,
    selectedRow?.latestVersionId &&
      selectedDocumentId &&
      memberUserKey
      ? {
          documentId: selectedDocumentId,
          versionId: selectedRow.latestVersionId,
          memberUserKey,
        }
      : "skip",
  );

  const selectedRowProof = useMemo(
    () => (selectedRow ? proofForDocRow(context, selectedRow) : null),
    [context, selectedRow],
  );

  const previewReviewTask = useMemo(() => {
    if (!selectedRow?.fileTaskId || !vaultFileTasks) return null;
    const task = vaultFileTasks.find((t) => t._id === selectedRow.fileTaskId);
    if (!task || task.status !== "pending_review") return null;
    return task;
  }, [selectedRow?.fileTaskId, vaultFileTasks]);

  const previewReviewFooter = useMemo(() => {
    if (!previewReviewTask || !canMutate || !memberUserKey) return null;
    return (
      <FileTaskReviewActions
        className="mx-3 mb-3 shrink-0"
        busy={previewReviewBusy}
        onApprove={async () => {
          setPreviewReviewBusy(true);
          try {
            await acceptFileTaskReview({
              fileTaskId: previewReviewTask._id,
              memberUserKey,
            });
            showOperationalToast({
              title: "Submission approved",
              variant: "success",
            });
          } catch (e) {
            setErr(e instanceof Error ? e.message : String(e));
          } finally {
            setPreviewReviewBusy(false);
          }
        }}
        onRequestRevision={() =>
          setPreviewRejectTask({
            _id: previewReviewTask._id,
            title: previewReviewTask.title,
          })
        }
      />
    );
  }, [
    acceptFileTaskReview,
    canMutate,
    memberUserKey,
    previewReviewBusy,
    previewReviewTask,
  ]);

  const pdfMergeCandidates = useMemo((): DocumentVaultMergeCandidate[] => {
    if (!listRows || !selectedDocumentId) return [];
    return listRows
      .filter(
        (d) =>
          d._id !== selectedDocumentId &&
          d.latestVersionId &&
          d.latestVersionNumber > 0 &&
          guessAttachmentKind(
            d.latestContentType,
            vaultDocumentOutboundFileName(d),
          ) === "pdf",
      )
      .map((d) => ({
        documentId: d._id,
        versionId: d.latestVersionId!,
        title: d.title,
      }));
  }, [listRows, selectedDocumentId]);

  const bulkSelectableRows = useMemo(() => {
    if (!listRows) return [];
    return listRows.filter(
      (d) => d.linkScope === "pipeline" && d.latestVersionNumber > 0,
    );
  }, [listRows]);

  const previewBreadcrumbs = useMemo(
    () =>
      buildFolderBreadcrumbs(
        vaultFolders ?? [],
        selectedRow?.folderId ?? currentFolderId,
        rootLabel ?? "Root",
      ),
    [vaultFolders, selectedRow?.folderId, currentFolderId, rootLabel],
  );

  const openVaultFloatingDocument = useCallback(
    (
      documentId: Id<"libraryDocuments">,
      versionId: Id<"libraryDocumentVersions">,
      fileName: string,
      contentType?: string,
    ): boolean => {
      if (!floatingHost || !vaultPipelineFileId || layout !== "vault") {
        return false;
      }
      const blockKey = vaultDocumentFloatingBlockKey(documentId);
      if (useVaultNav && vaultNav) {
        vaultNav.setSelectedDocumentId(documentId);
        vaultNav.setIsModalOpen(false);
      }
      if (floatingHost.isDetached(blockKey)) {
        return true;
      }
      const row =
        displayRows?.find((d) => d._id === documentId) ??
        listRows?.find((d) => d._id === documentId) ??
        null;
      const proof = row ? proofForDocRow(context, row) : null;
      const mergeCandidates: DocumentVaultMergeCandidate[] = (listRows ?? [])
        .filter(
          (d) =>
            d._id !== documentId &&
            d.latestVersionId &&
            d.latestVersionNumber > 0 &&
            guessAttachmentKind(
              d.latestContentType,
              vaultDocumentOutboundFileName(d),
            ) === "pdf",
        )
        .map((d) => ({
          documentId: d._id,
          versionId: d.latestVersionId!,
          title: d.title,
        }));
      floatingHost.detach({
        blockKey,
        title: fileName || row?.title || "Document",
        persistKey: "vault-doc-preview",
        contentClassName:
          "flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden p-0 sm:p-0",
        content: (
          <DocumentVaultPreviewModal
            open
            variant="embedded"
            onClose={() => floatingHost.reattach(blockKey)}
            fileName={fileName || row?.title || "Document"}
            contentType={contentType ?? row?.latestContentType}
            url={null}
            documentId={documentId}
            versionId={versionId}
            versionNumber={row?.latestVersionNumber}
            proof={proof ?? undefined}
            memberUserKey={memberUserKey}
            canMutate={canMutate}
            pipelineFileId={vaultPipelineFileId}
            mergeCandidates={mergeCandidates}
            vaultMutations={vaultUploadMutations}
            onError={(message) => setErr(message)}
            lastModified={row?.updatedAt}
          />
        ),
        testId: `${blockKey}-floating-window`,
      });
      return true;
    },
    [
      canMutate,
      context,
      displayRows,
      floatingHost,
      layout,
      listRows,
      memberUserKey,
      useVaultNav,
      vaultNav,
      vaultPipelineFileId,
      vaultUploadMutations,
    ],
  );

  const openPreview = useCallback(
    (
      documentId: Id<"libraryDocuments">,
      versionId: Id<"libraryDocumentVersions">,
      fileName: string,
      contentType?: string,
    ) => {
      if (layout === "vault" && useVaultNav) {
        selectDocument(documentId);
        return;
      }
      setPreview({ documentId, versionId, fileName, contentType });
    },
    [layout, selectDocument, useVaultNav],
  );

  const openDocumentInWindow = useCallback(
    (
      documentId: Id<"libraryDocuments">,
      versionId: Id<"libraryDocumentVersions">,
      fileName: string,
      contentType?: string,
    ) => {
      if (
        openVaultFloatingDocument(
          documentId,
          versionId,
          fileName,
          contentType,
        )
      ) {
        return;
      }
      // No floating host (e.g. contact vault) — fall back to modal preview.
      openPreview(documentId, versionId, fileName, contentType);
    },
    [openPreview, openVaultFloatingDocument],
  );

  const openVaultDocumentById = useCallback(
    (documentId: Id<"libraryDocuments"> | null) => {
      selectDocument(documentId);
    },
    [selectDocument],
  );

  const propertiesRow = useMemo(
    () =>
      propertiesDocumentId
        ? listRows?.find((d) => d._id === propertiesDocumentId) ??
          displayRows?.find((d) => d._id === propertiesDocumentId) ??
          null
        : null,
    [propertiesDocumentId, listRows, displayRows],
  );

  const toggleBulkSelect = useCallback((documentId: Id<"libraryDocuments">) => {
    setBulkSelectedIds((prev) => {
      const next = new Set(prev);
      const key = String(documentId);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const clearBulkSelection = useCallback(() => {
    setBulkSelectedIds(new Set());
  }, []);

  useEffect(() => {
    clearBulkSelection();
  }, [currentFolderId, clearBulkSelection]);

  const handleBulkMove = useCallback(
    async (folderId: Id<"documentFolders"> | null) => {
      if (!memberUserKey || !vaultPipelineFileId || bulkSelectedIds.size === 0) {
        return;
      }
      setErr(null);
      setBulkBusy(true);
      try {
        const result = await bulkMoveDocuments({
          pipelineFileId: vaultPipelineFileId,
          documentIds: [...bulkSelectedIds] as Id<"libraryDocuments">[],
          folderId: folderId ?? "__unset__",
          memberUserKey,
        });
        if (result.failures.length > 0) {
          setErr(result.failures.join(" · "));
        }
        clearBulkSelection();
      } catch (e) {
        setErr(e instanceof Error ? e.message : String(e));
        throw e;
      } finally {
        setBulkBusy(false);
      }
    },
    [
      bulkMoveDocuments,
      bulkSelectedIds,
      clearBulkSelection,
      memberUserKey,
      vaultPipelineFileId,
    ],
  );

  const handleBulkDelete = useCallback(async () => {
    if (!memberUserKey || !vaultPipelineFileId || bulkSelectedIds.size === 0) {
      return;
    }
    const ok = await confirm(
      unlinkConfirm(
        `${bulkSelectedIds.size} documents`,
        "Selected documents are removed from this loan file. Other links stay attached.",
      ),
    );
    if (!ok) return;
    setErr(null);
    setBulkBusy(true);
    try {
      await bulkRemovePipelineLinks({
        pipelineFileId: vaultPipelineFileId,
        documentIds: [...bulkSelectedIds] as Id<"libraryDocuments">[],
        memberUserKey,
      });
      clearBulkSelection();
      if (
        selectedDocumentId &&
        bulkSelectedIds.has(String(selectedDocumentId))
      ) {
        closePreview();
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBulkBusy(false);
    }
  }, [
    bulkRemovePipelineLinks,
    bulkSelectedIds,
    clearBulkSelection,
    closePreview,
    confirm,
    memberUserKey,
    selectedDocumentId,
    vaultPipelineFileId,
  ]);

  const buildVaultDownloadItem = useCallback(
    async (
      d: DocRow,
      zipPathFor: (fileName: string) => string | undefined,
    ): Promise<VaultDownloadItem> => {
      if (!memberUserKey) throw new Error("Sign in to download documents.");
      if (!d.latestVersionId) throw new Error(`No file for ${d.title}`);
      const urlResult = await convex.query(api.libraryDocuments.getVersionUrl, {
        documentId: d._id,
        versionId: d.latestVersionId,
        memberUserKey,
      });
      if (urlResult.status !== "ok" || !urlResult.url) {
        throw new Error(`Could not load ${d.title}`);
      }
      const outbound = vaultDocumentOutboundFileName(d);
      if (defaultVaultDownloadFormat(d) === "pdf") {
        const bytes = await convertVaultAssetToPdfBytes({
          title: d.title,
          url: urlResult.url,
          contentType: d.latestContentType,
          fileName: outbound,
        });
        const pdfName = vaultOutboundPdfFileName(d.title, outbound);
        return {
          documentId: d._id,
          versionId: d.latestVersionId,
          fileName: pdfName,
          url: urlResult.url,
          bytes,
          zipPath: zipPathFor(pdfName),
        };
      }
      return {
        documentId: d._id,
        versionId: d.latestVersionId,
        fileName: outbound,
        url: urlResult.url,
        zipPath: zipPathFor(outbound),
      };
    },
    [convex, memberUserKey],
  );

  const resolveVaultDownloadItems = useCallback(
    async (rows: DocRow[]): Promise<VaultDownloadItem[]> => {
      return Promise.all(
        rows.map((d) =>
          buildVaultDownloadItem(d, (fileName) =>
            vaultFolders
              ? buildVaultDocumentZipPath(
                  vaultFolders,
                  d.folderId,
                  fileName,
                  rootLabel ?? "Root",
                )
              : undefined,
          ),
        ),
      );
    },
    [buildVaultDownloadItem, rootLabel, vaultFolders],
  );

  const runVaultZipDownload = useCallback(
    async (rows: DocRow[], zipName: string, emptyMessage: string) => {
      if (!memberUserKey) return;
      if (rows.length === 0) {
        showOperationalToast({
          title: "Nothing to download",
          description: emptyMessage,
          variant: "default",
        });
        return;
      }
      setErr(null);
      setBulkBusy(true);
      showOperationalToast({
        title: "Preparing download",
        description:
          rows.length === 1
            ? rows[0]!.title
            : `${rows.length} documents as ZIP`,
        variant: "default",
      });
      try {
        const items = await resolveVaultDownloadItems(rows);
        await downloadVaultDocumentsZip(items, zipName, (progress) => {
          if (progress.completed === 0 || progress.completed === progress.total) {
            return;
          }
          if (progress.completed % 5 === 0 || progress.completed === progress.total - 1) {
            showOperationalToast({
              title: "Downloading…",
              description: `${progress.completed} / ${progress.total}`,
              variant: "default",
            });
          }
        });
        showOperationalToast({
          title: "Download started",
          description:
            rows.length === 1
              ? rows[0]!.title
              : `${rows.length} documents`,
          variant: "success",
        });
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        setErr(message);
        showOperationalToast({
          title: "Download failed",
          description: message,
          variant: "destructive",
        });
      } finally {
        setBulkBusy(false);
      }
    },
    [memberUserKey, resolveVaultDownloadItems],
  );

  const handleBulkDownload = useCallback(async () => {
    if (bulkSelectedIds.size === 0) {
      showOperationalToast({
        title: "Nothing selected",
        description: "Select one or more files, then download selected.",
        variant: "default",
      });
      return;
    }
    const selected = bulkSelectableRows.filter((d) =>
      bulkSelectedIds.has(String(d._id)),
    );
    const zipBase = (rootLabel ?? "vault-documents")
      .replace(/[/\\]+/g, "-")
      .trim() || "vault-documents";
    await runVaultZipDownload(
      selected,
      `${zipBase}-selected.zip`,
      "Selected files have no downloadable versions.",
    );
  }, [
    bulkSelectableRows,
    bulkSelectedIds,
    rootLabel,
    runVaultZipDownload,
  ]);

  const handleDownloadAll = useCallback(async () => {
    const zipBase = (rootLabel ?? "vault-documents")
      .replace(/[/\\]+/g, "-")
      .trim() || "vault-documents";
    await runVaultZipDownload(
      bulkSelectableRows,
      `${zipBase}-all.zip`,
      "This vault has no downloadable documents yet.",
    );
  }, [bulkSelectableRows, rootLabel, runVaultZipDownload]);

  const handleDownloadFolder = useCallback(
    async (folderId: Id<"documentFolders">, folderName: string) => {
      if (!memberUserKey) return;
      if (!vaultFolders?.length) {
        showOperationalToast({
          title: "Nothing to download",
          description: `"${folderName}" has no downloadable files.`,
          variant: "default",
        });
        return;
      }
      const subtree = collectFolderSubtreeIds(vaultFolders, folderId);
      const rows = bulkSelectableRows.filter(
        (d) => d.folderId != null && subtree.has(String(d.folderId)),
      );
      if (rows.length === 0) {
        showOperationalToast({
          title: "Nothing to download",
          description: `"${folderName}" has no downloadable files.`,
          variant: "default",
        });
        return;
      }

      const zipBase =
        sanitizeZipPathSegment(folderName).replace(/\.+$/g, "") || "folder";
      setErr(null);
      setDownloadingFolderId(folderId);
      setBulkBusy(true);
      showOperationalToast({
        title: "Preparing download",
        description:
          rows.length === 1
            ? `1 file from ${folderName}`
            : `${rows.length} files from ${folderName}`,
        variant: "default",
      });
      try {
        const items = await Promise.all(
          rows.map((d) =>
            buildVaultDownloadItem(d, (fileName) =>
              buildVaultFolderSubtreeZipPath(
                vaultFolders,
                folderId,
                d.folderId,
                fileName,
              ),
            ),
          ),
        );
        await downloadVaultDocumentsZip(items, `${zipBase}.zip`, (progress) => {
          if (
            progress.completed === 0 ||
            progress.completed === progress.total
          ) {
            return;
          }
          if (
            progress.completed % 5 === 0 ||
            progress.completed === progress.total - 1
          ) {
            showOperationalToast({
              title: "Downloading…",
              description: `${progress.completed} / ${progress.total} · ${folderName}`,
              variant: "default",
            });
          }
        });
        showOperationalToast({
          title: "Download started",
          description: `${folderName} (${rows.length} file${rows.length === 1 ? "" : "s"})`,
          variant: "success",
        });
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        setErr(message);
        showOperationalToast({
          title: "Download failed",
          description: message,
          variant: "destructive",
        });
      } finally {
        setDownloadingFolderId(null);
        setBulkBusy(false);
      }
    },
    [buildVaultDownloadItem, bulkSelectableRows, memberUserKey, vaultFolders],
  );

  const handleDownloadOriginal = useCallback(
    async (doc: DocRow) => {
      if (!memberUserKey || !doc.latestVersionId) {
        setErr("No file version available to download.");
        return;
      }
      setErr(null);
      setDownloadingDocId(doc._id);
      try {
        const urlResult = await convex.query(api.libraryDocuments.getVersionUrl, {
          documentId: doc._id,
          versionId: doc.latestVersionId,
          memberUserKey,
        });
        if (urlResult.status !== "ok" || !urlResult.url) {
          throw new Error(`Could not load ${doc.title}`);
        }
        await downloadRemoteFile(
          urlResult.url,
          vaultDocumentOutboundFileName(doc),
        );
        showOperationalToast({
          title: "Download started",
          description: doc.title,
          variant: "success",
        });
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        setErr(message);
        showOperationalToast({
          title: "Download failed",
          description: message,
          variant: "destructive",
        });
      } finally {
        setDownloadingDocId(null);
      }
    },
    [convex, memberUserKey],
  );

  const handleDownloadAsPdf = useCallback(
    async (doc: DocRow) => {
      if (!memberUserKey || !doc.latestVersionId) {
        setErr("No file version available for PDF export.");
        return;
      }
      setErr(null);
      setExportingPdfDocId(doc._id);
      try {
        const urlResult = await convex.query(api.libraryDocuments.getVersionUrl, {
          documentId: doc._id,
          versionId: doc.latestVersionId,
          memberUserKey,
        });
        if (urlResult.status !== "ok" || !urlResult.url) {
          throw new Error(`Could not load ${doc.title}`);
        }
        await downloadVaultDocumentAsPdf({
          title: doc.title,
          url: urlResult.url,
          contentType: doc.latestContentType,
          fileName: vaultDocumentOutboundFileName(doc),
        });
        showOperationalToast({
          title: "PDF download started",
          description: doc.title,
          variant: "success",
        });
      } catch (e) {
        setErr(e instanceof Error ? e.message : String(e));
      } finally {
        setExportingPdfDocId(null);
      }
    },
    [convex, memberUserKey],
  );

  const handleDownloadDocument = useCallback(
    async (doc: DocRow) => {
      if (defaultVaultDownloadFormat(doc) === "pdf") {
        await handleDownloadAsPdf(doc);
        return;
      }
      await handleDownloadOriginal(doc);
    },
    [handleDownloadAsPdf, handleDownloadOriginal],
  );

  const handleMoveDocumentToFolder = useCallback(
    async (
      doc: DocRow,
      folderId: Id<"documentFolders"> | null,
      fileTaskId?: Id<"documentVaultFileTasks"> | null,
    ) => {
      if (!memberUserKey || !vaultPipelineFileId) return;
      setErr(null);
      try {
        await patchLinkMetadata({
          documentId: doc._id,
          proof: { kind: "pipeline", pipelineFileId: vaultPipelineFileId },
          folderId: folderId ?? "__unset__",
          ...(fileTaskId !== undefined
            ? { fileTaskId: fileTaskId ?? "__unset__" }
            : {}),
          memberUserKey,
        });
      } catch (e) {
        setErr(e instanceof Error ? e.message : String(e));
        throw e;
      }
    },
    [memberUserKey, patchLinkMetadata, vaultPipelineFileId],
  );

  const vaultDragSensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 200, tolerance: 6 },
    }),
  );

  const allVaultSortableIds = useMemo(() => {
    const folderIds = (vaultFolders ?? []).map((f) => vaultFolderSortableId(f._id));
    const taskIds = (vaultFileTasks ?? []).map((t) =>
      vaultFileTaskSortableId(t._id),
    );
    return [...taskIds, ...folderIds];
  }, [vaultFolders, vaultFileTasks]);

  const vaultCollisionDetection: CollisionDetection = useCallback((args) => {
    const activeId = String(args.active.id);
    const activeIsFolder = parseVaultFolderActiveId(activeId) != null;
    const activeIsDoc = parseVaultDocumentDragId(activeId) != null;
    const pointerHits = pointerWithin(args);
    const hits = pointerHits.length > 0 ? pointerHits : closestCenter(args);
    if (hits.length === 0) return hits;

    const pickFirst = (match: (id: string) => boolean) =>
      hits.find((collision) => match(String(collision.id)));

    const withoutRoot = hits.filter((collision) => collision.id !== VAULT_DROP_ROOT);

    if (activeIsFolder) {
      const folderDropHit = pickFirst((id) =>
        id.startsWith(VAULT_DROP_FOLDER_PREFIX),
      );
      if (folderDropHit) return [folderDropHit];
      const fileTaskHit = pickFirst((id) => isVaultFileTaskTargetId(id));
      if (fileTaskHit) return [fileTaskHit];
      const folderSortHit = pickFirst((id) =>
        id.startsWith(VAULT_SORT_FOLDER_PREFIX),
      );
      if (folderSortHit) return [folderSortHit];
      return withoutRoot.length > 0 ? withoutRoot : hits;
    }

    if (activeIsDoc) {
      const folderHit = pickFirst(
        (id) =>
          id.startsWith(VAULT_DROP_FOLDER_PREFIX) ||
          id.startsWith(VAULT_SORT_FOLDER_PREFIX),
      );
      if (folderHit) return [folderHit];
      const fileTaskHit = pickFirst((id) => isVaultFileTaskTargetId(id));
      if (fileTaskHit) return [fileTaskHit];
      return withoutRoot.length > 0 ? withoutRoot : hits;
    }

    return hits;
  }, []);

  const resolveFolderDropLabel = useCallback(
    (folderId: Id<"documentFolders"> | null) => {
      if (folderId == null) return rootLabel ?? "Root";
      return (
        vaultFolders?.find((f) => f._id === folderId)?.name ?? "folder"
      );
    },
    [rootLabel, vaultFolders],
  );

  const resolveBulkDragIds = useCallback(
    (primaryDocId: Id<"libraryDocuments">): Id<"libraryDocuments">[] => {
      const primaryRow = displayRows?.find((d) => d._id === primaryDocId);
      if (!primaryRow || primaryRow.linkScope !== "pipeline") return [];

      const isPrimarySelected = bulkSelectedIds.has(String(primaryDocId));
      const selectedPipelineIds = [...bulkSelectedIds]
        .map((id) => id as Id<"libraryDocuments">)
        .filter((id) => {
          const row = displayRows?.find((d) => d._id === id);
          return (
            row?.linkScope === "pipeline" &&
            row.latestVersionNumber > 0 &&
            row.reviewStatus !== "rejected"
          );
        });

      if (isPrimarySelected && selectedPipelineIds.length > 1) {
        return selectedPipelineIds;
      }
      if (primaryRow.reviewStatus === "rejected") return [];
      return [primaryDocId];
    },
    [bulkSelectedIds, displayRows],
  );

  const handleVaultDragStart = useCallback(
    (event: DragStartEvent) => {
      const fileTaskId = parseVaultFileTaskSortableId(String(event.active.id));
      if (fileTaskId) {
        setActiveDragFileTaskId(fileTaskId);
        setActiveDragFolderId(null);
        setActiveDragDocId(null);
        setActiveDragDocIds([]);
        return;
      }
      const folderId = parseVaultFolderActiveId(String(event.active.id));
      if (folderId) {
        setActiveDragFolderId(folderId);
        setActiveDragDocId(null);
        setActiveDragDocIds([]);
        return;
      }
      const docId = parseVaultDocumentDragId(String(event.active.id));
      if (!docId) return;
      const documentIds = resolveBulkDragIds(docId);
      if (documentIds.length === 0) return;
      setActiveDragFolderId(null);
      setActiveDragDocId(docId);
      setActiveDragDocIds(documentIds);
    },
    [resolveBulkDragIds],
  );

  const handleVaultDragOver = useCallback((event: DragOverEvent) => {
    const activeFolderId = parseVaultFolderSortableId(String(event.active.id));
    if (activeFolderId) {
      const visual = resolveFolderDragVisual(event);
      folderDragVisualRef.current = visual;
      setFolderDragVisual(visual);
    } else if (folderDragVisualRef.current !== EMPTY_FOLDER_DRAG_VISUAL) {
      folderDragVisualRef.current = EMPTY_FOLDER_DRAG_VISUAL;
      setFolderDragVisual(EMPTY_FOLDER_DRAG_VISUAL);
    }

    const hoverFolderId = resolveFolderDragHoverExpandTarget(event);
    if (hoverFolderId && hoverFolderId !== dragExpandFolderRef.current) {
      dragExpandFolderRef.current = hoverFolderId;
      if (dragExpandTimerRef.current) {
        clearTimeout(dragExpandTimerRef.current);
      }
      dragExpandTimerRef.current = setTimeout(() => {
        setDragAutoExpandFolderIds([hoverFolderId]);
      }, 1000);
    } else if (!hoverFolderId) {
      if (dragExpandTimerRef.current) {
        clearTimeout(dragExpandTimerRef.current);
        dragExpandTimerRef.current = null;
      }
      dragExpandFolderRef.current = null;
    }
  }, []);

  const clearDragExpandState = useCallback(() => {
    if (dragExpandTimerRef.current) {
      clearTimeout(dragExpandTimerRef.current);
      dragExpandTimerRef.current = null;
    }
    dragExpandFolderRef.current = null;
    setDragAutoExpandFolderIds([]);
  }, []);

  const handleVaultDragCancel = useCallback(() => {
    folderDragVisualRef.current = EMPTY_FOLDER_DRAG_VISUAL;
    setFolderDragVisual(EMPTY_FOLDER_DRAG_VISUAL);
    clearDragExpandState();
    setActiveDragDocId(null);
    setActiveDragDocIds([]);
    setActiveDragFolderId(null);
    setActiveDragFileTaskId(null);
  }, [clearDragExpandState]);

  const handleVaultDragEnd = useCallback(
    async (event: DragEndEvent) => {
      const visual = folderDragVisualRef.current;
      folderDragVisualRef.current = EMPTY_FOLDER_DRAG_VISUAL;
      setFolderDragVisual(EMPTY_FOLDER_DRAG_VISUAL);
      clearDragExpandState();

      const draggedFolderId =
        activeDragFolderId ??
        parseVaultFolderActiveId(String(event.active.id));
      const draggedFileTaskId =
        activeDragFileTaskId ??
        parseVaultFileTaskSortableId(String(event.active.id));
      const documentIds = activeDragDocIds;
      setActiveDragDocId(null);
      setActiveDragDocIds([]);
      setActiveDragFolderId(null);
      setActiveDragFileTaskId(null);

      if (!event.over || !vaultPipelineFileId || !memberUserKey) {
        return;
      }

      if (draggedFileTaskId && vaultFileTasks) {
        const overTaskId = parseVaultFileTaskSortableId(String(event.over.id));
        if (!overTaskId || overTaskId === draggedFileTaskId) return;

        const taskIds = vaultFileTasks.map((t) => t._id);
        const oldIndex = taskIds.indexOf(draggedFileTaskId);
        const newIndex = taskIds.indexOf(overTaskId);
        if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) {
          return;
        }

        const newOrder = arrayMove(taskIds, oldIndex, newIndex);
        setOptimisticFileTaskOrder(newOrder);
        try {
          await reorderFileTasks({
            pipelineFileId: vaultPipelineFileId,
            orderedFileTaskIds: newOrder,
            memberUserKey,
          });
          showOperationalToast({
            title: "File task order updated",
            variant: "success",
          });
          setOptimisticFileTaskOrder(undefined);
        } catch (e) {
          setOptimisticFileTaskOrder(undefined);
          setErr(e instanceof Error ? e.message : String(e));
        }
        return;
      }

      if (draggedFolderId) {
        if (!vaultFolders) return;

        const draggedRow = vaultFolders.find((f) => f._id === draggedFolderId);
        if (!draggedRow) return;

        const dropOnTaskId = parseVaultFileTaskTargetId(String(event.over.id));
        if (dropOnTaskId) {
          try {
            await assignFolderToFileTask({
              folderId: draggedFolderId,
              fileTaskId: dropOnTaskId,
              memberUserKey,
            });
            showOperationalToast({
              title: "Folder moved to file task",
              description:
                vaultFileTasks?.find((t) => t._id === dropOnTaskId)?.title ??
                "Requirement",
              variant: "success",
            });
          } catch (e) {
            setErr(e instanceof Error ? e.message : String(e));
          }
          return;
        }

        const currentParent = draggedRow.parentFolderId ?? null;

        if (visual.mode === "nest") {
          const targetParent = visual.nestTargetFolderId;
          if (
            draggedFolderId !== targetParent &&
            (currentParent ?? null) !== (targetParent ?? null)
          ) {
            const targetRow = targetParent
              ? vaultFolders.find((f) => f._id === targetParent)
              : null;
            try {
              await moveFolder({
                folderId: draggedFolderId,
                parentFolderId: targetParent,
                fileTaskId:
                  targetParent == null
                    ? null
                    : (targetRow?.fileTaskId ?? null),
                memberUserKey,
              });
              showOperationalToast({
                title: "Folder moved",
                variant: "success",
              });
            } catch (e) {
              setErr(e instanceof Error ? e.message : String(e));
            }
            return;
          }
        }

        const overSortId =
          parseVaultFolderSortableId(String(event.over.id)) ??
          visual.insertBeforeFolderId;
        if (!overSortId || overSortId === draggedFolderId) return;

        const overRow = vaultFolders.find((f) => f._id === overSortId);
        if (!overRow) return;

        const overParent = overRow.parentFolderId ?? null;
        if (overParent !== currentParent) return;

        const parentKey =
          currentParent == null ? "__root__" : String(currentParent);
        const siblingIds = orderedSiblingFolderIds(
          vaultFolders,
          currentParent,
          optimisticSiblingOrder,
        );
        const oldIndex = siblingIds.indexOf(draggedFolderId);
        const newIndex = siblingIds.indexOf(overSortId);
        if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) {
          return;
        }

        const newOrder = arrayMove(siblingIds, oldIndex, newIndex);
        setOptimisticSiblingOrder((prev) => ({
          ...prev,
          [parentKey]: newOrder,
        }));

        try {
          await reorderSiblingFolders({
            pipelineFileId: vaultPipelineFileId,
            parentFolderId: currentParent ?? undefined,
            orderedFolderIds: newOrder,
            memberUserKey,
          });
          showOperationalToast({
            title: "Folder order updated",
            variant: "success",
          });
          setOptimisticSiblingOrder((prev) => {
            const next = { ...prev };
            delete next[parentKey];
            return next;
          });
        } catch (e) {
          setOptimisticSiblingOrder((prev) => {
            const next = { ...prev };
            delete next[parentKey];
            return next;
          });
          setErr(e instanceof Error ? e.message : String(e));
        }
        return;
      }

      if (documentIds.length === 0) {
        return;
      }

      const dropTarget = resolveVaultDocumentDropTarget(String(event.over.id));
      if (!dropTarget) return;

      const targetFolderId = dropTarget.folderId;
      let targetFileTaskId = dropTarget.fileTaskId;
      if (targetFolderId && !targetFileTaskId) {
        const folderRow = vaultFolders?.find((f) => f._id === targetFolderId);
        targetFileTaskId = folderRow?.fileTaskId;
      }

      const movableIds = documentIds.filter((id) => {
        const row = displayRows?.find((d) => d._id === id);
        return (
          row?.linkScope === "pipeline" &&
          row.reviewStatus !== "rejected" &&
          ((row.folderId ?? null) !== targetFolderId ||
            (row.fileTaskId ?? null) !== (targetFileTaskId ?? null))
        );
      });
      if (movableIds.length === 0) return;

      const folderName = targetFileTaskId
        ? (vaultFileTasks?.find((t) => t._id === targetFileTaskId)?.title ??
          "file task")
        : resolveFolderDropLabel(targetFolderId);
      try {
        if (movableIds.length === 1) {
          const doc = displayRows?.find((d) => d._id === movableIds[0]);
          if (!doc) return;
          await handleMoveDocumentToFolder(
            doc,
            targetFolderId,
            targetFileTaskId ?? null,
          );
          showOperationalToast({
            title: `Moved 1 file to ${folderName}`,
            variant: "success",
          });
        } else if (memberUserKey) {
          const result = await bulkMoveDocuments({
            pipelineFileId: vaultPipelineFileId,
            documentIds: movableIds,
            folderId: targetFolderId ?? "__unset__",
            fileTaskId: targetFileTaskId ?? "__unset__",
            memberUserKey,
          });
          if (result.failures.length > 0) {
            setErr(result.failures.join(" · "));
          }
          showOperationalToast({
            title: `Moved ${result.moved} file${result.moved === 1 ? "" : "s"} to ${folderName}`,
            variant: "success",
          });
          clearBulkSelection();
        }
      } catch {
        /* errors surfaced via setErr or mutation */
      }
    },
    [
      activeDragDocIds,
      activeDragFileTaskId,
      activeDragFolderId,
      assignFolderToFileTask,
      bulkMoveDocuments,
      clearBulkSelection,
      clearDragExpandState,
      displayRows,
      handleMoveDocumentToFolder,
      memberUserKey,
      moveFolder,
      optimisticSiblingOrder,
      reorderFileTasks,
      reorderSiblingFolders,
      resolveFolderDropLabel,
      vaultFileTasks,
      vaultFolders,
      vaultPipelineFileId,
    ],
  );

  const handleRejectDocument = useCallback(
    async (documentId: Id<"libraryDocuments">, reason: string) => {
      if (!memberUserKey || !vaultPipelineFileId) return;
      setErr(null);
      setBusyDoc(documentId);
      try {
        const result = await rejectAndRequestDocument({
          documentId,
          pipelineFileId: vaultPipelineFileId,
          reason,
          memberUserKey,
        });
        showOperationalToast({
          title: "Document rejected",
          description:
            result.portalRequestsCreated > 0
              ? `Portal re-upload request queued (${result.rejectionReason}).`
              : result.rejectionReason,
          variant: "success",
        });
      } catch (e) {
        setErr(e instanceof Error ? e.message : String(e));
      } finally {
        setBusyDoc(null);
      }
    },
    [memberUserKey, rejectAndRequestDocument, vaultPipelineFileId],
  );

  const handleToggleClientVisibility = useCallback(
    async (row: DocRow) => {
      if (!vaultPipelineFileId || !memberUserKey) return;
      const nextShared = !row.isSharedWithClient;
      setBusyDoc(row._id);
      try {
        await toggleDocumentVisibility({
          documentId: row._id,
          pipelineFileId: vaultPipelineFileId,
          isSharedWithClient: nextShared,
          memberUserKey,
        });
        showOperationalToast({
          title: nextShared ? "Shared with client" : "Internal only",
          description: row.title,
          variant: "success",
        });
      } catch (e) {
        setErr(e instanceof Error ? e.message : String(e));
      } finally {
        setBusyDoc(null);
      }
    },
    [memberUserKey, toggleDocumentVisibility, vaultPipelineFileId],
  );

  const explorerFileRowHandlers = useMemo((): DocumentVaultExplorerFileHandlers | undefined => {
    if (!memberUserKey || layout !== "vault") return undefined;
    return {
      highlightDocumentId,
      bulkSelectedIds,
      busyDoc,
      dragEnabled: Boolean(canMutate && vaultPipelineFileId),
      proofForRow: (row) => proofForDocRow(context, row),
      onToggleBulkSelect: toggleBulkSelect,
      onPreview: openPreview,
      onOpenInWindow: floatingHost ? openDocumentInWindow : undefined,
      onToggleExpanded: (id) => setExpanded((x) => (x === id ? null : id)),
      onMoveDoc: setMoveDocTarget,
      onMoveCopyToFile: crossFileTransferEnabled
        ? (row) =>
            setMoveCopyEntity({
              kind: "document",
              documentId: row._id,
              label: row.title,
            })
        : undefined,
      crossFileTransferEnabled,
      onOpenProperties: openProperties,
      onSaveToContact: setSaveToContactTarget,
      onAssignToRegistry: setAssignTarget,
      onDownload: (row) => void handleDownloadDocument(row),
      onDownloadAsPdf: (row) => void handleDownloadAsPdf(row),
      onDownloadOriginal: (row) => void handleDownloadOriginal(row),
      downloadingDocId,
      exportingPdfDocId,
      onRemoveLink: (documentId, linkProof, isGlobalContactDoc, title) => {
        void (async () => {
          const ok = await confirm(
            unlinkConfirm(
              title,
              isGlobalContactDoc
                ? "This removes the document from the borrower's contact profile link. The file blob and other links to this document are not deleted."
                : "This document is removed from this loan file. Other links stay attached.",
            ),
          );
          if (!ok) return;
          void removeLink({
            documentId,
            link: linkProof,
            memberUserKey,
          }).catch((e) =>
            setErr(e instanceof Error ? e.message : String(e)),
          );
        })();
      },
      onRejectDocument: (documentId, reason) => {
        void handleRejectDocument(documentId, reason);
      },
      onToggleClientVisibility: (row) => {
        void handleToggleClientVisibility(row);
      },
    };
  }, [
    memberUserKey,
    layout,
    highlightDocumentId,
    bulkSelectedIds,
    busyDoc,
    canMutate,
    crossFileTransferEnabled,
    vaultPipelineFileId,
    context,
    toggleBulkSelect,
    openPreview,
    openDocumentInWindow,
    floatingHost,
    openProperties,
    confirm,
    removeLink,
    handleRejectDocument,
    handleToggleClientVisibility,
    handleDownloadDocument,
    handleDownloadAsPdf,
    handleDownloadOriginal,
    downloadingDocId,
    exportingPdfDocId,
  ]);

  const activeDragDoc = useMemo(
    () =>
      activeDragDocId
        ? displayRows?.find((d) => d._id === activeDragDocId) ?? null
        : null,
    [activeDragDocId, displayRows],
  );

  useEffect(() => {
    if (layout !== "vault" || !navigationFocus?.nonce) return;
    if (
      navigationFocus.category &&
      isLibraryDocumentCategory(navigationFocus.category)
    ) {
      setActiveCategoryFilter(navigationFocus.category);
      if (navigationFocus.category !== "tax_return") {
        setActiveTaxYearFilter("all");
      }
    }
    if (navigationFocus.highlightDocumentId) {
      setHighlightDocumentId(navigationFocus.highlightDocumentId);
      if (useVaultNav) {
        openVaultDocumentById(navigationFocus.highlightDocumentId);
      }
    }
  }, [layout, navigationFocus, openVaultDocumentById, setActiveCategoryFilter, setActiveTaxYearFilter, setHighlightDocumentId, useVaultNav]);

  useEffect(() => {
    if (!highlightDocumentId) {
      highlightScrollDoneRef.current = null;
      return;
    }
    if (
      !listRows?.some((r) => r._id === highlightDocumentId) ||
      highlightScrollDoneRef.current === highlightDocumentId
    ) {
      return;
    }
    highlightScrollDoneRef.current = highlightDocumentId;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        document
          .querySelector(`[data-vault-document-id="${highlightDocumentId}"]`)
          ?.scrollIntoView({ behavior: "smooth", block: "center" });
      });
    });
  }, [highlightDocumentId, listRows]);

  useEffect(() => {
    if (!highlightDocumentId) return;

    const timer = window.setTimeout(() => {
      setHighlightDocumentId(null);
      onNavigationFocusConsumed?.();
    }, 2000);

    return () => window.clearTimeout(timer);
  }, [highlightDocumentId, onNavigationFocusConsumed, setHighlightDocumentId]);

  useEffect(() => {
    if (!rows) return;
    setOptimisticMetaByDocId((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const d of rows as DocRow[]) {
        const opt = prev[d._id];
        if (!opt) continue;
        const categoryOk =
          opt.documentCategory === undefined ||
          opt.documentCategory === d.documentCategory ||
          (opt.documentCategory === null && d.documentCategory == null);
        const yearOk =
          opt.taxYear === undefined ||
          opt.taxYear === d.taxYear ||
          (opt.taxYear === null && d.taxYear == null);
        if (categoryOk && yearOk) {
          delete next[d._id];
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [rows]);

  const handleOptimisticMetaChange = useCallback(
    (
      documentId: Id<"libraryDocuments">,
      patch: OptimisticLinkMeta,
    ) => {
      setOptimisticMetaByDocId((prev) => ({
        ...prev,
        [documentId]: { ...prev[documentId], ...patch },
      }));
    },
    [],
  );

  async function onCreateAndUpload(file: File) {
    if (!memberUserKey || uploadBusy) return;
    setErr(null);
    setBatchUploading(true);
    try {
      await uploadFileToVault({
        file,
        proof,
        memberUserKey,
        title: newTitle.trim() || titleFromVaultFileName(file.name),
        folderId: vaultPipelineFileId ? currentFolderId : null,
        mutations: vaultUploadMutations,
        onProgress: setUploadProgress,
      });
      setNewTitle("");
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setUploadProgress(null);
      setBatchUploading(false);
    }
  }

  async function onBatchUpload(
    files: FileList | File[],
    targetFolderId?: Id<"documentFolders"> | null,
    targetFileTaskId?: Id<"documentVaultFileTasks"> | null,
  ) {
    if (!memberUserKey || uploadBusy) return;
    const list = Array.from(files);
    if (list.length === 0) return;
    const folderId =
      targetFolderId !== undefined
        ? targetFolderId
        : vaultPipelineFileId
          ? currentFolderId
          : null;
    const fileTaskId = targetFileTaskId ?? undefined;
    setErr(null);
    setBatchUploading(true);
    const failures: string[] = [];
    try {
      for (let i = 0; i < list.length; i++) {
        const file = list[i]!;
        try {
          await uploadFileToVault({
            file,
            proof,
            memberUserKey,
            title: newTitle.trim() || titleFromVaultFileName(file.name),
            folderId: vaultPipelineFileId ? folderId : null,
            fileTaskId: vaultPipelineFileId ? fileTaskId : null,
            mutations: vaultUploadMutations,
            fileIndex: i + 1,
            fileCount: list.length,
            onProgress: setUploadProgress,
          });
        } catch (e) {
          failures.push(
            list.length > 1
              ? `${file.name}: ${e instanceof Error ? e.message : String(e)}`
              : e instanceof Error
                ? e.message
                : String(e),
          );
        }
      }
      if (failures.length > 0) {
        setErr(failures.join(" · "));
      } else {
        setNewTitle("");
      }
    } finally {
      setUploadProgress(null);
      setBatchUploading(false);
    }
  }

  async function handleOsFilesDropped(
    files: File[],
    parentFolderId: Id<"documentFolders"> | null,
  ) {
    await onBatchUpload(files, parentFolderId);
  }

  async function onNewVersion(
    documentId: Id<"libraryDocuments">,
    file: File,
    rowProof: LibraryDocumentsProof,
  ) {
    if (!memberUserKey || uploadBusy) return;
    setErr(null);
    setBusyDoc(documentId);
    try {
      await uploadNewVersionToVault({
        file,
        documentId,
        proof: rowProof,
        memberUserKey,
        generateUploadUrl: vaultUploadMutations.generateUploadUrl,
        commitDocumentVersion: vaultUploadMutations.commitDocumentVersion,
        enqueueDocumentClassification:
          vaultUploadMutations.enqueueDocumentClassification,
        onProgress: setUploadProgress,
      });
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyDoc(null);
      setUploadProgress(null);
    }
  }

  const uploadControls =
    layout === "vault" ? null : (
      <div className="mb-3 space-y-2 rounded-md border border-dashed border-border/80 bg-muted/10 p-2">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <label className="flex min-w-0 flex-1 flex-col gap-0.5 text-[11px]">
            <span className="text-muted-foreground">New document title</span>
            <Input
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="Borrower P&L"
              className="h-9 text-sm"
            />
          </label>
          <label className="relative inline-flex h-9 shrink-0 cursor-pointer items-center justify-center rounded-md border border-input bg-background px-3 text-sm font-medium hover:bg-muted">
            <Plus className="mr-1 h-3.5 w-3.5" aria-hidden />
            Create + upload
            <input
              type="file"
              className="sr-only"
              disabled={!canUseHub || uploadBusy}
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) void onCreateAndUpload(f);
              }}
            />
          </label>
        </div>
        <p className="text-[10px] text-muted-foreground">
          Max {Math.round(MAX_TASK_ATTACHMENT_BYTES / (1024 * 1024))} MB per file.
          Create uploads version 1; use New version for updates.
        </p>
      </div>
    );

  const listBody =
    listRows === undefined ? (
      layout === "vault" && vaultPipelineFileId ? (
        <LibraryDocumentsVaultGridSkeleton />
      ) : (
        <div
          className="space-y-2"
          role="status"
          aria-live="polite"
          aria-busy="true"
          data-testid="pipeline-documents-vault-loading"
        >
          <div className="h-16 animate-pulse rounded-dlc-md bg-muted/40" />
          <div className="h-16 animate-pulse rounded-dlc-md bg-muted/35" />
          <div className="h-16 animate-pulse rounded-dlc-md bg-muted/30" />
          <span className="sr-only">Loading documents</span>
        </div>
      )
    ) : displayRows !== undefined && displayRows.length === 0 ? (
      <div
        className={cn(
          "rounded-dlc-md border border-dashed border-border/70 bg-dlc-surface-high/40 px-4 py-10 text-center",
          layout === "vault" && "py-14",
        )}
        data-testid="pipeline-documents-vault-empty"
      >
        <p className="text-sm font-medium text-foreground">No documents yet</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Upload underwriting files, IDs, tax returns, and other deal documents.
          Each item is versioned and stored securely.
        </p>
      </div>
    ) : listRows.length === 0 ? (
      <div
        className={cn(
          "rounded-xl border border-dashed border-slate-200/80 bg-white/70 px-4 py-8 text-center dark:border-slate-700/80 dark:bg-slate-800/40",
          layout === "vault" && "py-10",
        )}
        data-testid="pipeline-documents-vault-filter-empty"
      >
        <p className="text-sm font-medium text-foreground">
          {vaultSearchQuery.trim()
            ? "No documents match your search"
            : layout === "vault" &&
              vaultPipelineFileId &&
              categoryFilteredRows &&
              categoryFilteredRows.length > 0
              ? currentFolderId
                ? "This folder is empty"
                : activeCategoryFilter !== "all" ||
                    activeTaxYearFilter !== "all"
                  ? "No documents match this filter"
                  : "No documents in this view"
              : "No documents match this filter"}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {vaultSearchQuery.trim()
            ? "Try a different filename, category, or clear the search bar."
            : layout === "vault" &&
              vaultPipelineFileId &&
              currentFolderId &&
              categoryFilteredRows &&
              categoryFilteredRows.length > 0
              ? "Move documents here or upload new files while inside this folder."
              : "Try another category, folder, or clear filters to see all files."}
        </p>
      </div>
    ) : (
      <LibraryDocumentsList
        rows={listRows}
        layout={layout}
        context={context}
        organizationId={organizationId}
        memberUserKey={memberUserKey}
        canMutate={Boolean(canMutate)}
        canUseHub={canUseHub}
        uploadBusy={uploadBusy}
        useVaultNav={useVaultNav}
        vaultPipelineFileId={vaultPipelineFileId}
        selectedDocumentId={selectedDocumentId}
        highlightDocumentId={highlightDocumentId}
        bulkSelectedIds={bulkSelectedIds}
        bulkSelectableRows={bulkSelectableRows}
        expanded={expanded}
        versions={versions}
        busyDoc={busyDoc}
        proofForRow={(row) => proofForDocRow(context, row)}
        actionTitle={actionTitle}
        onSelectDocument={(id) => openVaultDocumentById(id)}
        onToggleBulkSelect={toggleBulkSelect}
        onBulkSelectAll={() =>
          setBulkSelectedIds(
            new Set(bulkSelectableRows.map((d) => String(d._id))),
          )
        }
        onBulkClearSelection={clearBulkSelection}
        onToggleExpanded={(id) =>
          setExpanded((x) => (x === id ? null : id))
        }
        onPreview={openPreview}
        onMoveDoc={setMoveDocTarget}
        onOpenProperties={openProperties}
        onSaveToContact={setSaveToContactTarget}
        onAssignToRegistry={setAssignTarget}
        onDownloadAsPdf={(row) => void handleDownloadAsPdf(row)}
        onDownloadOriginal={(row) => void handleDownloadOriginal(row)}
        exportingPdfDocId={exportingPdfDocId}
        onNewVersion={onNewVersion}
        onRemoveLink={(documentId, linkProof, isGlobalContactDoc, title) => {
          void (async () => {
            const ok = await confirm(
              unlinkConfirm(
                title,
                isGlobalContactDoc
                  ? "This removes the document from the borrower's contact profile link. The file blob and other links to this document are not deleted."
                  : "This document is removed from this loan file. Other links stay attached.",
              ),
            );
            if (!ok) return;
            void removeLink({
              documentId,
              link: linkProof,
              memberUserKey,
            }).catch((e) =>
              setErr(e instanceof Error ? e.message : String(e)),
            );
          })();
        }}
        onRename={(documentId, title, linkProof) => {
          void patchTitle({
            documentId,
            title,
            proof: linkProof,
            memberUserKey,
          }).catch((er) =>
            setErr(er instanceof Error ? er.message : String(er)),
          );
        }}
        onOptimisticMetaChange={handleOptimisticMetaChange}
        onError={(message) => setErr(message)}
        onAcceptAiSuggestion={(documentId, linkProof) => {
          if (!memberUserKey) return;
          void acceptAiCategorySuggestion({
            documentId,
            proof: linkProof,
            memberUserKey,
          }).catch((e) =>
            setErr(e instanceof Error ? e.message : String(e)),
          );
        }}
        onRejectDocument={(documentId, reason) => {
          void handleRejectDocument(documentId, reason);
        }}
        dragEnabled={
          layout === "vault" && !!vaultPipelineFileId && Boolean(canMutate)
        }
        showBulkToolbar={layout === "vault" && !!vaultPipelineFileId}
        bulkToolbar={
          layout === "vault" && vaultPipelineFileId ? (
            <DocumentVaultBulkToolbar
              className="mb-3"
              count={bulkSelectedIds.size}
              busy={bulkBusy}
              onMove={() => setBulkMoveOpen(true)}
              onDelete={() => void handleBulkDelete()}
              onDownload={() => void handleBulkDownload()}
              onDueDiligence={organizationId ? openDueDiligence : undefined}
              onClear={clearBulkSelection}
            />
          ) : null
        }
      />
    );

  return (
    <>
      {layout === "vault" ? (
        <div className={cn("flex min-w-0 w-full flex-col", premiumTabStackClass)}>
          {!canMutate ? (
            <p className="text-xs text-muted-foreground">
              Sign in to add documents
              {!canUseHub ? " (connect to Convex to upload)." : "."}
            </p>
          ) : null}

          {err ? (
            <p className="text-xs text-destructive" role="alert">
              {err}
            </p>
          ) : null}

          {layout === "vault" &&
          staleCompliance &&
          (staleCompliance.expiredCount > 0 ||
            staleCompliance.expiringSoonCount > 0) ? (
            <div
              className="rounded-dlc-md border border-amber-500/30 bg-amber-500/5 px-3 py-2.5 text-xs text-foreground"
              data-testid="document-vault-compliance-banner"
              role="status"
            >
              <span className="font-semibold">Document compliance</span>
              {" — "}
              {staleCompliance.expiredCount > 0 ? (
                <span>
                  {staleCompliance.expiredCount} expired
                  {staleCompliance.expiringSoonCount > 0 ? ", " : ""}
                </span>
              ) : null}
              {staleCompliance.expiringSoonCount > 0 ? (
                <span>{staleCompliance.expiringSoonCount} expiring soon</span>
              ) : null}
              {canMutate && staleCompliance.expiredCount > 0 ? (
                <span className="text-muted-foreground">
                  {" "}
                  · Client portal re-upload requests were queued automatically.
                </span>
              ) : null}
            </div>
          ) : null}

          {vaultPipelineFileId ? (
            <DndContext
              autoScroll={false}
              sensors={vaultDragSensors}
              collisionDetection={vaultCollisionDetection}
              onDragStart={handleVaultDragStart}
              onDragOver={handleVaultDragOver}
              onDragCancel={handleVaultDragCancel}
              onDragEnd={(e) => void handleVaultDragEnd(e)}
            >
              <DocumentVaultCommandBar
                canMutate={Boolean(canMutate)}
                canUseHub={canUseHub}
                uploadBusy={uploadBusy}
                searchQuery={vaultSearchQuery}
                onSearchChange={setVaultSearchQuery}
                onAddFileTasks={
                  canMutate ? () => setFileTaskBatchOpen(true) : undefined
                }
                onCreate={
                  canMutate ? () => setCreatorOpen(true) : undefined
                }
                onCompile={
                  canMutate ? () => setCompilerOpen(true) : undefined
                }
                onRecallFromClientVault={
                  canMutate && hasLinkedContacts
                    ? () => setRecallClientVaultOpen(true)
                    : undefined
                }
                onGenerateClientLink={
                  canMutate ? () => setClientLinkOpen(true) : undefined
                }
                onManagePortalLinks={
                  canMutate && memberUserKey && vaultPipelineFileId
                    ? () => setLinkRepositoryOpen(true)
                    : undefined
                }
                onViewAsClient={
                  canMutate && memberUserKey && vaultPipelineFileId
                    ? () => {
                        void (async () => {
                          try {
                            const result = await issueViewAsClient({
                              pipelineFileId: vaultPipelineFileId,
                              memberUserKey,
                              writeMode: true,
                            });
                            if (!result.ok) {
                              setErr(result.message);
                              return;
                            }
                            const token = extractClientPortalTokenFromPreview(result);
                            const slug = extractCompanySlugFromPreview(result);
                            if (!token) {
                              setErr(
                                "Preview link was created but the token could not be read. Try again or redeploy Convex.",
                              );
                              return;
                            }
                            const previewPath = slug
                              ? `/${encodeURIComponent(slug)}/${encodeURIComponent(token)}`
                              : `/client-portal/${encodeURIComponent(token)}`;
                            const previewUrl = result.previewUrl?.trim()
                              ? result.previewUrl
                              : `${window.location.origin}${previewPath}`;
                            window.open(
                              previewUrl,
                              "_blank",
                              "noopener,noreferrer",
                            );
                          } catch (e) {
                            setErr(
                              e instanceof Error
                                ? e.message
                                : "Preview failed.",
                            );
                          }
                        })();
                      }
                    : undefined
                }
                onApplyTemplates={
                  canMutate && organizationId
                    ? () => setApplyTemplateOpen(true)
                    : undefined
                }
                onDeliverToLender={
                  canMutate && organizationId
                    ? () => setDeliverLenderOpen(true)
                    : undefined
                }
                onDueDiligence={
                  canMutate && organizationId ? openDueDiligence : undefined
                }
                onFilesSelected={(files) => onBatchUpload(files)}
                typeFilters={gridTypeFilters}
                onTypeFiltersChange={setGridTypeFilters}
                statusFilters={gridStatusFilters}
                onStatusFiltersChange={setGridStatusFilters}
                categoryFilter={activeCategoryFilter}
                onCategoryFilterChange={handleCategoryFilterChange}
                taxYearFilter={activeTaxYearFilter}
                onTaxYearFilterChange={setActiveTaxYearFilter}
                availableTaxYears={availableTaxYears}
              />

              {canMutate && uploadBusy ? (
                <UploadAndOrganizeZone
                  title={newTitle}
                  onTitleChange={setNewTitle}
                  disabled={!canUseHub}
                  busy={uploadBusy}
                  progress={uploadProgress}
                  onFilesSelected={(files) => onBatchUpload(files)}
                  className="mb-2 shrink-0"
                />
              ) : null}

              {layout === "vault" &&
              vaultPipelineFileId &&
              bulkSelectedIds.size > 0 ? (
                <DocumentVaultBulkToolbar
                  className="mb-2"
                  count={bulkSelectedIds.size}
                  busy={bulkBusy}
                  onMove={() => setBulkMoveOpen(true)}
                  onDelete={() => void handleBulkDelete()}
                  onDownload={() => void handleBulkDownload()}
                  onDueDiligence={organizationId ? openDueDiligence : undefined}
                  onClear={clearBulkSelection}
                />
              ) : null}

              {explorerDocumentRows === undefined ||
              vaultFolders === undefined ||
              vaultFileTasks === undefined ? (
                <LibraryDocumentsVaultGridSkeleton />
              ) : (
                <SortableContext
                  items={allVaultSortableIds}
                  strategy={verticalListSortingStrategy}
                >
                  <DocumentVaultDirectoryTree
                  className="w-full"
                  pipelineFileId={vaultPipelineFileId}
                  memberUserKey={memberUserKey}
                  canMutate={canMutate}
                  folders={vaultFolders}
                  fileTasks={vaultFileTasks}
                  optimisticFileTaskOrder={optimisticFileTaskOrder}
                  onAddFileTasks={
                    canMutate ? () => setFileTaskBatchOpen(true) : undefined
                  }
                  onApplyTemplates={
                    canMutate && organizationId
                      ? () => setApplyTemplateOpen(true)
                      : undefined
                  }
                  organizationId={organizationId}
                  archivedFileTasks={archivedVaultFileTasks}
                  showArchived={showArchivedTasks}
                  onToggleShowArchived={() => setShowArchivedTasks((v) => !v)}
                  onDownloadAll={() => void handleDownloadAll()}
                  onDownloadSelected={() => void handleBulkDownload()}
                  onDownloadFolder={(folderId, folderName) =>
                    void handleDownloadFolder(folderId, folderName)
                  }
                  downloadingFolderId={downloadingFolderId}
                  downloadBusy={bulkBusy}
                  bulkSelectedCount={bulkSelectedIds.size}
                  downloadableCount={bulkSelectableRows.length}
                  crossFileTransferEnabled={crossFileTransferEnabled}
                  onMoveCopyFolder={
                    crossFileTransferEnabled
                      ? (folderId, folderName) =>
                          setMoveCopyEntity({
                            kind: "folder",
                            folderId,
                            label: folderName,
                          })
                      : undefined
                  }
                  onMoveCopyFileTask={
                    crossFileTransferEnabled
                      ? (fileTaskId, title) =>
                          setMoveCopyEntity({
                            kind: "fileTask",
                            fileTaskId,
                            label: title,
                          })
                      : undefined
                  }
                  onOpenDocument={openVaultDocumentById}
                  onOsFilesDroppedToTask={
                    canMutate
                      ? (files, fileTaskId) =>
                          void onBatchUpload(files, null, fileTaskId)
                      : undefined
                  }
                  documentRows={explorerDocumentRows}
                  fileRowHandlers={explorerFileRowHandlers}
                  rootLabel={dealPackageLabel || rootLabel || "Deal Package"}
                  vaultSearchQuery={vaultSearchQuery}
                  onSearchChange={setVaultSearchQuery}
                  dropEnabled={Boolean(canMutate)}
                  osFileDropEnabled={Boolean(canMutate && canUseHub && !uploadBusy)}
                  onOsFilesDropped={
                    canMutate
                      ? (files, parentFolderId) =>
                          void handleOsFilesDropped(files, parentFolderId)
                      : undefined
                  }
                  folderDragVisual={folderDragVisual}
                  autoExpandFolderIds={dragAutoExpandFolderIds}
                  optimisticSiblingOrder={optimisticSiblingOrder}
                  onImportFromContact={() => setImportFromContactOpen(true)}
                  onError={(message) => setErr(message)}
                />
                </SortableContext>
              )}

              {propertiesDocumentId && propertiesRow ? (
                <DocumentPropertiesPanel
                  documentId={propertiesDocumentId}
                  proof={
                    proofForDocRow(context, propertiesRow) ?? {
                      kind: "pipeline",
                      pipelineFileId: vaultPipelineFileId,
                    }
                  }
                  memberUserKey={memberUserKey}
                  canMutate={canMutate}
                  onClose={closeProperties}
                  onError={(message) => setErr(message)}
                  className="mt-4 w-full"
                />
              ) : null}

              <DragOverlay dropAnimation={null}>
                {activeDragDocIds.length > 0 ? (
                  <div className="relative">
                    {activeDragDocIds.length > 1 ? (
                      <>
                        <div className="absolute left-1 top-1 h-full w-full rounded-dlc-md border border-primary/20 bg-dlc-surface-high/80 shadow-dlc-1" />
                        <div className="absolute left-0.5 top-0.5 h-full w-full rounded-dlc-md border border-primary/15 bg-dlc-surface-high/60 shadow-dlc-1" />
                      </>
                    ) : null}
                    <div className="relative flex items-center gap-2 rounded-dlc-md border border-primary/40 bg-dlc-surface-high px-3 py-2 text-sm shadow-dlc-2">
                      <FileText className="h-4 w-4 text-primary" aria-hidden />
                      <span className="max-w-[14rem] truncate font-medium">
                        {activeDragDocIds.length > 1
                          ? `Moving ${activeDragDocIds.length} files…`
                          : (activeDragDoc?.title ?? "Document")}
                      </span>
                    </div>
                  </div>
                ) : null}
              </DragOverlay>
            </DndContext>
          ) : (
            <section
              className={cn(
                vaultPipelineFileId && premiumWorkspaceCanvasClass,
                "min-w-0",
              )}
              data-testid="document-vault-documents-zone"
              aria-label="Documents"
            >
              {listBody}
            </section>
          )}

          {vaultPipelineFileId && moveCopyEntity ? (
            <VaultMoveCopyToFileDialog
              open={moveCopyEntity != null}
              onClose={() => setMoveCopyEntity(null)}
              sourcePipelineFileId={vaultPipelineFileId}
              memberUserKey={memberUserKey}
              entity={moveCopyEntity}
            />
          ) : null}

          {vaultPipelineFileId && moveDocTarget ? (
            <MoveToFolderDialog
              open={moveDocTarget != null}
              onClose={() => setMoveDocTarget(null)}
              folders={vaultFolders ?? []}
              currentFolderId={moveDocTarget.folderId ?? null}
              documentTitle={moveDocTarget.title}
              rootLabel={rootLabel ?? "Root"}
              onSelect={(folderId) =>
                handleMoveDocumentToFolder(moveDocTarget, folderId)
              }
            />
          ) : null}

          {vaultPipelineFileId && bulkMoveOpen ? (
            <MoveToFolderDialog
              open={bulkMoveOpen}
              onClose={() => setBulkMoveOpen(false)}
              folders={vaultFolders ?? []}
              currentFolderId={currentFolderId}
              documentTitle={`${bulkSelectedIds.size} documents`}
              rootLabel={rootLabel ?? "Root"}
              onSelect={(folderId) => handleBulkMove(folderId)}
            />
          ) : null}

          {vaultPipelineFileId && saveToContactTarget ? (
            <SaveToContactModal
              open={saveToContactTarget != null}
              onClose={() => setSaveToContactTarget(null)}
              pipelineFileId={vaultPipelineFileId}
              memberUserKey={memberUserKey}
              documentId={saveToContactTarget._id}
              documentTitle={saveToContactTarget.title}
              onError={(message) => setErr(message)}
            />
          ) : null}

          {vaultPipelineFileId ? (
            <ImportFromContactModal
              open={importFromContactOpen}
              onClose={() => setImportFromContactOpen(false)}
              pipelineFileId={vaultPipelineFileId}
              currentFolderId={currentFolderId}
              memberUserKey={memberUserKey}
              onError={(message) => setErr(message)}
            />
          ) : null}

          {vaultPipelineFileId && organizationId && assignTarget ? (
            <DocumentAssignModal
              open={assignTarget != null}
              onClose={() => setAssignTarget(null)}
              organizationId={organizationId}
              pipelineFileId={vaultPipelineFileId}
              memberUserKey={memberUserKey}
              documentId={assignTarget._id}
              documentTitle={assignTarget.title}
              onError={(message) => setErr(message)}
            />
          ) : null}

          {vaultPipelineFileId ? (
            <RecallFromClientVaultDrawer
              open={recallClientVaultOpen}
              onClose={() => setRecallClientVaultOpen(false)}
              pipelineFileId={vaultPipelineFileId}
              currentFolderId={currentFolderId}
              memberUserKey={memberUserKey}
              onError={(message) => setErr(message)}
            />
          ) : null}

          {vaultPipelineFileId && isModalOpen && selectedRow ? (
            <DocumentVaultPreviewModal
              open={isModalOpen}
              onClose={closePreview}
              fileName={vaultDocumentOutboundFileName(selectedRow)}
              contentType={selectedRow.latestContentType}
              url={
                selectedPreviewUrl?.status === "ok"
                  ? selectedPreviewUrl.url
                  : null
              }
              loading={selectedPreviewUrl === undefined}
              documentId={selectedRow._id}
              versionId={selectedRow.latestVersionId}
              versionNumber={
                selectedPreviewUrl?.status === "ok"
                  ? selectedPreviewUrl.version
                  : selectedRow.latestVersionNumber
              }
              initialAnnotations={
                selectedPreviewUrl?.status === "ok"
                  ? selectedPreviewUrl.annotations ?? null
                  : null
              }
              proof={selectedRowProof ?? undefined}
              memberUserKey={memberUserKey}
              canMutate={canMutate}
              pipelineFileId={vaultPipelineFileId}
              mergeCandidates={pdfMergeCandidates}
              vaultMutations={vaultUploadMutations}
              onError={(message) => setErr(message)}
              breadcrumbs={previewBreadcrumbs}
              onBreadcrumbSelect={(folderId) =>
                navigateToFolder(folderId, { keepPreview: true })
              }
              onOpenProperties={() => openProperties(selectedRow._id)}
              onOpenInWindow={
                floatingHost && selectedRow.latestVersionId
                  ? () => {
                      openDocumentInWindow(
                        selectedRow._id,
                        selectedRow.latestVersionId!,
                        vaultDocumentOutboundFileName(selectedRow),
                        selectedRow.latestContentType,
                      );
                    }
                  : undefined
              }
              lastModified={selectedRow.updatedAt}
              reviewFooter={previewReviewFooter}
            />
          ) : null}

          {previewRejectTask ? (
            <FileTaskRejectModal
              open
              taskTitle={previewRejectTask.title}
              onClose={() => setPreviewRejectTask(null)}
              onConfirm={async (note) => {
                if (!memberUserKey) return;
                setPreviewReviewBusy(true);
                try {
                  await rejectFileTaskReview({
                    fileTaskId: previewRejectTask._id,
                    rejectionNote: note,
                    memberUserKey,
                  });
                  setPreviewRejectTask(null);
                  showOperationalToast({
                    title: "Revision requested",
                    variant: "success",
                  });
                } catch (e) {
                  setErr(e instanceof Error ? e.message : String(e));
                } finally {
                  setPreviewReviewBusy(false);
                }
              }}
            />
          ) : null}
        </div>
      ) : (
        <>
          {!canMutate ? (
            <p className="mb-2 text-xs text-muted-foreground">
              Sign in to add documents
              {!canUseHub ? " (connect to Convex to upload)." : "."}
            </p>
          ) : null}
          {err ? (
            <p className="mb-2 text-xs text-destructive" role="alert">
              {err}
            </p>
          ) : null}
          {canMutate ? uploadControls : null}
          {listBody}
        </>
      )}

      <AttachmentPreviewDialog
        file={previewRow}
        onClose={() => setPreview(null)}
        actionTitle={actionTitle}
      />

      {vaultPipelineFileId ? (
        <DealBibleCompilerModal
          open={compilerOpen}
          onClose={() => setCompilerOpen(false)}
          pipelineFileId={vaultPipelineFileId}
          organizationId={organizationId}
          memberUserKey={memberUserKey}
          packageLabel={dealPackageLabel}
          folders={vaultFolders}
          fileTasks={vaultFileTasks ?? undefined}
          documents={compilerDocuments}
          vaultUploadMutations={vaultUploadMutations}
          onError={(message) => setErr(message)}
        />
      ) : null}

      {layout === "vault" ? (
        <DocumentVaultCreatorModal
          open={creatorOpen}
          onClose={() => setCreatorOpen(false)}
          tokenContext={liveTokenContext}
          savedTemplates={savedCreatorTemplates}
          onSaveDocument={
            canMutate && memberUserKey && !creatorSaving
              ? handleCreatorSaveDocument
              : undefined
          }
          onSaveTemplate={
            canMutate && memberUserKey && organizationId && !creatorSaving
              ? handleCreatorSaveTemplate
              : undefined
          }
          uploadEditorImage={
            canMutate && memberUserKey ? uploadCreatorEditorImage : undefined
          }
        />
      ) : null}

      {vaultPipelineFileId ? (
        <FileTaskConfigModal
          open={fileTaskBatchOpen}
          onClose={() => setFileTaskBatchOpen(false)}
          mode="create"
          pipelineFileId={vaultPipelineFileId}
          memberUserKey={memberUserKey}
          onSubmit={async (payload) => {
            if (!memberUserKey) {
              showOperationalToast({
                title: "Cannot create task",
                description: "Sign in to create file tasks.",
                variant: "destructive",
              });
              return;
            }
            await createFileTaskWithConfig({
              pipelineFileId: vaultPipelineFileId,
              memberUserKey,
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
              dueDate: payload.dueDate,
              priority: payload.priority,
            });
          }}
        />
      ) : null}

      {vaultPipelineFileId && organizationId ? (
        <DocumentVaultApplyTemplateDrawer
          open={applyTemplateOpen}
          onClose={() => setApplyTemplateOpen(false)}
          organizationId={organizationId}
          pipelineFileId={vaultPipelineFileId}
          memberUserKey={memberUserKey}
          onSuccess={(created) =>
            showOperationalToast({
              title: `Injected ${created} file task${created === 1 ? "" : "s"}`,
              variant: "success",
            })
          }
          onError={(message) => setErr(message)}
        />
      ) : null}

      {vaultPipelineFileId && vaultFileTasks ? (
        <ClientLinkGeneratorModal
          open={clientLinkOpen}
          onClose={() => setClientLinkOpen(false)}
          pipelineFileId={vaultPipelineFileId}
          organizationId={organizationId}
          memberUserKey={memberUserKey}
          fileTasks={vaultFileTasks}
          onError={(message) => setErr(message)}
        />
      ) : null}

      {vaultPipelineFileId && memberUserKey ? (
        <ClientPortalLinkRepository
          open={linkRepositoryOpen}
          onClose={() => setLinkRepositoryOpen(false)}
          pipelineFileId={vaultPipelineFileId}
          memberUserKey={memberUserKey}
          onError={(message) => setErr(message)}
        />
      ) : null}

      {vaultPipelineFileId && organizationId && vaultFileTasks && vaultFolders ? (
        <DeliverToLenderModal
          open={deliverLenderOpen}
          onClose={() => setDeliverLenderOpen(false)}
          pipelineFileId={vaultPipelineFileId}
          organizationId={organizationId}
          memberUserKey={memberUserKey}
          fileTasks={vaultFileTasks}
          folders={vaultFolders}
          documents={explorerDocumentRows ?? []}
          onError={(message) => setErr(message)}
        />
      ) : null}

      {organizationId && memberUserKey ? (
        <DueDiligenceWorkspaceSheet
          open={dueDiligenceOpen}
          onClose={() => setDueDiligenceOpen(false)}
          organizationId={organizationId}
          memberUserKey={memberUserKey}
          pipelineFileId={vaultPipelineFileId || undefined}
          selectedDocuments={dueDiligenceDocuments}
        />
      ) : null}
    </>
  );
}
