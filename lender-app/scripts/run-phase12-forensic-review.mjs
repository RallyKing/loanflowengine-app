#!/usr/bin/env node
/**
 * Phase 12.2 Step 3 — read-only forensic data collection (production).
 */
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const reportsDir = join(root, "..", "migration-reports");
mkdirSync(reportsDir, { recursive: true });

const JOSHUA_ORG = "mx76bxqnc23q76cb99tvrffmy58644pf";
const DUP_ORG = "mx77ssc8sjpgwapfehx8yhz5kd86epd3";
const E2E_ORG = "mx7bfa58ty1svx65bt3h8v6v5186kke9";
const JOSHUA_USER = "ts719yfyv2b6020avvctpw0ns586exm6";
const EBALLARD_USER = "ts7d3keadq48gay3pa8k6gdwx9878p33";

function loadSecret() {
  const raw = readFileSync(join(root, ".env.local"), "utf8");
  const m = raw.match(/^DATA_MIGRATION_ADMIN_SECRET=(.+)$/m);
  if (!m) throw new Error("DATA_MIGRATION_ADMIN_SECRET missing");
  return m[1].trim();
}

const convexBin = join(root, "node_modules", "convex", "bin", "main.js");

function convexInline(queryBody, label) {
  const wrapped = `export default query({ handler: async (ctx) => { ${queryBody} } });`;
  const result = spawnSync(
    process.execPath,
    [convexBin, "run", "--prod", "--inline-query", wrapped],
    { cwd: root, encoding: "utf8", maxBuffer: 50 * 1024 * 1024 },
  );
  if (result.status !== 0) {
    console.error(`FAILED ${label}:`, result.stderr || result.stdout);
    process.exit(1);
  }
  const text = (result.stdout || "").trim();
  const start = text.indexOf("{") >= 0 ? text.indexOf("{") : text.indexOf("[");
  return JSON.parse(text.slice(start));
}

function convexRun(fn, args, label) {
  const result = spawnSync(
    process.execPath,
    [convexBin, "run", "--prod", fn, JSON.stringify(args)],
    { cwd: root, encoding: "utf8", maxBuffer: 50 * 1024 * 1024 },
  );
  if (result.status !== 0) {
    console.error(`FAILED ${label}:`, result.stderr || result.stdout);
    process.exit(1);
  }
  const text = (result.stdout || "").trim();
  const start = text.indexOf("{") >= 0 ? text.indexOf("{") : text.indexOf("[");
  return JSON.parse(text.slice(start));
}

