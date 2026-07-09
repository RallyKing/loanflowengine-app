/**
 * Phase 15 Step 3 — indexed graph backfill execute + integrity scan.
 */
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import {
  computeClientStickinessKey,
  computeReferralPartnerStickinessKey,
  stickinessKeyString,
} from "../lib/indexedGraphStickiness";
import {
  primaryContactEmail,
  primaryContactPhone,
} from "../lib/contact/contactMethods";
import { analyzeIndexedGraphFoundation } from "./indexedGraphAnalyze";
import {
  assertUniqueFileRefs,
  resolveFilesForClient,
  resolveFilesForLender,
  resolveFilesForProject,
  resolveFilesForReferralPartner,
  resolveFilesForTask,
  resolveFilesForTeamMember,
} from "./indexedGraphCompat";
import { filterPipelineRowsForMember } from "./resourceAccess";
import { captureBackfillMatrix } from "./pipelineHierarchyBackfill";

const BACKFILL_ACTOR = "__indexed_graph_backfill__";
const JOSHUA_ORG_ID = "mx76bxqnc23q76cb99tvrffmy58644pf" as Id<"organizations">;
const JOSHUA_USER_ID = "ts719yfyv2b6020avvctpw0ns586exm6";
const EBALLARD_USER_ID = "ts7d3keadq48gay3pa8k6gdwx9878p33";

export type InsertCounts = Record<string, number>;

export type CollapseReport = {
  table: string;
  fileOrProjectId: string;
  removedEdgeIds: string[];
  keptEntityId: string;
  stickinessKey: string;
};

export type IntegrityScan = {
  orphanEdges: string[];
  duplicateNormalizedEdges: string[];
  filesMissingClientEdge: string[];
  filesMissingProjectEdge: string[];
  invalidTaskLinks: string[];
  pass: boolean;
};

export type VisibilitySnapshot = {
  visibleFileIds: string[];
  fileCount: number;
};

export type BackfillExecuteResult = {
  dryRun: boolean;
  aborted: boolean;
  abortReason: string | null;
  inserted: InsertCounts;
  skippedExisting: InsertCounts;
  ambiguitiesSkipped: string[];
  collapses: CollapseReport[];
  integrity: IntegrityScan;
  sharesBefore: Awaited<ReturnType<typeof countOrgResourceShares>>;
  sharesAfter: Awaited<ReturnType<typeof countOrgResourceShares>>;
  joshuaBefore: VisibilitySnapshot;
  joshuaAfter: VisibilitySnapshot;
  eballardBefore: VisibilitySnapshot;
  eballardAfter: VisibilitySnapshot;
  joshuaDrift: boolean;
  eballardDrift: boolean;
  sharesDrift: boolean;
};

async function countOrgResourceShares(
  ctx: QueryCtx | MutationCtx,
  organizationId: Id<"organizations">,
) {
  const rows = await ctx.db.query("resourceShares").collect();
  const orgScoped = rows.filter((r) => r.organizationId === organizationId);
  return {
    total: orgScoped.length,
    pipeline: orgScoped.filter((r) => r.resourceType === "pipeline").length,
    project: orgScoped.filter((r) => r.resourceType === "project").length,
    client: orgScoped.filter((r) => r.resourceType === "client").length,
    task: orgScoped.filter((r) => r.resourceType === "task").length,
  };
}

async function captureVisibility(
  ctx: QueryCtx | MutationCtx,
  organizationId: Id<"organizations">,
  memberUserKey: string,
): Promise<VisibilitySnapshot> {
  const files = await ctx.db
    .query("pipeline")
    .withIndex("by_organization_createdAt", (q) =>
      q.eq("organizationId", organizationId),
    )
    .collect();
  const visible = await filterPipelineRowsForMember(
    ctx,
    files,
    organizationId,
    memberUserKey,
  );
  return {
    visibleFileIds: visible.map((f) => String(f._id)).sort(),
    fileCount: visible.length,
  };
}

type AmbiguityCheck = {
  abort: boolean;
  reasons: string[];
};

async function detectStickinessAmbiguity(
  ctx: QueryCtx | MutationCtx,
  organizationId: Id<"organizations">,
): Promise<AmbiguityCheck> {
  const reasons: string[] = [];
  const clients = await ctx.db
    .query("clients")
    .withIndex("by_organization", (q) => q.eq("organizationId", organizationId))
    .collect();
  const clientByKey = new Map<string, string[]>();
  for (const c of clients) {
    const key = stickinessKeyString(
      computeClientStickinessKey({
        displayName: c.displayName,
        primaryContactEmail: c.primaryContactEmail,
        primaryContactPhone: c.primaryContactPhone,
      }),
    );
    if (key === "name:unknown") continue;
    const sk = key.startsWith("email:") || key.startsWith("phone:") ? key : null;
    if (!sk) continue;
    const list = clientByKey.get(sk) ?? [];
    list.push(String(c._id));
    clientByKey.set(sk, list);
  }
  for (const [key, ids] of clientByKey) {
    if (ids.length > 1) {
      reasons.push(`client_stickiness_collision:${key}:${ids.join(",")}`);
    }
  }

  const contacts = await ctx.db
    .query("contacts")
    .withIndex("by_organization_updatedAt", (q) =>
      q.eq("organizationId", organizationId),
    )
    .collect();
  const refByKey = new Map<string, string[]>();
  for (const c of contacts) {
    if (c.contactRoleId !== "referral_partner") continue;
    const key = stickinessKeyString(
      computeReferralPartnerStickinessKey({
        name: c.name,
        email: primaryContactEmail(c),
        phone: primaryContactPhone(c),
      }),
    );
    if (key === "name:unknown") continue;
    const sk = key.startsWith("email:") || key.startsWith("phone:") ? key : null;
    if (!sk) continue;
    const list = refByKey.get(sk) ?? [];
    list.push(String(c._id));
    refByKey.set(sk, list);
  }
  for (const [key, ids] of refByKey) {
    if (ids.length > 1) {
      reasons.push(`referral_stickiness_collision:${key}:${ids.join(",")}`);
    }
  }

  return { abort: reasons.length > 0, reasons };
}

