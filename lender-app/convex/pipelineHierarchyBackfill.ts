/**
 * Phase 13.3 Step 3 — analyze + plan + execute legacy pipeline → clients/projects.
 */
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import {
  legacyClientProjectFromDealData,
} from "../lib/pipelineHierarchy";
import { canonicalizeHierarchyKey } from "../lib/pipelineHierarchyNormalize";
import { ownerFieldsForInsert, resolveRowOwnerUserId } from "./resourceAccess";
import {
  computeClientRollup,
  computeProjectRollup,
} from "./pipelineHierarchyRollups";
import { loadPipelineFilesForProject } from "./pipelineHierarchyCompat";
import {
  filterPipelineRowsForMember,
  resolvePipelineAccessLevel,
} from "./resourceAccess";

export type BackfillFileRow = {
  fileId: string;
  organizationId: string;
  ownerUserId: string;
  clientDisplayName: string;
  projectDisplayTitle: string;
  canonicalClient: string;
  canonicalProject: string;
  identitySource: "legacy_deal_data" | "legacy_file_name";
  alreadyLinked: boolean;
};

export type BackfillProjectGroup = {
  groupKey: string;
  organizationId: string;
  canonicalClient: string;
  canonicalProject: string;
  clientDisplayName: string;
  projectDisplayTitle: string;
  fileIds: string[];
  ownerUserIds: string[];
  ownerCollision: boolean;
  skipReason: string | null;
};

export type BackfillAnalyzeResult = {
  scannedPipelineRows: number;
  legacyCandidateFiles: number;
  alreadyLinkedFiles: number;
  skippedNoOrg: number;
  distinctCanonicalClients: number;
  distinctCanonicalProjects: number;
  projectGroups: BackfillProjectGroup[];
  ownerCollisionGroups: BackfillProjectGroup[];
  executableGroups: BackfillProjectGroup[];
  fileRows: BackfillFileRow[];
};

export type VisibilitySnapshot = {
  memberUserKey: string;
  organizationId: string;
  visibleFileIds: string[];
  accessByFileId: Record<string, string>;
};

export type BackfillMatrix = {
  legacyUnlinkedFiles: number;
  linkedFiles: number;
  clientCount: number;
  projectCount: number;
  resourceShareCount: number;
  pipelineResourceShareCount: number;
};

const JOSHUA_ORG_ID = "mx76bxqnc23q76cb99tvrffmy58644pf";
const JOSHUA_USER_ID = "ts719yfyv2b6020avvctpw0ns586exm6";

export function projectGroupKey(
  organizationId: string,
  canonicalClient: string,
  canonicalProject: string,
): string {
  return `${organizationId}\0${canonicalClient}\0${canonicalProject}`;
}

export function clientGroupKey(
  organizationId: string,
  canonicalClient: string,
): string {
  return `${organizationId}\0${canonicalClient}`;
}

function fileEntryFromRow(row: Doc<"pipeline">): BackfillFileRow | null {
  if (!row.organizationId) return null;
  const legacy = legacyClientProjectFromDealData(row.dealData, row.fileName);
  const clientDisplayName = legacy.clientName.trim() || "Borrower";
  const projectDisplayTitle = legacy.projectName.trim() || "Project";
  const ownerUserId = resolveRowOwnerUserId(row);
  if (!ownerUserId) return null;
  return {
    fileId: String(row._id),
    organizationId: String(row.organizationId),
    ownerUserId,
    clientDisplayName,
    projectDisplayTitle,
    canonicalClient: canonicalizeHierarchyKey(clientDisplayName),
    canonicalProject: canonicalizeHierarchyKey(projectDisplayTitle),
    identitySource: legacy.resolution,
    alreadyLinked: Boolean(row.clientId && row.projectId),
  };
}

