/**
 * Phase 12.2 Step 2 — safe tenant cleanup (Class B only + stale session purge).
 *
 * Dry-run:
 *   npx convex run operator/cleanupClassBTenants:cleanupClassBTenants \
 *     '{"adminSecret":"…","dryRun":true}'
 *
 * Execute:
 *   npx convex run operator/cleanupClassBTenants:cleanupClassBTenants \
 *     '{"adminSecret":"…","dryRun":false}'
 */
import { v } from "convex/values";
import { mutation, type MutationCtx } from "../_generated/server";
import type { Doc, Id, TableNames } from "../_generated/dataModel";
import { assertDataMigrationAdmin } from "../migrationAdminAuth";

const JOSHUA_ORG_ID = "mx76bxqnc23q76cb99tvrffmy58644pf" as Id<"organizations">;
const JOSHUA_EMAIL = "joshua@directlendingconnection.com";
const JOSHUA_ALT_USERNAME = "joshuaeballard@gmail.com";

/** Class B orgs from Phase 12.2 Step 1 audit — empty shells only. */
const CLASS_B_ORG_IDS: Id<"organizations">[] = [
  "mx702ra7pxsdy65s0qsnrzq8ws86km7w",
  "mx71kt2er69es02ra1fjxdnz4s87353k",
  "mx75p8a8rjm9kargv7a7rr2kmx873fee",
] as Id<"organizations">[];

const FORBIDDEN_ORG_IDS = new Set<string>([
  JOSHUA_ORG_ID,
  "mx77ssc8sjpgwapfehx8yhz5kd86epd3",
  "mx7bfa58ty1svx65bt3h8v6v5186kke9",
]);

function nfkcLower(raw: string | undefined | null): string {
  if (!raw) return "";
  try {
    return raw.normalize("NFKC").trim().toLowerCase();
  } catch {
    return raw.trim().toLowerCase();
  }
}

function isProtectedAuthUser(u: Doc<"authUsers">): boolean {
  if (nfkcLower(u.email) === nfkcLower(JOSHUA_EMAIL)) return true;
  if (nfkcLower(u.displayUsername) === nfkcLower(JOSHUA_ALT_USERNAME)) return true;
  if (nfkcLower(u.normalizedUsername) === nfkcLower(JOSHUA_ALT_USERNAME)) return true;
  return false;
}

function isClassBAuthUser(u: Doc<"authUsers">): boolean {
  if (isProtectedAuthUser(u)) return false;
  if (/^e2e/i.test(u.displayUsername) || /e2e/i.test(u.email ?? "")) return true;
  return false;
}

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

async function assertOrgEmptyShell(ctx: MutationCtx, orgId: Id<"organizations">) {
  const checks: Array<{ table: string; count: number }> = [];
  const pipeline = await ctx.db
    .query("pipeline")
    .withIndex("by_organization_createdAt", (q) => q.eq("organizationId", orgId))
    .collect();
  checks.push({ table: "pipeline", count: pipeline.length });
  const tasks = await ctx.db
    .query("tasks")
    .withIndex("by_organization", (q) => q.eq("organizationId", orgId))
    .collect();
  checks.push({ table: "tasks", count: tasks.length });
  const lenders = await ctx.db
    .query("lenders")
    .withIndex("by_organization", (q) => q.eq("organizationId", orgId))
    .collect();
  checks.push({ table: "lenders", count: lenders.length });
  const contacts = await ctx.db
    .query("contacts")
    .withIndex("by_organization_updatedAt", (q) => q.eq("organizationId", orgId))
    .collect();
  checks.push({ table: "contacts", count: contacts.length });

  const nonZero = checks.filter((c) => c.count > 0);
  if (nonZero.length > 0) {
    throw new Error(
      `Refusing to delete org ${orgId}: non-empty data ${JSON.stringify(nonZero)}`,
    );
  }
}

async function deleteOrgScopedRows(
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
    "organizationCustomDomains",
    await ctx.db
      .query("organizationCustomDomains")
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
  await del(
    "integrationApiKeys",
    await ctx.db
      .query("integrationApiKeys")
      .withIndex("by_organization", (q) => q.eq("organizationId", orgId))
      .collect(),
  );
  await del(
    "integrationOAuthClients",
    await ctx.db
      .query("integrationOAuthClients")
      .withIndex("by_organization", (q) => q.eq("organizationId", orgId))
      .collect(),
  );
  await del(
    "integrationConnectors",
    await ctx.db
      .query("integrationConnectors")
      .withIndex("by_organization", (q) => q.eq("organizationId", orgId))
      .collect(),
  );
  await del(
    "integrationJobs",
    await ctx.db
      .query("integrationJobs")
      .withIndex("by_organization", (q) => q.eq("organizationId", orgId))
      .collect(),
  );
  await del(
    "organizationIntegrationWorkflows",
    await ctx.db
      .query("organizationIntegrationWorkflows")
      .withIndex("by_organization", (q) => q.eq("organizationId", orgId))
      .collect(),
  );
  await del(
    "memberPresence",
    await ctx.db
      .query("memberPresence")
      .withIndex("by_org_expires", (q) => q.eq("organizationId", orgId))
      .collect(),
  );

  const orgDoc = await ctx.db.get(orgId);
  if (orgDoc) {
    await bumpDelete(ctx, dryRun, summary, "organizations", orgId);
  }
}

async function purgeStaleSessions(
  ctx: MutationCtx,
  dryRun: boolean,
  summary: DeleteSummary,
) {
  const now = Date.now();
  for (const s of await ctx.db.query("authSessions").collect()) {
    const expired = s.absoluteExpiresAtMs < now;
    const revoked = Boolean(s.revokedAtMs);
    if (!expired && !revoked) continue;
    await bumpDelete(ctx, dryRun, summary, "authSessions", s._id);
  }
}

