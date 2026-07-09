import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { deleteSignatureEnvelopesForDocument } from "./signatureCleanup";

/**
 * After removing the last link row, delete the document and all version blobs.
 */
export async function purgeLibraryDocumentIfOrphaned(
  ctx: MutationCtx,
  documentId: Id<"libraryDocuments">,
): Promise<void> {
  const remaining = await ctx.db
    .query("libraryDocumentLinks")
    .withIndex("by_document", (q) => q.eq("documentId", documentId))
    .collect();
  if (remaining.length > 0) return;

  await deleteSignatureEnvelopesForDocument(ctx, documentId);

  const versions = await ctx.db
    .query("libraryDocumentVersions")
    .withIndex("by_document_version", (q) => q.eq("documentId", documentId))
    .collect();
  for (const v of versions) {
    try {
      await ctx.storage.delete(v.storageId);
    } catch {
      /* blob may already be gone */
    }
    await ctx.db.delete(v._id);
  }
  await ctx.db.delete(documentId);
}

export async function removeAllLibraryLinksForPipelineFile(
  ctx: MutationCtx,
  fileId: Id<"pipeline">,
): Promise<void> {
  const links = await ctx.db
    .query("libraryDocumentLinks")
    .withIndex("by_pipeline_linkedAt", (q) =>
      q.eq("pipelineFileId", fileId),
    )
    .collect();
  for (const l of links) {
    const docId = l.documentId;
    await ctx.db.delete(l._id);
    await purgeLibraryDocumentIfOrphaned(ctx, docId);
  }
}

export async function removeAllLibraryLinksForContact(
  ctx: MutationCtx,
  contactId: Id<"contacts">,
): Promise<void> {
  const links = await ctx.db
    .query("libraryDocumentLinks")
    .withIndex("by_contact_linkedAt", (q) => q.eq("contactId", contactId))
    .collect();
  for (const l of links) {
    const docId = l.documentId;
    await ctx.db.delete(l._id);
    await purgeLibraryDocumentIfOrphaned(ctx, docId);
  }
}

export async function removeAllLibraryLinksForTasks(
  ctx: MutationCtx,
  taskIds: Id<"tasks">[],
): Promise<void> {
  for (const taskId of taskIds) {
    const links = await ctx.db
      .query("libraryDocumentLinks")
      .withIndex("by_task_linkedAt", (q) => q.eq("taskId", taskId))
      .collect();
    for (const l of links) {
      const docId = l.documentId;
      await ctx.db.delete(l._id);
      await purgeLibraryDocumentIfOrphaned(ctx, docId);
    }
  }
}