function initCounts(): InsertCounts {
  return {
    fileClients: 0,
    fileProjects: 0,
    fileLenders: 0,
    fileReferralPartners: 0,
    fileTeamMembers: 0,
    fileTasks: 0,
    projectLenders: 0,
    projectReferralPartners: 0,
    projectTeamMembers: 0,
    projectTasks: 0,
  };
}

async function insertFileClient(
  ctx: MutationCtx,
  args: {
    organizationId: Id<"organizations">;
    fileId: Id<"pipeline">;
    clientId: Id<"clients">;
    relationshipType: Doc<"fileClients">["relationshipType"];
    sortOrder: number;
    dryRun: boolean;
    inserted: InsertCounts;
    skipped: InsertCounts;
  },
) {
  const existing = await ctx.db
    .query("fileClients")
    .withIndex("by_file_entity", (q) =>
      q.eq("fileId", args.fileId).eq("clientId", args.clientId),
    )
    .first();
  if (existing) {
    args.skipped.fileClients += 1;
    return;
  }
  if (args.dryRun) {
    args.inserted.fileClients += 1;
    return;
  }
  const now = Date.now();
  await ctx.db.insert("fileClients", {
    organizationId: args.organizationId,
    fileId: args.fileId,
    clientId: args.clientId,
    relationshipType: args.relationshipType,
    sortOrder: args.sortOrder,
    createdBy: BACKFILL_ACTOR,
    createdAt: now,
    updatedAt: now,
  });
  args.inserted.fileClients += 1;
}

async function insertFileProject(
  ctx: MutationCtx,
  args: {
    organizationId: Id<"organizations">;
    fileId: Id<"pipeline">;
    projectId: Id<"projects">;
    relationshipType: Doc<"fileProjects">["relationshipType"];
    sortOrder: number;
    dryRun: boolean;
    inserted: InsertCounts;
    skipped: InsertCounts;
  },
) {
  const existing = await ctx.db
    .query("fileProjects")
    .withIndex("by_file_entity", (q) =>
      q.eq("fileId", args.fileId).eq("projectId", args.projectId),
    )
    .first();
  if (existing) {
    args.skipped.fileProjects += 1;
    return;
  }
  if (args.dryRun) {
    args.inserted.fileProjects += 1;
    return;
  }
  const now = Date.now();
  await ctx.db.insert("fileProjects", {
    organizationId: args.organizationId,
    fileId: args.fileId,
    projectId: args.projectId,
    relationshipType: args.relationshipType,
    sortOrder: args.sortOrder,
    createdBy: BACKFILL_ACTOR,
    createdAt: now,
    updatedAt: now,
  });
  args.inserted.fileProjects += 1;
}

async function insertFileLender(
  ctx: MutationCtx,
  args: {
    organizationId: Id<"organizations">;
    fileId: Id<"pipeline">;
    lenderId: Id<"lenders">;
    relationshipType: Doc<"fileLenders">["relationshipType"];
    sortOrder: number;
    dryRun: boolean;
    inserted: InsertCounts;
    skipped: InsertCounts;
  },
) {
  const existing = await ctx.db
    .query("fileLenders")
    .withIndex("by_file_entity", (q) =>
      q.eq("fileId", args.fileId).eq("lenderId", args.lenderId),
    )
    .first();
  if (existing) {
    args.skipped.fileLenders += 1;
    return;
  }
  if (args.dryRun) {
    args.inserted.fileLenders += 1;
    return;
  }
  const now = Date.now();
  await ctx.db.insert("fileLenders", {
    organizationId: args.organizationId,
    fileId: args.fileId,
    lenderId: args.lenderId,
    relationshipType: args.relationshipType,
    sortOrder: args.sortOrder,
    createdBy: BACKFILL_ACTOR,
    createdAt: now,
    updatedAt: now,
  });
  args.inserted.fileLenders += 1;
}

