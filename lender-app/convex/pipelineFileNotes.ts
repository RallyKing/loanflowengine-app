import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import {
  assertCanMutatePipelineRow,
  assertCanReadPipelineRow,
  impersonationGrantsOrgResourceVisibility,
  resolvePipelineAccessLevel,
} from "./resourceAccess";
import { normalizeAndValidateNoteLinkUrl } from "../lib/pipeline/noteLinkUrl";
import {
  authUserHasGlobalAdminElevation,
  tryGetAuthUserByPermissionKey,
} from "./auth/globalAdmin";
import { resolveDisplayUsernameForUserKey } from "./auth/displayIdentity";
import { pickCanonicalOrgMember } from "./orgMembership";
import { SYSTEM_ORG_ROLE_KEYS } from "../lib/orgRbac";
import { platformUserKeyFallback } from "./viewerIdentity";

/** Batch note counts for pipeline table rows (one query per org in the batch). */
export async function batchPipelineFileNoteCounts(
  ctx: QueryCtx,
  files: Array<{
    _id: Id<"pipeline">;
    organizationId?: Id<"organizations">;
  }>,
): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  const byOrg = new Map<string, Id<"pipeline">[]>();
  for (const file of files) {
    if (!file.organizationId) continue;
    const orgKey = String(file.organizationId);
    const list = byOrg.get(orgKey) ?? [];
    list.push(file._id);
    byOrg.set(orgKey, list);
  }
  for (const [orgKey, fileIds] of byOrg) {
    const want = new Set(fileIds.map(String));
    const notes = await ctx.db
      .query("pipelineFileNotes")
      .withIndex("by_org_file", (q) =>
        q.eq("organizationId", orgKey as Id<"organizations">),
      )
      .collect();
    for (const note of notes) {
      const fid = String(note.pipelineFileId);
      if (!want.has(fid)) continue;
      counts.set(fid, (counts.get(fid) ?? 0) + 1);
    }
  }
  return counts;
}

const UNAUTHORIZED_DELETE_NOTE =
  "Unauthorized: Insufficient permissions to delete this note.";

const UNAUTHORIZED_EDIT_NOTE =
  "Unauthorized: Only organization owners or administrators can edit this note.";

const MAX_NAME_LEN = 255;
const MAX_ATTACHMENT_BYTES = 80 * 1024 * 1024;

const attachmentValidator = v.object({
  storageId: v.id("_storage"),
  fileName: v.string(),
  mimeType: v.string(),
  size: v.number(),
});

const noteLinkInputValidator = v.object({
  url: v.string(),
  title: v.optional(v.string()),
});

const orgMemberArgs = {
  organizationId: v.id("organizations"),
  memberUserKey: v.optional(v.string()),
};

function safeFileName(name: string) {
  const base = name.replace(/[/\\]/g, "").trim() || "file";
  return base.slice(0, MAX_NAME_LEN);
}

async function getStorageMetadataWithRetry(
  storage: MutationCtx["storage"],
  storageId: Id<"_storage">,
) {
  for (let i = 0; i < 15; i++) {
    const meta = await storage.getMetadata(storageId);
    if (meta) return meta;
    if (i < 14) {
      await new Promise<void>((r) => setTimeout(r, 100));
    }
  }
  return null;
}

async function loadPipelineFile(
  ctx: MutationCtx | QueryCtx,
  pipelineFileId: Id<"pipeline">,
) {
  const file = await ctx.db.get(pipelineFileId);
  if (!file) throw new Error("Pipeline file not found");
  return file;
}

async function assertFileOrgMatch(
  file: Doc<"pipeline">,
  organizationId: Id<"organizations">,
) {
  if (!file.organizationId || String(file.organizationId) !== String(organizationId)) {
    throw new Error("Pipeline file is not in this organization");
  }
}

async function assertNoteOrgMatch(
  note: Doc<"pipelineFileNotes">,
  organizationId: Id<"organizations">,
) {
  if (String(note.organizationId) !== String(organizationId)) {
    throw new Error("Note is not in this organization");
  }
}

async function resolveViewerKey(
  ctx: QueryCtx | MutationCtx,
  memberUserKey: string | undefined,
): Promise<string> {
  const identity = await ctx.auth.getUserIdentity();
  if (identity?.subject?.trim()) return identity.subject.trim();
  const key = memberUserKey?.trim();
  if (key) return key;
  return platformUserKeyFallback();
}

