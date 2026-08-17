import {
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import {
  hashPassword,
  normalizePortalEmailKey,
  randomHex,
  sha256Hex,
  verifyPassword,
} from "./clientPortalCrypto";
import { appendPortalAudit } from "./clientPortalAudit";
import {
  openOptionalPortalCiphertext,
  sealOptionalPortalPlaintext,
} from "./portalFieldCrypto";
import {
  assertMagicExchangeAllowed,
  assertPasswordSignInAllowed,
  clearMagicThrottle,
  clearPortalPasswordThrottle,
  enforcePortalSessionBudget,
  invalidateOtherPortalSessions,
  MAX_CONCURRENT_PORTAL_SESSIONS,
  recordMagicLinkFailure,
  recordPortalPasswordFailure,
} from "./portalAuthSecurity";
import {
  effectivePermission,
  isGrantUsable,
  resolvePortalGrantContactId,
} from "./clientPortalShared";
import {
  MAX_FILE_MESSAGE_ATTACHMENT_BYTES,
  MAX_FILE_MESSAGE_ATTACHMENTS,
  MAX_FILE_MESSAGE_BODY_LEN,
} from "./fileMessages";
import { validatePlaintextPasswordPolicy } from "../lib/auth/passwordPolicy";
import {
  portalPublicFileSummary,
  portalRequestDto,
  portalSharedDocumentDto,
  portalUploadDto,
} from "./portalPublicDtos";
import { vaultDocumentOutboundFileName } from "../lib/library/vaultOutboundFileName";
import {
  folderPortalPath,
  portalRequestGroupHeading,
  type DocumentFolderRow,
} from "../lib/library/documentVaultFolders";

const SESSION_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

function publicPipelineView(row: Doc<"pipeline">) {
  return {
    _id: row._id,
    ...portalPublicFileSummary(row),
  };
}

async function loadGrantsForScopeEmail(
  ctx: QueryCtx | MutationCtx,
  orgScope: string,
  emailKey: string,
): Promise<Doc<"clientPortalGrants">[]> {
  const rows = await ctx.db
    .query("clientPortalGrants")
    .withIndex("by_scope_email", (q) =>
      q.eq("orgScope", orgScope).eq("emailKey", emailKey),
    )
    .collect();
  return rows.filter((g) => isGrantUsable(g));
}

async function authorizeSession(
  ctx: QueryCtx | MutationCtx,
  sessionTokenRaw: string,
): Promise<{
  session: Doc<"clientPortalSessions">;
  grants: Doc<"clientPortalGrants">[];
} | null> {
  const trimmed = sessionTokenRaw.trim();
  if (!trimmed) return null;
  const tokenHash = await sha256Hex(trimmed);
  const session = await ctx.db
    .query("clientPortalSessions")
    .withIndex("by_tokenHash", (q) => q.eq("tokenHash", tokenHash))
    .unique();
  if (!session || session.expiresAt < Date.now()) return null;

  const grants: Doc<"clientPortalGrants">[] = [];
  for (const gid of session.grantIds) {
    const g = await ctx.db.get(gid);
    if (!g || !isGrantUsable(g)) continue;
    if (g.emailKey !== session.emailKey || g.orgScope !== session.orgScope) continue;
    grants.push(g);
  }
  if (grants.length === 0) return null;
  return { session, grants };
}

async function createSession(
  ctx: MutationCtx,
  orgScope: string,
  emailKey: string,
  grantIds: Id<"clientPortalGrants">[],
): Promise<{ sessionToken: string; expiresAt: number }> {
  const uniq = [...new Set(grantIds)];
  const now = Date.now();
  const sessionToken = randomHex(32);
  const tokenHash = await sha256Hex(sessionToken);
  const expiresAt = now + SESSION_MS;
  await ctx.db.insert("clientPortalSessions", {
    tokenHash,
    orgScope,
    emailKey,
    grantIds: uniq,
    expiresAt,
    createdAt: now,
    lastUsedAt: now,
  });
  await enforcePortalSessionBudget(
    ctx,
    orgScope,
    emailKey,
    MAX_CONCURRENT_PORTAL_SESSIONS,
  );
  return { sessionToken, expiresAt };
}

export const listScopesForEmail = query({
  args: { email: v.string() },
  handler: async (ctx, { email }) => {
    const emailKey = normalizePortalEmailKey(email);
    if (!emailKey || !emailKey.includes("@")) return [] as const;
    const rows = await ctx.db
      .query("clientPortalGrants")
      .withIndex("by_email", (q) => q.eq("emailKey", emailKey))
      .collect();
    const scopes = new Set<string>();    
    for (const g of rows) {
      if (isGrantUsable(g)) scopes.add(g.orgScope);
    }
    const out: Array<{ orgScope: string; label: string }> = [];
    for (const orgScope of scopes) {
      let label = "Your loan team";
      if (orgScope !== "none") {
        const org = await ctx.db.get(orgScope as Id<"organizations">);
        label = org?.name?.trim() || label;
      } else {
        label = "Loan Flow Engine";
      }
      out.push({ orgScope, label });
    }
    return out;
  },
});

export const listMyFiles = query({
  args: { sessionToken: v.string() },
  handler: async (ctx, { sessionToken }) => {
    const auth = await authorizeSession(ctx, sessionToken);
    if (!auth) return { status: "unauthorized" as const };
    const files: Array<
      ReturnType<typeof publicPipelineView> & { workspaceName: string | null }
    > = [];
    const seen = new Set<string>();
    for (const g of auth.grants) {
      const key = g.pipelineFileId as string;
      if (seen.has(key)) continue;
      seen.add(key);
      const row = await ctx.db.get(g.pipelineFileId);
      if (row) {
        const base = publicPipelineView(row);
        const org = row.organizationId
          ? await ctx.db.get(row.organizationId)
          : null;
        const workspaceName =
          org?.name?.trim() && org.name.trim().length > 0
            ? org.name.trim()
            : null;
        files.push({ ...base, workspaceName });
      }
    }
    files.sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
    return {
      status: "ok" as const,
      emailKey: auth.session.emailKey,
      files,
    };
  },
});

export const getFileBundle = query({
  args: {
    sessionToken: v.string(),
    fileId: v.id("pipeline"),
  },
  handler: async (ctx, { sessionToken, fileId }) => {
    const auth = await authorizeSession(ctx, sessionToken);
    if (!auth) return { status: "unauthorized" as const };
    const grant = auth.grants.find((g) => g.pipelineFileId === fileId);
    if (!grant) return { status: "forbidden" as const };
    const file = await ctx.db.get(fileId);
    if (!file) return { status: "not_found" as const };

    const uploadsAll = await ctx.db
      .query("clientPortalUploads")
      .withIndex("by_grant", (q) => q.eq("grantId", grant._id))
      .collect();
    const uploads = uploadsAll
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 80);

    const updatesAll = await ctx.db
      .query("clientPortalUpdates")
      .withIndex("by_grant_at", (q) => q.eq("grantId", grant._id))
      .collect();
    const updates = updatesAll
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 50);

    const requestsAll = await ctx.db
      .query("clientPortalRequests")
      .withIndex("by_grant", (q) => q.eq("grantId", grant._id))
      .collect();
    const requestsSorted = requestsAll
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 50);

    const vaultFolders = await ctx.db
      .query("documentFolders")
      .withIndex("by_pipeline", (q) => q.eq("pipelineFileId", fileId))
      .collect();
    const folderRows = vaultFolders as DocumentFolderRow[];

    const requests = await Promise.all(
      requestsSorted.map(async (r) =>
        portalRequestDto(
          r,
          await openOptionalPortalCiphertext(r.description),
          await openOptionalPortalCiphertext(r.clientCompletedNote),
          r.targetFolderId
            ? folderPortalPath(folderRows, r.targetFolderId)
            : undefined,
          portalRequestGroupHeading(folderRows, r.targetFolderId),
        ),
      ),
    );

    const idn = await ctx.db
      .query("clientPortalIdentities")
      .withIndex("by_scope_email", (q) =>
        q.eq("orgScope", grant.orgScope).eq("emailKey", grant.emailKey),
      )
      .first();

    const perm = effectivePermission(grant);

    const org = file.organizationId
      ? await ctx.db.get(file.organizationId)
      : null;
    const workspaceName =
      org?.name?.trim() && org.name.trim().length > 0
        ? org.name.trim()
        : null;

    const pipelineLinks = await ctx.db
      .query("libraryDocumentLinks")
      .withIndex("by_pipeline_linkedAt", (q) => q.eq("pipelineFileId", fileId))
      .collect();

    const fileTasks = await ctx.db
      .query("documentVaultFileTasks")
      .withIndex("by_pipeline_sort", (q) => q.eq("pipelineFileId", fileId))
      .collect();
    const portalVisibleTaskIds = new Set(
      fileTasks.filter((t) => t.isPortalVisible).map((t) => String(t._id)),
    );

    const allFolders = await ctx.db
      .query("documentFolders")
      .withIndex("by_pipeline", (q) => q.eq("pipelineFileId", fileId))
      .collect();
    const folderById = new Map(allFolders.map((f) => [String(f._id), f]));

    function linkInPortalVisibleTask(
      link: Doc<"libraryDocumentLinks">,
    ): boolean {
      if (!link.fileTaskId) {
        if (!link.folderId) return false;
        let cursor: Id<"documentFolders"> | undefined = link.folderId;
        const guard = new Set<string>();
        while (cursor && !guard.has(String(cursor))) {
          guard.add(String(cursor));
          const folder = folderById.get(String(cursor));
          if (!folder) break;
          if (
            folder.fileTaskId &&
            portalVisibleTaskIds.has(String(folder.fileTaskId))
          ) {
            return true;
          }
          cursor = folder.parentFolderId;
        }
        return false;
      }
      return portalVisibleTaskIds.has(String(link.fileTaskId));
    }

    const linksForPortal = pipelineLinks.filter((l) => {
      if (linkInPortalVisibleTask(l)) return true;
      if (l.fileTaskId != null) return false;
      return l.isSharedWithClient === true;
    });
    const sharedDocuments = [];
    for (const link of linksForPortal) {
      const doc = await ctx.db.get(link.documentId);
      if (!doc || doc.latestVersionNumber <= 0) continue;
      sharedDocuments.push(portalSharedDocumentDto(doc, link._id));
    }
    sharedDocuments.sort(
      (a, b) => (b.uploadedAt ?? 0) - (a.uploadedAt ?? 0),
    );

    return {
      status: "ok" as const,
      workspaceName,
      grant: {
        _id: grant._id,
        label: grant.label,
        permission: perm ?? "view",
        canUpload: perm === "view_upload",
        grantExpiresAt: grant.grantExpiresAt,
      },
      file: publicPipelineView(file),
      sharedDocuments: sharedDocuments.slice(0, 80),
      uploads: uploads.map((u) => portalUploadDto(u)),
      updates: updates.map((u) => ({
        _id: u._id,
        summary: u.summary,
        detail: u.detail,
        createdAt: u.createdAt,
      })),
      requests,
      identityHasPassword: Boolean(idn?.passwordHash),
    };
  },
});

