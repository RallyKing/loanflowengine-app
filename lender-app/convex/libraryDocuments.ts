import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import {
  assertCanMutateContactRow,
  assertCanMutatePipelineRow,
  assertCanReadContactRow,
  assertCanReadPipelineRow,
  assertOrgPermission,
  assertOrgScopeArgs,
} from "./organizationAccess";
import {
  assertCanMutateClientVault,
  assertCanMutateLenderVault,
  assertCanReadClientVault,
  assertCanReadLenderVault,
} from "./libraryDocumentRegistryAccess";
import { purgeLibraryDocumentIfOrphaned } from "./libraryDocumentsCleanup";
import { libraryDocumentCategoryV } from "./contactStickyData/validators";
import { syncLinkExpiresAt } from "./documentVaultCompliance";
import { isGrantUsable } from "./clientPortalShared";
import {
  computeExpiresAt,
  effectiveLinkExpiresAt,
  resolveDocumentExpiryStatus,
} from "../lib/library/documentVaultExpiry";

const MAX_NAME_LEN = 255;
const MAX_TITLE_LEN = 400;
/** Align with `lenderFiles` / task attachments (any file type, reasonable size). */
const MAX_BYTES = 80 * 1024 * 1024;

const memberKeyArg = { memberUserKey: v.optional(v.string()) };

const linkMetadataUnset = v.literal("__unset__");

const linkProof = v.union(
  v.object({ kind: v.literal("pipeline"), pipelineFileId: v.id("pipeline") }),
  v.object({ kind: v.literal("contact"), contactId: v.id("contacts") }),
  v.object({ kind: v.literal("entity"), clientId: v.id("clients") }),
  v.object({ kind: v.literal("lender"), lenderId: v.id("lenders") }),
  v.object({ kind: v.literal("task"), taskId: v.id("tasks") }),
);

const vaultVersionAnnotationsV = v.object({
  highlights: v.array(
    v.object({
      id: v.string(),
      type: v.literal("highlight"),
      pageIndex: v.number(),
      x: v.number(),
      y: v.number(),
      width: v.number(),
      height: v.number(),
      color: v.optional(v.string()),
    }),
  ),
  notes: v.array(
    v.object({
      id: v.string(),
      type: v.literal("note"),
      pageIndex: v.number(),
      x: v.number(),
      y: v.number(),
      text: v.string(),
    }),
  ),
});

function safeFileName(name: string) {
  const base = name.replace(/[/\\]/g, "").trim() || "file";
  return base.slice(0, MAX_NAME_LEN);
}