export async function analyzeHierarchyBackfill(
  ctx: QueryCtx,
): Promise<BackfillAnalyzeResult> {
  const all = await ctx.db.query("pipeline").collect();
  const fileRows: BackfillFileRow[] = [];
  let skippedNoOrg = 0;
  let alreadyLinkedFiles = 0;

  for (const row of all) {
    if (!row.organizationId) {
      skippedNoOrg += 1;
      continue;
    }
    if (row.clientId && row.projectId) {
      alreadyLinkedFiles += 1;
      continue;
    }
    const entry = fileEntryFromRow(row);
    if (!entry) {
      skippedNoOrg += 1;
      continue;
    }
    fileRows.push(entry);
  }

  const groupMap = new Map<string, BackfillProjectGroup>();
  for (const f of fileRows) {
    const gk = projectGroupKey(
      f.organizationId,
      f.canonicalClient,
      f.canonicalProject,
    );
    let g = groupMap.get(gk);
    if (!g) {
      g = {
        groupKey: gk,
        organizationId: f.organizationId,
        canonicalClient: f.canonicalClient,
        canonicalProject: f.canonicalProject,
        clientDisplayName: f.clientDisplayName,
        projectDisplayTitle: f.projectDisplayTitle,
        fileIds: [],
        ownerUserIds: [],
        ownerCollision: false,
        skipReason: null,
      };
      groupMap.set(gk, g);
    }
    g.fileIds.push(f.fileId);
    if (!g.ownerUserIds.includes(f.ownerUserId)) {
      g.ownerUserIds.push(f.ownerUserId);
    }
  }

  const projectGroups = [...groupMap.values()].map((g) => {
    const ownerCollision = g.ownerUserIds.length > 1;
    return {
      ...g,
      ownerCollision,
      skipReason: ownerCollision
        ? `owner_collision:${g.ownerUserIds.join(",")}`
        : null,
    };
  });

  const ownerCollisionGroups = projectGroups.filter((g) => g.ownerCollision);
  const executableGroups = projectGroups.filter((g) => !g.ownerCollision);

  const distinctClients = new Set(
    fileRows.map((f) => clientGroupKey(f.organizationId, f.canonicalClient)),
  );
  const distinctProjects = new Set(
    fileRows.map((f) =>
      projectGroupKey(f.organizationId, f.canonicalClient, f.canonicalProject),
    ),
  );

  return {
    scannedPipelineRows: all.length,
    legacyCandidateFiles: fileRows.length,
    alreadyLinkedFiles,
    skippedNoOrg,
    distinctCanonicalClients: distinctClients.size,
    distinctCanonicalProjects: distinctProjects.size,
    projectGroups,
    ownerCollisionGroups,
    executableGroups,
    fileRows,
  };
}

export async function captureBackfillMatrix(
  ctx: QueryCtx,
): Promise<BackfillMatrix> {
  const pipeline = await ctx.db.query("pipeline").collect();
  const legacyUnlinked = pipeline.filter(
    (r) => r.organizationId && (!r.clientId || !r.projectId),
  ).length;
  const linked = pipeline.filter(
    (r) => r.organizationId && r.clientId && r.projectId,
  ).length;
  const clients = await ctx.db.query("clients").collect();
  const projects = await ctx.db.query("projects").collect();
  const shares = await ctx.db.query("resourceShares").collect();
  return {
    legacyUnlinkedFiles: legacyUnlinked,
    linkedFiles: linked,
    clientCount: clients.length,
    projectCount: projects.length,
    resourceShareCount: shares.length,
    pipelineResourceShareCount: shares.filter(
      (s) => s.resourceType === "pipeline",
    ).length,
  };
}

export async function captureJoshuaVisibilitySnapshot(
  ctx: QueryCtx,
): Promise<VisibilitySnapshot> {
  const orgId = JOSHUA_ORG_ID as Id<"organizations">;
  const files = await ctx.db
    .query("pipeline")
    .withIndex("by_organization_createdAt", (q) =>
      q.eq("organizationId", orgId),
    )
    .collect();
  const visible = await filterPipelineRowsForMember(
    ctx,
    files,
    orgId,
    JOSHUA_USER_ID,
  );
  const accessByFileId: Record<string, string> = {};
  for (const f of visible) {
    accessByFileId[String(f._id)] = await resolvePipelineAccessLevel(
      ctx,
      f,
      JOSHUA_USER_ID,
    );
  }
  return {
    memberUserKey: JOSHUA_USER_ID,
    organizationId: JOSHUA_ORG_ID,
    visibleFileIds: visible.map((f) => String(f._id)).sort(),
    accessByFileId,
  };
}

