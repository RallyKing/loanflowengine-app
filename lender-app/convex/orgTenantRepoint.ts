/**
 * Operator-only: repoint every `organizationId` (and portal `orgScope`) from a
 * source org to a target org — typically a fresh org document after a bad merge.
 *
 * Flow: `planOrgTenantRepoint` (dry read) → `applyOrgTenantRepoint` with
 * `dryRun: true` → `applyOrgTenantRepoint` with `dryRun: false`.
 *
 * Auth: `DATA_MIGRATION_ADMIN_SECRET` or `ORG_INTEGRITY_ADMIN_SECRET`.
 *
 * Usage:
 *   npx convex run orgTenantRepoint:planOrgTenantRepoint \
 *     '{"adminSecret":"…","fromOrganizationId":"…","toOrganizationId":"…"}'
 */
import { v } from "convex/values";
import { mutation, type MutationCtx } from "./_generated/server";
import type { Doc, Id, TableNames } from "./_generated/dataModel";
import { assertDataMigrationAdmin } from "./migrationAdminAuth";
import { pickCanonicalOrgMember } from "./orgMembership";
import {
  seedSystemRolesForOrganization,
  syncSystemRolePermissions,
  validateCustomPermissions,
} from "./organizationRbac";
import { SYSTEM_ORG_ROLE_KEYS } from "../lib/orgRbac";

