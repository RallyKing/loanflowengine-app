/**
 * Admin migration: scrub legacy vendor-shaped user keys (`user_*`, `clerk_*`)
 * for the primary platform account and align org + file references to native `authUsers` ids.
 */
import { v } from "convex/values";
import type { Id } from "../_generated/dataModel";
import { mutation, type MutationCtx } from "../_generated/server";
import { findPrimaryPlatformAuthUser } from "../auth/findPrimaryPlatformUser";
import { PRIMARY_GLOBAL_ADMIN_CANONICAL } from "../auth/globalAdminBootstrap";
import { isLegacyExternalUserId } from "../dataMigration";
import { assertDataMigrationAdmin } from "../migrationAdminAuth";
import { pickCanonicalOrgMember } from "../orgMembership";

function isLegacyExternalUserKey(raw: string): boolean {
  const k = raw.trim();
  if (!k) return false;
  if (isLegacyExternalUserId(k)) return true;
  if (k.startsWith("clerk_")) return true;
  return false;
}

function buildLegacyKeySet(
  explicit: readonly string[] | undefined,
  additional: readonly string[] | undefined,
  discovered: Set<string>,
): Set<string> {
  const s = new Set<string>();
  for (const x of explicit ?? []) {
    const t = x.trim();
    if (t) s.add(t);
  }
  for (const x of additional ?? []) {
    const t = x.trim();
    if (t) s.add(t);
  }
  if (s.size === 0) {
    for (const k of discovered) s.add(k);
  }
  return s;
}

async function discoverLegacyExternalKeysInOrgs(
  ctx: MutationCtx,
  orgIds: Id<"organizations">[],
): Promise<Set<string>> {
  const found = new Set<string>();
  for (const organizationId of orgIds) {
    const members = await ctx.db
      .query("organizationMembers")
      .withIndex("by_organization", (q) => q.eq("organizationId", organizationId))
      .collect();
    for (const m of members) {
      if (isLegacyExternalUserKey(m.userKey)) found.add(m.userKey.trim());
    }
  }
  return found;
}