/**
 * Server-side delete gate: note author, org legacy admin/owner, or product Admin/Manager role.
 */
export async function viewerCanDeletePipelineFileNote(
  ctx: QueryCtx | MutationCtx,
  organizationId: Id<"organizations">,
  memberUserKey: string | undefined,
  note: Doc<"pipelineFileNotes">,
): Promise<boolean> {
  const viewerKey = await resolveViewerKey(ctx, memberUserKey);
  if (note.authorUserKey === viewerKey) return true;

  if (await impersonationGrantsOrgResourceVisibility(ctx, viewerKey, organizationId)) {
    return true;
  }

  const membershipRows = await ctx.db
    .query("organizationMembers")
    .withIndex("by_org_user", (q) =>
      q.eq("organizationId", organizationId).eq("userKey", viewerKey),
    )
    .collect();
  const membership = pickCanonicalOrgMember(membershipRows);
  if (!membership || membership.isActive === false) return false;

  if (membership.role === "owner" || membership.role === "admin") return true;

  let roleKey: string = SYSTEM_ORG_ROLE_KEYS.user;
  if (membership.assignedRoleId) {
    const roleDoc = await ctx.db.get(membership.assignedRoleId);
    if (roleDoc && roleDoc.organizationId === organizationId) {
      roleKey = roleDoc.key;
    }
  }

  return (
    roleKey === SYSTEM_ORG_ROLE_KEYS.admin ||
    roleKey === SYSTEM_ORG_ROLE_KEYS.manager
  );
}

/**
 * Phase 30.2 — edit note body: global admin, account owner, legacy org admin,
 * assigned RBAC admin, or impersonation. Not authors or managers.
 */
export async function viewerCanEditPipelineFileNoteContent(
  ctx: QueryCtx | MutationCtx,
  organizationId: Id<"organizations">,
  memberUserKey: string | undefined,
): Promise<boolean> {
  const viewerKey = await resolveViewerKey(ctx, memberUserKey);

  const authUser = await tryGetAuthUserByPermissionKey(ctx, viewerKey);
  if (authUserHasGlobalAdminElevation(authUser)) return true;

  if (await impersonationGrantsOrgResourceVisibility(ctx, viewerKey, organizationId)) {
    return true;
  }

  const membershipRows = await ctx.db
    .query("organizationMembers")
    .withIndex("by_org_user", (q) =>
      q.eq("organizationId", organizationId).eq("userKey", viewerKey),
    )
    .collect();
  const membership = pickCanonicalOrgMember(membershipRows);
  if (!membership || membership.isActive === false) return false;

  if (membership.role === "owner" || membership.role === "admin") return true;

  if (membership.assignedRoleId) {
    const roleDoc = await ctx.db.get(membership.assignedRoleId);
    if (
      roleDoc &&
      roleDoc.organizationId === organizationId &&
      roleDoc.key === SYSTEM_ORG_ROLE_KEYS.admin
    ) {
      return true;
    }
  }

  return false;
}

async function deleteNoteStorageAttachments(
  ctx: MutationCtx,
  note: Doc<"pipelineFileNotes">,
) {
  for (const att of note.attachments ?? []) {
    try {
      await ctx.storage.delete(att.storageId);
    } catch {
      /* best-effort — note row is still removed */
    }
  }
}

async function deleteNoteLinks(ctx: MutationCtx, noteId: Id<"pipelineFileNotes">) {
  const links = await ctx.db
    .query("pipelineFileNoteLinks")
    .withIndex("by_note", (q) => q.eq("noteId", noteId))
    .collect();
  for (const link of links) {
    await ctx.db.delete(link._id);
  }
}

async function insertNoteLinkRow(
  ctx: MutationCtx,
  args: {
    noteId: Id<"pipelineFileNotes">;
    organizationId: Id<"organizations">;
    url: string;
    title?: string;
    createdBy: string;
  },
): Promise<Id<"pipelineFileNoteLinks">> {
  const url = normalizeAndValidateNoteLinkUrl(args.url);
  const title = args.title?.trim() || undefined;
  return await ctx.db.insert("pipelineFileNoteLinks", {
    noteId: args.noteId,
    organizationId: args.organizationId,
    url,
    title,
    createdAt: Date.now(),
    createdBy: args.createdBy,
  });
}

