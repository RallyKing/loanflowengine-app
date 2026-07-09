import { query } from "convex:/_system/repl/wrappers.js";

/**
 * Read-only inline query body for `npx convex run --prod --inline-query @file`.
 * Phase 12.2 tenant isolation audit — no mutations.
 */
export default query({
  handler: async (ctx) => {
    const now = Date.now();
    const JOSHUA_ORG_ID = "mx76bxqnc23q76cb99tvrffmy58644pf";
    const JOSHUA_EMAIL = "joshua@directlendingconnection.com";

    function nfkcLower(s) {
      if (!s) return "";
      try {
        return s.normalize("NFKC").trim().toLowerCase();
      } catch {
        return s.trim().toLowerCase();
      }
    }

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

    const activeSessionsByUser = new Map();
    for (const s of authSessions) {
      if (s.revokedAtMs) continue;
      if (s.absoluteExpiresAtMs < now) continue;
      const uid = String(s.userId);
      activeSessionsByUser.set(uid, (activeSessionsByUser.get(uid) ?? 0) + 1);
    }

    const authUserRows = authUsers.map((u) => ({
      userId: u._id,
      username: u.displayUsername,
      normalizedUsername: u.normalizedUsername,
      email: u.email ?? null,
      normalizedEmail: nfkcLower(u.email ?? ""),
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
    }));

    const usernameBuckets = new Map();
    const emailBuckets = new Map();
    for (const u of authUsers) {
      const un = nfkcLower(u.normalizedUsername);
      if (un) {
        const b = usernameBuckets.get(un) ?? [];
        b.push(String(u._id));
        usernameBuckets.set(un, b);
      }
      const em = nfkcLower(u.email ?? "");
      if (em) {
        const b = emailBuckets.get(em) ?? [];
        b.push(String(u._id));
        emailBuckets.set(em, b);
      }
      if (u.usernameNormalized && u.usernameNormalized !== u.normalizedUsername) {
        const alt = nfkcLower(u.usernameNormalized);
        const b = usernameBuckets.get(alt) ?? [];
        b.push(String(u._id));
        usernameBuckets.set(alt, b);
      }
    }
    const usernameCollisions = [...usernameBuckets.entries()]
      .filter(([, ids]) => ids.length > 1)
      .map(([normalized, userIds]) => ({ normalized, userIds }));
    const emailCollisions = [...emailBuckets.entries()]
      .filter(([, ids]) => ids.length > 1)
      .map(([normalized, userIds]) => ({ normalized, userIds }));

    const membersByOrg = new Map();
    const ownersByOrg = new Map();
    for (const m of members) {
      const oid = String(m.organizationId);
      membersByOrg.set(oid, (membersByOrg.get(oid) ?? 0) + 1);
      if (m.role === "owner") {
        const list = ownersByOrg.get(oid) ?? [];
        list.push({ userKey: m.userKey, memberId: m._id, role: m.role });
        ownersByOrg.set(oid, list);
      }
    }

    const tasksByOrg = new Map();
    for (const t of tasks) {
      const oid = t.organizationId ? String(t.organizationId) : "__none__";
      tasksByOrg.set(oid, (tasksByOrg.get(oid) ?? 0) + 1);
    }
    const pipelineByOrg = new Map();
    for (const p of pipeline) {
      const oid = p.organizationId ? String(p.organizationId) : "__none__";
      pipelineByOrg.set(oid, (pipelineByOrg.get(oid) ?? 0) + 1);
    }
    const activityByOrg = new Map();
    for (const a of activityFeed) {
      const oid = a.organizationId ? String(a.organizationId) : "__none__";
      activityByOrg.set(oid, (activityByOrg.get(oid) ?? 0) + 1);
    }

    const organizationRows = orgs.map((o) => {
      const oid = String(o._id);
      return {
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
        createdAt: o.createdAt,
        updatedAt: o.updatedAt,
      };
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
    for (const p of pipeline) {
      if (!p.organizationId) {
        crossTenantLeaks.push({
          table: "pipeline",
          docId: p._id,
          kind: "missing_organizationId",
        });
      }
    }
    for (const t of tasks) {
      if (!t.organizationId) {
        crossTenantLeaks.push({
          table: "tasks",
          docId: t._id,
          kind: "missing_organizationId",
        });
      }
    }

    const orphans = {
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
    };

    function classifyOrg(row) {
      const oid = String(row.orgId);
      if (oid === JOSHUA_ORG_ID) return "A";
      const name = row.name ?? "";
      if (/^E2E/i.test(name) || /test/i.test(name)) {
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
      if (/^[a-zA-Z0-9]{20,}$/.test(name) && row.pipelineFileCount === 0) return "B";
      if (row.demoWorkspaceBundleId) return "C";
      if (row.pipelineFileCount > 0 || row.taskCount > 0) return "C";
      return "C";
    }

    function classifyUser(u) {
      if (nfkcLower(u.email ?? "") === nfkcLower(JOSHUA_EMAIL)) return "A";
      if (/^e2e/i.test(u.username ?? "") || /e2e/i.test(u.email ?? "")) return "B";
      return "C";
    }

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
        pipelineFileActivity: pipelineFileActivity.length,
      },
      authUsers: authUserRows.map((u) => ({
        ...u,
        classification: classifyUser(u),
      })),
      collisions: {
        username: usernameCollisions,
        email: emailCollisions,
      },
      organizations: organizationRows.map((o) => ({
        ...o,
        classification: classifyOrg(o),
      })),
      crossTenantLeaks,
      orphans,
      classifications: {
        A: {
          orgs: organizationRows.filter((o) => classifyOrg(o) === "A").map((o) => o.orgId),
          users: authUserRows.filter((u) => classifyUser(u) === "A").map((u) => u.userId),
        },
        B: {
          orgs: organizationRows.filter((o) => classifyOrg(o) === "B").map((o) => o.orgId),
          users: authUserRows.filter((u) => classifyUser(u) === "B").map((u) => u.userId),
        },
        C: {
          orgs: organizationRows.filter((o) => classifyOrg(o) === "C").map((o) => o.orgId),
          users: authUserRows.filter((u) => classifyUser(u) === "C").map((u) => u.userId),
        },
      },
    };
  },
});