export const getUploadDownloadUrl = query({
  args: {
    sessionToken: v.string(),
    fileId: v.id("pipeline"),
    uploadId: v.id("clientPortalUploads"),
  },
  handler: async (ctx, { sessionToken, fileId, uploadId }) => {
    const auth = await authorizeSession(ctx, sessionToken);
    if (!auth) return { status: "unauthorized" as const };
    const grant = auth.grants.find((g) => g.pipelineFileId === fileId);
    if (!grant) return { status: "forbidden" as const };
    const up = await ctx.db.get(uploadId);
    if (!up || up.grantId !== grant._id || up.pipelineFileId !== fileId) {
      return { status: "not_found" as const };
    }
    const url = await ctx.storage.getUrl(up.storageId);
    return { status: "ok" as const, url, fileName: up.fileName };
  },
});

export const getSharedDocumentDownloadUrl = query({
  args: {
    sessionToken: v.string(),
    fileId: v.id("pipeline"),
    linkId: v.id("libraryDocumentLinks"),
  },
  handler: async (ctx, { sessionToken, fileId, linkId }) => {
    const auth = await authorizeSession(ctx, sessionToken);
    if (!auth) return { status: "unauthorized" as const };
    const grant = auth.grants.find((g) => g.pipelineFileId === fileId);
    if (!grant) return { status: "forbidden" as const };

    const pipelineLink = await ctx.db.get(linkId);
    if (!pipelineLink || pipelineLink.pipelineFileId !== fileId) {
      return { status: "not_found" as const };
    }

    let portalAllowed = false;
    if (pipelineLink.fileTaskId) {
      const task = await ctx.db.get(pipelineLink.fileTaskId);
      portalAllowed = task?.isPortalVisible === true;
    } else if (pipelineLink.folderId) {
      const folders = await ctx.db
        .query("documentFolders")
        .withIndex("by_pipeline", (q) => q.eq("pipelineFileId", fileId))
        .collect();
      const byId = new Map(folders.map((f) => [String(f._id), f]));
      let cursor: Id<"documentFolders"> | undefined = pipelineLink.folderId;
      const guard = new Set<string>();
      while (cursor && !guard.has(String(cursor))) {
        guard.add(String(cursor));
        const folder = byId.get(String(cursor));
        if (!folder) break;
        if (folder.fileTaskId) {
          const task = await ctx.db.get(folder.fileTaskId);
          portalAllowed = task?.isPortalVisible === true;
          break;
        }
        cursor = folder.parentFolderId;
      }
    }
    if (!portalAllowed && pipelineLink.fileTaskId == null) {
      portalAllowed = pipelineLink.isSharedWithClient === true;
    }
    if (!portalAllowed) return { status: "not_found" as const };

    const doc = await ctx.db.get(pipelineLink.documentId);
    if (!doc?.latestVersionId) return { status: "not_found" as const };
    const version = await ctx.db.get(doc.latestVersionId);
    if (!version?.storageId) return { status: "not_found" as const };
    const url = await ctx.storage.getUrl(version.storageId);
    if (!url) return { status: "not_found" as const };
    return {
      status: "ok" as const,
      url,
      fileName: vaultDocumentOutboundFileName(doc),
      contentType: doc.latestContentType,
    };
  },
});