async function insertFileReferral(
  ctx: MutationCtx,
  args: {
    organizationId: Id<"organizations">;
    fileId: Id<"pipeline">;
    contactId: Id<"contacts">;
    relationshipType: Doc<"fileReferralPartners">["relationshipType"];
    sortOrder: number;
    dryRun: boolean;
    inserted: InsertCounts;
    skipped: InsertCounts;
  },
) {
  const existing = await ctx.db
    .query("fileReferralPartners")
    .withIndex("by_file_entity", (q) =>
      q.eq("fileId", args.fileId).eq("contactId", args.contactId),
    )
    .first();
  if (existing) {
    args.skipped.fileReferralPartners += 1;
    return;
  }
  if (args.dryRun) {
    args.inserted.fileReferralPartners += 1;
    return;
  }
  const now = Date.now();
  await ctx.db.insert("fileReferralPartners", {
    organizationId: args.organizationId,
    fileId: args.fileId,
    contactId: args.contactId,
    relationshipType: args.relationshipType,
    sortOrder: args.sortOrder,
    createdBy: BACKFILL_ACTOR,
    createdAt: now,
    updatedAt: now,
  });
  args.inserted.fileReferralPartners += 1;
}

async function insertFileTeam(
  ctx: MutationCtx,
  args: {
    organizationId: Id<"organizations">;
    fileId: Id<"pipeline">;
    userKey: string;
    relationshipType: Doc<"fileTeamMembers">["relationshipType"];
    sortOrder: number;
    dryRun: boolean;
    inserted: InsertCounts;
    skipped: InsertCounts;
  },
) {
  const uk = args.userKey.trim();
  if (!uk) return;
  const existing = await ctx.db
    .query("fileTeamMembers")
    .withIndex("by_file_entity", (q) =>
      q.eq("fileId", args.fileId).eq("userKey", uk),
    )
    .first();
  if (existing) {
    args.skipped.fileTeamMembers += 1;
    return;
  }
  if (args.dryRun) {
    args.inserted.fileTeamMembers += 1;
    return;
  }
  const now = Date.now();
  await ctx.db.insert("fileTeamMembers", {
    organizationId: args.organizationId,
    fileId: args.fileId,
    userKey: uk,
    relationshipType: args.relationshipType,
    sortOrder: args.sortOrder,
    createdBy: BACKFILL_ACTOR,
    createdAt: now,
    updatedAt: now,
  });
  args.inserted.fileTeamMembers += 1;
}

async function insertFileTask(
  ctx: MutationCtx,
  args: {
    organizationId: Id<"organizations">;
    fileId: Id<"pipeline">;
    taskId: Id<"tasks">;
    relationshipType: Doc<"fileTasks">["relationshipType"];
    sortOrder: number;
    dryRun: boolean;
    inserted: InsertCounts;
    skipped: InsertCounts;
  },
) {
  const existing = await ctx.db
    .query("fileTasks")
    .withIndex("by_file_entity", (q) =>
      q.eq("fileId", args.fileId).eq("taskId", args.taskId),
    )
    .first();
  if (existing) {
    args.skipped.fileTasks += 1;
    return;
  }
  if (args.dryRun) {
    args.inserted.fileTasks += 1;
    return;
  }
  const now = Date.now();
  await ctx.db.insert("fileTasks", {
    organizationId: args.organizationId,
    fileId: args.fileId,
    taskId: args.taskId,
    relationshipType: args.relationshipType,
    sortOrder: args.sortOrder,
    createdBy: BACKFILL_ACTOR,
    createdAt: now,
    updatedAt: now,
  });
  args.inserted.fileTasks += 1;
}

async function insertProjectLender(
  ctx: MutationCtx,
  args: {
    organizationId: Id<"organizations">;
    projectId: Id<"projects">;
    lenderId: Id<"lenders">;
    relationshipType: Doc<"projectLenders">["relationshipType"];
    sortOrder: number;
    dryRun: boolean;
    inserted: InsertCounts;
    skipped: InsertCounts;
  },
) {
  const existing = await ctx.db
    .query("projectLenders")
    .withIndex("by_project_entity", (q) =>
      q.eq("projectId", args.projectId).eq("lenderId", args.lenderId),
    )
    .first();
  if (existing) {
    args.skipped.projectLenders += 1;
    return;
  }
  if (args.dryRun) {
    args.inserted.projectLenders += 1;
    return;
  }
  const now = Date.now();
  await ctx.db.insert("projectLenders", {
    organizationId: args.organizationId,
    projectId: args.projectId,
    lenderId: args.lenderId,
    relationshipType: args.relationshipType,
    sortOrder: args.sortOrder,
    createdBy: BACKFILL_ACTOR,
    createdAt: now,
    updatedAt: now,
  });
  args.inserted.projectLenders += 1;
}

async function insertProjectReferral(
  ctx: MutationCtx,
  args: {
    organizationId: Id<"organizations">;
    projectId: Id<"projects">;
    contactId: Id<"contacts">;
    relationshipType: Doc<"projectReferralPartners">["relationshipType"];
    sortOrder: number;
    dryRun: boolean;
    inserted: InsertCounts;
    skipped: InsertCounts;
  },
) {
  const existing = await ctx.db
    .query("projectReferralPartners")
    .withIndex("by_project_entity", (q) =>
      q.eq("projectId", args.projectId).eq("contactId", args.contactId),
    )
    .first();
  if (existing) {
    args.skipped.projectReferralPartners += 1;
    return;
  }
  if (args.dryRun) {
    args.inserted.projectReferralPartners += 1;
    return;
  }
  const now = Date.now();
  await ctx.db.insert("projectReferralPartners", {
    organizationId: args.organizationId,
    projectId: args.projectId,
    contactId: args.contactId,
    relationshipType: args.relationshipType,
    sortOrder: args.sortOrder,
    createdBy: BACKFILL_ACTOR,
    createdAt: now,
    updatedAt: now,
  });
  args.inserted.projectReferralPartners += 1;
}