function orgBundle(orgId) {
  return convexInline(`
    const orgId = "${orgId}";
    const org = await ctx.db.get(orgId);
    if (!org) return { orgId, missing: true };
    const members = (await ctx.db.query("organizationMembers").withIndex("by_organization", q => q.eq("organizationId", orgId)).collect());
    const tasks = (await ctx.db.query("tasks").withIndex("by_organization", q => q.eq("organizationId", orgId)).collect());
    const pipeline = (await ctx.db.query("pipeline").withIndex("by_organization_createdAt", q => q.eq("organizationId", orgId)).collect());
    const activity = (await ctx.db.query("activityFeed").withIndex("by_scope_at", q => q.eq("scopeKind", "org").eq("scopeId", orgId)).collect());
    const stages = (await ctx.db.query("organizationPipelineStages").withIndex("by_organization", q => q.eq("organizationId", orgId)).collect());
    const substages = [];
    for (const s of stages) {
      const subs = await ctx.db.query("organizationPipelineSubStages").withIndex("by_parent", q => q.eq("parentStageId", s._id)).collect();
      substages.push(...subs);
    }
    const savedViews = (await ctx.db.query("savedFilterPresets").withIndex("by_organization", q => q.eq("organizationId", orgId)).collect());
    const roles = (await ctx.db.query("organizationRoles").withIndex("by_organization", q => q.eq("organizationId", orgId)).collect());
    const permissions = (await ctx.db.query("organizationPermissions").withIndex("by_organization", q => q.eq("organizationId", orgId)).collect());
    const navPolicy = (await ctx.db.query("organizationNavigationPolicy").withIndex("by_organization", q => q.eq("organizationId", orgId)).collect());
    const customDomains = (await ctx.db.query("organizationCustomDomains").withIndex("by_organization", q => q.eq("organizationId", orgId)).collect());
  const lenders = (await ctx.db.query("lenders").withIndex("by_organization", q => q.eq("organizationId", orgId)).collect());
  const contacts = (await ctx.db.query("contacts").withIndex("by_organization_updatedAt", q => q.eq("organizationId", orgId)).collect());
    return {
      orgId,
      org,
      counts: {
        members: members.length,
        tasks: tasks.length,
        pipelineFiles: pipeline.length,
        activityOrgScoped: activity.length,
        stages: stages.length,
        substages: substages.length,
        savedViews: savedViews.length,
        roles: roles.length,
        permissions: permissions.length,
        navPolicy: navPolicy.length,
        customDomains: customDomains.length,
        lenders: lenders.length,
        contacts: contacts.length,
      },
      members,
      taskIds: tasks.map(t => t._id),
      taskTitles: tasks.map(t => ({ id: t._id, title: t.title, assigneeId: t.assigneeId, ownerUserKey: t.ownerUserKey })),
      pipelineIds: pipeline.map(p => p._id),
      pipelineNames: pipeline.map(p => ({ id: p._id, name: p.name, ownerUserKey: p.ownerUserKey })),
      stages: stages.map(s => ({ id: s._id, name: s.name, slug: s.slug, order: s.order, isArchived: s.isArchived })),
      substages: substages.map(s => ({ id: s._id, parentStageId: s.parentStageId, name: s.name, slug: s.slug, order: s.order })),
      savedViews: savedViews.map(v => ({ id: v._id, name: v.name })),
      roles: roles.map(r => ({ id: r._id, key: r.key, label: r.label, isSystem: r.isSystem })),
      permissions,
      navPolicy,
      customDomains,
    };
  `, `org-${orgId}`);
}

console.log("Collecting org bundles...");
const joshuaOrg = orgBundle(JOSHUA_ORG);
const dupOrg = orgBundle(DUP_ORG);
const e2eOrg = orgBundle(E2E_ORG);

console.log("Collecting auth users and E2E linkage...");
const authBundle = convexInline(`
  const authUsers = await ctx.db.query("authUsers").collect();
  const authSessions = await ctx.db.query("authSessions").collect();
  const now = Date.now();
  const members = await ctx.db.query("organizationMembers").collect();
  return { authUsers, authSessions, members, now };
`, "auth-bundle");

console.log("Collecting joshuaeballard forensic...");
const eballardForensic = convexInline(`
  const userId = "${EBALLARD_USER}";
  const user = await ctx.db.get(userId);
  if (!user) return { missing: true };
  const now = Date.now();
  const sessions = (await ctx.db.query("authSessions").withIndex("by_user", q => q.eq("userId", userId)).collect());
  const activeSessions = sessions.filter(s => !s.revokedAtMs && s.absoluteExpiresAtMs >= now);
  const memberships = (await ctx.db.query("organizationMembers").withIndex("by_user_org", q => q.eq("userKey", userId)).collect());
  const membershipsByUsername = (await ctx.db.query("organizationMembers").withIndex("by_user_org", q => q.eq("userKey", user.displayUsername)).collect());
  const allMemberships = [...memberships, ...membershipsByUsername];
  const userPrefs = (await ctx.db.query("userPreferences").withIndex("by_accountId", q => q.eq("accountId", userId)).collect());
  const navConfig = (await ctx.db.query("navigationUserConfig").withIndex("by_accountId", q => q.eq("accountId", userId)).collect());
  const onboarding = (await ctx.db.query("userOnboarding").withIndex("by_userKey", q => q.eq("userKey", userId)).collect());
  const workflows = (await ctx.db.query("userSimpleWorkflows").withIndex("by_accountId", q => q.eq("accountId", userId)).collect());
  const templates = (await ctx.db.query("pipelineFileUserTemplates").withIndex("by_accountId", q => q.eq("accountId", userId)).collect());
  const loginAudit = (await ctx.db.query("authLoginAudit").withIndex("by_audit_user", q => q.eq("userId", userId)).collect());
  const tasksOwned = (await ctx.db.query("tasks").collect()).filter(t => t.assigneeId === userId || t.assigneeId === user.displayUsername || t.ownerUserKey === userId || t.ownerUserKey === user.displayUsername);
  const pipelineOwned = (await ctx.db.query("pipeline").collect()).filter(p => p.ownerUserKey === userId || p.ownerUserKey === user.displayUsername || (p.assigneeId === userId) || (p.assigneeId === user.displayUsername));
  const activityAsActor = (await ctx.db.query("activityFeed").collect()).filter(a => a.actorKey === userId || a.actorKey === user.displayUsername);
  return {
    user,
    activeSessionCount: activeSessions.length,
    totalSessionCount: sessions.length,
    sessions: sessions.map(s => ({ id: s._id, createdAt: s.createdAt, lastSeenAt: s.lastSeenAt, absoluteExpiresAtMs: s.absoluteExpiresAtMs, revokedAtMs: s.revokedAtMs })),
    memberships: allMemberships,
    userPrefs,
    navConfig,
    onboarding,
    workflows,
    templates,
    loginAudit: loginAudit.sort((a,b) => b.at - a.at).slice(0, 20),
    lastLoginAt: loginAudit.length ? Math.max(...loginAudit.map(l => l.at)) : null,
    tasksOwned: tasksOwned.map(t => ({ id: t._id, title: t.title, organizationId: t.organizationId, assigneeId: t.assigneeId, ownerUserKey: t.ownerUserKey })),
    pipelineOwned: pipelineOwned.map(p => ({ id: p._id, name: p.name, organizationId: p.organizationId, ownerUserKey: p.ownerUserKey })),
    activityAsActorCount: activityAsActor.length,
    recentActivity: activityAsActor.sort((a,b) => b.at - a.at).slice(0, 10).map(a => ({ at: a.at, kind: a.kind, summary: a.summary })),
  };
`, "eballard-forensic");

