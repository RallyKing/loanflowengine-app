import type { MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { refreshTaskGlobalSearchText } from "./globalSearchSync";
import { removeAllLibraryLinksForPipelineFile } from "./libraryDocumentsCleanup";
import { deleteIndexedGraphEdgesForFile, deleteResourceSharesForEntity } from "./hierarchyEntityCleanup";

/** Best-effort delete for optional satellite rows (empty / new files included). */
async function deletePipelineFileSatellites(
  ctx: MutationCtx,
  fileId: Id<"pipeline">,
  organizationId: Id<"organizations"> | undefined,
): Promise<void> {
  for (const message of await ctx.db
    .query("fileMessages")
    .withIndex("by_file_audience_root_created", (q) =>
      q.eq("pipelineFileId", fileId),
    )
    .collect()) {
    const attachments = await ctx.db
      .query("fileMessageAttachments")
      .withIndex("by_message", (q) => q.eq("messageId", message._id))
      .collect();
    for (const attachment of attachments) {
      try {
        await ctx.storage.delete(attachment.storageId);
      } catch {
        /* blob may already be gone */
      }
      await ctx.db.delete(attachment._id);
    }
    await ctx.db.delete(message._id);
  }

  if (organizationId) {
    for (const assignment of await ctx.db
      .query("entityAssignments")
      .withIndex("by_org_file", (q) =>
        q.eq("organizationId", organizationId).eq("pipelineFileId", fileId),
      )
      .collect()) {
      await ctx.db.delete(assignment._id);
    }

    for (const thread of await ctx.db
      .query("collaborationThreads")
      .withIndex("by_org_file", (q) =>
        q.eq("organizationId", organizationId).eq("pipelineFileId", fileId),
      )
      .collect()) {
      const comments = await ctx.db
        .query("collaborationComments")
        .withIndex("by_thread_created", (q) => q.eq("threadId", thread._id))
        .collect();
      for (const comment of comments) {
        await ctx.db.delete(comment._id);
      }
      await ctx.db.delete(thread._id);
    }

    for (const presence of await ctx.db
      .query("memberPresence")
      .withIndex("by_org_file", (q) =>
        q.eq("organizationId", organizationId).eq("pipelineFileId", fileId),
      )
      .collect()) {
      await ctx.db.delete(presence._id);
    }

    for (const thread of await ctx.db
      .query("communicationThreads")
      .withIndex("by_org_file", (q) =>
        q
          .eq("organizationId", organizationId)
          .eq("relatedPipelineFileId", fileId),
      )
      .collect()) {
      await ctx.db.delete(thread._id);
    }

    // Indexed detach — never full-table-scan outboundMessages (read-limit bomb).
    for (const outbound of await ctx.db
      .query("outboundMessages")
      .withIndex("by_org_file", (q) =>
        q
          .eq("organizationId", organizationId)
          .eq("relatedPipelineFileId", fileId),
      )
      .collect()) {
      await ctx.db.patch(outbound._id, { relatedPipelineFileId: undefined });
    }
  }

  for (const audit of await ctx.db
    .query("clientPortalAudit")
    .withIndex("by_file_at", (q) => q.eq("pipelineFileId", fileId))
    .collect()) {
    await ctx.db.patch(audit._id, { pipelineFileId: undefined });
  }
}

/**
 * Document Vault + portal-link rows scoped to a pipeline file.
 * Uses by_pipeline / by_file indexes only (no org-wide table scans).
 */
async function deletePipelineDocumentVaultGraph(
  ctx: MutationCtx,
  fileId: Id<"pipeline">,
): Promise<void> {
  const fileTasks = await ctx.db
    .query("documentVaultFileTasks")
    .withIndex("by_pipeline_sort", (q) => q.eq("pipelineFileId", fileId))
    .collect();

  for (const task of fileTasks) {
    const uploadTokens = await ctx.db
      .query("documentVaultFileTaskUploadTokens")
      .withIndex("by_fileTask", (q) => q.eq("fileTaskId", task._id))
      .collect();
    for (const tok of uploadTokens) {
      await ctx.db.delete(tok._id);
    }
  }

  for (const folder of await ctx.db
    .query("documentFolders")
    .withIndex("by_pipeline", (q) => q.eq("pipelineFileId", fileId))
    .collect()) {
    await ctx.db.delete(folder._id);
  }

  for (const task of fileTasks) {
    await ctx.db.delete(task._id);
  }

  for (const token of await ctx.db
    .query("documentVaultClientBundleTokens")
    .withIndex("by_pipeline", (q) => q.eq("pipelineFileId", fileId))
    .collect()) {
    await ctx.db.delete(token._id);
  }

  for (const link of await ctx.db
    .query("clientPortalLinks")
    .withIndex("by_pipeline_created", (q) => q.eq("pipelineFileId", fileId))
    .collect()) {
    await ctx.db.delete(link._id);
  }

  for (const snap of await ctx.db
    .query("pipelineBlockSnapshots")
    .withIndex("by_pipeline_block", (q) => q.eq("pipelineFileId", fileId))
    .collect()) {
    await ctx.db.delete(snap._id);
  }

  for (const note of await ctx.db
    .query("pipelineFileNotes")
    .withIndex("by_file", (q) => q.eq("pipelineFileId", fileId))
    .collect()) {
    for (const link of await ctx.db
      .query("pipelineFileNoteLinks")
      .withIndex("by_note", (q) => q.eq("noteId", note._id))
      .collect()) {
      await ctx.db.delete(link._id);
    }
    await ctx.db.delete(note._id);
  }

  for (const line of await ctx.db
    .query("constructionBudgetLines")
    .withIndex("by_file", (q) => q.eq("fileId", fileId))
    .collect()) {
    await ctx.db.delete(line._id);
  }

  for (const sheet of await ctx.db
    .query("constructionBudgetSheets")
    .withIndex("by_file", (q) => q.eq("fileId", fileId))
    .collect()) {
    await ctx.db.delete(sheet._id);
  }

  for (const run of await ctx.db
    .query("dueDiligenceRuns")
    .withIndex("by_pipeline_created", (q) => q.eq("pipelineFileId", fileId))
    .collect()) {
    await ctx.db.delete(run._id);
  }
}

/**
 * Remove satellite rows that reference a pipeline file, then delete the file.
 * Ledger (`ledger` / `payments`) is intentionally left in place as historical
 * records that may reference `fileId` without a live pipeline row.
 */
export async function deletePipelineGraph(
  ctx: MutationCtx,
  fileId: Id<"pipeline">,
): Promise<void> {
  const row = await ctx.db.get(fileId);
  if (!row) return;

  await deletePipelineFileSatellites(ctx, fileId, row.organizationId);

  for (const l of await ctx.db
    .query("contactFileLinks")
    .withIndex("by_file", (q) => q.eq("fileId", fileId))
    .collect()) {
    await ctx.db.delete(l._id);
  }

  for (const s of await ctx.db
    .query("pipelineFileShares")
    .withIndex("by_file", (q) => q.eq("fileId", fileId))
    .collect()) {
    await ctx.db.delete(s._id);
  }

  for (const a of await ctx.db
    .query("pipelineFileActivity")
    .withIndex("by_file_at", (q) => q.eq("fileId", fileId))
    .collect()) {
    await ctx.db.delete(a._id);
  }

  const sheetId = row.intakeSheetId;
  if (sheetId) {
    const linkedFiles = await ctx.db
      .query("pipeline")
      .withIndex("by_intakeSheetId", (q) => q.eq("intakeSheetId", sheetId))
      .collect();
    const soleOwner =
      linkedFiles.length === 1 && linkedFiles[0]!._id === fileId;
    if (soleOwner) {
      for (const link of await ctx.db
        .query("shareLinks")
        .withIndex("by_intake", (q) => q.eq("intakeId", sheetId))
        .collect()) {
        await ctx.db.delete(link._id);
      }
      const sheet = await ctx.db.get(sheetId);
      if (sheet) {
        await ctx.db.delete(sheetId);
      }
    }
  }

  for (const t of await ctx.db
    .query("tasks")
    .withIndex("by_relatedFile", (q) => q.eq("relatedFileId", fileId))
    .collect()) {
    await ctx.db.patch(t._id, { relatedFileId: undefined });
    try {
      await refreshTaskGlobalSearchText(ctx, t._id);
    } catch {
      /* task may have been removed concurrently */
    }
  }

  for (const n of await ctx.db
    .query("userNotifications")
    .withIndex("by_file", (q) => q.eq("fileId", fileId))
    .collect()) {
    await ctx.db.patch(n._id, { fileId: undefined });
  }

  for (const a of await ctx.db
    .query("contactActivity")
    .withIndex("by_relatedFile", (q) => q.eq("relatedFileId", fileId))
    .collect()) {
    await ctx.db.patch(a._id, { relatedFileId: undefined });
  }

  for (const f of await ctx.db
    .query("activityFeed")
    .withIndex("by_file", (q) => q.eq("fileId", fileId))
    .collect()) {
    await ctx.db.delete(f._id);
  }

  const portalGrants = await ctx.db
    .query("clientPortalGrants")
    .withIndex("by_file", (q) => q.eq("pipelineFileId", fileId))
    .collect();

  for (const g of portalGrants) {
    for (const u of await ctx.db
      .query("clientPortalUploads")
      .withIndex("by_grant", (q) => q.eq("grantId", g._id))
      .collect()) {
      try {
        await ctx.storage.delete(u.storageId);
      } catch {
        /* best-effort */
      }
      await ctx.db.delete(u._id);
    }
    for (const r of await ctx.db
      .query("clientPortalRequests")
      .withIndex("by_grant", (q) => q.eq("grantId", g._id))
      .collect()) {
      await ctx.db.delete(r._id);
    }
    for (const u of await ctx.db
      .query("clientPortalUpdates")
      .withIndex("by_grant_at", (q) => q.eq("grantId", g._id))
      .collect()) {
      await ctx.db.delete(u._id);
    }
    await ctx.db.delete(g._id);
  }
  // Intentionally skip full-table scans of clientPortalMagicLinks / sessions.
  // Dead grant IDs in those rows are ignored at runtime; sessions expire.

  await removeAllLibraryLinksForPipelineFile(ctx, fileId);
  await deletePipelineDocumentVaultGraph(ctx, fileId);

  await deleteIndexedGraphEdgesForFile(ctx, fileId);
  await deleteResourceSharesForEntity(ctx, "pipeline", String(fileId));

  await ctx.db.delete(fileId);
}

/**
 * Strip all references to a lender before the `lenders` row is deleted.
 * Attachments are removed separately via `deleteAllForLender`.
 */
export async function purgeLenderRelationsBeforeDelete(
  ctx: MutationCtx,
  lenderId: Id<"lenders">,
): Promise<void> {
  const now = Date.now();

  for (const l of await ctx.db
    .query("contactLenderLinks")
    .withIndex("by_lender", (q) => q.eq("lenderId", lenderId))
    .collect()) {
    await ctx.db.delete(l._id);
  }

  for (const p of await ctx.db.query("pipeline").collect()) {
    const usesList = p.lenders.includes(lenderId);
    const usesSelected = p.selectedLenderId === lenderId;
    if (!usesList && !usesSelected) continue;

    const nextLenders = p.lenders.filter((x) => x !== lenderId);
    let nextSelected = p.selectedLenderId;
    if (nextSelected === lenderId) {
      nextSelected = undefined;
    }
    if (nextSelected && !nextLenders.includes(nextSelected)) {
      nextSelected = undefined;
    }

    await ctx.db.patch(p._id, {
      lenders: nextLenders,
      selectedLenderId: nextSelected,
      selectedLenderSentAt: nextSelected ? p.selectedLenderSentAt : undefined,
      updatedAt: now,
      createdAt: p.createdAt,
    });
  }

  for (const a of await ctx.db
    .query("contactActivity")
    .withIndex("by_relatedLender", (q) => q.eq("relatedLenderId", lenderId))
    .collect()) {
    await ctx.db.patch(a._id, { relatedLenderId: undefined });
  }

  for (const a of await ctx.db
    .query("pipelineFileActivity")
    .withIndex("by_lender_at", (q) => q.eq("lenderId", lenderId))
    .collect()) {
    await ctx.db.patch(a._id, { lenderId: undefined });
  }

  for (const f of await ctx.db
    .query("activityFeed")
    .withIndex("by_lender", (q) => q.eq("lenderId", lenderId))
    .collect()) {
    await ctx.db.patch(f._id, { lenderId: undefined });
  }

  for (const c of await ctx.db
    .query("lenderCandidates")
    .filter((q) => q.eq(q.field("duplicateOfLenderId"), lenderId))
    .collect()) {
    await ctx.db.patch(c._id, {
      duplicateOfLenderId: undefined,
      updatedAt: now,
    });
  }
}

/**
 * When merging duplicate lenders, repoint FKs from `removeId` to `keepId`.
 * Call before deleting `removeId`. Attachments are handled by `reassignToLender`.
 */
export async function repointMergedLenderId(
  ctx: MutationCtx,
  removeId: Id<"lenders">,
  keepId: Id<"lenders">,
): Promise<void> {
  if (removeId === keepId) return;
  const now = Date.now();

  const links = await ctx.db
    .query("contactLenderLinks")
    .withIndex("by_lender", (q) => q.eq("lenderId", removeId))
    .collect();
  for (const link of links) {
    const existing = await ctx.db
      .query("contactLenderLinks")
      .withIndex("by_contact_lender", (q) =>
        q.eq("contactId", link.contactId).eq("lenderId", keepId),
      )
      .first();
    if (existing) {
      await ctx.db.delete(link._id);
    } else {
      await ctx.db.patch(link._id, { lenderId: keepId, updatedAt: now });
    }
  }

  for (const p of await ctx.db.query("pipeline").collect()) {
    if (!p.lenders.includes(removeId) && p.selectedLenderId !== removeId) {
      continue;
    }

    const seen = new Set<string>();
    const lenders: Id<"lenders">[] = [];
    for (const id of p.lenders) {
      const mapped = id === removeId ? keepId : id;
      const key = mapped as string;
      if (seen.has(key)) continue;
      seen.add(key);
      lenders.push(mapped);
    }

    let selectedLenderId = p.selectedLenderId;
    if (selectedLenderId === removeId) {
      selectedLenderId = keepId;
    }
    if (selectedLenderId && !lenders.includes(selectedLenderId)) {
      selectedLenderId = lenders[0] ?? undefined;
    }

    const selectionChanged = p.selectedLenderId !== selectedLenderId;
    let selectedLenderSentAt = p.selectedLenderSentAt;
    if (selectionChanged) {
      if (p.selectedLenderId === removeId && selectedLenderId === keepId) {
        selectedLenderSentAt = p.selectedLenderSentAt;
      } else {
        selectedLenderSentAt = undefined;
      }
    }
    if (!selectedLenderId) {
      selectedLenderSentAt = undefined;
    }

    await ctx.db.patch(p._id, {
      lenders,
      selectedLenderId,
      selectedLenderSentAt,
      updatedAt: now,
      createdAt: p.createdAt,
    });
  }

  for (const a of await ctx.db
    .query("contactActivity")
    .withIndex("by_relatedLender", (q) => q.eq("relatedLenderId", removeId))
    .collect()) {
    await ctx.db.patch(a._id, { relatedLenderId: keepId });
  }

  for (const a of await ctx.db
    .query("pipelineFileActivity")
    .withIndex("by_lender_at", (q) => q.eq("lenderId", removeId))
    .collect()) {
    await ctx.db.patch(a._id, { lenderId: keepId });
  }

  for (const f of await ctx.db
    .query("activityFeed")
    .withIndex("by_lender", (q) => q.eq("lenderId", removeId))
    .collect()) {
    await ctx.db.patch(f._id, { lenderId: keepId });
  }

  for (const c of await ctx.db
    .query("lenderCandidates")
    .filter((q) => q.eq(q.field("duplicateOfLenderId"), removeId))
    .collect()) {
    await ctx.db.patch(c._id, { duplicateOfLenderId: keepId, updatedAt: now });
  }
}