async function insertProjectTeam(
  ctx: MutationCtx,
  args: {
    organizationId: Id<"organizations">;
    projectId: Id<"projects">;
    userKey: string;
    relationshipType: Doc<"projectTeamMembers">["relationshipType"];
    sortOrder: number;
    dryRun: boolean;
    inserted: InsertCounts;
    skipped: InsertCounts;
  },
) {
  const uk = args.userKey.trim();
  if (!uk) return;
  const existing = await ctx.db
    .query("projectTeamMembers")
    .withIndex("by_project_entity", (q) =>
      q.eq("projectId", args.projectId).eq("userKey", uk),
    )
    .first();
  if (existing) {
    args.skipped.projectTeamMembers += 1;
    return;
  }
  if (args.dryRun) {
    args.inserted.projectTeamMembers += 1;
    return;
  }
  const now = Date.now();
  await ctx.db.insert("projectTeamMembers", {
    organizationId: args.organizationId,
    projectId: args.projectId,
    userKey: uk,
    relationshipType: args.relationshipType,
    sortOrder: args.sortOrder,
    createdBy: BACKFILL_ACTOR,
    createdAt: now,
    updatedAt: now,
  });
  args.inserted.projectTeamMembers += 1;
}

async function insertProjectTask(
  ctx: MutationCtx,
  args: {
    organizationId: Id<"organizations">;
    projectId: Id<"projects">;
    taskId: Id<"tasks">;
    relationshipType: Doc<"projectTasks">["relationshipType"];
    sortOrder: number;
    dryRun: boolean;
    inserted: InsertCounts;
    skipped: InsertCounts;
  },
) {
  const existing = await ctx.db
    .query("projectTasks")
    .withIndex("by_project_entity", (q) =>
      q.eq("projectId", args.projectId).eq("taskId", args.taskId),
    )
    .first();
  if (existing) {
    args.skipped.projectTasks += 1;
    return;
  }
  if (args.dryRun) {
    args.inserted.projectTasks += 1;
    return;
  }
  const now = Date.now();
  await ctx.db.insert("projectTasks", {
    organizationId: args.organizationId,
    projectId: args.projectId,
    taskId: args.taskId,
    relationshipType: args.relationshipType,
    sortOrder: args.sortOrder,
    createdBy: BACKFILL_ACTOR,
    createdAt: now,
    updatedAt: now,
  });
  args.inserted.projectTasks += 1;
}

function mapReferralType(
  raw: string | undefined,
): Doc<"fileReferralPartners">["relationshipType"] {
  if (raw === "referral") return "referral";
  if (raw === "introducer") return "introducer";
  if (raw === "broker") return "broker";
  return "other";
}

