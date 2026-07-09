/**
 * Phase 12.2 Step 5 — purge spam auth users, dangling org refs, empty spam org shells.
 *
 *   npx convex run operator/purgeSpamAuthStep5:purgeSpamAuthStep5 \
 *     '{"adminSecret":"…","dryRun":false}'
 */
import { v } from "convex/values";
import { mutation, type MutationCtx } from "../_generated/server";
import type { Doc, Id, TableNames } from "../_generated/dataModel";
import { assertDataMigrationAdmin } from "../migrationAdminAuth";

const JOSHUA_ORG_ID = "mx76bxqnc23q76cb99tvrffmy58644pf" as Id<"organizations">;
const E2E_PRIMARY_ORG_ID =
  "mx7bfa58ty1svx65bt3h8v6v5186kke9" as Id<"organizations">;
const PROTECTED_EMAILS = new Set([
  "joshua@directlendingconnection.com",
  "joshuaeballard@gmail.com",
]);

const FORBIDDEN_ORG_DELETE = new Set<string>([
  String(JOSHUA_ORG_ID),
  String(E2E_PRIMARY_ORG_ID),
]);

type DeleteSummary = Record<string, number>;

function nfkcLower(raw: string | undefined | null): string {
  if (!raw) return "";
  try {
    return raw.normalize("NFKC").trim().toLowerCase();
  } catch {
    return raw.trim().toLowerCase();
  }
}

function isProtectedUser(u: Doc<"authUsers">): boolean {
  const email = nfkcLower(u.email);
  const username = nfkcLower(u.displayUsername);
  const normalized = nfkcLower(u.normalizedUsername);
  for (const p of PROTECTED_EMAILS) {
    const pl = nfkcLower(p);
    if (email === pl || username === pl || normalized === pl) return true;
  }
  return false;
}

function isSpamHeuristic(u: Doc<"authUsers">): boolean {
  const username = u.displayUsername ?? "";
  const email = u.email ?? "";
  if (/^e2e/i.test(username) || /e2e/i.test(email)) return true;
  if (/^e2e-/i.test(username) || /@dlc\.test$/i.test(email)) return true;
  if (/^[a-z0-9]{15,}$/i.test(username) && !username.includes("@")) return true;
  if (/\.(test|example)$/i.test(email.split("@")[1] ?? "")) return true;
  return false;
}

async function bumpDelete(
  ctx: MutationCtx,
  dryRun: boolean,
  summary: DeleteSummary,
  table: string,
  docId: Id<TableNames>,
) {
  summary[table] = (summary[table] ?? 0) + 1;
  if (!dryRun) await ctx.db.delete(docId);
}

async function countJoshuaOrg(ctx: MutationCtx) {
  const orgId = JOSHUA_ORG_ID;
  const members = await ctx.db
    .query("organizationMembers")
    .withIndex("by_organization", (q) => q.eq("organizationId", orgId))
    .collect();
  const pipeline = await ctx.db
    .query("pipeline")
    .withIndex("by_organization_createdAt", (q) => q.eq("organizationId", orgId))
    .collect();
  const tasks = await ctx.db
    .query("tasks")
    .withIndex("by_organization", (q) => q.eq("organizationId", orgId))
    .collect();
  const activity = await ctx.db
    .query("activityFeed")
    .withIndex("by_scope_at", (q) =>
      q.eq("scopeKind", "org").eq("scopeId", String(orgId)),
    )
    .collect();
  return {
    organizationId: orgId,
    members: members.length,
    pipelineFiles: pipeline.length,
    tasks: tasks.length,
    activityOrgScoped: activity.length,
  };
}

async function snapshotCounts(ctx: MutationCtx) {
  return {
    authUsers: (await ctx.db.query("authUsers").collect()).length,
    authSessions: (await ctx.db.query("authSessions").collect()).length,
    organizations: (await ctx.db.query("organizations").collect()).length,
    organizationMembers: (await ctx.db.query("organizationMembers").collect())
      .length,
    savedFilterPresets: (await ctx.db.query("savedFilterPresets").collect())
      .length,
    joshuaOrg: await countJoshuaOrg(ctx),
  };
}

function hasValidMembership(
  u: Doc<"authUsers">,
  members: Doc<"organizationMembers">[],
  orgIds: Set<string>,
): boolean {
  const keys = new Set([String(u._id), u.displayUsername, u.normalizedUsername]);
  return members.some(
    (m) =>
      keys.has(m.userKey) &&
      orgIds.has(String(m.organizationId)) &&
      m.organizationId !== undefined,
  );
}

function hasDanglingDefaultOrg(
  u: Doc<"authUsers">,
  orgIds: Set<string>,
): boolean {
  if (!u.defaultOrganizationId) return false;
  return !orgIds.has(String(u.defaultOrganizationId));
}

