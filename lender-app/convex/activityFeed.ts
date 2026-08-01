import { query } from "./_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { assertOrgPermission } from "./organizationRbac";
import { assertOrganizationId } from "./organizationValidators";
import { orgIntegrityFail } from "./orgIntegrityTelemetry";
import { assertCanAccessFile } from "./organizationAccess";
import { resolveRowOwnerUserId } from "./resourceAccess";
import {
  resolveDisplayUsernameMap,
} from "./auth/displayIdentity";

export const SYSTEM_ACTOR_KEY = "__system__";

export type ActivityFeedScope = { kind: "org" | "user"; id: string };

export async function ensureWritableOrgFeedScope(
  ctx: MutationCtx,
  scope: ActivityFeedScope,
): Promise<boolean> {
  if (scope.kind !== "org") return true;
  try {
    await assertOrganizationId(ctx, scope.id);
    return true;
  } catch {
    orgIntegrityFail("activityFeed.drop_invalid_org_scope", {
      scopeIdPrefix: scope.id.slice(0, 12),
    });
    return false;
  }
}
export function normalizeActorKey(actorUserKey: string | undefined): string {
  const t = actorUserKey?.trim();
  return t && t.length > 0 ? t : SYSTEM_ACTOR_KEY;
}

export function scopeFromPipelineFile(
  file: Doc<"pipeline">,
  fallbackUserKey?: string,
): ActivityFeedScope | null {
  if (file.organizationId) {
    return { kind: "org", id: file.organizationId as string };
  }
  const owner = resolveRowOwnerUserId(file) || fallbackUserKey?.trim();
  if (!owner) return null;
  return { kind: "user", id: owner };
}

export function scopeFromContact(
  contact: Doc<"contacts">,
  actorUserKey?: string,
): ActivityFeedScope | null {
  if (contact.organizationId) {
    return { kind: "org", id: contact.organizationId as string };
  }
  const a = actorUserKey?.trim();
  if (!a) return null;
  return { kind: "user", id: a };
}

export function scopeFromLender(
  lender: Doc<"lenders">,
  actorUserKey?: string,
): ActivityFeedScope | null {
  if (lender.organizationId) {
    return { kind: "org", id: lender.organizationId as string };
  }
  const a = actorUserKey?.trim();
  if (!a) return null;
  return { kind: "user", id: a };
}

type PipelineMirrorKind =
  | "file_created"
  | "data_patch"
  | "deal_patch"
  | "drawer_layout"
  | "contact_link"
  | "contact_unlink"
  | "contact_link_update"
  | "lender_attach"
  | "lender_detach"
  | "lender_select"
  | "automation"
  | "undo"
  | "share_grant"
  | "share_revoke"
  | "share_update"
  | "client_momentum"
  | "vault_client_upload"
  | "vault_broker_review"
  | "lender_delivery_accessed"
  | "lender_document_previewed"
  | "lender_folder_expanded"
  | "lender_package_exported";

export type PipelineActivityFeedMirror = {
  fileId: Id<"pipeline">;
  at: number;
  kind: PipelineMirrorKind;
  summary?: string;
  keys?: string[];
  contactId?: Id<"contacts">;
  lenderId?: Id<"lenders">;
  /** Canonical actor for share events and other user-initiated mirrors. */
  actorUserKey?: string;
};

function pipelineKindLabel(kind: PipelineMirrorKind): string {
  switch (kind) {
    case "file_created":
      return "File created";
    case "deal_patch":
      return "Deal updated";
    case "drawer_layout":
      return "Drawer layout";
    case "contact_link":
      return "Contact linked";
    case "contact_unlink":
      return "Contact unlinked";
    case "contact_link_update":
      return "Contact link updated";
    case "lender_attach":
      return "Lender attached";
    case "lender_detach":
      return "Lender removed";
    case "lender_select":
      return "Lender selected";
    case "automation":
      return "Automation";
    case "undo":
      return "Undo";
    case "share_grant":
      return "Share granted";
    case "share_revoke":
      return "Share revoked";
    case "share_update":
      return "Share updated";
    case "client_momentum":
      return "Client confidence";
    case "vault_client_upload":
      return "Client upload";
    case "vault_broker_review":
      return "Broker review";
    case "lender_delivery_accessed":
      return "Lender data room";
    case "lender_document_previewed":
      return "Document previewed";
    case "lender_folder_expanded":
      return "Folder viewed";
    case "lender_package_exported":
      return "Package downloaded";
    case "data_patch":
    default:
      return "File updated";
  }
}

