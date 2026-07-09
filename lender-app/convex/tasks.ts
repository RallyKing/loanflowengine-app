import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { appendTaskFeed } from "./activityFeed";
import { notifyTaskAssigneeChange } from "./taskNotifications";
import { newMentionHandlesOnly } from "../lib/mentions";
import { dispatchUserNotification } from "./notifications";
import { refreshTaskGlobalSearchText } from "./globalSearchSync";
import { removeAllLibraryLinksForTasks } from "./libraryDocumentsCleanup";
import {
  assertOrgMember,
  resolveMemberUserKey,
  filterTaskRowsForMember,
  assertCanMutateTaskRow,
  assertCanReadTaskRow,
  assertCanReadPipelineRow,
} from "./organizationAccess";
import {
  assertCanMutatePipelineRow,
  ownerUserIdFieldsForInsert,
} from "./resourceAccess";
import { buildTaskOwnershipPresentation } from "./resourceOwnershipPresentation";
import {
  removeAllFileTaskEdgesForTask,
  syncFileTaskEdgeFromTask,
} from "./indexedGraphEdgeSync";
import {
  readTaskColorPresetsForOrg,
  readTaskSnoozeDefaultsForOrg,
} from "./organizationSettings";
import {
  computeSnoozeUntilFromPreset,
  type TaskSnoozePresetKey,
} from "../lib/taskSnoozePresets";
import { isTaskColorPresetId } from "../lib/taskColorPresets";
import { DEFAULT_SCHEDULED_TRIAGE_COLOR_ID } from "../lib/triageLabels";
import { normalizeTriageLabelHex } from "../lib/triageLabelColor";

async function syncIndexedGraphTaskEdge(
  ctx: MutationCtx,
  taskId: Id<"tasks">,
  opts?: { previousFileId?: Id<"pipeline">; actor?: string },
): Promise<void> {
  const task = await ctx.db.get(taskId);
  if (!task) return;
  await syncFileTaskEdgeFromTask(ctx, task, opts);
}

// ---------- Shared validators (mirror `tasks` table) ----------

const taskType = v.union(
  v.literal("work"),
  v.literal("personal"),
  v.literal("errands_groceries")
);

const errandItem = v.object({
  id: v.string(),
  name: v.string(),
  completed: v.boolean(),
  quantity: v.optional(v.string()),
  note: v.optional(v.string()),
});

const errandLocation = v.object({
  id: v.string(),
  name: v.string(),
  completed: v.optional(v.boolean()),
  items: v.array(errandItem),
});

const taskCategory = v.union(
  v.literal("errand"),
  v.literal("research"),
  v.literal("call"),
  v.literal("admin"),
  v.literal("project")
);

const taskStatus = v.union(
  v.literal("todo"),
  v.literal("in_progress"),
  v.literal("done"),
  v.literal("archived")
);

const recurrenceArg = v.object({
  every: v.union(
    v.literal("day"),
    v.literal("week"),
    v.literal("month"),
    v.literal("year")
  ),
  interval: v.number(),
  daysOfWeek: v.optional(v.array(v.number())),
  endsOn: v.optional(v.number()),
});

const linkItem = v.object({
  url: v.string(),
  label: v.optional(v.string()),
  kind: v.optional(v.string()),
});

const checklistItem = v.object({
  text: v.string(),
  done: v.boolean(),
});

const taskInput = {
  title: v.string(),
  description: v.optional(v.string()),
  type: taskType,
  category: taskCategory,
  quadrant: v.number(),
  quadrantPosition: v.optional(v.number()),
  status: taskStatus,
  priority: v.number(),
  dueDate: v.optional(v.number()),
  startDate: v.optional(v.number()),
  parentTaskId: v.optional(v.id("tasks")),
  relatedFileId: v.optional(v.id("pipeline")),
  relatedContactId: v.optional(v.id("contacts")),
  assigneeId: v.optional(v.string()),
  sharedWithIds: v.optional(v.array(v.string())),
  recurrence: v.optional(recurrenceArg),
  links: v.optional(v.array(linkItem)),
  linkedTaskIds: v.optional(v.array(v.id("tasks"))),
  checklist: v.optional(v.array(checklistItem)),
  errandLocations: v.optional(v.array(errandLocation)),
  snoozedUntil: v.optional(v.number()),
  reminderAt: v.optional(v.number()),
  highlightColorId: v.optional(v.string()),
  triageLabelId: v.optional(v.id("organizationTriageLabels")),
  isUrgent: v.optional(v.boolean()),
  scheduledTriggerTime: v.optional(v.number()),
};

const orgScopeArgs = {
  organizationId: v.id("organizations"),
  memberUserKey: v.optional(v.string()),
};

/** Bound reads for `getAll` — unbounded `.collect()` can exceed Convex query limits. */
const TASKS_GET_ALL_MAX_ROWS = 20_000;

async function requireTaskOrg(
  ctx: QueryCtx | MutationCtx,
  organizationId: Id<"organizations">,
  memberUserKey: string | undefined,
): Promise<string> {
  const key = await resolveMemberUserKey(ctx, memberUserKey);
  await assertOrgMember(ctx, organizationId, key);
  return key;
}

async function assertTaskRelationsInOrg(
  ctx: MutationCtx,
  organizationId: Id<"organizations">,
  relatedFileId: Id<"pipeline"> | undefined,
  relatedContactId: Id<"contacts"> | undefined,
  parentTaskId: Id<"tasks"> | undefined,
): Promise<void> {
  if (parentTaskId) {
    const p = await ctx.db.get(parentTaskId);
    if (!p) throw new Error("parentTaskId: parent task not found");
    if (p.organizationId !== organizationId) {
      throw new Error("Parent task belongs to a different organization.");
    }
  }
  if (relatedFileId) {
    const f = await ctx.db.get(relatedFileId);
    if (!f) throw new Error("relatedFileId: pipeline row not found");
    if (f.organizationId !== organizationId) {
      throw new Error("Related file belongs to a different organization.");
    }
  }
  if (relatedContactId) {
    const c = await ctx.db.get(relatedContactId);
    if (!c) throw new Error("relatedContactId: contact not found");
    if (c.organizationId !== organizationId) {
      throw new Error("Related contact belongs to a different organization.");
    }
  }
}

async function loadTaskInOrg(
  ctx: QueryCtx | MutationCtx,
  id: Id<"tasks">,
  organizationId: Id<"organizations">,
  memberUserKey?: string,
  access: "none" | "read" | "mutate" = "none",
): Promise<Doc<"tasks">> {
  const t = await ctx.db.get(id);
  if (!t) throw new Error("Task not found");
  if (t.organizationId !== organizationId) {
    throw new Error("Task not found in this organization.");
  }
  if (access === "read") await assertCanReadTaskRow(ctx, t, memberUserKey);
  if (access === "mutate") {
    await assertCanMutateTaskRow(ctx as MutationCtx, t, memberUserKey);
  }
  return t;
}

async function visibleOrgTasks(
  ctx: QueryCtx,
  organizationId: Id<"organizations">,
  memberUserKey: string | undefined,
  fetch: () => Promise<Doc<"tasks">[]>,
): Promise<Doc<"tasks">[]> {
  await requireTaskOrg(ctx, organizationId, memberUserKey);
  const rows = await fetch();
  return filterTaskRowsForMember(ctx, rows, organizationId, memberUserKey);
}

async function assertRelatedContactExists(
  ctx: MutationCtx,
  relatedContactId: Id<"contacts"> | undefined,
): Promise<void> {
  if (!relatedContactId) return;
  const c = await ctx.db.get(relatedContactId);
  if (!c) throw new Error("relatedContactId: contact not found");
}

async function syncAssigneeNotification(
  ctx: MutationCtx,
  prevRow: Doc<"tasks"> | null,
  nextRow: Doc<"tasks">,
  actorUserKey?: string,
): Promise<void> {
  await notifyTaskAssigneeChange(ctx, {
    taskId: nextRow._id,
    title: nextRow.title,
    prevAssignee: prevRow?.assigneeId,
    nextAssignee: nextRow.assigneeId,
    actorUserKey,
  });
}

/**
 * Tasks assigned to the viewer that need attention: overdue due date, due
 * soon, or reminder time reached (open tasks only; respects snooze).
 *
 * Identity prefers the Convex JWT subject when present; otherwise `userKey` /
 * `memberUserKey` args provide the caller. This avoids stale client identities
 * (e.g. a localStorage `accountId` minted before sign-in) from leaking into the
 * lookup or causing membership checks to throw.
 */
export const assigneeAttentionPreview = query({
  args: {
    organizationId: v.id("organizations"),
    userKey: v.optional(v.string()),
    memberUserKey: v.optional(v.string()),
    dueHorizonMs: v.optional(v.number()),
    maxRows: v.optional(v.number()),
  },
  handler: async (
    ctx,
    { organizationId, userKey, memberUserKey, dueHorizonMs, maxRows },
  ) => {
    // `requireTaskOrg` resolves identity from JWT and ignores client args;
    // it returns the canonical userKey for this caller.
    const k = await requireTaskOrg(ctx, organizationId, memberUserKey ?? userKey);
    if (!k) return [];
    const now = Date.now();
    const horizon = dueHorizonMs ?? 1000 * 60 * 60 * 48;
    const cap = Math.min(Math.max(maxRows ?? 40, 1), 120);
    const rows = await ctx.db
      .query("tasks")
      .withIndex("by_assignee_updatedAt", (q) => q.eq("assigneeId", k))
      .order("desc")
      .take(cap * 8);
    const visible = await filterTaskRowsForMember(ctx, rows, organizationId, k);
    const visibleIds = new Set(visible.map((t) => t._id));
    const out: Array<{
      task: Doc<"tasks">;
      reason: "overdue" | "due_soon" | "reminder";
    }> = [];
    for (const t of rows) {
      if (!visibleIds.has(t._id)) continue;
      if (t.status === "done" || t.status === "archived") continue;
      if (t.snoozedUntil != null && t.snoozedUntil > now) continue;
      let reason: "overdue" | "due_soon" | "reminder" | null = null;
      if (t.dueDate != null && t.dueDate < now) reason = "overdue";
      else if (t.reminderAt != null && t.reminderAt <= now) reason = "reminder";
      else if (t.dueDate != null && t.dueDate <= now + horizon) {
        reason = "due_soon";
      }
      if (reason != null) {
        out.push({ task: t, reason });
        if (out.length >= cap) break;
      }
    }
    return out;
  },
});

