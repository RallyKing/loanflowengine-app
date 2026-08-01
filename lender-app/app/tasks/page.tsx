"use client";

import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useMutation, useQueries, type RequestForQueries } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/Button";
import {
  ActionSuite,
  ActionSuiteIconButton,
} from "@/components/ui/ActionSuite";
import { OperationalRowShell } from "@/components/ui/OperationalRowShell";
import { OperationalOrientationStrip } from "@/components/ui/OperationalOrientationStrip";
import { OperationalEmptyState } from "@/components/ui/OperationalEmptyState";
import { useOperationalConfirm } from "@/components/ui/OperationalConfirmDialog";
import { simpleDeleteConfirm } from "@/lib/ui/confirmDestructive";
import { Input, Select } from "@/components/ui/Input";
import { SearchField } from "@/components/ui/SearchField";
import { useLiveConnection } from "@/lib/useLiveConnection";
import { cn } from "@/lib/cn";
import { parseJsonUnknown } from "@/lib/safeJson";
import {
  Check,
  Trash2,
  ChevronDown,
  ChevronRight,
  Plus,
  GripVertical,
  Link as LinkIcon,
  ListChecks,
  ListTree,
  Maximize2,
  Minimize2,
  Network,
  Pencil,
  User,
  Copy,
  Download,
  FileJson,
  Paperclip,
  Printer,
  Share2,
  ShoppingCart,
} from "lucide-react";
import {
  buildTasksCsv,
  buildTasksJson,
  buildTasksTsv,
} from "@/lib/export/tasksExport";
import { downloadTextFile } from "@/lib/export/downloadClient";
import { buildExportFilename } from "@/lib/export/exportFilename";
import {
  formatSelectedTasksPlainText,
  printTasksInNewWindow,
} from "@/lib/tasksPrint";
import {
  InlineText,
  InlineSelect,
  InlineDate,
  InlineTextarea,
  type InlineSelectOption,
} from "@/components/inline";
import { TaskNotificationsBell } from "@/components/TaskNotificationsBell";
import { CollapsibleSection } from "@/components/CollapsibleSection";

const TaskDrawer = dynamic(
  () =>
    import("@/components/TaskDrawer").then((m) => ({ default: m.TaskDrawer })),
  { ssr: false, loading: () => null },
);
import {
  ErrandListInline,
  defaultErrandListStartsExpanded,
} from "@/components/ErrandListInline";
import { SnoozeMenu, SnoozedBadge, isSnoozed } from "@/components/SnoozeMenu";
import { ConvexQueryBoundary } from "@/components/ConvexQueryBoundary";
import { useOrgPermissions } from "@/lib/useOrgPermissions";
import { useOrgConvexQueryArgs } from "@/lib/useOrgConvexQueryArgs";
import { useOrgMemberDisplayLabel } from "@/lib/useOrgMemberDisplayLabel";
import type { ResourceOwnershipPresentationClient } from "@/lib/resourceOwnershipUi";
import { useActorUserKey } from "@/lib/useActorUserKey";
import {
  loadQuerySnapshot,
  persistQuerySnapshot,
  tasksListSnapshotKey,
} from "@/lib/offline/OfflineSyncContext";
import { appendPriorityDebugClientLog } from "@/lib/debugClientLog";
import { mobilePrimaryTitleClass } from "@/lib/ui/mobileInformationHierarchy";

const QUADRANTS = [1, 2, 3, 4] as const;
type QuadrantN = (typeof QUADRANTS)[number];

const QUADRANT_BLURB: Record<QuadrantN, string> = {
  1: "Urgent & important",
  2: "Important, not urgent",
  3: "Urgent, not important",
  4: "Not urgent, not important",
};

const QUADRANT_BAR: Record<QuadrantN, string> = {
  1: "bg-red-500",
  2: "bg-emerald-500",
  3: "bg-amber-500",
  4: "bg-muted-foreground/55",
};

const TASK_TYPES = ["work", "personal", "errands_groceries"] as const;
type TaskType = (typeof TASK_TYPES)[number];

const TASK_CATEGORIES = [
  "errand",
  "research",
  "call",
  "admin",
  "project",
] as const;
type TaskCategory = (typeof TASK_CATEGORIES)[number];

type TypeFilter = "all" | TaskType;

function bucketQuadrant(n: number): QuadrantN {
  if (n === 1 || n === 2 || n === 3 || n === 4) return n;
  return 2;
}

const DEFAULT_QUADRANT: QuadrantN = 2;
const DEFAULT_STATUS = "todo" as const;
const DEFAULT_TYPE: TaskType = "work";
const DEFAULT_CATEGORY: TaskCategory = "admin";
const DEFAULT_PRIORITY = 0;

function labelCategory(c: string) {
  if (!c) return c;
  return c.charAt(0).toUpperCase() + c.slice(1);
}

function labelTaskType(t: TaskType): string {
  if (t === "errands_groceries") return "Errands / groceries";
  return labelCategory(t);
}

function isSameLocalDay(ms: number, ref: Date = new Date()): boolean {
  const d = new Date(ms);
  return (
    d.getFullYear() === ref.getFullYear() &&
    d.getMonth() === ref.getMonth() &&
    d.getDate() === ref.getDate()
  );
}

function isOverdue(t: Doc<"tasks">): boolean {
  // Snoozed tasks intentionally don't count as overdue — the user has
  // told us they're parking them on purpose.
  if (isSnoozed(t)) return false;
  return (
    t.dueDate != null && t.dueDate < Date.now() && t.status !== "done"
  );
}

/** How snoozed tasks are surfaced. Default ("hide") matches the rest of the app. */
type SnoozeFilter = "hide" | "only" | "all";

function taskMatchesSearch(t: Doc<"tasks">, rawQuery: string): boolean {
  const query = rawQuery.trim().toLowerCase();
  if (!query) return true;
  const terms = query.split(/\s+/).filter(Boolean);
  if (terms.length === 0) return true;
  const errandHay = (t.errandLocations ?? [])
    .flatMap((loc) => [
      loc.name,
      ...loc.items.map((it) => it.name),
    ])
    .join(" ");
  const haystack = [
    t.title,
    t.description ?? "",
    t.assigneeId ?? "",
    t.type,
    t.category,
    errandHay,
  ]
    .join(" ")
    .toLowerCase();
  return terms.every((term) => haystack.includes(term));
}

/** Non-default filter chips for the collapsed toolbar badge. */
function countActiveTaskFilters(args: {
  typeFilter: TypeFilter;
  categoryFilter: "all" | TaskCategory;
  assigneeFilter: string;
  dueTodayOnly: boolean;
  overdueOnly: boolean;
  showDone: boolean;
  snoozeFilter: SnoozeFilter;
}): number {
  let n = 0;
  if (args.typeFilter !== "all") n++;
  if (args.categoryFilter !== "all") n++;
  if (args.assigneeFilter !== "all") n++;
  if (args.dueTodayOnly) n++;
  if (args.overdueOnly) n++;
  if (args.showDone) n++;
  if (args.snoozeFilter !== "hide") n++;
  return n;
}

function applyTaskFilters(
  rows: Doc<"tasks">[],
  typeFilter: TypeFilter,
  categoryFilter: "all" | TaskCategory,
  assigneeFilter: string,
  searchQuery: string,
  dueTodayOnly: boolean,
  overdueOnly: boolean,
  showDone: boolean,
  snoozeFilter: SnoozeFilter
): Doc<"tasks">[] {
  let out = rows;
  if (!showDone) {
    out = out.filter((t) => t.status !== "done" && t.status !== "archived");
  }
  if (snoozeFilter === "hide") {
    out = out.filter((t) => !isSnoozed(t));
  } else if (snoozeFilter === "only") {
    out = out.filter((t) => isSnoozed(t));
  }
  if (typeFilter !== "all") {
    out = out.filter((t) => t.type === typeFilter);
  }
  if (categoryFilter !== "all") {
    out = out.filter((t) => t.category === categoryFilter);
  }
  if (assigneeFilter !== "all") {
    if (assigneeFilter === "__none__") {
      out = out.filter((t) => !t.assigneeId);
    } else {
      out = out.filter((t) => t.assigneeId === assigneeFilter);
    }
  }
  if (searchQuery.trim()) {
    out = out.filter((t) => taskMatchesSearch(t, searchQuery));
  }
  if (dueTodayOnly) {
    out = out.filter(
      (t) => t.dueDate != null && isSameLocalDay(t.dueDate)
    );
  }
  if (overdueOnly) {
    out = out.filter((t) => isOverdue(t));
  }
  return out;
}

type ViewMode = "matrix" | "today" | "week" | "longterm";

const VIEW_LABEL: Record<ViewMode, string> = {
  matrix: "Matrix",
  today: "Today",
  week: "This week",
  longterm: "Long-term",
};

/**
 * Matrix-only controls. Persisted to localStorage so power users get the
 * same layout each time they come back.
 */
type SortMode = "smart" | "due" | "priority" | "newest" | "oldest" | "alpha";

const SORT_LABEL: Record<SortMode, string> = {
  smart: "Smart (overdue → due)",
  due: "Due date",
  priority: "Priority",
  newest: "Newest",
  oldest: "Oldest",
  alpha: "A → Z",
};

type Density = "comfortable" | "compact";
type QuadrantFocus = "all" | QuadrantN;

const MATRIX_PREFS_KEY = "tasks.matrix.prefs.v1";

type MatrixPrefs = {
  sortMode: SortMode;
  density: Density;
  quadrantFocus: QuadrantFocus;
  collapsedQs: QuadrantN[];
};

const DEFAULT_MATRIX_PREFS: MatrixPrefs = {
  sortMode: "smart",
  density: "comfortable",
  quadrantFocus: "all",
  collapsedQs: [],
};

function loadMatrixPrefs(): MatrixPrefs {
  if (typeof window === "undefined") return DEFAULT_MATRIX_PREFS;
  try {
    const raw = window.localStorage.getItem(MATRIX_PREFS_KEY);
    if (!raw) return DEFAULT_MATRIX_PREFS;
    const parsedUnknown = parseJsonUnknown(raw);
    if (!parsedUnknown || typeof parsedUnknown !== "object") {
      return DEFAULT_MATRIX_PREFS;
    }
    const parsed = parsedUnknown as Partial<MatrixPrefs>;
    return {
      sortMode: (parsed.sortMode ?? DEFAULT_MATRIX_PREFS.sortMode) as SortMode,
      density: (parsed.density ?? DEFAULT_MATRIX_PREFS.density) as Density,
      quadrantFocus:
        (parsed.quadrantFocus ?? DEFAULT_MATRIX_PREFS.quadrantFocus) as QuadrantFocus,
      collapsedQs: Array.isArray(parsed.collapsedQs)
        ? (parsed.collapsedQs.filter(
            (q): q is QuadrantN => q === 1 || q === 2 || q === 3 || q === 4
          ) as QuadrantN[])
        : [],
    };
  } catch {
    return DEFAULT_MATRIX_PREFS;
  }
}

function makeSorter(
  mode: SortMode
): (a: Doc<"tasks">, b: Doc<"tasks">) => number {
  switch (mode) {
    case "due":
      return (a, b) => {
        const aDue = a.dueDate ?? Number.POSITIVE_INFINITY;
        const bDue = b.dueDate ?? Number.POSITIVE_INFINITY;
        if (aDue !== bDue) return aDue - bDue;
        return b._creationTime - a._creationTime;
      };
    case "priority":
      return (a, b) => {
        if (b.priority !== a.priority) return b.priority - a.priority;
        return sortByPriority(a, b);
      };
    case "newest":
      return (a, b) => b._creationTime - a._creationTime;
    case "oldest":
      return (a, b) => a._creationTime - b._creationTime;
    case "alpha":
      return (a, b) => a.title.localeCompare(b.title);
    case "smart":
    default:
      return sortByPriority;
  }
}

function endOfWeek(now: Date = new Date()): number {
  const d = new Date(now);
  d.setHours(23, 59, 59, 999);
  // 0 = Sunday, treat week as ending Sunday night.
  const daysAhead = (7 - d.getDay()) % 7;
  d.setDate(d.getDate() + daysAhead);
  return d.getTime();
}

