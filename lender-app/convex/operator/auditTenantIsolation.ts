/**
 * Phase 12.2 — read-only tenant / user isolation audit (operator).
 *
 * Run (after Convex deploy):
 *   npx convex run operator/auditTenantIsolation:auditTenantIsolation \
 *     '{"adminSecret":"…"}'
 *
 * Local compile from inline dumps (no deploy):
 *   node scripts/compile-tenant-audit-report.mjs
 */
import { v } from "convex/values";
import { query } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { assertDataMigrationAdmin } from "../migrationAdminAuth";

const JOSHUA_ORG_ID = "mx76bxqnc23q76cb99tvrffmy58644pf" as Id<"organizations">;
const JOSHUA_EMAIL = "joshua@directlendingconnection.com";

function nfkcLower(raw: string | undefined | null): string {
  if (!raw) return "";
  try {
    return raw.normalize("NFKC").trim().toLowerCase();
  } catch {
    return raw.trim().toLowerCase();
  }
}

function classifyOrg(
  row: {
    orgId: Id<"organizations">;
    name: string;
    demoWorkspaceBundleId?: string;
    memberCount: number;
    taskCount: number;
    pipelineFileCount: number;
    activityCount: number;
  },
): "A" | "B" | "C" {
  if (row.orgId === JOSHUA_ORG_ID) return "A";
  const name = row.name ?? "";
  if (/^E2E/i.test(name) || /\btest\b/i.test(name)) {
    if (
      row.pipelineFileCount === 0 &&
      row.taskCount === 0 &&
      row.activityCount === 0 &&
      row.memberCount <= 2
    ) {
      return "B";
    }
    return "C";
  }
  if (/^[a-zA-Z0-9]{20,}$/.test(name) && row.pipelineFileCount === 0 && row.taskCount === 0) {
    return "B";
  }
  if (row.demoWorkspaceBundleId) return "C";
  if (row.pipelineFileCount > 0 || row.taskCount > 0) return "C";
  return "C";
}

function classifyUser(u: {
  email?: string | null;
  username?: string;
}): "A" | "B" | "C" {
  if (nfkcLower(u.email) === nfkcLower(JOSHUA_EMAIL)) return "A";
  if (/^e2e/i.test(u.username ?? "") || /e2e/i.test(u.email ?? "")) return "B";
  return "C";
}