function classifySpamTarget(
  u: Doc<"authUsers">,
  members: Doc<"organizationMembers">[],
  orgIds: Set<string>,
): { delete: boolean; reasons: string[] } {
  if (isProtectedUser(u)) return { delete: false, reasons: ["protected"] };
  const reasons: string[] = [];
  if (!hasValidMembership(u, members, orgIds)) {
    reasons.push("no_valid_organization_membership");
  }
  if (hasDanglingDefaultOrg(u, orgIds)) {
    reasons.push("dangling_defaultOrganizationId");
  }
  if (isSpamHeuristic(u)) {
    reasons.push("spam_heuristic");
  }
  return { delete: reasons.length > 0, reasons };
}

async function deleteAuthUserSatellites(
  ctx: MutationCtx,
  u: Doc<"authUsers">,
  dryRun: boolean,
  summary: DeleteSummary,
) {
  const uid = String(u._id);
  const keys = new Set([uid, u.displayUsername, u.normalizedUsername]);

  for (const s of await ctx.db
    .query("authSessions")
    .withIndex("by_user", (q) => q.eq("userId", u._id))
    .collect()) {
    await bumpDelete(ctx, dryRun, summary, "authSessions", s._id);
  }
  for (const t of await ctx.db
    .query("authPasswordResetTokens")
    .withIndex("by_user", (q) => q.eq("userId", u._id))
    .collect()) {
    await bumpDelete(ctx, dryRun, summary, "authPasswordResetTokens", t._id);
  }
  for (const t of await ctx.db
    .query("authEmailVerificationTokens")
    .withIndex("by_user", (q) => q.eq("userId", u._id))
    .collect()) {
    await bumpDelete(ctx, dryRun, summary, "authEmailVerificationTokens", t._id);
  }

  for (const row of await ctx.db
    .query("userPreferences")
    .withIndex("by_accountId", (q) => q.eq("accountId", uid))
    .collect()) {
    await bumpDelete(ctx, dryRun, summary, "userPreferences", row._id);
  }
  for (const row of await ctx.db
    .query("navigationUserConfig")
    .withIndex("by_accountId", (q) => q.eq("accountId", uid))
    .collect()) {
    await bumpDelete(ctx, dryRun, summary, "navigationUserConfig", row._id);
  }
  for (const row of await ctx.db
    .query("userOnboarding")
    .withIndex("by_userKey", (q) => q.eq("userKey", uid))
    .collect()) {
    await bumpDelete(ctx, dryRun, summary, "userOnboarding", row._id);
  }
  for (const row of await ctx.db
    .query("userSimpleWorkflows")
    .withIndex("by_accountId", (q) => q.eq("accountId", uid))
    .collect()) {
    await bumpDelete(ctx, dryRun, summary, "userSimpleWorkflows", row._id);
  }
  for (const row of await ctx.db
    .query("pipelineFileUserTemplates")
    .withIndex("by_accountId", (q) => q.eq("accountId", uid))
    .collect()) {
    await bumpDelete(ctx, dryRun, summary, "pipelineFileUserTemplates", row._id);
  }

  for (const m of await ctx.db.query("organizationMembers").collect()) {
    if (!keys.has(m.userKey)) continue;
    await bumpDelete(ctx, dryRun, summary, "organizationMembers", m._id);
  }

  for (const n of await ctx.db.query("taskNotifications").collect()) {
    if (!keys.has(n.userKey) && !(n.actorUserKey && keys.has(n.actorUserKey))) {
      continue;
    }
    if (keys.has(n.userKey)) {
      await bumpDelete(ctx, dryRun, summary, "taskNotifications", n._id);
    }
  }
  for (const n of await ctx.db.query("userNotifications").collect()) {
    if (!keys.has(n.userKey) && !(n.actorUserKey && keys.has(n.actorUserKey))) {
      continue;
    }
    if (keys.has(n.userKey)) {
      await bumpDelete(ctx, dryRun, summary, "userNotifications", n._id);
    }
  }

  await bumpDelete(ctx, dryRun, summary, "authUsers", u._id);
}

async function assertOrgDeletableShell(ctx: MutationCtx, orgId: Id<"organizations">) {
  if (FORBIDDEN_ORG_DELETE.has(String(orgId))) {
    throw new Error(`Forbidden org delete: ${orgId}`);
  }
  const checks = [
    {
      table: "pipeline",
      count: (
        await ctx.db
          .query("pipeline")
          .withIndex("by_organization_createdAt", (q) =>
            q.eq("organizationId", orgId),
          )
          .collect()
      ).length,
    },
    {
      table: "tasks",
      count: (
        await ctx.db
          .query("tasks")
          .withIndex("by_organization", (q) => q.eq("organizationId", orgId))
          .collect()
      ).length,
    },
  ];
  const bad = checks.filter((c) => c.count > 0);
  if (bad.length > 0) {
    throw new Error(`Org ${orgId} not empty: ${JSON.stringify(bad)}`);
  }
}