// ---------- Queries ----------

/**
 * All tasks for one organization, newest first (by document creation time).
 */
export const getAll = query({
  args: orgScopeArgs,
  handler: async (ctx, { organizationId, memberUserKey }) => {
    const tasks = await visibleOrgTasks(ctx, organizationId, memberUserKey, () =>
      ctx.db
        .query("tasks")
        .withIndex("by_organization", (q) =>
          q.eq("organizationId", organizationId),
        )
        .order("desc")
        .take(TASKS_GET_ALL_MAX_ROWS),
    );
    const ownershipRows = await Promise.all(
      tasks.map((t) => buildTaskOwnershipPresentation(ctx, t, memberUserKey)),
    );
    return tasks.map((t, i) => ({
      ...t,
      ownership: ownershipRows[i],
    }));
  },
});

/**
 * Narrow task title search for “link related task” UX. Scans recent tasks only
 * (avoids loading the full table into the drawer).
 */
export const linkSearchCandidates = query({
  args: {
    ...orgScopeArgs,
    q: v.string(),
    excludeTaskIds: v.optional(v.array(v.id("tasks"))),
    scanLimit: v.optional(v.number()),
    resultLimit: v.optional(v.number()),
  },
  handler: async (
    ctx,
    { organizationId, memberUserKey, q, excludeTaskIds, scanLimit, resultLimit },
  ) => {
    await requireTaskOrg(ctx, organizationId, memberUserKey);
    const needle = q.trim().toLowerCase();
    if (!needle) return [];
    const scan = Math.min(Math.max(scanLimit ?? 600, 50), 3_000);
    const cap = Math.min(Math.max(resultLimit ?? 12, 1), 40);
    const exclude = new Set(excludeTaskIds ?? []);
    const rows = await ctx.db
      .query("tasks")
      .withIndex("by_organization", (qry) =>
        qry.eq("organizationId", organizationId),
      )
      .order("desc")
      .take(scan);
    const visible = await filterTaskRowsForMember(
      ctx,
      rows,
      organizationId,
      memberUserKey,
    );
    const out: Doc<"tasks">[] = [];
    for (const t of visible) {
      if (exclude.has(t._id)) continue;
      if (t.title.toLowerCase().includes(needle)) {
        out.push(t);
        if (out.length >= cap) break;
      }
    }
    return out;
  },
});

/**
 * Tasks in a given Eisenhower quadrant (1–4, convention in the app).
 */
export const getByQuadrant = query({
  args: { quadrant: v.number(), ...orgScopeArgs },
  handler: async (ctx, { quadrant, organizationId, memberUserKey }) => {
    await requireTaskOrg(ctx, organizationId, memberUserKey);
    const rows = await ctx.db
      .query("tasks")
      .withIndex("by_quadrant", (q) => q.eq("quadrant", quadrant))
      .order("desc")
      .collect();
    return filterTaskRowsForMember(ctx, rows, organizationId, memberUserKey);
  },
});

/**
 * Tasks whose `dueDate` falls in `[from, to]` (ms, inclusive). Rows without
 * `dueDate` are not included.
 */
export const getByDateRange = query({
  args: {
    from: v.number(),
    to: v.number(),
    ...orgScopeArgs,
  },
  handler: async (ctx, { from, to, organizationId, memberUserKey }) => {
    await requireTaskOrg(ctx, organizationId, memberUserKey);
    if (from > to) {
      throw new Error("getByDateRange: from must be less than or equal to to");
    }
    const rows = await ctx.db
      .query("tasks")
      .filter((q) =>
        q.and(q.gte(q.field("dueDate"), from), q.lte(q.field("dueDate"), to)),
      )
      .order("desc")
      .collect();
    return filterTaskRowsForMember(ctx, rows, organizationId, memberUserKey);
  },
});

// ---------- Mutations ----------

async function resolveQuadrantPositionOnUpdate(
  ctx: MutationCtx,
  existing: Doc<"tasks">,
  rest: {
    quadrant: number;
    parentTaskId?: Id<"tasks">;
    quadrantPosition?: number;
  },
): Promise<number | undefined> {
  const orgId = existing.organizationId;
  if (!orgId) {
    throw new Error("Task is missing organization scope.");
  }
  if (rest.parentTaskId) return undefined;
  if (rest.quadrant !== existing.quadrant) {
    return await nextQuadrantPositionForParent(ctx, rest.quadrant, orgId);
  }
  if (existing.parentTaskId != null && rest.parentTaskId == null) {
    return await nextQuadrantPositionForParent(ctx, rest.quadrant, orgId);
  }
  if (typeof rest.quadrantPosition === "number") return rest.quadrantPosition;
  return existing.quadrantPosition;
}

async function nextQuadrantPositionForParent(
  ctx: MutationCtx,
  quadrant: number,
  organizationId: Id<"organizations">,
): Promise<number> {
  const rows = await ctx.db
    .query("tasks")
    .withIndex("by_organization", (q) =>
      q.eq("organizationId", organizationId),
    )
    .collect();
  let max = -1;
  for (const r of rows) {
    if (r.quadrant !== quadrant) continue;
    if (r.parentTaskId != null) continue;
    const p = r.quadrantPosition;
    if (typeof p === "number" && p > max) max = p;
  }
  return max + 1;
}

/**
 * Returns `null` when label id is unchanged (omit from patch).
 * Returns `undefined` when label cleared; `number` when newly set/changed.
 */
export function nextLabelAppliedAt(
  previous: Id<"organizationTriageLabels"> | undefined,
  next: Id<"organizationTriageLabels"> | undefined,
  now: number,
): number | undefined | null {
  const prevKey = previous ? String(previous) : "";
  const nextKey = next ? String(next) : "";
  if (prevKey === nextKey) return null;
  return next ? now : undefined;
}

export async function assertAndResolveTaskTriageFields(
  ctx: MutationCtx,
  organizationId: Id<"organizations">,
  fields: {
    triageLabelId?: Id<"organizationTriageLabels">;
    scheduledTriggerTime?: number;
  },
): Promise<{
  triageLabelId?: Id<"organizationTriageLabels">;
  scheduledTriggerTime?: number;
  highlightColorId?: string;
}> {
  const labelId = fields.triageLabelId;
  const scheduled =
    fields.scheduledTriggerTime != null && fields.scheduledTriggerTime > 0
      ? fields.scheduledTriggerTime
      : undefined;

  if (!labelId && !scheduled) {
    return {};
  }

  const presets = await readTaskColorPresetsForOrg(ctx, organizationId);
  const allowed = new Set(presets.map((preset) => preset.id));
  let highlightColorId: string | undefined;

  if (labelId) {
    const triageLabel = await ctx.db.get(labelId);
    if (!triageLabel || triageLabel.organizationId !== organizationId) {
      throw new Error("triageLabelId is not valid for this organization");
    }
    const hasCustomHex = Boolean(
      normalizeTriageLabelHex(triageLabel.customHexCode),
    );
    if (
      !hasCustomHex &&
      (!allowed.has(triageLabel.colorId) ||
        !isTaskColorPresetId(triageLabel.colorId))
    ) {
      throw new Error("Triage label color is invalid");
    }
    const storedColorId = triageLabel.colorId.trim();
    highlightColorId =
      storedColorId && allowed.has(storedColorId)
        ? storedColorId
        : presets[0]?.id;
  }

  if (scheduled) {
    if (!highlightColorId) {
      highlightColorId = allowed.has(DEFAULT_SCHEDULED_TRIAGE_COLOR_ID)
        ? DEFAULT_SCHEDULED_TRIAGE_COLOR_ID
        : presets[0]?.id;
    }
    if (!highlightColorId || !allowed.has(highlightColorId)) {
      throw new Error("Could not resolve highlight color for scheduled task");
    }
  }

  return {
    triageLabelId: labelId,
    scheduledTriggerTime: scheduled,
    highlightColorId,
  };
}

