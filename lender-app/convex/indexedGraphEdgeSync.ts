/**
 * Phase 15 Step 5 — keep indexed graph edges in sync with legacy junction mutations.
 * Edges never grant ACL; dual-write only.
 */
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { ClientRelationshipType } from "../lib/pipelineClientRelationships";
import { isReferralPartnerFileAssociation } from "../lib/contact/contactRoles";

const SYNC_ACTOR = "__graph_edge_sync__";

export async function findFileClientEdge(
  ctx: QueryCtx | MutationCtx,
  fileId: Id<"pipeline">,
  clientId: Id<"clients">,
): Promise<Doc<"fileClients"> | null> {
  return (
    (await ctx.db
      .query("fileClients")
      .withIndex("by_file_entity", (q) =>
        q.eq("fileId", fileId).eq("clientId", clientId),
      )
      .first()) ?? null
  );
}

export async function findFileProjectEdge(
  ctx: QueryCtx | MutationCtx,
  fileId: Id<"pipeline">,
  projectId: Id<"projects">,
): Promise<Doc<"fileProjects"> | null> {
  return (
    (await ctx.db
      .query("fileProjects")
      .withIndex("by_file_entity", (q) =>
        q.eq("fileId", fileId).eq("projectId", projectId),
      )
      .first()) ?? null
  );
}

export async function upsertFileClientEdge(
  ctx: MutationCtx,
  args: {
    organizationId: Id<"organizations">;
    fileId: Id<"pipeline">;
    clientId: Id<"clients">;
    relationshipType: ClientRelationshipType;
    sortOrder: number;
    actor?: string;
  },
): Promise<"inserted" | "updated" | "unchanged"> {
  const existing = await findFileClientEdge(ctx, args.fileId, args.clientId);
  const now = Date.now();
  const actor = args.actor ?? SYNC_ACTOR;
  if (existing) {
    if (
      existing.relationshipType === args.relationshipType &&
      existing.sortOrder === args.sortOrder
    ) {
      return "unchanged";
    }
    await ctx.db.patch(existing._id, {
      relationshipType: args.relationshipType,
      sortOrder: args.sortOrder,
      updatedAt: now,
    });
    return "updated";
  }
  await ctx.db.insert("fileClients", {
    organizationId: args.organizationId,
    fileId: args.fileId,
    clientId: args.clientId,
    relationshipType: args.relationshipType,
    sortOrder: args.sortOrder,
    createdBy: actor,
    createdAt: now,
    updatedAt: now,
  });
  return "inserted";
}

export async function removeFileClientEdge(
  ctx: MutationCtx,
  fileId: Id<"pipeline">,
  clientId: Id<"clients">,
): Promise<boolean> {
  const edge = await findFileClientEdge(ctx, fileId, clientId);
  if (!edge) return false;
  await ctx.db.delete(edge._id);
  return true;
}

export async function syncPrimaryFileClientEdge(
  ctx: MutationCtx,
  row: Doc<"pipeline">,
): Promise<void> {
  if (!row.clientId || !row.organizationId) return;
  await upsertFileClientEdge(ctx, {
    organizationId: row.organizationId,
    fileId: row._id,
    clientId: row.clientId,
    relationshipType: "primary",
    sortOrder: 0,
  });
}

/**
 * Phase 15 Step 8 — strict single-primary enforcement for file client edges.
 *
 * Guarantees:
 * - Exactly one primary edge for the FK primary (`pipeline.clientId`)
 * - Previous FK primary is removed (not demoted) when a file is reassigned
 * - Any other stray primaries are demoted to `coborrower`
 */
