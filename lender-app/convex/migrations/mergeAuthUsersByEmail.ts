/**
 * Merge duplicate internal-auth accounts that share an email (and optional username match)
 * into one canonical `authUsers` row. Rewrites workspace keys across the schema and
 * produces an auditable summary for operators.
 *
 * Run with `dryRun: true` first from the Convex dashboard or a trusted script.
 */
import { v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import { mutation } from "../_generated/server";
import type { MutationCtx } from "../_generated/server";
import { assertDataMigrationAdmin } from "../migrationAdminAuth";
import { normalizeAuthEmail } from "../../lib/auth/normalizeAuthEmail";
import { normalizeUsername } from "../../lib/auth/normalizeUsername";
import {
  mergeServerUserPreferences,
  mergeUserPreferencesPatch,
} from "../../lib/userPreferencesModel";

function roleRank(role: Doc<"organizationMembers">["role"]): number {
  if (role === "owner") return 3;
  if (role === "admin") return 2;
  return 1;
}

function betterMemberRole(
  a: Doc<"organizationMembers">["role"],
  b: Doc<"organizationMembers">["role"],
): Doc<"organizationMembers">["role"] {
  return roleRank(a) >= roleRank(b) ? a : b;
}

function pickCanonicalAuthUser<T extends Doc<"authUsers">>(
  matches: T[],
  explicit: Id<"authUsers"> | undefined,
): T {
  if (explicit) {
    const hit = matches.find((m) => m._id === explicit);
    if (!hit) {
      throw new Error(
        `canonicalAuthUserId ${explicit} is not among the matched auth users for this email.`,
      );
    }
    return hit;
  }
  let best = matches[0]!;
  for (let i = 1; i < matches.length; i++) {
    const cur = matches[i]!;
    if (cur.createdAt > best.createdAt) best = cur;
  }
  return best;
}

function buildKeySet(oldIds: Id<"authUsers">[]): Set<string> {
  return new Set(oldIds.map((id) => id as string));
}

function replaceInStringSet(
  value: string | undefined,
  oldKeys: Set<string>,
  newKey: string,
): string | undefined {
  if (!value) return value;
  const t = value.trim();
  return oldKeys.has(t) ? newKey : value;
}

function replaceKeyList(
  ids: string[] | undefined,
  oldKeys: Set<string>,
  newKey: string,
): string[] | undefined {
  if (!ids?.length) return ids;
  let changed = false;
  const next = ids.map((id) => {
    if (oldKeys.has(id.trim())) {
      changed = true;
      return newKey;
    }
    return id;
  });
  return changed ? [...new Set(next)] : ids;
}

async function mergeOrganizationMembers(
  ctx: MutationCtx,
  oldKeys: Set<string>,
  newKey: string,
  now: number,
  dryRun: boolean,
  summary: Record<string, number>,
): Promise<void> {
  const all = await ctx.db.query("organizationMembers").collect();
  for (const m of all) {
    if (!oldKeys.has(m.userKey.trim())) continue;

    const dup = await ctx.db
      .query("organizationMembers")
      .withIndex("by_org_user", (q) =>
        q.eq("organizationId", m.organizationId).eq("userKey", newKey),
      )
      .first();

    if (dup) {
      const role = betterMemberRole(dup.role, m.role);
      const assignedRoleId =
        dup.assignedRoleId ?? m.assignedRoleId ?? undefined;
      if (!dryRun) {
        await ctx.db.patch(dup._id, {
          role,
          ...(assignedRoleId ? { assignedRoleId } : {}),
        });
        await ctx.db.delete(m._id);
      }
      summary.organizationMembersMerged++;
    } else if (!dryRun) {
      await ctx.db.patch(m._id, { userKey: newKey });
      summary.organizationMembersRekeyed++;
    } else {
      summary.organizationMembersRekeyed++;
    }
  }

  const mergedMemberships = await ctx.db
    .query("organizationMembers")
    .withIndex("by_user_org", (q) => q.eq("userKey", newKey))
    .collect();
  const byOrg = new Map<string, Doc<"organizationMembers">[]>();
  for (const m of mergedMemberships) {
    const k = m.organizationId as string;
    const g = byOrg.get(k) ?? [];
    g.push(m);
    byOrg.set(k, g);
  }
  for (const rows of byOrg.values()) {
    if (rows.length <= 1) continue;
    let best = rows[0]!;
    for (const r of rows.slice(1)) {
      if (roleRank(r.role) > roleRank(best.role)) best = r;
      else if (roleRank(r.role) === roleRank(best.role)) {
        if (r._creationTime > best._creationTime) best = r;
      }
    }
    for (const r of rows) {
      if (r._id !== best._id) {
        if (!dryRun) await ctx.db.delete(r._id);
        summary.organizationMemberDupesRemoved++;
      }
    }
  }
}

async function migrateUserPreferencesAccount(
  ctx: MutationCtx,
  oldKeys: Set<string>,
  newKey: string,
  now: number,
  dryRun: boolean,
  summary: Record<string, number>,
): Promise<void> {
  for (const oldKey of oldKeys) {
    const oldRows = await ctx.db
      .query("userPreferences")
      .withIndex("by_accountId", (q) => q.eq("accountId", oldKey))
      .collect();
    for (const oldRow of oldRows) {
      const newRows = await ctx.db
        .query("userPreferences")
        .withIndex("by_accountId", (q) => q.eq("accountId", newKey))
        .collect();
      const newRow = newRows[0];
      if (newRow) {
        const merged = mergeUserPreferencesPatch(
          mergeServerUserPreferences(oldRow),
          mergeServerUserPreferences(newRow),
        );
        if (!dryRun) {
          await ctx.db.patch(newRow._id, {
            ...merged,
            accountId: newKey,
            updatedAt: now,
          });
          await ctx.db.delete(oldRow._id);
        }
        summary.userPreferencesMerged++;
      } else if (!dryRun) {
        await ctx.db.patch(oldRow._id, { accountId: newKey, updatedAt: now });
        summary.userPreferencesRekeyed++;
      } else {
        summary.userPreferencesRekeyed++;
      }
    }
  }
}

async function rekeyAccountTable(
  ctx: MutationCtx,
  table:
    | "navigationUserConfig"
    | "userSimpleWorkflows"
    | "pipelineFileUserTemplates",
  oldKeys: Set<string>,
  newKey: string,
  now: number,
  dryRun: boolean,
  summary: Record<string, number>,
): Promise<void> {
  for (const oldKey of oldKeys) {
    const rows = await ctx.db
      .query(table)
      .withIndex("by_accountId", (q) => q.eq("accountId", oldKey))
      .collect();
    for (const row of rows) {
      const existing = await ctx.db
        .query(table)
        .withIndex("by_accountId", (q) => q.eq("accountId", newKey))
        .collect();
      if (existing.length > 0) {
        if (!dryRun) {
          await ctx.db.delete(row._id);
        }
        summary[`${table}_duplicateDropped`] =
          (summary[`${table}_duplicateDropped`] ?? 0) + 1;
      } else if (!dryRun) {
        await ctx.db.patch(row._id, { accountId: newKey, updatedAt: now });
        summary[`${table}_rekeyed`] = (summary[`${table}_rekeyed`] ?? 0) + 1;
      } else {
        summary[`${table}_rekeyed`] = (summary[`${table}_rekeyed`] ?? 0) + 1;
      }
    }
  }
}

async function patchAuthUsersProfile(
  ctx: MutationCtx,
  canonical: Doc<"authUsers">,
  losers: Doc<"authUsers">[],
  now: number,
  dryRun: boolean,
  summary: Record<string, number>,
): Promise<void> {
  let patch: Record<string, unknown> = {};
  let defOrg = canonical.defaultOrganizationId;
  if (!defOrg) {
    for (const l of losers) {
      if (l.defaultOrganizationId) {
        defOrg = l.defaultOrganizationId;
        break;
      }
    }
    if (defOrg) patch.defaultOrganizationId = defOrg;
  }
  let isGlobal = canonical.isGlobalAdmin === true;
  let systemRole = canonical.systemRole;
  for (const l of losers) {
    if (l.isGlobalAdmin) isGlobal = true;
    if (l.systemRole === "SUPER_ADMIN") systemRole = "SUPER_ADMIN";
  }
  if (isGlobal && !canonical.isGlobalAdmin) {
    patch.isGlobalAdmin = true;
  }
  if (systemRole === "SUPER_ADMIN" && canonical.systemRole !== "SUPER_ADMIN") {
    patch.systemRole = "SUPER_ADMIN";
  }
  if (Object.keys(patch).length) {
    patch.updatedAt = now;
    if (!dryRun) await ctx.db.patch(canonical._id, patch);
    summary.authUsersCanonicalProfileMerged++;
  }
}

async function orphanAuthCleanup(
  ctx: MutationCtx,
  dryRun: boolean,
  summary: Record<string, number>,
): Promise<void> {
  const users = await ctx.db.query("authUsers").collect();
  const valid = new Set(users.map((u) => u._id));

  for (const s of await ctx.db.query("authSessions").collect()) {
    if (!valid.has(s.userId)) {
      if (!dryRun) await ctx.db.delete(s._id);
      summary.orphanAuthSessionsDeleted++;
    }
  }
  for (const t of await ctx.db.query("authPasswordResetTokens").collect()) {
    if (!valid.has(t.userId)) {
      if (!dryRun) await ctx.db.delete(t._id);
      summary.orphanAuthPasswordResetTokensDeleted++;
    }
  }
  for (const t of await ctx.db.query("authEmailVerificationTokens").collect()) {
    if (!valid.has(t.userId)) {
      if (!dryRun) await ctx.db.delete(t._id);
      summary.orphanAuthEmailVerificationTokensDeleted++;
    }
  }
}

export const mergeAuthUsersByEmail = mutation({
  args: {
    adminSecret: v.string(),
    /** Lowercase email match against `authUsers.email` (e.g. joshua@directlendingconnection.com). */
    email: v.string(),
    /** When true (default), also match `authUsers.normalizedUsername === email`. */
    matchUsernameAsEmail: v.optional(v.boolean()),
    /** Survivor row; defaults to the auth user with the latest `createdAt` among matches. */
    canonicalAuthUserId: v.optional(v.id("authUsers")),
    /**
     * Extra workspace keys (browser `accountId`, legacy subjects) to rewrite to the
     * canonical `authUsers` id. Must **not** be another live `authUsers` row unless
     * that id is already in the duplicate merge set for this email.
     */
    additionalKeysToRekey: v.optional(v.array(v.string())),
    /**
     * Single-tenant consolidation: rekey workspace rows from these `authUsers` ids to
     * the canonical survivor without requiring duplicate email rows. Does not delete
     * these users unless `deleteRekeyedAdditionalAuthUsers` is true.
     */
    rekeyAdditionalAuthUserIds: v.optional(v.array(v.id("authUsers"))),
    /** After rekeying, delete the listed `rekeyAdditionalAuthUserIds` rows and clean auth children. */
    deleteRekeyedAdditionalAuthUsers: v.optional(v.boolean()),
    dryRun: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    assertDataMigrationAdmin(args.adminSecret);
    const dryRun = args.dryRun === true;
    const now = Date.now();
    const normEmail = normalizeAuthEmail(args.email);
    if (!normEmail) {
      throw new Error("mergeAuthUsersByEmail: email required (non-empty after trim).");
    }
    const matchUsername = args.matchUsernameAsEmail !== false;

    const summary: Record<string, number> = {
      organizationMembersMerged: 0,
      organizationMembersRekeyed: 0,
      organizationMemberDupesRemoved: 0,
      authSessionsRekeyed: 0,
      authPasswordResetTokensRekeyed: 0,
      authEmailVerificationTokensRekeyed: 0,
      userPreferencesMerged: 0,
      userPreferencesRekeyed: 0,
      navigationUserConfig_rekeyed: 0,
      navigationUserConfig_duplicateDropped: 0,
      userSimpleWorkflows_rekeyed: 0,
      userSimpleWorkflows_duplicateDropped: 0,
      pipelineFileUserTemplates_rekeyed: 0,
      pipelineFileUserTemplates_duplicateDropped: 0,
      userOnboardingPatched: 0,
      pipelinePatched: 0,
      contactActivityPatched: 0,
      pipelineFileSharesPatched: 0,
      pipelineFileActivityPatched: 0,
      tasksPatched: 0,
      userNotificationsPatched: 0,
      taskNotificationsPatched: 0,
      activityFeedPatched: 0,
      libraryDocumentsPatched: 0,
      libraryDocumentVersionsPatched: 0,
      libraryDocumentLinksPatched: 0,
      fileMessagesPatched: 0,
      clientPortalGrantsPatched: 0,
      clientPortalRequestsPatched: 0,
      clientPortalUpdatesPatched: 0,
      clientPortalAuditPatched: 0,
      signatureEnvelopesPatched: 0,
      signatureAuditEventsPatched: 0,
      integrationApiKeysPatched: 0,
      integrationOAuthClientsPatched: 0,
      integrationAccessTokensPatched: 0,
      integrationConnectorsPatched: 0,
      systemEmailLogPatched: 0,
      emailInboxSyncPreferencesPatched: 0,
      outboundWebhookSubscriptionsPatched: 0,
      authUsersCanonicalProfileMerged: 0,
      authUsersDeleted: 0,
      orphanAuthSessionsDeleted: 0,
      orphanAuthPasswordResetTokensDeleted: 0,
      orphanAuthEmailVerificationTokensDeleted: 0,
    };

    const allAuth = await ctx.db.query("authUsers").collect();
    const matches = allAuth.filter((u) => {
      const emailHit = normalizeAuthEmail(u.email) === normEmail;
      const userHit =
        matchUsername && normalizeUsername(u.normalizedUsername) === normEmail;
      return emailHit || userHit;
    });

    if (matches.length === 0) {
      return {
        ok: false as const,
        reason: "no_matching_auth_users" as const,
        targetEmail: normEmail,
        dryRun,
        matches: [] as string[],
      };
    }

    const canonical = pickCanonicalAuthUser(matches, args.canonicalAuthUserId);
    const newKey = canonical._id as string;
    const oldIds = matches
      .filter((m) => m._id !== canonical._id)
      .map((m) => m._id);
    const oldKeys = buildKeySet(oldIds);

    const authIdSet = new Set(allAuth.map((u) => u._id as string));
    const rekeyAuthExtra = new Set(
      (args.rekeyAdditionalAuthUserIds ?? []).map((id) => id as string),
    );
    const extra = args.additionalKeysToRekey ?? [];
    for (const raw of extra) {
      const t = raw.trim();
      if (!t || t === newKey) continue;
      if (authIdSet.has(t) && !oldKeys.has(t) && !rekeyAuthExtra.has(t)) {
        throw new Error(
          `mergeAuthUsersByEmail: additionalKeysToRekey includes "${t}", which is another authUsers id not part of this email merge. Merge that account first or remove the key.`,
        );
      }
      oldKeys.add(t);
    }
    for (const rid of rekeyAuthExtra) {
      if (rid && rid !== newKey) oldKeys.add(rid);
    }

    if (oldKeys.size === 0) {
      return {
        ok: true as const,
        reason: "single_identity_nothing_to_merge" as const,
        targetEmail: normEmail,
        dryRun,
        canonicalAuthUserId: canonical._id,
        oldAuthUserIds: [] as string[],
        additionalKeysApplied: [] as string[],
        summary,
      };
    }

    await mergeOrganizationMembers(
      ctx,
      oldKeys,
      newKey,
      now,
      dryRun,
      summary,
    );
    await migrateUserPreferencesAccount(
      ctx,
      oldKeys,
      newKey,
      now,
      dryRun,
      summary,
    );
    await rekeyAccountTable(
      ctx,
      "navigationUserConfig",
      oldKeys,
      newKey,
      now,
      dryRun,
      summary,
    );
    await rekeyAccountTable(
      ctx,
      "userSimpleWorkflows",
      oldKeys,
      newKey,
      now,
      dryRun,
      summary,
    );
    await rekeyAccountTable(
      ctx,
      "pipelineFileUserTemplates",
      oldKeys,
      newKey,
      now,
      dryRun,
      summary,
    );

    for (const oldId of oldIds) {
      for (const s of await ctx.db
        .query("authSessions")
        .withIndex("by_user", (q) => q.eq("userId", oldId))
        .collect()) {
        if (!dryRun) {
          await ctx.db.patch(s._id, { userId: canonical._id, updatedAt: now });
        }
        summary.authSessionsRekeyed++;
      }
      for (const t of await ctx.db
        .query("authPasswordResetTokens")
        .withIndex("by_user", (q) => q.eq("userId", oldId))
        .collect()) {
        if (!dryRun) {
          await ctx.db.patch(t._id, { userId: canonical._id });
        }
        summary.authPasswordResetTokensRekeyed++;
      }
      for (const t of await ctx.db
        .query("authEmailVerificationTokens")
        .withIndex("by_user", (q) => q.eq("userId", oldId))
        .collect()) {
        if (!dryRun) {
          await ctx.db.patch(t._id, { userId: canonical._id });
        }
        summary.authEmailVerificationTokensRekeyed++;
      }
    }

    for (const row of await ctx.db.query("userOnboarding").collect()) {
      if (!oldKeys.has(row.userKey.trim())) continue;
      if (!dryRun) await ctx.db.patch(row._id, { userKey: newKey, updatedAt: now });
      summary.userOnboardingPatched++;
    }

    for (const p of await ctx.db.query("pipeline").collect()) {
      const patch: Record<string, unknown> = {};
      const ou = replaceInStringSet(p.ownerUserKey, oldKeys, newKey);
      if (ou !== p.ownerUserKey) patch.ownerUserKey = ou;
      const as = replaceInStringSet(p.assigneeId, oldKeys, newKey);
      if (as !== p.assigneeId) patch.assigneeId = as;
      const sw = replaceKeyList(p.sharedWithIds, oldKeys, newKey);
      if (
        sw !== undefined &&
        JSON.stringify(sw) !== JSON.stringify(p.sharedWithIds ?? [])
      ) {
        patch.sharedWithIds = sw;
      }
      if (Object.keys(patch).length) {
        patch.updatedAt = now;
        if (!dryRun) await ctx.db.patch(p._id, patch);
        summary.pipelinePatched++;
      }
    }

    for (const row of await ctx.db.query("contactActivity").collect()) {
      if (
        !row.actorUserKey ||
        !oldKeys.has(row.actorUserKey.trim())
      ) {
        continue;
      }
      if (!dryRun) await ctx.db.patch(row._id, { actorUserKey: newKey });
      summary.contactActivityPatched++;
    }

    for (const row of await ctx.db.query("pipelineFileShares").collect()) {
      const patch: Record<string, unknown> = {};
      if (oldKeys.has(row.userKey.trim())) patch.userKey = newKey;
      if (oldKeys.has(row.createdByUserKey.trim())) {
        patch.createdByUserKey = newKey;
      }
      if (Object.keys(patch).length) {
        patch.updatedAt = now;
        if (!dryRun) await ctx.db.patch(row._id, patch);
        summary.pipelineFileSharesPatched++;
      }
    }

    for (const row of await ctx.db.query("pipelineFileActivity").collect()) {
      if (
        !row.shareTargetUserKey ||
        !oldKeys.has(row.shareTargetUserKey.trim())
      ) {
        continue;
      }
      if (!dryRun) {
        await ctx.db.patch(row._id, { shareTargetUserKey: newKey });
      }
      summary.pipelineFileActivityPatched++;
    }

    for (const t of await ctx.db.query("tasks").collect()) {
      const patch: Record<string, unknown> = {};
      const aid = replaceInStringSet(t.assigneeId, oldKeys, newKey);
      if (aid !== t.assigneeId) patch.assigneeId = aid;
      const tw = replaceKeyList(t.sharedWithIds, oldKeys, newKey);
      if (
        tw !== undefined &&
        JSON.stringify(tw) !== JSON.stringify(t.sharedWithIds ?? [])
      ) {
        patch.sharedWithIds = tw;
      }
      if (Object.keys(patch).length) {
        patch.updatedAt = now;
        if (!dryRun) await ctx.db.patch(t._id, patch);
        summary.tasksPatched++;
      }
    }

    for (const row of await ctx.db.query("userNotifications").collect()) {
      const patch: Record<string, unknown> = {};
      if (oldKeys.has(row.userKey.trim())) patch.userKey = newKey;
      if (row.actorUserKey && oldKeys.has(row.actorUserKey.trim())) {
        patch.actorUserKey = newKey;
      }
      if (Object.keys(patch).length) {
        if (!dryRun) await ctx.db.patch(row._id, patch);
        summary.userNotificationsPatched++;
      }
    }

    for (const row of await ctx.db.query("taskNotifications").collect()) {
      const patch: Record<string, unknown> = {};
      if (oldKeys.has(row.userKey.trim())) patch.userKey = newKey;
      if (row.actorUserKey && oldKeys.has(row.actorUserKey.trim())) {
        patch.actorUserKey = newKey;
      }
      if (Object.keys(patch).length) {
        if (!dryRun) await ctx.db.patch(row._id, patch);
        summary.taskNotificationsPatched++;
      }
    }

    for (const row of await ctx.db.query("activityFeed").collect()) {
      const patch: Record<string, unknown> = {};
      if (oldKeys.has(row.actorKey.trim())) patch.actorKey = newKey;
      if (
        row.scopeKind === "user" &&
        row.scopeId &&
        oldKeys.has(row.scopeId.trim())
      ) {
        patch.scopeId = newKey;
      }
      if (Object.keys(patch).length) {
        if (!dryRun) await ctx.db.patch(row._id, patch);
        summary.activityFeedPatched++;
      }
    }

    for (const row of await ctx.db.query("libraryDocuments").collect()) {
      if (!oldKeys.has(row.createdByUserKey.trim())) continue;
      if (!dryRun) {
        await ctx.db.patch(row._id, {
          createdByUserKey: newKey,
          updatedAt: now,
        });
      }
      summary.libraryDocumentsPatched++;
    }

    for (const row of await ctx.db.query("libraryDocumentVersions").collect()) {
      if (!oldKeys.has(row.uploadedByUserKey.trim())) continue;
      if (!dryRun) {
        await ctx.db.patch(row._id, { uploadedByUserKey: newKey });
      }
      summary.libraryDocumentVersionsPatched++;
    }

    for (const row of await ctx.db.query("libraryDocumentLinks").collect()) {
      if (!oldKeys.has(row.linkedByUserKey.trim())) continue;
      if (!dryRun) await ctx.db.patch(row._id, { linkedByUserKey: newKey });
      summary.libraryDocumentLinksPatched++;
    }

    for (const row of await ctx.db.query("fileMessages").collect()) {
      if (!row.teamUserKey || !oldKeys.has(row.teamUserKey.trim())) continue;
      if (!dryRun) await ctx.db.patch(row._id, { teamUserKey: newKey });
      summary.fileMessagesPatched++;
    }

    for (const row of await ctx.db.query("clientPortalGrants").collect()) {
      if (!oldKeys.has(row.invitedByUserKey.trim())) continue;
      if (!dryRun) {
        await ctx.db.patch(row._id, { invitedByUserKey: newKey, updatedAt: now });
      }
      summary.clientPortalGrantsPatched++;
    }

    for (const row of await ctx.db.query("clientPortalRequests").collect()) {
      if (!oldKeys.has(row.createdByUserKey.trim())) continue;
      if (!dryRun) {
        await ctx.db.patch(row._id, { createdByUserKey: newKey, updatedAt: now });
      }
      summary.clientPortalRequestsPatched++;
    }

    for (const row of await ctx.db.query("clientPortalUpdates").collect()) {
      if (!oldKeys.has(row.createdByUserKey.trim())) continue;
      if (!dryRun) await ctx.db.patch(row._id, { createdByUserKey: newKey });
      summary.clientPortalUpdatesPatched++;
    }

    for (const row of await ctx.db.query("clientPortalAudit").collect()) {
      if (row.actorType !== "broker") continue;
      if (!oldKeys.has(row.actorKey.trim())) continue;
      if (!dryRun) await ctx.db.patch(row._id, { actorKey: newKey });
      summary.clientPortalAuditPatched++;
    }

    for (const row of await ctx.db.query("signatureEnvelopes").collect()) {
      if (!oldKeys.has(row.createdByUserKey.trim())) continue;
      if (!dryRun) {
        await ctx.db.patch(row._id, {
          createdByUserKey: newKey,
          updatedAt: now,
        });
      }
      summary.signatureEnvelopesPatched++;
    }

    for (const row of await ctx.db.query("signatureAuditEvents").collect()) {
      if (row.actorType !== "broker") continue;
      if (!oldKeys.has(row.actorKey.trim())) continue;
      if (!dryRun) await ctx.db.patch(row._id, { actorKey: newKey });
      summary.signatureAuditEventsPatched++;
    }

    for (const row of await ctx.db.query("integrationApiKeys").collect()) {
      if (!oldKeys.has(row.actorUserKey.trim())) continue;
      if (!dryRun) await ctx.db.patch(row._id, { actorUserKey: newKey });
      summary.integrationApiKeysPatched++;
    }

    for (const row of await ctx.db.query("integrationOAuthClients").collect()) {
      if (!oldKeys.has(row.actorUserKey.trim())) continue;
      if (!dryRun) await ctx.db.patch(row._id, { actorUserKey: newKey });
      summary.integrationOAuthClientsPatched++;
    }

    for (const row of await ctx.db.query("integrationAccessTokens").collect()) {
      if (!oldKeys.has(row.actorUserKey.trim())) continue;
      if (!dryRun) await ctx.db.patch(row._id, { actorUserKey: newKey });
      summary.integrationAccessTokensPatched++;
    }

    for (const row of await ctx.db.query("integrationConnectors").collect()) {
      if (!oldKeys.has(row.createdByUserKey.trim())) continue;
      if (!dryRun) {
        await ctx.db.patch(row._id, {
          createdByUserKey: newKey,
          updatedAt: now,
        });
      }
      summary.integrationConnectorsPatched++;
    }

    for (const row of await ctx.db.query("systemEmailLog").collect()) {
      if (!oldKeys.has(row.sentByUserKey.trim())) continue;
      if (!dryRun) {
        await ctx.db.patch(row._id, { sentByUserKey: newKey, updatedAt: now });
      }
      summary.systemEmailLogPatched++;
    }

    for (const row of await ctx.db.query("emailInboxSyncPreferences").collect()) {
      if (!oldKeys.has(row.userKey.trim())) continue;
      if (!dryRun) await ctx.db.patch(row._id, { userKey: newKey, updatedAt: now });
      summary.emailInboxSyncPreferencesPatched++;
    }

    for (const row of await ctx.db.query("outboundWebhookSubscriptions").collect()) {
      if (!oldKeys.has(row.createdByUserKey.trim())) continue;
      if (!dryRun) {
        await ctx.db.patch(row._id, {
          createdByUserKey: newKey,
          updatedAt: now,
        });
      }
      summary.outboundWebhookSubscriptionsPatched++;
    }

    const losers = matches.filter((m) => m._id !== canonical._id);
    await patchAuthUsersProfile(ctx, canonical, losers, now, dryRun, summary);

    for (const l of losers) {
      if (!dryRun) await ctx.db.delete(l._id);
      summary.authUsersDeleted++;
    }

    if (!dryRun && args.deleteRekeyedAdditionalAuthUsers === true) {
      for (const rid of rekeyAuthExtra) {
        if (rid === canonical._id) continue;
        const uid = rid as Id<"authUsers">;
        for (const s of await ctx.db
          .query("authSessions")
          .withIndex("by_user", (q) => q.eq("userId", uid))
          .collect()) {
          await ctx.db.delete(s._id);
        }
        for (const t of await ctx.db
          .query("authPasswordResetTokens")
          .withIndex("by_user", (q) => q.eq("userId", uid))
          .collect()) {
          await ctx.db.delete(t._id);
        }
        for (const t of await ctx.db
          .query("authEmailVerificationTokens")
          .withIndex("by_user", (q) => q.eq("userId", uid))
          .collect()) {
          await ctx.db.delete(t._id);
        }
        await ctx.db.delete(uid);
        summary.authUsersDeleted++;
      }
    }

    if (!dryRun) {
      await orphanAuthCleanup(ctx, false, summary);
    }

    const matchSnapshot = matches.map((m) => ({
      _id: m._id,
      normalizedUsername: m.normalizedUsername,
      email: m.email ?? null,
      createdAt: m.createdAt,
    }));

    return {
      ok: true as const,
      targetEmail: normEmail,
      dryRun,
      canonicalAuthUserId: canonical._id,
      oldAuthUserIds: [...oldIds].map(String),
      rekeyAdditionalAuthUserIds: [...rekeyAuthExtra].filter((k) => k && k !== newKey),
      additionalKeysApplied: (args.additionalKeysToRekey ?? [])
        .map((s) => s.trim())
        .filter((t) => t && t !== newKey),
      duplicateMergeCounts: {
        organizationMembersMerged: summary.organizationMembersMerged,
        organizationMemberDupesRemoved: summary.organizationMemberDupesRemoved,
        userPreferencesMerged: summary.userPreferencesMerged,
        navigationRowsDropped: summary.navigationUserConfig_duplicateDropped ?? 0,
        workflowRowsDropped: summary.userSimpleWorkflows_duplicateDropped ?? 0,
      },
      orphanCleanup: dryRun
        ? { skippedDryRun: true as const }
        : {
            authSessionsDeleted: summary.orphanAuthSessionsDeleted,
            authPasswordResetTokensDeleted:
              summary.orphanAuthPasswordResetTokensDeleted,
            authEmailVerificationTokensDeleted:
              summary.orphanAuthEmailVerificationTokensDeleted,
          },
      recordsMovedByTable: summary,
      matchedAuthUsers: matchSnapshot,
    };
  },
});