export const auditTenantIsolation = query({
  args: {
    adminSecret: v.string(),
  },
  handler: async (ctx, { adminSecret }) => {
    assertDataMigrationAdmin(adminSecret);
    const now = Date.now();

    const authUsers = await ctx.db.query("authUsers").collect();
    const authSessions = await ctx.db.query("authSessions").collect();
    const orgs = await ctx.db.query("organizations").collect();
    const members = await ctx.db.query("organizationMembers").collect();
    const pipeline = await ctx.db.query("pipeline").collect();
    const tasks = await ctx.db.query("tasks").collect();
    const activityFeed = await ctx.db.query("activityFeed").collect();
    const pipelineFileActivity = await ctx.db.query("pipelineFileActivity").collect();

    const orgIds = new Set(orgs.map((o) => o._id));
    const authUserIds = new Set(authUsers.map((u) => u._id));
    const pipelineIds = new Set(pipeline.map((p) => p._id));

    const activeSessionsByUser = new Map<string, number>();
    for (const s of authSessions) {
      if (s.revokedAtMs || s.absoluteExpiresAtMs < now) continue;
      const uid = String(s.userId);
      activeSessionsByUser.set(uid, (activeSessionsByUser.get(uid) ?? 0) + 1);
    }

    const authUserRows = authUsers.map((u) => ({
      userId: u._id,
      username: u.displayUsername,
      normalizedUsername: u.normalizedUsername,
      email: u.email ?? null,
      normalizedEmail: nfkcLower(u.email),
      defaultOrganizationId: u.defaultOrganizationId ?? null,
      globalRole:
        u.systemRole === "SUPER_ADMIN"
          ? "SUPER_ADMIN"
          : u.isGlobalAdmin
            ? "GLOBAL_ADMIN"
            : "standard",
      credentialVersion: u.credentialVersion,
      activeSessionCount: activeSessionsByUser.get(String(u._id)) ?? 0,
      createdAt: u.createdAt,
      updatedAt: u.updatedAt,
      classification: classifyUser({ email: u.email, username: u.displayUsername }),
    }));

    const usernameBuckets = new Map<string, string[]>();
    const emailBuckets = new Map<string, string[]>();
    for (const u of authUsers) {
      const un = nfkcLower(u.normalizedUsername);
      if (un) {
        const b = usernameBuckets.get(un) ?? [];
        b.push(String(u._id));
        usernameBuckets.set(un, b);
      }
      const em = nfkcLower(u.email);
      if (em) {
        const b = emailBuckets.get(em) ?? [];
        b.push(String(u._id));
        emailBuckets.set(em, b);
      }
    }

    const membersByOrg = new Map<string, number>();
    const ownersByOrg = new Map<
      string,
      Array<{ userKey: string; memberId: Id<"organizationMembers">; role: string }>
    >();
    for (const m of members) {
      const oid = String(m.organizationId);
      membersByOrg.set(oid, (membersByOrg.get(oid) ?? 0) + 1);
      if (m.role === "owner") {
        const list = ownersByOrg.get(oid) ?? [];
        list.push({ userKey: m.userKey, memberId: m._id, role: m.role });
        ownersByOrg.set(oid, list);
      }
    }

    const countByOrg = (
      rows: Array<{ organizationId?: Id<"organizations"> | null }>,
    ) => {
      const m = new Map<string, number>();
      for (const r of rows) {
        const oid = r.organizationId ? String(r.organizationId) : "__none__";
        m.set(oid, (m.get(oid) ?? 0) + 1);
      }
      return m;
    };
    const countActivityByOrgScope = (
      rows: Array<{ scopeKind: string; scopeId: string }>,
    ) => {
      const m = new Map<string, number>();
      for (const r of rows) {
        const oid =
          r.scopeKind === "org" && r.scopeId ? r.scopeId : "__none__";
        m.set(oid, (m.get(oid) ?? 0) + 1);
      }
      return m;
    };
    const tasksByOrg = countByOrg(tasks);
    const pipelineByOrg = countByOrg(pipeline);
    const activityByOrg = countActivityByOrgScope(activityFeed);

    const organizationRows = orgs.map((o) => {
      const oid = String(o._id);
      const row = {
        orgId: o._id,
        name: o.name,
        slug: o.slug ?? null,
        demoWorkspaceBundleId: o.demoWorkspaceBundleId ?? null,
        clerkOrganizationId: o.clerkOrganizationId ?? null,
        owners: ownersByOrg.get(oid) ?? [],
        memberCount: membersByOrg.get(oid) ?? 0,
        taskCount: tasksByOrg.get(oid) ?? 0,
        pipelineFileCount: pipelineByOrg.get(oid) ?? 0,
        activityCount: activityByOrg.get(oid) ?? 0,
        activityWithoutOrg: activityByOrg.get("__none__") ?? 0,
        createdAt: o.createdAt,
        updatedAt: o.updatedAt,
      };
      return {
        ...row,
        classification: classifyOrg({
          orgId: row.orgId,
          name: row.name,
          demoWorkspaceBundleId: row.demoWorkspaceBundleId ?? undefined,
          memberCount: row.memberCount,
          taskCount: row.taskCount,
          pipelineFileCount: row.pipelineFileCount,
          activityCount: row.activityCount,
        }),
      };
    });

    const crossTenantLeaks: Array<Record<string, string>> = [];
    for (const p of pipeline) {
      if (p.organizationId && !orgIds.has(p.organizationId)) {
        crossTenantLeaks.push({
          table: "pipeline",
          docId: String(p._id),
          kind: "dangling_organizationId",
          organizationId: String(p.organizationId),
        });
      }
      if (!p.organizationId) {
        crossTenantLeaks.push({
          table: "pipeline",
          docId: String(p._id),
          kind: "missing_organizationId",
        });
      }
    }
    for (const t of tasks) {
      if (t.organizationId && !orgIds.has(t.organizationId)) {
        crossTenantLeaks.push({
          table: "tasks",
          docId: String(t._id),
          kind: "dangling_organizationId",
          organizationId: String(t.organizationId),
        });
      }
      if (!t.organizationId) {
        crossTenantLeaks.push({
          table: "tasks",
          docId: String(t._id),
          kind: "missing_organizationId",
        });
      }
    }
    for (const a of activityFeed) {
      if (a.scopeKind === "org" && a.scopeId && !orgIds.has(a.scopeId as Id<"organizations">)) {
        crossTenantLeaks.push({
          table: "activityFeed",
          docId: String(a._id),
          kind: "dangling_org_scope",
          scopeId: a.scopeId,
        });
      }
    }
    for (const m of members) {
      if (!orgIds.has(m.organizationId)) {
        crossTenantLeaks.push({
          table: "organizationMembers",
          docId: String(m._id),
          kind: "orphan_member_org_missing",
          organizationId: String(m.organizationId),
        });
      }
      if (!authUserIds.has(m.userKey as Id<"authUsers">) && !m.userKey.startsWith("e2e_")) {
        crossTenantLeaks.push({
          table: "organizationMembers",
          docId: String(m._id),
          kind: "member_userKey_not_authUser",
          userKey: m.userKey,
        });
      }
    }
    for (const s of authSessions) {
      if (!authUserIds.has(s.userId)) {
        crossTenantLeaks.push({
          table: "authSessions",
          docId: String(s._id),
          kind: "orphan_session_user",
          userId: String(s.userId),
        });
      }
    }

    const e2eMemberKeys = members
      .filter((m) => m.userKey.startsWith("e2e_"))
      .map((m) => ({
        memberId: m._id,
        organizationId: m.organizationId,
        userKey: m.userKey,
      }));

    return {
      generatedAt: now,
      joshuaOrgId: JOSHUA_ORG_ID,
      rawCounts: {
        authUsers: authUsers.length,
        authSessions: authSessions.length,
        activeSessions: [...activeSessionsByUser.values()].reduce((a, b) => a + b, 0),
        staleSessions: authSessions.filter((s) => s.absoluteExpiresAtMs < now).length,
        organizations: orgs.length,
        organizationMembers: members.length,
        pipelineFiles: pipeline.length,
        tasks: tasks.length,
        activityFeed: activityFeed.length,
        activityFeedWithoutOrg: activityByOrg.get("__none__") ?? 0,
        pipelineFileActivity: pipelineFileActivity.length,
      },
      authUsers: authUserRows,
      collisions: {
        username: [...usernameBuckets.entries()]
          .filter(([, ids]) => ids.length > 1)
          .map(([normalized, userIds]) => ({ normalized, userIds })),
        email: [...emailBuckets.entries()]
          .filter(([, ids]) => ids.length > 1)
          .map(([normalized, userIds]) => ({ normalized, userIds })),
      },
      organizations: organizationRows,
      crossTenantLeaks,
      e2eSyntheticMembers: e2eMemberKeys,
      orphans: {
        pipelineWithoutOrg: pipeline.filter((p) => !p.organizationId).map((p) => p._id),
        tasksWithoutOrg: tasks.filter((t) => !t.organizationId).map((t) => t._id),
        membersWithMissingOrg: members
          .filter((m) => !orgIds.has(m.organizationId))
          .map((m) => m._id),
        sessionsWithMissingUser: authSessions
          .filter((s) => !authUserIds.has(s.userId))
          .map((s) => s._id),
        usersWithoutMembership: authUsers
          .filter((u) => !members.some((m) => m.userKey === String(u._id)))
          .map((u) => u._id),
        pipelineFileActivityOrphans: pipelineFileActivity
          .filter((r) => !pipelineIds.has(r.fileId))
          .map((r) => r._id),
      },
      classifications: {
        A: {
          orgs: organizationRows.filter((o) => o.classification === "A").map((o) => o.orgId),
          users: authUserRows.filter((u) => u.classification === "A").map((u) => u.userId),
        },
        B: {
          orgs: organizationRows.filter((o) => o.classification === "B").map((o) => o.orgId),
          users: authUserRows.filter((u) => u.classification === "B").map((u) => u.userId),
        },
        C: {
          orgs: organizationRows.filter((o) => o.classification === "C").map((o) => o.orgId),
          users: authUserRows.filter((u) => u.classification === "C").map((u) => u.userId),
        },
      },
    };
  },
});