export async function enforceSinglePrimaryLoanFileClient(
  ctx: MutationCtx,
  row: Doc<"pipeline">,
  opts?: { previousPrimaryClientId?: Id<"clients">; actor?: string },
): Promise<void> {
  if (!row.organizationId || !row.clientId) return;
  const now = Date.now();
  const actor = opts?.actor ?? SYNC_ACTOR;
  const primaryId = row.clientId;
  const prev = opts?.previousPrimaryClientId;

  if (prev && String(prev) !== String(primaryId)) {
    const prevLoan = await ctx.db
      .query("loanClients")
      .withIndex("by_pipeline_client", (q) =>
        q.eq("pipelineId", row._id).eq("clientId", prev),
      )
      .first();
    if (prevLoan && prevLoan.relationshipType === "primary") {
      await ctx.db.delete(prevLoan._id);
    }
    const prevEdge = await findFileClientEdge(ctx, row._id, prev);
    if (prevEdge && prevEdge.relationshipType === "primary") {
      await ctx.db.delete(prevEdge._id);
    }
  }

  const loanLinks = await ctx.db
    .query("loanClients")
    .withIndex("by_pipeline", (q) => q.eq("pipelineId", row._id))
    .collect();
  for (const link of loanLinks) {
    if (String(link.clientId) === String(primaryId)) continue;
    if (link.relationshipType !== "primary") continue;
    await ctx.db.patch(link._id, {
      relationshipType: "coborrower",
      updatedAt: now,
    });
  }

  const fileEdges = await ctx.db
    .query("fileClients")
    .withIndex("by_file", (q) => q.eq("fileId", row._id))
    .collect();
  for (const edge of fileEdges) {
    if (String(edge.clientId) === String(primaryId)) continue;
    if (edge.relationshipType !== "primary") continue;
    await ctx.db.patch(edge._id, {
      relationshipType: "coborrower",
      updatedAt: now,
    });
  }

  // Ensure FK primary exists everywhere as the sole primary.
  await syncPrimaryFileClientEdge(ctx, row);
  const existingPrimaryLoan = await ctx.db
    .query("loanClients")
    .withIndex("by_pipeline_client", (q) =>
      q.eq("pipelineId", row._id).eq("clientId", primaryId),
    )
    .first();
  if (existingPrimaryLoan) {
    if (
      existingPrimaryLoan.relationshipType !== "primary" ||
      existingPrimaryLoan.sortOrder !== 0
    ) {
      await ctx.db.patch(existingPrimaryLoan._id, {
        relationshipType: "primary",
        sortOrder: 0,
        updatedAt: now,
      });
    }
  } else {
    await ctx.db.insert("loanClients", {
      organizationId: row.organizationId,
      pipelineId: row._id,
      clientId: primaryId,
      relationshipType: "primary",
      sortOrder: 0,
      createdAt: now,
      updatedAt: now,
    });
  }
  await upsertFileClientEdge(ctx, {
    organizationId: row.organizationId,
    fileId: row._id,
    clientId: primaryId,
    relationshipType: "primary",
    sortOrder: 0,
    actor,
  });
}

export async function syncPrimaryFileProjectEdge(
  ctx: MutationCtx,
  row: Doc<"pipeline">,
): Promise<void> {
  if (!row.projectId || !row.organizationId) return;
  const existing = await findFileProjectEdge(ctx, row._id, row.projectId);
  const now = Date.now();
  if (existing) {
    if (existing.relationshipType !== "primary" || existing.sortOrder !== 0) {
      await ctx.db.patch(existing._id, {
        relationshipType: "primary",
        sortOrder: 0,
        updatedAt: now,
      });
    }
    return;
  }
  await ctx.db.insert("fileProjects", {
    organizationId: row.organizationId,
    fileId: row._id,
    projectId: row.projectId,
    relationshipType: "primary",
    sortOrder: 0,
    createdBy: SYNC_ACTOR,
    createdAt: now,
    updatedAt: now,
  });
}

export async function removeFileProjectEdge(
  ctx: MutationCtx,
  fileId: Id<"pipeline">,
  projectId: Id<"projects">,
): Promise<boolean> {
  const edge = await findFileProjectEdge(ctx, fileId, projectId);
  if (!edge) return false;
  await ctx.db.delete(edge._id);
  return true;
}