async function getStorageMetadataWithRetry(
  storage: MutationCtx["storage"],
  storageId: Id<"_storage">,
  { attempts = 15, delayMs = 100 }: { attempts?: number; delayMs?: number } = {},
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

async function assertTaskOrgAccess(
  ctx: QueryCtx | MutationCtx,
  task: Doc<"tasks">,
  memberUserKey: string | undefined,
  needWrite: boolean,
) {
  if (!task.organizationId) return;
  const key = memberUserKey?.trim();
  if (!key) {
    throw new Error(
      "memberUserKey is required for organization tasks (pass browser account id).",
    );
  }
  const perm = needWrite ? "files.edit" : "files.view";
  await assertOrgPermission(ctx, task.organizationId, key, perm);
}

export async function assertCanReadLibraryDocument(
  ctx: QueryCtx | MutationCtx,
  documentId: Id<"libraryDocuments">,
  memberUserKey: string | undefined,
): Promise<Doc<"libraryDocuments">> {
  const doc = await ctx.db.get(documentId);
  if (!doc) throw new Error("Document not found.");
  const links = await ctx.db
    .query("libraryDocumentLinks")
    .withIndex("by_document", (q) => q.eq("documentId", documentId))
    .collect();
  if (links.length === 0) throw new Error("Document has no links.");

  for (const link of links) {
    if (link.pipelineFileId) {
      const row = await ctx.db.get(link.pipelineFileId);
      if (row) {
        try {
          await assertCanReadPipelineRow(ctx, row, memberUserKey);
          return doc;
        } catch {
          /* try other links */
        }
      }
    }
    if (link.contactId) {
      const row = await ctx.db.get(link.contactId);
      if (row) {
        try {
          await assertCanReadContactRow(ctx, row, memberUserKey);
          return doc;
        } catch {
          /* continue */
        }
      }
    }
    if (link.taskId) {
      const row = await ctx.db.get(link.taskId);
      if (row) {
        try {
          await assertTaskOrgAccess(ctx, row, memberUserKey, false);
          return doc;
        } catch {
          /* continue */
        }
      }
    }
    if (link.clientId) {
      const row = await ctx.db.get(link.clientId);
      if (row) {
        try {
          await assertCanReadClientVault(ctx, row, memberUserKey);
          return doc;
        } catch {
          /* continue */
        }
      }
    }
    if (link.lenderId) {
      const row = await ctx.db.get(link.lenderId);
      if (row) {
        try {
          await assertCanReadLenderVault(ctx, row, memberUserKey);
          return doc;
        } catch {
          /* continue */
        }
      }
    }
  }
  throw new Error("You do not have access to this document.");
}

export async function requireLinkForProof(
  ctx: QueryCtx | MutationCtx,
  documentId: Id<"libraryDocuments">,
  proof:
    | { kind: "pipeline"; pipelineFileId: Id<"pipeline"> }
    | { kind: "contact"; contactId: Id<"contacts"> }
    | { kind: "entity"; clientId: Id<"clients"> }
    | { kind: "lender"; lenderId: Id<"lenders"> }
    | { kind: "task"; taskId: Id<"tasks"> },
): Promise<Doc<"libraryDocumentLinks">> {
  const links = await ctx.db
    .query("libraryDocumentLinks")
    .withIndex("by_document", (q) => q.eq("documentId", documentId))
    .collect();
  if (proof.kind === "pipeline") {
    const hit = links.find((l) => l.pipelineFileId === proof.pipelineFileId);
    if (!hit) throw new Error("That pipeline file is not linked to this document.");
    return hit;
  }
  if (proof.kind === "contact") {
    const hit = links.find((l) => l.contactId === proof.contactId);
    if (!hit) throw new Error("That contact is not linked to this document.");
    return hit;
  }
  if (proof.kind === "entity") {
    const hit = links.find((l) => l.clientId === proof.clientId);
    if (!hit) throw new Error("That entity is not linked to this document.");
    return hit;
  }
  if (proof.kind === "lender") {
    const hit = links.find((l) => l.lenderId === proof.lenderId);
    if (!hit) throw new Error("That lender is not linked to this document.");
    return hit;
  }
  const hit = links.find((l) => l.taskId === proof.taskId);
  if (!hit) throw new Error("That task is not linked to this document.");
  return hit;
}

export async function assertProofWrite(
  ctx: MutationCtx,
  proof:
    | { kind: "pipeline"; pipelineFileId: Id<"pipeline"> }
    | { kind: "contact"; contactId: Id<"contacts"> }
    | { kind: "entity"; clientId: Id<"clients"> }
    | { kind: "lender"; lenderId: Id<"lenders"> }
    | { kind: "task"; taskId: Id<"tasks"> },
  memberUserKey: string | undefined,
) {
  if (proof.kind === "pipeline") {
    const row = await ctx.db.get(proof.pipelineFileId);
    if (!row) throw new Error("Pipeline file not found.");
    await assertCanMutatePipelineRow(ctx, row, memberUserKey);
    return;
  }
  if (proof.kind === "contact") {
    const row = await ctx.db.get(proof.contactId);
    if (!row) throw new Error("Contact not found.");
    await assertCanMutateContactRow(ctx, row, memberUserKey);
    return;
  }
  if (proof.kind === "entity") {
    const row = await ctx.db.get(proof.clientId);
    if (!row) throw new Error("Business entity not found.");
    await assertCanMutateClientVault(ctx, row, memberUserKey);
    return;
  }
  if (proof.kind === "lender") {
    const row = await ctx.db.get(proof.lenderId);
    if (!row) throw new Error("Lender not found.");
    await assertCanMutateLenderVault(ctx, row, memberUserKey);
    return;
  }
  const row = await ctx.db.get(proof.taskId);
  if (!row) throw new Error("Task not found.");
  await assertTaskOrgAccess(ctx, row, memberUserKey, true);
}

function orgKey(
  pipeline?: Doc<"pipeline"> | null,
  contact?: Doc<"contacts"> | null,
  task?: Doc<"tasks"> | null,
  client?: Doc<"clients"> | null,
  lender?: Doc<"lenders"> | null,
): Id<"organizations"> | undefined {
  return (
    pipeline?.organizationId ??
    contact?.organizationId ??
    client?.organizationId ??
    lender?.organizationId ??
    task?.organizationId
  );
}

type LinkProof =
  | { kind: "pipeline"; pipelineFileId: Id<"pipeline"> }
  | { kind: "contact"; contactId: Id<"contacts"> }
  | { kind: "entity"; clientId: Id<"clients"> }
  | { kind: "lender"; lenderId: Id<"lenders"> }
  | { kind: "task"; taskId: Id<"tasks"> };

function linkRowFields(link: LinkProof) {
  return {
    pipelineFileId:
      link.kind === "pipeline" ? link.pipelineFileId : undefined,
    contactId: link.kind === "contact" ? link.contactId : undefined,
    clientId: link.kind === "entity" ? link.clientId : undefined,
    lenderId: link.kind === "lender" ? link.lenderId : undefined,
    taskId: link.kind === "task" ? link.taskId : undefined,
  };
}

function linkAlreadyExists(
  existing: Doc<"libraryDocumentLinks">[],
  link: LinkProof,
): boolean {
  switch (link.kind) {
    case "pipeline":
      return existing.some((l) => l.pipelineFileId === link.pipelineFileId);
    case "contact":
      return existing.some((l) => l.contactId === link.contactId);
    case "entity":
      return existing.some((l) => l.clientId === link.clientId);
    case "lender":
      return existing.some((l) => l.lenderId === link.lenderId);
    case "task":
      return existing.some((l) => l.taskId === link.taskId);
    default:
      return false;
  }
}

async function resolveLinkProofContext(
  ctx: MutationCtx,
  link: LinkProof,
  memberUserKey: string | undefined,
): Promise<{
  org: Id<"organizations"> | undefined;
  pipeline: Doc<"pipeline"> | null;
  contact: Doc<"contacts"> | null;
  client: Doc<"clients"> | null;
  lender: Doc<"lenders"> | null;
  task: Doc<"tasks"> | null;
}> {
  await assertProofWrite(ctx, link, memberUserKey);

  let pipeline: Doc<"pipeline"> | null = null;
  let contact: Doc<"contacts"> | null = null;
  let client: Doc<"clients"> | null = null;
  let lender: Doc<"lenders"> | null = null;
  let task: Doc<"tasks"> | null = null;

  switch (link.kind) {
    case "pipeline": {
      pipeline = await ctx.db.get(link.pipelineFileId);
      if (!pipeline) throw new Error("Pipeline file not found.");
      break;
    }
    case "contact": {
      contact = await ctx.db.get(link.contactId);
      if (!contact) throw new Error("Contact not found.");
      break;
    }
    case "entity": {
      client = await ctx.db.get(link.clientId);
      if (!client) throw new Error("Business entity not found.");
      break;
    }
    case "lender": {
      lender = await ctx.db.get(link.lenderId);
      if (!lender) throw new Error("Lender not found.");
      break;
    }
    case "task": {
      task = await ctx.db.get(link.taskId);
      if (!task) throw new Error("Task not found.");
      break;
    }
  }

  return {
    org: orgKey(pipeline, contact, task, client, lender),
    pipeline,
    contact,
    client,
    lender,
    task,
  };
}

async function ensureOrgAligned(
  ctx: MutationCtx,
  doc: Doc<"libraryDocuments">,
  nextOrg: Id<"organizations"> | undefined,
) {
  if (doc.organizationId == null && nextOrg != null) {
    await ctx.db.patch(doc._id, { organizationId: nextOrg });
    return;
  }
  if (doc.organizationId != null && nextOrg != null && doc.organizationId !== nextOrg) {
    throw new Error(
      "Document belongs to a different organization than this record.",
    );
  }
}

export const generateUploadUrl = mutation({
  args: {
    proof: linkProof,
    ...memberKeyArg,
  },
  handler: async (ctx, { proof, memberUserKey }) => {
    await resolveLinkProofContext(ctx, proof, memberUserKey);
    return await ctx.storage.generateUploadUrl();
  },
});

/** Resolve a Convex storage URL for inline document editor images (after upload). */
export const resolveEditorImageUrl = mutation({
  args: {
    storageId: v.id("_storage"),
    proof: linkProof,
    ...memberKeyArg,
  },
  handler: async (ctx, { storageId, proof, memberUserKey }) => {
    await resolveLinkProofContext(ctx, proof, memberUserKey);
    const url = await ctx.storage.getUrl(storageId);
    if (!url) {
      throw new Error("Could not resolve image URL.");
    }
    return { url };
  },
});

export const createDocument = mutation({
  args: {
    title: v.string(),
    link: linkProof,
    ...memberKeyArg,
  },
  handler: async (ctx, { title, link, memberUserKey }) => {
    const t = title.trim().slice(0, MAX_TITLE_LEN);
    if (!t) throw new Error("Title is required.");
    const key = memberUserKey?.trim() || "__system__";

    const { org } = await resolveLinkProofContext(ctx, link, memberUserKey);

    const now = Date.now();
    const docId = await ctx.db.insert("libraryDocuments", {
      organizationId: org,
      title: t,
      createdByUserKey: key,
      latestVersionNumber: 0,
      createdAt: now,
      updatedAt: now,
    });

    await ctx.db.insert("libraryDocumentLinks", {
      documentId: docId,
      ...linkRowFields(link),
      ...(link.kind === "pipeline" ? { isSharedWithClient: false } : {}),
      linkedAt: now,
      linkedByUserKey: key,
    });

    return { documentId: docId };
  },
});

export const addDocumentLink = mutation({
  args: {
    documentId: v.id("libraryDocuments"),
    link: linkProof,
    ...memberKeyArg,
  },
  handler: async (ctx, { documentId, link, memberUserKey }) => {
    const doc = await ctx.db.get(documentId);
    if (!doc) throw new Error("Document not found.");

    const { org, pipeline, contact, task, client, lender } =
      await resolveLinkProofContext(ctx, link, memberUserKey);
    await ensureOrgAligned(ctx, doc, orgKey(pipeline, contact, task, client, lender));

    const existing = await ctx.db
      .query("libraryDocumentLinks")
      .withIndex("by_document", (q) => q.eq("documentId", documentId))
      .collect();
    if (linkAlreadyExists(existing, link)) {
      throw new Error("That link already exists.");
    }

    const key = memberUserKey?.trim() || "__system__";
    const now = Date.now();
    await ctx.db.insert("libraryDocumentLinks", {
      documentId,
      ...linkRowFields(link),
      ...(link.kind === "pipeline" ? { isSharedWithClient: false } : {}),
      linkedAt: now,
      linkedByUserKey: key,
    });
    await ctx.db.patch(documentId, { updatedAt: now });
    return { ok: true as const };
  },
});

/**
 * Phase 40.1 — atomic dual-key bind: pipeline deal + CRM contact in one request.
 * Creates missing links and applies category/folder metadata without partial failure.
 */
export const linkAndCategorizeDocument = mutation({
  args: {
    documentId: v.id("libraryDocuments"),
    pipelineFileId: v.id("pipeline"),
    contactId: v.id("contacts"),
    documentCategory: v.optional(libraryDocumentCategoryV),
    folderId: v.optional(v.union(v.id("documentFolders"), linkMetadataUnset)),
    ...memberKeyArg,
  },
  handler: async (ctx, args) => {
    const {
      documentId,
      pipelineFileId,
      contactId,
      documentCategory,
      folderId,
      memberUserKey,
    } = args;

    const doc = await ctx.db.get(documentId);
    if (!doc) throw new Error("Document not found.");

    const pipeline = await ctx.db.get(pipelineFileId);
    if (!pipeline) throw new Error("Pipeline file not found.");
    await assertCanMutatePipelineRow(ctx, pipeline, memberUserKey);

    const contact = await ctx.db.get(contactId);
    if (!contact) throw new Error("Contact not found.");
    await assertCanMutateContactRow(ctx, contact, memberUserKey);

    await ensureOrgAligned(ctx, doc, orgKey(pipeline, contact, null));

    const key = memberUserKey?.trim() || "__system__";
    const now = Date.now();
    const existing = await ctx.db
      .query("libraryDocumentLinks")
      .withIndex("by_document", (q) => q.eq("documentId", documentId))
      .collect();

    let pipelineLink = existing.find((l) => l.pipelineFileId === pipelineFileId);
    if (!pipelineLink) {
      const linkId = await ctx.db.insert("libraryDocumentLinks", {
        documentId,
        pipelineFileId,
        linkedAt: now,
        linkedByUserKey: key,
      });
      pipelineLink = (await ctx.db.get(linkId))!;
    }

    let contactLink = existing.find((l) => l.contactId === contactId);
    if (!contactLink) {
      const linkId = await ctx.db.insert("libraryDocumentLinks", {
        documentId,
        contactId,
        linkedAt: now,
        linkedByUserKey: key,
      });
      contactLink = (await ctx.db.get(linkId))!;
    }

    const pipelinePatch: {
      documentCategory?: Doc<"libraryDocumentLinks">["documentCategory"];
      folderId?: Id<"documentFolders">;
    } = {};
    if (folderId !== undefined) {
      if (folderId === "__unset__") {
        pipelinePatch.folderId = undefined;
      } else {
        const folder = await ctx.db.get(folderId);
        if (!folder || folder.pipelineFileId !== pipelineFileId) {
          throw new Error("Folder does not belong to this pipeline file.");
        }
        pipelinePatch.folderId = folderId;
      }
    }
    if (Object.keys(pipelinePatch).length > 0) {
      await ctx.db.patch(pipelineLink._id, pipelinePatch);
    }

    if (documentCategory !== undefined) {
      await ctx.db.patch(contactLink._id, { documentCategory });
    }

    await ctx.db.patch(documentId, { updatedAt: now });
    return { ok: true as const };
  },
});

/**
 * Assign a vault document to a CRM contact or entity with category metadata.
 * Ensures pipeline + registry links exist without duplicating storage blobs.
 */
export const assignDocumentToRegistry = mutation({
  args: {
    documentId: v.id("libraryDocuments"),
    pipelineFileId: v.id("pipeline"),
    assigneeKind: v.union(v.literal("contact"), v.literal("entity")),
    contactId: v.optional(v.id("contacts")),
    clientId: v.optional(v.id("clients")),
    documentCategory: libraryDocumentCategoryV,
    folderId: v.optional(v.union(v.id("documentFolders"), linkMetadataUnset)),
    ...memberKeyArg,
  },
  handler: async (ctx, args) => {
    const {
      documentId,
      pipelineFileId,
      assigneeKind,
      contactId,
      clientId,
      documentCategory,
      folderId,
      memberUserKey,
    } = args;

    if (assigneeKind === "contact" && !contactId) {
      throw new Error("contactId is required for contact assignment.");
    }
    if (assigneeKind === "entity" && !clientId) {
      throw new Error("clientId is required for entity assignment.");
    }

    const doc = await ctx.db.get(documentId);
    if (!doc) throw new Error("Document not found.");

    const pipeline = await ctx.db.get(pipelineFileId);
    if (!pipeline) throw new Error("Pipeline file not found.");
    await assertCanMutatePipelineRow(ctx, pipeline, memberUserKey);

    let contact: Doc<"contacts"> | null = null;
    let client: Doc<"clients"> | null = null;
    if (assigneeKind === "contact") {
      contact = await ctx.db.get(contactId!);
      if (!contact) throw new Error("Contact not found.");
      await assertCanMutateContactRow(ctx, contact, memberUserKey);
    } else {
      client = await ctx.db.get(clientId!);
      if (!client) throw new Error("Entity not found.");
      if (client.organizationId && pipeline.organizationId) {
        if (client.organizationId !== pipeline.organizationId) {
          throw new Error("Entity does not belong to this organization.");
        }
      }
    }

    await ensureOrgAligned(ctx, doc, orgKey(pipeline, contact, null, client));

    const key = memberUserKey?.trim() || "__system__";
    const now = Date.now();
    const existing = await ctx.db
      .query("libraryDocumentLinks")
      .withIndex("by_document", (q) => q.eq("documentId", documentId))
      .collect();

    let pipelineLink = existing.find((l) => l.pipelineFileId === pipelineFileId);
    if (!pipelineLink) {
      const linkId = await ctx.db.insert("libraryDocumentLinks", {
        documentId,
        pipelineFileId,
        linkedAt: now,
        linkedByUserKey: key,
      });
      pipelineLink = (await ctx.db.get(linkId))!;
    }

    const registryLink =
      assigneeKind === "contact"
        ? existing.find((l) => l.contactId === contactId)
        : existing.find((l) => l.clientId === clientId);

    let registryLinkRow = registryLink;
    if (!registryLinkRow) {
      const linkId = await ctx.db.insert("libraryDocumentLinks", {
        documentId,
        ...(assigneeKind === "contact"
          ? { contactId: contactId! }
          : { clientId: clientId! }),
        documentCategory,
        linkedAt: now,
        linkedByUserKey: key,
      });
      registryLinkRow = (await ctx.db.get(linkId))!;
    } else {
      await ctx.db.patch(registryLinkRow._id, { documentCategory });
    }

    const pipelinePatch: {
      documentCategory?: Doc<"libraryDocumentLinks">["documentCategory"];
      folderId?: Id<"documentFolders">;
    } = {};
    if (folderId !== undefined) {
      if (folderId === "__unset__") {
        pipelinePatch.folderId = undefined;
      } else {
        const folder = await ctx.db.get(folderId);
        if (!folder || folder.pipelineFileId !== pipelineFileId) {
          throw new Error("Folder does not belong to this pipeline file.");
        }
        pipelinePatch.folderId = folderId;
      }
    }
    if (Object.keys(pipelinePatch).length > 0) {
      await ctx.db.patch(pipelineLink._id, pipelinePatch);
    }

    await ctx.db.patch(documentId, { updatedAt: now });
    return { ok: true as const };
  },
});

export const removeDocumentLink = mutation({
  args: {
    documentId: v.id("libraryDocuments"),
    link: linkProof,
    ...memberKeyArg,
  },
  handler: async (ctx, { documentId, link, memberUserKey }) => {
    await assertProofWrite(ctx, link, memberUserKey);
    const hit = await requireLinkForProof(ctx, documentId, link);
    await ctx.db.delete(hit._id);
    await purgeLibraryDocumentIfOrphaned(ctx, documentId);
    return { ok: true as const };
  },
});

export const commitDocumentVersion = mutation({
  args: {
    documentId: v.id("libraryDocuments"),
    proof: linkProof,
    storageId: v.id("_storage"),
    fileName: v.string(),
    contentType: v.optional(v.string()),
    size: v.optional(v.number()),
    ...memberKeyArg,
  },
  handler: async (ctx, args) => {
    const { documentId, proof, storageId, fileName, contentType, size, memberUserKey } =
      args;
    await assertProofWrite(ctx, proof, memberUserKey);
    await requireLinkForProof(ctx, documentId, proof);

    const doc = await ctx.db.get(documentId);
    if (!doc) throw new Error("Document not found.");

    const meta = await getStorageMetadataWithRetry(ctx.storage, storageId);
    if (!meta) {
      throw new Error(
        "Upload not found. POST the file to the upload URL, then try again.",
      );
    }
    const byteSize = size ?? meta.size ?? 0;
    if (typeof byteSize === "number" && byteSize > MAX_BYTES) {
      try {
        await ctx.storage.delete(storageId);
      } catch {
        /* best-effort */
      }
      throw new Error(
        `File exceeds maximum size (${Math.round(MAX_BYTES / (1024 * 1024))} MB).`,
      );
    }

    const safeName = safeFileName(fileName);
    const ct = contentType || meta.contentType || undefined;
    const key = memberUserKey?.trim() || "__system__";
    const now = Date.now();
    const nextVersion = doc.latestVersionNumber + 1;

    const versionId = await ctx.db.insert("libraryDocumentVersions", {
      documentId,
      version: nextVersion,
      storageId,
      fileName: safeName,
      contentType: ct,
      size: size ?? meta.size,
      uploadedByUserKey: key,
      uploadedAt: now,
    });

    await ctx.db.patch(documentId, {
      latestVersionNumber: nextVersion,
      latestVersionId: versionId,
      latestFileName: safeName,
      latestContentType: ct,
      latestSize: size ?? meta.size,
      latestUploadedAt: now,
      updatedAt: now,
    });

    const proofLink = await requireLinkForProof(ctx, documentId, proof);
    await syncLinkExpiresAt(ctx, proofLink, now);

    return { versionId, version: nextVersion };
  },
});

/** Phase 40.2 — persist highlight/note overlays for a specific version row. */
export const patchVersionAnnotations = mutation({
  args: {
    documentId: v.id("libraryDocuments"),
    versionId: v.id("libraryDocumentVersions"),
    annotations: vaultVersionAnnotationsV,
    proof: linkProof,
    ...memberKeyArg,
  },
  handler: async (ctx, { documentId, versionId, annotations, proof, memberUserKey }) => {
    await assertProofWrite(ctx, proof, memberUserKey);
    await requireLinkForProof(ctx, documentId, proof);
    const ver = await ctx.db.get(versionId);
    if (!ver || ver.documentId !== documentId) {
      throw new Error("Version not found.");
    }
    await ctx.db.patch(versionId, { annotations });
    await ctx.db.patch(documentId, { updatedAt: Date.now() });
    return { ok: true as const };
  },
});

export const patchDocumentTitle = mutation({
  args: {
    documentId: v.id("libraryDocuments"),
    title: v.string(),
    proof: linkProof,
    ...memberKeyArg,
  },
  handler: async (ctx, { documentId, title, proof, memberUserKey }) => {
    const t = title.trim().slice(0, MAX_TITLE_LEN);
    if (!t) throw new Error("Title is required.");
    await assertProofWrite(ctx, proof, memberUserKey);
    await requireLinkForProof(ctx, documentId, proof);
    const now = Date.now();
    await ctx.db.patch(documentId, { title: t, updatedAt: now });
    return { ok: true as const, title: t };
  },
});

export const toggleDocumentVisibility = mutation({
  args: {
    documentId: v.id("libraryDocuments"),
    pipelineFileId: v.id("pipeline"),
    isSharedWithClient: v.boolean(),
    ...memberKeyArg,
  },
  handler: async (ctx, { documentId, pipelineFileId, isSharedWithClient, memberUserKey }) => {
    const proof = { kind: "pipeline" as const, pipelineFileId };
    await assertProofWrite(ctx, proof, memberUserKey);
    const link = await requireLinkForProof(ctx, documentId, proof);
    await ctx.db.patch(link._id, { isSharedWithClient });
    return { ok: true as const, isSharedWithClient };
  },
});

export const patchDocumentLinkMetadata = mutation({
  args: {
    documentId: v.id("libraryDocuments"),
    proof: linkProof,
    documentCategory: v.optional(
      v.union(libraryDocumentCategoryV, linkMetadataUnset),
    ),
    taxYear: v.optional(v.union(v.string(), linkMetadataUnset)),
    /** Phase 39.3 — vault folder placement (pipeline links only). Pass `__unset__` for root. */
    folderId: v.optional(
      v.union(v.id("documentFolders"), linkMetadataUnset),
    ),
    customTags: v.optional(
      v.union(v.array(v.string()), linkMetadataUnset),
    ),
    ...memberKeyArg,
  },
  handler: async (ctx, args) => {
    const { documentId, proof, documentCategory, taxYear, folderId, customTags, memberUserKey } =
      args;
    await assertProofWrite(ctx, proof, memberUserKey);
    const link = await requireLinkForProof(ctx, documentId, proof);

    const patch: {
      documentCategory?: Doc<"libraryDocumentLinks">["documentCategory"];
      taxYear?: string;
      folderId?: Id<"documentFolders">;
      customTags?: string[];
      expiresAt?: number;
    } = {};

    if (documentCategory !== undefined) {
      if (documentCategory === "__unset__") {
        patch.documentCategory = undefined;
        patch.taxYear = undefined;
      } else {
        patch.documentCategory = documentCategory;
        if (documentCategory !== "tax_return") {
          patch.taxYear = undefined;
        }
      }
    }

    if (taxYear !== undefined && documentCategory !== "__unset__") {
      if (taxYear === "__unset__") {
        patch.taxYear = undefined;
      } else {
        const normalized = taxYear.trim();
        if (normalized && !/^\d{4}$/.test(normalized)) {
          throw new Error("Tax year must be a four-digit year (e.g. 2024).");
        }
        patch.taxYear = normalized || undefined;
      }
    }

    if (folderId !== undefined) {
      if (folderId === "__unset__") {
        patch.folderId = undefined;
      } else {
        if (proof.kind !== "pipeline") {
          throw new Error("Folders apply to pipeline file links only.");
        }
        const folder = await ctx.db.get(folderId);
        if (!folder) throw new Error("Folder not found.");
        if (folder.pipelineFileId !== proof.pipelineFileId) {
          throw new Error("Folder belongs to a different file.");
        }
        patch.folderId = folderId;
      }
    }

    if (customTags !== undefined) {
      if (customTags === "__unset__") {
        patch.customTags = undefined;
      } else {
        const normalized = [
          ...new Set(
            customTags.map((t) => t.trim()).filter((t) => t.length > 0),
          ),
        ].slice(0, 32);
        patch.customTags = normalized.length ? normalized : undefined;
      }
    }

    if (Object.keys(patch).length === 0) {
      return { ok: true as const };
    }

    const doc = await ctx.db.get(documentId);
    const mergedCategory =
      patch.documentCategory !== undefined
        ? patch.documentCategory
        : link.documentCategory;
    patch.expiresAt = computeExpiresAt(
      doc?.latestUploadedAt,
      mergedCategory ?? undefined,
    );

    await ctx.db.patch(link._id, patch);
    await ctx.db.patch(documentId, { updatedAt: Date.now() });

    if (patch.documentCategory !== undefined) {
      await ctx.db.patch(documentId, {
        aiSuggestedCategory: undefined,
        aiConfidence: undefined,
        aiSuggestedTaxYear: undefined,
        aiSuggestedFolderName: undefined,
      });
    }

    return { ok: true as const };
  },
});

export const listForProof = query({
  args: {
    proof: linkProof,
    limit: v.optional(v.number()),
    /** Phase 37.6.D.4 — hydrate contact-scoped library links (vault). */
    hydrateContactIds: v.optional(v.array(v.id("contacts"))),
    ...memberKeyArg,
  },
  handler: async (ctx, { proof, limit, hydrateContactIds, memberUserKey }) => {
    const cap = Math.min(200, Math.max(1, limit ?? 80));

    if (proof.kind === "pipeline") {
      const row = await ctx.db.get(proof.pipelineFileId);
      if (!row) return [];
      await assertCanReadPipelineRow(ctx, row, memberUserKey);

      if (hydrateContactIds?.length) {
        return await listPipelineWithHydratedContacts(
          ctx,
          proof.pipelineFileId,
          hydrateContactIds,
          cap,
          memberUserKey,
        );
      }

      const links = await ctx.db
        .query("libraryDocumentLinks")
        .withIndex("by_pipeline_linkedAt", (q) =>
          q.eq("pipelineFileId", proof.pipelineFileId),
        )
        .order("desc")
        .take(cap);
      return await listDocumentsForScopedLinks(
        ctx,
        links.map((link) => ({ link, linkScope: "pipeline" as const })),
      );
    }

    if (proof.kind === "contact") {
      const row = await ctx.db.get(proof.contactId);
      if (!row) return [];
      await assertCanReadContactRow(ctx, row, memberUserKey);
      const links = await ctx.db
        .query("libraryDocumentLinks")
        .withIndex("by_contact_linkedAt", (q) =>
          q.eq("contactId", proof.contactId),
        )
        .order("desc")
        .take(cap);
      return await listDocumentsForScopedLinks(
        ctx,
        links.map((link) => ({
          link,
          linkScope: "contact" as const,
          hydratedContactId: proof.contactId,
        })),
      );
    }

    if (proof.kind === "entity") {
      const row = await ctx.db.get(proof.clientId);
      if (!row) return [];
      await assertCanReadClientVault(ctx, row, memberUserKey);
      const links = await ctx.db
        .query("libraryDocumentLinks")
        .withIndex("by_client_linkedAt", (q) => q.eq("clientId", proof.clientId))
        .order("desc")
        .take(cap);
      return await listDocumentsForScopedLinks(
        ctx,
        links.map((link) => ({ link, linkScope: "entity" as const })),
      );
    }

    if (proof.kind === "lender") {
      const row = await ctx.db.get(proof.lenderId);
      if (!row) return [];
      await assertCanReadLenderVault(ctx, row, memberUserKey);
      const links = await ctx.db
        .query("libraryDocumentLinks")
        .withIndex("by_lender_linkedAt", (q) => q.eq("lenderId", proof.lenderId))
        .order("desc")
        .take(cap);
      return await listDocumentsForScopedLinks(
        ctx,
        links.map((link) => ({ link, linkScope: "lender" as const })),
      );
    }

    const row = await ctx.db.get(proof.taskId);
    if (!row) return [];
    await assertTaskOrgAccess(ctx, row, memberUserKey, false);
    const links = await ctx.db
      .query("libraryDocumentLinks")
      .withIndex("by_task_linkedAt", (q) => q.eq("taskId", proof.taskId))
      .order("desc")
      .take(cap);
    return await listDocumentsForScopedLinks(
      ctx,
      links.map((link) => ({ link, linkScope: "task" as const })),
    );
  },
});

async function listPipelineWithHydratedContacts(
  ctx: QueryCtx,
  pipelineFileId: Id<"pipeline">,
  contactIds: Id<"contacts">[],
  cap: number,
  memberUserKey: string | undefined,
) {
  const pipelineLinks = await ctx.db
    .query("libraryDocumentLinks")
    .withIndex("by_pipeline_linkedAt", (q) =>
      q.eq("pipelineFileId", pipelineFileId),
    )
    .order("desc")
    .take(cap);

  const seenDocIds = new Set<string>();
  const merged: Array<{
    link: Doc<"libraryDocumentLinks">;
    linkScope: "pipeline" | "contact";
    hydratedContactId?: Id<"contacts">;
    sortKey: number;
  }> = [];

  for (const link of pipelineLinks) {
    seenDocIds.add(String(link.documentId));
    merged.push({ link, linkScope: "pipeline", sortKey: link.linkedAt });
  }

  const uniqueContactIds = [...new Set(contactIds.map(String))].map(
    (id) => id as Id<"contacts">,
  );

  for (const contactId of uniqueContactIds) {
    const contact = await ctx.db.get(contactId);
    if (!contact) continue;
    try {
      await assertCanReadContactRow(ctx, contact, memberUserKey);
    } catch {
      continue;
    }
    const contactLinks = await ctx.db
      .query("libraryDocumentLinks")
      .withIndex("by_contact_linkedAt", (q) => q.eq("contactId", contactId))
      .order("desc")
      .take(cap);
    for (const link of contactLinks) {
      const docKey = String(link.documentId);
      if (seenDocIds.has(docKey)) continue;
      seenDocIds.add(docKey);
      merged.push({
        link,
        linkScope: "contact",
        hydratedContactId: contactId,
        sortKey: link.linkedAt,
      });
    }
  }

  merged.sort((a, b) => b.sortKey - a.sortKey);
  return await listDocumentsForScopedLinks(ctx, merged.slice(0, cap));
}

type ScopedLibraryLink = {
  link: Doc<"libraryDocumentLinks">;
  linkScope: "pipeline" | "contact" | "entity" | "lender" | "task";
  hydratedContactId?: Id<"contacts">;
};

async function listDocumentsForScopedLinks(
  ctx: QueryCtx,
  scoped: ScopedLibraryLink[],
) {
  const out: Array<{
    _id: Id<"libraryDocuments">;
    linkId: Id<"libraryDocumentLinks">;
    title: string;
    latestVersionNumber: number;
    latestVersionId: Id<"libraryDocumentVersions"> | undefined;
    latestFileName: string | undefined;
    latestContentType: string | undefined;
    latestSize: number | undefined;
    latestUploadedAt: number | undefined;
    updatedAt: number;
    documentCategory: Doc<"libraryDocumentLinks">["documentCategory"];
    taxYear: string | undefined;
    folderId: Id<"documentFolders"> | undefined;
    expiresAt: number | undefined;
    expiryStatus: ReturnType<typeof resolveDocumentExpiryStatus>;
    linkScope: "pipeline" | "contact" | "entity" | "lender" | "task";
    hydratedContactId: Id<"contacts"> | undefined;
    /** True when any link row on this document targets a CRM contact. */
    savedToContactProfile: boolean;
    aiSuggestedCategory: Doc<"libraryDocuments">["aiSuggestedCategory"];
    aiConfidence: number | undefined;
    aiSuggestedTaxYear: string | undefined;
    aiSuggestedFolderName: string | undefined;
    reviewStatus: "rejected" | undefined;
    rejectionReason: string | undefined;
    isSharedWithClient: boolean;
  }> = [];
  for (const entry of scoped) {
    const l = entry.link;
    const doc = await ctx.db.get(l.documentId);
    if (!doc) continue;
    const docLinks = await ctx.db
      .query("libraryDocumentLinks")
      .withIndex("by_document", (q) => q.eq("documentId", doc._id))
      .collect();
    const savedToContactProfile = docLinks.some((row) => row.contactId != null);
    const expiresAt = effectiveLinkExpiresAt(l, doc.latestUploadedAt);
    out.push({
      _id: doc._id,
      linkId: l._id,
      title: doc.title,
      latestVersionNumber: doc.latestVersionNumber,
      latestVersionId: doc.latestVersionId,
      latestFileName: doc.latestFileName,
      latestContentType: doc.latestContentType,
      latestSize: doc.latestSize,
      latestUploadedAt: doc.latestUploadedAt,
      updatedAt: doc.updatedAt,
      documentCategory: l.documentCategory,
      taxYear: l.taxYear,
      folderId: l.folderId,
      expiresAt,
      expiryStatus: resolveDocumentExpiryStatus(expiresAt),
      linkScope: entry.linkScope,
      hydratedContactId: entry.hydratedContactId,
      savedToContactProfile,
      aiSuggestedCategory: doc.aiSuggestedCategory,
      aiConfidence: doc.aiConfidence,
      aiSuggestedTaxYear: doc.aiSuggestedTaxYear,
      aiSuggestedFolderName: doc.aiSuggestedFolderName,
      reviewStatus: l.reviewStatus,
      rejectionReason: l.rejectionReason,
      isSharedWithClient: l.isSharedWithClient === true,
    });
  }
  return out;
}

/** @deprecated Use listDocumentsForScopedLinks */
async function listDocumentsForLinks(
  ctx: QueryCtx,
  links: Doc<"libraryDocumentLinks">[],
) {
  return listDocumentsForScopedLinks(
    ctx,
    links.map((link) => ({ link, linkScope: "pipeline" as const })),
  );
}

export const listVersions = query({
  args: {
    documentId: v.id("libraryDocuments"),
    ...memberKeyArg,
  },
  handler: async (ctx, { documentId, memberUserKey }) => {
    await assertCanReadLibraryDocument(ctx, documentId, memberUserKey);
    const rows = await ctx.db
      .query("libraryDocumentVersions")
      .withIndex("by_document_version", (q) => q.eq("documentId", documentId))
      .order("desc")
      .take(200);
    return rows.map((r) => ({
      _id: r._id,
      version: r.version,
      fileName: r.fileName,
      contentType: r.contentType,
      size: r.size,
      uploadedAt: r.uploadedAt,
      uploadedByUserKey: r.uploadedByUserKey,
      annotations: r.annotations,
    }));
  },
});

export const getVersionUrl = query({
  args: {
    documentId: v.id("libraryDocuments"),
    versionId: v.id("libraryDocumentVersions"),
    ...memberKeyArg,
  },
  handler: async (ctx, { documentId, versionId, memberUserKey }) => {
    await assertCanReadLibraryDocument(ctx, documentId, memberUserKey);
    const ver = await ctx.db.get(versionId);
    if (!ver || ver.documentId !== documentId) {
      return { status: "not_found" as const };
    }
    const url = await ctx.storage.getUrl(ver.storageId);
    return {
      status: "ok" as const,
      url,
      fileName: ver.fileName,
      contentType: ver.contentType,
      version: ver.version,
      annotations: ver.annotations,
    };
  },
});

/** Phase 40.3 — record view/download/edit for properties access log. */
export const logDocumentAccess = mutation({
  args: {
    documentId: v.id("libraryDocuments"),
    pipelineFileId: v.optional(v.id("pipeline")),
    action: v.union(
      v.literal("view"),
      v.literal("edit"),
      v.literal("download"),
    ),
    ...memberKeyArg,
  },
  handler: async (ctx, { documentId, pipelineFileId, action, memberUserKey }) => {
    await assertCanReadLibraryDocument(ctx, documentId, memberUserKey);
    const key = memberUserKey?.trim() || "__anonymous__";
    await ctx.db.insert("libraryDocumentAccessEvents", {
      documentId,
      pipelineFileId,
      userKey: key,
      action,
      at: Date.now(),
    });
    return { ok: true as const };
  },
});

export const getDocumentProperties = query({
  args: {
    documentId: v.id("libraryDocuments"),
    proof: linkProof,
    ...memberKeyArg,
  },
  handler: async (ctx, { documentId, proof, memberUserKey }) => {
    await assertCanReadLibraryDocument(ctx, documentId, memberUserKey);
    const doc = await ctx.db.get(documentId);
    if (!doc) return null;
    const link = await requireLinkForProof(ctx, documentId, proof);

    const versions = await ctx.db
      .query("libraryDocumentVersions")
      .withIndex("by_document_version", (q) => q.eq("documentId", documentId))
      .order("desc")
      .take(50);

    const accessEvents = await ctx.db
      .query("libraryDocumentAccessEvents")
      .withIndex("by_document_at", (q) => q.eq("documentId", documentId))
      .order("desc")
      .take(40);

    const versionLog = versions.map((v) => ({
      userKey: v.uploadedByUserKey,
      action: "upload" as const,
      at: v.uploadedAt,
      fileName: v.fileName,
      version: v.version,
    }));

    const eventLog = accessEvents.map((e) => ({
      userKey: e.userKey,
      action: e.action,
      at: e.at,
    }));

    return {
      documentId: doc._id,
      title: doc.title,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
      latestVersionNumber: doc.latestVersionNumber,
      latestFileName: doc.latestFileName,
      latestContentType: doc.latestContentType,
      latestSize: doc.latestSize,
      latestUploadedAt: doc.latestUploadedAt,
      documentCategory: link.documentCategory,
      taxYear: link.taxYear,
      folderId: link.folderId,
      customTags: link.customTags ?? [],
      accessLog: [...eventLog, ...versionLog].sort((a, b) => b.at - a.at).slice(0, 50),
    };
  },
});

export const bulkMoveDocuments = mutation({
  args: {
    pipelineFileId: v.id("pipeline"),
    documentIds: v.array(v.id("libraryDocuments")),
    folderId: v.optional(v.union(v.id("documentFolders"), linkMetadataUnset)),
    ...memberKeyArg,
  },
  handler: async (ctx, { pipelineFileId, documentIds, folderId, memberUserKey }) => {
    const pipeline = await ctx.db.get(pipelineFileId);
    if (!pipeline) throw new Error("Pipeline file not found.");
    await assertCanMutatePipelineRow(ctx, pipeline, memberUserKey);

    if (folderId && folderId !== "__unset__") {
      const folder = await ctx.db.get(folderId);
      if (!folder || folder.pipelineFileId !== pipelineFileId) {
        throw new Error("Folder does not belong to this file.");
      }
    }

    const proof = { kind: "pipeline" as const, pipelineFileId };
    let moved = 0;
    const failures: string[] = [];

    for (const documentId of documentIds) {
      try {
        await assertProofWrite(ctx, proof, memberUserKey);
        const link = await requireLinkForProof(ctx, documentId, proof);
        const patch: { folderId?: Id<"documentFolders"> } = {};
        if (folderId === undefined) continue;
        patch.folderId = folderId === "__unset__" ? undefined : folderId;
        await ctx.db.patch(link._id, patch);
        await ctx.db.patch(documentId, { updatedAt: Date.now() });
        moved += 1;
      } catch (e) {
        failures.push(
          e instanceof Error ? e.message : `Failed to move ${documentId}`,
        );
      }
    }

    if (moved === 0 && failures.length > 0) {
      throw new Error(failures[0] ?? "No documents moved.");
    }
    return { ok: true as const, moved, failures };
  },
});

export const rejectAndRequestDocument = mutation({
  args: {
    documentId: v.id("libraryDocuments"),
    pipelineFileId: v.id("pipeline"),
    reason: v.string(),
    ...memberKeyArg,
  },
  handler: async (
    ctx,
    { documentId, pipelineFileId, reason, memberUserKey },
  ) => {
    const pipeline = await ctx.db.get(pipelineFileId);
    if (!pipeline) throw new Error("Pipeline file not found.");
    await assertCanMutatePipelineRow(ctx, pipeline, memberUserKey);

    const proof = { kind: "pipeline" as const, pipelineFileId };
    await assertProofWrite(ctx, proof, memberUserKey);
    const link = await requireLinkForProof(ctx, documentId, proof);
    const doc = await ctx.db.get(documentId);
    if (!doc) throw new Error("Document not found.");

    const trimmedReason = reason.trim().slice(0, 500);
    if (!trimmedReason) throw new Error("Rejection reason is required.");

    const now = Date.now();
    const poster = memberUserKey?.trim() || "__vault__";

    await ctx.db.patch(link._id, {
      reviewStatus: "rejected",
      rejectionReason: trimmedReason,
      rejectedAt: now,
      rejectedByUserKey: poster,
    });
    await ctx.db.patch(documentId, { updatedAt: now });

    const grants = await ctx.db
      .query("clientPortalGrants")
      .withIndex("by_file", (q) => q.eq("pipelineFileId", pipelineFileId))
      .collect();
    const usableGrants = grants.filter((g) => isGrantUsable(g));

    let portalRequestsCreated = 0;
    for (const grant of usableGrants) {
      const existing = await ctx.db
        .query("clientPortalRequests")
        .withIndex("by_grant", (q) => q.eq("grantId", grant._id))
        .collect();
      const hasOpenRejection = existing.some(
        (r) =>
          r.status === "open" &&
          r.requestKind === "rejection" &&
          r.sourceDocumentId === documentId,
      );
      if (hasOpenRejection) continue;

      await ctx.db.insert("clientPortalRequests", {
        grantId: grant._id,
        pipelineFileId,
        title: `Re-upload: ${doc.title}`,
        description: `Your upload was rejected. Reason: ${trimmedReason}. Please upload a corrected version.`,
        targetFolderId: link.folderId,
        status: "open",
        createdByUserKey: poster,
        createdAt: now,
        updatedAt: now,
        sourceDocumentId: documentId,
        requestKind: "rejection",
        documentCategory: link.documentCategory,
      });
      portalRequestsCreated += 1;
    }

    return {
      ok: true as const,
      reviewStatus: "rejected" as const,
      rejectionReason: trimmedReason,
      portalRequestsCreated,
    };
  },
});

export const bulkRemovePipelineLinks = mutation({
  args: {
    pipelineFileId: v.id("pipeline"),
    documentIds: v.array(v.id("libraryDocuments")),
    ...memberKeyArg,
  },
  handler: async (ctx, { pipelineFileId, documentIds, memberUserKey }) => {
    const pipeline = await ctx.db.get(pipelineFileId);
    if (!pipeline) throw new Error("Pipeline file not found.");
    await assertCanMutatePipelineRow(ctx, pipeline, memberUserKey);

    const proof = { kind: "pipeline" as const, pipelineFileId };
    let removed = 0;
    const failures: string[] = [];

    for (const documentId of documentIds) {
      try {
        await assertProofWrite(ctx, proof, memberUserKey);
        const links = await ctx.db
          .query("libraryDocumentLinks")
          .withIndex("by_document", (q) => q.eq("documentId", documentId))
          .collect();
        const hit = links.find((l) => l.pipelineFileId === pipelineFileId);
        if (!hit) throw new Error("Link not found.");
        await ctx.db.delete(hit._id);
        await purgeLibraryDocumentIfOrphaned(ctx, documentId);
        removed += 1;
      } catch (e) {
        failures.push(
          e instanceof Error ? e.message : `Failed to remove ${documentId}`,
        );
      }
    }

    if (removed === 0 && failures.length > 0) {
      throw new Error(failures[0] ?? "No documents removed.");
    }
    return { ok: true as const, removed, failures };
  },
});

export const listHub = query({
  args: {
    organizationId: v.id("organizations"),
    limit: v.optional(v.number()),
    ...memberKeyArg,
  },
  handler: async (ctx, { organizationId, limit, memberUserKey }) => {
    const cap = Math.min(200, Math.max(1, limit ?? 60));
    await assertOrgScopeArgs(ctx, organizationId, memberUserKey);
    await assertOrgPermission(ctx, organizationId, memberUserKey, "files.view");
    const rows = await ctx.db
      .query("libraryDocuments")
      .withIndex("by_organization_updatedAt", (q) =>
        q.eq("organizationId", organizationId),
      )
      .order("desc")
      .take(cap);
    return rows.map((d) => ({
      _id: d._id,
      title: d.title,
      latestVersionNumber: d.latestVersionNumber,
      latestVersionId: d.latestVersionId,
      latestFileName: d.latestFileName,
      latestUploadedAt: d.latestUploadedAt,
      updatedAt: d.updatedAt,
    }));
  },
});

export const listLinksForDocument = query({
  args: { documentId: v.id("libraryDocuments"), ...memberKeyArg },
  handler: async (ctx, { documentId, memberUserKey }) => {
    await assertCanReadLibraryDocument(ctx, documentId, memberUserKey);
    const links = await ctx.db
      .query("libraryDocumentLinks")
      .withIndex("by_document", (q) => q.eq("documentId", documentId))
      .collect();
    return links.map((l) => ({
      _id: l._id,
      pipelineFileId: l.pipelineFileId,
      contactId: l.contactId,
      taskId: l.taskId,
      linkedAt: l.linkedAt,
    }));
  },
});