export const create = mutation({
  args: { ...taskInput, ...orgScopeArgs, actorUserKey: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const { actorUserKey, organizationId, memberUserKey, ...rest } = args;
    const actor = await requireTaskOrg(ctx, organizationId, memberUserKey);
    if (!rest.title.trim()) {
      throw new Error("Title is required");
    }
    if (rest.parentTaskId) {
      const parent = await ctx.db.get(rest.parentTaskId);
      if (!parent) {
        throw new Error("parentTaskId: parent task not found");
      }
    }
    if (rest.relatedFileId) {
      const file = await ctx.db.get(rest.relatedFileId);
      if (!file) {
        throw new Error("relatedFileId: pipeline row not found");
      }
    }
    await assertRelatedContactExists(ctx, rest.relatedContactId);
    await assertTaskRelationsInOrg(
      ctx,
      organizationId,
      rest.relatedFileId,
      rest.relatedContactId,
      rest.parentTaskId,
    );
    const resolved = await assertAndResolveTaskTriageFields(ctx, organizationId, {
      triageLabelId: rest.triageLabelId,
      scheduledTriggerTime: rest.scheduledTriggerTime,
    });
    const now = Date.now();
    const nextPos =
      rest.parentTaskId == null
        ? await nextQuadrantPositionForParent(ctx, rest.quadrant, organizationId)
        : undefined;
    const id = await ctx.db.insert("tasks", {
      title: rest.title.trim(),
      description: rest.description?.trim() || undefined,
      type: rest.type,
      category: rest.category,
      quadrant: rest.quadrant,
      quadrantPosition: nextPos,
      status: rest.status,
      priority: rest.priority,
      dueDate: rest.dueDate,
      startDate: rest.startDate,
      parentTaskId: rest.parentTaskId,
      relatedFileId: rest.relatedFileId,
      relatedContactId: rest.relatedContactId,
      assigneeId: rest.assigneeId?.trim() || undefined,
      sharedWithIds:
        rest.sharedWithIds && rest.sharedWithIds.length > 0
          ? rest.sharedWithIds
          : undefined,
      recurrence: rest.recurrence,
      links: normalizeLinks(rest.links),
      linkedTaskIds:
        rest.linkedTaskIds && rest.linkedTaskIds.length > 0
          ? rest.linkedTaskIds
          : undefined,
      checklist: normalizeChecklist(rest.checklist),
      errandLocations: normalizeErrandLocations(rest.errandLocations),
      completedAt: rest.status === "done" ? now : undefined,
      snoozedUntil:
        rest.snoozedUntil && rest.snoozedUntil > 0
          ? rest.snoozedUntil
          : undefined,
      reminderAt:
        rest.reminderAt && rest.reminderAt > 0 ? rest.reminderAt : undefined,
      triageLabelId: resolved.triageLabelId,
      labelAppliedAt: resolved.triageLabelId ? now : undefined,
      highlightColorId: resolved.highlightColorId,
      scheduledTriggerTime: resolved.scheduledTriggerTime,
      organizationId,
      ...ownerUserIdFieldsForInsert(actor),
      createdAt: now,
      updatedAt: now,
    });
    const inserted = await ctx.db.get(id);
    if (inserted) {
      await appendTaskFeed(
        ctx,
        inserted,
        "task_created",
        `Created task “${inserted.title.trim()}”`,
        actorUserKey ?? actor,
      );
      await syncAssigneeNotification(ctx, null, inserted, actorUserKey ?? actor);
    }
    await refreshTaskGlobalSearchText(ctx, id);
    await syncIndexedGraphTaskEdge(ctx, id, {
      actor: actorUserKey ?? actor,
    });
    return { id };
  },
});

function normalizeLinks(
  raw:
    | Array<{ url: string; label?: string; kind?: string }>
    | undefined
):
  | Array<{ url: string; label?: string; kind?: string }>
  | undefined {
  if (!raw) return undefined;
  const cleaned = raw
    .map((l) => ({
      url: (l.url ?? "").trim(),
      label: l.label?.trim() || undefined,
      kind: l.kind?.trim() || undefined,
    }))
    .filter((l) => l.url.length > 0);
  return cleaned.length > 0 ? cleaned : undefined;
}

function normalizeChecklist(
  raw: Array<{ text: string; done: boolean }> | undefined
): Array<{ text: string; done: boolean }> | undefined {
  if (!raw) return undefined;
  const cleaned = raw
    .map((c) => ({ text: (c.text ?? "").trim(), done: Boolean(c.done) }))
    .filter((c) => c.text.length > 0);
  return cleaned.length > 0 ? cleaned : undefined;
}

const ERRAND_QTY_MAX = 48;
const ERRAND_NOTE_MAX = 200;

function normalizeErrandLocations(
  raw:
    | Array<{
        id: string;
        name: string;
        completed?: boolean;
        items: Array<{
          id: string;
          name: string;
          completed: boolean;
          quantity?: string;
          note?: string;
        }>;
      }>
    | undefined
):
  | Array<{
      id: string;
      name: string;
      completed: boolean;
      items: Array<{
        id: string;
        name: string;
        completed: boolean;
        quantity?: string;
        note?: string;
      }>;
    }>
  | undefined {
  if (!raw || raw.length === 0) return undefined;
  const out: Array<{
    id: string;
    name: string;
    completed: boolean;
    items: Array<{
      id: string;
      name: string;
      completed: boolean;
      quantity?: string;
      note?: string;
    }>;
  }> = [];
  for (const loc of raw) {
    const id = (loc.id ?? "").trim();
    const name = (loc.name ?? "").trim();
    const items = (loc.items ?? [])
      .map((it) => {
        const qty = (it.quantity ?? "").trim().slice(0, ERRAND_QTY_MAX);
        const note = (it.note ?? "").trim().slice(0, ERRAND_NOTE_MAX);
        return {
          id: (it.id ?? "").trim(),
          name: (it.name ?? "").trim(),
          completed: Boolean(it.completed),
          quantity: qty.length > 0 ? qty : undefined,
          note: note.length > 0 ? note : undefined,
        };
      })
      .filter((it) => it.name.length > 0 && it.id.length > 0);
    if (!id) continue;
    if (!name && items.length === 0) continue;
    let completed = Boolean(loc.completed);
    if (items.length > 0 && items.every((i) => i.completed)) {
      completed = true;
    }
    if (items.length > 0 && items.some((i) => !i.completed)) {
      completed = false;
    }
    out.push({
      id,
      name: name || "Untitled store",
      completed,
      items,
    });
  }
  return out.length > 0 ? out : undefined;
}

export const update = mutation({
  args: {
    id: v.id("tasks"),
    ...taskInput,
    ...orgScopeArgs,
    actorUserKey: v.optional(v.string()),
  },
  handler: async (ctx, { id, organizationId, memberUserKey, actorUserKey, ...rest }) => {
    const actor = await requireTaskOrg(ctx, organizationId, memberUserKey);
    if (!rest.title.trim()) {
      throw new Error("Title is required");
    }
    const existing = await loadTaskInOrg(ctx, id, organizationId, memberUserKey, "mutate");
    if (rest.parentTaskId) {
      const parent = await ctx.db.get(rest.parentTaskId);
      if (!parent) {
        throw new Error("parentTaskId: parent task not found");
      }
      if (parent._id === id) {
        throw new Error("Task cannot be its own parent");
      }
    }
    if (rest.relatedFileId) {
      const file = await ctx.db.get(rest.relatedFileId);
      if (!file) {
        throw new Error("relatedFileId: pipeline row not found");
      }
    }
    await assertRelatedContactExists(ctx, rest.relatedContactId);
    await assertTaskRelationsInOrg(
      ctx,
      organizationId,
      rest.relatedFileId,
      rest.relatedContactId,
      rest.parentTaskId,
    );
    const now = Date.now();
    const wasDone = existing.status === "done";
    const isDone = rest.status === "done";
    const completedAt = isDone
      ? wasDone
        ? existing.completedAt ?? now
        : now
      : undefined;
    await ctx.db.patch(id, {
      title: rest.title.trim(),
      description: rest.description?.trim() || undefined,
      type: rest.type,
      category: rest.category,
      quadrant: rest.quadrant,
      quadrantPosition: await resolveQuadrantPositionOnUpdate(ctx, existing, rest),
      status: rest.status,
      priority: rest.priority,
      dueDate: rest.dueDate,
      startDate: rest.startDate,
      parentTaskId: rest.parentTaskId,
      relatedFileId: rest.relatedFileId,
      relatedContactId: rest.relatedContactId,
      assigneeId: rest.assigneeId?.trim() || undefined,
      sharedWithIds:
        rest.sharedWithIds && rest.sharedWithIds.length > 0
          ? rest.sharedWithIds
          : undefined,
      recurrence: rest.recurrence,
      links: normalizeLinks(rest.links),
      linkedTaskIds:
        rest.linkedTaskIds && rest.linkedTaskIds.length > 0
          ? rest.linkedTaskIds
          : undefined,
      checklist: normalizeChecklist(rest.checklist),
      errandLocations: normalizeErrandLocations(rest.errandLocations),
      completedAt,
      snoozedUntil:
        rest.snoozedUntil && rest.snoozedUntil > 0
          ? rest.snoozedUntil
          : undefined,
      reminderAt:
        rest.reminderAt && rest.reminderAt > 0 ? rest.reminderAt : undefined,
      createdAt: existing.createdAt,
      updatedAt: now,
    });
    const updatedRow = await ctx.db.get(id);
    if (updatedRow) {
      await appendTaskFeed(
        ctx,
        updatedRow,
        "task_updated",
        `Updated task “${updatedRow.title.trim()}”`,
        actorUserKey ?? actor,
      );
      await syncAssigneeNotification(
        ctx,
        existing,
        updatedRow,
        actorUserKey ?? actor,
      );
    }
    await syncIndexedGraphTaskEdge(ctx, id, {
      previousFileId: existing.relatedFileId,
      actor: actorUserKey ?? actor,
    });
    await refreshTaskGlobalSearchText(ctx, id);
    return { id };
  },
});

// ---------- Targeted mutations (avoid round-tripping the whole row) ----------

/**
 * Move a task to a different Eisenhower quadrant. Optimized for drag-
 * and-drop on the matrix — no other field round-trips.
 */
