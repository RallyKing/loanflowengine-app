/**
 * Compile Phase 12.2 tenant audit from read-only inline query dumps.
 * Input: migration-reports/audit-*.json (from npx convex run --prod --inline-query)
 * Output: migration-reports/tenant-audit-raw.json
 */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const reportDir = join(root, "migration-reports");

function parseConvexDump(path) {
  const raw = readFileSync(path, "utf8");
  const lines = raw.split(/\r?\n/);
  const startIdx = lines.findIndex((l) => /^\s*[\[{]/.test(l));
  if (startIdx < 0) throw new Error(`No JSON in ${path}`);
  const jsonText = lines.slice(startIdx).join("\n");
  return JSON.parse(jsonText);
}

const authUsers = parseConvexDump(join(reportDir, "audit-authUsers.json"));
const authSessions = parseConvexDump(join(reportDir, "audit-sessions.json"));
const orgs = parseConvexDump(join(reportDir, "audit-orgs.json"));
const members = parseConvexDump(join(reportDir, "audit-members.json"));
const pipeline = parseConvexDump(join(reportDir, "audit-pipeline.json"));
const tasks = parseConvexDump(join(reportDir, "audit-tasks.json"));
const activityFeed = parseConvexDump(join(reportDir, "audit-activity.json"));
const pipelineFileActivity = parseConvexDump(join(reportDir, "audit-pfa.json"));

const now = Date.now();
const JOSHUA_ORG = "mx76bxqnc23q76cb99tvrffmy58644pf";
const JOSHUA_EMAIL = "joshua@directlendingconnection.com";

function nfkc(s) {
  try {
    return String(s || "").normalize("NFKC").trim().toLowerCase();
  } catch {
    return String(s || "").trim().toLowerCase();
  }
}

const orgIds = new Set(orgs.map((o) => o._id));
const authUserIds = new Set(authUsers.map((u) => u._id));
const pipelineIds = new Set(pipeline.map((p) => p._id));

const activeByUser = {};
for (const s of authSessions) {
  if (s.revokedAtMs || s.absoluteExpiresAtMs < now) continue;
  const u = String(s.userId);
  activeByUser[u] = (activeByUser[u] || 0) + 1;
}

const authUserRows = authUsers.map((u) => ({
  userId: u._id,
  username: u.displayUsername,
  normalizedUsername: u.normalizedUsername,
  email: u.email ?? null,
  normalizedEmail: nfkc(u.email),
  defaultOrganizationId: u.defaultOrganizationId ?? null,
  globalRole:
    u.systemRole === "SUPER_ADMIN"
      ? "SUPER_ADMIN"
      : u.isGlobalAdmin
        ? "GLOBAL_ADMIN"
        : "standard",
  credentialVersion: u.credentialVersion,
  activeSessionCount: activeByUser[String(u._id)] || 0,
  createdAt: u.createdAt,
  updatedAt: u.updatedAt,
}));

const ub = {};
const eb = {};
for (const u of authUsers) {
  const un = nfkc(u.normalizedUsername);
  if (un) {
    (ub[un] = ub[un] || []).push(String(u._id));
  }
  const em = nfkc(u.email);
  if (em) {
    (eb[em] = eb[em] || []).push(String(u._id));
  }
}

const mb = {};
const own = {};
const tb = {};
const pb = {};
const ab = {};
for (const m of members) {
  const o = String(m.organizationId);
  mb[o] = (mb[o] || 0) + 1;
  if (m.role === "owner") {
    (own[o] = own[o] || []).push({ userKey: m.userKey, memberId: m._id, role: m.role });
  }
}
for (const t of tasks) {
  const o = t.organizationId ? String(t.organizationId) : "__none__";
  tb[o] = (tb[o] || 0) + 1;
}
for (const p of pipeline) {
  const o = p.organizationId ? String(p.organizationId) : "__none__";
  pb[o] = (pb[o] || 0) + 1;
}
for (const a of activityFeed) {
  const o = a.organizationId ? String(a.organizationId) : "__none__";
  ab[o] = (ab[o] || 0) + 1;
}

function classifyOrg(row) {
  const oid = String(row.orgId);
  if (oid === JOSHUA_ORG) return "A";
  const name = row.name ?? "";
  if (/^E2E/i.test(name) || /\btest\b/i.test(name)) {
    if (
      row.pipelineFileCount === 0 &&
      row.taskCount === 0 &&
      row.activityCount === 0 &&
      row.memberCount <= 2
    )
      return "B";
    return "C";
  }
  if (/^[a-zA-Z0-9]{20,}$/.test(name) && row.pipelineFileCount === 0 && row.taskCount === 0)
    return "B";
  if (row.demoWorkspaceBundleId) return "C";
  if (row.pipelineFileCount > 0 || row.taskCount > 0) return "C";
  return "C";
}

function classifyUser(u) {
  if (nfkc(u.email) === nfkc(JOSHUA_EMAIL)) return "A";
  if (/^e2e/i.test(u.username ?? "") || /e2e/i.test(u.email ?? "")) return "B";
  return "C";
}

const organizationRows = orgs.map((o) => {
  const id = String(o._id);
  const row = {
    orgId: o._id,
    name: o.name,
    slug: o.slug ?? null,
    demoWorkspaceBundleId: o.demoWorkspaceBundleId ?? null,
    clerkOrganizationId: o.clerkOrganizationId ?? null,
    owners: own[id] || [],
    memberCount: mb[id] || 0,
    taskCount: tb[id] || 0,
    pipelineFileCount: pb[id] || 0,
    activityCount: ab[id] || 0,
    createdAt: o.createdAt,
    updatedAt: o.updatedAt,
  };
  return { ...row, classification: classifyOrg(row) };
});

const crossTenantLeaks = [];
for (const p of pipeline) {
  if (p.organizationId && !orgIds.has(p.organizationId)) {
    crossTenantLeaks.push({
      table: "pipeline",
      docId: p._id,
      kind: "dangling_organizationId",
      organizationId: String(p.organizationId),
    });
  }
  if (!p.organizationId) {
    crossTenantLeaks.push({ table: "pipeline", docId: p._id, kind: "missing_organizationId" });
  }
}
for (const t of tasks) {
  if (t.organizationId && !orgIds.has(t.organizationId)) {
    crossTenantLeaks.push({
      table: "tasks",
      docId: t._id,
      kind: "dangling_organizationId",
      organizationId: String(t.organizationId),
    });
  }
  if (!t.organizationId) {
    crossTenantLeaks.push({ table: "tasks", docId: t._id, kind: "missing_organizationId" });
  }
}
for (const a of activityFeed) {
  if (a.organizationId && !orgIds.has(a.organizationId)) {
    crossTenantLeaks.push({
      table: "activityFeed",
      docId: a._id,
      kind: "dangling_organizationId",
      organizationId: String(a.organizationId),
    });
  }
}
for (const m of members) {
  if (!orgIds.has(m.organizationId)) {
    crossTenantLeaks.push({
      table: "organizationMembers",
      docId: m._id,
      kind: "orphan_member_org_missing",
      organizationId: String(m.organizationId),
    });
  }
  if (!authUserIds.has(m.userKey)) {
    crossTenantLeaks.push({
      table: "organizationMembers",
      docId: m._id,
      kind: "member_userKey_not_authUser",
      userKey: m.userKey,
    });
  }
}
for (const s of authSessions) {
  if (!authUserIds.has(s.userId)) {
    crossTenantLeaks.push({
      table: "authSessions",
      docId: s._id,
      kind: "orphan_session_user",
      userId: String(s.userId),
    });
  }
}

const orphans = {
  pipelineWithoutOrg: pipeline.filter((p) => !p.organizationId).map((p) => p._id),
  tasksWithoutOrg: tasks.filter((t) => !t.organizationId).map((t) => t._id),
  membersWithMissingOrg: members.filter((m) => !orgIds.has(m.organizationId)).map((m) => m._id),
  sessionsWithMissingUser: authSessions
    .filter((s) => !authUserIds.has(s.userId))
    .map((s) => s._id),
  usersWithoutMembership: authUsers
    .filter((u) => !members.some((m) => m.userKey === String(u._id)))
    .map((u) => u._id),
  pipelineFileActivityOrphans: pipelineFileActivity
    .filter((r) => !pipelineIds.has(r.fileId))
    .map((r) => r._id),
};

const report = {
  generatedAt: now,
  deployment: "basic-anaconda-984.convex.cloud",
  joshuaOrgId: JOSHUA_ORG,
  integrityAuditSnapshot: JSON.parse(
    readFileSync(join(reportDir, "integrity-audit-latest.json"), "utf8"),
  ),
  rawCounts: {
    authUsers: authUsers.length,
    authSessions: authSessions.length,
    activeSessions: Object.values(activeByUser).reduce((a, b) => a + b, 0),
    staleSessions: authSessions.filter((s) => s.absoluteExpiresAtMs < now).length,
    organizations: orgs.length,
    organizationMembers: members.length,
    pipelineFiles: pipeline.length,
    tasks: tasks.length,
    activityFeed: activityFeed.length,
    pipelineFileActivity: pipelineFileActivity.length,
  },
  authUsers: authUserRows.map((u) => ({ ...u, classification: classifyUser(u) })),
  collisions: {
    username: Object.entries(ub)
      .filter(([, a]) => a.length > 1)
      .map(([normalized, userIds]) => ({ normalized, userIds })),
    email: Object.entries(eb)
      .filter(([, a]) => a.length > 1)
      .map(([normalized, userIds]) => ({ normalized, userIds })),
  },
  organizations: organizationRows,
  crossTenantLeaks,
  orphans,
  classifications: {
    A: {
      orgs: organizationRows.filter((o) => o.classification === "A").map((o) => o.orgId),
      users: authUserRows.filter((u) => classifyUser(u) === "A").map((u) => u.userId),
    },
    B: {
      orgs: organizationRows.filter((o) => o.classification === "B").map((o) => o.orgId),
      users: authUserRows.filter((u) => classifyUser(u) === "B").map((u) => u.userId),
    },
    C: {
      orgs: organizationRows.filter((o) => o.classification === "C").map((o) => o.orgId),
      users: authUserRows.filter((u) => classifyUser(u) === "C").map((u) => u.userId),
    },
  },
};

writeFileSync(join(reportDir, "tenant-audit-raw.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ ok: true, wrote: "migration-reports/tenant-audit-raw.json" }));