const MAX_NOTES_BY_PIPELINE_FILE_IDS = 80;

function sortNotesForDisplay<
  T extends {
    isPinned?: boolean;
    pinnedAt?: number;
    _creationTime: number;
  },
>(rows: T[]): T[] {
  const pinned = rows
    .filter((r) => r.isPinned === true)
    .sort((a, b) => (b.pinnedAt ?? 0) - (a.pinnedAt ?? 0));
  const rest = rows
    .filter((r) => r.isPinned !== true)
    .sort((a, b) => b._creationTime - a._creationTime);
  return [...pinned, ...rest];
}

function pipelineFileDisplayTitle(file: Doc<"pipeline">): string {
  const name = file.fileName?.trim();
  return name || "Untitled file";
}

/** Phase 32.3 — snapshot title on row, else live task lookup for legacy attempts. */
async function resolveAttemptTaskName(
  ctx: QueryCtx,
  row: Doc<"pipelineFileNotes">,
): Promise<string | undefined> {
  const stored = row.linkedTaskTitle?.trim();
  if (stored) return stored;
  if (!row.linkedTaskId) return undefined;
  const task = await ctx.db.get(row.linkedTaskId);
  const live = task?.title?.trim();
  return live || undefined;
}

async function enrichPipelineFileNoteForViewer(
  ctx: QueryCtx,
  args: {
    organizationId: Id<"organizations">;
    memberUserKey: string | undefined;
    file: Doc<"pipeline">;
    row: Doc<"pipelineFileNotes">;
  },
) {
  const { organizationId, memberUserKey, file, row } = args;
  const authorDisplayName = await resolveDisplayUsernameForUserKey(
    ctx,
    row.authorUserKey,
  );
  const attachments = [];
  for (const att of row.attachments ?? []) {
    const url = await ctx.storage.getUrl(att.storageId);
    attachments.push({
      storageId: att.storageId,
      fileName: att.fileName,
      mimeType: att.mimeType,
      size: att.size,
      url,
    });
  }
  const canDelete = await viewerCanDeletePipelineFileNote(
    ctx,
    organizationId,
    memberUserKey,
    row,
  );
  const adminCanEditNoteBody = await viewerCanEditPipelineFileNoteContent(
    ctx,
    organizationId,
    memberUserKey,
  );
  /** Phase 30.2 / 32.4 — standard + attempt body edits: org owner/admin only. */
  const canEditContent = adminCanEditNoteBody;
  const fileEdit =
    (await resolvePipelineAccessLevel(ctx, file, memberUserKey)) === "edit";

  const linkRows = await ctx.db
    .query("pipelineFileNoteLinks")
    .withIndex("by_note", (q) => q.eq("noteId", row._id))
    .collect();
  linkRows.sort((a, b) => b.createdAt - a.createdAt);
  const links = linkRows.map((link) => {
    const label = link.title?.trim() || undefined;
    return {
      _id: link._id,
      url: link.url,
      title: label,
      label,
      displayLabel: label ?? link.url,
    };
  });

  const fileTitle = pipelineFileDisplayTitle(file);
  const taskName =
    row.noteKind === "attempt"
      ? await resolveAttemptTaskName(ctx, row)
      : undefined;

  return {
    _id: row._id,
    _creationTime: row._creationTime,
    content: row.content,
    authorUserKey: row.authorUserKey,
    authorDisplayName,
    attachments,
    links,
    isPinned: row.isPinned === true,
    pinnedAt: row.pinnedAt,
    canDelete,
    canPin: fileEdit,
    canEditContent,
    noteKind: row.noteKind ?? ("standard" as const),
    linkedTaskId: row.linkedTaskId,
    taskName,
    attemptNumber: row.attemptNumber,
    pipelineFileId: file._id,
    fileName: fileTitle,
    fileTitle,
  };
}