export async function resyncPrimaryFileProjectEdgeFromPipeline(
  ctx: MutationCtx,
  row: Doc<"pipeline">,
  opts?: { previousProjectId?: Id<"projects"> },
): Promise<void> {
  const prev = opts?.previousProjectId;
  if (prev && (!row.projectId || String(prev) !== String(row.projectId))) {
    await removeFileProjectEdge(ctx, row._id, prev);
  }
  const existing = await ctx.db
    .query("fileProjects")
    .withIndex("by_file", (q) => q.eq("fileId", row._id))
    .collect();
  for (const edge of existing) {
    if (!row.projectId || String(edge.projectId) !== String(row.projectId)) {
      await ctx.db.delete(edge._id);
    }
  }
  if (row.projectId && row.organizationId) {
    await syncPrimaryFileProjectEdge(ctx, row);
  }
}

/** Remove file-level client edge; never clears pipeline.clientId FK. */
export async function removeLoanFileClientLink(
  ctx: MutationCtx,
  row: Doc<"pipeline">,
  clientId: Id<"clients">,
  memberUserKey: string,
): Promise<{ removedLoan: boolean; removedFileEdge: boolean }> {
  if (row.clientId && String(clientId) === String(row.clientId)) {
    throw new Error("Cannot remove the primary loan client.");
  }

  const loanLink = await ctx.db
    .query("loanClients")
    .withIndex("by_pipeline_client", (q) =>
      q.eq("pipelineId", row._id).eq("clientId", clientId),
    )
    .first();

  let removedLoan = false;
  if (loanLink) {
    await ctx.db.delete(loanLink._id);
    removedLoan = true;
  }

  const removedFileEdge = await removeFileClientEdge(ctx, row._id, clientId);

  if (!removedLoan && !removedFileEdge) {
    throw new Error("Client link not found.");
  }

  void memberUserKey;
  return { removedLoan, removedFileEdge };
}

export async function addLoanFileClientLink(
  ctx: MutationCtx,
  args: {
    organizationId: Id<"organizations">;
    row: Doc<"pipeline">;
    clientId: Id<"clients">;
    relationshipType: ClientRelationshipType;
    sortOrder: number;
    memberUserKey: string;
  },
): Promise<void> {
  const { row, clientId, relationshipType, sortOrder, organizationId } = args;
  if (relationshipType === "primary") {
    throw new Error("Use promoteLoanClientToPrimary to set primary.");
  }

  const existingLoan = await ctx.db
    .query("loanClients")
    .withIndex("by_pipeline_client", (q) =>
      q.eq("pipelineId", row._id).eq("clientId", clientId),
    )
    .first();
  if (existingLoan) throw new Error("Client is already linked to this file.");

  const existingFile = await findFileClientEdge(ctx, row._id, clientId);
  if (existingFile) throw new Error("Client is already linked to this file.");

  const now = Date.now();
  await ctx.db.insert("loanClients", {
    organizationId,
    pipelineId: row._id,
    clientId,
    relationshipType,
    sortOrder,
    createdAt: now,
    updatedAt: now,
  });
  await upsertFileClientEdge(ctx, {
    organizationId,
    fileId: row._id,
    clientId,
    relationshipType,
    sortOrder,
    actor: args.memberUserKey,
  });
}

export async function updateLoanFileClientLink(
  ctx: MutationCtx,
  args: {
    row: Doc<"pipeline">;
    clientId: Id<"clients">;
    relationshipType: ClientRelationshipType;
  },
): Promise<void> {
  const loanLink = await ctx.db
    .query("loanClients")
    .withIndex("by_pipeline_client", (q) =>
      q.eq("pipelineId", args.row._id).eq("clientId", args.clientId),
    )
    .first();
  const fileEdge = await findFileClientEdge(ctx, args.row._id, args.clientId);
  const now = Date.now();

  if (loanLink) {
    await ctx.db.patch(loanLink._id, {
      relationshipType: args.relationshipType,
      updatedAt: now,
    });
  }
  if (fileEdge) {
    await ctx.db.patch(fileEdge._id, {
      relationshipType: args.relationshipType,
      updatedAt: now,
    });
  }
  if (!loanLink && !fileEdge) {
    throw new Error("Client link not found.");
  }
}