async function deleteOrgShell(
  ctx: MutationCtx,
  orgId: Id<"organizations">,
  dryRun: boolean,
  summary: DeleteSummary,
) {
  await assertOrgDeletableShell(ctx, orgId);
  const del = async (table: string, rows: { _id: Id<TableNames> }[]) => {
    for (const row of rows) {
      await bumpDelete(ctx, dryRun, summary, table, row._id);
    }
  };

  await del(
    "organizationMembers",
    await ctx.db
      .query("organizationMembers")
      .withIndex("by_organization", (q) => q.eq("organizationId", orgId))
      .collect(),
  );

  const stages = await ctx.db
    .query("organizationPipelineStages")
    .withIndex("by_organization", (q) => q.eq("organizationId", orgId))
    .collect();
  for (const stage of stages) {
    const subs = await ctx.db
      .query("organizationPipelineSubStages")
      .withIndex("by_parent", (q) => q.eq("parentStageId", stage._id))
      .collect();
    await del("organizationPipelineSubStages", subs);
  }
  await del("organizationPipelineStages", stages);

  await del(
    "organizationRoles",
    await ctx.db
      .query("organizationRoles")
      .withIndex("by_organization", (q) => q.eq("organizationId", orgId))
      .collect(),
  );
  await del(
    "organizationPermissions",
    await ctx.db
      .query("organizationPermissions")
      .withIndex("by_organization", (q) => q.eq("organizationId", orgId))
      .collect(),
  );
  await del(
    "organizationNavigationPolicy",
    await ctx.db
      .query("organizationNavigationPolicy")
      .withIndex("by_organization", (q) => q.eq("organizationId", orgId))
      .collect(),
  );
  await del(
    "savedFilterPresets",
    await ctx.db
      .query("savedFilterPresets")
      .withIndex("by_organization", (q) => q.eq("organizationId", orgId))
      .collect(),
  );

  const orgDoc = await ctx.db.get(orgId);
  if (orgDoc) {
    await bumpDelete(ctx, dryRun, summary, "organizations", orgId);
  }
}

async function runIntegrityVerification(ctx: MutationCtx) {
  const orgs = await ctx.db.query("organizations").collect();
  const orgIds = new Set(orgs.map((o) => String(o._id)));
  const authUsers = await ctx.db.query("authUsers").collect();
  const authUserIds = new Set(authUsers.map((u) => String(u._id)));
  const members = await ctx.db.query("organizationMembers").collect();
  const sessions = await ctx.db.query("authSessions").collect();

  const findings: Array<{ table: string; kind: string; detail: string }> = [];

  for (const u of authUsers) {
    if (u.defaultOrganizationId && !orgIds.has(String(u.defaultOrganizationId))) {
      findings.push({
        table: "authUsers",
        kind: "dangling_defaultOrganizationId",
        detail: `${u._id} -> ${u.defaultOrganizationId}`,
      });
    }
  }

  for (const m of members) {
    if (!orgIds.has(String(m.organizationId))) {
      findings.push({
        table: "organizationMembers",
        kind: "dangling_organizationId",
        detail: `${m._id} -> ${m.organizationId}`,
      });
    }
  }

  for (const s of sessions) {
    if (!authUserIds.has(String(s.userId))) {
      findings.push({
        table: "authSessions",
        kind: "orphan_userId",
        detail: `${s._id} -> ${s.userId}`,
      });
    }
  }

  for (const p of await ctx.db.query("pipeline").collect()) {
    if (p.organizationId && !orgIds.has(String(p.organizationId))) {
      findings.push({
        table: "pipeline",
        kind: "dangling_organizationId",
        detail: `${p._id} -> ${p.organizationId}`,
      });
    }
  }

  for (const t of await ctx.db.query("tasks").collect()) {
    if (t.organizationId && !orgIds.has(String(t.organizationId))) {
      findings.push({
        table: "tasks",
        kind: "dangling_organizationId",
        detail: `${t._id} -> ${t.organizationId}`,
      });
    }
  }

  for (const v of await ctx.db.query("savedFilterPresets").collect()) {
    if (v.organizationId && !orgIds.has(String(v.organizationId))) {
      findings.push({
        table: "savedFilterPresets",
        kind: "dangling_organizationId",
        detail: `${v._id} -> ${v.organizationId}`,
      });
    }
  }

  for (const a of await ctx.db.query("activityFeed").collect()) {
    if (a.scopeKind === "org" && a.scopeId && !orgIds.has(a.scopeId)) {
      findings.push({
        table: "activityFeed",
        kind: "dangling_org_scope",
        detail: `${a._id} -> ${a.scopeId}`,
      });
    }
  }

  return {
    pass: findings.length === 0,
    findingCount: findings.length,
    findings: findings.slice(0, 50),
  };
}

