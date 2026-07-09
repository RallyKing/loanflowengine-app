/**
 * Phase 12.2 Step 6 — operator audit for clean tenant bootstrap + disposable test purge.
 */
import { v } from "convex/values";
import { mutation, query } from "../_generated/server";
import type { Doc, Id, TableNames } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { assertDataMigrationAdmin } from "../migrationAdminAuth";
import {
  canonicalAliasKeys,
  canonicalEmailKey,
  canonicalLoginKey,
  collectAuthUsersByCanonicalLogin,
  findAuthUserByCanonicalLogin,
  identityFieldsCanonical,
} from "./canonicalIdentity";
import { countOrgBusinessData } from "./cleanTenantBootstrap";
import { authUserMayInitiateSuperuserImpersonation } from "./superuserAllowlist";
import { assertOrgPermission } from "../organizationRbac";
import { IMPERSONATION_MAX_TTL_MS } from "../superuserImpersonation/runtime";

const JOSHUA_ORG_ID = "mx76bxqnc23q76cb99tvrffmy58644pf" as Id<"organizations">;
const E2E_PRIMARY_ORG_ID = "mx7bfa58ty1svx65bt3h8v6v5186kke9" as Id<"organizations">;

type DeleteSummary = Record<string, number>;

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

async function deleteOrgShell(
  ctx: MutationCtx,
  orgId: Id<"organizations">,
  dryRun: boolean,
  summary: DeleteSummary,
) {
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
  if (orgDoc) await bumpDelete(ctx, dryRun, summary, "organizations", orgId);
}

async function deleteAuthUserComplete(
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

  for (const table of [
    "userPreferences",
    "navigationUserConfig",
    "userSimpleWorkflows",
    "pipelineFileUserTemplates",
  ] as const) {
    for (const row of await ctx.db
      .query(table)
      .withIndex("by_accountId", (q) => q.eq("accountId", uid))
      .collect()) {
      await bumpDelete(ctx, dryRun, summary, table, row._id);
    }
  }
  for (const row of await ctx.db
    .query("userOnboarding")
    .withIndex("by_userKey", (q) => q.eq("userKey", uid))
    .collect()) {
    await bumpDelete(ctx, dryRun, summary, "userOnboarding", row._id);
  }

  for (const m of await ctx.db.query("organizationMembers").collect()) {
    if (!keys.has(m.userKey)) continue;
    await bumpDelete(ctx, dryRun, summary, "organizationMembers", m._id);
  }

  for (const n of await ctx.db.query("taskNotifications").collect()) {
    if (keys.has(n.userKey)) {
      await bumpDelete(ctx, dryRun, summary, "taskNotifications", n._id);
    }
  }
  for (const n of await ctx.db.query("userNotifications").collect()) {
    if (keys.has(n.userKey)) {
      await bumpDelete(ctx, dryRun, summary, "userNotifications", n._id);
    }
  }

  await bumpDelete(ctx, dryRun, summary, "authUsers", u._id);
}