// ---------------------------------------------------------------------------
// Phase 15 Step 6 — lenders, referral partners, team members, tasks
// ---------------------------------------------------------------------------

type FileLenderRel = Doc<"fileLenders">["relationshipType"];
type FileReferralRel = Doc<"fileReferralPartners">["relationshipType"];
type FileTeamRel = Doc<"fileTeamMembers">["relationshipType"];
type FileTaskRel = Doc<"fileTasks">["relationshipType"];

function mapReferralLinkType(
  raw: string | undefined,
): FileReferralRel {
  if (raw === "referral") return "referral";
  if (raw === "introducer") return "introducer";
  if (raw === "broker") return "broker";
  return "other";
}

export function isReferralContactFileLink(args: {
  contact: Doc<"contacts">;
  contactRoleId?: string;
  /** @deprecated Phase 25 — legacy link field during migration */
  relationshipType?: string;
}): boolean {
  return isReferralPartnerFileAssociation({
    linkContactRoleId: args.contactRoleId,
    contact: args.contact,
  });
}

export async function findFileLenderEdge(
  ctx: QueryCtx | MutationCtx,
  fileId: Id<"pipeline">,
  lenderId: Id<"lenders">,
): Promise<Doc<"fileLenders"> | null> {
  return (
    (await ctx.db
      .query("fileLenders")
      .withIndex("by_file_entity", (q) =>
        q.eq("fileId", fileId).eq("lenderId", lenderId),
      )
      .first()) ?? null
  );
}

export async function upsertFileLenderEdge(
  ctx: MutationCtx,
  args: {
    organizationId: Id<"organizations">;
    fileId: Id<"pipeline">;
    lenderId: Id<"lenders">;
    relationshipType: FileLenderRel;
    sortOrder: number;
    actor?: string;
  },
): Promise<void> {
  const existing = await findFileLenderEdge(ctx, args.fileId, args.lenderId);
  const now = Date.now();
  if (existing) {
    const nextRel: FileLenderRel =
      existing.relationshipType === "declined" &&
      args.relationshipType !== "declined"
        ? "declined"
        : args.relationshipType;
    if (
      existing.relationshipType === nextRel &&
      existing.sortOrder === args.sortOrder
    ) {
      return;
    }
    await ctx.db.patch(existing._id, {
      relationshipType: nextRel,
      sortOrder: args.sortOrder,
      updatedAt: now,
    });
    return;
  }
  await ctx.db.insert("fileLenders", {
    organizationId: args.organizationId,
    fileId: args.fileId,
    lenderId: args.lenderId,
    relationshipType: args.relationshipType,
    sortOrder: args.sortOrder,
    createdBy: args.actor ?? SYNC_ACTOR,
    createdAt: now,
    updatedAt: now,
  });
}

export async function removeFileLenderEdge(
  ctx: MutationCtx,
  fileId: Id<"pipeline">,
  lenderId: Id<"lenders">,
): Promise<boolean> {
  const edge = await findFileLenderEdge(ctx, fileId, lenderId);
  if (!edge) return false;
  await ctx.db.delete(edge._id);
  return true;
}

/** Phase Modular-B — operator-assigned roles the pipeline sync must not reset. */
const MANUAL_FILE_LENDER_RELS: ReadonlySet<FileLenderRel> = new Set([
  "syndication_partner",
  "sub_lender",
  "partner_group",
]);