/**
 * Mirror select pipeline audit rows into the global feed. Skips `data_patch`
 * to avoid flooding the feed with high-frequency field edits.
 */
export async function mirrorPipelineActivityToFeed(
  ctx: MutationCtx,
  row: PipelineActivityFeedMirror,
): Promise<void> {
  if (row.kind === "data_patch" || row.kind === "client_momentum") return;
  const file = await ctx.db.get(row.fileId);
  if (!file) return;
  const scope = scopeFromPipelineFile(file);
  if (!scope) return;
  if (!(await ensureWritableOrgFeedScope(ctx, scope))) return;
  const summary =
    row.summary?.trim() || pipelineKindLabel(row.kind);
  const detail = row.keys?.length
    ? row.keys.slice(0, 40).join(", ")
    : undefined;
  const actorKey = normalizeActorKey(row.actorUserKey);
  await ctx.db.insert("activityFeed", {
    at: row.at,
    scopeKind: scope.kind,
    scopeId: scope.id,
    category: "file",
    kind: `file.${row.kind}`,
    summary,
    ...(detail ? { detail } : {}),
    actorKey,
    fileId: row.fileId,
    ...(row.contactId ? { contactId: row.contactId } : {}),
    ...(row.lenderId ? { lenderId: row.lenderId } : {}),
  });
}

export type MirrorContactActivityInput = {
  contactId: Id<"contacts">;
  at: number;
  kind: string;
  summary: string;
  detail?: string;
  actorUserKey?: string;
  relatedFileId?: Id<"pipeline">;
  relatedLenderId?: Id<"lenders">;
};

export async function mirrorContactActivityToFeed(
  ctx: MutationCtx,
  row: MirrorContactActivityInput,
): Promise<void> {
  const contact = await ctx.db.get(row.contactId);
  if (!contact) return;
  const scope = scopeFromContact(contact, row.actorUserKey);
  if (!scope) return;
  if (!(await ensureWritableOrgFeedScope(ctx, scope))) return;
  await ctx.db.insert("activityFeed", {
    at: row.at,
    scopeKind: scope.kind,
    scopeId: scope.id,
    category: "contact",
    kind: `contact.${row.kind}`,
    summary: row.summary,
    ...(row.detail ? { detail: row.detail } : {}),
    actorKey: normalizeActorKey(row.actorUserKey),
    contactId: row.contactId,
    ...(row.relatedFileId ? { fileId: row.relatedFileId } : {}),
    ...(row.relatedLenderId ? { lenderId: row.relatedLenderId } : {}),
  });
}

export async function appendContactCrudFeed(
  ctx: MutationCtx,
  contact: Doc<"contacts">,
  kind: "contact_created" | "contact_updated" | "contact_deleted",
  summary: string,
  actorUserKey?: string,
): Promise<void> {
  const scope = scopeFromContact(contact, actorUserKey);
  if (!scope) return;
  if (!(await ensureWritableOrgFeedScope(ctx, scope))) return;
  await ctx.db.insert("activityFeed", {
    at: Date.now(),
    scopeKind: scope.kind,
    scopeId: scope.id,
    category: "contact",
    kind,
    summary,
    actorKey: normalizeActorKey(actorUserKey),
    contactId: contact._id,
  });
}

export async function appendLenderFeed(
  ctx: MutationCtx,
  lender: Doc<"lenders">,
  kind: string,
  summary: string,
  actorUserKey?: string,
): Promise<void> {
  const scope = scopeFromLender(lender, actorUserKey);
  if (!scope) return;
  if (!(await ensureWritableOrgFeedScope(ctx, scope))) return;
  await ctx.db.insert("activityFeed", {
    at: Date.now(),
    scopeKind: scope.kind,
    scopeId: scope.id,
    category: "lender",
    kind,
    summary,
    actorKey: normalizeActorKey(actorUserKey),
    lenderId: lender._id,
  });
}

/**
 * Inserts a **user-attributed** pipeline file activity line (not mirrored from
 * `pipelineFileActivity`, which uses the system actor for most pipeline events).
 */