export type ExecuteBackfillResult = {
  dryRun: boolean;
  createdClients: number;
  createdProjects: number;
  linkedFiles: number;
  skippedOwnerCollisions: number;
  skippedAlreadyLinked: number;
  skippedExistingClientOwnerMismatch: number;
  errors: string[];
  matrixBefore: BackfillMatrix;
  matrixAfter: BackfillMatrix;
  joshuaBefore: VisibilitySnapshot;
  joshuaAfter: VisibilitySnapshot;
  analyze: BackfillAnalyzeResult;
};

async function findClientByCanonical(
  ctx: QueryCtx | MutationCtx,
  organizationId: Id<"organizations">,
  normalizedName: string,
): Promise<Doc<"clients"> | null> {
  const rows = await ctx.db
    .query("clients")
    .withIndex("by_org_normalized", (q) =>
      q.eq("organizationId", organizationId).eq("normalizedName", normalizedName),
    )
    .collect();
  return rows[0] ?? null;
}

async function findProjectByCanonical(
  ctx: QueryCtx | MutationCtx,
  organizationId: Id<"organizations">,
  clientId: Id<"clients">,
  normalizedTitle: string,
): Promise<Doc<"projects"> | null> {
  const rows = await ctx.db
    .query("projects")
    .withIndex("by_org_client", (q) =>
      q.eq("organizationId", organizationId).eq("clientId", clientId),
    )
    .collect();
  return (
    rows.find((p) => p.normalizedTitle === normalizedTitle) ?? null
  );
}

export async function executeHierarchyBackfill(
  ctx: MutationCtx,
  options: { dryRun: boolean },
): Promise<ExecuteBackfillResult> {
  const matrixBefore = await captureBackfillMatrix(ctx);
  const joshuaBefore = await captureJoshuaVisibilitySnapshot(ctx);
  const analyze = await analyzeHierarchyBackfill(ctx);

  let createdClients = 0;
  let createdProjects = 0;
  let linkedFiles = 0;
  let skippedOwnerCollisions = 0;
  let skippedAlreadyLinked = analyze.alreadyLinkedFiles;
  let skippedExistingClientOwnerMismatch = 0;
  const errors: string[] = [];

  if (!options.dryRun) {
    for (const group of analyze.executableGroups) {
      if (group.ownerCollision) {
        skippedOwnerCollisions += group.fileIds.length;
        continue;
      }
      const ownerUserId = group.ownerUserIds[0]!;
      const orgId = group.organizationId as Id<"organizations">;
      const ownerFields = ownerFieldsForInsert(ownerUserId);

      let client = await findClientByCanonical(
        ctx,
        orgId,
        group.canonicalClient,
      );
      if (client) {
        if (resolveRowOwnerUserId(client) !== ownerUserId) {
          skippedExistingClientOwnerMismatch += group.fileIds.length;
          errors.push(
            `client_owner_mismatch:${group.groupKey}:existing=${resolveRowOwnerUserId(client)}:planned=${ownerUserId}`,
          );
          continue;
        }
      } else {
        const now = Date.now();
        const clientId = await ctx.db.insert("clients", {
          organizationId: orgId,
          displayName: group.clientDisplayName,
          normalizedName: group.canonicalClient,
          ...ownerFields,
          createdAt: now,
          updatedAt: now,
        });
        client = (await ctx.db.get(clientId))!;
        createdClients += 1;
      }

      let project = await findProjectByCanonical(
        ctx,
        orgId,
        client._id,
        group.canonicalProject,
      );
      if (project) {
        if (resolveRowOwnerUserId(project) !== ownerUserId) {
          skippedExistingClientOwnerMismatch += group.fileIds.length;
          errors.push(
            `project_owner_mismatch:${group.groupKey}:existing=${resolveRowOwnerUserId(project)}:planned=${ownerUserId}`,
          );
          continue;
        }
      } else {
        const now = Date.now();
        const projectId = await ctx.db.insert("projects", {
          clientId: client._id,
          organizationId: orgId,
          title: group.projectDisplayTitle,
          normalizedTitle: group.canonicalProject,
          status: "active",
          ...ownerFields,
          createdAt: now,
          updatedAt: now,
        });
        project = (await ctx.db.get(projectId))!;
        createdProjects += 1;
      }

      for (const fileId of group.fileIds) {
        const row = await ctx.db.get(fileId as Id<"pipeline">);
        if (!row) continue;
        if (row.clientId && row.projectId) continue;
        await ctx.db.patch(row._id, {
          clientId: client._id,
          projectId: project._id,
        });
        linkedFiles += 1;
      }
    }

    skippedOwnerCollisions = analyze.ownerCollisionGroups.reduce(
      (n, g) => n + g.fileIds.length,
      0,
    );
  }

  const matrixAfter = await captureBackfillMatrix(ctx);
  const joshuaAfter = await captureJoshuaVisibilitySnapshot(ctx);

  const joshuaDrift =
    joshuaBefore.visibleFileIds.join(",") !==
      joshuaAfter.visibleFileIds.join(",") ||
    Object.keys(joshuaBefore.accessByFileId).some(
      (id) =>
        joshuaBefore.accessByFileId[id] !== joshuaAfter.accessByFileId[id],
    );

  if (!options.dryRun && joshuaDrift) {
    throw new Error(
      "Joshua visibility drift detected after backfill — transaction aborted.",
    );
  }

  if (
    !options.dryRun &&
    matrixBefore.resourceShareCount !== matrixAfter.resourceShareCount
  ) {
    throw new Error(
      "resourceShares count changed during backfill — transaction aborted.",
    );
  }

  if (
    !options.dryRun &&
    matrixBefore.pipelineResourceShareCount !==
      matrixAfter.pipelineResourceShareCount
  ) {
    throw new Error(
      "pipeline resourceShares count changed during backfill — transaction aborted.",
    );
  }

  return {
    dryRun: options.dryRun,
    createdClients,
    createdProjects,
    linkedFiles,
    skippedOwnerCollisions,
    skippedAlreadyLinked,
    skippedExistingClientOwnerMismatch,
    errors,
    matrixBefore,
    matrixAfter,
    joshuaBefore,
    joshuaAfter,
    analyze,
  };
}

