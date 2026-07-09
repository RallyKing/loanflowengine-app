"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import {
  X,
  Trash2,
  Plus,
  Link as LinkIcon,
  ListChecks,
  ListTree,
  Network,
  CalendarClock,
  Repeat,
  Briefcase,
  AlertTriangle,
  ExternalLink,
  GripVertical,
  Users,
  Maximize2,
  Minimize2,
  MoreHorizontal,
  Paperclip,
  Share2,
  ShoppingCart,
  UserCircle2,
  Zap,
  AlarmClock,
} from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { Button } from "./ui/Button";
import { Input } from "./ui/Input";
import { SearchField } from "./ui/SearchField";
import {
  DropdownMenu,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "./ui/DropdownMenu";
import {
  HeaderDisclosurePanel,
  HeaderDisclosureToggle,
} from "./ui/HeaderDisclosure";
import { CollapsibleSection } from "@/components/CollapsibleSection";
import { PipelineHierarchyBreadcrumb } from "@/components/pipeline/PipelineHierarchyBreadcrumb";
import { ConvexQueryBoundary } from "@/components/ConvexQueryBoundary";
import { TaskAttachmentsPanel } from "@/components/TaskAttachmentsPanel";
import { LibraryDocumentsPanel } from "@/components/LibraryDocumentsPanel";
import { cn } from "@/lib/cn";
import { touchTargetIconClass } from "@/lib/ui/touchTarget";
import { useAttachmentQueryRecovery } from "@/lib/useAttachmentQueryRecovery";
import { useLiveConnection } from "@/lib/useLiveConnection";
import { useOperationalConfirm } from "@/components/ui/OperationalConfirmDialog";
import { simpleDeleteConfirm } from "@/lib/ui/confirmDestructive";
import { useUserPreferences } from "@/lib/userPreferencesContext";
import { useOfflineSync } from "@/lib/offline/OfflineSyncContext";
import {
  InlineText,
  InlineTextarea,
  InlineDate,
  InlineSelect,
  type InlineSelectOption,
} from "./inline";
import { useInlineCommit } from "./inline/useInlineCommit";
import { useOrgPermissions } from "@/lib/useOrgPermissions";
import { contactSearchHaystack } from "@/lib/contact/contactMethods";
import { useOrgMemberDisplayLabel } from "@/lib/useOrgMemberDisplayLabel";
import { useActorUserKey } from "@/lib/useActorUserKey";
import { TaskSharingSection } from "@/components/TaskSharingSection";
import { ResourceAccessBanner } from "@/components/ResourceAccessBanner";
import { ResourceAccessProvider } from "@/components/ResourceAccessProvider";
import { resourceAccessFromViewerAccess } from "@/lib/resourceAccessUx";
import { ResourceAccessDetails } from "@/components/ownership/ResourceAccessDetails";
import { SnoozeMenu, SnoozedBadge } from "./SnoozeMenu";
import { TaskAttemptSnoozeSheet } from "@/components/pipeline/tasks/TaskAttemptSnoozeSheet";
import { TaskAttemptAuditDialog } from "@/components/pipeline/tasks/TaskAttemptAuditDialog";
import { formatRelativeTimestamp } from "@/lib/formatRelativeTimestamp";
import { ErrandLocationsSection } from "./ErrandLocationsSection";
import {
  RecordInspectorBody,
  RecordInspectorFooter,
  RecordInspectorHeader,
  RecordInspectorShell,
  RecordInspectorSkeleton,
} from "@/components/RecordInspectorShell";
import { useWorkspaceSheetDragLock } from "@/components/PipelineWorkspaceMobileVaulFrame";

type TaskOrgConvexArgs = {
  organizationId: Id<"organizations">;
  memberUserKey: string;
};

type TaskPatchArg = Omit<
  Parameters<ReturnType<typeof useMutation<typeof api.tasks.patch>>>[0],
  "organizationId" | "memberUserKey"
>;

type TaskPatchFields = Omit<TaskPatchArg, "id" | "expectedUpdatedAt">;

// ---------- Constants reused from the tasks page ----------

const QUADRANTS = [1, 2, 3, 4] as const;
const QUADRANT_BLURB: Record<number, string> = {
  1: "Urgent & important",
  2: "Important, not urgent",
  3: "Urgent, not important",
  4: "Not urgent, not important",
};

const TYPE_OPTIONS: InlineSelectOption[] = [
  {
    value: "work",
    label: "Work",
    badgeClassName: "border-sky-300 bg-sky-50 text-sky-700",
  },
  {
    value: "personal",
    label: "Personal",
    badgeClassName: "border-violet-300 bg-violet-50 text-violet-700",
  },
  {
    value: "errands_groceries",
    label: "Errands / groceries",
    badgeClassName:
      "border-emerald-400 bg-emerald-50 text-emerald-900 dark:border-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-100",
  },
];

const CATEGORY_OPTIONS: InlineSelectOption[] = [
  { value: "errand", label: "Errand" },
  { value: "research", label: "Research" },
  { value: "call", label: "Call" },
  { value: "admin", label: "Admin" },
  { value: "project", label: "Project" },
];

const QUADRANT_OPTIONS: InlineSelectOption[] = QUADRANTS.map((q) => ({
  value: String(q),
  label: `Q${q} — ${QUADRANT_BLURB[q]}`,
}));

const STATUS_OPTIONS: InlineSelectOption[] = [
  { value: "todo", label: "To do" },
  { value: "in_progress", label: "In progress" },
  { value: "done", label: "Done" },
  { value: "archived", label: "Archived" },
];

/** Done/archived tasks: secondary sections start collapsed (Phase 17.1). */
function taskDrawerSectionsDefaultOpen(status: TaskDoc["status"]): boolean {
  return status !== "done" && status !== "archived";
}

const RECURRENCE_UNITS = ["day", "week", "month", "year"] as const;
type RecurrenceUnit = (typeof RECURRENCE_UNITS)[number];

// ---------- Helpers ----------

type TaskDoc = Doc<"tasks">;

function looksLikeUrl(s: string): boolean {
  return /^[a-z][a-z0-9+\-.]*:\/\//i.test(s);
}

function ensureProtocol(s: string): string {
  if (looksLikeUrl(s)) return s;
  if (/^[\w-]+(\.[\w-]+)+/.test(s)) return `https://${s}`;
  return s;
}

function urlHostname(s: string): string {
  try {
    const u = new URL(ensureProtocol(s));
    return u.hostname.replace(/^www\./, "");
  } catch {
    return s;
  }
}

function newRowKey(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `row-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function fmtDateTime(ms: number): string {
  return new Date(ms).toLocaleString();
}

function toDatetimeLocalValue(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms)) return "";
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromDatetimeLocalValue(s: string): number | null {
  if (!s.trim()) return null;
  const t = new Date(s).getTime();
  return Number.isFinite(t) ? t : null;
}

function SubtasksWithFileCounts({
  parent,
  subtasks,
  loading,
  onAdd,
  onOpen,
  taskOrgArgs,
}: {
  parent: TaskDoc;
  subtasks: TaskDoc[] | undefined;
  loading: boolean;
  onAdd: (title: string) => Promise<void>;
  onOpen?: (id: Id<"tasks">) => void;
  taskOrgArgs: TaskOrgConvexArgs | null;
}) {
  const subtaskIds = useMemo(
    () => (subtasks ?? []).map((s) => s._id),
    [subtasks]
  );
  const uniqueSubtaskIds = useMemo(
    () => [...new Set(subtaskIds)],
    [subtaskIds]
  );
  const countRaw = useQuery(
    api.tasks.countTaskFilesForTasks,
    taskOrgArgs && uniqueSubtaskIds.length > 0
      ? { taskIds: uniqueSubtaskIds, ...taskOrgArgs }
      : "skip",
  );

  const attachmentCounts =
    uniqueSubtaskIds.length === 0 ? undefined : countRaw;

  return (
    <SubtasksSection
      parent={parent}
      subtasks={subtasks ?? []}
      loading={loading}
      attachmentCounts={attachmentCounts ?? undefined}
      onAdd={onAdd}
      onOpen={onOpen}
      orgConvexArgs={taskOrgArgs}
    />
  );
}

/** Task attachments (own boundary) + subtasks; file counts isolated so count errors do not remove subtasks UI. */
function TaskFilesAndSubtasksBlock({
  task,
  subtasks,
  canUseHub,
  actionTitle,
  onAddSubtask,
  onOpenTask,
  queryRecoverKeys,
  memberUserKey,
  taskOrgArgs,
}: {
  task: TaskDoc;
  subtasks: TaskDoc[] | undefined;
  canUseHub: boolean;
  actionTitle: (hint: string) => string;
  onAddSubtask: (title: string) => Promise<void>;
  onOpenTask?: (id: Id<"tasks">) => void;
  queryRecoverKeys: unknown[];
  memberUserKey?: string;
  taskOrgArgs: TaskOrgConvexArgs | null;
}) {
  return (
    <>
      <TaskAttachmentsPanel
        taskId={task._id}
        organizationId={taskOrgArgs?.organizationId ?? null}
        memberUserKey={taskOrgArgs?.memberUserKey ?? ""}
        canUseHub={canUseHub}
        actionTitle={actionTitle}
      />
      <LibraryDocumentsPanel
        context={{ kind: "task", taskId: task._id }}
        memberUserKey={memberUserKey}
        canUseHub={canUseHub}
        actionTitle={actionTitle}
      />
      <ConvexQueryBoundary
        key={`subtask-file-counts-${task._id}`}
        silent
        recoverOnKeys={queryRecoverKeys}
        fallback={
          <SubtasksSection
            parent={task}
            subtasks={subtasks ?? []}
            loading={subtasks === undefined}
            attachmentCounts={undefined}
            onAdd={onAddSubtask}
            onOpen={onOpenTask}
            orgConvexArgs={taskOrgArgs}
          />
        }
      >
        <SubtasksWithFileCounts
          parent={task}
          subtasks={subtasks}
          loading={subtasks === undefined}
          onAdd={onAddSubtask}
          onOpen={onOpenTask}
          taskOrgArgs={taskOrgArgs}
        />
      </ConvexQueryBoundary>
    </>
  );
}

// ---------- Drawer ----------

function TaskDrawerQueryFallback({ onClose }: { onClose: () => void }) {
  useWorkspaceSheetDragLock(true);
  return (
    <RecordInspectorShell
      resizable
      onClose={onClose}
      ariaLabel="Task"
      recordKind="task"
    >
      <RecordInspectorHeader>
        <div className="flex items-center justify-between gap-3">
          <span className="text-base font-semibold text-foreground">Task</span>
          <Button type="button" variant="outline" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
      </RecordInspectorHeader>
      <RecordInspectorBody className="space-y-3">
        <p className="text-sm text-destructive" role="alert">
          Could not load task data from Convex. Your deployment may be out of
          date, or the connection dropped.
        </p>
        <p className="text-xs text-muted-foreground">
          Try again after the app reconnects, or refresh the page. You can close
          this drawer and keep using the rest of the hub.
        </p>
      </RecordInspectorBody>
    </RecordInspectorShell>
  );
}

export function TaskDrawer({
  taskId,
  onClose,
  onOpenTask,
}: {
  taskId: Id<"tasks"> | null;
  onClose: () => void;
  onOpenTask?: (id: Id<"tasks">) => void;
}) {
  useWorkspaceSheetDragLock(taskId != null);
  const { canUseHub, actionTitle, phase } = useLiveConnection();
  const queryRecoverKeys = useAttachmentQueryRecovery(canUseHub, phase);

  if (!taskId) return null;

  return (
    <ConvexQueryBoundary
      key={taskId}
      recoverOnKeys={queryRecoverKeys}
      fallback={<TaskDrawerQueryFallback onClose={onClose} />}
    >
      <TaskDrawerLoaded
        taskId={taskId}
        onClose={onClose}
        onOpenTask={onOpenTask}
        canUseHub={canUseHub}
        actionTitle={actionTitle}
        queryRecoverKeys={queryRecoverKeys}
      />
    </ConvexQueryBoundary>
  );
}

function TaskDrawerLoaded({
  taskId,
  onClose,
  onOpenTask,
  canUseHub,
  actionTitle,
  queryRecoverKeys,
}: {
  taskId: Id<"tasks">;
  onClose: () => void;
  onOpenTask?: (id: Id<"tasks">) => void;
  canUseHub: boolean;
  actionTitle: (hint: string) => string;
  queryRecoverKeys: unknown[];
}) {
  const actorKeyRaw = useActorUserKey();
  const { activeOrganizationId } = useOrgPermissions();
  const orgConvexArgs = useMemo((): TaskOrgConvexArgs | null => {
    if (!activeOrganizationId || !actorKeyRaw.trim()) return null;
    return {
      organizationId: activeOrganizationId,
      memberUserKey: actorKeyRaw.trim(),
    };
  }, [activeOrganizationId, actorKeyRaw]);

  const t = useQuery(
    api.tasks.byIds,
    orgConvexArgs ? { ids: [taskId], ...orgConvexArgs } : "skip"
  );
  const task: TaskDoc | undefined = t?.[0];

  const viewerAccessQuery = useQuery(
    api.resourceViewerAccess.forTask,
    orgConvexArgs ? { taskId, memberUserKey: orgConvexArgs.memberUserKey } : "skip",
  );
  const ownershipQuery = useQuery(
    api.resourceOwnershipPresentation.forTask,
    orgConvexArgs ? { taskId, memberUserKey: orgConvexArgs.memberUserKey } : "skip",
  );
  const resourceAccessUx = resourceAccessFromViewerAccess(viewerAccessQuery);
  const readOnly = resourceAccessUx.readOnly;

  const subtasks = useQuery(
    api.tasks.byParent,
    task && orgConvexArgs
      ? { parentId: task._id, ...orgConvexArgs }
      : "skip"
  );

  const linkedTasks = useQuery(
    api.tasks.byIds,
    task && orgConvexArgs && task.linkedTaskIds && task.linkedTaskIds.length > 0
      ? { ids: task.linkedTaskIds, ...orgConvexArgs }
      : "skip"
  );

  const patchTask = useMutation(api.tasks.patch);
  const offline = useOfflineSync();
  const removeTask = useMutation(api.tasks.remove);
  const addSubtask = useMutation(api.tasks.addSubtask);
  const linkTasks = useMutation(api.tasks.linkTasks);
  const unlinkTasks = useMutation(api.tasks.unlinkTasks);
  const snoozeTask = useMutation(api.tasks.snooze);
  const wakeTask = useMutation(api.tasks.wake);
  const wakeUpTask = useMutation(api.tasks.wakeUpTask);
  const [wakingUp, setWakingUp] = useState(false);
  const markTaskNotifsRead = useMutation(
    api.notifications.markReadForTaskForUser,
  );
  const actorUserKey = actorKeyRaw.trim() || undefined;

  const contactsForTask = useQuery(
    api.contacts.list,
    activeOrganizationId && actorKeyRaw.trim()
      ? {
          organizationId: activeOrganizationId,
          memberUserKey: actorKeyRaw.trim(),
        }
      : "skip",
  );

  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [fullScreen, setFullScreen] = useState(false);
  const [headerDetailsExpanded, setHeaderDetailsExpanded] = useState(false);
  const [headerDetailsMounted, setHeaderDetailsMounted] = useState(false);
  const [attemptSheetOpen, setAttemptSheetOpen] = useState(false);
  const [auditOpen, setAuditOpen] = useState(false);
  const { labelFor: memberLabel } = useOrgMemberDisplayLabel(
    activeOrganizationId,
    orgConvexArgs?.memberUserKey,
  );

  useEffect(() => {
    if (headerDetailsExpanded) setHeaderDetailsMounted(true);
  }, [headerDetailsExpanded]);

  // Reset transient state when switching tasks.
  useEffect(() => {
    setConfirmingDelete(false);
    setDeleteError(null);
    setHeaderDetailsExpanded(false);
  }, [taskId]);

  useEffect(() => {
    if (!actorUserKey) return;
    void markTaskNotifsRead({ userKey: actorUserKey, taskId });
  }, [taskId, actorUserKey, markTaskNotifsRead]);

  const consumeEscape = useCallback(() => {
    if (fullScreen) {
      setFullScreen(false);
      return true;
    }
    return false;
  }, [fullScreen]);

  const isSnoozedActive =
    task != null &&
    typeof task.snoozedUntil === "number" &&
    task.snoozedUntil > Date.now();

  const handleWakeUpTask = useCallback(async () => {
    if (!orgConvexArgs || !task || !isSnoozedActive) return;
    setWakingUp(true);
    try {
      await wakeUpTask({
        id: task._id,
        ...orgConvexArgs,
        ...(actorUserKey ? { actorUserKey } : {}),
      });
    } finally {
      setWakingUp(false);
    }
  }, [
    actorUserKey,
    isSnoozedActive,
    orgConvexArgs,
    task,
    wakeUpTask,
  ]);

  if (!orgConvexArgs) {
    return (
      <RecordInspectorShell
        resizable={!fullScreen}
        onClose={onClose}
        fullScreen={fullScreen}
        ariaLabel="Task"
        recordKind="task"
        consumeEscape={consumeEscape}
      >
        <RecordInspectorHeader>
          <div className="flex items-center justify-between gap-3">
            <span className="text-base font-semibold text-foreground">Task</span>
            <Button variant="ghost" size="sm" onClick={onClose}>
              <X className="h-4 w-4" aria-hidden />
            </Button>
          </div>
        </RecordInspectorHeader>
        <RecordInspectorBody>
          <p className="text-sm text-muted-foreground">
            Select an organization to load this task.
          </p>
        </RecordInspectorBody>
      </RecordInspectorShell>
    );
  }

  if (t === undefined) {
    return (
      <RecordInspectorShell
        resizable={!fullScreen}
        onClose={onClose}
        fullScreen={fullScreen}
        ariaLabel="Task"
        recordKind="task"
        consumeEscape={consumeEscape}
      >
        <RecordInspectorHeader>
          <div
            className="h-7 w-48 max-w-[60%] animate-pulse rounded-md bg-muted/50"
            aria-hidden
          />
        </RecordInspectorHeader>
        <RecordInspectorBody>
          <RecordInspectorSkeleton />
          <p className="sr-only" role="status">
            Loading…
          </p>
        </RecordInspectorBody>
      </RecordInspectorShell>
    );
  }

  if (!task) {
    return (
      <RecordInspectorShell
        resizable={!fullScreen}
        onClose={onClose}
        fullScreen={fullScreen}
        ariaLabel="Task"
        recordKind="task"
        consumeEscape={consumeEscape}
      >
        <RecordInspectorHeader>
          <div className="flex items-center justify-between gap-3">
            <span className="text-base font-semibold text-foreground">Task</span>
            <Button variant="ghost" size="sm" onClick={onClose}>
              <X className="h-4 w-4" aria-hidden />
            </Button>
          </div>
        </RecordInspectorHeader>
        <RecordInspectorBody>
          <p className="text-sm text-destructive">Task not found.</p>
        </RecordInspectorBody>
      </RecordInspectorShell>
    );
  }

  const patchField = async (fields: TaskPatchArg): Promise<void> => {
    if (readOnly) return;
    const payload = {
      ...fields,
      ...orgConvexArgs,
      ...(actorUserKey ? { actorUserKey } : {}),
      expectedUpdatedAt: task.updatedAt,
    } as Parameters<typeof patchTask>[0];
    if (canUseHub) {
      await patchTask(payload);
      return;
    }
    await offline.enqueue({
      kind: "tasks.patch",
      queueKey: `tasks.patch::${fields.id}`,
      args: { ...(payload as Record<string, unknown>) },
    });
  };

  const onDelete = async () => {
    if (readOnly) return;
    setDeleteError(null);
    setDeleting(true);
    try {
      await removeTask({
        id: task._id,
        ...orgConvexArgs,
        ...(actorUserKey ? { actorUserKey } : {}),
      });
      onClose();
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : String(e));
      setDeleting(false);
    }
  };

  const sectionsDefaultOpen = taskDrawerSectionsDefaultOpen(task.status);

  return (
    <ResourceAccessProvider value={resourceAccessUx}>
    <RecordInspectorShell
      resizable={!fullScreen}
      onClose={onClose}
      fullScreen={fullScreen}
      ariaLabel="Task"
      recordKind="task"
      consumeEscape={consumeEscape}
    >
      <RecordInspectorHeader>
        <ResourceAccessBanner
          mode={resourceAccessUx.bannerMode}
          ownerDisplayUsername={resourceAccessUx.ownerDisplayUsername}
          resourceKind="task"
          className="mb-2 rounded-dlc-sm"
        />
        <div className="flex h-9 min-h-9 min-w-0 max-w-full flex-nowrap items-center gap-1.5 max-md:min-h-11">
          <div className="min-w-0 flex-1 overflow-hidden">
            <InlineText
              value={task.title}
              onCommit={(next) =>
                patchField({ id: task._id, title: next })
              }
              ariaLabel="Edit task title"
              displayClassName="block truncate text-sm font-semibold leading-tight"
            />
          </div>
          <InlineSelect
            value={task.status}
            options={STATUS_OPTIONS}
            onCommit={(next) =>
              patchField({
                id: task._id,
                status: next as TaskDoc["status"],
              })
            }
            ariaLabel="Change status"
            asBadge
          />
          {task.assigneeId ? (
            <span
              className="inline-flex h-7 max-w-[6.5rem] shrink-0 items-center gap-1 rounded-full border border-border/70 bg-muted/25 px-1.5 text-[11px] font-medium text-muted-foreground"
              title={`Assignee: ${memberLabel(task.assigneeId)}`}
            >
              <UserCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden />
              <span className="truncate">{memberLabel(task.assigneeId)}</span>
            </span>
          ) : null}
          <HeaderDisclosureToggle
            expanded={headerDetailsExpanded}
            onToggle={() => setHeaderDetailsExpanded((o) => !o)}
            labelCollapsed="Show task details"
            labelExpanded="Hide task details"
          />
          <DropdownMenu
            aria-label="Task actions"
            trigger={
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className={cn("h-8 w-8 shrink-0 p-0", touchTargetIconClass)}
              >
                <MoreHorizontal className="h-4 w-4" aria-hidden />
              </Button>
            }
          >
            <DropdownMenuItem
              onClick={() => {
                setHeaderDetailsExpanded(true);
                document
                  .getElementById("task-drawer-sharing")
                  ?.scrollIntoView({ behavior: "smooth", block: "start" });
              }}
            >
              <Share2 className="h-4 w-4 shrink-0" aria-hidden />
              Sharing
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => setFullScreen((v) => !v)}
            >
              {fullScreen ? (
                <Minimize2 className="h-4 w-4 shrink-0" aria-hidden />
              ) : (
                <Maximize2 className="h-4 w-4 shrink-0" aria-hidden />
              )}
              {fullScreen ? "Exit full screen" : "Full screen"}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              destructive
              disabled={readOnly || deleting}
              onClick={() => setConfirmingDelete(true)}
            >
              <Trash2 className="h-4 w-4 shrink-0" aria-hidden />
              Delete task…
            </DropdownMenuItem>
          </DropdownMenu>
          <Button
            variant="ghost"
            size="sm"
            className={cn("h-8 w-8 shrink-0 p-0", touchTargetIconClass)}
            onClick={onClose}
            aria-label="Close"
          >
            <X className="h-4 w-4" aria-hidden />
          </Button>
        </div>
        {headerDetailsMounted ? (
          <HeaderDisclosurePanel open={headerDetailsExpanded} className="mt-1">
            {ownershipQuery ? (
              <ResourceAccessDetails
                resourceType="task"
                resourceId={String(task._id)}
                organizationId={task.organizationId ?? undefined}
                memberUserKey={orgConvexArgs?.memberUserKey}
                ownerDisplayUsername={ownershipQuery.ownerDisplayUsername}
                ownershipLine={ownershipQuery.ownershipLine}
                badge={ownershipQuery.badge}
                viewerAccessLevel={ownershipQuery.viewerAccessLevel}
                isOwner={ownershipQuery.isOwner}
                collaboratorCount={ownershipQuery.collaboratorCount}
                className="px-0.5"
              />
            ) : null}
            <div className="flex flex-wrap items-center gap-2">
              <InlineSelect
                value={task.type}
                options={TYPE_OPTIONS}
                onCommit={(next) => {
                  const v = next as TaskDoc["type"];
                  if (
                    v === "errands_groceries" &&
                    task.type !== "errands_groceries"
                  ) {
                    void patchField({
                      id: task._id,
                      type: v,
                      errandLocations:
                        task.errandLocations &&
                        task.errandLocations.length > 0
                          ? task.errandLocations
                          : [
                              {
                                id: newRowKey(),
                                name: "First stop",
                                items: [],
                              },
                            ],
                    });
                  } else if (
                    task.type === "errands_groceries" &&
                    v !== "errands_groceries"
                  ) {
                    void patchField({
                      id: task._id,
                      type: v,
                      errandLocations: null,
                    });
                  } else {
                    void patchField({ id: task._id, type: v });
                  }
                }}
                ariaLabel="Change type"
                asBadge
              />
              <InlineSelect
                value={task.category}
                options={CATEGORY_OPTIONS}
                onCommit={(next) =>
                  patchField({
                    id: task._id,
                    category: next as TaskDoc["category"],
                  })
                }
                ariaLabel="Change category"
                asBadge
              />
              <InlineSelect
                value={String(task.quadrant)}
                options={QUADRANT_OPTIONS}
                onCommit={(next) =>
                  patchField({ id: task._id, quadrant: Number(next) })
                }
                ariaLabel="Change quadrant"
                asBadge
              />
              {typeof task.snoozedUntil === "number" &&
                task.snoozedUntil > Date.now() && (
                  <SnoozedBadge until={task.snoozedUntil} />
                )}
              <SnoozeMenu
                snoozedUntil={task.snoozedUntil}
                onSnooze={(until) =>
                  snoozeTask({ id: task._id, until, ...orgConvexArgs })
                }
                onWake={() => wakeTask({ id: task._id, ...orgConvexArgs })}
                align="right"
              />
            </div>
          </HeaderDisclosurePanel>
        ) : null}
      </RecordInspectorHeader>

      <RecordInspectorBody className="space-y-5">
        {/* ---------- Description (or stores + items for errands / groceries) ---------- */}
        <CollapsibleSection
          variant="card"
          defaultOpen={sectionsDefaultOpen}
          title={
            task.type === "errands_groceries" ? (
              <span className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <ShoppingCart className="h-3.5 w-3.5 shrink-0" aria-hidden />
                Stores & run
                {(() => {
                  const locs = task.errandLocations ?? [];
                  const tot = locs.reduce((s, l) => s + l.items.length, 0);
                  const dn = locs.reduce(
                    (s, l) => s + l.items.filter((i) => i.completed).length,
                    0
                  );
                  return tot > 0 ? (
                    <span className="text-[11px] font-normal normal-case text-muted-foreground/85">
                      {dn}/{tot} checked
                    </span>
                  ) : null;
                })()}
              </span>
            ) : (
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Description
              </span>
            )
          }
        >
          {task.type === "errands_groceries" ? (
            <div className="space-y-4">
              <ErrandLocationsSection
                task={task}
                onCommit={patchField}
                onOpenTask={onOpenTask}
              />
              <div className="border-t border-border/60 pt-4">
                <FieldLabel>Optional notes</FieldLabel>
                <div className="mt-1.5">
                  <InlineTextarea
                    value={task.description ?? ""}
                    onCommit={(next) =>
                      patchField({ id: task._id, description: next || null })
                    }
                    placeholder="Coupon codes, parking, reminders…"
                    ariaLabel="Optional notes for this run"
                    rows={2}
                  />
                </div>
              </div>
            </div>
          ) : (
            <InlineTextarea
              value={task.description ?? ""}
              onCommit={(next) =>
                patchField({ id: task._id, description: next || null })
              }
              placeholder="Add details, context, or acceptance criteria"
              ariaLabel="Edit description"
              rows={4}
            />
          )}
        </CollapsibleSection>

        {/* ---------- Schedule ---------- */}
        <CollapsibleSection
          variant="card"
          defaultOpen={sectionsDefaultOpen}
          title={
            <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <CalendarClock className="h-3.5 w-3.5" aria-hidden />
              Schedule
            </span>
          }
        >
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <FieldLabel>Start date</FieldLabel>
              <InlineDate
                value={task.startDate ?? null}
                onCommit={(next) =>
                  patchField({
                    id: task._id,
                    startDate: next === null ? null : next,
                  })
                }
                placeholder="Set start"
                ariaLabel="Edit start date"
                showRelative
              />
            </div>
            <div className="space-y-1">
              <FieldLabel>Due date</FieldLabel>
              <InlineDate
                value={task.dueDate ?? null}
                onCommit={(next) =>
                  patchField({
                    id: task._id,
                    dueDate: next === null ? null : next,
                  })
                }
                placeholder="Set due"
                ariaLabel="Edit due date"
                showRelative
              />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <FieldLabel>Reminder</FieldLabel>
              <TaskReminderField task={task} onCommit={patchField} />
            </div>
          </div>
          <div className="mt-4 space-y-3 rounded-md border border-dashed border-border/80 bg-muted/20 p-3">
            <div>
              <FieldLabel>True age</FieldLabel>
              <p
                className="mt-1 text-sm text-foreground"
                data-testid="task-drawer-true-age"
                title={new Date(task.createdAt).toLocaleString()}
              >
                Created {formatRelativeTimestamp(task.createdAt)} (
                {new Date(task.createdAt).toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
                )
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <FieldLabel>Follow-up attempts</FieldLabel>
              {(task.attemptCount ?? 0) > 0 ? (
                <button
                  type="button"
                  className="inline-flex min-h-8 items-center gap-1 rounded-full border border-amber-500/35 bg-amber-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-amber-950 dark:text-amber-100"
                  onClick={() => setAuditOpen(true)}
                  data-testid="task-drawer-attempt-count"
                >
                  <Zap className="h-3 w-3 shrink-0" aria-hidden />
                  {task.attemptCount}
                </button>
              ) : (
                <span className="text-xs text-muted-foreground">None yet</span>
              )}
              {task.relatedFileId && !readOnly ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="ml-auto min-h-9"
                  onClick={() => setAttemptSheetOpen(true)}
                  data-testid="task-drawer-attempt-snooze"
                >
                  Attempt / Snooze
                </Button>
              ) : null}
            </div>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-2 rounded-md border border-dashed border-border/80 bg-muted/20 p-3">
            <FieldLabel>Snooze</FieldLabel>
            {isSnoozedActive ? (
              <>
                <SnoozedBadge until={task.snoozedUntil!} />
                {!readOnly ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="min-h-9 gap-1.5"
                    disabled={wakingUp}
                    onClick={() => void handleWakeUpTask()}
                    data-testid="task-drawer-wake-up"
                  >
                    <AlarmClock className="h-3.5 w-3.5 shrink-0" aria-hidden />
                    {wakingUp ? "Waking…" : "Wake up task"}
                  </Button>
                ) : null}
                <span className="ml-auto" />
                <SnoozeMenu
                  variant="inline"
                  label="Reschedule"
                  snoozedUntil={task.snoozedUntil}
                  onSnooze={(until) =>
                  snoozeTask({ id: task._id, until, ...orgConvexArgs })
                }
                  onWake={() => void handleWakeUpTask()}
                  align="right"
                />
              </>
            ) : (
              <>
                <span className="text-xs text-muted-foreground">
                  Hide this task until you&apos;re ready (waiting on a 3rd
                  party, parking it for later, etc.).
                </span>
                <span className="ml-auto" />
                <SnoozeMenu
                  variant="inline"
                  snoozedUntil={null}
                  onSnooze={(until) =>
                  snoozeTask({ id: task._id, until, ...orgConvexArgs })
                }
                  onWake={() => wakeTask({ id: task._id, ...orgConvexArgs })}
                  align="right"
                />
              </>
            )}
          </div>
          <RecurrenceEditor
            value={task.recurrence ?? null}
            onChange={(next) =>
              patchField({ id: task._id, recurrence: next ?? null })
            }
          />
        </CollapsibleSection>

        {/* ---------- Links / websites ---------- */}
        <LinksSection task={task} onCommit={patchField} />

        {/* ---------- Checklist (errands use structured stores in Description above) ---------- */}
        {task.type !== "errands_groceries" && (
          <ChecklistSection task={task} onCommit={patchField} />
        )}

        <TaskFilesAndSubtasksBlock
          task={task}
          subtasks={subtasks}
          canUseHub={canUseHub}
          actionTitle={actionTitle}
          queryRecoverKeys={queryRecoverKeys}
          memberUserKey={actorUserKey}
          taskOrgArgs={orgConvexArgs}
          onAddSubtask={async (title) => {
            await addSubtask({
              parentId: task._id,
              title,
              ...orgConvexArgs,
            });
          }}
          onOpenTask={onOpenTask}
        />

        {/* ---------- Linked / related tasks ---------- */}
        <LinkedTasksSection
          task={task}
          linked={linkedTasks ?? []}
          loading={linkedTasks === undefined && Boolean(task.linkedTaskIds?.length)}
          queryRecoverKeys={queryRecoverKeys}
          orgConvexArgs={orgConvexArgs}
          onLink={async (otherId) => {
            await linkTasks({
              a: task._id,
              b: otherId,
              ...orgConvexArgs,
            });
          }}
          onUnlink={async (otherId) => {
            await unlinkTasks({
              a: task._id,
              b: otherId,
              ...orgConvexArgs,
            });
          }}
          onOpen={onOpenTask}
        />

        {/* ---------- People (assignee + shared) ---------- */}
        <PeopleSection task={task} onCommit={patchField} />

        {/* ---------- Related pipeline file ---------- */}
        <RelatedFileSection
          task={task}
          onCommit={patchField}
          queryRecoverKeys={queryRecoverKeys}
        />

        <RelatedContactSection
          task={task}
          contacts={contactsForTask}
          loading={contactsForTask === undefined}
          onCommit={patchField}
        />

        {/* ---------- Danger zone ---------- */}
        <CollapsibleSection
          variant="danger"
          defaultOpen={false}
          title={
            <span className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
              Danger zone
            </span>
          }
        >
          {deleteError && (
            <p
              className="mb-2 text-sm text-destructive"
              role="alert"
            >
              {deleteError}
            </p>
          )}
          {confirmingDelete ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-destructive">
                Permanently delete <strong>{task.title}</strong>?
              </span>
              <Button
                type="button"
                variant="danger"
                size="sm"
                disabled={deleting}
                onClick={() => void onDelete()}
              >
                {deleting ? "Deleting…" : "Yes, delete"}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={deleting}
                onClick={() => setConfirmingDelete(false)}
              >
                Cancel
              </Button>
            </div>
          ) : (
            <Button
              type="button"
              variant="danger"
              size="sm"
              onClick={() => setConfirmingDelete(true)}
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete task
            </Button>
          )}
        </CollapsibleSection>
      </RecordInspectorBody>
      <RecordInspectorFooter>
        <p className="text-xs text-muted-foreground">
          Updated {fmtDateTime(task.updatedAt)} · Created{" "}
          {fmtDateTime(task.createdAt)}
        </p>
      </RecordInspectorFooter>
    </RecordInspectorShell>
    {orgConvexArgs && task.relatedFileId ? (
      <>
        <TaskAttemptSnoozeSheet
          open={attemptSheetOpen}
          onClose={() => setAttemptSheetOpen(false)}
          task={task}
          organizationId={orgConvexArgs.organizationId}
          memberUserKey={orgConvexArgs.memberUserKey}
          actorUserKey={actorUserKey}
        />
        <TaskAttemptAuditDialog
          open={auditOpen}
          onClose={() => setAuditOpen(false)}
          task={task}
          organizationId={orgConvexArgs.organizationId}
          memberUserKey={orgConvexArgs.memberUserKey}
        />
      </>
    ) : null}
    </ResourceAccessProvider>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-xs font-medium text-muted-foreground">{children}</div>
  );
}

// ---------- Recurrence ----------

function RecurrenceEditor({
  value,
  onChange,
}: {
  value: TaskDoc["recurrence"] | null;
  onChange: (next: NonNullable<TaskDoc["recurrence"]> | null) => Promise<void>;
}) {
  const enabled = Boolean(value);
  const every = (value?.every ?? "week") as RecurrenceUnit;
  const interval = value?.interval ?? 1;
  const endsOn = value?.endsOn;

  const setRule = (
    next: Partial<NonNullable<TaskDoc["recurrence"]>>
  ): void => {
    void onChange({
      every: next.every ?? every,
      interval: next.interval ?? interval,
      endsOn: "endsOn" in next ? next.endsOn : endsOn,
      daysOfWeek: value?.daysOfWeek,
    });
  };

  return (
    <div className="mt-4 rounded-md border border-border/60 bg-muted/15 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Repeat className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
        <label className="inline-flex cursor-pointer select-none items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-input accent-primary"
            checked={enabled}
            onChange={(e) => {
              if (e.target.checked) {
                void onChange({ every: "week", interval: 1 });
              } else {
                void onChange(null);
              }
            }}
          />
          Repeat
        </label>
        {enabled && (
          <>
            <span className="text-sm text-muted-foreground">every</span>
            <input
              type="number"
              min={1}
              max={365}
              value={interval}
              onChange={(e) => {
                const n = Math.max(
                  1,
                  Math.floor(Number(e.target.value) || 1)
                );
                setRule({ interval: n });
              }}
              className="h-9 w-16 rounded-md border bg-background px-2 text-sm shadow-sm"
              aria-label="Recurrence interval"
            />
            <select
              value={every}
              onChange={(e) =>
                setRule({ every: e.target.value as RecurrenceUnit })
              }
              className="h-9 rounded-md border bg-background px-2 text-sm shadow-sm"
              aria-label="Recurrence unit"
            >
              {RECURRENCE_UNITS.map((u) => (
                <option key={u} value={u}>
                  {u}
                  {interval > 1 ? "s" : ""}
                </option>
              ))}
            </select>
            <span className="text-sm text-muted-foreground">until</span>
            <InlineDate
              value={endsOn ?? null}
              onCommit={(next) =>
                setRule({ endsOn: next === null ? undefined : next })
              }
              placeholder="No end"
              ariaLabel="Recurrence end date"
              displayClassName="min-w-[120px] text-sm"
            />
          </>
        )}
      </div>
      {enabled && (
        <p className="mt-2 text-xs text-muted-foreground">
          Completing the task will spawn the next instance automatically.
        </p>
      )}
    </div>
  );
}

// ---------- Links / websites ----------

function LinksSection({
  task,
  onCommit,
}: {
  task: TaskDoc;
  onCommit: (fields: TaskPatchArg) => Promise<void>;
}) {
  const links = task.links ?? [];
  const [draft, setDraft] = useState({ url: "", label: "" });

  const commitLinks = async (
    next: Array<{ url: string; label?: string; kind?: string }>
  ) => {
    await onCommit({ id: task._id, links: next });
  };

  const addDraft = async () => {
    const url = draft.url.trim();
    if (!url) return;
    await commitLinks([
      ...links,
      { url: ensureProtocol(url), label: draft.label.trim() || undefined },
    ]);
    setDraft({ url: "", label: "" });
  };

  return (
    <CollapsibleSection
      variant="card"
      defaultOpen={taskDrawerSectionsDefaultOpen(task.status)}
      title={
        <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          <LinkIcon className="h-3.5 w-3.5" aria-hidden />
          Links
          {links.length > 0 && (
            <span className="text-[11px] font-normal text-muted-foreground/80">
              ({links.length})
            </span>
          )}
        </span>
      }
    >

      {links.length === 0 ? (
        <p className="mb-3 rounded-md border border-dashed p-3 text-center text-sm text-muted-foreground">
          No websites or links yet. Paste a URL below to add one.
        </p>
      ) : (
        <ul className="mb-3 space-y-1.5" aria-label="Task links">
          {links.map((l, i) => (
            <li
              key={i}
              className="flex items-center gap-2 rounded-md border border-border/60 bg-muted/15 px-2 py-1.5"
            >
              <a
                href={ensureProtocol(l.url)}
                target="_blank"
                rel="noreferrer"
                className="flex min-w-0 flex-1 items-center gap-2 text-sm text-primary hover:underline"
                title={l.url}
              >
                <ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden />
                <span className="truncate">
                  {l.label || urlHostname(l.url) || l.url}
                </span>
              </a>
              <InlineText
                value={l.label ?? ""}
                allowEmpty
                placeholder="Add label"
                onCommit={(next) =>
                  commitLinks(
                    links.map((x, j) =>
                      j === i ? { ...x, label: next || undefined } : x
                    )
                  )
                }
                ariaLabel={`Link ${i + 1} label`}
                displayClassName="w-32 text-xs text-muted-foreground"
              />
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-7 w-7 shrink-0 px-0 text-muted-foreground hover:text-destructive"
                onClick={() =>
                  void commitLinks(links.filter((_, j) => j !== i))
                }
                aria-label={`Remove link ${i + 1}`}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_180px_auto]">
        <Input
          placeholder="https://example.com"
          value={draft.url}
          onChange={(e) => setDraft((d) => ({ ...d, url: e.target.value }))}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void addDraft();
            }
          }}
          aria-label="New link URL"
        />
        <Input
          placeholder="Label (optional)"
          value={draft.label}
          onChange={(e) => setDraft((d) => ({ ...d, label: e.target.value }))}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void addDraft();
            }
          }}
          aria-label="New link label"
        />
        <Button
          type="button"
          onClick={() => void addDraft()}
          disabled={!draft.url.trim()}
        >
          <Plus className="h-3.5 w-3.5" />
          Add link
        </Button>
      </div>
    </CollapsibleSection>
  );
}

// ---------- Checklist ----------

function ChecklistSection({
  task,
  onCommit,
}: {
  task: TaskDoc;
  onCommit: (fields: TaskPatchArg) => Promise<void>;
}) {
  const items = task.checklist ?? [];
  const [draft, setDraft] = useState("");

  const commit = async (next: Array<{ text: string; done: boolean }>) => {
    await onCommit({ id: task._id, checklist: next });
  };

  const completed = items.filter((i) => i.done).length;

  return (
    <CollapsibleSection
      variant="card"
      defaultOpen={taskDrawerSectionsDefaultOpen(task.status)}
      title={
        <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          <ListChecks className="h-3.5 w-3.5" aria-hidden />
          Checklist
          {items.length > 0 && (
            <span className="text-[11px] font-normal text-muted-foreground/80">
              ({completed}/{items.length})
            </span>
          )}
        </span>
      }
    >

      {items.length === 0 ? (
        <p className="mb-3 rounded-md border border-dashed p-3 text-center text-sm text-muted-foreground">
          No micro-todos yet.
        </p>
      ) : (
        <ul className="mb-3 space-y-1" aria-label="Checklist items">
          {items.map((c, i) => (
            <li
              key={i}
              className="flex items-center gap-2 rounded-md px-1.5 py-1 hover:bg-muted/40"
            >
              <input
                type="checkbox"
                className="h-4 w-4 shrink-0 rounded border-input accent-primary"
                checked={c.done}
                onChange={(e) =>
                  void commit(
                    items.map((x, j) =>
                      j === i ? { ...x, done: e.target.checked } : x
                    )
                  )
                }
                aria-label={`Mark "${c.text}" ${c.done ? "todo" : "done"}`}
              />
              <div className="min-w-0 flex-1">
                <InlineText
                  value={c.text}
                  onCommit={(next) =>
                    commit(
                      items.map((x, j) =>
                        j === i ? { ...x, text: next } : x
                      )
                    )
                  }
                  ariaLabel={`Edit checklist item ${i + 1}`}
                  displayClassName={cn(
                    "text-sm",
                    c.done && "text-muted-foreground line-through"
                  )}
                />
              </div>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-7 w-7 shrink-0 px-0 text-muted-foreground hover:text-destructive"
                onClick={() => void commit(items.filter((_, j) => j !== i))}
                aria-label={`Remove checklist item ${i + 1}`}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex gap-2">
        <Input
          placeholder="Add a step…"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== "Enter") return;
            e.preventDefault();
            const t = draft.trim();
            if (!t) return;
            void commit([...items, { text: t, done: false }]);
            setDraft("");
          }}
          aria-label="New checklist item"
        />
        <Button
          type="button"
          onClick={() => {
            const t = draft.trim();
            if (!t) return;
            void commit([...items, { text: t, done: false }]);
            setDraft("");
          }}
          disabled={!draft.trim()}
        >
          <Plus className="h-3.5 w-3.5" /> Add
        </Button>
      </div>
    </CollapsibleSection>
  );
}

// ---------- Subtasks ----------

function SubtasksSection({
  parent,
  subtasks,
  loading,
  attachmentCounts,
  onAdd,
  onOpen,
  orgConvexArgs,
}: {
  parent: TaskDoc;
  subtasks: TaskDoc[];
  loading: boolean;
  attachmentCounts?: Record<string, number>;
  onAdd: (title: string) => Promise<void>;
  onOpen?: (id: Id<"tasks">) => void;
  orgConvexArgs: TaskOrgConvexArgs | null;
}) {
  const { confirm } = useOperationalConfirm();
  const actorKeyRaw = useActorUserKey();
  const actorUserKey = actorKeyRaw.trim() || undefined;
  const { canUseHub } = useLiveConnection();
  const offline = useOfflineSync();
  const patchTask = useMutation(api.tasks.patch);
  const completeTask = useMutation(api.tasks.complete);
  const removeTask = useMutation(api.tasks.remove);

  const patchSubtask = async (row: TaskDoc, patch: TaskPatchFields) => {
    if (!orgConvexArgs) return;
    const payload = {
      ...patch,
      id: row._id,
      expectedUpdatedAt: row.updatedAt,
      ...orgConvexArgs,
      ...(actorUserKey ? { actorUserKey } : {}),
    } as Parameters<typeof patchTask>[0];
    if (canUseHub) {
      await patchTask(payload);
      return;
    }
    await offline.enqueue({
      kind: "tasks.patch",
      queueKey: `tasks.patch::${row._id}`,
      args: { ...(payload as Record<string, unknown>) },
    });
  };

  const [draft, setDraft] = useState("");
  const [adding, setAdding] = useState(false);

  const submitDraft = async () => {
    const t = draft.trim();
    if (!t) return;
    setAdding(true);
    try {
      await onAdd(t);
      setDraft("");
    } finally {
      setAdding(false);
    }
  };

  return (
    <CollapsibleSection
      variant="card"
      defaultOpen={taskDrawerSectionsDefaultOpen(parent.status)}
      title={
        <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          <ListTree className="h-3.5 w-3.5" aria-hidden />
          Subtasks
          {subtasks.length > 0 && (
            <span className="text-[11px] font-normal text-muted-foreground/80">
              ({subtasks.filter((s) => s.status === "done").length}/
              {subtasks.length})
            </span>
          )}
        </span>
      }
    >

      {loading ? (
        <p
          className="mb-3 rounded-md border border-dashed p-3 text-center text-sm text-muted-foreground"
          role="status"
        >
          Loading subtasks…
        </p>
      ) : subtasks.length === 0 ? (
        <p className="mb-3 rounded-md border border-dashed p-3 text-center text-sm text-muted-foreground">
          No subtasks yet. Use the field below to break this task down.
        </p>
      ) : (
        <ul className="mb-3 space-y-1.5" aria-label="Subtasks">
          {subtasks.map((s) => (
            <li
              key={s._id}
              className="flex items-center gap-2 rounded-md border border-border/60 bg-muted/10 px-2 py-1.5"
            >
              <input
                type="checkbox"
                className="h-4 w-4 shrink-0 rounded border-input accent-primary"
                checked={s.status === "done"}
                onChange={async (e) => {
                  if (!orgConvexArgs) return;
                  if (e.target.checked) {
                    if (!canUseHub) {
                      window.alert(
                        "Reconnect to mark a subtask as done.",
                      );
                      return;
                    }
                    await completeTask({
                      id: s._id,
                      ...orgConvexArgs,
                      ...(actorUserKey ? { actorUserKey } : {}),
                    });
                  } else {
                    await patchSubtask(s, {
                      status: "todo",
                    });
                  }
                }}
                aria-label={`Mark "${s.title}" ${
                  s.status === "done" ? "todo" : "done"
                }`}
              />
              <div className="min-w-0 flex-1">
                <InlineText
                  value={s.title}
                  onCommit={(next) =>
                    void patchSubtask(s, {
                      title: next,
                    })
                  }
                  ariaLabel="Edit subtask title"
                  displayClassName={cn(
                    "text-sm",
                    s.status === "done" &&
                      "text-muted-foreground line-through"
                  )}
                />
              </div>
              {s.dueDate ? (
                <span className="shrink-0 text-xs text-muted-foreground">
                  due{" "}
                  {new Date(s.dueDate).toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                  })}
                </span>
              ) : null}
              {(s.links?.length ?? 0) > 0 && (
                <span
                  className="inline-flex shrink-0 items-center gap-1 text-xs text-muted-foreground"
                  title={`${s.links!.length} link(s)`}
                >
                  <LinkIcon className="h-3 w-3" />
                  {s.links!.length}
                </span>
              )}
              {(attachmentCounts?.[s._id] ?? 0) > 0 && (
                <span
                  className="inline-flex shrink-0 items-center gap-1 text-xs text-muted-foreground"
                  title={`${attachmentCounts?.[s._id] ?? 0} file(s) attached — open subtask to manage`}
                >
                  <Paperclip className="h-3 w-3" aria-hidden />
                  {attachmentCounts?.[s._id] ?? 0}
                </span>
              )}
              {onOpen && (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2 text-xs text-muted-foreground"
                  onClick={() => onOpen(s._id)}
                >
                  Open
                </Button>
              )}
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-7 w-7 shrink-0 px-0 text-muted-foreground hover:text-destructive"
                onClick={async () => {
                  if (!orgConvexArgs) return;
                  const ok = await confirm({
                    ...simpleDeleteConfirm(s.title, {
                      title: "Delete subtask",
                      impact: "This subtask is permanently removed.",
                    }),
                  });
                  if (!ok) return;
                  await removeTask({
                    id: s._id,
                    ...orgConvexArgs,
                    ...(actorUserKey ? { actorUserKey } : {}),
                  });
                }}
                aria-label={`Delete subtask ${s.title}`}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex gap-2">
        <Input
          placeholder="New subtask…"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== "Enter") return;
            e.preventDefault();
            void submitDraft();
          }}
          aria-label="New subtask title"
          disabled={adding}
        />
        <Button
          type="button"
          onClick={() => void submitDraft()}
          disabled={!draft.trim() || adding}
        >
          <Plus className="h-3.5 w-3.5" />
          {adding ? "Adding…" : "Add"}
        </Button>
      </div>
      {parent.recurrence && (
        <p className="mt-2 text-xs text-muted-foreground">
          Subtasks aren&apos;t copied when this recurring task spawns the next
          instance.
        </p>
      )}
    </CollapsibleSection>
  );
}

// ---------- Linked tasks ----------

function LinkedTasksSearchPanel({
  task,
  onLink,
  queryRecoverKeys,
  orgConvexArgs,
}: {
  task: TaskDoc;
  onLink: (id: Id<"tasks">) => Promise<void>;
  queryRecoverKeys: unknown[];
  orgConvexArgs: TaskOrgConvexArgs;
}) {
  return (
    <ConvexQueryBoundary
      recoverOnKeys={queryRecoverKeys}
      fallback={
        <p
          className="rounded-md border border-dashed border-amber-200/80 bg-amber-50/50 px-3 py-2 text-xs text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-100"
          role="status"
        >
          Task search is unavailable right now. Linked tasks above still work;
          try again after reconnecting.
        </p>
      }
    >
      <LinkedTasksSearchQueries
        task={task}
        onLink={onLink}
        orgConvexArgs={orgConvexArgs}
      />
    </ConvexQueryBoundary>
  );
}

function LinkedTasksSearchQueries({
  task,
  onLink,
  orgConvexArgs,
}: {
  task: TaskDoc;
  onLink: (id: Id<"tasks">) => Promise<void>;
  orgConvexArgs: TaskOrgConvexArgs;
}) {
  const [search, setSearch] = useState("");
  const excludeTaskIds = useMemo(
    () => [task._id, ...(task.linkedTaskIds ?? [])],
    [task._id, task.linkedTaskIds],
  );
  const trimmed = search.trim();
  const candidates = useQuery(
    api.tasks.linkSearchCandidates,
    trimmed.length > 0
      ? {
          q: trimmed,
          excludeTaskIds,
          scanLimit: 900,
          resultLimit: 12,
          ...orgConvexArgs,
        }
      : "skip",
  );

  const candidatesLoading = trimmed.length > 0 && candidates === undefined;
  const list = candidates ?? [];

  return (
    <>
      <SearchField
        placeholder="Search tasks to link…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        aria-label="Search tasks to link"
        disabled={candidatesLoading}
      />
      {candidatesLoading && (
        <p className="mt-2 text-xs text-muted-foreground" role="status">
          Searching recent tasks…
        </p>
      )}
      {trimmed && list.length > 0 && (
        <ul className="mt-2 space-y-1" aria-label="Candidate tasks">
          {list.map((c) => (
            <li
              key={c._id}
              className="flex items-center justify-between gap-2 rounded-md border border-transparent px-2 py-1.5 hover:border-border/80 hover:bg-muted/30"
            >
              <div className="min-w-0">
                <div className="truncate text-sm">{c.title}</div>
                <div className="text-xs text-muted-foreground">
                  Q{c.quadrant} · {c.type}
                </div>
              </div>
              <Button
                type="button"
                size="sm"
                onClick={async () => {
                  await onLink(c._id);
                  setSearch("");
                }}
              >
                Link
              </Button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function LinkedTasksSection({
  task,
  linked,
  loading,
  queryRecoverKeys,
  orgConvexArgs,
  onLink,
  onUnlink,
  onOpen,
}: {
  task: TaskDoc;
  linked: TaskDoc[];
  loading: boolean;
  queryRecoverKeys: unknown[];
  orgConvexArgs: TaskOrgConvexArgs;
  onLink: (id: Id<"tasks">) => Promise<void>;
  onUnlink: (id: Id<"tasks">) => Promise<void>;
  onOpen?: (id: Id<"tasks">) => void;
}) {
  return (
    <CollapsibleSection
      variant="card"
      defaultOpen={taskDrawerSectionsDefaultOpen(task.status)}
      title={
        <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          <Network className="h-3.5 w-3.5" aria-hidden />
          Linked tasks
          {linked.length > 0 && (
            <span className="text-[11px] font-normal text-muted-foreground/80">
              ({linked.length})
            </span>
          )}
        </span>
      }
    >

      {loading ? (
        <p
          className="mb-3 rounded-md border border-dashed p-3 text-center text-sm text-muted-foreground"
          role="status"
        >
          Loading…
        </p>
      ) : linked.length === 0 ? (
        <p className="mb-3 rounded-md border border-dashed p-3 text-center text-sm text-muted-foreground">
          No related tasks. Use the search below to link one.
        </p>
      ) : (
        <ul className="mb-3 space-y-1.5" aria-label="Linked tasks">
          {linked.map((l) => (
            <li
              key={l._id}
              className="flex items-center gap-2 rounded-md border border-border/60 bg-muted/10 px-2 py-1.5"
            >
              <span
                className={cn(
                  "h-1.5 w-1.5 shrink-0 rounded-full",
                  l.status === "done" ? "bg-emerald-500" : "bg-sky-500"
                )}
                aria-hidden
              />
              <div className="min-w-0 flex-1">
                <button
                  type="button"
                  className={cn(
                    "block w-full truncate text-left text-sm",
                    onOpen ? "hover:underline" : "cursor-default"
                  )}
                  onClick={() => onOpen?.(l._id)}
                >
                  <span
                    className={cn(
                      l.status === "done" &&
                        "text-muted-foreground line-through"
                    )}
                  >
                    {l.title}
                  </span>
                </button>
                <div className="text-xs text-muted-foreground">
                  Q{l.quadrant} · {l.type} · {l.category}
                </div>
              </div>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-7 w-7 shrink-0 px-0 text-muted-foreground hover:text-destructive"
                onClick={() => void onUnlink(l._id)}
                aria-label={`Unlink ${l.title}`}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <LinkedTasksSearchPanel
        task={task}
        onLink={onLink}
        queryRecoverKeys={queryRecoverKeys}
        orgConvexArgs={orgConvexArgs}
      />
    </CollapsibleSection>
  );
}

// ---------- Reminder (datetime) ----------

function TaskReminderField({
  task,
  onCommit,
}: {
  task: TaskDoc;
  onCommit: (fields: TaskPatchArg) => Promise<void>;
}) {
  const [draft, setDraft] = useState(() =>
    toDatetimeLocalValue(task.reminderAt),
  );
  useEffect(() => {
    setDraft(toDatetimeLocalValue(task.reminderAt));
  }, [task._id, task.reminderAt]);

  const { loading, error, commit, clearError } = useInlineCommit();

  const save = async () => {
    clearError();
    const nextMs = fromDatetimeLocalValue(draft);
    const prevNorm =
      task.reminderAt != null && task.reminderAt > 0
        ? task.reminderAt
        : undefined;
    const nextNorm = nextMs != null && nextMs > 0 ? nextMs : undefined;
    if (prevNorm === nextNorm) return;
    await commit(true, async () => {
      await onCommit({
        id: task._id,
        reminderAt: nextNorm == null ? null : nextNorm,
      });
    });
  };

  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-end gap-2">
        <Input
          type="datetime-local"
          className="max-w-[14rem] flex-1"
          value={draft}
          onChange={(e) => {
            clearError();
            setDraft(e.target.value);
          }}
          onBlur={() => void save()}
          disabled={loading}
          aria-label="Reminder date and time"
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={loading || task.reminderAt == null}
          onClick={() => {
            setDraft("");
            void commit(true, async () => {
              await onCommit({ id: task._id, reminderAt: null });
            });
          }}
        >
          Clear
        </Button>
      </div>
      <p className="text-[11px] text-muted-foreground">
        Surfaces in Alerts and assignee previews when this time is reached (open
        tasks only; respects snooze).
      </p>
      {error && (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

// ---------- Related contact ----------

function RelatedContactSection({
  task,
  contacts,
  loading,
  onCommit,
}: {
  task: TaskDoc;
  contacts: Doc<"contacts">[] | undefined;
  loading: boolean;
  onCommit: (fields: TaskPatchArg) => Promise<void>;
}) {
  const [q, setQ] = useState("");
  const filtered = useMemo(() => {
    const rows = contacts ?? [];
    const f = q.trim().toLowerCase();
    if (!f) return rows.slice(0, 120);
    return rows
      .filter(
        (c) =>
          c.name.toLowerCase().includes(f) ||
          contactSearchHaystack(c).includes(f) ||
          (c.companyName ?? "").toLowerCase().includes(f),
      )
      .slice(0, 120);
  }, [contacts, q]);

  const memberKeys = useMemo(
    () => new Set((contacts ?? []).map((c) => c._id)),
    [contacts],
  );
  const currentId = task.relatedContactId;
  const missingCurrent =
    currentId != null && contacts != null && !memberKeys.has(currentId);

  return (
    <CollapsibleSection
      variant="card"
      defaultOpen={Boolean(currentId) && taskDrawerSectionsDefaultOpen(task.status)}
      title={
        <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          <UserCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden />
          Related contact
        </span>
      }
    >
      {loading ? (
        <p className="text-sm text-muted-foreground" role="status">
          Loading contacts…
        </p>
      ) : (
        <>
          <div className="mb-3 space-y-1">
            <FieldLabel>Search</FieldLabel>
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Name, email, company…"
              aria-label="Filter contacts"
            />
          </div>
          <div className="space-y-1">
            <FieldLabel>Linked contact</FieldLabel>
            <select
              className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              value={currentId ?? ""}
              onChange={(e) => {
                const v = e.target.value;
                void onCommit({
                  id: task._id,
                  relatedContactId: v ? (v as Id<"contacts">) : null,
                });
              }}
              aria-label="Select related contact"
            >
              <option value="">— None —</option>
              {missingCurrent && currentId ? (
                <option value={currentId}>Stale link — choose another or clear</option>
              ) : null}
              {filtered.map((c) => (
                <option key={c._id} value={c._id}>
                  {c.name.trim()}
                  {c.companyName ? ` — ${c.companyName}` : ""}
                </option>
              ))}
            </select>
          </div>
          {contacts?.length === 0 && !loading && (
            <p className="mt-2 text-xs text-muted-foreground">
              No contacts yet — add one from the Contacts page.
            </p>
          )}
        </>
      )}
    </CollapsibleSection>
  );
}

// ---------- People (assignee + shared) ----------

function PeopleSection({
  task,
  onCommit,
}: {
  task: TaskDoc;
  onCommit: (fields: TaskPatchArg) => Promise<void>;
}) {
  const { accountId } = useUserPreferences();
  const { activeOrganizationId } = useOrgPermissions();
  const memberKey = accountId.trim();
  const { labelFor } = useOrgMemberDisplayLabel(
    activeOrganizationId ?? task.organizationId ?? undefined,
    memberKey || undefined,
  );
  const members = useQuery(
    api.organizations.listMembers,
    activeOrganizationId && memberKey
      ? { organizationId: activeOrganizationId, memberUserKey: memberKey }
      : "skip",
  );
  const sharedRaw = (task.sharedWithIds ?? []).join(", ");
  const assignee = task.assigneeId?.trim() ?? "";
  const memberKeys = useMemo(
    () => new Set((members ?? []).map((m) => m.userKey)),
    [members],
  );
  const assigneeInRoster = Boolean(assignee && memberKeys.has(assignee));
  const suggestions = useQuery(
    api.taskAssigneeIntelligence.suggestAssignees,
    activeOrganizationId && memberKey
      ? {
          organizationId: activeOrganizationId,
          memberUserKey: memberKey,
          relatedFileId: task.relatedFileId,
          limit: 6,
        }
      : "skip",
  );

  return (
    <CollapsibleSection
      variant="card"
      defaultOpen={taskDrawerSectionsDefaultOpen(task.status)}
      title={
        <span className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          <Users className="h-3.5 w-3.5" aria-hidden />
          People
          <span className="text-[11px] font-normal normal-case tracking-normal text-muted-foreground/80">
            Team roster when an org is active; keys still work for personal
            setups
          </span>
        </span>
      }
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {suggestions?.suggestions?.length ? (
          <div className="space-y-2 sm:col-span-2 rounded-lg border border-primary/25 bg-primary/5 px-3 py-2">
            <FieldLabel>Intelligent suggestions</FieldLabel>
            <p className="text-[11px] text-muted-foreground">
              Based on open workload, priority load, and file affinity. Tap to
              assign.
            </p>
            <div className="flex flex-wrap gap-1.5">
              {suggestions.suggestions.map((s) => (
                <button
                  key={s.userKey}
                  type="button"
                  className={cn(
                    "rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors",
                    s.overload
                      ? "border-amber-400/70 bg-amber-50 text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100"
                      : "border-border bg-background hover:bg-muted",
                  )}
                  onClick={() =>
                    void onCommit({
                      id: task._id,
                      assigneeId: s.userKey,
                    })
                  }
                >
                  {labelFor(s.userKey)}
                  {s.overload ? " · busy" : ""}
                  {s.idleCapacity ? " · capacity" : ""}
                </button>
              ))}
            </div>
          </div>
        ) : null}
        {members && members.length > 0 ? (
          <div className="space-y-1 sm:col-span-2">
            <FieldLabel>Assignee (organization)</FieldLabel>
            <select
              className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              value={!assignee ? "" : assigneeInRoster ? assignee : "__orphan__"}
              onChange={(e) => {
                const v = e.target.value;
                if (v === "__orphan__") return;
                void onCommit({
                  id: task._id,
                  assigneeId: v ? v : null,
                });
              }}
              aria-label="Assign from organization roster"
            >
              <option value="">— None —</option>
              {!assigneeInRoster && assignee ? (
                <option value="__orphan__">
                  Current: {labelFor(assignee)} (not in roster — use field below)
                </option>
              ) : null}
              {members.map((m) => (
                <option key={m.userKey} value={m.userKey}>
                  {labelFor(
                    m.userKey,
                  )}
                </option>
              ))}
            </select>
          </div>
        ) : null}
        <div className="space-y-1 sm:col-span-2">
          <FieldLabel>Assignee user key</FieldLabel>
          <InlineText
            value={assignee}
            allowEmpty
            placeholder="Account id or opaque key (same as pipeline assignee)"
            onCommit={(next) =>
              onCommit({
                id: task._id,
                assigneeId: next.trim() ? next.trim() : null,
              })
            }
            ariaLabel="Edit assignee"
          />
        </div>
        {activeOrganizationId && task.organizationId ? (
          <div id="task-drawer-sharing">
          <TaskSharingSection
            taskId={task._id}
            organizationId={task.organizationId}
            ownerUserId={task.ownerUserId}
            memberUserKey={memberKey}
          />
          </div>
        ) : (
          <div className="space-y-1 sm:col-span-2">
            <FieldLabel>Shared with (legacy)</FieldLabel>
            <InlineText
              value={sharedRaw}
              allowEmpty
              placeholder="comma-separated ids — use org task sharing when in a team"
              onCommit={(next) => {
                const list = next
                  .split(/[,\s]+/)
                  .map((s) => s.trim())
                  .filter(Boolean);
                return onCommit({ id: task._id, sharedWithIds: list });
              }}
              ariaLabel="Edit shared with"
            />
          </div>
        )}
      </div>
    </CollapsibleSection>
  );
}

// ---------- Related pipeline file ----------

function RelatedFileSection({
  task,
  onCommit,
  queryRecoverKeys,
}: {
  task: TaskDoc;
  onCommit: (fields: TaskPatchArg) => Promise<void>;
  queryRecoverKeys: unknown[];
}) {
  return (
    <ConvexQueryBoundary
      recoverOnKeys={queryRecoverKeys}
      fallback={
        <CollapsibleSection
          variant="card"
          defaultOpen={taskDrawerSectionsDefaultOpen(task.status)}
          title={
            <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <Briefcase className="h-3.5 w-3.5" aria-hidden />
              Related pipeline file
            </span>
          }
        >
          <p
            className="rounded-md border border-dashed border-amber-200/80 bg-amber-50/50 px-3 py-2 text-xs text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-100"
            role="status"
          >
            Pipeline linking could not be loaded. The rest of this task still
            works.
          </p>
          {task.relatedFileId ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={() =>
                void onCommit({ id: task._id, relatedFileId: null })
              }
            >
              Clear pipeline link
            </Button>
          ) : null}
        </CollapsibleSection>
      }
    >
      <RelatedFileSectionQueries task={task} onCommit={onCommit} />
    </ConvexQueryBoundary>
  );
}

function RelatedFileSectionQueries({
  task,
  onCommit,
}: {
  task: TaskDoc;
  onCommit: (fields: TaskPatchArg) => Promise<void>;
}) {
  const { accountId } = useUserPreferences();
  const { activeOrganizationId } = useOrgPermissions();
  const memberUserKey = accountId.trim() || undefined;
  const relatedFile = useQuery(
    api.pipeline.getById,
    task.relatedFileId
      ? {
          id: task.relatedFileId,
          ...(memberUserKey ? { memberUserKey } : {}),
        }
      : "skip"
  );
  const relatedHierarchy = useQuery(
    api.pipelineHierarchyQueries.resolvePipelineFileHierarchy,
    task.relatedFileId && activeOrganizationId && memberUserKey
      ? {
          fileId: task.relatedFileId,
          organizationId: activeOrganizationId,
          memberUserKey,
        }
      : "skip",
  );
  const allFiles = useQuery(
    api.pipeline.listLight,
    activeOrganizationId && memberUserKey
      ? { organizationId: activeOrganizationId, memberUserKey }
      : "skip",
  );
  const [search, setSearch] = useState("");
  const relatedLoading =
    task.relatedFileId !== undefined && relatedFile === undefined;

  const candidates = useMemo(() => {
    if (!allFiles) return [];
    const q = search.trim().toLowerCase();
    if (!q) return [];
    return allFiles
      .filter((f) =>
        [f.fileName, f.propertyAddress ?? "", f.scenario ?? ""]
          .join(" ")
          .toLowerCase()
          .includes(q)
      )
      .slice(0, 8);
  }, [allFiles, search]);

  return (
    <CollapsibleSection
      variant="card"
      defaultOpen={taskDrawerSectionsDefaultOpen(task.status)}
      title={
        <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          <Briefcase className="h-3.5 w-3.5" aria-hidden />
          Related pipeline file
        </span>
      }
    >

      {relatedLoading ? (
        <p
          className="rounded-md border border-dashed p-3 text-center text-sm text-muted-foreground"
          role="status"
        >
          Loading…
        </p>
      ) : relatedFile ? (
        <div className="space-y-2 rounded-md border border-border/60 bg-muted/10 p-3">
          {relatedHierarchy ? (
            <div className="space-y-1" data-testid="task-related-hierarchy">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Attached to
              </p>
              <PipelineHierarchyBreadcrumb
                size="compact"
                crumbs={[
                  {
                    label: relatedHierarchy.client.displayName,
                  },
                  {
                    label: relatedHierarchy.project.title,
                  },
                  {
                    label: relatedFile.fileName?.trim() || "Loan file",
                  },
                ]}
              />
            </div>
          ) : null}
          <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="truncate text-sm font-medium">
              {relatedFile.fileName}
            </div>
            {relatedFile.propertyAddress && (
              <div className="truncate text-xs text-muted-foreground">
                {relatedFile.propertyAddress}
              </div>
            )}
          </div>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="text-muted-foreground hover:text-destructive"
            onClick={() =>
              void onCommit({ id: task._id, relatedFileId: null })
            }
          >
            <X className="h-3.5 w-3.5" /> Unlink
          </Button>
          </div>
        </div>
      ) : (
        <>
          <p className="mb-2 text-xs text-muted-foreground">
            Tie this task to a deal so it shows up inside the file&apos;s
            drawer.
          </p>
          <SearchField
            placeholder="Search pipeline files…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search pipeline files"
            disabled={allFiles === undefined}
          />
          {allFiles === undefined && (
            <p className="mt-2 text-xs text-muted-foreground" role="status">
              Loading file list…
            </p>
          )}
          {search.trim() && candidates.length > 0 && (
            <ul className="mt-2 space-y-1" aria-label="File candidates">
              {candidates.map((f) => (
                <li
                  key={f._id}
                  className="flex items-center justify-between gap-2 rounded-md border border-transparent px-2 py-1.5 hover:border-border/80 hover:bg-muted/30"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm">{f.fileName}</div>
                    {f.propertyAddress && (
                      <div className="truncate text-xs text-muted-foreground">
                        {f.propertyAddress}
                      </div>
                    )}
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    onClick={async () => {
                      await onCommit({
                        id: task._id,
                        relatedFileId: f._id,
                      });
                      setSearch("");
                    }}
                  >
                    Link
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </CollapsibleSection>
  );
}

// ---------- Convenience: inline drag handle visual (re-exported for the row) ----------

export function TaskRowGripIcon({
  className,
}: {
  className?: string;
}) {
  return (
    <GripVertical
      className={cn("h-4 w-4 text-muted-foreground/60", className)}
      aria-hidden
    />
  );
}