export async function syncFileLenderEdgesFromPipeline(
  ctx: MutationCtx,
  row: Doc<"pipeline">,
  actor?: string,
): Promise<void> {
  if (!row.organizationId) return;
  const lenders = row.lenders ?? [];
  const desired = new Set<string>();
  for (let i = 0; i < lenders.length; i++) {
    const lenderId = lenders[i]!;
    desired.add(String(lenderId));
    const existingEdge = await findFileLenderEdge(ctx, row._id, lenderId);
    const isSelected =
      row.selectedLenderId != null &&
      String(row.selectedLenderId) === String(lenderId);
    const rel: FileLenderRel =
      existingEdge?.relationshipType === "declined"
        ? "declined"
        : isSelected
          ? "selected"
          : existingEdge &&
              MANUAL_FILE_LENDER_RELS.has(existingEdge.relationshipType)
            ? existingEdge.relationshipType
            : "quoted";
    await upsertFileLenderEdge(ctx, {
      organizationId: row.organizationId,
      fileId: row._id,
      lenderId,
      relationshipType: rel,
      sortOrder: i,
      actor,
    });
  }
  const existing = await ctx.db
    .query("fileLenders")
    .withIndex("by_file", (q) => q.eq("fileId", row._id))
    .collect();
  for (const edge of existing) {
    if (!desired.has(String(edge.lenderId))) {
      await ctx.db.delete(edge._id);
    }
  }
}

export async function attachLenderToFile(
  ctx: MutationCtx,
  row: Doc<"pipeline">,
  lenderId: Id<"lenders">,
  actor?: string,
): Promise<{ attached: boolean }> {
  const inArray = row.lenders.some((x) => String(x) === String(lenderId));
  const edge = await findFileLenderEdge(ctx, row._id, lenderId);
  if (inArray && edge) return { attached: false };
  if (!row.organizationId) throw new Error("File organization required.");
  const lenders = inArray ? row.lenders : [...row.lenders, lenderId];
  if (!inArray) {
    await ctx.db.patch(row._id, {
      lenders,
      updatedAt: Date.now(),
    });
  }
  const refreshed = (await ctx.db.get(row._id))!;
  await syncFileLenderEdgesFromPipeline(ctx, refreshed, actor);
  return { attached: !inArray || !edge };
}

export async function detachLenderFromFile(
  ctx: MutationCtx,
  row: Doc<"pipeline">,
  lenderId: Id<"lenders">,
  actor?: string,
): Promise<{ removedArray: boolean; removedEdge: boolean }> {
  const inArray = row.lenders.some((x) => String(x) === String(lenderId));
  let removedArray = false;
  if (inArray) {
    const lenders = row.lenders.filter((x) => String(x) !== String(lenderId));
    const patchObj: Partial<Doc<"pipeline">> = {
      lenders,
      updatedAt: Date.now(),
    };
    if (
      row.selectedLenderId &&
      String(row.selectedLenderId) === String(lenderId)
    ) {
      patchObj.selectedLenderId = undefined;
      patchObj.selectedLenderSentAt = undefined;
    }
    await ctx.db.patch(row._id, patchObj);
    removedArray = true;
  }
  const removedEdge = await removeFileLenderEdge(ctx, row._id, lenderId);
  if (!removedArray && !removedEdge) {
    throw new Error("Lender link not found.");
  }
  if (removedArray) {
    const refreshed = (await ctx.db.get(row._id))!;
    await syncFileLenderEdgesFromPipeline(ctx, refreshed, actor);
  }
  void actor;
  return { removedArray, removedEdge };
}

export async function findFileReferralEdge(
  ctx: QueryCtx | MutationCtx,
  fileId: Id<"pipeline">,
  contactId: Id<"contacts">,
): Promise<Doc<"fileReferralPartners"> | null> {
  return (
    (await ctx.db
      .query("fileReferralPartners")
      .withIndex("by_file_entity", (q) =>
        q.eq("fileId", fileId).eq("contactId", contactId),
      )
      .first()) ?? null
  );
}

export async function upsertFileReferralEdge(
  ctx: MutationCtx,
  args: {
    organizationId: Id<"organizations">;
    fileId: Id<"pipeline">;
    contactId: Id<"contacts">;
    relationshipType: FileReferralRel;
    sortOrder: number;
    actor?: string;
  },
): Promise<void> {
  const existing = await findFileReferralEdge(ctx, args.fileId, args.contactId);
  const now = Date.now();
  if (existing) {
    await ctx.db.patch(existing._id, {
      relationshipType: args.relationshipType,
      sortOrder: args.sortOrder,
      updatedAt: now,
    });
    return;
  }
  await ctx.db.insert("fileReferralPartners", {
    organizationId: args.organizationId,
    fileId: args.fileId,
    contactId: args.contactId,
    relationshipType: args.relationshipType,
    sortOrder: args.sortOrder,
    createdBy: args.actor ?? SYNC_ACTOR,
    createdAt: now,
    updatedAt: now,
  });
}