export const exchangeMagicLink = mutation({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const trimmed = token.trim();
    if (!trimmed) {
      throw new Error("Invalid or expired sign-in link.");
    }
    const tokenHash = await sha256Hex(trimmed);
    await assertMagicExchangeAllowed(ctx, tokenHash);

    const link = await ctx.db
      .query("clientPortalMagicLinks")
      .withIndex("by_tokenHash", (q) => q.eq("tokenHash", tokenHash))
      .unique();
    if (!link) {
      await recordMagicLinkFailure(ctx, tokenHash);
      throw new Error("Invalid or expired sign-in link.");
    }
    if (link.usedAt) {
      await recordMagicLinkFailure(ctx, tokenHash);
      throw new Error("This sign-in link was already used.");
    }
    if (link.expiresAt < Date.now()) {
      await recordMagicLinkFailure(ctx, tokenHash);
      throw new Error("This sign-in link has expired.");
    }

    const validIds: Id<"clientPortalGrants">[] = [];
    for (const gid of link.grantIds) {
      const g = await ctx.db.get(gid);
      if (
        g &&
        isGrantUsable(g) &&
        g.orgScope === link.orgScope &&
        g.emailKey === link.emailKey
      ) {
        validIds.push(gid);
      }
    }
    if (validIds.length === 0) {
      await recordMagicLinkFailure(ctx, tokenHash);
      throw new Error("Access is no longer available for this link.");
    }

    await ctx.db.patch(link._id, { usedAt: Date.now() });
    const { sessionToken, expiresAt } = await createSession(
      ctx,
      link.orgScope,
      link.emailKey,
      validIds,
    );
    await clearMagicThrottle(ctx, tokenHash);
    const g0 = await ctx.db.get(validIds[0]!);
    if (g0) {
      await appendPortalAudit(ctx, {
        orgScope: link.orgScope,
        kind: "magic_link_exchanged",
        actorType: "client",
        actorKey: link.emailKey,
        detail: `Session issued; grants=${validIds.length}`,
        pipelineFileId: g0.pipelineFileId,
        grantId: g0._id,
      });
    }
    return { sessionToken, expiresAt, orgScope: link.orgScope };
  },
});