export async function validateBackfillIntegrity(
  ctx: QueryCtx,
  organizationId: Id<"organizations">,
): Promise<{
  checks: Record<string, boolean>;
  pass: boolean;
  orphanClients: string[];
  orphanProjects: string[];
  nullFkFiles: string[];
  canonicalOrgLinked12: boolean;
}> {
  const orgFiles = await ctx.db
    .query("pipeline")
    .withIndex("by_organization_createdAt", (q) =>
      q.eq("organizationId", organizationId),
    )
    .collect();

  const clients = await ctx.db
    .query("clients")
    .withIndex("by_organization", (q) => q.eq("organizationId", organizationId))
    .collect();
  const projects = await ctx.db
    .query("projects")
    .withIndex("by_organization", (q) => q.eq("organizationId", organizationId))
    .collect();

  const nullFkFiles = orgFiles
    .filter((f) => !f.clientId || !f.projectId)
    .map((f) => String(f._id));

  const orphanProjects: string[] = [];
  for (const p of projects) {
    const client = await ctx.db.get(p.clientId);
    if (!client) orphanProjects.push(`missing_client:${p._id}`);
    const files = await loadPipelineFilesForProject(ctx, p._id);
    if (files.length === 0) orphanProjects.push(`no_files:${p._id}`);
  }

  const orphanClients: string[] = [];
  for (const c of clients) {
    const projs = await ctx.db
      .query("projects")
      .withIndex("by_client", (q) => q.eq("clientId", c._id))
      .collect();
    if (projs.length === 0) orphanClients.push(String(c._id));
  }

  let rollupOk = true;
  for (const c of clients) {
    const rollup = await computeClientRollup(ctx, c._id, c);
    if (rollup.loanCount < 1) rollupOk = false;
  }
  for (const p of projects) {
    const rollup = await computeProjectRollup(ctx, p._id, p);
    if (rollup.loanCount < 1) rollupOk = false;
  }

  const checks = {
    canonicalOrgFiles12: orgFiles.length === 12,
    allOrgFilesLinked: nullFkFiles.length === 0,
    clients12Projects12:
      clients.length === 12 && projects.length === 12,
    zeroOrphanClients: orphanClients.length === 0,
    zeroOrphanProjects: orphanProjects.length === 0,
    rollupsHaveLoans: rollupOk,
  };

  return {
    checks,
    pass: Object.values(checks).every(Boolean),
    orphanClients,
    orphanProjects,
    nullFkFiles,
    canonicalOrgLinked12: nullFkFiles.length === 0 && orgFiles.length === 12,
  };
}