/** Count / patch every document that stores `organizationId === fromId` (correct index per table). */
async function collectDocsWithOrganizationId(
  ctx: MutationCtx,
  fromId: Id<"organizations">,
): Promise<Array<{ table: string; id: Id<TableNames> }>> {
  const out: Array<{ table: string; id: Id<TableNames> }> = [];
  const push = (table: string, rows: { _id: Id<TableNames> }[]) => {
    for (const r of rows) out.push({ table, id: r._id });
  };

  push(
    "lenders",
    await ctx.db
      .query("lenders")
      .withIndex("by_organization", (q) => q.eq("organizationId", fromId))
      .collect(),
  );
  push(
    "lenderAttachments",
    await ctx.db
      .query("lenderAttachments")
      .withIndex("by_organization", (q) => q.eq("organizationId", fromId))
      .collect(),
  );
  push(
    "savedFilterPresets",
    await ctx.db
      .query("savedFilterPresets")
      .withIndex("by_organization", (q) => q.eq("organizationId", fromId))
      .collect(),
  );
  push(
    "pipeline",
    await ctx.db
      .query("pipeline")
      .withIndex("by_organization_createdAt", (q) =>
        q.eq("organizationId", fromId),
      )
      .collect(),
  );
  push(
    "tasks",
    await ctx.db
      .query("tasks")
      .withIndex("by_organization", (q) => q.eq("organizationId", fromId))
      .collect(),
  );
  push(
    "taskAttachments",
    await ctx.db
      .query("taskAttachments")
      .withIndex("by_organization", (q) => q.eq("organizationId", fromId))
      .collect(),
  );
  push(
    "contacts",
    await ctx.db
      .query("contacts")
      .withIndex("by_organization_updatedAt", (q) =>
        q.eq("organizationId", fromId),
      )
      .collect(),
  );
  push(
    "libraryDocuments",
    await ctx.db
      .query("libraryDocuments")
      .withIndex("by_organization_updatedAt", (q) =>
        q.eq("organizationId", fromId),
      )
      .collect(),
  );
  push(
    "signatureEnvelopes",
    await ctx.db
      .query("signatureEnvelopes")
      .withIndex("by_org_updatedAt", (q) => q.eq("organizationId", fromId))
      .collect(),
  );
  push(
    "fileMessages",
    await ctx.db
      .query("fileMessages")
      .filter((q) => q.eq(q.field("organizationId"), fromId))
      .collect(),
  );
  push(
    "organizationPermissions",
    await ctx.db
      .query("organizationPermissions")
      .withIndex("by_organization", (q) => q.eq("organizationId", fromId))
      .collect(),
  );
  push(
    "organizationNavigationPolicy",
    await ctx.db
      .query("organizationNavigationPolicy")
      .withIndex("by_organization", (q) => q.eq("organizationId", fromId))
      .collect(),
  );
  push(
    "organizationCustomDomains",
    await ctx.db
      .query("organizationCustomDomains")
      .withIndex("by_organization", (q) => q.eq("organizationId", fromId))
      .collect(),
  );
  push(
    "orgAiProviders",
    await ctx.db
      .query("orgAiProviders")
      .withIndex("by_organization", (q) => q.eq("organizationId", fromId))
      .collect(),
  );
  push(
    "dueDiligencePrompts",
    await ctx.db
      .query("dueDiligencePrompts")
      .withIndex("by_organization", (q) => q.eq("organizationId", fromId))
      .collect(),
  );
  push(
    "dueDiligenceRuns",
    await ctx.db
      .query("dueDiligenceRuns")
      .withIndex("by_organization_created", (q) => q.eq("organizationId", fromId))
      .collect(),
  );
  push(
    "integrationApiKeys",
    await ctx.db
      .query("integrationApiKeys")
      .withIndex("by_organization", (q) => q.eq("organizationId", fromId))
      .collect(),
  );
  push(
    "integrationOAuthClients",
    await ctx.db
      .query("integrationOAuthClients")
      .withIndex("by_organization", (q) => q.eq("organizationId", fromId))
      .collect(),
  );
  push(
    "integrationConnectors",
    await ctx.db
      .query("integrationConnectors")
      .withIndex("by_organization", (q) => q.eq("organizationId", fromId))
      .collect(),
  );
  push(
    "integrationJobs",
    await ctx.db
      .query("integrationJobs")
      .withIndex("by_organization", (q) => q.eq("organizationId", fromId))
      .collect(),
  );
  push(
    "organizationIntegrationWorkflows",
    await ctx.db
      .query("organizationIntegrationWorkflows")
      .withIndex("by_organization", (q) => q.eq("organizationId", fromId))
      .collect(),
  );
  push(
    "systemEmailEvents",
    await ctx.db
      .query("systemEmailEvents")
      .withIndex("by_organization_at", (q) => q.eq("organizationId", fromId))
      .collect(),
  );
  push(
    "systemEmailLog",
    await ctx.db
      .query("systemEmailLog")
      .withIndex("by_organization_created", (q) =>
        q.eq("organizationId", fromId),
      )
      .collect(),
  );
  push(
    "emailInboxSyncPreferences",
    await ctx.db
      .query("emailInboxSyncPreferences")
      .withIndex("by_org_user", (q) => q.eq("organizationId", fromId))
      .collect(),
  );
  push(
    "outboundWebhookSubscriptions",
    await ctx.db
      .query("outboundWebhookSubscriptions")
      .withIndex("by_organization", (q) => q.eq("organizationId", fromId))
      .collect(),
  );
  push(
    "outboundWebhookDeliveries",
    await ctx.db
      .query("outboundWebhookDeliveries")
      .withIndex("by_organization", (q) => q.eq("organizationId", fromId))
      .collect(),
  );
  push(
    "outboundWebhookDeliveryLogs",
    await ctx.db
      .query("outboundWebhookDeliveryLogs")
      .withIndex("by_organization", (q) => q.eq("organizationId", fromId))
      .collect(),
  );
  push(
    "integrationAccessTokens",
    await ctx.db
      .query("integrationAccessTokens")
      .filter((q) => q.eq(q.field("organizationId"), fromId))
      .collect(),
  );

  return out;
}

async function countAuthUsersDefaultOrg(
  ctx: MutationCtx,
  organizationId: Id<"organizations">,
): Promise<number> {
  const rows = await ctx.db
    .query("authUsers")
    .filter((q) => q.eq(q.field("defaultOrganizationId"), organizationId))
    .collect();
  return rows.length;
}

async function countActivityFeedOrgScope(
  ctx: MutationCtx,
  scopeId: string,
): Promise<number> {
  return ctx.db
    .query("activityFeed")
    .withIndex("by_scope_at", (q) =>
      q.eq("scopeKind", "org").eq("scopeId", scopeId),
    )
    .collect()
    .then((r) => r.length);
}