export const loginWithPassword = mutation({
  args: {
    orgScope: v.string(),
    email: v.string(),
    password: v.string(),
  },
  handler: async (ctx, { orgScope, email, password }) => {
    const pwErr = validatePlaintextPasswordPolicy(password);
    if (pwErr) throw new Error(pwErr);
    const emailKey = normalizePortalEmailKey(email);
    if (!emailKey) throw new Error("Enter your email.");
    await assertPasswordSignInAllowed(ctx, orgScope, emailKey);
    const identity = await ctx.db
      .query("clientPortalIdentities")
      .withIndex("by_scope_email", (q) =>
        q.eq("orgScope", orgScope).eq("emailKey", emailKey),
      )
      .first();
    if (!identity?.passwordSalt || !identity.passwordHash) {
      throw new Error("Password sign-in is not set up for this email yet.");
    }
    const ok = await verifyPassword(
      password,
      identity.passwordSalt,
      identity.passwordHash,
    );
    if (!ok) {
      await recordPortalPasswordFailure(ctx, orgScope, emailKey);
      throw new Error("Incorrect email or password.");
    }

    const grants = await loadGrantsForScopeEmail(ctx, orgScope, emailKey);
    if (grants.length === 0) {
      throw new Error("No active portal access for this workspace.");
    }
    await clearPortalPasswordThrottle(ctx, orgScope, emailKey);
    const { sessionToken, expiresAt } = await createSession(
      ctx,
      orgScope,
      emailKey,
      grants.map((g) => g._id),
    );
    const g0 = grants[0];
    if (g0) {
      await appendPortalAudit(ctx, {
        orgScope,
        kind: "password_login",
        actorType: "client",
        actorKey: emailKey,
        detail: `grants=${grants.length}`,
        pipelineFileId: g0.pipelineFileId,
        grantId: g0._id,
      });
    }
    return { sessionToken, expiresAt };
  },
});

