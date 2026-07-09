/**
 * Phase 12.2 Step 4 — resolve Class C manual-review entities.
 *
 *   npx convex run operator/resolveClassCStep4:resolveClassCStep4 \
 *     '{"adminSecret":"…","eballardAction":"KEEP","dryRun":false}'
 */
import { v } from "convex/values";
import { mutation, type MutationCtx } from "../_generated/server";
import type { Id, TableNames } from "../_generated/dataModel";
import { assertDataMigrationAdmin } from "../migrationAdminAuth";

const JOSHUA_ORG_ID = "mx76bxqnc23q76cb99tvrffmy58644pf" as Id<"organizations">;
const JOSHUA_USER_ID = "ts719yfyv2b6020avvctpw0ns586exm6" as Id<"authUsers">;
const JOSHUA_EMAIL = "joshua@directlendingconnection.com";
const DUPLICATE_DLC_ORG_ID =
  "mx77ssc8sjpgwapfehx8yhz5kd86epd3" as Id<"organizations">;
const E2E_PRIMARY_ORG_ID =
  "mx7bfa58ty1svx65bt3h8v6v5186kke9" as Id<"organizations">;
const EBALLARD_USER_ID =
  "ts7d3keadq48gay3pa8k6gdwx9878p33" as Id<"authUsers">;
const EBALLARD_USERNAME = "joshuaeballard@gmail.com";

type DeleteSummary = Record<string, number>;