async function validateAttachments(
  ctx: MutationCtx,
  attachments: Array<{
    storageId: Id<"_storage">;
    fileName: string;
    mimeType: string;
    size: number;
  }>,
) {
  const out: Array<{
    storageId: Id<"_storage">;
    fileName: string;
    mimeType: string;
    size: number;
  }> = [];

  for (const att of attachments) {
    const meta = await getStorageMetadataWithRetry(ctx.storage, att.storageId);
    if (!meta) {
      throw new Error(
        `Upload not found for "${att.fileName}". Finish uploading before saving the note.`,
      );
    }
    const byteSize = att.size > 0 ? att.size : (meta.size ?? 0);
    if (byteSize > MAX_ATTACHMENT_BYTES) {
      try {
        await ctx.storage.delete(att.storageId);
      } catch {
        /* best-effort */
      }
      throw new Error(
        `File "${att.fileName}" exceeds maximum size (${Math.round(MAX_ATTACHMENT_BYTES / (1024 * 1024))} MB).`,
      );
    }
    out.push({
      storageId: att.storageId,
      fileName: safeFileName(att.fileName),
      mimeType: att.mimeType.trim() || meta.contentType || "application/octet-stream",
      size: byteSize,
    });
  }
  return out;
}

/** Secure upload URL for pipeline note attachments (edit access required). */
export const generateUploadUrl = mutation({
  args: {
    pipelineFileId: v.id("pipeline"),
    ...orgMemberArgs,
  },
  handler: async (ctx, args) => {
    const file = await loadPipelineFile(ctx, args.pipelineFileId);
    await assertFileOrgMatch(file, args.organizationId);
    await assertCanMutatePipelineRow(ctx, file, args.memberUserKey, "note_upload");
    return await ctx.storage.generateUploadUrl();
  },
});

export const createNote = mutation({
  args: {
    pipelineFileId: v.id("pipeline"),
    content: v.string(),
    attachments: v.optional(v.array(attachmentValidator)),
    links: v.optional(v.array(noteLinkInputValidator)),
    ...orgMemberArgs,
  },
  handler: async (ctx, args) => {
    const file = await loadPipelineFile(ctx, args.pipelineFileId);
    await assertFileOrgMatch(file, args.organizationId);
    await assertCanMutatePipelineRow(ctx, file, args.memberUserKey, "note_create");

    const identity = await ctx.auth.getUserIdentity();
    const authorUserKey =
      identity?.subject?.trim() || args.memberUserKey?.trim() || "";
    if (!authorUserKey) {
      throw new Error("Sign in required to add a note");
    }

    const content = args.content.trim();
    const rawAttachments = args.attachments ?? [];
    const rawLinks = args.links ?? [];
    if (!content && rawAttachments.length === 0 && rawLinks.length === 0) {
      throw new Error("Add note text, an attachment, or a link");
    }

    const attachments =
      rawAttachments.length > 0
        ? await validateAttachments(ctx, rawAttachments)
        : undefined;

    const noteId = await ctx.db.insert("pipelineFileNotes", {
      organizationId: args.organizationId,
      pipelineFileId: args.pipelineFileId,
      authorUserKey,
      content,
      attachments,
    });

    for (const link of rawLinks) {
      await insertNoteLinkRow(ctx, {
        noteId,
        organizationId: args.organizationId,
        url: link.url,
        title: link.title,
        createdBy: authorUserKey,
      });
    }

    return { noteId };
  },
});

export const pinNote = mutation({
  args: {
    noteId: v.id("pipelineFileNotes"),
    ...orgMemberArgs,
  },
  handler: async (ctx, args) => {
    const note = await ctx.db.get(args.noteId);
    if (!note) throw new Error("Note not found");
    await assertNoteOrgMatch(note, args.organizationId);

    const file = await loadPipelineFile(ctx, note.pipelineFileId);
    await assertFileOrgMatch(file, args.organizationId);
    await assertCanMutatePipelineRow(ctx, file, args.memberUserKey, "note_pin");

    const pinnedBy = await resolveViewerKey(ctx, args.memberUserKey);
    await ctx.db.patch(args.noteId, {
      isPinned: true,
      pinnedAt: Date.now(),
      pinnedBy,
    });
    return { pinned: true as const };
  },
});

export const unpinNote = mutation({
  args: {
    noteId: v.id("pipelineFileNotes"),
    ...orgMemberArgs,
  },
  handler: async (ctx, args) => {
    const note = await ctx.db.get(args.noteId);
    if (!note) throw new Error("Note not found");
    await assertNoteOrgMatch(note, args.organizationId);

    const file = await loadPipelineFile(ctx, note.pipelineFileId);
    await assertFileOrgMatch(file, args.organizationId);
    await assertCanMutatePipelineRow(ctx, file, args.memberUserKey, "note_unpin");

    await ctx.db.patch(args.noteId, {
      isPinned: false,
      pinnedAt: undefined,
      pinnedBy: undefined,
    });
    return { unpinned: true as const };
  },
});