export async function executeIndexedGraphBackfill(
  ctx: MutationCtx,
  opts: {
    organizationId: Id<"organizations">;
    dryRun?: boolean;
    skipAmbiguityAbort?: boolean;
  },
): Promise<BackfillExecuteResult> {
  const dryRun = opts.dryRun === true;
  const orgId = opts.organizationId;
  const inserted = initCounts();
  const skipped = initCounts();
  const ambiguitiesSkipped: string[] = [];
  const collapses: CollapseReport[] = [];

  const ambiguity = await detectStickinessAmbiguity(ctx, orgId);
  if (ambiguity.abort && !opts.skipAmbiguityAbort) {
    return {
      dryRun,
      aborted: true,
      abortReason: `stickiness_ambiguity:${ambiguity.reasons.join(";")}`,
      inserted,
      skippedExisting: skipped,
      ambiguitiesSkipped: ambiguity.reasons,
      collapses,
      integrity: {
        orphanEdges: [],
        duplicateNormalizedEdges: [],
        filesMissingClientEdge: [],
        filesMissingProjectEdge: [],
        invalidTaskLinks: [],
        pass: false,
      },
      sharesBefore: await countOrgResourceShares(ctx, orgId),
      sharesAfter: await countOrgResourceShares(ctx, orgId),
      joshuaBefore: await captureVisibility(ctx, orgId, JOSHUA_USER_ID),
      joshuaAfter: await captureVisibility(ctx, orgId, JOSHUA_USER_ID),
      eballardBefore: await captureVisibility(ctx, orgId, EBALLARD_USER_ID),
      eballardAfter: await captureVisibility(ctx, orgId, EBALLARD_USER_ID),
      joshuaDrift: false,
      eballardDrift: false,
      sharesDrift: false,
    };
  }
  if (ambiguity.reasons.length > 0) {
    ambiguitiesSkipped.push(...ambiguity.reasons);
  }

  const sharesBefore = await countOrgResourceShares(ctx, orgId);
  const joshuaBefore = await captureVisibility(ctx, orgId, JOSHUA_USER_ID);
  const eballardBefore = await captureVisibility(ctx, orgId, EBALLARD_USER_ID);

  const files = await ctx.db
    .query("pipeline")
    .withIndex("by_organization_createdAt", (q) =>
      q.eq("organizationId", orgId),
    )
    .collect();

  const loanClients = await ctx.db.query("loanClients").collect();
  const loanByFile = new Map<string, typeof loanClients>();
  for (const lc of loanClients) {
    if (String(lc.organizationId) !== String(orgId)) continue;
    const fid = String(lc.pipelineId);
    const list = loanByFile.get(fid) ?? [];
    list.push(lc);
    loanByFile.set(fid, list);
  }

  const projectClientLinks = (await ctx.db.query("projectClients").collect()).filter(
    (r) => String(r.organizationId) === String(orgId),
  );
  const pcByProject = new Map<string, typeof projectClientLinks>();
  for (const pc of projectClientLinks) {
    const pid = String(pc.projectId);
    const list = pcByProject.get(pid) ?? [];
    list.push(pc);
    pcByProject.set(pid, list);
  }

  for (const file of files) {
    const fileId = file._id;
    const base = {
      organizationId: orgId,
      fileId,
      dryRun,
      inserted,
      skipped,
    };

    if (file.clientId) {
      await insertFileClient(ctx, {
        ...base,
        clientId: file.clientId,
        relationshipType: "primary",
        sortOrder: 0,
      });
    }

    for (const lc of loanByFile.get(String(fileId)) ?? []) {
      await insertFileClient(ctx, {
        ...base,
        clientId: lc.clientId,
        relationshipType: lc.relationshipType,
        sortOrder: lc.sortOrder,
      });
    }

    if (file.projectId) {
      for (const pc of pcByProject.get(String(file.projectId)) ?? []) {
        await insertFileClient(ctx, {
          ...base,
          clientId: pc.clientId,
          relationshipType: pc.relationshipType,
          sortOrder: pc.sortOrder + 20,
        });
      }
    }

    if (file.projectId) {
      await insertFileProject(ctx, {
        ...base,
        projectId: file.projectId,
        relationshipType: "primary",
        sortOrder: 0,
      });
    }

    const lenders = file.lenders ?? [];
    for (let i = 0; i < lenders.length; i++) {
      const lenderId = lenders[i]!;
      const relType: Doc<"fileLenders">["relationshipType"] =
        file.selectedLenderId != null &&
        String(file.selectedLenderId) === String(lenderId)
          ? "selected"
          : "quoted";
      await insertFileLender(ctx, {
        ...base,
        lenderId,
        relationshipType: relType,
        sortOrder: i,
      });
    }

    if (file.assigneeId?.trim()) {
      await insertFileTeam(ctx, {
        ...base,
        userKey: file.assigneeId.trim(),
        relationshipType: "assignee",
        sortOrder: 0,
      });
    }
    for (let i = 0; i < (file.sharedWithIds ?? []).length; i++) {
      const uk = (file.sharedWithIds ?? [])[i]!.trim();
      if (!uk) continue;
      await insertFileTeam(ctx, {
        ...base,
        userKey: uk,
        relationshipType: "shared",
        sortOrder: 5 + i,
      });
    }
  }

  const contactLinks = await ctx.db.query("contactFileLinks").collect();
  for (const link of contactLinks) {
    if (link.contactRoleId && link.contactRoleId !== "referral_partner") continue;
    const file = await ctx.db.get(link.fileId);
    if (!file || file.organizationId !== orgId) continue;
    await insertFileReferral(ctx, {
      organizationId: orgId,
      fileId: link.fileId,
      contactId: link.contactId,
      relationshipType: mapReferralType(
        link.contactRoleId === "referral_partner" ? "referral" : undefined,
      ),
      sortOrder: 10,
      dryRun,
      inserted,
      skipped,
    });
  }

  const resourceShares = await ctx.db.query("resourceShares").collect();
  for (const share of resourceShares) {
    if (share.organizationId !== orgId || share.resourceType !== "pipeline") continue;
    const file = await ctx.db.get(share.resourceId as Id<"pipeline">);
    if (!file || file.organizationId !== orgId) continue;
    await insertFileTeam(ctx, {
      organizationId: orgId,
      fileId: file._id,
      userKey: share.sharedUserId,
      relationshipType: "shared",
      sortOrder: 9,
      dryRun,
      inserted,
      skipped,
    });
  }

  const legacyShares = await ctx.db.query("pipelineFileShares").collect();
  for (const share of legacyShares) {
    const file = await ctx.db.get(share.fileId);
    if (!file || file.organizationId !== orgId) continue;
    await insertFileTeam(ctx, {
      organizationId: orgId,
      fileId: share.fileId,
      userKey: share.userKey,
      relationshipType: "shared",
      sortOrder: 8,
      dryRun,
      inserted,
      skipped,
    });
  }

  const tasks = await ctx.db
    .query("tasks")
    .withIndex("by_organization", (q) => q.eq("organizationId", orgId))
    .collect();
  for (const task of tasks) {
    if (!task.relatedFileId) continue;
    const file = await ctx.db.get(task.relatedFileId);
    if (!file || file.organizationId !== orgId) continue;
    await insertFileTask(ctx, {
      organizationId: orgId,
      fileId: task.relatedFileId,
      taskId: task._id,
      relationshipType: "related",
      sortOrder: 0,
      dryRun,
      inserted,
      skipped,
    });
  }

  const projects = await ctx.db
    .query("projects")
    .withIndex("by_organization", (q) => q.eq("organizationId", orgId))
    .collect();

  for (const project of projects) {
    const projectFiles = files.filter(
      (f) => f.projectId != null && String(f.projectId) === String(project._id),
    );
    const lenderSeen = new Set<string>();
    const referralSeen = new Set<string>();
    const teamSeen = new Set<string>();
    const taskSeen = new Set<string>();

    for (const f of projectFiles) {
      for (const lid of f.lenders ?? []) {
        const k = String(lid);
        if (lenderSeen.has(k)) continue;
        lenderSeen.add(k);
        const rel: Doc<"projectLenders">["relationshipType"] =
          f.selectedLenderId != null && String(f.selectedLenderId) === k
            ? "selected"
            : "quoted";
        await insertProjectLender(ctx, {
          organizationId: orgId,
          projectId: project._id,
          lenderId: lid,
          relationshipType: rel,
          sortOrder: lenderSeen.size - 1,
          dryRun,
          inserted,
          skipped,
        });
      }

      const fileRefs = await ctx.db
        .query("fileReferralPartners")
        .withIndex("by_file", (q) => q.eq("fileId", f._id))
        .collect();
      for (const fr of fileRefs) {
        const k = String(fr.contactId);
        if (referralSeen.has(k)) continue;
        referralSeen.add(k);
        await insertProjectReferral(ctx, {
          organizationId: orgId,
          projectId: project._id,
          contactId: fr.contactId,
          relationshipType:
            fr.relationshipType === "referral"
              ? "referral"
              : fr.relationshipType === "introducer"
                ? "introducer"
                : fr.relationshipType === "broker"
                  ? "broker"
                  : "other",
          sortOrder: referralSeen.size - 1,
          dryRun,
          inserted,
          skipped,
        });
      }

      const teamRefs = await ctx.db
        .query("fileTeamMembers")
        .withIndex("by_file", (q) => q.eq("fileId", f._id))
        .collect();
      for (const tm of teamRefs) {
        const k = tm.userKey.trim();
        if (!k || teamSeen.has(k)) continue;
        teamSeen.add(k);
        await insertProjectTeam(ctx, {
          organizationId: orgId,
          projectId: project._id,
          userKey: k,
          relationshipType:
            tm.relationshipType === "assignee" ? "assignee" : "shared",
          sortOrder: teamSeen.size - 1,
          dryRun,
          inserted,
          skipped,
        });
      }

      const taskRefs = await ctx.db
        .query("fileTasks")
        .withIndex("by_file", (q) => q.eq("fileId", f._id))
        .collect();
      for (const ft of taskRefs) {
        const k = String(ft.taskId);
        if (taskSeen.has(k)) continue;
        taskSeen.add(k);
        await insertProjectTask(ctx, {
          organizationId: orgId,
          projectId: project._id,
          taskId: ft.taskId,
          relationshipType: "related",
          sortOrder: taskSeen.size - 1,
          dryRun,
          inserted,
          skipped,
        });
      }
    }
  }

  if (!dryRun) {
    collapses.push(...(await collapseEquivalentFileClientEdges(ctx, orgId)));
  }

  const integrity = await scanIndexedGraphIntegrity(ctx, orgId);
  const sharesAfter = await countOrgResourceShares(ctx, orgId);
  const joshuaAfter = await captureVisibility(ctx, orgId, JOSHUA_USER_ID);
  const eballardAfter = await captureVisibility(ctx, orgId, EBALLARD_USER_ID);

  const joshuaDrift =
    joshuaBefore.visibleFileIds.join(",") !== joshuaAfter.visibleFileIds.join(",");
  const eballardDrift =
    eballardBefore.visibleFileIds.join(",") !==
    eballardAfter.visibleFileIds.join(",");
  const sharesDrift =
    sharesBefore.total !== sharesAfter.total ||
    sharesBefore.pipeline !== sharesAfter.pipeline;

  if (!dryRun && (joshuaDrift || eballardDrift || sharesDrift)) {
    throw new Error(
      `Backfill drift detected: joshua=${joshuaDrift} eballard=${eballardDrift} shares=${sharesDrift}`,
    );
  }

  return {
    dryRun,
    aborted: false,
    abortReason: null,
    inserted,
    skippedExisting: skipped,
    ambiguitiesSkipped,
    collapses,
    integrity,
    sharesBefore,
    sharesAfter,
    joshuaBefore,
    joshuaAfter,
    eballardBefore,
    eballardAfter,
    joshuaDrift,
    eballardDrift,
    sharesDrift,
  };
}