export async function appendPipelineClientMomentumFeed(
  ctx: MutationCtx,
  file: Doc<"pipeline">,
  summary: string,
  actorUserKey: string | undefined,
): Promise<void> {
  const scope = scopeFromPipelineFile(file, actorUserKey);
  if (!scope) return;
  if (!(await ensureWritableOrgFeedScope(ctx, scope))) return;
  const s = summary.trim();
  if (!s) return;
  await ctx.db.insert("activityFeed", {
    at: Date.now(),
    scopeKind: scope.kind,
    scopeId: scope.id,
    category: "file",
    kind: "file.client_momentum",
    summary: s,
    actorKey: normalizeActorKey(actorUserKey),
    fileId: file._id,
  });
}

export async function resolveScopeForTask(
  ctx: MutationCtx,
  task: Doc<"tasks">,
  actorUserKey?: string,
): Promise<ActivityFeedScope | null> {
  if (task.relatedFileId) {
    const file = await ctx.db.get(task.relatedFileId);
    if (file) {
      const scope = scopeFromPipelineFile(file, actorUserKey);
      if (scope) return scope;
    }
  }
  if (task.relatedContactId) {
    const contact = await ctx.db.get(task.relatedContactId);
    if (contact) {
      const scope = scopeFromContact(contact, actorUserKey);
      if (scope) return scope;
    }
  }
  const a = actorUserKey?.trim();
  if (!a) return null;
  return { kind: "user", id: a };
}

export async function appendTaskFeed(
  ctx: MutationCtx,
  task: Doc<"tasks">,
  kind: string,
  summary: string,
  actorUserKey?: string,
): Promise<void> {
  const scope = await resolveScopeForTask(ctx, task, actorUserKey);
  if (!scope) return;
  if (!(await ensureWritableOrgFeedScope(ctx, scope))) return;
  await ctx.db.insert("activityFeed", {
    at: Date.now(),
    scopeKind: scope.kind,
    scopeId: scope.id,
    category: "task",
    kind,
    summary,
    actorKey: normalizeActorKey(actorUserKey),
    taskId: task._id,
    ...(task.relatedFileId ? { fileId: task.relatedFileId } : {}),
    ...(task.relatedContactId ? { contactId: task.relatedContactId } : {}),
  });
}

async function assertCanReadActivityScope(
  ctx: QueryCtx,
  scopeKind: "org" | "user",
  scopeId: string,
  memberUserKey: string | undefined,
): Promise<void> {
  if (scopeKind === "org") {
    const key = memberUserKey?.trim();
    if (!key) {
      throw new Error(
        "memberUserKey is required to view organization activity.",
      );
    }
    const { id } = await assertOrganizationId(ctx, scopeId);
    await assertOrgPermission(ctx, id, key, "files.view");
    return;
  }
  const key = memberUserKey?.trim();
  if (!key || key !== scopeId) {
    throw new Error("You can only view your own personal activity feed.");
  }
}

const categoryV = v.union(
  v.literal("file"),
  v.literal("contact"),
  v.literal("lender"),
  v.literal("task"),
);

type FeedRow = Doc<"activityFeed">;

async function takeFeedPage(
  fetch: (cap: number) => Promise<FeedRow[]>,
  cap: number,
  postFilter?: (rows: FeedRow[]) => FeedRow[],
): Promise<{ rows: FeedRow[]; nextCursor: number | undefined }> {
  const batch = postFilter
    ? postFilter(await fetch(Math.max(cap * 4, cap + 1)))
    : await fetch(cap + 1);
  const hasMore = batch.length > cap;
  const page = hasMore ? batch.slice(0, cap) : batch;
  const nextCursor = hasMore ? page[page.length - 1]?.at : undefined;
  return { rows: page, nextCursor };
}

async function enrichFeedPage(
  ctx: QueryCtx,
  page: { rows: FeedRow[]; nextCursor: number | undefined },
) {
  const labelMap = await resolveDisplayUsernameMap(
    ctx,
    page.rows.map((r) => r.actorKey),
  );
  return {
    nextCursor: page.nextCursor,
    rows: page.rows.map((r) => ({
      ...r,
      actorDisplayUsername:
        r.actorKey === SYSTEM_ACTOR_KEY
          ? "System"
          : (labelMap[r.actorKey] ?? r.actorKey),
    })),
  };
}