console.log("Running auditTenantIsolation...");
let auditSnapshot = null;
try {
  auditSnapshot = convexRun(
    "operator/auditTenantIsolation:auditTenantIsolation",
    { adminSecret: loadSecret() },
    "audit",
  );
} catch {
  auditSnapshot = null;
}

function compareOrgs(canonical, duplicate) {
  const fields = [
    "name", "plan", "planSource", "slug", "demoWorkspaceBundleId",
    "clerkOrganizationId", "stripeCustomerId", "stripeSubscriptionId",
  ];
  const orgFieldDiff = {};
  for (const f of fields) {
    const a = canonical.org?.[f] ?? null;
    const b = duplicate.org?.[f] ?? null;
    orgFieldDiff[f] = { canonical: a, duplicate: b, same: JSON.stringify(a) === JSON.stringify(b) };
  }
  const countDiff = {};
  for (const k of Object.keys(canonical.counts)) {
    countDiff[k] = { canonical: canonical.counts[k], duplicate: duplicate.counts[k] };
  }
  return { orgFieldDiff, countDiff };
}

const report = {
  generatedAt: Date.now(),
  deployment: "basic-anaconda-984.convex.cloud",
  duplicateDlcComparison: compareOrgs(joshuaOrg, dupOrg),
  joshuaOrg,
  duplicateDlcOrg: dupOrg,
  e2ePrimaryOrg: e2eOrg,
  eballardForensic,
  authBundle: {
    authUsers: authBundle.authUsers.map((u) => ({
      id: u._id,
      displayUsername: u.displayUsername,
      email: u.email ?? null,
      defaultOrganizationId: u.defaultOrganizationId ?? null,
      systemRole: u.systemRole ?? null,
      createdAt: u.createdAt,
      updatedAt: u.updatedAt,
    })),
    members: authBundle.members,
  },
  e2eAuthUserLinkage: authBundle.authUsers
    .map((u) => {
      const ms = authBundle.members.filter(
        (m) =>
          m.organizationId === E2E_ORG &&
          (m.userKey === u._id || m.userKey === u.displayUsername),
      );
      return ms.length
        ? { userId: u._id, username: u.displayUsername, e2eMemberships: ms }
        : null;
    })
    .filter(Boolean),
  auditSnapshot,
};

const outPath = join(reportsDir, "phase12-step3-forensic-raw.json");
writeFileSync(outPath, JSON.stringify(report, null, 2) + "\n");
console.log(`Wrote ${outPath}`);