export const setQuadrant = mutation({
  args: { id: v.id("tasks"), quadrant: v.number(), ...orgScopeArgs },
  handler: async (ctx, { id, quadrant, organizationId, memberUserKey }) => {
    await requireTaskOrg(ctx, organizationId, memberUserKey);
    const t = await loadTaskInOrg(ctx, id, organizationId, memberUserKey, "mutate");
    if (![1, 2, 3, 4].includes(quadrant)) {
      throw new Error("quadrant must be 1, 2, 3, or 4");
    }
    if (t.quadrant === quadrant) return { id, quadrant };
    const now = Date.now();
    const nextPos =
      t.parentTaskId == null
        ? await nextQuadrantPositionForParent(ctx, quadrant, organizationId)
        : undefined;
    await ctx.db.patch(id, {
      quadrant,
      quadrantPosition: nextPos,
      createdAt: t.createdAt,
      updatedAt: now,
    });
    return { id, quadrant };
  },
});

/**
 * Persist manual order for top-level tasks in one Eisenhower quadrant.
 * `orderedParentIds` is the desired order (first = highest priority slot).
 * Any other top-level tasks in the same quadrant not listed are appended
 * in stable order so filtered UIs cannot corrupt the full quadrant.
 */
export const reorderInQuadrant = mutation({
  args: {
    /** Top-level tasks in one quadrant, in desired execution order (first = top). */
    orderedParentIds: v.array(v.id("tasks")),
    ...orgScopeArgs,
  },
  handler: async (ctx, { orderedParentIds, organizationId, memberUserKey }) => {
    await requireTaskOrg(ctx, organizationId, memberUserKey);
    if (orderedParentIds.length === 0) {
      return { ok: true as const, count: 0 };
    }
    const first = await ctx.db.get(orderedParentIds[0]);
    if (
      !first ||
      first.parentTaskId != null ||
      first.organizationId !== organizationId
    ) {
      throw new Error("reorderInQuadrant: invalid first task");
    }
    const quadrant = first.quadrant;
    const rows = await ctx.db
      .query("tasks")
      .withIndex("by_quadrant", (q) => q.eq("quadrant", quadrant))
      .collect();
    const parents = rows.filter(
      (t) =>
        t.parentTaskId == null && t.organizationId === organizationId,
    );
    const parentById = new Map(parents.map((p) => [p._id, p] as const));
    const seen = new Set<string>();
    for (const id of orderedParentIds) {
      if (seen.has(id)) {
        throw new Error("Duplicate task id in order");
      }
      seen.add(id);
      const row = parentById.get(id);
      if (!row || row.quadrant !== quadrant) {
        throw new Error("Task is not a top-level task in this quadrant");
      }
    }
    const headSet = new Set(orderedParentIds);
    const tail = parents
      .filter((p) => !headSet.has(p._id))
      .sort((a, b) => {
        const pa = a.quadrantPosition ?? 1e15;
        const pb = b.quadrantPosition ?? 1e15;
        if (pa !== pb) return pa - pb;
        return a._creationTime - b._creationTime;
      });
    const finalOrder = [...orderedParentIds, ...tail.map((t) => t._id)];
    const now = Date.now();
    for (let i = 0; i < finalOrder.length; i++) {
      const id = finalOrder[i];
      const t = parentById.get(id)!;
      await ctx.db.patch(id, {
        quadrantPosition: i,
        quadrant,
        createdAt: t.createdAt,
        updatedAt: now,
      });
    }
    return { ok: true as const, count: finalOrder.length };
  },
});

/**
 * Patch any subset of editable fields on a task (analogous to
 * `pipeline.patch`). All fields are optional; only those explicitly
 * provided are updated. Use `null` on optional scalar fields to clear.
 */
export const patch = mutation({
  args: {
    id: v.id("tasks"),
    /**
     * Optional optimistic lock — must match `tasks.updatedAt` or the mutation
     * throws `CONFLICT_DATA_CHANGED` (offline / concurrent edit guard).
     */
    expectedUpdatedAt: v.optional(v.number()),
    title: v.optional(v.string()),
    description: v.optional(v.union(v.string(), v.null())),
    type: v.optional(taskType),
    category: v.optional(taskCategory),
    quadrant: v.optional(v.number()),
    status: v.optional(taskStatus),
    priority: v.optional(v.number()),
    dueDate: v.optional(v.union(v.number(), v.null())),
    startDate: v.optional(v.union(v.number(), v.null())),
    parentTaskId: v.optional(v.union(v.id("tasks"), v.null())),
    relatedFileId: v.optional(v.union(v.id("pipeline"), v.null())),
    relatedContactId: v.optional(v.union(v.id("contacts"), v.null())),
    assigneeId: v.optional(v.union(v.string(), v.null())),
    sharedWithIds: v.optional(v.array(v.string())),
    recurrence: v.optional(v.union(recurrenceArg, v.null())),
    links: v.optional(v.array(linkItem)),
    linkedTaskIds: v.optional(v.array(v.id("tasks"))),
    checklist: v.optional(v.array(checklistItem)),
    errandLocations: v.optional(v.union(v.array(errandLocation), v.null())),
    snoozedUntil: v.optional(v.union(v.number(), v.null())),
    reminderAt: v.optional(v.union(v.number(), v.null())),
    highlightColorId: v.optional(v.union(v.string(), v.null())),
    triageLabelId: v.optional(v.union(v.id("organizationTriageLabels"), v.null())),
    isUrgent: v.optional(v.union(v.boolean(), v.null())),
    scheduledTriggerTime: v.optional(v.union(v.number(), v.null())),
    quadrantPosition: v.optional(v.union(v.number(), v.null())),
    actorUserKey: v.optional(v.string()),
    ...orgScopeArgs,
  },
  handler: async (ctx, args) => {
    const {
      id,
      actorUserKey,
      expectedUpdatedAt,
      organizationId,
      memberUserKey,
      ...rest
    } = args;
    const actor = await requireTaskOrg(ctx, organizationId, memberUserKey);
    const existing = await loadTaskInOrg(ctx, id, organizationId, memberUserKey, "mutate");
    if (
      expectedUpdatedAt !== undefined &&
      existing.updatedAt !== expectedUpdatedAt
    ) {
      throw new Error("CONFLICT_DATA_CHANGED");
    }
    const now = Date.now();
    const patchObj: Record<string, unknown> = { updatedAt: now };

    if (rest.title !== undefined) {
      const trimmed = rest.title.trim();
      if (!trimmed) throw new Error("title must not be empty");
      patchObj.title = trimmed;
    }
    if (rest.description !== undefined) {
      const v2 =
        rest.description === null ? undefined : rest.description.trim();
      patchObj.description = v2 || undefined;
    }
    if (rest.type !== undefined) patchObj.type = rest.type;
    if (rest.category !== undefined) patchObj.category = rest.category;
    if (rest.quadrant !== undefined) {
      if (![1, 2, 3, 4].includes(rest.quadrant)) {
        throw new Error("quadrant must be 1, 2, 3, or 4");
      }
      patchObj.quadrant = rest.quadrant;
    }
    if (rest.status !== undefined) {
      patchObj.status = rest.status;
      const wasDone = existing.status === "done";
      const isDone = rest.status === "done";
      patchObj.completedAt = isDone
        ? wasDone
          ? existing.completedAt ?? now
          : now
        : undefined;
    }
    if (rest.priority !== undefined) patchObj.priority = rest.priority;
    if (rest.dueDate !== undefined) {
      patchObj.dueDate = rest.dueDate === null ? undefined : rest.dueDate;
    }
    if (rest.startDate !== undefined) {
      patchObj.startDate = rest.startDate === null ? undefined : rest.startDate;
    }
    if (rest.parentTaskId !== undefined) {
      if (rest.parentTaskId === null) {
        patchObj.parentTaskId = undefined;
      } else {
        if (rest.parentTaskId === id) {
          throw new Error("Task cannot be its own parent");
        }
        const parent = await ctx.db.get(rest.parentTaskId);
        if (!parent) throw new Error("parentTaskId: parent task not found");
        patchObj.parentTaskId = rest.parentTaskId;
      }
    }
    if (rest.relatedFileId !== undefined) {
      if (rest.relatedFileId === null) {
        patchObj.relatedFileId = undefined;
      } else {
        const f = await ctx.db.get(rest.relatedFileId);
        if (!f) throw new Error("relatedFileId: pipeline row not found");
        patchObj.relatedFileId = rest.relatedFileId;
      }
    }
    if (rest.relatedContactId !== undefined) {
      if (rest.relatedContactId === null) {
        patchObj.relatedContactId = undefined;
      } else {
        await assertRelatedContactExists(ctx, rest.relatedContactId);
        patchObj.relatedContactId = rest.relatedContactId;
      }
    }
    if (rest.assigneeId !== undefined) {
      const v2 = rest.assigneeId === null ? undefined : rest.assigneeId.trim();
      patchObj.assigneeId = v2 || undefined;
    }
    if (rest.sharedWithIds !== undefined) {
      patchObj.sharedWithIds =
        rest.sharedWithIds.length === 0 ? undefined : rest.sharedWithIds;
    }
    if (rest.recurrence !== undefined) {
      patchObj.recurrence =
        rest.recurrence === null ? undefined : rest.recurrence;
    }
    if (rest.links !== undefined) {
      patchObj.links = normalizeLinks(rest.links);
    }
    if (rest.linkedTaskIds !== undefined) {
      patchObj.linkedTaskIds =
        rest.linkedTaskIds.length === 0 ? undefined : rest.linkedTaskIds;
    }
    if (rest.checklist !== undefined) {
      patchObj.checklist = normalizeChecklist(rest.checklist);
    }
    if (rest.errandLocations !== undefined) {
      patchObj.errandLocations =
        rest.errandLocations === null
          ? undefined
          : normalizeErrandLocations(rest.errandLocations);
    }
    if (rest.snoozedUntil !== undefined) {
      patchObj.snoozedUntil =
        rest.snoozedUntil === null || rest.snoozedUntil <= 0
          ? undefined
          : rest.snoozedUntil;
    }
    if (rest.reminderAt !== undefined) {
      patchObj.reminderAt =
        rest.reminderAt === null || rest.reminderAt <= 0
          ? undefined
          : rest.reminderAt;
    }
    if (
      rest.highlightColorId !== undefined ||
      rest.triageLabelId !== undefined ||
      rest.isUrgent !== undefined ||
      rest.scheduledTriggerTime !== undefined
    ) {
      const nextTriageLabelId =
        rest.triageLabelId !== undefined
          ? rest.triageLabelId === null
            ? undefined
            : rest.triageLabelId
          : existing.triageLabelId;
      const nextScheduledTriggerTime =
        rest.scheduledTriggerTime !== undefined
          ? rest.scheduledTriggerTime === null ||
            rest.scheduledTriggerTime <= 0
            ? undefined
            : rest.scheduledTriggerTime
          : existing.scheduledTriggerTime;
      const resolved = await assertAndResolveTaskTriageFields(ctx, organizationId, {
        triageLabelId: nextTriageLabelId,
        scheduledTriggerTime: nextScheduledTriggerTime,
      });
      patchObj.triageLabelId = resolved.triageLabelId;
      patchObj.highlightColorId = resolved.highlightColorId;
      patchObj.scheduledTriggerTime = resolved.scheduledTriggerTime;
      patchObj.isUrgent = undefined;
      if (rest.triageLabelId !== undefined) {
        const appliedAt = nextLabelAppliedAt(
          existing.triageLabelId,
          nextTriageLabelId,
          Date.now(),
        );
        if (appliedAt !== null) {
          patchObj.labelAppliedAt = appliedAt;
        }
      }
    }
    if (rest.quadrantPosition !== undefined) {
      patchObj.quadrantPosition =
        rest.quadrantPosition === null ? undefined : rest.quadrantPosition;
    }

    const nextParent =
      rest.parentTaskId !== undefined
        ? rest.parentTaskId === null
          ? undefined
          : rest.parentTaskId
        : existing.parentTaskId;
    const nextFile =
      rest.relatedFileId !== undefined
        ? rest.relatedFileId === null
          ? undefined
          : rest.relatedFileId
        : existing.relatedFileId;
    const nextContact =
      rest.relatedContactId !== undefined
        ? rest.relatedContactId === null
          ? undefined
          : rest.relatedContactId
        : existing.relatedContactId;
    await assertTaskRelationsInOrg(
      ctx,
      organizationId,
      nextFile,
      nextContact,
      nextParent,
    );

    await ctx.db.patch(id, patchObj);
    const updated = await ctx.db.get(id);
    if (updated) {
      await syncIndexedGraphTaskEdge(ctx, id, {
        previousFileId: existing.relatedFileId,
        actor: actorUserKey ?? actor,
      });
      if (rest.status !== undefined && existing.status !== rest.status) {
        await appendTaskFeed(
          ctx,
          updated,
          "task_status_changed",
          `Task “${updated.title.trim()}” → ${rest.status}`,
          actorUserKey ?? actor,
        );
      }
      if (rest.assigneeId !== undefined) {
        await syncAssigneeNotification(
          ctx,
          existing,
          updated,
          actorUserKey ?? actor,
        );
      }
      if (rest.description !== undefined) {
        const prev = existing.description ?? "";
        const next =
          rest.description === null ? "" : rest.description.trim();
        for (const h of newMentionHandlesOnly(prev, next)) {
          await dispatchUserNotification(ctx, {
            userKey: h,
            category: "mention",
            summary: `You were mentioned on task “${updated.title.trim()}”`,
            actorUserKey: actorUserKey ?? actor,
            taskId: updated._id,
          });
        }
      }
      if (rest.title !== undefined) {
        const prev = existing.title;
        const next = rest.title.trim();
        for (const h of newMentionHandlesOnly(prev, next)) {
          await dispatchUserNotification(ctx, {
            userKey: h,
            category: "mention",
            summary: `You were mentioned in the title of “${next}”`,
            actorUserKey: actorUserKey ?? actor,
            taskId: updated._id,
          });
        }
      }
    }
    await refreshTaskGlobalSearchText(ctx, id);
    return { id };
  },
});