export async function removeFileReferralEdge(
  ctx: MutationCtx,
  fileId: Id<"pipeline">,
  contactId: Id<"contacts">,
): Promise<boolean> {
  const edge = await findFileReferralEdge(ctx, fileId, contactId);
  if (!edge) return false;
  await ctx.db.delete(edge._id);
  return true;
}

export async function syncFileReferralEdgeFromContactLink(
  ctx: MutationCtx,
  args: {
    contact: Doc<"contacts">;
    file: Doc<"pipeline">;
    contactRoleId?: string;
    /** @deprecated Phase 25 — legacy link field during migration */
    relationshipType?: string;
    actor?: string;
  },
): Promise<void> {
  if (!args.file.organizationId) return;
  if (
    !isReferralContactFileLink({
      contact: args.contact,
      contactRoleId: args.contactRoleId,
      relationshipType: args.relationshipType,
    })
  ) {
    return;
  }
  await upsertFileReferralEdge(ctx, {
    organizationId: args.file.organizationId,
    fileId: args.file._id,
    contactId: args.contact._id,
    relationshipType: mapReferralLinkType(args.relationshipType),
    sortOrder: 10,
    actor: args.actor,
  });
}

export async function findFileTeamEdge(
  ctx: QueryCtx | MutationCtx,
  fileId: Id<"pipeline">,
  userKey: string,
): Promise<Doc<"fileTeamMembers"> | null> {
  const uk = userKey.trim();
  if (!uk) return null;
  return (
    (await ctx.db
      .query("fileTeamMembers")
      .withIndex("by_file_entity", (q) =>
        q.eq("fileId", fileId).eq("userKey", uk),
      )
      .first()) ?? null
  );
}

export async function upsertFileTeamEdge(
  ctx: MutationCtx,
  args: {
    organizationId: Id<"organizations">;
    fileId: Id<"pipeline">;
    userKey: string;
    relationshipType: FileTeamRel;
    sortOrder: number;
    actor?: string;
  },
): Promise<void> {
  const uk = args.userKey.trim();
  if (!uk) return;
  const existing = await findFileTeamEdge(ctx, args.fileId, uk);
  const now = Date.now();
  if (existing) {
    await ctx.db.patch(existing._id, {
      relationshipType: args.relationshipType,
      sortOrder: args.sortOrder,
      updatedAt: now,
    });
    return;
  }
  await ctx.db.insert("fileTeamMembers", {
    organizationId: args.organizationId,
    fileId: args.fileId,
    userKey: uk,
    relationshipType: args.relationshipType,
    sortOrder: args.sortOrder,
    createdBy: args.actor ?? SYNC_ACTOR,
    createdAt: now,
    updatedAt: now,
  });
}

export async function removeFileTeamEdge(
  ctx: MutationCtx,
  fileId: Id<"pipeline">,
  userKey: string,
): Promise<boolean> {
  const edge = await findFileTeamEdge(ctx, fileId, userKey);
  if (!edge) return false;
  await ctx.db.delete(edge._id);
  return true;
}