async function deleteClassBAuthUsersAndSatellites(
  ctx: MutationCtx,
  dryRun: boolean,
  summary: DeleteSummary,
  protectedUserIds: Set<string>,
) {
  for (const u of await ctx.db.query("authUsers").collect()) {
    if (!isClassBAuthUser(u)) continue;
    const uid = String(u._id);
    if (protectedUserIds.has(uid)) continue;

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

    const accountId = uid;
    for (const row of await ctx.db
      .query("userPreferences")
      .withIndex("by_accountId", (q) => q.eq("accountId", accountId))
      .collect()) {
      await bumpDelete(ctx, dryRun, summary, "userPreferences", row._id);
    }
    for (const row of await ctx.db
      .query("navigationUserConfig")
      .withIndex("by_accountId", (q) => q.eq("accountId", accountId))
      .collect()) {
      await bumpDelete(ctx, dryRun, summary, "navigationUserConfig", row._id);
    }
    for (const row of await ctx.db
      .query("userOnboarding")
      .withIndex("by_userKey", (q) => q.eq("userKey", accountId))
      .collect()) {
      await bumpDelete(ctx, dryRun, summary, "userOnboarding", row._id);
    }
    for (const row of await ctx.db
      .query("userSimpleWorkflows")
      .withIndex("by_accountId", (q) => q.eq("accountId", accountId))
      .collect()) {
      await bumpDelete(ctx, dryRun, summary, "userSimpleWorkflows", row._id);
    }
    for (const row of await ctx.db
      .query("pipelineFileUserTemplates")
      .withIndex("by_accountId", (q) => q.eq("accountId", accountId))
      .collect()) {
      await bumpDelete(ctx, dryRun, summary, "pipelineFileUserTemplates", row._id);
    }

    for (const m of await ctx.db
      .query("organizationMembers")
      .withIndex("by_user_org", (q) => q.eq("userKey", accountId))
      .collect()) {
      await bumpDelete(ctx, dryRun, summary, "organizationMembers", m._id);
    }

    await bumpDelete(ctx, dryRun, summary, "authUsers", u._id);
  }
}

async function snapshotCounts(ctx: MutationCtx) {
  const now = Date.now();
  const authSessions = await ctx.db.query("authSessions").collect();
  return {
    authUsers: (await ctx.db.query("authUsers").collect()).length,
    authSessions: authSessions.length,
    activeSessions: authSessions.filter(
      (s) => !s.revokedAtMs && s.absoluteExpiresAtMs >= now,
    ).length,
    staleSessions: authSessions.filter((s) => s.absoluteExpiresAtMs < now).length,
    organizations: (await ctx.db.query("organizations").collect()).length,
    organizationMembers: (await ctx.db.query("organizationMembers").collect())
      .length,
    activityFeed: (await ctx.db.query("activityFeed").collect()).length,
    joshuaOrg: await countJoshuaOrg(ctx),
  };
}

export const cleanupClassBTenants = mutation({
  args: {
    adminSecret: v.string(),
    dryRun: v.boolean(),
  },
  handler: async (ctx, { adminSecret, dryRun }) => {
    assertDataMigrationAdmin(adminSecret);
    const now = Date.now();

    for (const oid of CLASS_B_ORG_IDS) {
      if (FORBIDDEN_ORG_IDS.has(String(oid))) {
        throw new Error(`Forbidden org in allowlist: ${oid}`);
      }
    }

    const protectedUsers = (await ctx.db.query("authUsers").collect()).filter(
      isProtectedAuthUser,
    );
    const protectedUserIds = new Set(protectedUsers.map((u) => String(u._id)));

    const before = await snapshotCounts(ctx);
    const deleted: DeleteSummary = {};
    const deletedOrgIds: string[] = [];

    for (const orgId of CLASS_B_ORG_IDS) {
      const org = await ctx.db.get(orgId);
      if (!org) continue;
      await assertOrgEmptyShell(ctx, orgId);
      await deleteOrgScopedRows(ctx, orgId, dryRun, deleted);
      deletedOrgIds.push(String(orgId));
    }

    await purgeStaleSessions(ctx, dryRun, deleted);
    await deleteClassBAuthUsersAndSatellites(ctx, dryRun, deleted, protectedUserIds);

    const after = dryRun ? before : await snapshotCounts(ctx);

    const joshuaBefore = before.joshuaOrg;
    const joshuaAfter = dryRun ? joshuaBefore : after.joshuaOrg;
    const joshuaUnchanged =
      joshuaBefore.members === joshuaAfter.members &&
      joshuaBefore.pipelineFiles === joshuaAfter.pipelineFiles &&
      joshuaBefore.tasks === joshuaAfter.tasks &&
      joshuaBefore.activityOrgScoped === joshuaAfter.activityOrgScoped;

    if (!dryRun && !joshuaUnchanged) {
      throw new Error(
        `Joshua org counts changed unexpectedly: before=${JSON.stringify(joshuaBefore)} after=${JSON.stringify(joshuaAfter)}`,
      );
    }

    return {
      dryRun,
      executedAt: now,
      classBOrgIds: [...CLASS_B_ORG_IDS],
      deletedOrgIds,
      protectedUserIds: [...protectedUserIds],
      before,
      after,
      deleted,
      joshuaOrgVerification: {
        before: joshuaBefore,
        after: joshuaAfter,
        unchanged: joshuaUnchanged,
      },
      classBAuthUsersDeleted: deleted.authUsers ?? 0,
      note:
        "activityFeed not modified. Class C spam auth users retained per audit classification.",
    };
  },
});