/**
 * Sleep a task until `until` (Unix ms). Hides it from the default Matrix /
 * Today / Week / Long-term views and from "overdue" counts. The UI checks
 * `snoozedUntil > Date.now()` lazily, so once `until` passes the task
 * automatically reappears — no cron required. Status is forced back to
 * "todo" so a previously-archived task can't be silently revived as done.
 */
export const snooze = mutation({
  args: { id: v.id("tasks"), until: v.number(), ...orgScopeArgs },
  handler: async (ctx, { id, until, organizationId, memberUserKey }) => {
    await requireTaskOrg(ctx, organizationId, memberUserKey);
    if (!Number.isFinite(until) || until <= Date.now()) {
      throw new Error("snooze: 'until' must be a future timestamp");
    }
    const t = await loadTaskInOrg(ctx, id, organizationId, memberUserKey, "mutate");
    const now = Date.now();
    await ctx.db.patch(id, {
      snoozedUntil: until,
      status: t.status === "done" || t.status === "archived" ? "todo" : t.status,
      completedAt:
        t.status === "done" || t.status === "archived" ? undefined : t.completedAt,
      updatedAt: now,
    });
    return { id, until };
  },
});

/**
 * Phase 32.4 — wake a snoozed task: clear snooze, file timeline note, activity feed.
 */
export const wakeUpTask = mutation({
  args: {
    id: v.id("tasks"),
    actorUserKey: v.optional(v.string()),
    ...orgScopeArgs,
  },
  handler: async (ctx, args) => {
    const actor = await requireTaskOrg(ctx, args.organizationId, args.memberUserKey);
    const t = await loadTaskInOrg(
      ctx,
      args.id,
      args.organizationId,
      args.memberUserKey,
      "mutate",
    );

    const wasSnoozed =
      t.snoozedUntil != null && t.snoozedUntil > Date.now();
    if (!wasSnoozed && t.snoozedUntil == null) {
      return { id: args.id, woke: false as const };
    }

    const now = Date.now();
    await ctx.db.patch(args.id, {
      snoozedUntil: undefined,
      updatedAt: now,
    });

    const identity = await ctx.auth.getUserIdentity();
    const authorUserKey =
      identity?.subject?.trim() ||
      args.actorUserKey?.trim() ||
      args.memberUserKey?.trim() ||
      actor;

    const taskTitle = t.title.trim() || "Untitled task";
    let reactivationNoteId: Id<"pipelineFileNotes"> | null = null;

    if (t.relatedFileId && authorUserKey) {
      const file = await ctx.db.get(t.relatedFileId);
      if (file && file.organizationId === args.organizationId) {
        try {
          await assertCanMutatePipelineRow(
            ctx,
            file,
            args.memberUserKey,
            "task_wake",
          );
          reactivationNoteId = await ctx.db.insert("pipelineFileNotes", {
            organizationId: args.organizationId,
            pipelineFileId: t.relatedFileId,
            authorUserKey,
            content: `Task manually reactivated: ${taskTitle}`,
            linkedTaskId: args.id,
            linkedTaskTitle: taskTitle,
          });
        } catch {
          /* file note is best-effort when pipeline mutate ACL fails */
        }
      }
    }

    const updated = await ctx.db.get(args.id);
    if (updated) {
      await appendTaskFeed(
        ctx,
        updated,
        "task_wake",
        `Reactivated “${taskTitle}” (snooze cleared)`,
        args.actorUserKey ?? actor,
      );
    }

    return {
      id: args.id,
      woke: true as const,
      reactivationNoteId,
    };
  },
});

/**
 * Wake a snoozed task immediately (clears `snoozedUntil`).
 * @deprecated Prefer `wakeUpTask` for pipeline timeline audit note.
 */
export const wake = mutation({
  args: { id: v.id("tasks"), ...orgScopeArgs },
  handler: async (ctx, args) => {
    const actor = await requireTaskOrg(ctx, args.organizationId, args.memberUserKey);
    const t = await loadTaskInOrg(ctx, args.id, args.organizationId, args.memberUserKey, "mutate");
    if (t.snoozedUntil == null) return { id: args.id, woke: false as const };
    const now = Date.now();
    await ctx.db.patch(args.id, {
      snoozedUntil: undefined,
      updatedAt: now,
    });
    return { id: args.id, woke: true as const };
  },
});

const taskSnoozePresetArg = v.union(
  v.literal("next_morning"),
  v.literal("3_days"),
  v.literal("5_days"),
  v.literal("1_week"),
);

/**
 * Phase 32.2 — log a follow-up attempt: increment counter, snooze task, file note.
 */