async function countOrgScopeStringTable(
  ctx: MutationCtx,
  table:
    | "clientPortalIdentities"
    | "clientPortalGrants"
    | "clientPortalSessions"
    | "clientPortalMagicLinks",
  orgScope: string,
): Promise<number> {
  const rows = await ctx.db
    .query(table)
    .filter((q) => q.eq(q.field("orgScope"), orgScope))
    .collect();
  return rows.length;
}

async function countSecurityAuditLogOrgScope(
  ctx: MutationCtx,
  orgScope: string,
): Promise<number> {
  const rows = await ctx.db
    .query("securityAuditLog")
    .filter((q) => q.eq(q.field("orgScope"), orgScope))
    .collect();
  return rows.length;
}

async function assertTargetVacant(
  ctx: MutationCtx,
  toId: Id<"organizations">,
): Promise<void> {
  const members = await ctx.db
    .query("organizationMembers")
    .withIndex("by_organization", (q) => q.eq("organizationId", toId))
    .collect();
  if (members.length > 0) {
    throw new Error(
      "Target organization already has members. Pass allowNonEmptyTarget:true only if you accept merge risk.",
    );
  }
  const perms = await ctx.db
    .query("organizationPermissions")
    .withIndex("by_organization", (q) => q.eq("organizationId", toId))
    .collect();
  if (perms.length > 0) {
    throw new Error(
      "Target organization already has organizationPermissions rows; refusing to avoid duplicate overlays.",
    );
  }
  const nav = await ctx.db
    .query("organizationNavigationPolicy")
    .withIndex("by_organization", (q) => q.eq("organizationId", toId))
    .collect();
  if (nav.length > 0) {
    throw new Error(
      "Target organization already has organizationNavigationPolicy; refusing duplicate policy rows after repoint.",
    );
  }
  const domains = await ctx.db
    .query("organizationCustomDomains")
    .withIndex("by_organization", (q) => q.eq("organizationId", toId))
    .collect();
  if (domains.length > 0) {
    throw new Error(
      "Target organization already has organizationCustomDomains; refusing to avoid hostname conflicts after repoint.",
    );
  }
}

async function buildOrgPatchCounts(
  ctx: MutationCtx,
  organizationId: Id<"organizations">,
): Promise<Record<string, number>> {
  const refs = await collectDocsWithOrganizationId(ctx, organizationId);
  const out: Record<string, number> = {};
  for (const { table } of refs) {
    out[table] = (out[table] ?? 0) + 1;
  }
  const fromKey = String(organizationId);
  out.activityFeed_orgScope = await countActivityFeedOrgScope(ctx, fromKey);
  out.clientPortalIdentities = await countOrgScopeStringTable(
    ctx,
    "clientPortalIdentities",
    fromKey,
  );
  out.clientPortalGrants = await countOrgScopeStringTable(
    ctx,
    "clientPortalGrants",
    fromKey,
  );
  out.clientPortalSessions = await countOrgScopeStringTable(
    ctx,
    "clientPortalSessions",
    fromKey,
  );
  out.clientPortalMagicLinks = await countOrgScopeStringTable(
    ctx,
    "clientPortalMagicLinks",
    fromKey,
  );
  out.securityAuditLog_orgScope = await countSecurityAuditLogOrgScope(
    ctx,
    fromKey,
  );
  out.authUsers_defaultOrganizationId = await countAuthUsersDefaultOrg(
    ctx,
    organizationId,
  );
  return out;
}

const sharedArgs = {
  adminSecret: v.string(),
  fromOrganizationId: v.id("organizations"),
  toOrganizationId: v.optional(v.id("organizations")),
  /** When true and `toOrganizationId` omitted, inserts a new `organizations` row. */
  createTargetOrganization: v.optional(v.boolean()),
  targetOrganizationName: v.optional(v.string()),
  copyBillingAndStripe: v.optional(v.boolean()),
  copyBranding: v.optional(v.boolean()),
  copySlugDemoAndBundle: v.optional(v.boolean()),
  allowNonEmptyTarget: v.optional(v.boolean()),
  /** After successful repoint, delete members + roles on the source org, and optionally the org row. */
  removeSourceOrgShell: v.optional(v.boolean()),
};