export const setPassword = mutation({
  args: {
    sessionToken: v.string(),
    newPassword: v.string(),
  },
  handler: async (ctx, { sessionToken, newPassword }) => {
    const auth = await authorizeSession(ctx, sessionToken);
    if (!auth) throw new Error("Session expired. Sign in again.");
    const { orgScope, emailKey } = auth.session;
    const policyErr = validatePlaintextPasswordPolicy(newPassword);
    if (policyErr) throw new Error(policyErr);
    const salt = randomHex(16);
    const hash = await hashPassword(newPassword, salt);
    const now = Date.now();
    const existing = await ctx.db
      .query("clientPortalIdentities")
      .withIndex("by_scope_email", (q) =>
        q.eq("orgScope", orgScope).eq("emailKey", emailKey),
      )
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, {
        passwordSalt: salt,
        passwordHash: hash,
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("clientPortalIdentities", {
        orgScope,
        emailKey,
        passwordSalt: salt,
        passwordHash: hash,
        createdAt: now,
        updatedAt: now,
      });
    }
    const keepHash = await sha256Hex(sessionToken.trim());
    await invalidateOtherPortalSessions(ctx, orgScope, emailKey, keepHash);
    return { ok: true as const };
  },
});

export const logout = mutation({
  args: { sessionToken: v.string() },
  handler: async (ctx, { sessionToken }) => {
    const tokenHash = await sha256Hex(sessionToken.trim());
    const session = await ctx.db
      .query("clientPortalSessions")
      .withIndex("by_tokenHash", (q) => q.eq("tokenHash", tokenHash))
      .unique();
    if (session) {
      await appendPortalAudit(ctx, {
        orgScope: session.orgScope,
        kind: "client_logout",
        actorType: "client",
        actorKey: session.emailKey,
      });
      await ctx.db.delete(session._id);
    }
    return { ok: true as const };
  },
});

export const logFileView = mutation({
  args: {
    sessionToken: v.string(),
    fileId: v.id("pipeline"),
  },
  handler: async (ctx, { sessionToken, fileId }) => {
    const auth = await authorizeSession(ctx, sessionToken);
    if (!auth) return { ok: false as const };
    const grant = auth.grants.find((g) => g.pipelineFileId === fileId);
    if (!grant) return { ok: false as const };
    await appendPortalAudit(ctx, {
      orgScope: grant.orgScope,
      kind: "portal_file_view",
      actorType: "client",
      actorKey: grant.emailKey,
      pipelineFileId: fileId,
      grantId: grant._id,
    });
    return { ok: true as const };
  },
});

export const generateUploadUrl = mutation({
  args: { sessionToken: v.string(), fileId: v.id("pipeline") },
  handler: async (ctx, { sessionToken, fileId }) => {
    const auth = await authorizeSession(ctx, sessionToken);
    if (!auth) throw new Error("Session expired. Sign in again.");
    const grant = auth.grants.find((g) => g.pipelineFileId === fileId);
    if (!grant) throw new Error("You cannot upload to this file.");
    if (effectivePermission(grant) !== "view_upload") {
      throw new Error("This share is view-only; uploads are not allowed.");
    }
    await appendPortalAudit(ctx, {
      orgScope: grant.orgScope,
      kind: "upload_url_issued",
      actorType: "client",
      actorKey: grant.emailKey,
      pipelineFileId: fileId,
      grantId: grant._id,
    });
    return await ctx.storage.generateUploadUrl();
  },
});

export const attachUpload = mutation({
  args: {
    sessionToken: v.string(),
    fileId: v.id("pipeline"),
    storageId: v.id("_storage"),
    fileName: v.string(),
    contentType: v.optional(v.string()),
    size: v.optional(v.number()),
    /** Phase 39.4 — ties upload to a portal request for vault folder routing on promote. */
    requestId: v.optional(v.id("clientPortalRequests")),
  },
  handler: async (ctx, args) => {
    const {
      sessionToken,
      fileId,
      storageId,
      fileName,
      contentType,
      size,
      requestId,
    } = args;
    const auth = await authorizeSession(ctx, sessionToken);
    if (!auth) throw new Error("Session expired. Sign in again.");
    const grant = auth.grants.find((g) => g.pipelineFileId === fileId);
    if (!grant) throw new Error("You cannot upload to this file.");
    if (effectivePermission(grant) !== "view_upload") {
      try {
        await ctx.storage.delete(storageId);
      } catch {
        /* best effort */
      }
      throw new Error("This share is view-only; uploads are not allowed.");
    }

    if (requestId) {
      const req = await ctx.db.get(requestId);
      if (
        !req ||
        req.grantId !== grant._id ||
        req.pipelineFileId !== fileId ||
        req.status !== "open"
      ) {
        try {
          await ctx.storage.delete(storageId);
        } catch {
          /* best effort */
        }
        throw new Error("That upload request is not available.");
      }
    }

    const byteSize = size ?? 0;
    if (typeof byteSize === "number" && byteSize > MAX_UPLOAD_BYTES) {
      try {
        await ctx.storage.delete(storageId);
      } catch {
        /* best effort */
      }
      throw new Error("File is too large for the client portal (max 25 MB).");
    }

    const meta = await ctx.storage.getMetadata(storageId);
    if (!meta) {
      throw new Error("Upload not found. Try uploading again.");
    }
    const safeName =
      fileName.replace(/[/\\]/g, "").trim().slice(0, 255) || "document";

    const pipeline = await ctx.db.get(fileId);
    const uploaderContactId =
      pipeline != null
        ? await resolvePortalGrantContactId(ctx, grant, pipeline)
        : undefined;

    const id = await ctx.db.insert("clientPortalUploads", {
      grantId: grant._id,
      pipelineFileId: fileId,
      storageId,
      fileName: safeName,
      contentType: contentType || meta.contentType || undefined,
      size: size ?? meta.size,
      uploaderContactId,
      fulfilledRequestId: requestId,
      reviewStatus: "unreviewed",
      createdAt: Date.now(),
    });
    return { id };
  },
});