export const list = query({
  args: {
    scopeKind: v.union(v.literal("org"), v.literal("user")),
    scopeId: v.string(),
    memberUserKey: v.optional(v.string()),
    limit: v.optional(v.number()),
    cursorBeforeAt: v.optional(v.number()),
    categoryFilter: v.optional(categoryV),
    actorKeyFilter: v.optional(v.string()),
    fileIdFilter: v.optional(v.id("pipeline")),
  },
  handler: async (ctx, args) => {
    await assertCanReadActivityScope(
      ctx,
      args.scopeKind,
      args.scopeId,
      args.memberUserKey,
    );
    const cap = Math.min(Math.max(args.limit ?? 40, 1), 100);
    const beforeAt = args.cursorBeforeAt;
    const { fileIdFilter, categoryFilter, actorKeyFilter } = args;

    const cursorFilter = (rows: FeedRow[]): FeedRow[] =>
      beforeAt == null ? rows : rows.filter((r) => r.at < beforeAt);

    const catFilter = (rows: FeedRow[]): FeedRow[] =>
      categoryFilter == null
        ? rows
        : rows.filter((r) => r.category === categoryFilter);

    const actFilter = (rows: FeedRow[]): FeedRow[] =>
      actorKeyFilter == null || actorKeyFilter === ""
        ? rows
        : rows.filter((r) => r.actorKey === actorKeyFilter);

    const pipe = (rows: FeedRow[]): FeedRow[] =>
      actFilter(catFilter(cursorFilter(rows)));

    if (fileIdFilter !== undefined) {
      await assertCanAccessFile(ctx, fileIdFilter, args.memberUserKey);
      return enrichFeedPage(
        ctx,
        await takeFeedPage(
        async (takeN) =>
          ctx.db
            .query("activityFeed")
            .withIndex("by_scope_file_at", (q) =>
              q
                .eq("scopeKind", args.scopeKind)
                .eq("scopeId", args.scopeId)
                .eq("fileId", fileIdFilter),
            )
            .order("desc")
            .take(takeN),
        cap,
        pipe,
        ),
      );
    }

    if (
      actorKeyFilter !== undefined &&
      actorKeyFilter !== "" &&
      categoryFilter === undefined
    ) {
      return enrichFeedPage(
        ctx,
        await takeFeedPage(
        async (takeN) =>
          ctx.db
            .query("activityFeed")
            .withIndex("by_scope_actor_at", (q) =>
              q
                .eq("scopeKind", args.scopeKind)
                .eq("scopeId", args.scopeId)
                .eq("actorKey", actorKeyFilter),
            )
            .order("desc")
            .take(takeN),
        cap,
        (rows) => cursorFilter(rows),
        ),
      );
    }

    if (categoryFilter !== undefined) {
      return enrichFeedPage(
        ctx,
        await takeFeedPage(
        async (takeN) =>
          ctx.db
            .query("activityFeed")
            .withIndex("by_scope_category_at", (q) =>
              q
                .eq("scopeKind", args.scopeKind)
                .eq("scopeId", args.scopeId)
                .eq("category", categoryFilter),
            )
            .order("desc")
            .take(takeN),
        cap,
        (rows) => actFilter(cursorFilter(rows)),
        ),
      );
    }

    return enrichFeedPage(
      ctx,
      await takeFeedPage(
      async (takeN) =>
        ctx.db
          .query("activityFeed")
          .withIndex("by_scope_at", (q) =>
            q.eq("scopeKind", args.scopeKind).eq("scopeId", args.scopeId),
          )
          .order("desc")
          .take(takeN),
      cap,
      (rows) => actFilter(cursorFilter(rows)),
      ),
    );
  },
});

export const listActorKeys = query({
  args: {
    scopeKind: v.union(v.literal("org"), v.literal("user")),
    scopeId: v.string(),
    memberUserKey: v.optional(v.string()),
    scanLimit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await assertCanReadActivityScope(
      ctx,
      args.scopeKind,
      args.scopeId,
      args.memberUserKey,
    );
    const scan = Math.min(Math.max(args.scanLimit ?? 120, 20), 300);
    const recent = await ctx.db
      .query("activityFeed")
      .withIndex("by_scope_at", (q) =>
        q.eq("scopeKind", args.scopeKind).eq("scopeId", args.scopeId),
      )
      .order("desc")
      .take(scan);
    const keys = new Set<string>();
    for (const r of recent) {
      if (r.actorKey && r.actorKey !== SYSTEM_ACTOR_KEY) keys.add(r.actorKey);
    }
    const labelMap = await resolveDisplayUsernameMap(ctx, keys);
    return [...keys]
      .sort((a, b) => a.localeCompare(b))
      .map((userKey) => ({
        userKey,
        displayUsername: labelMap[userKey] ?? userKey,
      }));
  },
});