async function buildBootstrapAudit(ctx: QueryCtx, raw: string) {
  const canonicalLogin = canonicalLoginKey(raw);
  const canonicalEmail = canonicalEmailKey(raw);

  const matches = await collectAuthUsersByCanonicalLogin(ctx, raw);
  const user = matches.length === 1 ? matches[0]! : null;

  const aliasCollisions: Array<{ userId: string; field: string; value: string }> =
    [];
  if (user) {
    for (const key of canonicalAliasKeys(raw)) {
      const byUser = await ctx.db
        .query("authUsers")
        .withIndex("by_normalizedUsername", (q) =>
          q.eq("normalizedUsername", key),
        )
        .collect();
      const byEmail = await ctx.db
        .query("authUsers")
        .withIndex("by_email", (q) => q.eq("email", key))
        .collect();
      for (const row of [...byUser, ...byEmail]) {
        if (String(row._id) !== String(user._id)) {
          aliasCollisions.push({
            userId: String(row._id),
            field: "canonical_alias",
            value: key,
          });
        }
      }
    }
  }

  const memberships = user
    ? await ctx.db
        .query("organizationMembers")
        .withIndex("by_user_org", (q) => q.eq("userKey", String(user._id)))
        .collect()
    : [];

  const orgId = user?.defaultOrganizationId ?? null;
  const businessCounts = orgId
    ? await countOrgBusinessData(ctx, orgId)
    : null;

  const roles = orgId
    ? (
        await ctx.db
          .query("organizationRoles")
          .withIndex("by_organization", (q) => q.eq("organizationId", orgId))
          .collect()
      ).length
    : 0;
  const stages = orgId
    ? (
        await ctx.db
          .query("organizationPipelineStages")
          .withIndex("by_organization", (q) => q.eq("organizationId", orgId))
          .collect()
      ).length
    : 0;

  const foreignTenantData =
    user && orgId
      ? {
          pipelineOtherOrgs: (await ctx.db.query("pipeline").collect()).filter(
            (p) =>
              (p.ownerUserId === String(user._id) ||
                p.ownerUserKey === String(user._id)) &&
              p.organizationId &&
              String(p.organizationId) !== String(orgId),
          ).length,
          tasksOtherOrgs: (await ctx.db.query("tasks").collect()).filter(
            (t) =>
              (t.ownerUserId === String(user._id) ||
                t.assigneeId === String(user._id)) &&
              t.organizationId &&
              String(t.organizationId) !== String(orgId),
          ).length,
        }
      : null;

  const pass =
    Boolean(user) &&
    matches.length === 1 &&
    identityFieldsCanonical(user!) &&
    memberships.length === 1 &&
    aliasCollisions.length === 0 &&
    Boolean(orgId) &&
    businessCounts !== null &&
    businessCounts.pipelineFiles === 0 &&
    businessCounts.tasks === 0 &&
    businessCounts.contacts === 0 &&
    businessCounts.lenders === 0 &&
    businessCounts.savedViews === 0 &&
    businessCounts.activityOrgScoped === 0 &&
    (foreignTenantData?.pipelineOtherOrgs ?? 0) === 0 &&
    (foreignTenantData?.tasksOtherOrgs ?? 0) === 0 &&
    roles >= 3 &&
    stages >= 8;

  return {
    pass,
    canonicalLogin,
    canonicalEmail: canonicalEmail ?? null,
    authUserCount: matches.length,
    authUserId: user?._id ?? null,
    identityCanonical: user ? identityFieldsCanonical(user) : false,
    membershipCount: memberships.length,
    defaultOrganizationId: orgId,
    organizationRoleCount: roles,
    pipelineStageCount: stages,
    aliasCollisions,
    businessCounts,
    foreignTenantData,
    memberships: memberships.map((m) => ({
      memberId: m._id,
      organizationId: m.organizationId,
      role: m.role,
      assignedRoleId: m.assignedRoleId ?? null,
    })),
  };
}

export const verifyCleanBootstrap = query({
  args: {
    adminSecret: v.string(),
    loginOrEmail: v.string(),
  },
  handler: async (ctx, { adminSecret, loginOrEmail }) => {
    assertDataMigrationAdmin(adminSecret);
    return buildBootstrapAudit(ctx, loginOrEmail.trim());
  },
});

export const purgeDisposableBootstrapTest = mutation({
  args: {
    adminSecret: v.string(),
    loginOrEmail: v.string(),
    dryRun: v.boolean(),
  },
  handler: async (ctx, { adminSecret, loginOrEmail, dryRun }) => {
    assertDataMigrationAdmin(adminSecret);
    const user = await findAuthUserByCanonicalLogin(ctx, loginOrEmail.trim());
    if (!user) throw new Error("Auth user not found for purge.");

    if (String(user.defaultOrganizationId) === String(JOSHUA_ORG_ID)) {
      throw new Error("Refusing to purge Joshua canonical org user.");
    }

    const audit = await buildBootstrapAudit(ctx, loginOrEmail.trim());
    if (!audit.pass && !dryRun) {
      throw new Error(
        `Refusing purge — bootstrap audit failed: ${JSON.stringify(audit)}`,
      );
    }

    const deleted: DeleteSummary = {};
    const orgId = user.defaultOrganizationId;
    await deleteAuthUserComplete(ctx, user, dryRun, deleted);
    if (orgId) {
      await deleteOrgShell(ctx, orgId, dryRun, deleted);
    }

    return {
      dryRun,
      purgedUserId: user._id,
      purgedOrgId: orgId ?? null,
      deleted,
      auditBeforePurge: audit,
    };
  },
});