function nfkcLower(raw: string | undefined | null): string {
  if (!raw) return "";
  try {
    return raw.normalize("NFKC").trim().toLowerCase();
  } catch {
    return raw.trim().toLowerCase();
  }
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

async function snapshotTenantCounts(ctx: MutationCtx) {
  return {
    authUsers: (await ctx.db.query("authUsers").collect()).length,
    organizations: (await ctx.db.query("organizations").collect()).length,
    organizationMembers: (await ctx.db.query("organizationMembers").collect())
      .length,
    joshuaOrg: await countJoshuaOrg(ctx),
  };
}

async function assertDuplicateShellEmpty(ctx: MutationCtx, orgId: Id<"organizations">) {
  const scopeId = String(orgId);
  const checks: Array<{ table: string; count: number }> = [];

  const pushCount = (table: string, count: number) => checks.push({ table, count });

  pushCount(
    "pipeline",
    (
      await ctx.db
        .query("pipeline")
        .withIndex("by_organization_createdAt", (q) => q.eq("organizationId", orgId))
        .collect()
    ).length,
  );
  pushCount(
    "tasks",
    (
      await ctx.db
        .query("tasks")
        .withIndex("by_organization", (q) => q.eq("organizationId", orgId))
        .collect()
    ).length,
  );
  pushCount(
    "activityFeed_orgScope",
    (
      await ctx.db
        .query("activityFeed")
        .withIndex("by_scope_at", (q) =>
          q.eq("scopeKind", "org").eq("scopeId", scopeId),
        )
        .collect()
    ).length,
  );
  pushCount(
    "savedFilterPresets",
    (
      await ctx.db
        .query("savedFilterPresets")
        .withIndex("by_organization", (q) => q.eq("organizationId", orgId))
        .collect()
    ).length,
  );
  pushCount(
    "organizationNavigationPolicy",
    (
      await ctx.db
        .query("organizationNavigationPolicy")
        .withIndex("by_organization", (q) => q.eq("organizationId", orgId))
        .collect()
    ).length,
  );
  pushCount(
    "lenders",
    (
      await ctx.db
        .query("lenders")
        .withIndex("by_organization", (q) => q.eq("organizationId", orgId))
        .collect()
    ).length,
  );
  pushCount(
    "contacts",
    (
      await ctx.db
        .query("contacts")
        .withIndex("by_organization_updatedAt", (q) => q.eq("organizationId", orgId))
        .collect()
    ).length,
  );

  const nonZero = checks.filter((c) => c.count > 0);
  if (nonZero.length > 0) {
    throw new Error(
      `Duplicate DLC org is not an empty shell: ${JSON.stringify(nonZero)}`,
    );
  }
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

  const members = await ctx.db
    .query("organizationMembers")
    .withIndex("by_organization", (q) => q.eq("organizationId", orgId))
    .collect();
  for (const m of members) {
    if (orgId === DUPLICATE_DLC_ORG_ID && m.userKey !== String(JOSHUA_USER_ID)) {
      throw new Error(
        `Unexpected member on duplicate DLC org: ${m.userKey} (expected only Joshua)`,
      );
    }
  }
  await del("organizationMembers", members);

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

  const orgDoc = await ctx.db.get(orgId);
  if (orgDoc) {
    await bumpDelete(ctx, dryRun, summary, "organizations", orgId);
  }
}

async function verifyEballardKeep(ctx: MutationCtx) {
  const user = await ctx.db.get(EBALLARD_USER_ID);
  if (!user) {
    throw new Error("joshuaeballard@gmail.com auth user missing after KEEP resolution.");
  }
  const normalizedOk =
    nfkcLower(user.normalizedUsername) === nfkcLower(EBALLARD_USERNAME) &&
    nfkcLower(user.displayUsername) === nfkcLower(EBALLARD_USERNAME) &&
  (user.usernameNormalized == null ||
      nfkcLower(user.usernameNormalized) === nfkcLower(EBALLARD_USERNAME));
  const memberships = await ctx.db
    .query("organizationMembers")
    .withIndex("by_user_org", (q) => q.eq("userKey", String(EBALLARD_USER_ID)))
    .collect();
  const joshuaMembership = memberships.find(
    (m) => m.organizationId === JOSHUA_ORG_ID,
  );
  return {
    userId: user._id,
    displayUsername: user.displayUsername,
    normalizedUsername: user.normalizedUsername,
    email: user.email ?? null,
    defaultOrganizationId: user.defaultOrganizationId ?? null,
    caseNormalized: normalizedOk,
    membershipValid: Boolean(joshuaMembership),
    membershipOrgId: joshuaMembership?.organizationId ?? null,
    membershipRole: joshuaMembership?.role ?? null,
  };
}

async function mergeEballardIntoJoshua(
  ctx: MutationCtx,
  dryRun: boolean,
  summary: DeleteSummary,
) {
  const secondary = await ctx.db.get(EBALLARD_USER_ID);
  const primary = await ctx.db.get(JOSHUA_USER_ID);
  if (!secondary) throw new Error("Secondary auth user not found.");
  if (!primary) throw new Error("Primary Joshua auth user not found.");

  for (const s of await ctx.db
    .query("authSessions")
    .withIndex("by_user", (q) => q.eq("userId", EBALLARD_USER_ID))
    .collect()) {
    await bumpDelete(ctx, dryRun, summary, "authSessions", s._id);
  }
  for (const t of await ctx.db
    .query("authPasswordResetTokens")
    .withIndex("by_user", (q) => q.eq("userId", EBALLARD_USER_ID))
    .collect()) {
    await bumpDelete(ctx, dryRun, summary, "authPasswordResetTokens", t._id);
  }
  for (const t of await ctx.db
    .query("authEmailVerificationTokens")
    .withIndex("by_user", (q) => q.eq("userId", EBALLARD_USER_ID))
    .collect()) {
    await bumpDelete(ctx, dryRun, summary, "authEmailVerificationTokens", t._id);
  }

  for (const m of await ctx.db
    .query("organizationMembers")
    .withIndex("by_user_org", (q) => q.eq("userKey", String(EBALLARD_USER_ID)))
    .collect()) {
    if (m.organizationId === JOSHUA_ORG_ID) {
      await bumpDelete(ctx, dryRun, summary, "organizationMembers", m._id);
      continue;
    }
    if (!dryRun) {
      await ctx.db.patch(m._id, { userKey: String(JOSHUA_USER_ID) });
    }
    summary.organizationMembersRekeyed = (summary.organizationMembersRekeyed ?? 0) + 1;
  }

  const accountId = String(EBALLARD_USER_ID);
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
  for (const row of await ctx.db
    .query("userOnboarding")
    .withIndex("by_userKey", (q) => q.eq("userKey", accountId))
    .collect()) {
    await bumpDelete(ctx, dryRun, summary, "userOnboarding", row._id);
  }

  await bumpDelete(ctx, dryRun, summary, "authUsers", EBALLARD_USER_ID);

  const primaryAfter = await ctx.db.get(JOSHUA_USER_ID);
  if (!primaryAfter) throw new Error("Primary auth user missing after merge.");
  if (nfkcLower(primaryAfter.email) !== nfkcLower(JOSHUA_EMAIL)) {
    throw new Error("Primary Joshua email drift after merge.");
  }
}

async function assertE2eOrgUntouched(
  ctx: MutationCtx,
  beforeMembers: number,
  beforeOrgExists: boolean,
) {
  const e2e = await ctx.db.get(E2E_PRIMARY_ORG_ID);
  if (!beforeOrgExists || !e2e) {
    throw new Error("E2E Primary org missing — must remain untouched.");
  }
  const members = await ctx.db
    .query("organizationMembers")
    .withIndex("by_organization", (q) => q.eq("organizationId", E2E_PRIMARY_ORG_ID))
    .collect();
  if (members.length !== beforeMembers) {
    throw new Error(
      `E2E Primary membership count changed: ${beforeMembers} -> ${members.length}`,
    );
  }
}

export const resolveClassCStep4 = mutation({
  args: {
    adminSecret: v.string(),
    eballardAction: v.union(v.literal("KEEP"), v.literal("MERGE")),
    dryRun: v.boolean(),
  },
  handler: async (ctx, { adminSecret, eballardAction, dryRun }) => {
    assertDataMigrationAdmin(adminSecret);

    const duplicateOrg = await ctx.db.get(DUPLICATE_DLC_ORG_ID);
    if (!duplicateOrg) {
      throw new Error("Duplicate DLC org not found (already deleted?).");
    }

    const e2eBefore = await ctx.db.get(E2E_PRIMARY_ORG_ID);
    const e2eMembersBefore = e2eBefore
      ? (
          await ctx.db
            .query("organizationMembers")
            .withIndex("by_organization", (q) =>
              q.eq("organizationId", E2E_PRIMARY_ORG_ID),
            )
            .collect()
        ).length
      : 0;

    const before = await snapshotTenantCounts(ctx);
    const joshuaBefore = before.joshuaOrg;
    const deleted: DeleteSummary = {};

    await assertDuplicateShellEmpty(ctx, DUPLICATE_DLC_ORG_ID);
    await deleteOrgShell(ctx, DUPLICATE_DLC_ORG_ID, dryRun, deleted);

    let eballardResult: Record<string, unknown> = { action: "KEEP" };
    if (eballardAction === "KEEP") {
      eballardResult = { action: "KEEP", ...(await verifyEballardKeep(ctx)) };
    } else {
      await mergeEballardIntoJoshua(ctx, dryRun, deleted);
      eballardResult = {
        action: "MERGE",
        mergedInto: JOSHUA_USER_ID,
        primaryEmail: JOSHUA_EMAIL,
      };
    }

    if (!dryRun) {
      await assertE2eOrgUntouched(ctx, e2eMembersBefore, Boolean(e2eBefore));
      const joshuaAfter = await countJoshuaOrg(ctx);
      const unchanged =
        joshuaBefore.members === joshuaAfter.members &&
        joshuaBefore.pipelineFiles === joshuaAfter.pipelineFiles &&
        joshuaBefore.tasks === joshuaAfter.tasks &&
        joshuaBefore.activityOrgScoped === joshuaAfter.activityOrgScoped;
      if (!unchanged) {
        throw new Error(
          `Joshua org integrity drift: before=${JSON.stringify(joshuaBefore)} after=${JSON.stringify(joshuaAfter)}`,
        );
      }
    }

    const after = dryRun ? before : await snapshotTenantCounts(ctx);

    const orgs = dryRun
      ? (await ctx.db.query("organizations").collect()).map((o) => ({
          id: o._id,
          name: o.name,
        }))
      : (await ctx.db.query("organizations").collect()).map((o) => ({
          id: o._id,
          name: o.name,
        }));

    const authUsers = (await ctx.db.query("authUsers").collect()).map((u) => ({
      id: u._id,
      username: u.displayUsername,
      email: u.email ?? null,
      defaultOrganizationId: u.defaultOrganizationId ?? null,
    }));

    return {
      dryRun,
      eballardAction,
      duplicateOrgDeleted: DUPLICATE_DLC_ORG_ID,
      e2ePrimaryPreserved: E2E_PRIMARY_ORG_ID,
      before,
      after,
      deleted,
      joshuaOrgVerification: {
        before: joshuaBefore,
        after: dryRun ? joshuaBefore : after.joshuaOrg,
        unchanged: dryRun
          ? true
          : JSON.stringify(joshuaBefore) === JSON.stringify(after.joshuaOrg),
      },
      eballardResult,
      remainingOrganizations: orgs,
      remainingAuthUsers: authUsers,
    };
  },
});