function dayKey(now: Date = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(
    2,
    "0"
  )}-${String(now.getDate()).padStart(2, "0")}`;
}

function isInThisWeek(t: Doc<"tasks">): boolean {
  if (t.dueDate == null) return false;
  return t.dueDate <= endOfWeek();
}

/**
 * "Long-term" = no due date, or due date more than 30 days out, or quadrant 2
 * (important not urgent). Big-rock work that benefits from a parking lot view.
 */
function isLongTerm(t: Doc<"tasks">): boolean {
  if (t.dueDate == null) return true;
  const thirtyOut = Date.now() + 30 * 24 * 60 * 60 * 1000;
  return t.dueDate >= thirtyOut || bucketQuadrant(t.quadrant) === 2;
}

function sortByPriority(a: Doc<"tasks">, b: Doc<"tasks">) {
  const overA = isOverdue(a);
  const overB = isOverdue(b);
  if (overA !== overB) return overA ? -1 : 1;
  const aDue = a.dueDate ?? Number.POSITIVE_INFINITY;
  const bDue = b.dueDate ?? Number.POSITIVE_INFINITY;
  if (aDue !== bDue) return aDue - bDue;
  return b._creationTime - a._creationTime;
}

/** Manual matrix order (quadrantPosition) wins; unset positions use `secondary`. */
function compareQuadrantPositionThen(
  a: Doc<"tasks">,
  b: Doc<"tasks">,
  secondary: (x: Doc<"tasks">, y: Doc<"tasks">) => number
): number {
  const pa = a.quadrantPosition;
  const pb = b.quadrantPosition;
  if (pa != null && pb != null && pa !== pb) return pa - pb;
  if (pa != null && pb == null) return -1;
  if (pa == null && pb != null) return 1;
  return secondary(a, b);
}

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

const CATEGORY_OPTIONS: InlineSelectOption[] = TASK_CATEGORIES.map((c) => ({
  value: c,
  label: labelCategory(c),
}));

const QUADRANT_OPTIONS: InlineSelectOption[] = QUADRANTS.map((q) => ({
  value: String(q),
  label: `Q${q}`,
}));

type TaskUpdater = (
  t: Doc<"tasks">,
  patch: Partial<Doc<"tasks">>
) => Promise<void>;

// ---------- Drag-and-drop helpers ----------

const DRAG_MIME = "application/x-task-id";

function readDragId(e: React.DragEvent): Id<"tasks"> | null {
  const fromMime = e.dataTransfer.getData(DRAG_MIME);
  if (fromMime) return fromMime as Id<"tasks">;
  const fallback = e.dataTransfer.getData("text/plain");
  return fallback ? (fallback as Id<"tasks">) : null;
}

// ---------- Row ----------

type MatrixReorderHandlers = {
  quadrant: QuadrantN;
  draggingId: Id<"tasks"> | null;
  reorderHoverId: Id<"tasks"> | null;
  onRowDragOver: (e: React.DragEvent, target: Doc<"tasks">) => void;
  onRowDragLeave: (e: React.DragEvent, target: Doc<"tasks">) => void;
  onRowDrop: (e: React.DragEvent, target: Doc<"tasks">) => void;
};

type TaskSelectionCheckbox = "unchecked" | "checked" | "indeterminate";

/** Root-first BFS: `rootId` then every descendant under `parentTaskId` links. */
function collectSubtreeTaskIds(
  rootId: Id<"tasks">,
  childrenByParent: Map<string, Doc<"tasks">[]>
): Id<"tasks">[] {
  const out: Id<"tasks">[] = [];
  const queue: Id<"tasks">[] = [rootId];
  const seen = new Set<string>();
  while (queue.length) {
    const id = queue.shift()!;
    const k = String(id);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(id);
    for (const c of childrenByParent.get(k) ?? []) {
      if (!seen.has(String(c._id))) queue.push(c._id);
    }
  }
  return out;
}

/** Per-task checkbox: full subtree selected, none, or partial (indeterminate). */
function buildSelectionCheckboxById(
  allRows: Doc<"tasks">[],
  selectedSet: ReadonlySet<string>,
  childrenByParent: Map<string, Doc<"tasks">[]>
): Map<string, TaskSelectionCheckbox> {
  const metrics = new Map<string, { sel: number; tot: number }>();
  function dfs(id: Id<"tasks">): { sel: number; tot: number } {
    const k = String(id);
    if (metrics.has(k)) return metrics.get(k)!;
    let tot = 1;
    let sel = selectedSet.has(k) ? 1 : 0;
    for (const c of childrenByParent.get(k) ?? []) {
      const r = dfs(c._id);
      tot += r.tot;
      sel += r.sel;
    }
    const v = { sel, tot };
    metrics.set(k, v);
    return v;
  }
  for (const t of allRows) dfs(t._id);
  const out = new Map<string, TaskSelectionCheckbox>();
  for (const t of allRows) {
    const k = String(t._id);
    const { sel, tot } = metrics.get(k)!;
    if (sel === 0) out.set(k, "unchecked");
    else if (sel === tot) out.set(k, "checked");
    else out.set(k, "indeterminate");
  }
  return out;
}

function TaskRow({
  t,
  rowBusy,
  childCount,
  childDoneCount,
  isChild,
  isDragging,
  onUpdate,
  onToggleDone,
  onDelete,
  onOpenDrawer,
  onDragStart,
  onDragEnd,
  actionTitle,
  onSnooze,
  onWake,
  leading,
  attachmentCounts,
  matrixReorder,
  selectable,
  selectionCheckboxState,
  onToggleSelect,
  assigneeLabel,
  expanded: expandedControlled,
  onExpandedChange,
  descriptionSuppressed = false,
}: {
  t: Doc<"tasks"> & {
    ownership?: ResourceOwnershipPresentationClient | null;
  };
  rowBusy: boolean;
  childCount: number;
  childDoneCount: number;
  isChild: boolean;
  isDragging: boolean;
  onUpdate: TaskUpdater;
  onToggleDone: (task: Doc<"tasks">) => void;
  onDelete: (task: Doc<"tasks">) => void;
  onOpenDrawer: (id: Id<"tasks">) => void;
  onDragStart: (e: React.DragEvent, t: Doc<"tasks">) => void;
  onDragEnd: () => void;
  actionTitle: (h: string) => string;
  onSnooze: (id: Id<"tasks">, until: number) => void | Promise<unknown>;
  onWake: (id: Id<"tasks">) => void | Promise<unknown>;
  /**
   * Extra content rendered before the grip handle inside the row.
   * Used to slot in a "pin to today" button without wrapping the row
   * in another <li> (which would be invalid HTML).
   */
  leading?: React.ReactNode;
  /** From `api.tasks.countTaskFilesForTasks` — undefined while loading. */
  attachmentCounts?: Record<string, number>;
  /** Matrix view only: drop targets for intra-quadrant reorder. */
  matrixReorder?: MatrixReorderHandlers;
  /** Multi-select for print / copy (checkbox does not start row drag). */
  selectable?: boolean;
  selectionCheckboxState?: TaskSelectionCheckbox;
  onToggleSelect?: (id: Id<"tasks">) => void;
  assigneeLabel?: (userKey: string) => string;
  /** Controlled expand (matrix parent rows in `FragmentRow`). */
  expanded?: boolean;
  onExpandedChange?: (open: boolean) => void;
  /** Hide description when a matrix parent row is collapsed. */
  descriptionSuppressed?: boolean;
}) {
  const printSelectRef = useRef<HTMLInputElement>(null);
  const isDone = t.status === "done";
  const overdue = isOverdue(t);
  const snoozed = isSnoozed(t);
  const [expandedInternal, setExpandedInternal] = useState(false);
  const expandedControlledMode = expandedControlled !== undefined;
  const expanded = expandedControlledMode
    ? expandedControlled
    : expandedInternal;
  const setExpanded = useCallback(
    (next: boolean | ((prev: boolean) => boolean)) => {
      const resolved =
        typeof next === "function"
          ? next(expandedControlledMode ? expandedControlled! : expandedInternal)
          : next;
      if (onExpandedChange) onExpandedChange(resolved);
      else setExpandedInternal(resolved);
    },
    [expandedControlled, expandedControlledMode, expandedInternal, onExpandedChange]
  );
  const [errandRowOpen, setErrandRowOpen] = useState(
    () => t.type === "errands_groceries" && defaultErrandListStartsExpanded(t)
  );
  const [errandDetailExpanded, setErrandDetailExpanded] = useState(
    () => t.type === "errands_groceries" && defaultErrandListStartsExpanded(t)
  );
  const [errandCollapsedStores, setErrandCollapsedStores] = useState<
    ReadonlySet<string>
  >(() => new Set());

  useEffect(() => {
    if (t.type !== "errands_groceries") return;
    const o = defaultErrandListStartsExpanded(t);
    setErrandRowOpen(o);
    setErrandDetailExpanded(o);
    setErrandCollapsedStores(new Set());
  }, [t]);

  const toggleErrandStoreCollapse = useCallback((storeId: string) => {
    setErrandCollapsedStores((prev) => {
      const next = new Set(prev);
      if (next.has(storeId)) next.delete(storeId);
      else next.add(storeId);
      return next;
    });
  }, []);

  const showDescription =
    !descriptionSuppressed &&
    t.type !== "errands_groceries" &&
    expanded;
  const showErrandBody =
    !descriptionSuppressed &&
    t.type === "errands_groceries" &&
    errandRowOpen;
  const linkCount = t.links?.length ?? 0;
  const checklistCount = t.checklist?.length ?? 0;
  const checklistDone = (t.checklist ?? []).filter((c) => c.done).length;
  const errandLocs = t.errandLocations ?? [];
  const errandItemCount = errandLocs.reduce((s, l) => s + l.items.length, 0);
  const errandDone = errandLocs.reduce(
    (s, l) => s + l.items.filter((i) => i.completed).length,
    0
  );
  const linkedCount = t.linkedTaskIds?.length ?? 0;
  const fileAttachCount = attachmentCounts?.[String(t._id)];

  const reorderActive =
    matrixReorder &&
    !isChild &&
    matrixReorder.draggingId &&
    matrixReorder.draggingId !== t._id &&
    bucketQuadrant(t.quadrant) === matrixReorder.quadrant;
  const reorderHighlight =
    reorderActive && matrixReorder.reorderHoverId === t._id;

  useLayoutEffect(() => {
    const el = printSelectRef.current;
    if (!el || !selectable) return;
    const st = selectionCheckboxState ?? "unchecked";
    el.indeterminate = st === "indeterminate";
  }, [selectable, selectionCheckboxState]);

  return (
    <li
      className={cn(
        "border-b border-border/50 last:border-0",
        isChild && "ml-7 border-l border-border/40 pl-3",
        isDragging && "opacity-40",
        snoozed && "opacity-70",
        reorderHighlight && "bg-primary/8 ring-2 ring-inset ring-primary/35"
      )}
      draggable
      onDragStart={(e) => {
        if ((e.target as HTMLElement).closest("[data-print-select]")) {
          e.preventDefault();
          return;
        }
        onDragStart(e, t);
      }}
      onDragEnd={onDragEnd}
      onDragOver={
        matrixReorder && !isChild
          ? (e) => matrixReorder.onRowDragOver(e, t)
          : undefined
      }
      onDragLeave={
        matrixReorder && !isChild
          ? (e) => matrixReorder.onRowDragLeave(e, t)
          : undefined
      }
      onDrop={
        matrixReorder && !isChild
          ? (e) => void matrixReorder.onRowDrop(e, t)
          : undefined
      }
    >
      <div
        className={cn(
          "flex flex-col gap-2 px-3 py-2.5 md:hidden",
          reorderHighlight && "bg-primary/8 ring-2 ring-inset ring-primary/35",
        )}
      >
        <InlineText
          value={t.title}
          onCommit={(next) => onUpdate(t, { title: next })}
          ariaLabel="Edit task title"
          displayClassName={cn(
            mobilePrimaryTitleClass,
            "font-medium",
            isDone && "text-muted-foreground line-through",
          )}
        />
        <div className="flex flex-wrap items-center gap-2">
          {leading}
          {selectable && onToggleSelect && (
            <label
              data-print-select
              className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-md border border-input bg-background hover:bg-muted"
              title={
                selectionCheckboxState === "indeterminate"
                  ? "Some subtasks selected — click to select all, or adjust subtasks"
                  : "Select for print or copy"
              }
              onMouseDown={(e) => e.stopPropagation()}
            >
              <input
                ref={printSelectRef}
                type="checkbox"
                className="h-3.5 w-3.5 rounded border-input accent-primary"
                checked={selectionCheckboxState === "checked"}
                aria-checked={
                  selectionCheckboxState === "indeterminate"
                    ? "mixed"
                    : selectionCheckboxState === "checked"
                }
                disabled={rowBusy}
                onChange={(e) => {
                  e.stopPropagation();
                  onToggleSelect(t._id);
                }}
                aria-label={`Select “${t.title}” for print or copy`}
              />
            </label>
          )}
          <span
            className="cursor-grab text-muted-foreground/60 hover:text-muted-foreground active:cursor-grabbing"
            aria-hidden
            title="Drag to reorder within this quadrant or drop on another quadrant"
          >
            <GripVertical className="h-4 w-4" />
          </span>
          <label
            className={cn(
              "flex shrink-0 cursor-pointer items-center justify-center rounded-md border border-input p-1 transition-colors",
              isDone
                ? "bg-primary text-primary-foreground hover:bg-primary/90"
                : "hover:bg-muted",
            )}
            title={actionTitle(isDone ? "Mark as todo" : "Mark as done")}
          >
            <input
              type="checkbox"
              className="sr-only"
              checked={isDone}
              disabled={rowBusy}
              onChange={() => onToggleDone(t)}
              aria-label={isDone ? "Mark as todo" : "Mark as done"}
            />
            <Check
              className={cn("h-3.5 w-3.5", !isDone && "opacity-0")}
              aria-hidden
            />
          </label>
          <button
            type="button"
            aria-label={
              t.type === "errands_groceries"
                ? errandRowOpen
                  ? "Collapse stores and items"
                  : "Expand stores and items"
                : expanded
                  ? "Collapse description"
                  : "Expand description"
            }
            aria-expanded={
              t.type === "errands_groceries" ? errandRowOpen : expanded
            }
            onClick={() =>
              t.type === "errands_groceries"
                ? setErrandRowOpen((v) => !v)
                : setExpanded((v) => !v)
            }
            className="shrink-0 rounded p-1 text-muted-foreground hover:bg-muted"
          >
            {t.type === "errands_groceries" ? (
              errandRowOpen ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )
            ) : expanded ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
          </button>
          {snoozed && typeof t.snoozedUntil === "number" && (
            <SnoozedBadge until={t.snoozedUntil} />
          )}
          {childCount > 0 && (
            <span
              className="inline-flex items-center gap-1 whitespace-nowrap text-xs text-muted-foreground"
              title={`${childDoneCount}/${childCount} subtasks done`}
            >
              <ListTree className="h-3 w-3" />
              {childDoneCount}/{childCount}
            </span>
          )}
          {checklistCount > 0 && (
            <span
              className="inline-flex items-center gap-1 whitespace-nowrap text-xs text-muted-foreground"
              title={`${checklistDone}/${checklistCount} checklist items done`}
            >
              <ListChecks className="h-3 w-3" />
              {checklistDone}/{checklistCount}
            </span>
          )}
          {errandItemCount > 0 && (
            <span
              className="inline-flex items-center gap-1 whitespace-nowrap text-xs text-muted-foreground"
              title={`${errandDone}/${errandItemCount} grocery/errand items checked`}
            >
              <ShoppingCart className="h-3 w-3" />
              {errandDone}/{errandItemCount}
            </span>
          )}
          {linkCount > 0 && (
            <span
              className="inline-flex items-center gap-1 whitespace-nowrap text-xs text-muted-foreground"
              title={`${linkCount} link(s)`}
            >
              <LinkIcon className="h-3 w-3" />
              {linkCount}
            </span>
          )}
          {linkedCount > 0 && (
            <span
              className="inline-flex items-center gap-1 whitespace-nowrap text-xs text-muted-foreground"
              title={`${linkedCount} linked task(s)`}
            >
              <Network className="h-3 w-3" />
              {linkedCount}
            </span>
          )}
          {typeof fileAttachCount === "number" && fileAttachCount > 0 && (
            <span
              className="inline-flex items-center gap-1 whitespace-nowrap text-xs text-muted-foreground"
              title={`${fileAttachCount} file(s) attached — open task to manage`}
            >
              <Paperclip className="h-3 w-3" aria-hidden />
              {fileAttachCount}
            </span>
          )}
          {t.ownership?.ownershipLine ? (
            <span
              className="max-w-full break-words text-xs text-muted-foreground"
              title={t.ownership.ownershipLine}
            >
              {t.ownership.ownershipLine}
            </span>
          ) : null}
          <InlineDate
            value={t.dueDate ?? null}
            onCommit={(next) =>
              onUpdate(t, { dueDate: next === null ? undefined : next })
            }
            ariaLabel="Edit due date"
            placeholder="Set due"
            showRelative
            displayClassName={cn(
              "min-w-[120px] text-xs",
              overdue && "font-medium text-destructive",
            )}
          />
          <InlineSelect
            value={t.type}
            options={TYPE_OPTIONS}
            onCommit={(next) => onUpdate(t, { type: next as TaskType })}
            ariaLabel="Change type"
            asBadge
          />
          <InlineSelect
            value={t.category}
            options={CATEGORY_OPTIONS}
            onCommit={(next) =>
              onUpdate(t, { category: next as TaskCategory })
            }
            ariaLabel="Change category"
            displayClassName="min-w-[80px] text-xs"
            selectClassName="text-xs"
          />
          {t.assigneeId && (
            <span
              className="inline-flex shrink-0 items-center gap-1 rounded-full border border-border bg-background px-2 py-0.5 text-[11px] font-medium text-muted-foreground"
              title={`Assigned to ${assigneeLabel ? assigneeLabel(t.assigneeId) : t.assigneeId}`}
            >
              <User className="h-3 w-3" />
              {assigneeLabel ? assigneeLabel(t.assigneeId) : t.assigneeId}
            </span>
          )}
          <InlineSelect
            value={String(bucketQuadrant(t.quadrant))}
            options={QUADRANT_OPTIONS}
            onCommit={(next) => onUpdate(t, { quadrant: Number(next) })}
            ariaLabel="Change quadrant"
            displayClassName="min-w-[40px] text-xs"
            selectClassName="text-xs"
          />
          <SnoozeMenu
            snoozedUntil={t.snoozedUntil}
            onSnooze={(until) => onSnooze(t._id, until)}
            onWake={() => onWake(t._id)}
            stopPropagation
          />
          <ActionSuite aria-label="Task row actions">
            <ActionSuiteIconButton
              tooltip="Open task details"
              testId={`task-open-${t._id}`}
              onClick={() => onOpenDrawer(t._id)}
            >
              <Pencil className="h-4 w-4" aria-hidden />
            </ActionSuiteIconButton>
            <ActionSuiteIconButton
              tooltip={actionTitle("Delete task")}
              testId={`task-delete-${t._id}`}
              disabled={rowBusy}
              destructive
              onClick={() => onDelete(t)}
            >
              <Trash2 className="h-4 w-4" aria-hidden />
            </ActionSuiteIconButton>
          </ActionSuite>
        </div>
      </div>

      <OperationalRowShell
        rowClassName={cn(
          "hidden md:flex",
          reorderHighlight && "bg-primary/8 ring-2 ring-inset ring-primary/35",
        )}
        left={
          <>
        {leading}
        {selectable && onToggleSelect && (
          <label
            data-print-select
            className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-md border border-input bg-background hover:bg-muted"
            title={
              selectionCheckboxState === "indeterminate"
                ? "Some subtasks selected — click to select all, or adjust subtasks"
                : "Select for print or copy"
            }
            onMouseDown={(e) => e.stopPropagation()}
          >
            <input
              ref={printSelectRef}
              type="checkbox"
              className="h-3.5 w-3.5 rounded border-input accent-primary"
              checked={selectionCheckboxState === "checked"}
              aria-checked={
                selectionCheckboxState === "indeterminate"
                  ? "mixed"
                  : selectionCheckboxState === "checked"
              }
              disabled={rowBusy}
              onChange={(e) => {
                e.stopPropagation();
                onToggleSelect(t._id);
              }}
              aria-label={`Select “${t.title}” for print or copy`}
            />
          </label>
        )}
        <span
          className="cursor-grab text-muted-foreground/60 hover:text-muted-foreground active:cursor-grabbing"
          aria-hidden
          title="Drag to reorder within this quadrant or drop on another quadrant"
        >
          <GripVertical className="h-4 w-4" />
        </span>

        <label
          className={cn(
            "flex shrink-0 cursor-pointer items-center justify-center rounded-md border border-input p-1 transition-colors",
            isDone
              ? "bg-primary text-primary-foreground hover:bg-primary/90"
              : "hover:bg-muted"
          )}
          title={actionTitle(isDone ? "Mark as todo" : "Mark as done")}
        >
          <input
            type="checkbox"
            className="sr-only"
            checked={isDone}
            disabled={rowBusy}
            onChange={() => onToggleDone(t)}
            aria-label={isDone ? "Mark as todo" : "Mark as done"}
          />
          <Check
            className={cn("h-3.5 w-3.5", !isDone && "opacity-0")}
            aria-hidden
          />
        </label>

        <button
          type="button"
          aria-label={
            t.type === "errands_groceries"
              ? errandRowOpen
                ? "Collapse stores and items"
                : "Expand stores and items"
              : expanded
                ? "Collapse description"
                : "Expand description"
          }
          aria-expanded={
            t.type === "errands_groceries" ? errandRowOpen : expanded
          }
          onClick={() =>
            t.type === "errands_groceries"
              ? setErrandRowOpen((v) => !v)
              : setExpanded((v) => !v)
          }
          className="shrink-0 rounded p-1 text-muted-foreground hover:bg-muted"
        >
          {t.type === "errands_groceries" ? (
            errandRowOpen ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )
          ) : expanded ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
        </button>
          </>
        }
        primary={
          <InlineText
            value={t.title}
            onCommit={(next) => onUpdate(t, { title: next })}
            ariaLabel="Edit task title"
            displayClassName={cn(
              "block min-w-0 truncate text-sm font-medium",
              isDone && "text-muted-foreground line-through",
            )}
          />
        }
        primaryTooltip={t.title}
        meta={
          childCount > 0 ||
          linkCount > 0 ||
          checklistCount > 0 ||
          errandItemCount > 0 ||
          linkedCount > 0 ||
          snoozed ||
          (typeof fileAttachCount === "number" && fileAttachCount > 0) ||
          t.ownership?.ownershipLine ? (
            <>
              {snoozed && typeof t.snoozedUntil === "number" && (
                <SnoozedBadge until={t.snoozedUntil} />
              )}
              {childCount > 0 && (
                <span
                  className="inline-flex items-center gap-1 whitespace-nowrap"
                  title={`${childDoneCount}/${childCount} subtasks done`}
                >
                  <ListTree className="h-3 w-3" />
                  {childDoneCount}/{childCount}
                </span>
              )}
              {checklistCount > 0 && (
                <span
                  className="inline-flex items-center gap-1 whitespace-nowrap"
                  title={`${checklistDone}/${checklistCount} checklist items done`}
                >
                  <ListChecks className="h-3 w-3" />
                  {checklistDone}/{checklistCount}
                </span>
              )}
              {errandItemCount > 0 && (
                <span
                  className="inline-flex items-center gap-1 whitespace-nowrap"
                  title={`${errandDone}/${errandItemCount} grocery/errand items checked`}
                >
                  <ShoppingCart className="h-3 w-3" />
                  {errandDone}/{errandItemCount}
                </span>
              )}
              {linkCount > 0 && (
                <span
                  className="inline-flex items-center gap-1 whitespace-nowrap"
                  title={`${linkCount} link(s)`}
                >
                  <LinkIcon className="h-3 w-3" />
                  {linkCount}
                </span>
              )}
              {linkedCount > 0 && (
                <span
                  className="inline-flex items-center gap-1 whitespace-nowrap"
                  title={`${linkedCount} linked task(s)`}
                >
                  <Network className="h-3 w-3" />
                  {linkedCount}
                </span>
              )}
              {typeof fileAttachCount === "number" && fileAttachCount > 0 && (
                <span
                  className="inline-flex items-center gap-1 whitespace-nowrap"
                  title={`${fileAttachCount} file(s) attached — open task to manage`}
                >
                  <Paperclip className="h-3 w-3" aria-hidden />
                  {fileAttachCount}
                </span>
              )}
              {t.ownership?.ownershipLine ? (
                <span
                  className="truncate"
                  title={t.ownership.ownershipLine}
                >
                  {t.ownership.ownershipLine}
                </span>
              ) : null}
            </>
          ) : null
        }
        trailing={
          <>
          <InlineDate
            value={t.dueDate ?? null}
            onCommit={(next) =>
              onUpdate(t, { dueDate: next === null ? undefined : next })
            }
            ariaLabel="Edit due date"
            placeholder="Set due"
            showRelative
            displayClassName={cn(
              "min-w-[120px] text-xs",
              overdue && "font-medium text-destructive"
            )}
          />
          <InlineSelect
            value={t.type}
            options={TYPE_OPTIONS}
            onCommit={(next) =>
              onUpdate(t, { type: next as TaskType })
            }
            ariaLabel="Change type"
            asBadge
          />
          <InlineSelect
            value={t.category}
            options={CATEGORY_OPTIONS}
            onCommit={(next) =>
              onUpdate(t, { category: next as TaskCategory })
            }
            ariaLabel="Change category"
            displayClassName="min-w-[80px] text-xs"
            selectClassName="text-xs"
          />
        {t.assigneeId && (
          <span
            className="inline-flex shrink-0 items-center gap-1 rounded-full border border-border bg-background px-2 py-0.5 text-[11px] font-medium text-muted-foreground"
            title={`Assigned to ${assigneeLabel ? assigneeLabel(t.assigneeId) : t.assigneeId}`}
          >
            <User className="h-3 w-3" />
            {assigneeLabel ? assigneeLabel(t.assigneeId) : t.assigneeId}
          </span>
        )}
          <InlineSelect
            value={String(bucketQuadrant(t.quadrant))}
            options={QUADRANT_OPTIONS}
            onCommit={(next) => onUpdate(t, { quadrant: Number(next) })}
            ariaLabel="Change quadrant"
            displayClassName="min-w-[40px] text-xs"
            selectClassName="text-xs"
          />
        <SnoozeMenu
          snoozedUntil={t.snoozedUntil}
          onSnooze={(until) => onSnooze(t._id, until)}
          onWake={() => onWake(t._id)}
          stopPropagation
        />
          </>
        }
        actions={
          <ActionSuite aria-label="Task row actions">
            <ActionSuiteIconButton
              tooltip="Open task details"
              testId={`task-open-${t._id}`}
              onClick={() => onOpenDrawer(t._id)}
            >
              <Pencil className="h-4 w-4" aria-hidden />
            </ActionSuiteIconButton>
            <ActionSuiteIconButton
              tooltip={actionTitle("Delete task")}
              testId={`task-delete-${t._id}`}
              disabled={rowBusy}
              destructive
              onClick={() => onDelete(t)}
            >
              <Trash2 className="h-4 w-4" aria-hidden />
            </ActionSuiteIconButton>
          </ActionSuite>
        }
      />

      {showErrandBody ? (
        <div className="mt-2 max-h-[min(70vh,520px)] overflow-y-auto overflow-x-hidden max-md:ml-0 md:ml-12">
          <ErrandListInline
            locations={t.errandLocations}
            expanded={errandDetailExpanded}
            onExpandedChange={setErrandDetailExpanded}
            collapsedStoreIds={errandCollapsedStores}
            onToggleStoreCollapse={toggleErrandStoreCollapse}
            disabled={rowBusy}
            onCommit={(next) =>
              void onUpdate(t, {
                errandLocations:
                  next && next.length > 0 ? next : [],
              })
            }
          />
        </div>
      ) : showDescription ? (
        <div className="mt-2 max-md:ml-0 md:ml-12">
          <InlineTextarea
            value={t.description ?? ""}
            onCommit={(next) =>
              onUpdate(t, { description: next || undefined })
            }
            placeholder="Add description"
            ariaLabel="Edit description"
            rows={2}
          />
        </div>
      ) : null}
    </li>
  );
}

function TasksPageInner() {
  const { confirm } = useOperationalConfirm();
  const { activeOrganizationId } = useOrgPermissions();
  const actorKeyRaw = useActorUserKey();
  const actorUserKey = actorKeyRaw.trim() || undefined;
  const orgConvexArgs = useOrgConvexQueryArgs();
  const { labelFor: assigneeLabel } = useOrgMemberDisplayLabel(
    activeOrganizationId,
    actorUserKey,
  );
  const searchParams = useSearchParams();
  const taskListQueries = useMemo((): RequestForQueries => {
    if (!orgConvexArgs) return {};
    return {
      tasksAll: { query: api.tasks.getAll, args: orgConvexArgs },
    };
  }, [orgConvexArgs]);

  const taskListResults = useQueries(taskListQueries);
  const tasksRaw = orgConvexArgs ? taskListResults.tasksAll : undefined;
  const tasksQueryError =
    tasksRaw instanceof Error &&
    tasksRaw.message !== "Unauthorized" &&
    orgConvexArgs
      ? tasksRaw
      : null;
  const tasks = tasksRaw instanceof Error ? undefined : tasksRaw;

  useEffect(() => {
    if (!tasksQueryError) return;
    appendPriorityDebugClientLog({
      sessionId: "f25461",
      runId: "tasks-getAll",
      hypothesisId: "H_tasks_getAll_fail",
      location: "tasks/page.tsx:tasksAll",
      message: tasksQueryError.message,
      data: {
        name: tasksQueryError.name,
        stack: tasksQueryError.stack?.slice(0, 500) ?? null,
      },
      timestamp: Date.now(),
    });
  }, [tasksQueryError]);

  const { canUseHub, actionTitle } = useLiveConnection();
  const tasksSnapKey = useMemo(() => tasksListSnapshotKey(), []);
  const [cachedTasks, setCachedTasks] = useState<Doc<"tasks">[] | undefined>(
    undefined,
  );
  const [tasksCacheReady, setTasksCacheReady] = useState(true);

  useEffect(() => {
    if (canUseHub) {
      setTasksCacheReady(true);
    } else {
      setTasksCacheReady(false);
    }
  }, [canUseHub]);

  useEffect(() => {
    if (canUseHub && tasks !== undefined) {
      void persistQuerySnapshot(tasksSnapKey, tasks);
    }
  }, [canUseHub, tasks, tasksSnapKey]);

  useEffect(() => {
    if (canUseHub) {
      setCachedTasks(undefined);
      return;
    }
    let cancelled = false;
    void loadQuerySnapshot<Doc<"tasks">[]>(tasksSnapKey).then((r) => {
      if (!cancelled) {
        setCachedTasks(r ?? []);
        setTasksCacheReady(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [canUseHub, tasksSnapKey]);

  const create = useMutation(api.tasks.create);
  const update = useMutation(api.tasks.update);
  const remove = useMutation(api.tasks.remove);
  const setQuadrant = useMutation(api.tasks.setQuadrant);
  const reorderInQuadrant = useMutation(api.tasks.reorderInQuadrant);
  const snoozeTask = useMutation(api.tasks.snooze);
  const wakeTask = useMutation(api.tasks.wake);

  const [newTitle, setNewTitle] = useState("");
  const [newType, setNewType] = useState<TaskType>(DEFAULT_TYPE);
  const [newCategory, setNewCategory] =
    useState<TaskCategory>(DEFAULT_CATEGORY);
  const [newQuadrant, setNewQuadrant] = useState<QuadrantN>(DEFAULT_QUADRANT);
  const [newDue, setNewDue] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [updatingId, setUpdatingId] = useState<Id<"tasks"> | null>(null);
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [categoryFilter, setCategoryFilter] = useState<"all" | TaskCategory>(
    "all"
  );
  const [assigneeFilter, setAssigneeFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [dueTodayOnly, setDueTodayOnly] = useState(false);
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [showDone, setShowDone] = useState(false);
  const [snoozeFilter, setSnoozeFilter] = useState<SnoozeFilter>("hide");
  const [view, setView] = useState<ViewMode>("matrix");
  const [taskCopyState, setTaskCopyState] = useState<"idle" | "ok" | "err">(
    "idle"
  );
  const [taskExportBusy, setTaskExportBusy] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Id<"tasks">[]>([]);
  const [selectionCopyState, setSelectionCopyState] = useState<
    "idle" | "ok" | "err"
  >("idle");
  const [printHint, setPrintHint] = useState<"none" | "blocked">("none");
  const [shareSupported, setShareSupported] = useState(false);

  // Matrix-only layout prefs (sort, density, focus, collapsed Qs).
  // Hydrated from localStorage on mount and re-persisted on every change.
  const [matrixPrefs, setMatrixPrefs] = useState<MatrixPrefs>(
    DEFAULT_MATRIX_PREFS
  );
  useEffect(() => {
    setMatrixPrefs(loadMatrixPrefs());
  }, []);
  useEffect(() => {
    setShareSupported(
      typeof navigator !== "undefined" &&
        typeof navigator.share === "function"
    );
  }, []);
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(
        MATRIX_PREFS_KEY,
        JSON.stringify(matrixPrefs)
      );
    } catch {
      /* storage might be full / disabled — silently ignore */
    }
  }, [matrixPrefs]);
  const { sortMode, density, quadrantFocus, collapsedQs } = matrixPrefs;
  const setSortMode = useCallback(
    (next: SortMode) =>
      setMatrixPrefs((p) => ({ ...p, sortMode: next })),
    []
  );
  const setDensity = useCallback(
    (next: Density) => setMatrixPrefs((p) => ({ ...p, density: next })),
    []
  );
  const setQuadrantFocus = useCallback(
    (next: QuadrantFocus) =>
      setMatrixPrefs((p) => ({ ...p, quadrantFocus: next })),
    []
  );
  const toggleQuadrantCollapsed = useCallback(
    (q: QuadrantN) =>
      setMatrixPrefs((p) => ({
        ...p,
        collapsedQs: p.collapsedQs.includes(q)
          ? p.collapsedQs.filter((x) => x !== q)
          : [...p.collapsedQs, q],
      })),
    []
  );
  const expandAllQuadrants = useCallback(
    () => setMatrixPrefs((p) => ({ ...p, collapsedQs: [] })),
    []
  );
  const collapseAllQuadrants = useCallback(
    () => setMatrixPrefs((p) => ({ ...p, collapsedQs: [...QUADRANTS] })),
    []
  );

  const [draggingId, setDraggingId] = useState<Id<"tasks"> | null>(null);
  const [dragOverQ, setDragOverQ] = useState<QuadrantN | null>(null);
  const [reorderHoverId, setReorderHoverId] =
    useState<Id<"tasks"> | null>(null);
  const [openTaskId, setOpenTaskId] = useState<Id<"tasks"> | null>(null);

  useEffect(() => {
    const t = searchParams.get("task")?.trim();
    if (t) setOpenTaskId(t as Id<"tasks">);
  }, [searchParams]);


  // Daily plan: top-3 ids pinned for *today*, persisted in localStorage.
  // Resets automatically when the date rolls over.
  const todayKey = dayKey();
  const planStorageKey = `tasks.dailyPlan.${todayKey}`;
  const [todayPlan, setTodayPlan] = useState<Id<"tasks">[]>([]);
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(planStorageKey);
      if (!raw) {
        setTodayPlan([]);
        return;
      }
      const parsed = parseJsonUnknown(raw);
      if (
        Array.isArray(parsed) &&
        parsed.every((x) => typeof x === "string" && x.length > 0)
      ) {
        setTodayPlan(parsed as Id<"tasks">[]);
      }
    } catch {
      setTodayPlan([]);
    }
  }, [planStorageKey]);
  const setTodayPlanPersisted = useCallback(
    (next: Id<"tasks">[]) => {
      setTodayPlan(next);
      if (typeof window === "undefined") return;
      try {
        window.localStorage.setItem(planStorageKey, JSON.stringify(next));
      } catch {
        /* storage might be full / disabled — silently ignore */
      }
    },
    [planStorageKey]
  );
  const togglePlan = useCallback(
    (id: Id<"tasks">) => {
      setTodayPlanPersisted(
        todayPlan.includes(id)
          ? todayPlan.filter((x) => x !== id)
          : [...todayPlan, id].slice(0, 5)
      );
    },
    [todayPlan, setTodayPlanPersisted]
  );

  const listLoading = canUseHub
    ? !tasksQueryError && tasks === undefined
    : !tasksCacheReady;
  const allRows: Doc<"tasks">[] = useMemo(
    () => tasks ?? cachedTasks ?? [],
    [tasks, cachedTasks],
  );
  const empty = !listLoading && allRows.length === 0;

  useEffect(() => {
    const valid = new Set(allRows.map((t) => String(t._id)));
    setSelectedIds((prev) => prev.filter((id) => valid.has(String(id))));
  }, [allRows]);

  const filteredRows = useMemo(
    () =>
      applyTaskFilters(
        allRows,
        typeFilter,
        categoryFilter,
        assigneeFilter,
        searchQuery,
        dueTodayOnly,
        overdueOnly,
        showDone,
        snoozeFilter
      ),
    [
      allRows,
      typeFilter,
      categoryFilter,
      assigneeFilter,
      searchQuery,
      dueTodayOnly,
      overdueOnly,
      showDone,
      snoozeFilter,
    ]
  );

  const selectedSet = useMemo(
    () => new Set(selectedIds.map(String)),
    [selectedIds]
  );

  const selectedTasksOrdered = useMemo(() => {
    const map = new Map(allRows.map((t) => [String(t._id), t] as const));
    const out: Doc<"tasks">[] = [];
    for (const id of selectedIds) {
      const row = map.get(String(id));
      if (row) out.push(row);
    }
    return out;
  }, [allRows, selectedIds]);

  const selectedCount = selectedTasksOrdered.length;

  const clearSelection = useCallback(() => setSelectedIds([]), []);

  const taskExportTags = useMemo(
    () =>
      [
        `view-${view}`,
        typeFilter !== "all" ? typeFilter : "",
        categoryFilter !== "all" ? categoryFilter : "",
        assigneeFilter !== "all"
          ? assigneeFilter === "__none__"
            ? "unassigned"
            : "assignee"
          : "",
        searchQuery.trim() ? "search" : "",
        dueTodayOnly ? "due-today" : "",
        overdueOnly ? "overdue" : "",
        showDone ? "with-done" : "",
        snoozeFilter !== "hide" ? `snooze-${snoozeFilter}` : "",
      ].filter(Boolean),
    [
      view,
      typeFilter,
      categoryFilter,
      assigneeFilter,
      searchQuery,
      dueTodayOnly,
      overdueOnly,
      showDone,
      snoozeFilter,
    ]
  );

  const copyTasksTsv = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(buildTasksTsv(filteredRows));
      setTaskCopyState("ok");
      window.setTimeout(() => setTaskCopyState("idle"), 1800);
    } catch {
      setTaskCopyState("err");
      window.setTimeout(() => setTaskCopyState("idle"), 2400);
    }
  }, [filteredRows]);

  const exportTasksCsv = useCallback(() => {
    setTaskExportBusy(true);
    try {
      downloadTextFile(
        buildExportFilename("tasks", "csv", taskExportTags),
        buildTasksCsv(filteredRows),
        "text/csv;charset=utf-8",
        { utf8Bom: true }
      );
    } finally {
      setTaskExportBusy(false);
    }
  }, [filteredRows, taskExportTags]);

  const exportTasksTsv = useCallback(() => {
    setTaskExportBusy(true);
    try {
      downloadTextFile(
        buildExportFilename("tasks", "tsv", taskExportTags),
        buildTasksTsv(filteredRows),
        "text/tab-separated-values;charset=utf-8",
        { utf8Bom: false }
      );
    } finally {
      setTaskExportBusy(false);
    }
  }, [filteredRows, taskExportTags]);

  const exportTasksJson = useCallback(() => {
    setTaskExportBusy(true);
    try {
      downloadTextFile(
        buildExportFilename("tasks", "json", taskExportTags),
        buildTasksJson(filteredRows),
        "application/json;charset=utf-8",
        { utf8Bom: false }
      );
    } finally {
      setTaskExportBusy(false);
    }
  }, [filteredRows, taskExportTags]);

  const overdueCount = useMemo(
    () => allRows.filter(isOverdue).length,
    [allRows]
  );

  const snoozedCount = useMemo(
    () => allRows.filter((t) => isSnoozed(t)).length,
    [allRows]
  );

  // Distinct assignee ids for the filter dropdown
  const assignees = useMemo(() => {
    const s = new Set<string>();
    for (const t of allRows) {
      if (t.assigneeId) s.add(t.assigneeId);
    }
    return Array.from(s).sort();
  }, [allRows]);

  // ---------- View-specific row sets ----------

  const todayRows = useMemo(() => {
    return filteredRows
      .filter((t) => {
        if (t.parentTaskId) return false;
        if (t.status === "done" && !showDone) return false;
        if (isOverdue(t)) return true;
        if (t.dueDate != null && isSameLocalDay(t.dueDate)) return true;
        if (t.startDate != null && isSameLocalDay(t.startDate)) return true;
        return false;
      })
      .sort(sortByPriority);
  }, [filteredRows, showDone]);

  const weekRows = useMemo(() => {
    return filteredRows
      .filter((t) => {
        if (t.parentTaskId) return false;
        if (t.status === "done" && !showDone) return false;
        return isInThisWeek(t) || isOverdue(t);
      })
      .sort(sortByPriority);
  }, [filteredRows, showDone]);

  const longTermRows = useMemo(() => {
    return filteredRows
      .filter((t) => {
        if (t.parentTaskId) return false;
        if (t.status === "done" && !showDone) return false;
        return isLongTerm(t);
      })
      .sort(sortByPriority);
  }, [filteredRows, showDone]);

  const planRows = useMemo(() => {
    const map = new Map(allRows.map((t) => [String(t._id), t] as const));
    const out: Doc<"tasks">[] = [];
    for (const id of todayPlan) {
      const t = map.get(String(id));
      if (t) out.push(t);
    }
    return out;
  }, [allRows, todayPlan]);

  const attachmentCountTaskIds = useMemo(() => {
    const s = new Set<string>();
    for (const t of filteredRows) s.add(String(t._id));
    for (const t of planRows) s.add(String(t._id));
    return [...s].map((id) => id as Id<"tasks">);
  }, [filteredRows, planRows]);

  const attachmentQueries = useMemo((): RequestForQueries => {
    if (attachmentCountTaskIds.length === 0 || !orgConvexArgs) return {};
    return {
      attachmentCounts: {
        query: api.tasks.countTaskFilesForTasks,
        args: { taskIds: attachmentCountTaskIds, ...orgConvexArgs },
      },
    };
  }, [attachmentCountTaskIds, orgConvexArgs]);

  const attachmentResults = useQueries(attachmentQueries);
  const attachmentCountsRaw =
    attachmentCountTaskIds.length > 0 && orgConvexArgs
      ? attachmentResults.attachmentCounts
      : undefined;
  const attachmentCounts =
    attachmentCountTaskIds.length === 0
      ? undefined
      : attachmentCountsRaw instanceof Error
        ? undefined
        : attachmentCountsRaw;

  // Subtasks indexed by parent (computed across the whole task list, not the
  // filtered view, so a hidden subtask still contributes to the parent count
  // even when "show completed" is off).
  const childrenByParent = useMemo(() => {
    const m = new Map<string, Doc<"tasks">[]>();
    for (const t of allRows) {
      if (!t.parentTaskId) continue;
      const k = String(t.parentTaskId);
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(t);
    }
    return m;
  }, [allRows]);

  const selectionCheckboxById = useMemo(
    () => buildSelectionCheckboxById(allRows, selectedSet, childrenByParent),
    [allRows, selectedSet, childrenByParent]
  );

  const toggleSelect = useCallback(
    (id: Id<"tasks">) => {
      setSelectedIds((prev) => {
        const prevSet = new Set(prev.map(String));
        const subtree = collectSubtreeTaskIds(id, childrenByParent);
        const subtreeSet = new Set(subtree.map(String));
        const fullySelected = subtree.every((sid) =>
          prevSet.has(String(sid))
        );
        if (fullySelected) {
          return prev.filter((x) => !subtreeSet.has(String(x)));
        }
        const merged = new Set(prev.map(String));
        const order: Id<"tasks">[] = [...prev];
        for (const sid of subtree) {
          if (!merged.has(String(sid))) {
            merged.add(String(sid));
            order.push(sid);
          }
        }
        return order;
      });
    },
    [childrenByParent]
  );

  const selectAllVisible = useCallback(() => {
    const order: Id<"tasks">[] = [];
    const seen = new Set<string>();
    for (const t of filteredRows) {
      const sub = collectSubtreeTaskIds(t._id, childrenByParent);
      for (const id of sub) {
        const k = String(id);
        if (!seen.has(k)) {
          seen.add(k);
          order.push(id);
        }
      }
    }
    setSelectedIds(order);
  }, [filteredRows, childrenByParent]);

  const matrixSorter = useMemo(() => makeSorter(sortMode), [sortMode]);

  // Group filtered top-level tasks by quadrant (parents only). Children are
  // looked up at render time so they always sit directly under their parent.
  const byQuadrant = useMemo(() => {
    const m: Record<QuadrantN, Doc<"tasks">[]> = {
      1: [],
      2: [],
      3: [],
      4: [],
    };
    for (const t of filteredRows) {
      if (t.parentTaskId) continue; // children render under their parent
      m[bucketQuadrant(t.quadrant)].push(t);
    }
    for (const q of QUADRANTS) {
      m[q].sort((a, b) => compareQuadrantPositionThen(a, b, matrixSorter));
    }
    return m;
  }, [filteredRows, matrixSorter]);

  // Also: if a child slipped into the filtered set but its parent didn't
  // (e.g. parent is completed and "show completed" is off), surface it as
  // a top-level row so it doesn't disappear.
  const orphanChildrenByQuadrant = useMemo(() => {
    const filteredIds = new Set(filteredRows.map((t) => t._id));
    const m: Record<QuadrantN, Doc<"tasks">[]> = {
      1: [],
      2: [],
      3: [],
      4: [],
    };
    for (const t of filteredRows) {
      if (!t.parentTaskId) continue;
      if (filteredIds.has(t.parentTaskId)) continue; // parent visible → handled
      m[bucketQuadrant(t.quadrant)].push(t);
    }
    for (const q of QUADRANTS) {
      m[q].sort((a, b) => compareQuadrantPositionThen(a, b, matrixSorter));
    }
    return m;
  }, [filteredRows, matrixSorter]);

  const selectAllInQuadrant = useCallback(
    (q: QuadrantN) => {
      const parents = byQuadrant[q];
      const orphans = orphanChildrenByQuadrant[q];
      const roots = [...parents, ...orphans];
      setSelectedIds((prev) => {
        const merged = new Set(prev.map(String));
        const order: Id<"tasks">[] = [...prev];
        for (const t of roots) {
          for (const id of collectSubtreeTaskIds(t._id, childrenByParent)) {
            if (!merged.has(String(id))) {
              merged.add(String(id));
              order.push(id);
            }
          }
        }
        return order;
      });
    },
    [byQuadrant, orphanChildrenByQuadrant, childrenByParent]
  );

  /** Same roots as select-all; removes entire subtrees from selection only. */
  const unselectAllInQuadrant = useCallback(
    (q: QuadrantN) => {
      const parents = byQuadrant[q];
      const orphans = orphanChildrenByQuadrant[q];
      const roots = [...parents, ...orphans];
      const remove = new Set<string>();
      for (const t of roots) {
        for (const id of collectSubtreeTaskIds(t._id, childrenByParent)) {
          remove.add(String(id));
        }
      }
      setSelectedIds((prev) => prev.filter((id) => !remove.has(String(id))));
    },
    [byQuadrant, orphanChildrenByQuadrant, childrenByParent]
  );

  const printSelected = useCallback(() => {
    if (selectedTasksOrdered.length === 0) return;
    const ok = printTasksInNewWindow(selectedTasksOrdered);
    if (!ok) {
      setPrintHint("blocked");
      window.setTimeout(() => setPrintHint("none"), 5000);
    }
  }, [selectedTasksOrdered]);

  const copySelectedTasksPlain = useCallback(async () => {
    const text = formatSelectedTasksPlainText(selectedTasksOrdered);
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setSelectionCopyState("ok");
      window.setTimeout(() => setSelectionCopyState("idle"), 1800);
    } catch {
      setSelectionCopyState("err");
      window.setTimeout(() => setSelectionCopyState("idle"), 2400);
    }
  }, [selectedTasksOrdered]);

  const shareSelectedTasks = useCallback(async () => {
    const text = formatSelectedTasksPlainText(selectedTasksOrdered);
    if (!text || typeof navigator === "undefined" || !navigator.share) return;
    try {
      await navigator.share({ title: "Selected tasks", text });
    } catch (e) {
      const name = e instanceof Error ? e.name : "";
      if (name !== "AbortError") console.error(e);
    }
  }, [selectedTasksOrdered]);

  // Visible quadrants honor the focus filter (so user can drill into one Q).
  const visibleQuadrants = useMemo<readonly QuadrantN[]>(
    () =>
      quadrantFocus === "all"
        ? QUADRANTS
        : ([quadrantFocus] as const),
    [quadrantFocus]
  );

  const updateTask: TaskUpdater = useCallback(
    async (t, patch) => {
      if (!canUseHub || !orgConvexArgs) return;
      setUpdatingId(t._id);
      try {
        await update({
          id: t._id,
          ...orgConvexArgs,
          title: patch.title ?? t.title,
          description:
            "description" in patch ? patch.description : t.description,
          type: (patch.type ?? t.type) as TaskType,
          category: (patch.category ?? t.category) as TaskCategory,
          quadrant: patch.quadrant ?? t.quadrant,
          quadrantPosition:
            patch.quadrantPosition !== undefined
              ? patch.quadrantPosition
              : t.quadrantPosition,
          status: (patch.status ?? t.status) as Doc<"tasks">["status"],
          priority: patch.priority ?? t.priority,
          dueDate: "dueDate" in patch ? patch.dueDate : t.dueDate,
          startDate:
            "startDate" in patch ? patch.startDate : t.startDate,
          parentTaskId:
            "parentTaskId" in patch ? patch.parentTaskId : t.parentTaskId,
          relatedFileId:
            "relatedFileId" in patch ? patch.relatedFileId : t.relatedFileId,
          links: "links" in patch ? patch.links : t.links,
          linkedTaskIds:
            "linkedTaskIds" in patch ? patch.linkedTaskIds : t.linkedTaskIds,
          checklist: "checklist" in patch ? patch.checklist : t.checklist,
          errandLocations:
            "errandLocations" in patch
              ? patch.errandLocations
              : t.errandLocations,
          ...(actorUserKey ? { actorUserKey } : {}),
        });
      } finally {
        setUpdatingId(null);
      }
    },
    [canUseHub, update, actorUserKey, orgConvexArgs]
  );

  const toggleDone = useCallback(
    (t: Doc<"tasks">) => {
      const next: Doc<"tasks">["status"] =
        t.status === "done" ? "todo" : "done";
      void updateTask(t, { status: next });
    },
    [updateTask]
  );

  const deleteTask = useCallback(
    async (t: Doc<"tasks">) => {
      if (!canUseHub || !orgConvexArgs) return;
      const ok = await confirm({
        ...simpleDeleteConfirm(t.title, {
          title: "Delete task",
          impact: "This cannot be undone.",
        }),
      });
      if (!ok) return;
      setUpdatingId(t._id);
      try {
        await remove({
          id: t._id,
          ...orgConvexArgs,
          ...(actorUserKey ? { actorUserKey } : {}),
        });
      } finally {
        setUpdatingId(null);
      }
    },
    [canUseHub, remove, actorUserKey, orgConvexArgs, confirm]
  );

  const onSnooze = useCallback(
    async (id: Id<"tasks">, until: number) => {
      if (!canUseHub || !orgConvexArgs) return;
      setUpdatingId(id);
      try {
        await snoozeTask({ id, until, ...orgConvexArgs });
      } finally {
        setUpdatingId(null);
      }
    },
    [canUseHub, snoozeTask, orgConvexArgs]
  );

  const onWake = useCallback(
    async (id: Id<"tasks">) => {
      if (!canUseHub || !orgConvexArgs) return;
      setUpdatingId(id);
      try {
        await wakeTask({ id, ...orgConvexArgs });
      } finally {
        setUpdatingId(null);
      }
    },
    [canUseHub, wakeTask, orgConvexArgs]
  );

  const submitNewTask = useCallback(async () => {
    const t = newTitle.trim();
    if (!t || !canUseHub || !orgConvexArgs) return;
    const dueMs = (() => {
      if (!newDue) return undefined;
      const [y, m, d] = newDue.split("-").map((p) => parseInt(p, 10));
      if (!y || !m || !d) return undefined;
      return new Date(y, m - 1, d).getTime();
    })();
    setSaving(true);
    try {
      await create({
        title: t,
        type: newType,
        status: DEFAULT_STATUS,
        quadrant: newQuadrant,
        category: newCategory,
        priority: DEFAULT_PRIORITY,
        dueDate: dueMs,
        ...orgConvexArgs,
        ...(actorUserKey ? { actorUserKey } : {}),
      });
      setNewTitle("");
    } finally {
      setSaving(false);
    }
  }, [newTitle, newType, newCategory, newQuadrant, newDue, canUseHub, create, actorUserKey, orgConvexArgs]);

  async function handleAddTask(e: React.FormEvent) {
    e.preventDefault();
    await submitNewTask();
  }

  const onTitleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      void submitNewTask();
    }
  };

  // ---------- DnD handlers ----------

  const handleDragStart = useCallback(
    (e: React.DragEvent, t: Doc<"tasks">) => {
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData(DRAG_MIME, t._id);
      e.dataTransfer.setData("text/plain", t._id);
      setDraggingId(t._id);
    },
    []
  );

  const handleDragEnd = useCallback(() => {
    setDraggingId(null);
    setDragOverQ(null);
    setReorderHoverId(null);
  }, []);

  const handleMatrixRowDragOver = useCallback(
    (e: React.DragEvent, target: Doc<"tasks">, q: QuadrantN) => {
      if (!draggingId) return;
      const dragged = allRows.find((x) => x._id === draggingId);
      if (!dragged || dragged.parentTaskId || target.parentTaskId) return;
      if (
        bucketQuadrant(dragged.quadrant) !== q ||
        bucketQuadrant(target.quadrant) !== q
      ) {
        return;
      }
      if (dragged._id === target._id) return;
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = "move";
      setReorderHoverId(target._id);
    },
    [allRows, draggingId]
  );

  const handleMatrixRowDragLeave = useCallback(
    (e: React.DragEvent, target: Doc<"tasks">) => {
      const rel = e.relatedTarget as Node | null;
      if (rel && (e.currentTarget as HTMLElement).contains(rel)) return;
      setReorderHoverId((cur) => (cur === target._id ? null : cur));
    },
    []
  );

  const handleMatrixRowDrop = useCallback(
    async (e: React.DragEvent, target: Doc<"tasks">, q: QuadrantN) => {
      e.preventDefault();
      e.stopPropagation();
      const dragId = readDragId(e);
      setReorderHoverId(null);
      setDragOverQ(null);
      setDraggingId(null);
      if (!dragId || !canUseHub || !orgConvexArgs) return;
      if (dragId === target._id) return;
      const dragged = allRows.find((x) => x._id === dragId);
      if (!dragged || dragged.parentTaskId || target.parentTaskId) return;
      if (
        bucketQuadrant(dragged.quadrant) !== q ||
        bucketQuadrant(target.quadrant) !== q
      ) {
        return;
      }
      const parents = byQuadrant[q];
      const ids = parents.map((t) => t._id);
      const from = ids.indexOf(dragId);
      const to = ids.indexOf(target._id);
      if (from < 0 || to < 0) return;
      const next = [...ids];
      next.splice(from, 1);
      const newTo = next.indexOf(target._id);
      next.splice(newTo, 0, dragId);
      try {
        await reorderInQuadrant({ orderedParentIds: next, ...orgConvexArgs });
      } catch (err) {
        console.error("Failed to reorder tasks", err);
      }
    },
    [allRows, byQuadrant, canUseHub, reorderInQuadrant, orgConvexArgs]
  );

  const handleDrop = useCallback(
    async (e: React.DragEvent, target: QuadrantN) => {
      e.preventDefault();
      const id = readDragId(e);
      setDragOverQ(null);
      setDraggingId(null);
      setReorderHoverId(null);
      if (!id || !canUseHub || !orgConvexArgs) return;
      const row = allRows.find((t) => t._id === id);
      if (!row || row.quadrant === target) return;
      try {
        await setQuadrant({ id, quadrant: target, ...orgConvexArgs });
      } catch (err) {
        console.error("Failed to move task", err);
      }
    },
    [allRows, canUseHub, setQuadrant, orgConvexArgs]
  );

  const selectionListEnabled = !listLoading && !empty;

  const activeFilterCount = useMemo(
    () =>
      countActiveTaskFilters({
        typeFilter,
        categoryFilter,
        assigneeFilter,
        dueTodayOnly,
        overdueOnly,
        showDone,
        snoozeFilter,
      }),
    [
      typeFilter,
      categoryFilter,
      assigneeFilter,
      dueTodayOnly,
      overdueOnly,
      showDone,
      snoozeFilter,
    ]
  );

  return (
    <div className="space-y-3">
      <OperationalOrientationStrip
        suppressScopeWhenMode
        modeLabel="Tasks"
        data-testid="tasks-orientation"
      />
      {tasksQueryError ? (
        <div
          className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm"
          role="alert"
        >
          <p className="font-medium text-destructive">Could not load tasks</p>
          <p className="mt-2 text-muted-foreground">
            {tasksQueryError.message}. You can retry after checking your
            connection or wait for Convex to recover. Cached tasks may appear
            below if you were offline earlier.
          </p>
        </div>
      ) : null}
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-lg font-semibold md:text-xl">Tasks</h1>
        {actorUserKey ? (
          <TaskNotificationsBell
            userKey={actorUserKey}
            onOpenTask={(id) => setOpenTaskId(id)}
            className="shrink-0"
          />
        ) : null}
      </div>

      <form
        onSubmit={handleAddTask}
        className="flex flex-col gap-1.5 rounded-lg border border-border/80 bg-muted/20 px-2 py-2 sm:flex-row sm:flex-wrap sm:items-center"
      >
        <Input
          placeholder="What needs to be done?"
          className="min-w-[12rem] flex-1"
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          onKeyDown={onTitleKeyDown}
          disabled={!canUseHub || saving}
          autoComplete="off"
          aria-label="New task title"
        />
        <Select
          value={newType}
          onChange={(e) => setNewType(e.target.value as TaskType)}
          aria-label="New task type"
          className="w-auto min-w-[6.5rem]"
        >
          {TASK_TYPES.map((t) => (
            <option key={t} value={t}>
              {labelTaskType(t)}
            </option>
          ))}
        </Select>
        <Select
          value={newCategory}
          onChange={(e) => setNewCategory(e.target.value as TaskCategory)}
          aria-label="New task category"
          className="w-auto min-w-[6.5rem]"
        >
          {TASK_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {labelCategory(c)}
            </option>
          ))}
        </Select>
        <Select
          value={String(newQuadrant)}
          onChange={(e) =>
            setNewQuadrant(Number(e.target.value) as QuadrantN)
          }
          aria-label="New task quadrant"
          className="w-auto min-w-[5rem]"
        >
          {QUADRANTS.map((q) => (
            <option key={q} value={q}>
              Q{q}
            </option>
          ))}
        </Select>
        <input
          type="date"
          value={newDue}
          onChange={(e) => setNewDue(e.target.value)}
          aria-label="New task due date"
          className="h-9 rounded-md border bg-background px-2 text-sm shadow-sm"
        />
        <Button
          type="submit"
          variant="primary"
          disabled={!newTitle.trim() || !canUseHub || saving}
          title={actionTitle("Add task to the list")}
        >
          <Plus className="h-4 w-4" />
          {saving ? "Adding…" : "Add"}
        </Button>
      </form>

      {listLoading && (
        <div
          className="space-y-3"
          role="status"
          aria-busy="true"
          aria-label="Loading tasks"
        >
          <div className="h-4 w-40 max-w-full animate-pulse rounded bg-muted" />
          <div className="h-24 max-w-full animate-pulse rounded-lg border border-border/50 bg-muted/40" />
          <div className="h-36 max-w-full animate-pulse rounded-lg border border-border/40 bg-muted/25" />
          <p className="text-xs text-muted-foreground">Loading tasks…</p>
        </div>
      )}

      {empty && (
        <OperationalEmptyState
          title="No tasks yet"
          description="Add a task above — it appears in the matrix and stays linked to your pipeline work."
          data-testid="tasks-empty"
        />
      )}

      {!listLoading && !empty && (
        <div className="space-y-1">
          <div
            className="overflow-hidden rounded-lg border border-border/80 bg-muted/15"
            data-testid="tasks-toolbar-pinned"
          >
            <div
              className="flex min-w-0 flex-nowrap items-center gap-1.5 overflow-x-auto px-2 py-1.5"
              aria-label="Search and view mode"
            >
              <SearchField
                compact
                containerClassName="min-w-[9rem] flex-1 shrink-0 sm:max-w-[16rem]"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                aria-label="Search tasks"
                placeholder="Search tasks…"
              />
              <div
                className="flex shrink-0 items-center gap-1"
                role="group"
                aria-label="View mode"
              >
                {(Object.keys(VIEW_LABEL) as ViewMode[]).map((v) => (
                  <Button
                    key={v}
                    type="button"
                    size="sm"
                    variant={view === v ? "primary" : "outline"}
                    className="h-8 shrink-0 px-2.5 text-xs"
                    onClick={() => setView(v)}
                  >
                    {VIEW_LABEL[v]}
                  </Button>
                ))}
              </div>
            </div>

          {view === "matrix" && (
            <div
              className="flex flex-wrap items-center gap-1.5 border-t border-border/60 px-2 py-1"
              aria-label="Matrix controls"
              data-testid="tasks-matrix-controls"
            >
              <span className="text-xs font-medium text-muted-foreground">
                Focus:
              </span>
              <Button
                type="button"
                size="sm"
                variant={quadrantFocus === "all" ? "primary" : "outline"}
                onClick={() => setQuadrantFocus("all")}
              >
                All Q
              </Button>
              {QUADRANTS.map((q) => (
                <Button
                  key={q}
                  type="button"
                  size="sm"
                  variant={quadrantFocus === q ? "primary" : "outline"}
                  onClick={() => setQuadrantFocus(q)}
                  title={`Focus on Q${q} — ${QUADRANT_BLURB[q]}`}
                >
                  <span
                    className={cn(
                      "mr-1 inline-block h-2 w-2 rounded-full",
                      QUADRANT_BAR[q]
                    )}
                    aria-hidden
                  />
                  Q{q}
                </Button>
              ))}

              <span className="ml-2 text-xs font-medium text-muted-foreground">
                Sort:
              </span>
              <Select
                value={sortMode}
                onChange={(e) => setSortMode(e.target.value as SortMode)}
                aria-label="Sort tasks within each quadrant"
                className="w-auto min-w-[11rem]"
              >
                {(Object.keys(SORT_LABEL) as SortMode[]).map((s) => (
                  <option key={s} value={s}>
                    {SORT_LABEL[s]}
                  </option>
                ))}
              </Select>

              <span className="ml-2 text-xs font-medium text-muted-foreground">
                Density:
              </span>
              <Button
                type="button"
                size="sm"
                variant={density === "comfortable" ? "primary" : "outline"}
                onClick={() => setDensity("comfortable")}
                title="Roomy spacing — easier to scan"
              >
                Comfortable
              </Button>
              <Button
                type="button"
                size="sm"
                variant={density === "compact" ? "primary" : "outline"}
                onClick={() => setDensity("compact")}
                title="Tight spacing — more on screen at once"
              >
                Compact
              </Button>

              <div className="ml-auto flex items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={expandAllQuadrants}
                  disabled={collapsedQs.length === 0}
                  title="Expand every quadrant"
                >
                  <Maximize2 className="h-3.5 w-3.5" />
                  Expand all
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={collapseAllQuadrants}
                  disabled={collapsedQs.length === QUADRANTS.length}
                  title="Collapse every quadrant"
                >
                  <Minimize2 className="h-3.5 w-3.5" />
                  Collapse all
                </Button>
              </div>
            </div>
          )}
          </div>

          <div data-testid="tasks-toolbar-collapsible">
          <CollapsibleSection
            variant="card"
            defaultOpen={false}
            animated
            lazyMount={false}
            className="shadow-none"
            headerClassName="!py-2"
            title={
              <span className="flex items-center gap-2 normal-case tracking-normal text-sm">
                Filters &amp; export
                {activeFilterCount > 0 ? (
                  <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[11px] font-semibold text-primary">
                    {activeFilterCount} active
                  </span>
                ) : null}
              </span>
            }
            contentClassName="space-y-2 pt-0"
          >
            <div
              className="flex flex-col gap-2 sm:max-md:overflow-x-auto sm:max-md:pb-2"
              aria-label="Filter tasks"
            >
              <div className="-mx-0.5 flex min-w-0 flex-wrap items-center gap-2 sm:max-md:flex-nowrap sm:max-md:overflow-x-auto sm:max-md:px-0.5">
                <span className="shrink-0 text-xs font-medium text-muted-foreground">
                  Show:
                </span>
                {(
                  [
                    { key: "all" as const, label: "All types" },
                    { key: "work" as const, label: "Work" },
                    { key: "personal" as const, label: "Personal" },
                    {
                      key: "errands_groceries" as const,
                      label: "Errands / groceries",
                    },
                  ] as const
                ).map(({ key, label }) => (
                  <Button
                    key={key}
                    type="button"
                    size="sm"
                    variant={typeFilter === key ? "primary" : "outline"}
                    className={cn("min-w-0 shrink-0", "max-md:whitespace-nowrap")}
                    onClick={() => setTypeFilter(key)}
                  >
                    {label}
                  </Button>
                ))}
              </div>
              <div className="flex flex-col gap-2 md:flex-row md:flex-wrap md:items-center">
                <Select
                  value={categoryFilter}
                  onChange={(e) =>
                    setCategoryFilter(e.target.value as "all" | TaskCategory)
                  }
                  aria-label="Category filter"
                  className="w-auto min-w-[8rem]"
                >
                  <option value="all">All categories</option>
                  {TASK_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {labelCategory(c)}
                    </option>
                  ))}
                </Select>
                <Select
                  value={assigneeFilter}
                  onChange={(e) => setAssigneeFilter(e.target.value)}
                  aria-label="Assignee filter"
                  className="w-auto min-w-[8rem]"
                  disabled={assignees.length === 0}
                  title={
                    assignees.length === 0
                      ? "No assignees set yet — assign a task in its drawer first"
                      : undefined
                  }
                >
                  <option value="all">All assignees</option>
                  <option value="__none__">Unassigned</option>
                  {assignees.map((a) => (
                    <option key={a} value={a}>
                      {assigneeLabel(a)}
                    </option>
                  ))}
                </Select>
                <Button
                  type="button"
                  size="sm"
                  variant={dueTodayOnly ? "primary" : "outline"}
                  onClick={() => setDueTodayOnly((v) => !v)}
                >
                  Due today
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={overdueOnly ? "danger" : "outline"}
                  onClick={() => setOverdueOnly((v) => !v)}
                >
                  Overdue {overdueCount > 0 ? `(${overdueCount})` : ""}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={
                    snoozeFilter === "only"
                      ? "primary"
                      : snoozeFilter === "all"
                        ? "outline"
                        : "outline"
                  }
                  className={cn(
                    snoozeFilter === "all" &&
                      "border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100"
                  )}
                  onClick={() =>
                    setSnoozeFilter((v) =>
                      v === "hide" ? "only" : v === "only" ? "all" : "hide"
                    )
                  }
                  title={
                    snoozeFilter === "hide"
                      ? "Snoozed tasks are hidden — click to view only snoozed"
                      : snoozeFilter === "only"
                        ? "Showing only snoozed tasks — click to mix with active"
                        : "Showing snoozed alongside active — click to hide again"
                  }
                >
                  {snoozeFilter === "hide"
                    ? `Snoozed${snoozedCount > 0 ? ` (${snoozedCount})` : ""}`
                    : snoozeFilter === "only"
                      ? `Snoozed only${snoozedCount > 0 ? ` (${snoozedCount})` : ""}`
                      : `Including snoozed${snoozedCount > 0 ? ` (${snoozedCount})` : ""}`}
                </Button>
                <label className="inline-flex cursor-pointer select-none items-center gap-2 text-sm md:ml-auto">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-input accent-primary"
                    checked={showDone}
                    onChange={(e) => setShowDone(e.target.checked)}
                  />
                  Show completed
                </label>
              </div>
            </div>

            <div
              className="flex flex-wrap items-center gap-2 rounded-lg border border-border/60 bg-muted/10 p-3"
              aria-label="Select tasks for print or copy"
            >
              <span className="text-xs font-medium text-muted-foreground">
                Print selection:
              </span>
              <span className="text-xs text-muted-foreground">
                {selectedCount === 0
                  ? "No tasks selected — use checkboxes or Select all."
                  : `${selectedCount} task${selectedCount === 1 ? "" : "s"} selected`}
              </span>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={selectedCount === 0}
                onClick={clearSelection}
                title="Clear the current selection"
              >
                Clear selection
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={filteredRows.length === 0}
                onClick={selectAllVisible}
                title="Select every task that matches the current filters (all views)"
              >
                Select all visible
              </Button>
              <Button
                type="button"
                size="sm"
                variant="primary"
                disabled={selectedCount === 0}
                onClick={printSelected}
                title="Opens a print-friendly page — use the print dialog or Save as PDF"
              >
                <Printer className="h-4 w-4" />
                Print selected
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={selectedCount === 0}
                onClick={() => void copySelectedTasksPlain()}
                title="Copy a readable plain-text list to the clipboard"
              >
                {selectionCopyState === "ok" ? (
                  <Check className="h-4 w-4" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
                {selectionCopyState === "ok"
                  ? "Copied"
                  : selectionCopyState === "err"
                    ? "Copy failed"
                    : "Copy as text"}
              </Button>
              {shareSupported && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={selectedCount === 0}
                  onClick={() => void shareSelectedTasks()}
                  title="Share selected tasks using the device share sheet"
                >
                  <Share2 className="h-4 w-4" />
                  Share
                </Button>
              )}
              {printHint === "blocked" && (
                <span
                  className="text-xs text-amber-700 dark:text-amber-400"
                  role="status"
                >
                  Pop-up blocked — allow pop-ups for this site to print, or use
                  Copy as text.
                </span>
              )}
            </div>

            {filteredRows.length > 0 ? (
              <div
                className="flex flex-wrap items-center gap-2 rounded-lg border border-border/60 bg-muted/10 p-3"
                aria-label="Export tasks"
              >
                <span className="text-xs font-medium text-muted-foreground">
                  Export (current filters, {filteredRows.length} row
                  {filteredRows.length === 1 ? "" : "s"}):
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={taskExportBusy}
                  onClick={() => void copyTasksTsv()}
                  title="Copy as TSV for Excel or Google Sheets"
                >
                  {taskCopyState === "ok" ? (
                    <Check className="h-4 w-4" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                  {taskCopyState === "ok"
                    ? "Copied"
                    : taskCopyState === "err"
                      ? "Copy failed"
                      : "Copy TSV"}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={taskExportBusy}
                  onClick={exportTasksTsv}
                  title="Download .tsv file"
                >
                  <Download className="h-4 w-4" />
                  TSV
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={taskExportBusy}
                  onClick={exportTasksCsv}
                  title="Download CSV (UTF-8 with BOM for Excel)"
                >
                  <Download className="h-4 w-4" />
                  CSV
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={taskExportBusy}
                  onClick={exportTasksJson}
                  title="Download full JSON (all fields)"
                >
                  <FileJson className="h-4 w-4" />
                  JSON
                </Button>
              </div>
            ) : null}
          </CollapsibleSection>
          </div>
        </div>
      )}

      {!listLoading && !empty && filteredRows.length === 0 && (
        <p
          className="rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground"
          role="status"
        >
          No tasks match the current filters.{" "}
          <button
            type="button"
            className="text-primary underline underline-offset-2 hover:opacity-90"
            onClick={() => {
              setTypeFilter("all");
              setCategoryFilter("all");
              setAssigneeFilter("all");
              setSearchQuery("");
              setDueTodayOnly(false);
              setOverdueOnly(false);
              setSnoozeFilter("hide");
            }}
          >
            Clear filters
          </button>
        </p>
      )}

      {/* ---------- Today view: daily plan + due today ---------- */}
      {!listLoading && !empty && view === "today" && (
        <DailyPlanSection
          plan={planRows}
          allRows={allRows}
          onTogglePlan={togglePlan}
          rowBusy={(t) => !canUseHub || updatingId === t._id}
          onUpdate={updateTask}
          onToggleDone={toggleDone}
          onDelete={deleteTask}
          onOpenDrawer={setOpenTaskId}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          actionTitle={actionTitle}
          draggingId={draggingId}
          onSnooze={onSnooze}
          onWake={onWake}
          attachmentCounts={attachmentCounts}
          selectable={selectionListEnabled}
          selectionCheckboxById={selectionCheckboxById}
          onToggleSelect={toggleSelect}
          assigneeLabel={assigneeLabel}
        />
      )}

      {!listLoading && !empty && view === "today" && (
        <FlatListSection
          title={
            snoozeFilter === "only" ? "Snoozed today / overdue" : "Due today / overdue"
          }
          rows={todayRows}
          planIds={todayPlan}
          onTogglePlan={togglePlan}
          rowBusy={(t) => !canUseHub || updatingId === t._id}
          onUpdate={updateTask}
          onToggleDone={toggleDone}
          onDelete={deleteTask}
          onOpenDrawer={setOpenTaskId}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          actionTitle={actionTitle}
          draggingId={draggingId}
          onSnooze={onSnooze}
          onWake={onWake}
          attachmentCounts={attachmentCounts}
          selectable={selectionListEnabled}
          selectionCheckboxById={selectionCheckboxById}
          onToggleSelect={toggleSelect}
          assigneeLabel={assigneeLabel}
          emptyMessage={
            snoozeFilter === "only"
              ? "No snoozed tasks waking today."
              : "Inbox zero for today — go enjoy your day."
          }
        />
      )}

      {/* ---------- Week view ---------- */}
      {!listLoading && !empty && view === "week" && (
        <FlatListSection
          title={snoozeFilter === "only" ? "Snoozed this week" : "This week"}
          rows={weekRows}
          planIds={todayPlan}
          onTogglePlan={togglePlan}
          rowBusy={(t) => !canUseHub || updatingId === t._id}
          onUpdate={updateTask}
          onToggleDone={toggleDone}
          onDelete={deleteTask}
          onOpenDrawer={setOpenTaskId}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          actionTitle={actionTitle}
          draggingId={draggingId}
          onSnooze={onSnooze}
          onWake={onWake}
          attachmentCounts={attachmentCounts}
          selectable={selectionListEnabled}
          selectionCheckboxById={selectionCheckboxById}
          onToggleSelect={toggleSelect}
          assigneeLabel={assigneeLabel}
          emptyMessage={
            snoozeFilter === "only"
              ? "No snoozed tasks waking this week."
              : "Nothing due this week — great time to plan ahead."
          }
        />
      )}

      {/* ---------- Long-term view ---------- */}
      {!listLoading && !empty && view === "longterm" && (
        <FlatListSection
          title={
            snoozeFilter === "only" ? "Snoozed long-term" : "Long-term & parking lot"
          }
          rows={longTermRows}
          planIds={todayPlan}
          onTogglePlan={togglePlan}
          rowBusy={(t) => !canUseHub || updatingId === t._id}
          onUpdate={updateTask}
          onToggleDone={toggleDone}
          onDelete={deleteTask}
          onOpenDrawer={setOpenTaskId}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          actionTitle={actionTitle}
          draggingId={draggingId}
          onSnooze={onSnooze}
          onWake={onWake}
          attachmentCounts={attachmentCounts}
          selectable={selectionListEnabled}
          selectionCheckboxById={selectionCheckboxById}
          onToggleSelect={toggleSelect}
          assigneeLabel={assigneeLabel}
          emptyMessage={
            snoozeFilter === "only"
              ? "No long-term tasks are snoozed."
              : "No long-term work captured yet. Drop big-rock items here."
          }
        />
      )}

      {!listLoading && !empty && view === "matrix" && filteredRows.length > 0 && (
        <>
          <div
            className={cn(
              "flex flex-col",
              density === "compact" ? "gap-2" : "gap-3"
            )}
            aria-label="Task quadrants"
          >
            {visibleQuadrants.map((q) => {
              const parentRows = byQuadrant[q];
              const orphanRows = orphanChildrenByQuadrant[q];
              const totalForCount = parentRows.length + orphanRows.length;
              const isDropTarget = dragOverQ === q;
              const collapsed = collapsedQs.includes(q);
              return (
                <section
                  key={q}
                  className={cn(
                    "flex w-full flex-col overflow-hidden rounded-lg border bg-background transition-colors",
                    isDropTarget
                      ? "border-primary ring-2 ring-primary/40"
                      : "border-border/80"
                  )}
                  onDragEnter={(e) => {
                    e.preventDefault();
                    if (draggingId) setDragOverQ(q);
                  }}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = "move";
                    if (draggingId) setDragOverQ(q);
                  }}
                  onDragLeave={(e) => {
                    if (e.currentTarget.contains(e.relatedTarget as Node))
                      return;
                    setDragOverQ((cur) => (cur === q ? null : cur));
                  }}
                  onDrop={(e) => void handleDrop(e, q)}
                  aria-label={`Quadrant ${q}: ${QUADRANT_BLURB[q]}`}
                >
                  <div className="flex w-full items-stretch bg-muted/40">
                    <button
                      type="button"
                      onClick={() => toggleQuadrantCollapsed(q)}
                      className={cn(
                        "flex min-w-0 flex-1 items-center gap-1.5 transition-colors hover:bg-muted/80",
                        density === "compact" ? "px-2 py-1" : "px-2.5 py-1.5"
                      )}
                      aria-expanded={!collapsed}
                      aria-controls={`q-${q}-list`}
                      title={collapsed ? "Expand quadrant" : "Collapse quadrant"}
                    >
                      {collapsed ? (
                        <ChevronRight
                          className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
                          aria-hidden
                        />
                      ) : (
                        <ChevronDown
                          className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
                          aria-hidden
                        />
                      )}
                      <span
                        className={cn(
                          "h-2 w-2 shrink-0 rounded-full",
                          QUADRANT_BAR[q]
                        )}
                        aria-hidden
                      />
                      <div className="flex min-w-0 flex-1 flex-col items-center justify-center px-1 text-center leading-none">
                        <h2 className="text-base font-bold tracking-tight text-foreground">
                          Q{q}
                        </h2>
                        <p className="mt-0.5 text-[10px] font-medium text-muted-foreground">
                          {QUADRANT_BLURB[q]}
                          <span className="text-muted-foreground/80">
                            {" "}
                            · {totalForCount}
                          </span>
                        </p>
                      </div>
                    </button>
                    {totalForCount > 0 && (
                      <div
                        className="flex shrink-0 items-stretch divide-x divide-border/80 border-l border-border/80"
                        role="group"
                        aria-label={`Selection for quadrant ${q}`}
                      >
                        <button
                          type="button"
                          onClick={() => selectAllInQuadrant(q)}
                          className="px-2 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                          title={`Select every task in Q${q} (including subtasks) for print or copy`}
                          aria-label={`Select all tasks in quadrant ${q}`}
                        >
                          Select all
                        </button>
                        <button
                          type="button"
                          onClick={() => unselectAllInQuadrant(q)}
                          className="px-2 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                          title={`Clear selection for every task in Q${q} only (subtasks included)`}
                          aria-label={`Unselect all tasks in quadrant ${q}`}
                        >
                          Unselect all
                        </button>
                      </div>
                    )}
                  </div>
                  {!collapsed && (
                    <ul
                      id={`q-${q}-list`}
                      className={cn(
                        "list-none border-t border-border/50",
                        density === "compact"
                          ? "min-h-[2rem] px-1.5 py-0"
                          : "min-h-[2.5rem] px-2 py-0",
                        isDropTarget && "bg-primary/5"
                      )}
                    >
                      {totalForCount === 0 ? (
                        <li
                          className={cn(
                            "text-center text-xs text-muted-foreground",
                            density === "compact" ? "px-2 py-2" : "px-2 py-3"
                          )}
                        >
                          {isDropTarget ? "Drop here" : "Drag a task here"}
                        </li>
                      ) : (
                        <>
                          {parentRows.map((t) => {
                            const children =
                              childrenByParent.get(String(t._id)) ?? [];
                            const childRowsToShow = showDone
                              ? children
                              : children.filter(
                                  (c) =>
                                    c.status !== "done" &&
                                    c.status !== "archived"
                                );
                            const childDoneCount = children.filter(
                              (c) => c.status === "done"
                            ).length;
                            return (
                              <FragmentRow
                                key={t._id}
                                t={t}
                                childRows={childRowsToShow}
                                childCount={children.length}
                                childDoneCount={childDoneCount}
                                rowBusy={!canUseHub || updatingId === t._id}
                                draggingId={draggingId}
                                matrixReorder={{
                                  quadrant: q,
                                  draggingId,
                                  reorderHoverId,
                                  onRowDragOver: (e, target) =>
                                    handleMatrixRowDragOver(e, target, q),
                                  onRowDragLeave: handleMatrixRowDragLeave,
                                  onRowDrop: (e, target) =>
                                    void handleMatrixRowDrop(e, target, q),
                                }}
                                onUpdate={updateTask}
                                onToggleDone={toggleDone}
                                onDelete={deleteTask}
                                onOpenDrawer={setOpenTaskId}
                                onDragStart={handleDragStart}
                                onDragEnd={handleDragEnd}
                                actionTitle={actionTitle}
                                onSnooze={onSnooze}
                                onWake={onWake}
                                attachmentCounts={attachmentCounts}
                                selectable={selectionListEnabled}
                                selectionCheckboxById={selectionCheckboxById}
                                onToggleSelect={toggleSelect}
                                assigneeLabel={assigneeLabel}
                              />
                            );
                          })}
                          {orphanRows.map((t) => (
                            <TaskRow
                              key={t._id}
                              t={t}
                              rowBusy={!canUseHub || updatingId === t._id}
                              childCount={0}
                              childDoneCount={0}
                              isChild={false}
                              isDragging={draggingId === t._id}
                              matrixReorder={{
                                quadrant: q,
                                draggingId,
                                reorderHoverId,
                                onRowDragOver: (e, target) =>
                                  handleMatrixRowDragOver(e, target, q),
                                onRowDragLeave: handleMatrixRowDragLeave,
                                onRowDrop: (e, target) =>
                                  void handleMatrixRowDrop(e, target, q),
                              }}
                              onUpdate={updateTask}
                              onToggleDone={toggleDone}
                              onDelete={deleteTask}
                              onOpenDrawer={setOpenTaskId}
                              onDragStart={handleDragStart}
                              onDragEnd={handleDragEnd}
                              actionTitle={actionTitle}
                              onSnooze={onSnooze}
                              onWake={onWake}
                              attachmentCounts={attachmentCounts}
                              selectable={selectionListEnabled}
                              selectionCheckboxState={
                                selectionCheckboxById.get(String(t._id)) ??
                                "unchecked"
                              }
                              onToggleSelect={toggleSelect}
                              assigneeLabel={assigneeLabel}
                            />
                          ))}
                        </>
                      )}
                    </ul>
                  )}
                </section>
              );
            })}
          </div>
        </>
      )}

      <TaskDrawer
        taskId={openTaskId}
        onClose={() => setOpenTaskId(null)}
        onOpenTask={(id) => setOpenTaskId(id)}
      />
    </div>
  );
}

export default function TasksPage() {
  const [queryRecover, setQueryRecover] = useState(0);
  return (
    <ConvexQueryBoundary
      recoverOnKeys={[queryRecover]}
      fallback={
        <div className="space-y-4">
          <div>
            <h1 className="text-2xl font-semibold">Tasks</h1>
            <div
              className="mt-4 rounded-lg border border-destructive/40 bg-destructive/5 p-6"
              role="alert"
            >
              <p className="font-medium text-destructive">
                Could not load tasks
              </p>
              <p className="mt-2 text-sm text-muted-foreground">
                The tasks query failed (Convex deployment mismatch, network drop,
                or invalid data). Navigation and other hubs may still work.
              </p>
              <Button
                type="button"
                className="mt-4"
                variant="outline"
                onClick={() => setQueryRecover((n) => n + 1)}
              >
                Retry
              </Button>
            </div>
          </div>
        </div>
      }
    >
      <TasksPageInner />
    </ConvexQueryBoundary>
  );
}

/**
 * One parent row + its visible children, all draggable independently.
 * Pulled out so the parent block stays a logical unit (and so React keys
 * stay stable when the children list changes).
 */
function FragmentRow({
  t,
  childRows,
  childCount,
  childDoneCount,
  rowBusy,
  draggingId,
  matrixReorder,
  onUpdate,
  onToggleDone,
  onDelete,
  onOpenDrawer,
  onDragStart,
  onDragEnd,
  actionTitle,
  onSnooze,
  onWake,
  attachmentCounts,
  selectable,
  selectionCheckboxById,
  onToggleSelect,
  assigneeLabel,
}: {
  t: Doc<"tasks">;
  childRows: Doc<"tasks">[];
  childCount: number;
  childDoneCount: number;
  rowBusy: boolean;
  draggingId: Id<"tasks"> | null;
  matrixReorder?: MatrixReorderHandlers;
  onUpdate: TaskUpdater;
  onToggleDone: (task: Doc<"tasks">) => void;
  onDelete: (task: Doc<"tasks">) => void;
  onOpenDrawer: (id: Id<"tasks">) => void;
  onDragStart: (e: React.DragEvent, t: Doc<"tasks">) => void;
  onDragEnd: () => void;
  actionTitle: (h: string) => string;
  onSnooze: (id: Id<"tasks">, until: number) => void | Promise<unknown>;
  onWake: (id: Id<"tasks">) => void | Promise<unknown>;
  attachmentCounts?: Record<string, number>;
  selectable?: boolean;
  selectionCheckboxById?: ReadonlyMap<string, TaskSelectionCheckbox>;
  onToggleSelect?: (id: Id<"tasks">) => void;
  assigneeLabel?: (userKey: string) => string;
}) {
  const [parentOpen, setParentOpen] = useState(false);

  return (
    <>
      <TaskRow
        t={t}
        rowBusy={rowBusy}
        childCount={childCount}
        childDoneCount={childDoneCount}
        isChild={false}
        isDragging={draggingId === t._id}
        matrixReorder={matrixReorder}
        expanded={parentOpen}
        onExpandedChange={setParentOpen}
        onUpdate={onUpdate}
        onToggleDone={onToggleDone}
        onDelete={onDelete}
        onOpenDrawer={onOpenDrawer}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        actionTitle={actionTitle}
        onSnooze={onSnooze}
        onWake={onWake}
        attachmentCounts={attachmentCounts}
        selectable={selectable}
        selectionCheckboxState={
          selectionCheckboxById?.get(String(t._id)) ?? "unchecked"
        }
        onToggleSelect={onToggleSelect}
        assigneeLabel={assigneeLabel}
      />
      {childRows.map((c) => (
        <TaskRow
          key={c._id}
          t={c}
          rowBusy={rowBusy}
          childCount={0}
          childDoneCount={0}
          isChild
          isDragging={draggingId === c._id}
          descriptionSuppressed={!parentOpen}
          onUpdate={onUpdate}
          onToggleDone={onToggleDone}
          onDelete={onDelete}
          onOpenDrawer={onOpenDrawer}
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
          actionTitle={actionTitle}
          onSnooze={onSnooze}
          onWake={onWake}
          attachmentCounts={attachmentCounts}
          selectable={selectable}
          selectionCheckboxState={
            selectionCheckboxById?.get(String(c._id)) ?? "unchecked"
          }
          onToggleSelect={onToggleSelect}
          assigneeLabel={assigneeLabel}
        />
      ))}
    </>
  );
}

// ---------- Daily plan + flat list views ----------

type SharedRowHandlers = {
  rowBusy: (t: Doc<"tasks">) => boolean;
  draggingId: Id<"tasks"> | null;
  onUpdate: TaskUpdater;
  onToggleDone: (task: Doc<"tasks">) => void;
  onDelete: (task: Doc<"tasks">) => void;
  onOpenDrawer: (id: Id<"tasks">) => void;
  onDragStart: (e: React.DragEvent, t: Doc<"tasks">) => void;
  onDragEnd: () => void;
  actionTitle: (h: string) => string;
  onSnooze: (id: Id<"tasks">, until: number) => void | Promise<unknown>;
  onWake: (id: Id<"tasks">) => void | Promise<unknown>;
  attachmentCounts?: Record<string, number>;
  selectable?: boolean;
  selectionCheckboxById?: ReadonlyMap<string, TaskSelectionCheckbox>;
  onToggleSelect?: (id: Id<"tasks">) => void;
  assigneeLabel?: (userKey: string) => string;
};

function PlanPinButton({
  pinned,
  onClick,
}: {
  pinned: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={pinned ? "Unpin from today" : "Pin to today"}
      aria-label={pinned ? "Unpin from today" : "Pin to today"}
      className={cn(
        "h-7 w-7 shrink-0 rounded-md border text-sm transition-colors",
        pinned
          ? "border-amber-300 bg-amber-100 text-amber-700 hover:bg-amber-200 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300"
          : "border-border bg-background text-muted-foreground hover:bg-muted"
      )}
    >
      ★
    </button>
  );
}

function DailyPlanSection({
  plan,
  allRows,
  onTogglePlan,
  rowBusy,
  onUpdate,
  onToggleDone,
  onDelete,
  onOpenDrawer,
  onDragStart,
  onDragEnd,
  actionTitle,
  draggingId,
  onSnooze,
  onWake,
  attachmentCounts,
  selectable,
  selectionCheckboxById,
  onToggleSelect,
  assigneeLabel,
}: SharedRowHandlers & {
  plan: Doc<"tasks">[];
  allRows: Doc<"tasks">[];
  onTogglePlan: (id: Id<"tasks">) => void;
}) {
  const planIds = useMemo(() => plan.map((p) => String(p._id)), [plan]);
  const [picker, setPicker] = useState("");

  const candidates = useMemo(() => {
    const q = picker.trim().toLowerCase();
    return allRows
      .filter(
        (t) =>
          t.status !== "done" &&
          !isSnoozed(t) &&
          !planIds.includes(String(t._id))
      )
      .filter((t) => (q ? t.title.toLowerCase().includes(q) : true))
      .sort(sortByPriority)
      .slice(0, 8);
  }, [allRows, picker, planIds]);

  return (
    <section className="overflow-hidden rounded-xl border border-amber-300/60 bg-amber-50/30 shadow-sm dark:border-amber-900/40 dark:bg-amber-950/10">
      <div className="flex items-center gap-2 border-b border-amber-300/60 bg-amber-100/40 px-4 py-2.5 dark:border-amber-900/40 dark:bg-amber-950/20">
        <span aria-hidden className="text-amber-700 dark:text-amber-300">
          ★
        </span>
        <h2 className="text-sm font-semibold text-amber-900 dark:text-amber-200">
          Today&apos;s plan
        </h2>
        <span className="text-xs font-medium text-amber-800/80 dark:text-amber-300/80">
          ({plan.length}/5)
        </span>
        <p className="ml-auto truncate text-xs text-amber-800/80 dark:text-amber-300/80">
          The 3–5 things that, if done today, make today a win.
        </p>
      </div>
      <ul className="list-none px-3 py-1">
        {plan.length === 0 ? (
          <li className="px-2 py-4 text-center text-sm text-amber-800/80 dark:text-amber-300/80">
            No tasks pinned yet. Add one below to start your day.
          </li>
        ) : (
          plan.map((t) => (
            <TaskRow
              key={t._id}
              t={t}
              rowBusy={rowBusy(t)}
              childCount={0}
              childDoneCount={0}
              isChild={false}
              isDragging={draggingId === t._id}
              onUpdate={onUpdate}
              onToggleDone={onToggleDone}
              onDelete={onDelete}
              onOpenDrawer={onOpenDrawer}
              onDragStart={onDragStart}
              onDragEnd={onDragEnd}
              actionTitle={actionTitle}
              onSnooze={onSnooze}
              onWake={onWake}
              attachmentCounts={attachmentCounts}
              selectable={selectable}
              selectionCheckboxState={
                selectionCheckboxById?.get(String(t._id)) ?? "unchecked"
              }
              onToggleSelect={onToggleSelect}
              assigneeLabel={assigneeLabel}
              leading={
                <PlanPinButton
                  pinned
                  onClick={() => onTogglePlan(t._id)}
                />
              }
            />
          ))
        )}
      </ul>
      <div className="flex flex-wrap items-center gap-2 border-t border-amber-300/40 bg-amber-50/30 px-3 py-2 dark:border-amber-900/30 dark:bg-amber-950/10">
        <SearchField
          containerClassName="min-w-[14rem] flex-1"
          placeholder="Pin a task to today (search by title)…"
          value={picker}
          onChange={(e) => setPicker(e.target.value)}
          aria-label="Search tasks to pin"
        />
        {plan.length > 0 && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => plan.forEach((t) => onTogglePlan(t._id))}
            title="Clear today's plan"
          >
            Clear
          </Button>
        )}
      </div>
      {picker && candidates.length > 0 && (
        <ul className="list-none border-t border-amber-300/40 bg-background/70 px-3 py-1">
          {candidates.map((t) => (
            <li
              key={t._id}
              className="flex items-center gap-2 border-b border-border/40 py-1.5 last:border-0"
            >
              <button
                type="button"
                className="min-w-0 flex-1 truncate text-left text-sm hover:underline"
                onClick={() => {
                  onTogglePlan(t._id);
                  setPicker("");
                }}
              >
                {t.title}
              </button>
              <span className="shrink-0 text-xs text-muted-foreground">
                Q{t.quadrant} · {t.category}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function FlatListSection({
  title,
  rows,
  emptyMessage,
  planIds,
  onTogglePlan,
  rowBusy,
  onUpdate,
  onToggleDone,
  onDelete,
  onOpenDrawer,
  onDragStart,
  onDragEnd,
  actionTitle,
  draggingId,
  onSnooze,
  onWake,
  attachmentCounts,
  selectable,
  selectionCheckboxById,
  onToggleSelect,
  assigneeLabel,
}: SharedRowHandlers & {
  title: string;
  rows: Doc<"tasks">[];
  emptyMessage: string;
  planIds?: Id<"tasks">[];
  onTogglePlan?: (id: Id<"tasks">) => void;
}) {
  const planSet = useMemo(
    () => new Set((planIds ?? []).map((id) => String(id))),
    [planIds]
  );
  return (
    <section className="overflow-hidden rounded-xl border border-border/80 bg-background shadow-sm">
      <div className="flex items-center gap-2 border-b border-border/80 bg-muted/50 px-4 py-2.5">
        <h2 className="text-sm font-semibold">{title}</h2>
        <span className="text-xs font-medium text-muted-foreground">
          ({rows.length})
        </span>
      </div>
      <ul className="list-none px-3 py-1">
        {rows.length === 0 ? (
          <li className="px-2 py-6 text-center text-sm text-muted-foreground">
            {emptyMessage}
          </li>
        ) : (
          rows.map((t) => (
            <TaskRow
              key={t._id}
              t={t}
              rowBusy={rowBusy(t)}
              childCount={0}
              childDoneCount={0}
              isChild={false}
              isDragging={draggingId === t._id}
              onUpdate={onUpdate}
              onToggleDone={onToggleDone}
              onDelete={onDelete}
              onOpenDrawer={onOpenDrawer}
              onDragStart={onDragStart}
              onDragEnd={onDragEnd}
              actionTitle={actionTitle}
              onSnooze={onSnooze}
              onWake={onWake}
              attachmentCounts={attachmentCounts}
              selectable={selectable}
              selectionCheckboxState={
                selectionCheckboxById?.get(String(t._id)) ?? "unchecked"
              }
              onToggleSelect={onToggleSelect}
              assigneeLabel={assigneeLabel}
              leading={
                onTogglePlan ? (
                  <PlanPinButton
                    pinned={planSet.has(String(t._id))}
                    onClick={() => onTogglePlan(t._id)}
                  />
                ) : undefined
              }
            />
          ))
        )}
      </ul>
    </section>
  );
}