export const planOrgTenantRepoint = mutation({
  args: sharedArgs,
  handler: async (
    ctx,
    {
      adminSecret,
      fromOrganizationId,
      toOrganizationId,
      createTargetOrganization,
      targetOrganizationName,
      copyBillingAndStripe,
      copyBranding,
      copySlugDemoAndBundle,
    },
  ) => {
    assertDataMigrationAdmin(adminSecret);
    const fromDoc = await ctx.db.get(fromOrganizationId);
    if (!fromDoc) throw new Error("fromOrganizationId not found.");

    const willCreate =
      !toOrganizationId && (createTargetOrganization ?? false);
    if (!toOrganizationId && !willCreate) {
      throw new Error(
        "Provide toOrganizationId or set createTargetOrganization:true.",
      );
    }

    const sourceMembers = await ctx.db
      .query("organizationMembers")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", fromOrganizationId),
      )
      .collect();
    const userKeys = new Set(sourceMembers.map((m) => m.userKey));
    const sourceRoles = await ctx.db
      .query("organizationRoles")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", fromOrganizationId),
      )
      .collect();
    const customRoleCount = sourceRoles.filter((r) => !r.isSystem).length;

    const patchCounts = await buildOrgPatchCounts(ctx, fromOrganizationId);

    return {
      fromOrganizationId,
      willCreateTarget: willCreate,
      toOrganizationId: toOrganizationId ?? null,
      sourceOrganizationName: fromDoc.name,
      sourceDistinctMembers: userKeys.size,
      sourceRoleRows: sourceRoles.length,
      sourceCustomRoles: customRoleCount,
      targetNamePreview:
        targetOrganizationName?.trim() ||
        (willCreate ? fromDoc.name : undefined),
      copyBillingAndStripe: copyBillingAndStripe ?? false,
      copyBranding: copyBranding ?? true,
      copySlugDemoAndBundle: copySlugDemoAndBundle ?? false,
      patchRowCounts: patchCounts,
    };
  },
});