export async function resyncFileTeamEdgesFromPipeline(
  ctx: MutationCtx,
  row: Doc<"pipeline">,
  actor?: string,
): Promise<void> {
  if (!row.organizationId) return;
  const desired = new Map<string, { relationshipType: FileTeamRel; sortOrder: number }>();
  if (row.assigneeId?.trim()) {
    desired.set(row.assigneeId.trim(), {
      relationshipType: "assignee",
      sortOrder: 0,
    });
  }
  for (let i = 0; i < (row.sharedWithIds ?? []).length; i++) {
    const uk = (row.sharedWithIds ?? [])[i]!.trim();
    if (!uk || desired.has(uk)) continue;
    desired.set(uk, { relationshipType: "shared", sortOrder: 5 + i });
  }
  const shares = await ctx.db
    .query("resourceShares")
    .withIndex("by_resource", (q) =>
      q.eq("resourceType", "pipeline").eq("resourceId", String(row._id)),
    )
    .collect();
  for (const share of shares) {
    if (String(share.organizationId) !== String(row.organizationId)) continue;
    const uk = share.sharedUserId.trim();
    if (!uk || desired.has(uk)) continue;
    desired.set(uk, { relationshipType: "shared", sortOrder: 9 });
  }
  for (const [uk, spec] of desired) {
    await upsertFileTeamEdge(ctx, {
      organizationId: row.organizationId,
      fileId: row._id,
      userKey: uk,
      relationshipType: spec.relationshipType,
      sortOrder: spec.sortOrder,
      actor,
    });
  }
  const existing = await ctx.db
    .query("fileTeamMembers")
    .withIndex("by_file", (q) => q.eq("fileId", row._id))
    .collect();
  for (const edge of existing) {
    if (!desired.has(edge.userKey.trim())) {
      await ctx.db.delete(edge._id);
    }
  }
}

export async function findFileTaskEdge(
  ctx: QueryCtx | MutationCtx,
  fileId: Id<"pipeline">,
  taskId: Id<"tasks">,
): Promise<Doc<"fileTasks"> | null> {
  return (
    (await ctx.db
      .query("fileTasks")
      .withIndex("by_file_entity", (q) =>
        q.eq("fileId", fileId).eq("taskId", taskId),
      )
      .first()) ?? null
  );
}

export async function upsertFileTaskEdge(
  ctx: MutationCtx,
  args: {
    organizationId: Id<"organizations">;
    fileId: Id<"pipeline">;
    taskId: Id<"tasks">;
    relationshipType: FileTaskRel;
    sortOrder: number;
    actor?: string;
  },
): Promise<void> {
  const existing = await findFileTaskEdge(ctx, args.fileId, args.taskId);
  const now = Date.now();
  if (existing) {
    await ctx.db.patch(existing._id, {
      relationshipType: args.relationshipType,
      sortOrder: args.sortOrder,
      updatedAt: now,
    });
    return;
  }
  await ctx.db.insert("fileTasks", {
    organizationId: args.organizationId,
    fileId: args.fileId,
    taskId: args.taskId,
    relationshipType: args.relationshipType,
    sortOrder: args.sortOrder,
    createdBy: args.actor ?? SYNC_ACTOR,
    createdAt: now,
    updatedAt: now,
  });
}

export async function removeFileTaskEdge(
  ctx: MutationCtx,
  fileId: Id<"pipeline">,
  taskId: Id<"tasks">,
): Promise<boolean> {
  const edge = await findFileTaskEdge(ctx, fileId, taskId);
  if (!edge) return false;
  await ctx.db.delete(edge._id);
  return true;
}

export async function removeAllFileTaskEdgesForTask(
  ctx: MutationCtx,
  taskId: Id<"tasks">,
): Promise<number> {
  const edges = await ctx.db
    .query("fileTasks")
    .withIndex("by_entity", (q) => q.eq("taskId", taskId))
    .collect();
  for (const edge of edges) {
    await ctx.db.delete(edge._id);
  }
  return edges.length;
}

export async function syncFileTaskEdgeFromTask(
  ctx: MutationCtx,
  task: Doc<"tasks">,
  opts?: { previousFileId?: Id<"pipeline">; actor?: string },
): Promise<void> {
  const prev = opts?.previousFileId;
  const next = task.relatedFileId;
  if (prev && (!next || String(prev) !== String(next))) {
    await removeFileTaskEdge(ctx, prev, task._id);
  }
  if (!next || !task.organizationId) return;
  const file = await ctx.db.get(next);
  if (!file || file.organizationId !== task.organizationId) return;
  await upsertFileTaskEdge(ctx, {
    organizationId: task.organizationId,
    fileId: next,
    taskId: task._id,
    relationshipType: "related",
    sortOrder: 0,
    actor: opts?.actor,
  });
}