export const completeClientRequest = mutation({
  args: {
    sessionToken: v.string(),
    fileId: v.id("pipeline"),
    requestId: v.id("clientPortalRequests"),
    note: v.optional(v.string()),
  },
  handler: async (ctx, { sessionToken, fileId, requestId, note }) => {
    const auth = await authorizeSession(ctx, sessionToken);
    if (!auth) throw new Error("Session expired. Sign in again.");
    const grant = auth.grants.find((g) => g.pipelineFileId === fileId);
    if (!grant) throw new Error("Not allowed.");
    const req = await ctx.db.get(requestId);
    if (!req || req.grantId !== grant._id || req.status !== "open") {
      throw new Error("Request not found or already completed.");
    }
    const now = Date.now();
    const sealedNote = await sealOptionalPortalPlaintext(
      note?.trim().slice(0, 2000) || undefined,
    );
    await ctx.db.patch(requestId, {
      status: "done",
      completedAt: now,
      updatedAt: now,
      clientCompletedNote: sealedNote,
    });
    await appendPortalAudit(ctx, {
      orgScope: grant.orgScope,
      kind: "client_request_completed",
      actorType: "client",
      actorKey: grant.emailKey,
      detail: note?.trim().slice(0, 300),
      pipelineFileId: fileId,
      grantId: grant._id,
    });
    return { ok: true as const };
  },
});

// ---------- File messaging (portal) ----------

async function portalMessageAttachmentCount(
  ctx: QueryCtx | MutationCtx,
  messageId: Id<"fileMessages">,
) {
  const rows = await ctx.db
    .query("fileMessageAttachments")
    .withIndex("by_message", (q) => q.eq("messageId", messageId))
    .collect();
  return rows.length;
}

async function getMessageAttachmentStorageMeta(
  ctx: MutationCtx,
  storageId: Id<"_storage">,
) {
  for (let i = 0; i < 15; i++) {
    const meta = await ctx.storage.getMetadata(storageId);
    if (meta) return meta;
    await new Promise<void>((r) => setTimeout(r, 100));
  }
  return null;
}

function safePortalMessageFileName(name: string): string {
  return name.replace(/[/\\]/g, "").trim().slice(0, 255) || "attachment";
}

function clientAuthorLabel(grant: Doc<"clientPortalGrants">): string {
  const lab = grant.label?.trim();
  if (lab) return lab;
  const pre = grant.emailKey.split("@")[0];
  return pre || "Client";
}

export const listPortalThreadRoots = query({
  args: {
    sessionToken: v.string(),
    fileId: v.id("pipeline"),
    contactId: v.optional(v.id("contacts")),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { sessionToken, fileId, contactId, limit }) => {
    const auth = await authorizeSession(ctx, sessionToken);
    if (!auth) return [];
    const grant = auth.grants.find((g) => g.pipelineFileId === fileId);
    if (!grant) return [];

    const cap = Math.min(80, Math.max(1, limit ?? 40));
    const roots = await ctx.db
      .query("fileMessages")
      .withIndex("by_file_audience_root_created", (q) =>
        q.eq("pipelineFileId", fileId).eq("audience", "portal").eq("isRoot", true),
      )
      .order("desc")
      .take(cap * 2);

    const filtered = contactId
      ? roots.filter((m) => m.contactId === contactId)
      : roots;
    const slice = filtered.slice(0, cap);

    const out: Array<{
      message: Doc<"fileMessages">;
      replyCount: number;
      attachmentCount: number;
    }> = [];
    for (const root of slice) {
      const thread = await ctx.db
        .query("fileMessages")
        .withIndex("by_thread_created", (q) => q.eq("threadRootId", root._id))
        .collect();
      const replyCount = Math.max(0, thread.length - 1);
      const att = await ctx.db
        .query("fileMessageAttachments")
        .withIndex("by_message", (q) => q.eq("messageId", root._id))
        .collect();
      out.push({ message: root, replyCount, attachmentCount: att.length });
    }
    return out;
  },
});