export const applyOrgTenantRepoint = mutation({
  args: {
    ...sharedArgs,
    dryRun: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    assertDataMigrationAdmin(args.adminSecret);
    const dryRun = args.dryRun ?? false;

    const fromDoc = await ctx.db.get(args.fromOrganizationId);
    if (!fromDoc) throw new Error("fromOrganizationId not found.");

    let toId = args.toOrganizationId;
    const createTarget = !toId && (args.createTargetOrganization ?? false);
    if (!toId && !createTarget) {
      throw new Error(
        "Provide toOrganizationId or set createTargetOrganization:true.",
      );
    }

    const now = Date.now();
    const copyStripe = args.copyBillingAndStripe ?? false;
    const copyBranding = args.copyBranding ?? true;
    const copySlugDemo = args.copySlugDemoAndBundle ?? false;

    if (toId && toId === args.fromOrganizationId) {
      throw new Error("fromOrganizationId and toOrganizationId must differ.");
    }

    if (toId) {
      const targetDoc = await ctx.db.get(toId);
      if (!targetDoc) throw new Error("toOrganizationId not found.");
    }

    if (createTarget) {
      const name =
        args.targetOrganizationName?.trim() || fromDoc.name || "Organization";
      if (!dryRun) {
        toId = await ctx.db.insert("organizations", {
          name,
          plan: fromDoc.plan ?? "basic",
          ...(copyStripe
            ? {
                planSource: fromDoc.planSource,
                stripeCustomerId: fromDoc.stripeCustomerId,
                stripeSubscriptionId: fromDoc.stripeSubscriptionId,
                subscriptionStatus: fromDoc.subscriptionStatus,
                subscriptionCancelAtPeriodEnd:
                  fromDoc.subscriptionCancelAtPeriodEnd,
                subscriptionCurrentPeriodEnd:
                  fromDoc.subscriptionCurrentPeriodEnd,
                stripePriceId: fromDoc.stripePriceId,
              }
            : {}),
          ...(copyBranding && fromDoc.branding
            ? { branding: fromDoc.branding }
            : {}),
          ...(copySlugDemo
            ? {
                slug: fromDoc.slug,
                demoWorkspaceBundleId: fromDoc.demoWorkspaceBundleId,
              }
            : {}),
          createdAt: now,
          updatedAt: now,
        });
      } else {
        toId = args.fromOrganizationId;
      }
    }

    if (!toId) throw new Error("Internal: missing toOrganizationId.");

    if (!dryRun && !args.allowNonEmptyTarget) {
      await assertTargetVacant(ctx, toId);
    }

    if (dryRun) {
      const patchCounts = await buildOrgPatchCounts(ctx, args.fromOrganizationId);
      const sourceMembers = await ctx.db
        .query("organizationMembers")
        .withIndex("by_organization", (q) =>
          q.eq("organizationId", args.fromOrganizationId),
        )
        .collect();
      const userKeys = new Set(sourceMembers.map((m) => m.userKey));
      return {
        dryRun: true,
        fromOrganizationId: args.fromOrganizationId,
        toOrganizationId: createTarget ? null : toId,
        wouldCreateTarget: createTarget,
        rowsToPatch: patchCounts,
        membersToClone: userKeys.size,
        message: createTarget
          ? "Dry run only — target org would be created on apply."
          : "Dry run only.",
      };
    }

    /* --- Real apply --- */
    const seeded = await seedSystemRolesForOrganization(ctx, toId);
    await syncSystemRolePermissions(ctx, toId);

    const systemKeyToId: Record<string, Id<"organizationRoles">> = {
      [SYSTEM_ORG_ROLE_KEYS.admin]: seeded.adminId,
      [SYSTEM_ORG_ROLE_KEYS.manager]: seeded.managerId,
      [SYSTEM_ORG_ROLE_KEYS.user]: seeded.userId,
    };

    const sourceRoles = await ctx.db
      .query("organizationRoles")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", args.fromOrganizationId),
      )
      .collect();

    const roleIdMap = new Map<Id<"organizationRoles">, Id<"organizationRoles">>();

    for (const old of sourceRoles) {
      if (old.isSystem) {
        const nid = systemKeyToId[old.key];
        if (!nid) {
          throw new Error(
            `Source has unknown system role key "${old.key}"; cannot map to target.`,
          );
        }
        roleIdMap.set(old._id, nid);
      }
    }

    for (const old of sourceRoles) {
      if (old.isSystem) continue;
      const newRoleId = await ctx.db.insert("organizationRoles", {
        organizationId: toId,
        key: old.key,
        label: old.label,
        description: old.description,
        permissions: validateCustomPermissions(old.permissions),
        isSystem: false,
        createdAt: now,
        updatedAt: now,
      });
      roleIdMap.set(old._id, newRoleId);
    }

    const sourceMembers = await ctx.db
      .query("organizationMembers")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", args.fromOrganizationId),
      )
      .collect();

    const byUser = new Map<string, Doc<"organizationMembers">[]>();
    for (const m of sourceMembers) {
      let g = byUser.get(m.userKey);
      if (!g) {
        g = [];
        byUser.set(m.userKey, g);
      }
      g.push(m);
    }

    let membersInserted = 0;
    for (const [, rows] of byUser) {
      const canon = pickCanonicalOrgMember(rows);
      if (!canon) continue;
      let assigned: Id<"organizationRoles"> | undefined;
      if (canon.assignedRoleId) {
        const mapped = roleIdMap.get(canon.assignedRoleId);
        assigned = mapped ?? undefined;
      }
      await ctx.db.insert("organizationMembers", {
        organizationId: toId,
        userKey: canon.userKey,
        role: canon.role,
        assignedRoleId: assigned,
        createdAt: canon.createdAt,
      });
      membersInserted += 1;
    }

    let patchedOrgIdRows = 0;
    const orgScoped = await collectDocsWithOrganizationId(
      ctx,
      args.fromOrganizationId,
    );
    for (const { id } of orgScoped) {
      await ctx.db.patch(id, { organizationId: toId });
      patchedOrgIdRows += 1;
    }

    const fromScope = String(args.fromOrganizationId);
    const toScope = String(toId);

    const actRows = await ctx.db
      .query("activityFeed")
      .withIndex("by_scope_at", (q) =>
        q.eq("scopeKind", "org").eq("scopeId", fromScope),
      )
      .collect();
    for (const row of actRows) {
      await ctx.db.patch(row._id, { scopeId: toScope });
    }

    async function patchOrgScope(
      table:
        | "clientPortalIdentities"
        | "clientPortalGrants"
        | "clientPortalSessions"
        | "clientPortalMagicLinks",
    ) {
      const rows = await ctx.db
        .query(table)
        .filter((q) => q.eq(q.field("orgScope"), fromScope))
        .collect();
      for (const row of rows) {
        await ctx.db.patch(row._id, { orgScope: toScope } as Record<
          string,
          unknown
        >);
      }
      return rows.length;
    }

    const portalPatchCounts = {
      clientPortalIdentities: await patchOrgScope("clientPortalIdentities"),
      clientPortalGrants: await patchOrgScope("clientPortalGrants"),
      clientPortalSessions: await patchOrgScope("clientPortalSessions"),
      clientPortalMagicLinks: await patchOrgScope("clientPortalMagicLinks"),
    };

    const auditRows = await ctx.db
      .query("securityAuditLog")
      .filter((q) => q.eq(q.field("orgScope"), fromScope))
      .collect();
    for (const row of auditRows) {
      await ctx.db.patch(row._id, { orgScope: toScope });
    }

    const authRows = await ctx.db
      .query("authUsers")
      .filter((q) =>
        q.eq(q.field("defaultOrganizationId"), args.fromOrganizationId),
      )
      .collect();
    for (const row of authRows) {
      await ctx.db.patch(row._id, { defaultOrganizationId: toId });
    }

    let deletedSourceMembers = 0;
    let deletedSourceRoles = 0;
    if (args.removeSourceOrgShell) {
      for (const m of sourceMembers) {
        await ctx.db.delete(m._id);
        deletedSourceMembers += 1;
      }
      for (const r of sourceRoles) {
        await ctx.db.delete(r._id);
        deletedSourceRoles += 1;
      }
      const strayOrgId = await collectDocsWithOrganizationId(
        ctx,
        args.fromOrganizationId,
      );
      if (strayOrgId.length > 0) {
        throw new Error(
          `Refusing to delete source org: ${strayOrgId.length} docs still have organizationId (e.g. ${strayOrgId[0]?.table}).`,
        );
      }
      const strayScope = String(args.fromOrganizationId);
      if ((await countActivityFeedOrgScope(ctx, strayScope)) > 0) {
        throw new Error(
          "Refusing to delete source org: activityFeed still references old org scopeId.",
        );
      }
      const portalLeft =
        (await countOrgScopeStringTable(
          ctx,
          "clientPortalIdentities",
          strayScope,
        )) +
        (await countOrgScopeStringTable(
          ctx,
          "clientPortalGrants",
          strayScope,
        )) +
        (await countOrgScopeStringTable(
          ctx,
          "clientPortalSessions",
          strayScope,
        )) +
        (await countOrgScopeStringTable(
          ctx,
          "clientPortalMagicLinks",
          strayScope,
        ));
      if (portalLeft > 0) {
        throw new Error(
          "Refusing to delete source org: client portal rows still reference old orgScope.",
        );
      }
      if ((await countSecurityAuditLogOrgScope(ctx, strayScope)) > 0) {
        throw new Error(
          "Refusing to delete source org: securityAuditLog still references old orgScope.",
        );
      }
      if ((await countAuthUsersDefaultOrg(ctx, args.fromOrganizationId)) > 0) {
        throw new Error(
          "Refusing to delete source org: authUsers.defaultOrganizationId still points at source.",
        );
      }
      await ctx.db.delete(args.fromOrganizationId);
    }

    return {
      dryRun: false,
      fromOrganizationId: args.fromOrganizationId,
      toOrganizationId: toId,
      createdTarget: createTarget,
      membersInserted,
      patchedOrgIdRows,
      activityFeedRows: actRows.length,
      portalScopesPatched: portalPatchCounts,
      securityAuditRows: auditRows.length,
      authUsersDefaultOrgPatched: authRows.length,
      deletedSourceMembers: args.removeSourceOrgShell ? deletedSourceMembers : 0,
      deletedSourceRoles: args.removeSourceOrgShell ? deletedSourceRoles : 0,
      deletedSourceOrganization: Boolean(args.removeSourceOrgShell),
    };
  },
});
