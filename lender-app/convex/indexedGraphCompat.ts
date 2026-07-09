/**
 * Phase 15 Step 2 — dual-read graph compatibility resolvers.
 * ACL: canonical file visibility only; edges never grant access.
 */
import type { Doc, Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { filterPipelineRowsForMember } from "./resourceAccess";
import { loadPipelineFilesForClientExpanded } from "./pipelineMultiClientLinks";

export type GraphFileRef = {
  fileId: string;
  sortOrder: number;
  relationshipType: string;
  source: "junction" | "legacy_fk" | "legacy_array" | "legacy_scalar";
};

type FileCandidate = {
  fileId: Id<"pipeline">;
  sortOrder: number;
  relationshipType: string;
  source: GraphFileRef["source"];
};

function mergeCandidates(candidates: FileCandidate[]): FileCandidate[] {
  const byId = new Map<string, FileCandidate>();
  for (const c of candidates) {
    const key = String(c.fileId);
    const existing = byId.get(key);
    if (!existing || c.sortOrder < existing.sortOrder) {
      byId.set(key, c);
    }
  }
  return [...byId.values()].sort((a, b) => {
    if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
    return String(a.fileId).localeCompare(String(b.fileId));
  });
}

async function aclFilterFiles(
  ctx: QueryCtx,
  organizationId: Id<"organizations">,
  memberUserKey: string | undefined,
  candidates: FileCandidate[],
): Promise<GraphFileRef[]> {
  if (candidates.length === 0) return [];
  const rows = await Promise.all(
    candidates.map((c) => ctx.db.get(c.fileId)),
  );
  const docs = rows.filter((d): d is Doc<"pipeline"> => d != null);
  const visible = await filterPipelineRowsForMember(
    ctx,
    docs,
    organizationId,
    memberUserKey,
  );
  const visibleIds = new Set(visible.map((f) => String(f._id)));
  return candidates
    .filter((c) => visibleIds.has(String(c.fileId)))
    .map((c) => ({
      fileId: String(c.fileId),
      sortOrder: c.sortOrder,
      relationshipType: c.relationshipType,
      source: c.source,
    }));
}

export async function resolveFilesForClient(
  ctx: QueryCtx,
  args: {
    organizationId: Id<"organizations">;
    clientId: Id<"clients">;
    memberUserKey?: string;
  },
): Promise<GraphFileRef[]> {
  const candidates: FileCandidate[] = [];

  const legacyFiles = await loadPipelineFilesForClientExpanded(ctx, args.clientId);
  for (const f of legacyFiles) {
    if (f.organizationId !== args.organizationId) continue;
    const isPrimaryFk =
      f.clientId != null && String(f.clientId) === String(args.clientId);
    candidates.push({
      fileId: f._id,
      sortOrder: isPrimaryFk ? 0 : 50,
      relationshipType: isPrimaryFk ? "primary" : "linked",
      source: "legacy_fk",
    });
  }

  const loanLinks = await ctx.db
    .query("loanClients")
    .withIndex("by_client", (q) => q.eq("clientId", args.clientId))
    .collect();
  for (const link of loanLinks) {
    if (String(link.organizationId) !== String(args.organizationId)) continue;
    candidates.push({
      fileId: link.pipelineId,
      sortOrder: link.sortOrder,
      relationshipType: link.relationshipType,
      source: "junction",
    });
  }

  const fileLinks = await ctx.db
    .query("fileClients")
    .withIndex("by_entity", (q) => q.eq("clientId", args.clientId))
    .collect();
  for (const link of fileLinks) {
    if (String(link.organizationId) !== String(args.organizationId)) continue;
    candidates.push({
      fileId: link.fileId,
      sortOrder: link.sortOrder,
      relationshipType: link.relationshipType,
      source: "junction",
    });
  }

  return aclFilterFiles(
    ctx,
    args.organizationId,
    args.memberUserKey,
    mergeCandidates(candidates),
  );
}

export async function resolveFilesForProject(
  ctx: QueryCtx,
  args: {
    organizationId: Id<"organizations">;
    projectId: Id<"projects">;
    memberUserKey?: string;
  },
): Promise<GraphFileRef[]> {
  const candidates: FileCandidate[] = [];

  const byFk = await ctx.db
    .query("pipeline")
    .withIndex("by_projectId", (q) => q.eq("projectId", args.projectId))
    .collect();
  for (const f of byFk) {
    if (f.organizationId !== args.organizationId) continue;
    candidates.push({
      fileId: f._id,
      sortOrder: 0,
      relationshipType: "primary",
      source: "legacy_fk",
    });
  }

  const fileLinks = await ctx.db
    .query("fileProjects")
    .withIndex("by_entity", (q) => q.eq("projectId", args.projectId))
    .collect();
  for (const link of fileLinks) {
    if (String(link.organizationId) !== String(args.organizationId)) continue;
    candidates.push({
      fileId: link.fileId,
      sortOrder: link.sortOrder,
      relationshipType: link.relationshipType,
      source: "junction",
    });
  }

  return aclFilterFiles(
    ctx,
    args.organizationId,
    args.memberUserKey,
    mergeCandidates(candidates),
  );
}

export async function resolveFilesForLender(
  ctx: QueryCtx,
  args: {
    organizationId: Id<"organizations">;
    lenderId: Id<"lenders">;
    memberUserKey?: string;
  },
): Promise<GraphFileRef[]> {
  const candidates: FileCandidate[] = [];

  const orgFiles = await ctx.db
    .query("pipeline")
    .withIndex("by_organization_createdAt", (q) =>
      q.eq("organizationId", args.organizationId),
    )
    .collect();

  for (const f of orgFiles) {
    const lenders = f.lenders ?? [];
    const idx = lenders.findIndex((lid) => String(lid) === String(args.lenderId));
    if (idx >= 0) {
      const rel =
        f.selectedLenderId != null &&
        String(f.selectedLenderId) === String(args.lenderId)
          ? "selected"
          : "quoted";
      candidates.push({
        fileId: f._id,
        sortOrder: idx,
        relationshipType: rel,
        source: "legacy_array",
      });
    }
  }

  const fileLinks = await ctx.db
    .query("fileLenders")
    .withIndex("by_entity", (q) => q.eq("lenderId", args.lenderId))
    .collect();
  for (const link of fileLinks) {
    if (String(link.organizationId) !== String(args.organizationId)) continue;
    candidates.push({
      fileId: link.fileId,
      sortOrder: link.sortOrder,
      relationshipType: link.relationshipType,
      source: "junction",
    });
  }

  const projectLinks = await ctx.db
    .query("projectLenders")
    .withIndex("by_entity", (q) => q.eq("lenderId", args.lenderId))
    .collect();
  for (const pl of projectLinks) {
    if (String(pl.organizationId) !== String(args.organizationId)) continue;
    const projectFiles = await ctx.db
      .query("pipeline")
      .withIndex("by_projectId", (q) => q.eq("projectId", pl.projectId))
      .collect();
    for (const f of projectFiles) {
      candidates.push({
        fileId: f._id,
        sortOrder: pl.sortOrder + 100,
        relationshipType: `project_${pl.relationshipType}`,
        source: "junction",
      });
    }
  }

  return aclFilterFiles(
    ctx,
    args.organizationId,
    args.memberUserKey,
    mergeCandidates(candidates),
  );
}

export async function resolveFilesForReferralPartner(
  ctx: QueryCtx,
  args: {
    organizationId: Id<"organizations">;
    contactId: Id<"contacts">;
    memberUserKey?: string;
  },
): Promise<GraphFileRef[]> {
  const candidates: FileCandidate[] = [];

  const crmLinks = await ctx.db
    .query("contactFileLinks")
    .withIndex("by_contact", (q) => q.eq("contactId", args.contactId))
    .collect();
  for (const link of crmLinks) {
    const file = await ctx.db.get(link.fileId);
    if (!file || file.organizationId !== args.organizationId) continue;
    if (link.contactRoleId && link.contactRoleId !== "referral_partner") continue;
    candidates.push({
      fileId: link.fileId,
      sortOrder: 10,
      relationshipType: "referral",
      source: "junction",
    });
  }

  const fileLinks = await ctx.db
    .query("fileReferralPartners")
    .withIndex("by_entity", (q) => q.eq("contactId", args.contactId))
    .collect();
  for (const link of fileLinks) {
    if (String(link.organizationId) !== String(args.organizationId)) continue;
    candidates.push({
      fileId: link.fileId,
      sortOrder: link.sortOrder,
      relationshipType: link.relationshipType,
      source: "junction",
    });
  }

  return aclFilterFiles(
    ctx,
    args.organizationId,
    args.memberUserKey,
    mergeCandidates(candidates),
  );
}

export async function resolveFilesForTeamMember(
  ctx: QueryCtx,
  args: {
    organizationId: Id<"organizations">;
    userKey: string;
    memberUserKey?: string;
  },
): Promise<GraphFileRef[]> {
  const targetKey = args.userKey.trim();
  const candidates: FileCandidate[] = [];

  const orgFiles = await ctx.db
    .query("pipeline")
    .withIndex("by_organization_createdAt", (q) =>
      q.eq("organizationId", args.organizationId),
    )
    .collect();

  for (const f of orgFiles) {
    if (f.assigneeId?.trim() === targetKey) {
      candidates.push({
        fileId: f._id,
        sortOrder: 0,
        relationshipType: "assignee",
        source: "legacy_scalar",
      });
    }
    if ((f.sharedWithIds ?? []).some((id) => id.trim() === targetKey)) {
      candidates.push({
        fileId: f._id,
        sortOrder: 5,
        relationshipType: "shared",
        source: "legacy_scalar",
      });
    }
  }

  const legacyShares = await ctx.db
    .query("pipelineFileShares")
    .withIndex("by_userKey", (q) => q.eq("userKey", targetKey))
    .collect();
  for (const share of legacyShares) {
    const file = await ctx.db.get(share.fileId);
    if (!file || file.organizationId !== args.organizationId) continue;
    candidates.push({
      fileId: share.fileId,
      sortOrder: 8,
      relationshipType: share.access === "edit" ? "shared_edit" : "shared_view",
      source: "junction",
    });
  }

  const fileLinks = await ctx.db
    .query("fileTeamMembers")
    .withIndex("by_entity", (q) => q.eq("userKey", targetKey))
    .collect();
  for (const link of fileLinks) {
    if (String(link.organizationId) !== String(args.organizationId)) continue;
    candidates.push({
      fileId: link.fileId,
      sortOrder: link.sortOrder,
      relationshipType: link.relationshipType,
      source: "junction",
    });
  }

  return aclFilterFiles(
    ctx,
    args.organizationId,
    args.memberUserKey,
    mergeCandidates(candidates),
  );
}

export async function resolveFilesForTask(
  ctx: QueryCtx,
  args: {
    organizationId: Id<"organizations">;
    taskId: Id<"tasks">;
    memberUserKey?: string;
  },
): Promise<GraphFileRef[]> {
  const candidates: FileCandidate[] = [];

  const task = await ctx.db.get(args.taskId);
  if (task?.relatedFileId) {
    const file = await ctx.db.get(task.relatedFileId);
    if (file && file.organizationId === args.organizationId) {
      candidates.push({
        fileId: task.relatedFileId,
        sortOrder: 0,
        relationshipType: "related",
        source: "legacy_scalar",
      });
    }
  }

  const fileLinks = await ctx.db
    .query("fileTasks")
    .withIndex("by_entity", (q) => q.eq("taskId", args.taskId))
    .collect();
  for (const link of fileLinks) {
    if (String(link.organizationId) !== String(args.organizationId)) continue;
    candidates.push({
      fileId: link.fileId,
      sortOrder: link.sortOrder,
      relationshipType: link.relationshipType,
      source: "junction",
    });
  }

  return aclFilterFiles(
    ctx,
    args.organizationId,
    args.memberUserKey,
    mergeCandidates(candidates),
  );
}

/** Inverse: files linked to a task entity via fileTasks + relatedFileId. */
export async function resolveTasksForFile(
  ctx: QueryCtx,
  fileId: Id<"pipeline">,
): Promise<Id<"tasks">[]> {
  const ids = new Set<string>();
  const links = await ctx.db
    .query("fileTasks")
    .withIndex("by_file", (q) => q.eq("fileId", fileId))
    .collect();
  for (const l of links) ids.add(String(l.taskId));

  const scalarTasks = await ctx.db
    .query("tasks")
    .withIndex("by_relatedFile", (q) => q.eq("relatedFileId", fileId))
    .collect();
  for (const t of scalarTasks) ids.add(String(t._id));

  return [...ids].map((id) => id as Id<"tasks">);
}

/**
 * Verify projection returns unique canonical file ids (no duplicate projections).
 */
export function assertUniqueFileRefs(refs: GraphFileRef[]): boolean {
  const seen = new Set<string>();
  for (const r of refs) {
    if (seen.has(r.fileId)) return false;
    seen.add(r.fileId);
  }
  return true;
}