export const recordTaskAttempt = mutation({
  args: {
    id: v.id("tasks"),
    content: v.string(),
    snoozePreset: taskSnoozePresetArg,
    actorUserKey: v.optional(v.string()),
    ...orgScopeArgs,
  },
  handler: async (ctx, args) => {
    const actor = await requireTaskOrg(ctx, args.organizationId, args.memberUserKey);
    const t = await loadTaskInOrg(
      ctx,
      args.id,
      args.organizationId,
      args.memberUserKey,
      "mutate",
    );

    const content = args.content.trim();
    if (!content) {
      throw new Error("Attempt note is required.");
    }

    const fileId = t.relatedFileId;
    if (!fileId) {
      throw new Error("Task must be linked to a pipeline file to log an attempt.");
    }

    const file = await ctx.db.get(fileId);
    if (!file || file.organizationId !== args.organizationId) {
      throw new Error("Pipeline file not found for this task.");
    }
    await assertCanMutatePipelineRow(
      ctx,
      file,
      args.memberUserKey,
      "task_attempt",
    );

    const now = Date.now();
    const snoozeDefaults = await readTaskSnoozeDefaultsForOrg(
      ctx,
      args.organizationId,
    );
    const until = computeSnoozeUntilFromPreset(
      args.snoozePreset as TaskSnoozePresetKey,
      now,
      snoozeDefaults,
    );
    if (!Number.isFinite(until) || until <= now) {
      throw new Error("Snooze time must be in the future.");
    }

    const prevCount = t.attemptCount ?? 0;
    const attemptNumber = prevCount + 1;

    const identity = await ctx.auth.getUserIdentity();
    const authorUserKey =
      identity?.subject?.trim() ||
      args.actorUserKey?.trim() ||
      args.memberUserKey?.trim() ||
      actor;
    if (!authorUserKey) {
      throw new Error("Sign in required to log an attempt");
    }

    const taskTitle = t.title.trim() || "Untitled task";

    const noteId = await ctx.db.insert("pipelineFileNotes", {
      organizationId: args.organizationId,
      pipelineFileId: fileId,
      authorUserKey,
      content,
      noteKind: "attempt",
      linkedTaskId: args.id,
      linkedTaskTitle: taskTitle,
      attemptNumber,
    });

    await ctx.db.patch(args.id, {
      attemptCount: attemptNumber,
      lastAttemptAt: now,
      snoozedUntil: until,
      status:
        t.status === "done" || t.status === "archived" ? "todo" : t.status,
      completedAt:
        t.status === "done" || t.status === "archived"
          ? undefined
          : t.completedAt,
      updatedAt: now,
    });

    const updated = await ctx.db.get(args.id);
    if (updated) {
      await appendTaskFeed(
        ctx,
        updated,
        "task_attempt",
        `Logged attempt #${attemptNumber} on “${updated.title.trim()}”`,
        args.actorUserKey ?? actor,
      );
    }

    return {
      id: args.id,
      noteId,
      attemptNumber,
      snoozedUntil: until,
    };
  },
});

/**
 * Symmetric link between two tasks ("see also"). Both rows get the other
 * id appended to their `linkedTaskIds`. Self-links and duplicate links
 * are no-ops.
 */
export const linkTasks = mutation({
  args: { a: v.id("tasks"), b: v.id("tasks"), ...orgScopeArgs },
  handler: async (ctx, { a, b, organizationId, memberUserKey }) => {
    await requireTaskOrg(ctx, organizationId, memberUserKey);
    if (a === b) throw new Error("Cannot link a task to itself");
    const ra = await loadTaskInOrg(ctx, a, organizationId, memberUserKey, "mutate");
    const rb = await loadTaskInOrg(ctx, b, organizationId, memberUserKey, "mutate");
    const now = Date.now();
    const aLinks = ra.linkedTaskIds ?? [];
    const bLinks = rb.linkedTaskIds ?? [];
    if (!aLinks.includes(b)) {
      await ctx.db.patch(a, {
        linkedTaskIds: [...aLinks, b],
        updatedAt: now,
      });
    }
    if (!bLinks.includes(a)) {
      await ctx.db.patch(b, {
        linkedTaskIds: [...bLinks, a],
        updatedAt: now,
      });
    }
    return { ok: true };
  },
});

export const unlinkTasks = mutation({
  args: { a: v.id("tasks"), b: v.id("tasks"), ...orgScopeArgs },
  handler: async (ctx, { a, b, organizationId, memberUserKey }) => {
    await requireTaskOrg(ctx, organizationId, memberUserKey);
    const ra = await loadTaskInOrg(ctx, a, organizationId, memberUserKey, "mutate");
    const rb = await loadTaskInOrg(ctx, b, organizationId, memberUserKey, "mutate");
    const now = Date.now();
    const aLinks = (ra.linkedTaskIds ?? []).filter((x) => x !== b);
    const bLinks = (rb.linkedTaskIds ?? []).filter((x) => x !== a);
    await ctx.db.patch(a, {
      linkedTaskIds: aLinks.length === 0 ? undefined : aLinks,
      updatedAt: now,
    });
    await ctx.db.patch(b, {
      linkedTaskIds: bLinks.length === 0 ? undefined : bLinks,
      updatedAt: now,
    });
    return { ok: true as const };
  },
});

/**
 * Quick-add a subtask under `parentId` and inherit the parent's
 * type / category / quadrant so the matrix stays consistent.
 */
export const addSubtask = mutation({
  args: { parentId: v.id("tasks"), title: v.string(), ...orgScopeArgs },
  handler: async (ctx, { parentId, title, organizationId, memberUserKey }) => {
    await requireTaskOrg(ctx, organizationId, memberUserKey);
    const parent = await loadTaskInOrg(ctx, parentId, organizationId, memberUserKey, "mutate");
    const t = title.trim();
    if (!t) throw new Error("Subtask title is required");
    const now = Date.now();
    const id = await ctx.db.insert("tasks", {
      title: t,
      type: parent.type,
      category: parent.category,
      quadrant: parent.quadrant,
      status: "todo",
      priority: parent.priority,
      parentTaskId: parentId,
      organizationId,
      createdAt: now,
      updatedAt: now,
    });
    await refreshTaskGlobalSearchText(ctx, id);
    await syncIndexedGraphTaskEdge(ctx, id, {
      previousFileId: parent.relatedFileId,
      actor: memberUserKey,
    });
    return { id };
  },
});

// ---------- Task files (`_storage` + `taskAttachments`; upload URL: lenderFiles:generateUploadUrl) ----------

const TASK_FILE_MAX_NAME_LEN = 255;
const TASK_FILE_MAX_BYTES = 80 * 1024 * 1024;
const TASK_FILES_LIST_CAP = 500;

function safeTaskAttachmentFileName(name: string) {
  const base = name.replace(/[/\\]/g, "").trim() || "file";
  return base.slice(0, TASK_FILE_MAX_NAME_LEN);
}

async function getTaskFileStorageMetadataWithRetry(
  storage: MutationCtx["storage"],
  storageId: Id<"_storage">,
  { attempts = 15, delayMs = 100 }: { attempts?: number; delayMs?: number } = {}
) {
  for (let i = 0; i < attempts; i++) {
    const meta = await storage.getMetadata(storageId);
    if (meta) return meta;
    if (i < attempts - 1) {
      await new Promise<void>((r) => setTimeout(r, delayMs));
    }
  }
  return null;
}

async function deleteAllAttachmentsForTasks(
  ctx: Pick<MutationCtx, "db" | "storage">,
  taskIds: Id<"tasks">[]
): Promise<number> {
  let removed = 0;
  for (const taskId of taskIds) {
    const rows = await ctx.db
      .query("taskAttachments")
      .withIndex("by_task", (q) => q.eq("taskId", taskId))
      .collect();
    for (const a of rows) {
      try {
        await ctx.storage.delete(a.storageId);
      } catch {
        /* blob may already be gone */
      }
      await ctx.db.delete(a._id);
      removed += 1;
    }
  }
  return removed;
}

export const addTaskFile = mutation({
  args: {
    taskId: v.id("tasks"),
    storageId: v.id("_storage"),
    fileName: v.string(),
    contentType: v.optional(v.string()),
    size: v.optional(v.number()),
    label: v.optional(v.string()),
    ...orgScopeArgs,
  },
  handler: async (ctx, args) => {
    await requireTaskOrg(ctx, args.organizationId, args.memberUserKey);
    const task = await loadTaskInOrg(
      ctx,
      args.taskId,
      args.organizationId,
      args.memberUserKey,
      "mutate",
    );
    const meta = await getTaskFileStorageMetadataWithRetry(
      ctx.storage,
      args.storageId
    );
    if (!meta) {
      throw new Error(
        "Upload not found. Try again, or check that the file was POSTed to the upload URL and Convex file storage is enabled for this deployment."
      );
    }
    const byteSize = args.size ?? meta.size ?? 0;
    if (typeof byteSize === "number" && byteSize > TASK_FILE_MAX_BYTES) {
      try {
        await ctx.storage.delete(args.storageId);
      } catch {
        /* best-effort */
      }
      throw new Error(
        `File exceeds maximum size (${Math.round(TASK_FILE_MAX_BYTES / (1024 * 1024))} MB).`
      );
    }
    const fileName = safeTaskAttachmentFileName(args.fileName);
    const contentType = args.contentType || meta.contentType || undefined;
    const id = await ctx.db.insert("taskAttachments", {
      taskId: args.taskId,
      organizationId: task.organizationId,
      storageId: args.storageId,
      fileName,
      contentType,
      size: args.size ?? meta.size,
      label: args.label?.trim() || undefined,
      createdAt: Date.now(),
    });
    return id;
  },
});

export const removeTaskFile = mutation({
  args: { id: v.id("taskAttachments"), ...orgScopeArgs },
  handler: async (ctx, { id, organizationId, memberUserKey }) => {
    await requireTaskOrg(ctx, organizationId, memberUserKey);
    try {
      const row = await ctx.db.get(id);
      if (!row) return { ok: false as const };
      const task = await ctx.db.get(row.taskId);
      if (!task || task.organizationId !== organizationId) {
        return { ok: false as const };
      }
      try {
        await ctx.storage.delete(row.storageId);
      } catch {
        /* best-effort */
      }
      await ctx.db.delete(id);
      return { ok: true as const };
    } catch {
      return { ok: false as const };
    }
  },
});