export const purgeSpamAuthStep5 = mutation({
  args: {
    adminSecret: v.string(),
    dryRun: v.boolean(),
  },
  handler: async (ctx, { adminSecret, dryRun }) => {
    assertDataMigrationAdmin(adminSecret);

    const before = await snapshotCounts(ctx);
    const joshuaBefore = before.joshuaOrg;
    const deleted: DeleteSummary = {};
    const deletedUsernames: string[] = [];
    const deletedUserIds: string[] = [];
    const deletionReasons: Record<string, string[]> = {};

    const orgs = await ctx.db.query("organizations").collect();
    const orgIds = new Set(orgs.map((o) => String(o._id)));
    const members = await ctx.db.query("organizationMembers").collect();
    const authUsers = await ctx.db.query("authUsers").collect();

    const targets = authUsers.filter((u) => {
      const { delete: del, reasons } = classifySpamTarget(u, members, orgIds);
      if (del) {
        deletionReasons[String(u._id)] = reasons;
      }
      return del;
    });

    for (const u of targets) {
      deletedUsernames.push(u.displayUsername);
      deletedUserIds.push(String(u._id));
      await deleteAuthUserSatellites(ctx, u, dryRun, deleted);
    }

    const targetKeySet = new Set<string>();
    for (const u of targets) {
      targetKeySet.add(String(u._id));
      targetKeySet.add(u.displayUsername);
      targetKeySet.add(u.normalizedUsername);
    }

    const deletedOrgIds: string[] = [];

    for (const org of await ctx.db.query("organizations").collect()) {
      const oid = org._id;
      if (FORBIDDEN_ORG_DELETE.has(String(oid))) continue;

      const orgMembers = await ctx.db
        .query("organizationMembers")
        .withIndex("by_organization", (q) => q.eq("organizationId", oid))
        .collect();
      const memberCount = orgMembers.filter((m) => !targetKeySet.has(m.userKey)).length;
      const pipelineCount = (
        await ctx.db
          .query("pipeline")
          .withIndex("by_organization_createdAt", (q) =>
            q.eq("organizationId", oid),
          )
          .collect()
      ).length;
      const taskCount = (
        await ctx.db
          .query("tasks")
          .withIndex("by_organization", (q) => q.eq("organizationId", oid))
          .collect()
      ).length;

      if (memberCount > 0 || pipelineCount > 0 || taskCount > 0) continue;

      await deleteOrgShell(ctx, oid, dryRun, deleted);
      deletedOrgIds.push(String(oid));
    }

    if (!dryRun) {
      const joshuaAfter = await countJoshuaOrg(ctx);
      const unchanged =
        joshuaBefore.members === joshuaAfter.members &&
        joshuaBefore.pipelineFiles === joshuaAfter.pipelineFiles &&
        joshuaBefore.tasks === joshuaAfter.tasks &&
        joshuaBefore.activityOrgScoped === joshuaAfter.activityOrgScoped;
      if (!unchanged) {
        throw new Error(
          `Joshua org drift: before=${JSON.stringify(joshuaBefore)} after=${JSON.stringify(joshuaAfter)}`,
        );
      }
    }

    const after = dryRun ? before : await snapshotCounts(ctx);
    const integrity = await runIntegrityVerification(ctx);

    if (!dryRun && !integrity.pass) {
      throw new Error(
        `Integrity verification failed: ${JSON.stringify(integrity.findings.slice(0, 10))}`,
      );
    }

    const remainingAuthUsers = (await ctx.db.query("authUsers").collect()).map(
      (u) => ({
        id: u._id,
        username: u.displayUsername,
        email: u.email ?? null,
        defaultOrganizationId: u.defaultOrganizationId ?? null,
      }),
    );
    const remainingOrganizations = (
      await ctx.db.query("organizations").collect()
    ).map((o) => ({ id: o._id, name: o.name }));

    return {
      dryRun,
      before,
      after,
      deleted,
      deletedUsernames,
      deletedUserIds,
      deletedOrgIds,
      deletionReasons,
      joshuaOrgVerification: {
        before: joshuaBefore,
        after: dryRun ? joshuaBefore : after.joshuaOrg,
        unchanged: dryRun
          ? true
          : JSON.stringify(joshuaBefore) === JSON.stringify(after.joshuaOrg),
      },
      integrityVerification: integrity,
      remainingAuthUsers,
      remainingOrganizations,
      e2ePrimaryPreserved: E2E_PRIMARY_ORG_ID,
    };
  },
});