export const listPortalThreadMessages = query({
  args: {
    sessionToken: v.string(),
    fileId: v.id("pipeline"),
    threadRootId: v.id("fileMessages"),
  },
  handler: async (ctx, { sessionToken, fileId, threadRootId }) => {
    const auth = await authorizeSession(ctx, sessionToken);
    if (!auth) return [];
    const grant = auth.grants.find((g) => g.pipelineFileId === fileId);
    if (!grant) return [];

    const root = await ctx.db.get(threadRootId);
    if (!root || root.pipelineFileId !== fileId || root.audience !== "portal") {
      return [];
    }

    const rows = await ctx.db
      .query("fileMessages")
      .withIndex("by_thread_created", (q) => q.eq("threadRootId", threadRootId))
      .collect();
    rows.sort((a, b) => a.createdAt - b.createdAt);

    const enriched: Array<{
      message: Doc<"fileMessages">;
      attachments: Doc<"fileMessageAttachments">[];
    }> = [];
    for (const m of rows) {
      const att = await ctx.db
        .query("fileMessageAttachments")
        .withIndex("by_message", (q) => q.eq("messageId", m._id))
        .collect();
      att.sort((a, b) => a.createdAt - b.createdAt);
      enriched.push({ message: m, attachments: att });
    }
    return enriched;
  },
});