export const updateTaskFileLabel = mutation({
  args: {
    id: v.id("taskAttachments"),
    label: v.optional(v.string()),
    ...orgScopeArgs,
  },
  handler: async (ctx, { id, label, organizationId, memberUserKey }) => {
    await requireTaskOrg(ctx, organizationId, memberUserKey);
    const row = await ctx.db.get(id);
    if (!row) throw new Error("Attachment not found");
    const task = await ctx.db.get(row.taskId);
    if (!task || task.organizationId !== organizationId) {
      throw new Error("Attachment not found");
    }
    const next = label?.trim() || undefined;
    await ctx.db.patch(id, { label: next });
    return { ok: true as const };
  },
});

export const listTaskFiles = query({
  args: {
    taskId: v.id("tasks"),
    limit: v.optional(v.number()),
    ...orgScopeArgs,
  },
  handler: async (ctx, { taskId, limit, organizationId, memberUserKey }) => {
    try {
      await requireTaskOrg(ctx, organizationId, memberUserKey);
      let task: Doc<"tasks">;
      try {
        task = await loadTaskInOrg(ctx, taskId, organizationId, memberUserKey, "read");
      } catch {
        return [];
      }

      const cap = Math.min(
        TASK_FILES_LIST_CAP,
        Math.max(1, Math.floor(limit ?? TASK_FILES_LIST_CAP))
      );
      const rows = await ctx.db
        .query("taskAttachments")
        .withIndex("by_task_createdAt", (q) => q.eq("taskId", taskId))
        .order("desc")
        .take(cap);

      const out: Array<{
        _id: Id<"taskAttachments">;
        _creationTime: number;
        taskId: Id<"tasks">;
        storageId: Id<"_storage">;
        fileName: string;
        contentType: string | undefined;
        size: number | undefined;
        label: string | undefined;
        createdAt: number;
        url: string | null;
      }> = [];

      for (const r of rows) {
        let url: string | null = null;
        try {
          url = await ctx.storage.getUrl(r.storageId);
        } catch {
          url = null;
        }
        out.push({
          _id: r._id,
          _creationTime: r._creationTime,
          taskId: r.taskId,
          storageId: r.storageId,
          fileName: r.fileName,
          contentType: r.contentType,
          size: r.size,
          label: r.label,
          createdAt: r.createdAt,
          url,
        });
      }
      return out;
    } catch {
      return [];
    }
  },
});

export const countTaskFilesForTasks = query({
  args: { taskIds: v.array(v.id("tasks")), ...orgScopeArgs },
  handler: async (ctx, { taskIds, organizationId, memberUserKey }) => {
    await requireTaskOrg(ctx, organizationId, memberUserKey);
    const CHUNK = 300;
    const zerosFor = (ids: Id<"tasks">[]) => {
      const z: Record<string, number> = {};
      for (const tid of ids) z[tid] = 0;
      return z;
    };
    const unique = [...new Set(taskIds)];
    if (unique.length === 0) return {};
    const out: Record<string, number> = {};

    const countForTask = async (tid: Id<"tasks">) => {
      try {
        await loadTaskInOrg(ctx, tid, organizationId, memberUserKey, "read");
        const rows = await ctx.db
          .query("taskAttachments")
          .withIndex("by_task", (q) => q.eq("taskId", tid))
          .collect();
        return rows.length;
      } catch {
        return 0;
      }
    };

    try {
      for (let i = 0; i < unique.length; i += CHUNK) {
        const slice = unique.slice(i, i + CHUNK);
        const counts = await Promise.all(slice.map((tid) => countForTask(tid)));
        for (let j = 0; j < slice.length; j++) {
          out[slice[j]!] = counts[j]!;
        }
      }
      return out;
    } catch {
      return zerosFor(unique);
    }
  },
});

// ---------- Read-side helpers ----------

export const byParent = query({
  args: { parentId: v.id("tasks"), ...orgScopeArgs },
  handler: async (ctx, { parentId, organizationId, memberUserKey }) => {
    await requireTaskOrg(ctx, organizationId, memberUserKey);
    await loadTaskInOrg(ctx, parentId, organizationId, memberUserKey, "read");
    const rows = await ctx.db
      .query("tasks")
      .withIndex("by_parent", (q) => q.eq("parentTaskId", parentId))
      .collect();
    return filterTaskRowsForMember(ctx, rows, organizationId, memberUserKey);
  },
});

export const byIds = query({
  args: { ids: v.array(v.id("tasks")), ...orgScopeArgs },
  handler: async (ctx, { ids, organizationId, memberUserKey }) => {
    await requireTaskOrg(ctx, organizationId, memberUserKey);
    const out: Array<Doc<"tasks">> = [];
    for (const id of ids) {
      try {
        const r = await loadTaskInOrg(ctx, id, organizationId, memberUserKey, "read");
        out.push(r);
      } catch {
        continue;
      }
    }
    return out;
  },
});

async function collectSubtreeTaskIds(
  ctx: MutationCtx,
  rootId: Doc<"tasks">["_id"]
): Promise<Doc<"tasks">["_id"][]> {
  const out: Doc<"tasks">["_id"][] = [];
  const queue: Doc<"tasks">["_id"][] = [rootId];
  while (queue.length) {
    const id = queue.shift()!;
    out.push(id);
    const children = await ctx.db
      .query("tasks")
      .withIndex("by_parent", (q) => q.eq("parentTaskId", id))
      .collect();
    for (const c of children) queue.push(c._id);
  }
  return out;
}

export async function insertDemoWorkspaceTask(
  ctx: MutationCtx,
  args: {
    organizationId: Id<"organizations">;
    memberUserKey: string;
    demoBundleId: string;
    title: string;
    description?: string;
    type: Doc<"tasks">["type"];
    category: Doc<"tasks">["category"];
    quadrant: number;
    status: Doc<"tasks">["status"];
    priority: number;
    dueDate?: number;
    relatedFileId?: Id<"pipeline">;
    relatedContactId?: Id<"contacts">;
    checklist?: Doc<"tasks">["checklist"];
  },
): Promise<Id<"tasks">> {
  const key = await resolveMemberUserKey(ctx, args.memberUserKey);
  await assertOrgMember(ctx, args.organizationId, key);
  await assertTaskRelationsInOrg(
    ctx,
    args.organizationId,
    args.relatedFileId,
    args.relatedContactId,
    undefined,
  );
  const now = Date.now();
  const nextPos = await nextQuadrantPositionForParent(
    ctx,
    args.quadrant,
    args.organizationId,
  );
  const id = await ctx.db.insert("tasks", {
    title: args.title.trim(),
    description: args.description?.trim() || undefined,
    type: args.type,
    category: args.category,
    quadrant: args.quadrant,
    quadrantPosition: nextPos,
    status: args.status,
    priority: args.priority,
    dueDate: args.dueDate,
    relatedFileId: args.relatedFileId,
    relatedContactId: args.relatedContactId,
    checklist: args.checklist,
    organizationId: args.organizationId,
    demoBundleId: args.demoBundleId,
    ...ownerUserIdFieldsForInsert(key),
    createdAt: now,
    updatedAt: now,
  });
  await refreshTaskGlobalSearchText(ctx, id);
  await syncIndexedGraphTaskEdge(ctx, id);
  return id;
}

export async function deleteDemoWorkspaceTaskTree(
  ctx: MutationCtx,
  rootId: Id<"tasks">,
): Promise<void> {
  const subtreeIds = await collectSubtreeTaskIds(ctx, rootId);
  await deleteAllAttachmentsForTasks(ctx, subtreeIds);
  await removeAllLibraryLinksForTasks(ctx, subtreeIds);
  for (const taskId of subtreeIds) {
    await removeAllFileTaskEdgesForTask(ctx, taskId);
  }
  for (let i = subtreeIds.length - 1; i >= 0; i--) {
    await ctx.db.delete(subtreeIds[i]!);
  }
}

export const remove = mutation({
  args: {
    id: v.id("tasks"),
    actorUserKey: v.optional(v.string()),
    ...orgScopeArgs,
  },
  handler: async (ctx, { id, actorUserKey, organizationId, memberUserKey }) => {
    const actor = await requireTaskOrg(ctx, organizationId, memberUserKey);
    const row = await loadTaskInOrg(ctx, id, organizationId, memberUserKey, "mutate");

    await appendTaskFeed(
      ctx,
      row,
      "task_deleted",
      `Deleted task “${row.title.trim()}”`,
      actorUserKey ?? actor,
    );

    const subtreeIds = await collectSubtreeTaskIds(ctx, id);
    await deleteAllAttachmentsForTasks(ctx, subtreeIds);
    await removeAllLibraryLinksForTasks(ctx, subtreeIds);

    for (const taskId of subtreeIds) {
      await removeAllFileTaskEdgesForTask(ctx, taskId);
    }

    for (let i = subtreeIds.length - 1; i >= 0; i--) {
      await ctx.db.delete(subtreeIds[i]!);
    }
    return { ok: true as const };
  },
});

// ---------- Recurrence + linking helpers ----------

/**
 * Tasks linked to a given pipeline file (for the drawer's task list section).
 */
export const byRelatedFile = query({
  args: { fileId: v.id("pipeline"), ...orgScopeArgs },
  handler: async (ctx, { fileId, organizationId, memberUserKey }) => {
    await requireTaskOrg(ctx, organizationId, memberUserKey);
    const file = await ctx.db.get(fileId);
    if (!file || file.organizationId !== organizationId) return [];
    await assertCanReadPipelineRow(ctx, file, memberUserKey);
    const rows = await ctx.db
      .query("tasks")
      .withIndex("by_relatedFile", (q) => q.eq("relatedFileId", fileId))
      .order("desc")
      .collect();
    // File read access is already proven — list every org task on this file.
    // (Phase 23.1) filterTaskRowsForMember hid drawer tasks after create when
    // task owner key did not match the viewer filter.
    return rows.filter((r) => r.organizationId === organizationId);
  },
});

