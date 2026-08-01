"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { useMutation } from "convex/react";
import { useSortable } from "@dnd-kit/sortable";
import { useDroppable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import {
  Bell,
  Archive,
  ArchiveRestore,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Circle,
  Clock,
  Eye,
  EyeOff,
  FolderPlus,
  GripVertical,
  Link2,
  Maximize2,
  Pencil,
  FileText,
  RotateCcw,
  Trash2,
  Upload,
  User,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { api } from "@/convex/_generated/api";
import { Input } from "@/components/ui/Input";
import { FileTaskReviewActions } from "@/components/library/FileTaskReviewActions";
import { cn } from "@/lib/cn";
import {
  vaultFileTaskDropId,
  vaultFileTaskSortableId,
} from "@/lib/library/documentVaultDnD";
import {
  isOsFileDragEvent,
  readOsFilesFromDragEvent,
} from "@/lib/library/documentVaultOsFileDrop";
import { showOperationalToast } from "@/lib/ui/operationalToast";
import {
  VaultRegistryAssignChip,
  VaultRegistryAssignPopover,
  useRegistryDisplayName,
} from "@/components/library/VaultRegistryAssignPopover";
import { FileTaskRowMetaBadges } from "@/components/library/FileTaskExecutionModal";
import {
  FILE_TASK_TYPE_LABELS,
  resolveTaskType,
  type AssignedBlockEntry,
} from "@/lib/documentVaultTaskTypes";

export type DocumentVaultFileTaskRow = Doc<"documentVaultFileTasks">;

const NOTIFY_COOLDOWN_MS = 60_000;

export type FileTaskStatus = "incomplete" | "pending_review" | "complete";

export type FileTaskContainerProps = {
  fileTask: DocumentVaultFileTaskRow;
  itemCountBadge?: string;
  canMutate: boolean;
  memberUserKey?: string;
  expanded: boolean;
  onToggleExpand: () => void;
  dropEnabled: boolean;
  osFileDropEnabled?: boolean;
  onOsFilesDropped?: (files: File[]) => void;
  onToggleStatus: (status: FileTaskStatus) => Promise<void>;
  onToggleRequired?: (required: boolean) => Promise<void>;
  onUpdateTitle: (title: string) => Promise<void>;
  onTogglePortalVisible: (visible: boolean) => Promise<void>;
  onArchive: () => void;
  onDelete?: () => void;
  onRestore?: () => void;
  onAcceptReview?: () => void;
  onRejectReview?: () => void;
  onResetForClient?: () => void;
  onUpdateAssignedBlocks?: (entries: AssignedBlockEntry[]) => Promise<void>;
  onOpenExecution?: () => void;
  onOpenFullscreen?: () => void;
  onOpenConfig?: () => void;
  pipelineFileId?: Id<"pipeline">;
  organizationId?: Id<"organizations">;
  onNewFolder?: () => void;
  onLinkDocument?: () => void;
  children: ReactNode;
};

function MicroAction({
  label,
  icon: Icon,
  onClick,
  disabled,
  tone = "neutral",
  active,
  title,
}: {
  label: string;
  icon: LucideIcon;
  onClick?: () => void;
  disabled?: boolean;
  tone?: "neutral" | "orange" | "blue" | "green" | "red";
  active?: boolean;
  title?: string;
}) {
  const toneClass =
    tone === "orange"
      ? "text-amber-700 hover:text-amber-900 dark:text-amber-400"
      : tone === "blue"
        ? "text-sky-700 hover:text-sky-900 dark:text-sky-400"
        : tone === "green"
          ? "text-emerald-700 hover:text-emerald-900 dark:text-emerald-400"
          : tone === "red"
            ? "text-red-600 hover:text-red-800 dark:text-red-400"
            : "text-muted-foreground hover:text-foreground";

  return (
    <button
      type="button"
      className={cn(
        "inline-flex items-center gap-0.5 rounded-dlc-sm px-1 py-0.5 text-[10px] font-medium transition-colors duration-dlc-short ease-dlc-standard disabled:cursor-not-allowed disabled:opacity-40",
        toneClass,
        active && "font-semibold",
      )}
      disabled={disabled}
      onClick={onClick}
      title={title ?? label}
    >
      <Icon className="h-3 w-3 shrink-0" aria-hidden />
      <span>{label}</span>
    </button>
  );
}

export function FileTaskContainer({
  fileTask,
  itemCountBadge,
  canMutate,
  memberUserKey,
  expanded,
  onToggleExpand,
  dropEnabled,
  osFileDropEnabled = false,
  onOsFilesDropped,
  onToggleStatus,
  onToggleRequired,
  onUpdateTitle,
  onTogglePortalVisible,
  onArchive,
  onDelete,
  onRestore,
  onAcceptReview,
  onRejectReview,
  onResetForClient,
  onUpdateAssignedBlocks: _onUpdateAssignedBlocks,
  onOpenExecution,
  onOpenFullscreen,
  onOpenConfig,
  pipelineFileId: _pipelineFileId,
  organizationId,
  onNewFolder,
  onLinkDocument,
  children,
}: FileTaskContainerProps) {
  const issueUploadToken = useMutation(
    api.documentVaultFileTaskUploadPortal.issueUploadToken,
  );
  const notifyClient = useMutation(api.documentVaultFileTasks.notifyClient);
  const clearRegistry = useMutation(
    api.documentVaultFileTasks.clearRegistryAssignment,
  );

  const assignBtnRef = useRef<HTMLButtonElement>(null);
  const [assignOpen, setAssignOpen] = useState(false);

  const assigneeName = useRegistryDisplayName(
    fileTask.assignedContactId,
    fileTask.assignedClientId,
    fileTask.assignedLenderId,
    organizationId,
    memberUserKey,
  );

  const isArchived = fileTask.isArchived === true;
  const isComplete = fileTask.status === "complete";
  const isPendingReview = fileTask.status === "pending_review";
  const taskType = resolveTaskType(fileTask.taskType);
  const isBlockAssignment = taskType === "block_assignment";
  const canManageLifecycle = Boolean(memberUserKey);

  const cardSurfaceClass = isComplete
    ? "border-2 border-emerald-200/80 border-l-4 border-l-emerald-500 bg-emerald-50/50 dark:border-emerald-800/80 dark:border-l-emerald-500 dark:bg-emerald-950/20"
    : isPendingReview
      ? "border-2 border-blue-200/80 border-l-4 border-l-blue-500 bg-sky-50/40 dark:border-blue-900/70 dark:border-l-blue-500 dark:bg-sky-950/20"
      : "border-2 border-amber-200/80 border-l-4 border-l-amber-400 bg-amber-50/30 dark:border-amber-900/60 dark:border-l-amber-500 dark:bg-amber-950/10";

  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(fileTask.title);
  const [busy, setBusy] = useState(false);
  const [osDragOver, setOsDragOver] = useState(false);
  const [notifyCooldownUntil, setNotifyCooldownUntil] = useState(0);
  const [notifySent, setNotifySent] = useState(false);
  const [linkBusy, setLinkBusy] = useState(false);
  const uploadInputRef = useRef<HTMLInputElement>(null);

  const handleStatusToggle = useCallback(() => {
    if (!canMutate || busy) return;
    const next: FileTaskStatus = isComplete ? "incomplete" : "complete";
    void onToggleStatus(next);
  }, [busy, canMutate, isComplete, onToggleStatus]);

  const notifyOnCooldown = Date.now() < notifyCooldownUntil;

  useEffect(() => {
    const last = fileTask.lastNotifiedAt;
    if (!last) return;
    const until = last + NOTIFY_COOLDOWN_MS;
    if (Date.now() < until) {
      setNotifyCooldownUntil((prev) => Math.max(prev, until));
      setNotifySent(true);
    }
  }, [fileTask.lastNotifiedAt]);

  useEffect(() => {
    if (!notifyOnCooldown) {
      setNotifySent(false);
      return;
    }
    const remaining = notifyCooldownUntil - Date.now();
    const timer = window.setTimeout(() => {
      setNotifyCooldownUntil(0);
      setNotifySent(false);
    }, remaining);
    return () => window.clearTimeout(timer);
  }, [notifyCooldownUntil, notifyOnCooldown]);

  const {
    attributes,
    listeners,
    setNodeRef: setSortRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: vaultFileTaskSortableId(fileTask._id),
    disabled: !canMutate,
  });

  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: vaultFileTaskDropId(fileTask._id),
    disabled: !dropEnabled,
  });

  const sortStyle = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const commitTitle = useCallback(async () => {
    const trimmed = titleDraft.trim();
    if (!trimmed || trimmed === fileTask.title) {
      setEditingTitle(false);
      setTitleDraft(fileTask.title);
      return;
    }
    setBusy(true);
    try {
      await onUpdateTitle(trimmed);
      setEditingTitle(false);
    } finally {
      setBusy(false);
    }
  }, [fileTask.title, onUpdateTitle, titleDraft]);

  const handleTitleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        e.preventDefault();
        void commitTitle();
      }
      if (e.key === "Escape") {
        setEditingTitle(false);
        setTitleDraft(fileTask.title);
      }
    },
    [commitTitle, fileTask.title],
  );

  const handleOsDragOver = useCallback(
    (e: React.DragEvent) => {
      if (!osFileDropEnabled || !expanded || !isOsFileDragEvent(e)) return;
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = "copy";
      setOsDragOver(true);
    },
    [expanded, osFileDropEnabled],
  );

  const handleOsDragLeave = useCallback(
    (e: React.DragEvent) => {
      if (!osFileDropEnabled || !expanded) return;
      const related = e.relatedTarget as Node | null;
      if (!e.currentTarget.contains(related)) {
        setOsDragOver(false);
      }
    },
    [expanded, osFileDropEnabled],
  );

  const handleOsDrop = useCallback(
    (e: React.DragEvent) => {
      if (!osFileDropEnabled || !expanded || !isOsFileDragEvent(e)) return;
      e.preventDefault();
      e.stopPropagation();
      setOsDragOver(false);
      const files = readOsFilesFromDragEvent(e);
      if (files.length > 0) onOsFilesDropped?.(files);
    },
    [expanded, onOsFilesDropped, osFileDropEnabled],
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

  const handleCopyLink = useCallback(async () => {
    if (!memberUserKey || linkBusy) return;
    setLinkBusy(true);
    try {
      const result = await issueUploadToken({
        fileTaskId: fileTask._id,
        memberUserKey,
      });
      let link = result.uploadUrl;
      try {
        const parsed = new URL(result.uploadUrl);
        if (parsed.pathname.startsWith("/upload/")) {
          link = `${window.location.origin}${parsed.pathname}${parsed.search}`;
        }
      } catch {
        /* keep server-built URL */
      }
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(link);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = link;
        textarea.style.position = "fixed";
        textarea.style.left = "-9999px";
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
      }
      showOperationalToast({
        title: "Direct upload link copied",
        description: "Share this secure link with your client.",
        variant: "success",
      });
    } catch (e) {
      showOperationalToast({
        title: "Could not create link",
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive",
      });
    } finally {
      setLinkBusy(false);
    }
  }, [fileTask._id, issueUploadToken, linkBusy, memberUserKey]);

  const handleNotify = useCallback(async () => {
    if (!memberUserKey || notifyOnCooldown || busy) return;
    setBusy(true);
    try {
      const result = await notifyClient({
        fileTaskId: fileTask._id,
        memberUserKey,
      });
      setNotifyCooldownUntil(Date.now() + NOTIFY_COOLDOWN_MS);
      setNotifySent(true);
      showOperationalToast({
        title: "Reminder sent",
        description:
          result.emailsQueued > 0
            ? `Notified ${result.emailsQueued} portal client${result.emailsQueued === 1 ? "" : "s"}.`
            : "No active portal clients on this file — upload link was refreshed.",
        variant: "success",
      });
    } catch (e) {
      showOperationalToast({
        title: "Notify failed",
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  }, [busy, fileTask._id, memberUserKey, notifyClient, notifyOnCooldown]);

  const handleUploadPick = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files ? Array.from(e.target.files) : [];
      e.target.value = "";
      if (files.length > 0) onOsFilesDropped?.(files);
    },
    [onOsFilesDropped],
  );

  return (
    <li
      ref={setSortRef}
      style={sortStyle}
      className={cn("mb-5 min-w-0 list-none last:mb-0", isDragging && "opacity-60")}
      data-testid={`file-task-container-${fileTask._id}`}
    >
      <div
        ref={setDropRef}
        className={cn(
          "overflow-visible rounded-dlc-md shadow-dlc-1 transition-colors duration-dlc-standard ease-dlc-standard",
          cardSurfaceClass,
          isOver && "ring-1 ring-inset ring-emerald-500/30",
          osDragOver && expanded && "ring-1 ring-inset ring-emerald-500/30",
        )}
      >
        <div className="px-3 py-2">
          <div className="flex min-w-0 items-center gap-1">
            <button
              type="button"
              className="inline-flex h-5 w-4 shrink-0 items-center justify-center text-muted-foreground hover:text-foreground"
              onClick={onToggleExpand}
              aria-expanded={expanded}
              aria-label={expanded ? "Collapse file task" : "Expand file task"}
            >
              {expanded ? (
                <ChevronDown className="h-3 w-3" aria-hidden />
              ) : (
                <ChevronRight className="h-3 w-3" aria-hidden />
              )}
            </button>

            <button
              type="button"
              className="inline-flex h-5 w-5 shrink-0 items-center justify-center"
              disabled={!canMutate || busy}
              onClick={handleStatusToggle}
              aria-label={
                isComplete
                  ? "Mark requirement incomplete"
                  : isPendingReview
                    ? "Mark client upload as reviewed and complete"
                    : "Mark requirement complete"
              }
            >
              {isComplete ? (
                <CheckCircle2
                  className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400"
                  aria-hidden
                />
              ) : isPendingReview ? (
                <Clock
                  className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400"
                  aria-hidden
                />
              ) : (
                <Circle
                  className="h-3.5 w-3.5 text-muted-foreground/80"
                  aria-hidden
                />
              )}
            </button>

            <div className="flex min-w-0 flex-1 items-center gap-1.5">
              {editingTitle && canMutate ? (
                <Input
                  value={titleDraft}
                  onChange={(e) => setTitleDraft(e.target.value)}
                  onBlur={() => void commitTitle()}
                  onKeyDown={handleTitleKeyDown}
                  className="h-6 min-w-0 flex-1 px-1.5 text-xs font-semibold"
                  autoFocus
                  disabled={busy}
                  onClick={(e) => e.stopPropagation()}
                />
              ) : (
                <button
                  type="button"
                  className="inline-flex min-w-0 max-w-full shrink items-center gap-1"
                  onClick={() => {
                    if (isBlockAssignment) {
                      onToggleExpand();
                      return;
                    }
                    onOpenExecution?.();
                  }}
                  title={fileTask.title}
                >
                  <span className="truncate text-xs font-semibold text-foreground hover:underline">
                    {fileTask.title}
                  </span>
                </button>
              )}
              {isPendingReview ? (
                <span className="inline-flex shrink-0 items-center rounded-full bg-blue-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-blue-800 dark:bg-blue-950/60 dark:text-blue-200">
                  Review
                </span>
              ) : null}
              <span className="inline-flex shrink-0 items-center rounded-full bg-muted/60 px-1.5 py-0.5 text-[9px] font-medium text-muted-foreground">
                {FILE_TASK_TYPE_LABELS[taskType]}
              </span>
              {itemCountBadge ? (
                <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-muted/50 px-1.5 py-0.5 text-[9px] font-medium text-muted-foreground">
                  <FileText className="h-2.5 w-2.5" aria-hidden />
                  {itemCountBadge}
                </span>
              ) : null}
              <FileTaskRowMetaBadges fileTask={fileTask} />
            </div>

            {assigneeName ? (
              <VaultRegistryAssignChip
                displayName={assigneeName}
                onClear={
                  canMutate && memberUserKey
                    ? () => {
                        void clearRegistry({
                          fileTaskId: fileTask._id,
                          memberUserKey,
                        });
                      }
                    : undefined
                }
              />
            ) : null}

            {canMutate ? (
              <button
                ref={setActivatorNodeRef}
                type="button"
                className="inline-flex h-5 w-4 shrink-0 cursor-grab touch-none items-center justify-center text-muted-foreground/50 hover:text-foreground active:cursor-grabbing"
                style={{ touchAction: "none" }}
                aria-label="Drag to reorder file task"
                {...attributes}
                {...listeners}
              >
                <GripVertical className="h-3 w-3" aria-hidden />
              </button>
            ) : null}
          </div>

          {(canMutate || canManageLifecycle) ? (
            <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 pl-[calc(1rem+1.25rem)]">
              {canMutate ? (
                <>
              {onToggleRequired ? (
                <MicroAction
                  label="Required"
                  icon={Check}
                  tone="orange"
                  active={fileTask.isRequired}
                  onClick={() => void onToggleRequired(!fileTask.isRequired)}
                />
              ) : fileTask.isRequired ? (
                <span className="text-[10px] font-medium text-amber-700 dark:text-amber-400">
                  Required
                </span>
              ) : null}
              <MicroAction
                label="Direct Link"
                icon={Link2}
                tone="orange"
                disabled={linkBusy}
                onClick={() => void handleCopyLink()}
              />
              <MicroAction
                label={notifySent ? "Sent" : "Notify"}
                icon={notifySent ? Check : Bell}
                tone="blue"
                disabled={notifyOnCooldown || busy}
                active={notifySent}
                title={
                  notifyOnCooldown
                    ? "Reminder sent — wait before sending again"
                    : "Notify client"
                }
                onClick={() => void handleNotify()}
              />
              <MicroAction
                label={fileTask.isPortalVisible ? "Visible" : "Hidden"}
                icon={fileTask.isPortalVisible ? Eye : EyeOff}
                tone="blue"
                active={fileTask.isPortalVisible}
                onClick={() =>
                  void onTogglePortalVisible(!fileTask.isPortalVisible)
                }
              />
              <button
                ref={assignBtnRef}
                type="button"
                className="inline-flex items-center gap-0.5 rounded-dlc-sm px-1 py-0.5 text-[10px] font-medium text-muted-foreground transition-colors hover:text-foreground"
                onClick={() => setAssignOpen(true)}
                title="Link Contact"
              >
                <User className="h-3 w-3 shrink-0" aria-hidden />
                <span>Link Contact</span>
              </button>
              <MicroAction
                label="Edit"
                icon={Pencil}
                onClick={() => onOpenConfig?.()}
              />
              {isBlockAssignment && onOpenFullscreen ? (
                <MicroAction
                  label="Fullscreen"
                  icon={Maximize2}
                  onClick={() => onOpenFullscreen()}
                  title="Expand to fullscreen for heavy data entry"
                />
              ) : null}
                </>
              ) : null}
              {canManageLifecycle ? (
                isArchived && onRestore ? (
                  <MicroAction
                    label="Restore"
                    icon={ArchiveRestore}
                    tone="green"
                    onClick={onRestore}
                  />
                ) : !isArchived ? (
                  <>
                    <MicroAction
                      label="Archive"
                      icon={Archive}
                      tone="neutral"
                      onClick={onArchive}
                      title="Hide task (soft delete)"
                    />
                    {onDelete ? (
                      <MicroAction
                        label="Delete"
                        icon={Trash2}
                        tone="red"
                        onClick={onDelete}
                        title="Permanently delete task and files"
                      />
                    ) : null}
                  </>
                ) : null
              ) : null}
              {canMutate && isPendingReview ? (
                <>
                  <MicroAction
                    label="Approve"
                    icon={Check}
                    tone="green"
                    onClick={() => void onAcceptReview?.()}
                  />
                  <MicroAction
                    label="Revision"
                    icon={XCircle}
                    tone="red"
                    onClick={() => void onRejectReview?.()}
                    title="Request revision from client"
                  />
                  <MicroAction
                    label="Reset"
                    icon={RotateCcw}
                    tone="blue"
                    onClick={() => void onResetForClient?.()}
                    title="Reopen for client without deleting files"
                  />
                </>
              ) : null}
            </div>
          ) : null}
        </div>

        {organizationId ? (
          <VaultRegistryAssignPopover
            open={assignOpen}
            onClose={() => setAssignOpen(false)}
            anchorRef={assignBtnRef}
            organizationId={organizationId}
            memberUserKey={memberUserKey}
            target={{ kind: "fileTask", fileTaskId: fileTask._id }}
            onError={(msg) =>
              showOperationalToast({ title: "Assignment failed", description: msg })
            }
          />
        ) : null}

        {expanded ? (
          <div
            className={cn(
              "border-t border-border/40",
              (osDragOver || isOver) && "bg-emerald-50/30 dark:bg-emerald-950/10",
            )}
            onDragOver={handleOsDragOver}
            onDragLeave={handleOsDragLeave}
            onDrop={handleOsDrop}
            data-testid={`file-task-body-${fileTask._id}`}
          >
            {canMutate && isPendingReview ? (
              <div className="border-b border-border/40 px-3 py-2">
                <FileTaskReviewActions
                  busy={busy}
                  onApprove={() => void onAcceptReview?.()}
                  onRequestRevision={() => void onRejectReview?.()}
                  onResetForClient={
                    onResetForClient
                      ? () => void onResetForClient()
                      : undefined
                  }
                />
              </div>
            ) : null}
            {fileTask.rejectionNote && !isPendingReview ? (
              <p className="border-b border-amber-200/60 bg-amber-50/50 px-3 py-1.5 text-[10px] text-amber-900">
                Revision note: {fileTask.rejectionNote}
              </p>
            ) : null}
            <div className="min-w-0">{children}</div>

            {canMutate ? (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border/30 px-3 pt-1.5 pb-3">
                <input
                  ref={uploadInputRef}
                  type="file"
                  className="sr-only"
                  multiple
                  onChange={handleUploadPick}
                />
                <MicroAction
                  label="Upload"
                  icon={Upload}
                  tone="blue"
                  onClick={() => uploadInputRef.current?.click()}
                />
                <MicroAction
                  label="Link Document"
                  icon={Link2}
                  tone="orange"
                  onClick={onLinkDocument}
                />
                <MicroAction
                  label="New Folder"
                  icon={FolderPlus}
                  tone="blue"
                  onClick={onNewFolder}
                />
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </li>
  );
}