async function collapseEquivalentFileClientEdges(
  ctx: MutationCtx,
  organizationId: Id<"organizations">,
): Promise<CollapseReport[]> {
  const out: CollapseReport[] = [];
  const edges = (await ctx.db.query("fileClients").collect()).filter(
    (e) => String(e.organizationId) === String(organizationId),
  );
  const byFile = new Map<string, Doc<"fileClients">[]>();
  for (const e of edges) {
    const fid = String(e.fileId);
    const list = byFile.get(fid) ?? [];
    list.push(e);
    byFile.set(fid, list);
  }

  const clientCache = new Map<string, Doc<"clients"> | null>();
  async function clientDoc(id: Id<"clients">) {
    const k = String(id);
    if (!clientCache.has(k)) {
      clientCache.set(k, (await ctx.db.get(id)) ?? null);
    }
    return clientCache.get(k)!;
  }

  for (const [fileId, list] of byFile) {
    const byStickiness = new Map<string, Doc<"fileClients">[]>();
    for (const edge of list) {
      const client = await clientDoc(edge.clientId);
      if (!client) continue;
      const sk = stickinessKeyString(
        computeClientStickinessKey({
          displayName: client.displayName,
          primaryContactEmail: client.primaryContactEmail,
          primaryContactPhone: client.primaryContactPhone,
        }),
      );
      const group = byStickiness.get(sk) ?? [];
      group.push(edge);
      byStickiness.set(sk, group);
    }
    for (const [sk, group] of byStickiness) {
      if (group.length <= 1) continue;
      group.sort((a, b) => {
        if (a.relationshipType === "primary") return -1;
        if (b.relationshipType === "primary") return 1;
        return a.sortOrder - b.sortOrder;
      });
      const keep = group[0]!;
      const removed: string[] = [];
      for (const dup of group.slice(1)) {
        await ctx.db.delete(dup._id);
        removed.push(String(dup._id));
      }
      if (removed.length > 0) {
        out.push({
          table: "fileClients",
          fileOrProjectId: fileId,
          removedEdgeIds: removed,
          keptEntityId: String(keep.clientId),
          stickinessKey: sk,
        });
      }
    }
  }
  return out;
}