/**
 * Compute the next due date for a recurrence rule given a starting
 * timestamp (typically the current `dueDate`, falling back to "now").
 * Returns `null` if `dueDate > endsOn` after the bump.
 */
function nextOccurrence(
  from: number,
  rule: { every: "day" | "week" | "month" | "year"; interval: number; endsOn?: number }
): number | null {
  const interval = Math.max(1, Math.floor(rule.interval || 1));
  const d = new Date(from);
  switch (rule.every) {
    case "day":
      d.setDate(d.getDate() + interval);
      break;
    case "week":
      d.setDate(d.getDate() + interval * 7);
      break;
    case "month":
      d.setMonth(d.getMonth() + interval);
      break;
    case "year":
      d.setFullYear(d.getFullYear() + interval);
      break;
  }
  const next = d.getTime();
  if (rule.endsOn && next > rule.endsOn) return null;
  return next;
}

/**
 * Mark a task done. If the task has a `recurrence` rule, also spawn a
 * fresh instance (same fields, new dueDate, status="todo") so the
 * series continues. Returns the id of the new instance (if any).
 */
export const complete = mutation({
  args: {
    id: v.id("tasks"),
    actorUserKey: v.optional(v.string()),
    ...orgScopeArgs,
  },
  handler: async (ctx, { id, actorUserKey, organizationId, memberUserKey }) => {
    const actor = await requireTaskOrg(ctx, organizationId, memberUserKey);
    const t = await loadTaskInOrg(ctx, id, organizationId, memberUserKey, "mutate");
    const now = Date.now();
    await ctx.db.patch(id, {
      status: "done",
      completedAt: now,
      updatedAt: now,
    });
    await refreshTaskGlobalSearchText(ctx, id);

    await appendTaskFeed(
      ctx,
      t,
      "task_completed",
      `Completed “${t.title.trim()}”`,
      actorUserKey ?? actor,
    );

    if (!t.recurrence) return { id, nextId: null as null };

    const base = t.dueDate ?? now;
    const nextDue = nextOccurrence(base, t.recurrence);
    if (nextDue == null) return { id, nextId: null as null };

    const nextId = await ctx.db.insert("tasks", {
      title: t.title,
      description: t.description,
      type: t.type,
      category: t.category,
      quadrant: t.quadrant,
      status: "todo",
      priority: t.priority,
      dueDate: nextDue,
      startDate: t.startDate
        ? nextDue - (base - t.startDate)
        : undefined,
      parentTaskId: t.parentTaskId,
      relatedFileId: t.relatedFileId,
      relatedContactId: t.relatedContactId,
      assigneeId: t.assigneeId,
      sharedWithIds: t.sharedWithIds,
      recurrence: t.recurrence,
      links: t.links,
      linkedTaskIds: t.linkedTaskIds,
      checklist: t.checklist,
      errandLocations: t.errandLocations,
      completedAt: undefined,
      snoozedUntil: undefined,
      reminderAt: undefined,
      organizationId,
      createdAt: now,
      updatedAt: now,
    });
    const spawned = await ctx.db.get(nextId);
    if (spawned) {
      await syncAssigneeNotification(ctx, t, spawned, actorUserKey ?? actor);
    }
    if (nextId) {
      await refreshTaskGlobalSearchText(ctx, nextId);
      await syncIndexedGraphTaskEdge(ctx, nextId, {
        previousFileId: t.relatedFileId,
        actor: actorUserKey ?? actor,
      });
    }
    return { id, nextId };
  },
});

function newErrandSideId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

function remapErrandLocationsWithNewIds(
  locs: NonNullable<Doc<"tasks">["errandLocations"]>
): NonNullable<Doc<"tasks">["errandLocations"]> {
  return locs.map((loc) => ({
    id: newErrandSideId(),
    name: loc.name,
    completed: Boolean(loc.completed),
    items: loc.items.map((it) => ({
      id: newErrandSideId(),
      name: it.name,
      completed: it.completed,
      quantity: it.quantity,
      note: it.note,
    })),
  }));
}

/**
 * Clone an errands/groceries run (new ids for every store and item).
 * Top-level only; appears after existing tasks in the same quadrant.
 */
export const duplicateErrandGroceryTask = mutation({
  args: { id: v.id("tasks"), ...orgScopeArgs },
  handler: async (ctx, { id, organizationId, memberUserKey }) => {
    await requireTaskOrg(ctx, organizationId, memberUserKey);
    const t = await loadTaskInOrg(ctx, id, organizationId, memberUserKey, "mutate");
    if (t.type !== "errands_groceries") {
      throw new Error("Only errands / groceries tasks can be duplicated here");
    }
    if (t.parentTaskId != null) {
      throw new Error("Duplicate is only for top-level errands runs");
    }
    const now = Date.now();
    const nextPos = await nextQuadrantPositionForParent(
      ctx,
      t.quadrant,
      organizationId,
    );
    const locs = t.errandLocations ?? [];
    const remapped =
      locs.length > 0 ? remapErrandLocationsWithNewIds(locs) : undefined;
    const duplicatedId = await ctx.db.insert("tasks", {
      title: `Copy: ${t.title}`.slice(0, 400),
      description: t.description,
      type: "errands_groceries" as const,
      category: t.category,
      quadrant: t.quadrant,
      quadrantPosition: nextPos,
      status: "todo",
      priority: t.priority,
      dueDate: t.dueDate,
      startDate: t.startDate,
      relatedFileId: t.relatedFileId,
      relatedContactId: t.relatedContactId,
      assigneeId: t.assigneeId?.trim() || undefined,
      sharedWithIds:
        t.sharedWithIds && t.sharedWithIds.length > 0
          ? t.sharedWithIds
          : undefined,
      links: t.links,
      checklist: undefined,
      errandLocations: normalizeErrandLocations(remapped),
      recurrence: undefined,
      completedAt: undefined,
      snoozedUntil: undefined,
      reminderAt: t.reminderAt,
      organizationId,
      createdAt: now,
      updatedAt: now,
    });
    const dup = await ctx.db.get(duplicatedId);
    if (dup) {
      await syncAssigneeNotification(ctx, null, dup, undefined);
    }
    await refreshTaskGlobalSearchText(ctx, duplicatedId);
    await syncIndexedGraphTaskEdge(ctx, duplicatedId, {
      previousFileId: t.relatedFileId,
    });
    return { id: duplicatedId };
  },
});

/**
 * Create a new errands task with all *unchecked* items (grouped by store),
 * and remove those items from the source task. Checked items stay on the
 * original run.
 */
export const moveErrandUncheckedToNewTask = mutation({
  args: { id: v.id("tasks"), ...orgScopeArgs },
  handler: async (ctx, { id, organizationId, memberUserKey }) => {
    await requireTaskOrg(ctx, organizationId, memberUserKey);
    const t = await loadTaskInOrg(ctx, id, organizationId, memberUserKey, "mutate");
    if (t.type !== "errands_groceries") {
      throw new Error("Only errands / groceries tasks support this action");
    }
    const locs = t.errandLocations ?? [];
    if (locs.length === 0) {
      throw new Error("No stores to split");
    }
    const newLocs: NonNullable<Doc<"tasks">["errandLocations"]> = [];
    const remainingLocs: NonNullable<Doc<"tasks">["errandLocations"]> = [];
    for (const loc of locs) {
      const unchecked = loc.items.filter((i) => !i.completed);
      const checked = loc.items.filter((i) => i.completed);
      if (unchecked.length > 0) {
        newLocs.push({
          id: newErrandSideId(),
          name: loc.name,
          completed: false,
          items: unchecked.map((it) => ({
            id: newErrandSideId(),
            name: it.name,
            completed: false,
            quantity: it.quantity,
            note: it.note,
          })),
        });
      }
      if (checked.length > 0) {
        remainingLocs.push({
          id: loc.id,
          name: loc.name,
          completed: true,
          items: checked.map((it) => ({ ...it })),
        });
      }
    }
    if (newLocs.length === 0) {
      throw new Error("Nothing to move — all items are already done");
    }
    const now = Date.now();
    const nextPos = await nextQuadrantPositionForParent(
      ctx,
      t.quadrant,
      organizationId,
    );
    const newTaskId = await ctx.db.insert("tasks", {
      title: `Carryover: ${t.title}`.slice(0, 400),
      description: undefined,
      type: "errands_groceries" as const,
      category: t.category,
      quadrant: t.quadrant,
      quadrantPosition: nextPos,
      status: "todo",
      priority: t.priority,
      dueDate: t.dueDate,
      startDate: t.startDate,
      relatedFileId: t.relatedFileId,
      relatedContactId: t.relatedContactId,
      assigneeId: t.assigneeId?.trim() || undefined,
      sharedWithIds:
        t.sharedWithIds && t.sharedWithIds.length > 0
          ? t.sharedWithIds
          : undefined,
      errandLocations: normalizeErrandLocations(newLocs),
      reminderAt: t.reminderAt,
      organizationId,
      createdAt: now,
      updatedAt: now,
    });
    const splitNew = await ctx.db.get(newTaskId);
    if (splitNew) {
      await syncAssigneeNotification(ctx, null, splitNew, undefined);
    }
    await ctx.db.patch(id, {
      errandLocations: normalizeErrandLocations(
        remainingLocs.length > 0 ? remainingLocs : undefined
      ),
      updatedAt: now,
    });
    await refreshTaskGlobalSearchText(ctx, id);
    await refreshTaskGlobalSearchText(ctx, newTaskId);
    await syncIndexedGraphTaskEdge(ctx, newTaskId, {
      previousFileId: t.relatedFileId,
    });
    return { sourceId: id, newTaskId };
  },
});
