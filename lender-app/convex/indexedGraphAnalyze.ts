/**
 * Phase 15 Step 2 — read-only backfill analyze (no writes).
 */
import type { Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import {
  computeClientStickinessKey,
  computeReferralPartnerStickinessKey,
  stickinessKeyString,
} from "../lib/indexedGraphStickiness";
import { normalizeEmailKey } from "../lib/crmRelationship";
import {
  primaryContactEmail,
  primaryContactPhone,
} from "../lib/contact/contactMethods";

export type GraphEdgeTable =
  | "fileClients"
  | "fileProjects"
  | "fileLenders"
  | "fileReferralPartners"
  | "fileTeamMembers"
  | "fileTasks"
  | "projectLenders"
  | "projectReferralPartners"
  | "projectTeamMembers"
  | "projectTasks";

export type EdgeBackfillEstimate = {
  table: GraphEdgeTable;
  existingJunctionRows: number;
  implicitRelationships: number;
  missingJunctionRows: number;
  estimatedInserts: number;
  duplicatePairCollisions: number;
};

export type GraphAnalyzeResult = {
  scannedAt: number;
  organizationId: string | null;
  global: {
    pipelineFiles: number;
    projects: number;
    clients: number;
    contacts: number;
    tasks: number;
    lendersOnFiles: number;
  };
  edgeEstimates: EdgeBackfillEstimate[];
  totalEstimatedInserts: number;
  clientStickinessCollisions: Array<{
    stickinessKey: string;
    clientIds: string[];
  }>;
  referralStickinessCollisions: Array<{
    stickinessKey: string;
    contactIds: string[];
  }>;
  normalizationConflicts: string[];
  dedupeRiskScore: number;
  compatibilityNotes: string[];
};

function pairDupCount<T>(
  rows: T[],
  keyFn: (r: T) => string,
): number {
  return rows.length - new Set(rows.map(keyFn)).size;
}

export async function analyzeIndexedGraphFoundation(
  ctx: QueryCtx,
  organizationId: Id<"organizations"> | null,
): Promise<GraphAnalyzeResult> {
  const orgFilter = (org: Id<"organizations"> | undefined) =>
    organizationId == null || org === organizationId;

  const allFiles = await ctx.db.query("pipeline").collect();
  const files = allFiles.filter((f) => orgFilter(f.organizationId));

  const allProjects = await ctx.db.query("projects").collect();
  const projects = allProjects.filter((p) => orgFilter(p.organizationId));

  const allClients = await ctx.db.query("clients").collect();
  const clients = allClients.filter((c) => orgFilter(c.organizationId));

  const allContacts = await ctx.db.query("contacts").collect();
  const contacts = allContacts.filter((c) => orgFilter(c.organizationId));

  const allTasks = await ctx.db.query("tasks").collect();
  const tasks = allTasks.filter((t) => orgFilter(t.organizationId));

  const loanClients = (await ctx.db.query("loanClients").collect()).filter((r) =>
    orgFilter(r.organizationId),
  );
  const fileClients = (await ctx.db.query("fileClients").collect()).filter((r) =>
    orgFilter(r.organizationId),
  );
  const fileProjects = (await ctx.db.query("fileProjects").collect()).filter((r) =>
    orgFilter(r.organizationId),
  );
  const fileLenders = (await ctx.db.query("fileLenders").collect()).filter((r) =>
    orgFilter(r.organizationId),
  );
  const fileReferrals = (
    await ctx.db.query("fileReferralPartners").collect()
  ).filter((r) => orgFilter(r.organizationId));
  const fileTeam = (await ctx.db.query("fileTeamMembers").collect()).filter((r) =>
    orgFilter(r.organizationId),
  );
  const fileTasks = (await ctx.db.query("fileTasks").collect()).filter((r) =>
    orgFilter(r.organizationId),
  );
  const projectLenders = (
    await ctx.db.query("projectLenders").collect()
  ).filter((r) => orgFilter(r.organizationId));
  const projectReferrals = (
    await ctx.db.query("projectReferralPartners").collect()
  ).filter((r) => orgFilter(r.organizationId));
  const projectTeam = (
    await ctx.db.query("projectTeamMembers").collect()
  ).filter((r) => orgFilter(r.organizationId));
  const projectTasks = (await ctx.db.query("projectTasks").collect()).filter(
    (r) => orgFilter(r.organizationId),
  );

  const contactFileLinks = await ctx.db.query("contactFileLinks").collect();
  const fileIdSet = new Set(files.map((f) => String(f._id)));
  const referralCrmLinks = contactFileLinks.filter((l) => {
    if (!fileIdSet.has(String(l.fileId))) return false;
    return l.contactRoleId === "referral_partner";
  });

  let implicitFileClient = 0;
  let implicitFileProject = 0;
  let implicitFileLender = 0;
  let implicitFileTeam = 0;
  let implicitFileTask = 0;

  const fileClientPairs = new Set(
    [
      ...loanClients.map((l) => `${l.pipelineId}:${l.clientId}`),
      ...fileClients.map((l) => `${l.fileId}:${l.clientId}`),
    ],
  );

  for (const f of files) {
    if (f.clientId) {
      implicitFileClient += 1;
      const key = `${f._id}:${f.clientId}`;
      if (!fileClientPairs.has(key)) {
        /* missing junction mirror */
      }
    }
    if (f.projectId) {
      implicitFileProject += 1;
    }
    implicitFileLender += (f.lenders ?? []).length;
    if (f.assigneeId?.trim()) implicitFileTeam += 1;
    implicitFileTeam += (f.sharedWithIds ?? []).length;
  }

  for (const t of tasks) {
    if (t.relatedFileId && fileIdSet.has(String(t.relatedFileId))) {
      implicitFileTask += 1;
    }
  }

  const missingFileClients = files.filter((f) => {
    if (!f.clientId) return false;
    return !fileClientPairs.has(`${f._id}:${f.clientId}`);
  }).length;

  const fileProjectPairs = new Set(
    fileProjects.map((l) => `${l.fileId}:${l.projectId}`),
  );
  const missingFileProjects = files.filter((f) => {
    if (!f.projectId) return false;
    return !fileProjectPairs.has(`${f._id}:${f.projectId}`);
  }).length;

  const fileLenderPairs = new Set(
    fileLenders.map((l) => `${l.fileId}:${l.lenderId}`),
  );
  let missingFileLenders = 0;
  for (const f of files) {
    for (const lid of f.lenders ?? []) {
      if (!fileLenderPairs.has(`${f._id}:${lid}`)) missingFileLenders += 1;
    }
  }

  const fileReferralPairs = new Set(
    fileReferrals.map((l) => `${l.fileId}:${l.contactId}`),
  );
  const missingFileReferrals = referralCrmLinks.filter(
    (l) => !fileReferralPairs.has(`${l.fileId}:${l.contactId}`),
  ).length;

  const fileTeamPairs = new Set(
    fileTeam.map((l) => `${l.fileId}:${l.userKey}`),
  );
  let missingFileTeam = 0;
  for (const f of files) {
    if (f.assigneeId?.trim()) {
      const k = `${f._id}:${f.assigneeId.trim()}`;
      if (!fileTeamPairs.has(k)) missingFileTeam += 1;
    }
    for (const uid of f.sharedWithIds ?? []) {
      const t = uid.trim();
      if (!t) continue;
      const k = `${f._id}:${t}`;
      if (!fileTeamPairs.has(k)) missingFileTeam += 1;
    }
  }

  const fileTaskPairs = new Set(
    fileTasks.map((l) => `${l.fileId}:${l.taskId}`),
  );
  const missingFileTasks = tasks.filter(
    (t) =>
      t.relatedFileId &&
      fileIdSet.has(String(t.relatedFileId)) &&
      !fileTaskPairs.has(`${t.relatedFileId}:${t._id}`),
  ).length;

  const edgeEstimates: EdgeBackfillEstimate[] = [
    {
      table: "fileClients",
      existingJunctionRows: loanClients.length + fileClients.length,
      implicitRelationships: implicitFileClient,
      missingJunctionRows: missingFileClients,
      estimatedInserts:
        missingFileClients +
        Math.max(0, loanClients.length - fileClients.length),
      duplicatePairCollisions:
        pairDupCount(loanClients, (l) => `${l.pipelineId}:${l.clientId}`) +
        pairDupCount(fileClients, (l) => `${l.fileId}:${l.clientId}`),
    },
    {
      table: "fileProjects",
      existingJunctionRows: fileProjects.length,
      implicitRelationships: implicitFileProject,
      missingJunctionRows: missingFileProjects,
      estimatedInserts: missingFileProjects,
      duplicatePairCollisions: pairDupCount(
        fileProjects,
        (l) => `${l.fileId}:${l.projectId}`,
      ),
    },
    {
      table: "fileLenders",
      existingJunctionRows: fileLenders.length,
      implicitRelationships: implicitFileLender,
      missingJunctionRows: missingFileLenders,
      estimatedInserts: missingFileLenders,
      duplicatePairCollisions: pairDupCount(
        fileLenders,
        (l) => `${l.fileId}:${l.lenderId}`,
      ),
    },
    {
      table: "fileReferralPartners",
      existingJunctionRows: fileReferrals.length,
      implicitRelationships: referralCrmLinks.length,
      missingJunctionRows: missingFileReferrals,
      estimatedInserts: missingFileReferrals,
      duplicatePairCollisions: pairDupCount(
        fileReferrals,
        (l) => `${l.fileId}:${l.contactId}`,
      ),
    },
    {
      table: "fileTeamMembers",
      existingJunctionRows: fileTeam.length,
      implicitRelationships: implicitFileTeam,
      missingJunctionRows: missingFileTeam,
      estimatedInserts: missingFileTeam,
      duplicatePairCollisions: pairDupCount(
        fileTeam,
        (l) => `${l.fileId}:${l.userKey}`,
      ),
    },
    {
      table: "fileTasks",
      existingJunctionRows: fileTasks.length,
      implicitRelationships: implicitFileTask,
      missingJunctionRows: missingFileTasks,
      estimatedInserts: missingFileTasks,
      duplicatePairCollisions: pairDupCount(
        fileTasks,
        (l) => `${l.fileId}:${l.taskId}`,
      ),
    },
    {
      table: "projectLenders",
      existingJunctionRows: projectLenders.length,
      implicitRelationships: 0,
      missingJunctionRows: 0,
      estimatedInserts: 0,
      duplicatePairCollisions: pairDupCount(
        projectLenders,
        (l) => `${l.projectId}:${l.lenderId}`,
      ),
    },
    {
      table: "projectReferralPartners",
      existingJunctionRows: projectReferrals.length,
      implicitRelationships: 0,
      missingJunctionRows: 0,
      estimatedInserts: 0,
      duplicatePairCollisions: pairDupCount(
        projectReferrals,
        (l) => `${l.projectId}:${l.contactId}`,
      ),
    },
    {
      table: "projectTeamMembers",
      existingJunctionRows: projectTeam.length,
      implicitRelationships: 0,
      missingJunctionRows: 0,
      estimatedInserts: 0,
      duplicatePairCollisions: pairDupCount(
        projectTeam,
        (l) => `${l.projectId}:${l.userKey}`,
      ),
    },
    {
      table: "projectTasks",
      existingJunctionRows: projectTasks.length,
      implicitRelationships: 0,
      missingJunctionRows: 0,
      estimatedInserts: 0,
      duplicatePairCollisions: pairDupCount(
        projectTasks,
        (l) => `${l.projectId}:${l.taskId}`,
      ),
    },
  ];

  const clientKeyMap = new Map<string, string[]>();
  for (const c of clients) {
    const key = stickinessKeyString(
      computeClientStickinessKey({
        displayName: c.displayName,
        primaryContactEmail: c.primaryContactEmail,
        primaryContactPhone: c.primaryContactPhone,
      }),
    );
    const list = clientKeyMap.get(key) ?? [];
    list.push(String(c._id));
    clientKeyMap.set(key, list);
  }
  const clientStickinessCollisions = [...clientKeyMap.entries()]
    .filter(([, ids]) => ids.length > 1)
    .map(([stickinessKey, clientIds]) => ({ stickinessKey, clientIds }));

  const referralContacts = contacts.filter((c) =>
    c.contactRoleId === "referral_partner",
  );
  const referralKeyMap = new Map<string, string[]>();
  for (const c of referralContacts) {
    const key = stickinessKeyString(
      computeReferralPartnerStickinessKey({
        name: c.name,
        email: primaryContactEmail(c),
        phone: primaryContactPhone(c),
      }),
    );
    const list = referralKeyMap.get(key) ?? [];
    list.push(String(c._id));
    referralKeyMap.set(key, list);
  }
  const referralStickinessCollisions = [...referralKeyMap.entries()]
    .filter(([, ids]) => ids.length > 1)
    .map(([stickinessKey, contactIds]) => ({ stickinessKey, contactIds }));

  const normalizationConflicts: string[] = [];
  for (const c of clients) {
    const email = normalizeEmailKey(c.primaryContactEmail ?? "");
    const nameKey = computeClientStickinessKey({
      displayName: c.displayName,
      primaryContactEmail: c.primaryContactEmail,
      primaryContactPhone: c.primaryContactPhone,
    });
    if (
      email &&
      nameKey.kind === "name" &&
      c.normalizedName &&
      c.normalizedName !== nameKey.key
    ) {
      normalizationConflicts.push(
        `client:${c._id}:normalizedName_vs_stickiness`,
      );
    }
  }

  const totalEstimatedInserts = edgeEstimates.reduce(
    (s, e) => s + e.estimatedInserts,
    0,
  );

  let dedupeRiskScore = 1;
  if (clientStickinessCollisions.length > 0) dedupeRiskScore += 2;
  if (referralStickinessCollisions.length > 0) dedupeRiskScore += 1;
  if (normalizationConflicts.length > 0) dedupeRiskScore += 1;
  if (edgeEstimates.some((e) => e.duplicatePairCollisions > 0)) {
    dedupeRiskScore += 1;
  }
  dedupeRiskScore = Math.min(5, dedupeRiskScore);

  return {
    scannedAt: Date.now(),
    organizationId: organizationId ? String(organizationId) : null,
    global: {
      pipelineFiles: files.length,
      projects: projects.length,
      clients: clients.length,
      contacts: contacts.length,
      tasks: tasks.length,
      lendersOnFiles: implicitFileLender,
    },
    edgeEstimates,
    totalEstimatedInserts,
    clientStickinessCollisions: clientStickinessCollisions.slice(0, 20),
    referralStickinessCollisions: referralStickinessCollisions.slice(0, 20),
    normalizationConflicts: normalizationConflicts.slice(0, 20),
    dedupeRiskScore,
    compatibilityNotes: [
      "Dual-read: loanClients + fileClients + pipeline.clientId FK",
      "Dual-read: fileProjects + pipeline.projectId FK",
      "Dual-read: fileLenders + pipeline.lenders[]",
      "Dual-read: fileReferralPartners + contactFileLinks (referral)",
      "Dual-read: fileTeamMembers + assigneeId/sharedWithIds/pipelineFileShares",
      "Dual-read: fileTasks + tasks.relatedFileId",
      "ACL unchanged: indexedGraphCompat filters via filterPipelineRowsForMember",
      "Phase 14 projectClients retained; not replaced by fileProjects",
    ],
  };
}