export async function scanIndexedGraphIntegrity(
  ctx: QueryCtx | MutationCtx,
  organizationId: Id<"organizations">,
): Promise<IntegrityScan> {
  const orphanEdges: string[] = [];
  const duplicateNormalizedEdges: string[] = [];
  const filesMissingClientEdge: string[] = [];
  const filesMissingProjectEdge: string[] = [];
  const invalidTaskLinks: string[] = [];

  const files = await ctx.db
    .query("pipeline")
    .withIndex("by_organization_createdAt", (q) =>
      q.eq("organizationId", organizationId),
    )
    .collect();

  const checkDup = <T>(
    rows: T[],
    keyFn: (r: T) => string,
    label: string,
  ) => {
    const seen = new Set<string>();
    for (const r of rows) {
      const k = keyFn(r);
      if (seen.has(k)) duplicateNormalizedEdges.push(`${label}:${k}`);
      seen.add(k);
    }
  };

  const fc = (await ctx.db.query("fileClients").collect()).filter(
    (r) => String(r.organizationId) === String(organizationId),
  );
  checkDup(fc, (r) => `${r.fileId}:${r.clientId}`, "fileClients");
  for (const e of fc) {
    const file = await ctx.db.get(e.fileId);
    const client = await ctx.db.get(e.clientId);
    if (!file || !client) orphanEdges.push(`fileClients:${e._id}`);
  }

  const fp = (await ctx.db.query("fileProjects").collect()).filter(
    (r) => String(r.organizationId) === String(organizationId),
  );
  checkDup(fp, (r) => `${r.fileId}:${r.projectId}`, "fileProjects");
  for (const e of fp) {
    const file = await ctx.db.get(e.fileId);
    const project = await ctx.db.get(e.projectId);
    if (!file || !project) orphanEdges.push(`fileProjects:${e._id}`);
  }

  for (const file of files) {
    if (file.clientId) {
      const has = fc.some(
        (e) =>
          String(e.fileId) === String(file._id) &&
          String(e.clientId) === String(file.clientId),
      );
      if (!has) filesMissingClientEdge.push(String(file._id));
    }
    if (file.projectId) {
      const has = fp.some(
        (e) =>
          String(e.fileId) === String(file._id) &&
          String(e.projectId) === String(file.projectId),
      );
      if (!has) filesMissingProjectEdge.push(String(file._id));
    }
  }

  const ft = (await ctx.db.query("fileTasks").collect()).filter(
    (r) => String(r.organizationId) === String(organizationId),
  );
  for (const e of ft) {
    const file = await ctx.db.get(e.fileId);
    const task = await ctx.db.get(e.taskId);
    if (!file || !task) {
      orphanEdges.push(`fileTasks:${e._id}`);
    } else if (task.relatedFileId && String(task.relatedFileId) !== String(e.fileId)) {
      invalidTaskLinks.push(`fileTasks:${e._id}:scalar_mismatch`);
    }
  }

  const pass =
    orphanEdges.length === 0 &&
    duplicateNormalizedEdges.length === 0 &&
    filesMissingClientEdge.length === 0 &&
    filesMissingProjectEdge.length === 0 &&
    invalidTaskLinks.length === 0;

  return {
    orphanEdges,
    duplicateNormalizedEdges,
    filesMissingClientEdge,
    filesMissingProjectEdge,
    invalidTaskLinks,
    pass,
  };
}