export const verifySuperuserIsolation = mutation({
  args: {
    adminSecret: v.string(),
  },
  handler: async (ctx, { adminSecret }) => {
    assertDataMigrationAdmin(adminSecret);
    const now = Date.now();

    const joshua = await findAuthUserByCanonicalLogin(
      ctx,
      "joshua@directlendingconnection.com",
    );
    const eballard = await findAuthUserByCanonicalLogin(
      ctx,
      "joshuaeballard@gmail.com",
    );

    const allowlist = {
      joshuaPrimaryMayImpersonate: authUserMayInitiateSuperuserImpersonation(joshua),
      eballardMayImpersonate: authUserMayInitiateSuperuserImpersonation(eballard),
    };

    const matrix: Record<string, boolean | string> = {
      joshuaPrimaryMayImpersonate: allowlist.joshuaPrimaryMayImpersonate,
      eballardBlocked: !allowlist.eballardMayImpersonate,
    };

    if (!joshua) {
      return { pass: false, matrix, error: "Joshua primary user not found." };
    }

    const testPublicId = `op-audit-${now}`;
    const testAuthSessionPublicId = `op-audit-auth-${now}`;

    async function insertSession(
      mode: "readonly" | "operator",
      targetOrganizationId: Id<"organizations">,
    ) {
      await ctx.db.insert("superuserImpersonationSessions", {
        publicId: `${testPublicId}-${mode}`,
        tokenHash: "audit-probe",
        authSessionPublicId: testAuthSessionPublicId,
        initiatorUserId: joshua!._id,
        targetOrganizationId,
        mode,
        issuedAt: now,
        expiresAt: now + IMPERSONATION_MAX_TTL_MS,
        nonce: `nonce-${mode}-${now}`,
      });
    }

    async function revokeProbeSessions() {
      const rows = await ctx.db
        .query("superuserImpersonationSessions")
        .withIndex("by_initiator", (q) => q.eq("initiatorUserId", joshua!._id))
        .collect();
      for (const row of rows) {
        if (!row.publicId.startsWith("op-audit-")) continue;
        if (!row.revokedAtMs) {
          await ctx.db.patch(row._id, {
            revokedAtMs: now,
            revokeReason: "operator_audit_cleanup",
          });
        }
      }
    }

    await revokeProbeSessions();

    let readonlyBlocked = false;
    let operatorAllowed = false;
    let crossTenantBlocked = false;

    await insertSession("readonly", E2E_PRIMARY_ORG_ID);
    try {
      await assertOrgPermission(
        ctx,
        E2E_PRIMARY_ORG_ID,
        String(joshua._id),
        "settings.manage",
      );
    } catch (e) {
      readonlyBlocked =
        e instanceof Error && e.message.includes("IMPERSONATION_READ_ONLY");
    }

    await revokeProbeSessions();
    await insertSession("operator", E2E_PRIMARY_ORG_ID);
    try {
      await assertOrgPermission(
        ctx,
        E2E_PRIMARY_ORG_ID,
        String(joshua._id),
        "settings.manage",
      );
      operatorAllowed = true;
    } catch {
      operatorAllowed = false;
    }

    await revokeProbeSessions();
    await insertSession("readonly", E2E_PRIMARY_ORG_ID);
    try {
      await assertOrgPermission(
        ctx,
        JOSHUA_ORG_ID,
        String(joshua._id),
        "settings.manage",
      );
    } catch (e) {
      crossTenantBlocked =
        e instanceof Error &&
        e.message.includes("Impersonation is scoped to one target organization");
    }

    await revokeProbeSessions();

    matrix.readonlyMutationBlocked = readonlyBlocked;
    matrix.operatorMutationAllowed = operatorAllowed;
    matrix.crossTenantQueryIsolation = crossTenantBlocked;

    const auditRows = await ctx.db
      .query("superuserImpersonationAudit")
      .withIndex("by_initiator_at", (q) => q.eq("initiatorUserId", joshua._id))
      .collect();
    const auditSample = auditRows.sort((a, b) => b.at - a.at).slice(0, 5);

    const pass =
      allowlist.joshuaPrimaryMayImpersonate === true &&
      allowlist.eballardMayImpersonate === false &&
      readonlyBlocked === true &&
      operatorAllowed === true &&
      crossTenantBlocked === true;

    return {
      pass,
      matrix,
      allowlist,
      auditSample: auditSample.map((a) => ({
        event: a.event,
        targetOrganizationId: a.targetOrganizationId,
        mode: a.mode,
        mutationPath: a.mutationPath,
        at: a.at,
      })),
    };
  },
});