export const addNoteLink = mutation({
  args: {
    noteId: v.id("pipelineFileNotes"),
    url: v.string(),
    title: v.optional(v.string()),
    ...orgMemberArgs,
  },
  handler: async (ctx, args) => {
    const note = await ctx.db.get(args.noteId);
    if (!note) throw new Error("Note not found");
    await assertNoteOrgMatch(note, args.organizationId);

    const file = await loadPipelineFile(ctx, note.pipelineFileId);
    await assertFileOrgMatch(file, args.organizationId);
    await assertCanMutatePipelineRow(ctx, file, args.memberUserKey, "note_link_add");

    const createdBy = await resolveViewerKey(ctx, args.memberUserKey);
    const linkId = await insertNoteLinkRow(ctx, {
      noteId: args.noteId,
      organizationId: args.organizationId,
      url: args.url,
      title: args.title,
      createdBy,
    });
    return { linkId };
  },
});

export const removeNoteLink = mutation({
  args: {
    linkId: v.id("pipelineFileNoteLinks"),
    ...orgMemberArgs,
  },
  handler: async (ctx, args) => {
    const link = await ctx.db.get(args.linkId);
    if (!link) throw new Error("Link not found");
    if (String(link.organizationId) !== String(args.organizationId)) {
      throw new Error("Link is not in this organization");
    }

    const note = await ctx.db.get(link.noteId);
    if (!note) throw new Error("Note not found");
    await assertNoteOrgMatch(note, args.organizationId);

    const file = await loadPipelineFile(ctx, note.pipelineFileId);
    await assertFileOrgMatch(file, args.organizationId);
    await assertCanMutatePipelineRow(ctx, file, args.memberUserKey, "note_link_remove");

    await ctx.db.delete(args.linkId);
    return { removed: true as const };
  },
});

export const getNotesByFileId = query({
  args: {
    pipelineFileId: v.id("pipeline"),
    ...orgMemberArgs,
  },
  handler: async (ctx, args) => {
    const file = await ctx.db.get(args.pipelineFileId);
    if (!file) return [];
    await assertFileOrgMatch(file, args.organizationId);
    await assertCanReadPipelineRow(ctx, file, args.memberUserKey);

    const rows = sortNotesForDisplay(
      await ctx.db
        .query("pipelineFileNotes")
        .withIndex("by_file", (q) => q.eq("pipelineFileId", args.pipelineFileId))
        .collect(),
    );

    const result = [];
    for (const row of rows) {
      const enriched = await enrichPipelineFileNoteForViewer(ctx, {
        organizationId: args.organizationId,
        memberUserKey: args.memberUserKey,
        file,
        row,
      });
      const { pipelineFileId: _pf, fileName: _fn, fileTitle: _ft, ...rest } =
        enriched;
      result.push(rest);
    }
    return result;
  },
});

/** Phase 28.2 — merged timeline across hub client files (explicit file id list). */
export const getNotesByPipelineFileIds = query({
  args: {
    pipelineFileIds: v.array(v.id("pipeline")),
    ...orgMemberArgs,
  },
  handler: async (ctx, args) => {
    const seen = new Set<string>();
    const fileIds: Id<"pipeline">[] = [];
    for (const id of args.pipelineFileIds) {
      const key = String(id);
      if (seen.has(key)) continue;
      seen.add(key);
      fileIds.push(id);
      if (fileIds.length >= MAX_NOTES_BY_PIPELINE_FILE_IDS) break;
    }

    const merged = [];
    for (const pipelineFileId of fileIds) {
      const file = await ctx.db.get(pipelineFileId);
      if (!file) continue;
      try {
        await assertFileOrgMatch(file, args.organizationId);
        await assertCanReadPipelineRow(ctx, file, args.memberUserKey);
      } catch {
        continue;
      }

      const rows = await ctx.db
        .query("pipelineFileNotes")
        .withIndex("by_file", (q) => q.eq("pipelineFileId", pipelineFileId))
        .collect();

      for (const row of rows) {
        merged.push(
          await enrichPipelineFileNoteForViewer(ctx, {
            organizationId: args.organizationId,
            memberUserKey: args.memberUserKey,
            file,
            row,
          }),
        );
      }
    }

    return sortNotesForDisplay(merged);
  },
});