export type ResolverProof = {
  resolver: string;
  entityId: string;
  unique: boolean;
  count: number;
  ordered: boolean;
};

export async function runCompatResolverProof(
  ctx: QueryCtx,
  organizationId: Id<"organizations">,
  memberUserKey: string,
): Promise<{ pass: boolean; proofs: ResolverProof[] }> {
  const proofs: ResolverProof[] = [];

  const clients = await ctx.db
    .query("clients")
    .withIndex("by_organization", (q) => q.eq("organizationId", organizationId))
    .take(8);
  for (const c of clients) {
    const refs = await resolveFilesForClient(ctx, {
      organizationId,
      clientId: c._id,
      memberUserKey,
    });
    proofs.push({
      resolver: "resolveFilesForClient",
      entityId: String(c._id),
      unique: assertUniqueFileRefs(refs),
      count: refs.length,
      ordered: refs.every(
        (r, i) => i === 0 || refs[i - 1]!.sortOrder <= r.sortOrder,
      ),
    });
  }

  const projects = await ctx.db
    .query("projects")
    .withIndex("by_organization", (q) => q.eq("organizationId", organizationId))
    .take(8);
  for (const p of projects) {
    const refs = await resolveFilesForProject(ctx, {
      organizationId,
      projectId: p._id,
      memberUserKey,
    });
    proofs.push({
      resolver: "resolveFilesForProject",
      entityId: String(p._id),
      unique: assertUniqueFileRefs(refs),
      count: refs.length,
      ordered: refs.every(
        (r, i) => i === 0 || refs[i - 1]!.sortOrder <= r.sortOrder,
      ),
    });
  }

  const lenders = await ctx.db
    .query("lenders")
    .withIndex("by_organization", (q) => q.eq("organizationId", organizationId))
    .take(5);
  for (const l of lenders) {
    const refs = await resolveFilesForLender(ctx, {
      organizationId,
      lenderId: l._id,
      memberUserKey,
    });
    proofs.push({
      resolver: "resolveFilesForLender",
      entityId: String(l._id),
      unique: assertUniqueFileRefs(refs),
      count: refs.length,
      ordered: refs.every(
        (r, i) => i === 0 || refs[i - 1]!.sortOrder <= r.sortOrder,
      ),
    });
  }

  const contacts = await ctx.db
    .query("contacts")
    .withIndex("by_organization_updatedAt", (q) =>
      q.eq("organizationId", organizationId),
    )
    .collect();
  for (const c of contacts.filter((x) =>
    x.contactRoleId === "referral_partner",
  ).slice(0, 5)) {
    const refs = await resolveFilesForReferralPartner(ctx, {
      organizationId,
      contactId: c._id,
      memberUserKey,
    });
    proofs.push({
      resolver: "resolveFilesForReferralPartner",
      entityId: String(c._id),
      unique: assertUniqueFileRefs(refs),
      count: refs.length,
      ordered: true,
    });
  }

  const members = await ctx.db
    .query("organizationMembers")
    .withIndex("by_organization", (q) => q.eq("organizationId", organizationId))
    .collect();
  for (const m of members.slice(0, 5)) {
    const refs = await resolveFilesForTeamMember(ctx, {
      organizationId,
      userKey: m.userKey,
      memberUserKey,
    });
    proofs.push({
      resolver: "resolveFilesForTeamMember",
      entityId: m.userKey,
      unique: assertUniqueFileRefs(refs),
      count: refs.length,
      ordered: true,
    });
  }

  const tasks = await ctx.db
    .query("tasks")
    .withIndex("by_organization", (q) => q.eq("organizationId", organizationId))
    .take(10);
  for (const t of tasks) {
    const refs = await resolveFilesForTask(ctx, {
      organizationId,
      taskId: t._id,
      memberUserKey,
    });
    proofs.push({
      resolver: "resolveFilesForTask",
      entityId: String(t._id),
      unique: assertUniqueFileRefs(refs),
      count: refs.length,
      ordered: true,
    });
  }

  const pass = proofs.every((p) => p.unique && p.ordered);
  return { pass, proofs };
}

export async function runIndexedGraphProductionProof(
  ctx: QueryCtx | MutationCtx,
  organizationId: Id<"organizations">,
  backfill: BackfillExecuteResult,
): Promise<{
  pass: boolean;
  resolverProof: Awaited<ReturnType<typeof runCompatResolverProof>>;
  analyze: Awaited<ReturnType<typeof analyzeIndexedGraphFoundation>>;
  matrix: Awaited<ReturnType<typeof captureBackfillMatrix>>;
}> {
  const resolverProof = await runCompatResolverProof(
    ctx,
    organizationId,
    JOSHUA_USER_ID,
  );
  const analyze = await analyzeIndexedGraphFoundation(ctx, organizationId);
  const matrix = await captureBackfillMatrix(ctx);

  const pass =
    !backfill.aborted &&
    !backfill.joshuaDrift &&
    !backfill.eballardDrift &&
    !backfill.sharesDrift &&
    backfill.integrity.pass &&
    resolverProof.pass;

  return { pass, resolverProof, analyze, matrix };
}

export { JOSHUA_ORG_ID, JOSHUA_USER_ID, EBALLARD_USER_ID };