export const postPortalMessage = mutation({
  args: {
    sessionToken: v.string(),
    fileId: v.id("pipeline"),
    body: v.string(),
    parentMessageId: v.optional(v.id("fileMessages")),
  },
  handler: async (ctx, { sessionToken, fileId, body, parentMessageId }) => {
    const auth = await authorizeSession(ctx, sessionToken);
    if (!auth) throw new Error("Session expired. Sign in again.");
    const grant = auth.grants.find((g) => g.pipelineFileId === fileId);
    if (!grant) throw new Error("You cannot post on this file.");

    const file = await ctx.db.get(fileId);
    if (!file) throw new Error("File not found.");

    const text = body.trim().slice(0, MAX_FILE_MESSAGE_BODY_LEN);
    if (!text) throw new Error("Message cannot be empty.");

    const now = Date.now();
    const label = clientAuthorLabel(grant);
    const emailKey = grant.emailKey;

    if (parentMessageId) {
      const parent = await ctx.db.get(parentMessageId);
      if (!parent || parent.pipelineFileId !== fileId) {
        throw new Error("Reply target not found.");
      }
      if (parent.audience !== "portal") {
        throw new Error("Cannot reply in this thread.");
      }
      const threadRootId = parent.threadRootId ?? parent._id;
      const rootRow = await ctx.db.get(threadRootId);
      const contactId = rootRow?.contactId;

      const id = await ctx.db.insert("fileMessages", {
        pipelineFileId: fileId,
        contactId,
        audience: "portal",
        parentMessageId: parent._id,
        isRoot: false,
        threadRootId,
        body: text,
        authorKind: "client",
        teamUserKey: undefined,
        clientEmailKey: emailKey,
        authorLabel: label,
        organizationId: file.organizationId,
        createdAt: now,
        updatedAt: now,
      });

      await appendPortalAudit(ctx, {
        orgScope: grant.orgScope,
        kind: "portal_thread_reply",
        actorType: "client",
        actorKey: emailKey,
        pipelineFileId: fileId,
        grantId: grant._id,
        detail: `message=${id}`,
      });
      return { messageId: id };
    }

    const id = await ctx.db.insert("fileMessages", {
      pipelineFileId: fileId,
      contactId: undefined,
      audience: "portal",
      parentMessageId: undefined,
      isRoot: true,
      body: text,
      authorKind: "client",
      teamUserKey: undefined,
      clientEmailKey: emailKey,
      authorLabel: label,
      organizationId: file.organizationId,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.patch(id, { threadRootId: id });

    await appendPortalAudit(ctx, {
      orgScope: grant.orgScope,
      kind: "portal_thread_root",
      actorType: "client",
      actorKey: emailKey,
      pipelineFileId: fileId,
      grantId: grant._id,
      detail: `message=${id}`,
    });
    return { messageId: id };
  },
});

export const generatePortalMessageUploadUrl = mutation({
  args: {
    sessionToken: v.string(),
    fileId: v.id("pipeline"),
    messageId: v.id("fileMessages"),
  },
  handler: async (ctx, { sessionToken, fileId, messageId }) => {
    const auth = await authorizeSession(ctx, sessionToken);
    if (!auth) throw new Error("Session expired. Sign in again.");
    const grant = auth.grants.find((g) => g.pipelineFileId === fileId);
    if (!grant) throw new Error("Not allowed.");
    const msg = await ctx.db.get(messageId);
    if (!msg || msg.pipelineFileId !== fileId || msg.audience !== "portal") {
      throw new Error("Message not found.");
    }
    if (
      msg.authorKind !== "client" ||
      msg.clientEmailKey !== grant.emailKey
    ) {
      throw new Error("You can only attach files to your own messages.");
    }
    const n = await portalMessageAttachmentCount(ctx, messageId);
    if (n >= MAX_FILE_MESSAGE_ATTACHMENTS) {
      throw new Error("Too many attachments on this message.");
    }
    await appendPortalAudit(ctx, {
      orgScope: grant.orgScope,
      kind: "portal_message_upload_url",
      actorType: "client",
      actorKey: grant.emailKey,
      pipelineFileId: fileId,
      grantId: grant._id,
    });
    return await ctx.storage.generateUploadUrl();
  },
});

export const attachPortalMessageUpload = mutation({
  args: {
    sessionToken: v.string(),
    fileId: v.id("pipeline"),
    messageId: v.id("fileMessages"),
    storageId: v.id("_storage"),
    fileName: v.string(),
    contentType: v.optional(v.string()),
    size: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { sessionToken, fileId, messageId, storageId, fileName, contentType, size } =
      args;
    const auth = await authorizeSession(ctx, sessionToken);
    if (!auth) throw new Error("Session expired. Sign in again.");
    const grant = auth.grants.find((g) => g.pipelineFileId === fileId);
    if (!grant) throw new Error("Not allowed.");
    const msg = await ctx.db.get(messageId);
    if (!msg || msg.pipelineFileId !== fileId || msg.audience !== "portal") {
      try {
        await ctx.storage.delete(storageId);
      } catch {
        /* best effort */
      }
      throw new Error("Message not found.");
    }
    if (
      msg.authorKind !== "client" ||
      msg.clientEmailKey !== grant.emailKey
    ) {
      try {
        await ctx.storage.delete(storageId);
      } catch {
        /* best effort */
      }
      throw new Error("You can only attach files to your own messages.");
    }
    const n = await portalMessageAttachmentCount(ctx, messageId);
    if (n >= MAX_FILE_MESSAGE_ATTACHMENTS) {
      try {
        await ctx.storage.delete(storageId);
      } catch {
        /* best effort */
      }
      throw new Error("Too many attachments on this message.");
    }

    const meta = await getMessageAttachmentStorageMeta(ctx, storageId);
    if (!meta) {
      throw new Error("Upload not found. Try again.");
    }
    const byteSize = size ?? meta.size ?? 0;
    if (byteSize > MAX_FILE_MESSAGE_ATTACHMENT_BYTES) {
      try {
        await ctx.storage.delete(storageId);
      } catch {
        /* best effort */
      }
      throw new Error("File is too large for the portal (max 25 MB).");
    }

    const safeName = safePortalMessageFileName(fileName);
    const attId = await ctx.db.insert("fileMessageAttachments", {
      messageId,
      storageId,
      fileName: safeName,
      contentType: contentType || meta.contentType || undefined,
      size: size ?? meta.size,
      createdAt: Date.now(),
    });
    await appendPortalAudit(ctx, {
      orgScope: grant.orgScope,
      kind: "portal_message_attachment",
      actorType: "client",
      actorKey: grant.emailKey,
      pipelineFileId: fileId,
      grantId: grant._id,
      detail: safeName.slice(0, 120),
    });
    return { attachmentId: attId };
  },
});

export const getPortalMessageAttachmentUrl = query({
  args: {
    sessionToken: v.string(),
    fileId: v.id("pipeline"),
    attachmentId: v.id("fileMessageAttachments"),
  },
  handler: async (ctx, { sessionToken, fileId, attachmentId }) => {
    const auth = await authorizeSession(ctx, sessionToken);
    if (!auth) return { status: "unauthorized" as const };
    const grant = auth.grants.find((g) => g.pipelineFileId === fileId);
    if (!grant) return { status: "forbidden" as const };
    const att = await ctx.db.get(attachmentId);
    if (!att) return { status: "not_found" as const };
    const msg = await ctx.db.get(att.messageId);
    if (!msg || msg.pipelineFileId !== fileId || msg.audience !== "portal") {
      return { status: "not_found" as const };
    }
    const url = await ctx.storage.getUrl(att.storageId);
    return {
      status: "ok" as const,
      url,
      fileName: att.fileName,
    };
  },
});