export const updateNoteContent = mutation({
  args: {
    noteId: v.id("pipelineFileNotes"),
    content: v.string(),
    ...orgMemberArgs,
  },
  handler: async (ctx, args) => {
    const note = await ctx.db.get(args.noteId);
    if (!note) throw new Error("Note not found");

    await assertNoteOrgMatch(note, args.organizationId);

    const file = await loadPipelineFile(ctx, note.pipelineFileId);
    await assertFileOrgMatch(file, args.organizationId);
    await assertCanReadPipelineRow(ctx, file, args.memberUserKey);

    const allowed = await viewerCanEditPipelineFileNoteContent(
      ctx,
      args.organizationId,
      args.memberUserKey,
    );
    if (!allowed) {
      throw new Error(
        note.noteKind === "attempt"
          ? "Only organization owners or administrators can edit task attempt notes."
          : UNAUTHORIZED_EDIT_NOTE,
      );
    }

    const content = args.content.trim();
    const hasAttachments = (note.attachments?.length ?? 0) > 0;
    let hasLinks = false;
    if (!content && !hasAttachments) {
      const linkRows = await ctx.db
        .query("pipelineFileNoteLinks")
        .withIndex("by_note", (q) => q.eq("noteId", args.noteId))
        .first();
      hasLinks = linkRows != null;
    }
    if (!content && !hasAttachments && !hasLinks) {
      throw new Error("Note must include text, an attachment, or a link");
    }

    await ctx.db.patch(args.noteId, { content });
    return { ok: true as const, noteId: args.noteId };
  },
});

/** Phase 32.2 — chronological attempt audit log for a task. */
export const getTaskAttemptNotes = query({
  args: {
    taskId: v.id("tasks"),
    ...orgMemberArgs,
  },
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.taskId);
    if (!task) return [];
    if (task.organizationId !== args.organizationId) return [];

    const fileId = task.relatedFileId;
    if (!fileId) return [];

    const file = await loadPipelineFile(ctx, fileId);
    await assertFileOrgMatch(file, args.organizationId);
    await assertCanReadPipelineRow(ctx, file, args.memberUserKey);

    const rows = await ctx.db
      .query("pipelineFileNotes")
      .withIndex("by_linked_task", (q) => q.eq("linkedTaskId", args.taskId))
      .collect();

    const attempts = rows.filter((r) => r.noteKind === "attempt");
    attempts.sort((a, b) => {
      const an = a.attemptNumber ?? 0;
      const bn = b.attemptNumber ?? 0;
      if (an !== bn) return an - bn;
      return a._creationTime - b._creationTime;
    });

    const result = [];
    for (const row of attempts) {
      const enriched = await enrichPipelineFileNoteForViewer(ctx, {
        organizationId: args.organizationId,
        memberUserKey: args.memberUserKey,
        file,
        row,
      });
      const { pipelineFileId: _pf, fileName: _fn, fileTitle: _ft, ...rest } =
        enriched;
      result.push(rest);
    }
    return result;
  },
});

export const deleteNote = mutation({
  args: {
    noteId: v.id("pipelineFileNotes"),
    ...orgMemberArgs,
  },
  handler: async (ctx, args) => {
    const note = await ctx.db.get(args.noteId);
    if (!note) throw new Error("Note not found");

    await assertNoteOrgMatch(note, args.organizationId);

    const file = await loadPipelineFile(ctx, note.pipelineFileId);
    await assertFileOrgMatch(file, args.organizationId);
    await assertCanReadPipelineRow(ctx, file, args.memberUserKey);

    const allowed = await viewerCanDeletePipelineFileNote(
      ctx,
      args.organizationId,
      args.memberUserKey,
      note,
    );
    if (!allowed) {
      throw new Error(UNAUTHORIZED_DELETE_NOTE);
    }

    await deleteNoteStorageAttachments(ctx, note);
    await deleteNoteLinks(ctx, args.noteId);
    await ctx.db.delete(args.noteId);

    return { deleted: true as const };
  },
});