export const applyJoshuaLegacyUserKeyCleanup = mutation({
  args: {
    adminSecret: v.string(),
    /** If omitted, legacy keys are inferred from orgs where the primary admin is already a member (must be unambiguous). */
    legacyExternalUserIds: v.optional(v.array(v.string())),
    /** Extra raw strings to rewrite (malformed or other non-native keys). */
    additionalLegacyUserKeys: v.optional(v.array(v.string())),
    dryRun: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    assertDataMigrationAdmin(args.adminSecret);
    const dryRun = args.dryRun === true;
    const now = Date.now();
    const summary = {
      dryRun,
      primaryCanonical: PRIMARY_GLOBAL_ADMIN_CANONICAL,
      convexUserId: null as string | null,
      primaryOrganizationId: null as string | null,
      legacyKeysUsed: [] as string[],
      ambiguousDiscoveryError: null as string | null,
      organizationMembersDeleted: 0,
      organizationMembersPatched: 0,
      organizationMembersInserted: 0,
      pipelinePatched: 0,
      contactActivityPatched: 0,
      pipelineFileSharesPatched: 0,
      pipelineFileActivityPatched: 0,
      tasksPatched: 0,
      userOnboardingPatched: 0,
      userNotificationsPatched: 0,
      taskNotificationsPatched: 0,
      activityFeedPatched: 0,
      defaultOrgRepointed: false,
      libraryDocumentsPatched: 0,
      libraryDocumentVersionsPatched: 0,
      libraryDocumentLinksPatched: 0,
      fileMessagesPatched: 0,
    };

    const joshua = await findPrimaryPlatformAuthUser(ctx);
    if (!joshua) {
      return { ...summary, ok: false as const, reason: "auth_user_not_found" as const };
    }

    const convexKey = joshua._id as string;
    summary.convexUserId = convexKey;

    const convexMemberships = await ctx.db
      .query("organizationMembers")
      .withIndex("by_user_org", (q) => q.eq("userKey", convexKey))
      .collect();

    const candidateOrgIds = new Set<Id<"organizations">>();
    for (const m of convexMemberships) candidateOrgIds.add(m.organizationId);
    if (joshua.defaultOrganizationId) {
      candidateOrgIds.add(joshua.defaultOrganizationId);
    }

    const discovered = await discoverLegacyExternalKeysInOrgs(ctx, [...candidateOrgIds]);

    const noExplicitKeys =
      (!args.legacyExternalUserIds || args.legacyExternalUserIds.length === 0) &&
      (!args.additionalLegacyUserKeys || args.additionalLegacyUserKeys.length === 0);

    if (noExplicitKeys && discovered.size > 1) {
      summary.ambiguousDiscoveryError =
        `Multiple legacy external user keys in primary admin orgs: ${[...discovered].sort().join(", ")}. Pass legacyExternalUserIds.`;
      return { ...summary, ok: false as const, reason: "ambiguous_discovery" as const };
    }

    const legacySet = buildLegacyKeySet(
      args.legacyExternalUserIds,
      args.additionalLegacyUserKeys,
      discovered,
    );
    summary.legacyKeysUsed = [...legacySet].sort();

    let primaryOrgId: Id<"organizations"> | null =
      joshua.defaultOrganizationId ?? null;
    if (primaryOrgId) {
      const orgDoc = await ctx.db.get(primaryOrgId);
      if (!orgDoc) primaryOrgId = null;
    }
    if (!primaryOrgId) {
      const ownerRow = convexMemberships.find((m) => m.role === "owner");
      primaryOrgId =
        ownerRow?.organizationId ?? convexMemberships[0]?.organizationId ?? null;
    }
    if (!primaryOrgId) {
      return { ...summary, ok: false as const, reason: "no_primary_org" as const };
    }
    summary.primaryOrganizationId = primaryOrgId;

    const primaryOrgDoc = await ctx.db.get(primaryOrgId);
    if (!primaryOrgDoc) {
      return { ...summary, ok: false as const, reason: "primary_org_missing" as const };
    }

    if (!dryRun && joshua.defaultOrganizationId !== primaryOrgId) {
      await ctx.db.patch(joshua._id, {
        defaultOrganizationId: primaryOrgId,
        updatedAt: now,
      });
      summary.defaultOrgRepointed = true;
    }

    if (legacySet.size > 0) {
      const allMembers = await ctx.db.query("organizationMembers").collect();
      for (const m of allMembers) {
        if (!legacySet.has(m.userKey.trim())) continue;
        if (!dryRun) await ctx.db.delete(m._id);
        summary.organizationMembersDeleted++;
      }
    }

    const primaryDupes = await ctx.db
      .query("organizationMembers")
      .withIndex("by_org_user", (q) =>
        q.eq("organizationId", primaryOrgId).eq("userKey", convexKey),
      )
      .collect();

    const canonical = pickCanonicalOrgMember(primaryDupes);
    for (const m of primaryDupes) {
      if (canonical && m._id !== canonical._id) {
        if (!dryRun) await ctx.db.delete(m._id);
        summary.organizationMembersDeleted++;
      }
    }

    if (!canonical) {
      if (!dryRun) {
        await ctx.db.insert("organizationMembers", {
          organizationId: primaryOrgId,
          userKey: convexKey,
          role: "owner",
          createdAt: now,
        });
      }
      summary.organizationMembersInserted++;
    } else if (canonical.role !== "owner") {
      if (!dryRun) {
        await ctx.db.patch(canonical._id, { role: "owner" });
      }
      summary.organizationMembersPatched++;
    }

    const replaceKeyList = (ids: string[] | undefined): string[] | undefined => {
      if (!ids?.length) return ids;
      let changed = false;
      const next = ids.map((id) => {
        if (legacySet.has(id.trim())) {
          changed = true;
          return convexKey;
        }
        return id;
      });
      return changed ? [...new Set(next)] : ids;
    };

    const pipelineRows = await ctx.db.query("pipeline").collect();
    for (const p of pipelineRows) {
      const patch: Record<string, unknown> = {};
      if (p.ownerUserKey && legacySet.has(p.ownerUserKey.trim())) {
        patch.ownerUserKey = convexKey;
      }
      if (p.assigneeId && legacySet.has(p.assigneeId.trim())) {
        patch.assigneeId = convexKey;
      }
      const sw = replaceKeyList(p.sharedWithIds ?? undefined);
      if (sw !== undefined && JSON.stringify(sw) !== JSON.stringify(p.sharedWithIds)) {
        patch.sharedWithIds = sw;
      }
      const effectiveOwner = String(patch.ownerUserKey ?? p.ownerUserKey ?? "").trim();
      if (effectiveOwner === convexKey) {
        const orgBad = !p.organizationId || !(await ctx.db.get(p.organizationId));
        if (orgBad) patch.organizationId = primaryOrgId;
      }
      if (Object.keys(patch).length) {
        patch.updatedAt = now;
        if (!dryRun) await ctx.db.patch(p._id, patch);
        summary.pipelinePatched++;
      }
    }

    if (legacySet.size > 0) {
      for (const row of await ctx.db.query("contactActivity").collect()) {
        if (!row.actorUserKey || !legacySet.has(row.actorUserKey.trim())) continue;
        if (!dryRun) {
          await ctx.db.patch(row._id, { actorUserKey: convexKey });
        }
        summary.contactActivityPatched++;
      }

      for (const row of await ctx.db.query("pipelineFileShares").collect()) {
        const patch: Record<string, unknown> = {};
        if (legacySet.has(row.userKey.trim())) patch.userKey = convexKey;
        if (legacySet.has(row.createdByUserKey.trim())) patch.createdByUserKey = convexKey;
        if (Object.keys(patch).length) {
          patch.updatedAt = now;
          if (!dryRun) await ctx.db.patch(row._id, patch);
          summary.pipelineFileSharesPatched++;
        }
      }

      for (const row of await ctx.db.query("pipelineFileActivity").collect()) {
        if (
          !row.shareTargetUserKey ||
          !legacySet.has(row.shareTargetUserKey.trim())
        ) {
          continue;
        }
        if (!dryRun) {
          await ctx.db.patch(row._id, { shareTargetUserKey: convexKey });
        }
        summary.pipelineFileActivityPatched++;
      }

      for (const t of await ctx.db.query("tasks").collect()) {
        const patch: Record<string, unknown> = {};
        if (t.assigneeId && legacySet.has(t.assigneeId.trim())) {
          patch.assigneeId = convexKey;
        }
        const tw = replaceKeyList(t.sharedWithIds ?? undefined);
        if (tw !== undefined && JSON.stringify(tw) !== JSON.stringify(t.sharedWithIds)) {
          patch.sharedWithIds = tw;
        }
        if (Object.keys(patch).length) {
          patch.updatedAt = now;
          if (!dryRun) await ctx.db.patch(t._id, patch);
          summary.tasksPatched++;
        }
      }

      for (const row of await ctx.db.query("userOnboarding").collect()) {
        if (!legacySet.has(row.userKey.trim())) continue;
        if (!dryRun) await ctx.db.patch(row._id, { userKey: convexKey });
        summary.userOnboardingPatched++;
      }

      for (const row of await ctx.db.query("userNotifications").collect()) {
        const patch: Record<string, unknown> = {};
        if (legacySet.has(row.userKey.trim())) patch.userKey = convexKey;
        if (row.actorUserKey && legacySet.has(row.actorUserKey.trim())) {
          patch.actorUserKey = convexKey;
        }
        if (Object.keys(patch).length) {
          if (!dryRun) await ctx.db.patch(row._id, patch);
          summary.userNotificationsPatched++;
        }
      }

      for (const row of await ctx.db.query("taskNotifications").collect()) {
        const patch: Record<string, unknown> = {};
        if (legacySet.has(row.userKey.trim())) patch.userKey = convexKey;
        if (row.actorUserKey && legacySet.has(row.actorUserKey.trim())) {
          patch.actorUserKey = convexKey;
        }
        if (Object.keys(patch).length) {
          if (!dryRun) await ctx.db.patch(row._id, patch);
          summary.taskNotificationsPatched++;
        }
      }

      for (const row of await ctx.db.query("activityFeed").collect()) {
        const patch: Record<string, unknown> = {};
        if (legacySet.has(row.actorKey.trim())) patch.actorKey = convexKey;
        if (
          row.scopeKind === "user" &&
          row.scopeId &&
          legacySet.has(row.scopeId.trim())
        ) {
          patch.scopeId = convexKey;
        }
        if (Object.keys(patch).length) {
          if (!dryRun) await ctx.db.patch(row._id, patch);
          summary.activityFeedPatched++;
        }
      }

      for (const row of await ctx.db.query("libraryDocuments").collect()) {
        const patch: Record<string, unknown> = {};
        if (legacySet.has(row.createdByUserKey.trim())) {
          patch.createdByUserKey = convexKey;
        }
        const effectiveCreator = String(
          patch.createdByUserKey ?? row.createdByUserKey,
        ).trim();
        if (effectiveCreator === convexKey) {
          const orgBad =
            !row.organizationId || !(await ctx.db.get(row.organizationId));
          if (orgBad) patch.organizationId = primaryOrgId;
        }
        if (Object.keys(patch).length) {
          patch.updatedAt = now;
          if (!dryRun) await ctx.db.patch(row._id, patch);
          summary.libraryDocumentsPatched++;
        }
      }

      for (const row of await ctx.db.query("libraryDocumentVersions").collect()) {
        if (legacySet.has(row.uploadedByUserKey.trim())) {
          if (!dryRun) {
            await ctx.db.patch(row._id, { uploadedByUserKey: convexKey });
          }
          summary.libraryDocumentVersionsPatched++;
        }
      }

      for (const row of await ctx.db.query("libraryDocumentLinks").collect()) {
        if (legacySet.has(row.linkedByUserKey.trim())) {
          if (!dryRun) {
            await ctx.db.patch(row._id, { linkedByUserKey: convexKey });
          }
          summary.libraryDocumentLinksPatched++;
        }
      }

      for (const row of await ctx.db.query("fileMessages").collect()) {
        if (row.teamUserKey && legacySet.has(row.teamUserKey.trim())) {
          if (!dryRun) await ctx.db.patch(row._id, { teamUserKey: convexKey });
          summary.fileMessagesPatched++;
        }
      }
    }
    let primaryOwnerMembershipRows = 0;
    if (!dryRun) {
      const finalPrimaryMembers = await ctx.db
        .query("organizationMembers")
        .withIndex("by_org_user", (q) =>
          q.eq("organizationId", primaryOrgId).eq("userKey", convexKey),
        )
        .collect();
      primaryOwnerMembershipRows = finalPrimaryMembers.filter(
        (m) => m.role === "owner",
      ).length;
    }

    return {
      ...summary,
      ok: true as const,
      primaryOwnerMembershipRows:
        primaryOwnerMembershipRows > 0 ? primaryOwnerMembershipRows : undefined,
      primaryOwnerMembershipWarning:
        !dryRun && primaryOwnerMembershipRows !== 1
          ? `Expected exactly 1 owner membership for primary admin on primary org; found ${primaryOwnerMembershipRows}.`
          : undefined,
    };
  },
});
