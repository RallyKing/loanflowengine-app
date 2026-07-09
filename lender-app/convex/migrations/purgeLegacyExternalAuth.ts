/**
 * Remove legacy vendor-shaped subject strings (`user_*`, `org_*`, `clerk_*`) and related
 * rows so native `authUsers` ids are the only membership / actor identities.
 *
 * Does **not** remove the HMAC auth bridge (`signBridge` / `loginBridge`) used for
 * Next.js → Convex — that is internal native auth, not an external IdP.
 *
 * Always run with `dryRun: true` first. Deletes portal rows whose `orgScope` is `org_*`.
 */
import { v } from "convex/values";
import type { Doc, Id, TableNames } from "../_generated/dataModel";
import { mutation } from "../_generated/server";
import type { MutationCtx } from "../_generated/server";
import { assertDataMigrationAdmin } from "../migrationAdminAuth";
import { isLegacyExternalOrgId, isLegacyExternalUserId } from "../dataMigration";

const SYSTEM_ACTOR = "__system__";

function isLegacyUserSubject(raw: string | undefined): boolean {
  if (raw === undefined) return false;
  const t = raw.trim();
  if (!t) return false;
  if (isLegacyExternalUserId(t)) return true;
  if (t.startsWith("clerk_")) return true;
  return false;
}

function isLegacyOrgScope(raw: string | undefined): boolean {
  if (raw === undefined) return false;
  return isLegacyExternalOrgId(raw.trim());
}

function authUserRowIsLegacyExternal(u: Doc<"authUsers">): boolean {
  const a = u.normalizedUsername.trim();
  const b = u.displayUsername.trim();
  return (
    a.includes("clerk_") ||
    b.includes("clerk_") ||
    isLegacyExternalUserId(a) ||
    isLegacyExternalUserId(b)
  );
}

export const purgeLegacyExternalAuth = mutation({
  args: {
    adminSecret: v.string(),
    dryRun: v.boolean(),
    purgeExpiredSessions: v.optional(v.boolean()),
    deleteLegacyAuthUserDocuments: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    assertDataMigrationAdmin(args.adminSecret);
    const dryRun = args.dryRun === true;
    const purgeExpiredSessions = args.purgeExpiredSessions !== false;
    const deleteLegacyAuthUsers = args.deleteLegacyAuthUserDocuments !== false;
    const now = Date.now();

    const summary: Record<string, number> = {
      organizationMembersDeleted: 0,
      userOnboardingDeleted: 0,
      userPreferencesDeleted: 0,
      navigationUserConfigDeleted: 0,
      userSimpleWorkflowsDeleted: 0,
      pipelineFileUserTemplatesDeleted: 0,
      pipelinePatched: 0,
      pipelineFileSharesDeleted: 0,
      pipelineFileActivityPatched: 0,
      tasksPatched: 0,
      taskNotificationsDeleted: 0,
      taskNotificationsActorCleared: 0,
      userNotificationsDeleted: 0,
      userNotificationsActorCleared: 0,
      activityFeedDeleted: 0,
      activityFeedActorPatched: 0,
      contactActivityPatched: 0,
      libraryDocumentsPatched: 0,
      libraryDocumentVersionsPatched: 0,
      libraryDocumentLinksPatched: 0,
      fileMessagesPatched: 0,
      clientPortalIdentitiesDeleted: 0,
      clientPortalGrantsDeleted: 0,
      clientPortalSessionsDeleted: 0,
      clientPortalMagicLinksDeleted: 0,
      clientPortalRequestsDeleted: 0,
      clientPortalUpdatesDeleted: 0,
      clientPortalAuditDeleted: 0,
      clientPortalAuditActorPatched: 0,
      signatureEnvelopesPatched: 0,
      signatureAuditEventsPatched: 0,
      integrationApiKeysDeleted: 0,
      integrationOAuthClientsDeleted: 0,
      integrationAccessTokensDeleted: 0,
      integrationConnectorsPatched: 0,
      systemEmailLogPatched: 0,
      emailInboxSyncPreferencesDeleted: 0,
      outboundWebhookSubscriptionsPatched: 0,
      authSessionsDeletedStale: 0,
      authSessionsDeletedOrphan: 0,
      authSessionsDeletedLegacyUser: 0,
      authPasswordResetTokensDeletedLegacyUser: 0,
      authEmailVerificationTokensDeletedLegacyUser: 0,
      authPasswordResetTokensDeletedOrphan: 0,
      authEmailVerificationTokensDeletedOrphan: 0,
      authUsersDeletedLegacy: 0,
    };

    const bump = (key: string, n = 1) => {
      summary[key] = (summary[key] ?? 0) + n;
    };

    async function deleteDoc(ctxMut: MutationCtx, docId: Id<TableNames>, key: string) {
      if (dryRun) {
        bump(key);
        return;
      }
      await ctxMut.db.delete(docId);
      bump(key);
    }

    const authUsersAll = await ctx.db.query("authUsers").collect();
    const legacyAuthUserIds = new Set<string>();
    for (const u of authUsersAll) {
      if (authUserRowIsLegacyExternal(u)) {
        legacyAuthUserIds.add(u._id as string);
      }
    }

    for (const uid of legacyAuthUserIds) {
      const id = uid as Id<"authUsers">;
      for (const s of await ctx.db
        .query("authSessions")
        .withIndex("by_user", (q) => q.eq("userId", id))
        .collect()) {
        await deleteDoc(ctx, s._id, "authSessionsDeletedLegacyUser");
      }
      for (const t of await ctx.db
        .query("authPasswordResetTokens")
        .withIndex("by_user", (q) => q.eq("userId", id))
        .collect()) {
        await deleteDoc(ctx, t._id, "authPasswordResetTokensDeletedLegacyUser");
      }
      for (const t of await ctx.db
        .query("authEmailVerificationTokens")
        .withIndex("by_user", (q) => q.eq("userId", id))
        .collect()) {
        await deleteDoc(ctx, t._id, "authEmailVerificationTokensDeletedLegacyUser");
      }
    }

    for (const m of await ctx.db.query("organizationMembers").collect()) {
      if (!isLegacyUserSubject(m.userKey)) continue;
      await deleteDoc(ctx, m._id, "organizationMembersDeleted");
    }

    for (const r of await ctx.db.query("userOnboarding").collect()) {
      if (!isLegacyUserSubject(r.userKey)) continue;
      await deleteDoc(ctx, r._id, "userOnboardingDeleted");
    }

    for (const table of [
      "userPreferences",
      "navigationUserConfig",
      "userSimpleWorkflows",
      "pipelineFileUserTemplates",
    ] as const) {
      const key =
        table === "userPreferences"
          ? "userPreferencesDeleted"
          : table === "navigationUserConfig"
            ? "navigationUserConfigDeleted"
            : table === "userSimpleWorkflows"
              ? "userSimpleWorkflowsDeleted"
              : "pipelineFileUserTemplatesDeleted";
      for (const r of await ctx.db.query(table).collect()) {
        if (!isLegacyUserSubject(r.accountId)) continue;
        await deleteDoc(ctx, r._id, key);
      }
    }

    for (const p of await ctx.db.query("pipeline").collect()) {
      const patch: Record<string, unknown> = {};
      if (p.ownerUserKey && isLegacyUserSubject(p.ownerUserKey)) {
        patch.ownerUserKey = undefined;
      }
      if (p.assigneeId && isLegacyUserSubject(p.assigneeId)) {
        patch.assigneeId = undefined;
      }
      const sw = p.sharedWithIds?.filter((x) => !isLegacyUserSubject(x));
      const prev = p.sharedWithIds ?? [];
      if (
        sw &&
        (sw.length !== prev.length || sw.some((x, i) => x !== prev[i]))
      ) {
        patch.sharedWithIds = sw.length ? sw : undefined;
      }
      if (Object.keys(patch).length) {
        patch.updatedAt = now;
        if (dryRun) bump("pipelinePatched");
        else {
          await ctx.db.patch(p._id, patch);
          bump("pipelinePatched");
        }
      }
    }

    for (const r of await ctx.db.query("pipelineFileShares").collect()) {
      if (
        isLegacyUserSubject(r.userKey) ||
        isLegacyUserSubject(r.createdByUserKey)
      ) {
        await deleteDoc(ctx, r._id, "pipelineFileSharesDeleted");
      }
    }

    for (const r of await ctx.db.query("pipelineFileActivity").collect()) {
      if (!r.shareTargetUserKey || !isLegacyUserSubject(r.shareTargetUserKey)) {
        continue;
      }
      if (dryRun) bump("pipelineFileActivityPatched");
      else {
        await ctx.db.patch(r._id, { shareTargetUserKey: undefined });
        bump("pipelineFileActivityPatched");
      }
    }

    for (const t of await ctx.db.query("tasks").collect()) {
      const patch: Record<string, unknown> = {};
      if (t.assigneeId && isLegacyUserSubject(t.assigneeId)) {
        patch.assigneeId = undefined;
      }
      const sw = t.sharedWithIds?.filter((x) => !isLegacyUserSubject(x));
      const prev = t.sharedWithIds ?? [];
      if (
        sw &&
        (sw.length !== prev.length || sw.some((x, i) => x !== prev[i]))
      ) {
        patch.sharedWithIds = sw.length ? sw : undefined;
      }
      if (Object.keys(patch).length) {
        patch.updatedAt = now;
        if (dryRun) bump("tasksPatched");
        else {
          await ctx.db.patch(t._id, patch);
          bump("tasksPatched");
        }
      }
    }

    for (const r of await ctx.db.query("taskNotifications").collect()) {
      if (isLegacyUserSubject(r.userKey)) {
        await deleteDoc(ctx, r._id, "taskNotificationsDeleted");
        continue;
      }
      if (r.actorUserKey && isLegacyUserSubject(r.actorUserKey)) {
        if (dryRun) bump("taskNotificationsActorCleared");
        else {
          await ctx.db.patch(r._id, { actorUserKey: undefined });
          bump("taskNotificationsActorCleared");
        }
      }
    }

    for (const r of await ctx.db.query("userNotifications").collect()) {
      if (isLegacyUserSubject(r.userKey)) {
        await deleteDoc(ctx, r._id, "userNotificationsDeleted");
        continue;
      }
      if (r.actorUserKey && isLegacyUserSubject(r.actorUserKey)) {
        if (dryRun) bump("userNotificationsActorCleared");
        else {
          await ctx.db.patch(r._id, { actorUserKey: undefined });
          bump("userNotificationsActorCleared");
        }
      }
    }

    for (const r of await ctx.db.query("activityFeed").collect()) {
      let drop = false;
      if (r.scopeKind === "user" && isLegacyUserSubject(r.scopeId)) {
        drop = true;
      }
      if (r.scopeKind === "org" && isLegacyOrgScope(r.scopeId)) {
        drop = true;
      }
      if (drop) {
        await deleteDoc(ctx, r._id, "activityFeedDeleted");
        continue;
      }
      if (isLegacyUserSubject(r.actorKey)) {
        if (dryRun) bump("activityFeedActorPatched");
        else {
          await ctx.db.patch(r._id, { actorKey: SYSTEM_ACTOR });
          bump("activityFeedActorPatched");
        }
      }
    }

    for (const r of await ctx.db.query("contactActivity").collect()) {
      if (!r.actorUserKey || !isLegacyUserSubject(r.actorUserKey)) continue;
      if (dryRun) bump("contactActivityPatched");
      else {
        await ctx.db.patch(r._id, { actorUserKey: undefined });
        bump("contactActivityPatched");
      }
    }

    for (const r of await ctx.db.query("libraryDocuments").collect()) {
      if (!isLegacyUserSubject(r.createdByUserKey)) continue;
      if (dryRun) bump("libraryDocumentsPatched");
      else {
        await ctx.db.patch(r._id, {
          createdByUserKey: SYSTEM_ACTOR,
          updatedAt: now,
        });
        bump("libraryDocumentsPatched");
      }
    }

    for (const r of await ctx.db.query("libraryDocumentVersions").collect()) {
      if (!isLegacyUserSubject(r.uploadedByUserKey)) continue;
      if (dryRun) bump("libraryDocumentVersionsPatched");
      else {
        await ctx.db.patch(r._id, { uploadedByUserKey: SYSTEM_ACTOR });
        bump("libraryDocumentVersionsPatched");
      }
    }

    for (const r of await ctx.db.query("libraryDocumentLinks").collect()) {
      if (!isLegacyUserSubject(r.linkedByUserKey)) continue;
      if (dryRun) bump("libraryDocumentLinksPatched");
      else {
        await ctx.db.patch(r._id, { linkedByUserKey: SYSTEM_ACTOR });
        bump("libraryDocumentLinksPatched");
      }
    }

    for (const r of await ctx.db.query("fileMessages").collect()) {
      if (!r.teamUserKey || !isLegacyUserSubject(r.teamUserKey)) continue;
      if (dryRun) bump("fileMessagesPatched");
      else {
        await ctx.db.patch(r._id, { teamUserKey: undefined });
        bump("fileMessagesPatched");
      }
    }

    for (const table of [
      "clientPortalIdentities",
      "clientPortalGrants",
      "clientPortalSessions",
      "clientPortalMagicLinks",
    ] as const) {
      const key =
        table === "clientPortalIdentities"
          ? "clientPortalIdentitiesDeleted"
          : table === "clientPortalGrants"
            ? "clientPortalGrantsDeleted"
            : table === "clientPortalSessions"
              ? "clientPortalSessionsDeleted"
              : "clientPortalMagicLinksDeleted";
      for (const r of await ctx.db.query(table).collect()) {
        const orgScope = (r as { orgScope: string }).orgScope;
        if (!isLegacyOrgScope(orgScope)) continue;
        await deleteDoc(ctx, r._id, key);
      }
    }

    for (const r of await ctx.db.query("clientPortalRequests").collect()) {
      if (!isLegacyUserSubject(r.createdByUserKey)) continue;
      await deleteDoc(ctx, r._id, "clientPortalRequestsDeleted");
    }

    for (const r of await ctx.db.query("clientPortalUpdates").collect()) {
      if (!isLegacyUserSubject(r.createdByUserKey)) continue;
      await deleteDoc(ctx, r._id, "clientPortalUpdatesDeleted");
    }

    for (const r of await ctx.db.query("clientPortalAudit").collect()) {
      if (r.orgScope && isLegacyOrgScope(r.orgScope)) {
        await deleteDoc(ctx, r._id, "clientPortalAuditDeleted");
        continue;
      }
      if (
        r.actorType === "broker" &&
        r.actorKey &&
        isLegacyUserSubject(r.actorKey)
      ) {
        if (dryRun) bump("clientPortalAuditActorPatched");
        else {
          await ctx.db.patch(r._id, { actorKey: SYSTEM_ACTOR });
          bump("clientPortalAuditActorPatched");
        }
      }
    }

    for (const r of await ctx.db.query("signatureEnvelopes").collect()) {
      if (!isLegacyUserSubject(r.createdByUserKey)) continue;
      if (dryRun) bump("signatureEnvelopesPatched");
      else {
        await ctx.db.patch(r._id, {
          createdByUserKey: SYSTEM_ACTOR,
          updatedAt: now,
        });
        bump("signatureEnvelopesPatched");
      }
    }

    for (const r of await ctx.db.query("signatureAuditEvents").collect()) {
      if (r.actorType !== "broker" || !isLegacyUserSubject(r.actorKey)) {
        continue;
      }
      if (dryRun) bump("signatureAuditEventsPatched");
      else {
        await ctx.db.patch(r._id, { actorKey: SYSTEM_ACTOR });
        bump("signatureAuditEventsPatched");
      }
    }

    for (const r of await ctx.db.query("integrationApiKeys").collect()) {
      if (!isLegacyUserSubject(r.actorUserKey)) continue;
      await deleteDoc(ctx, r._id, "integrationApiKeysDeleted");
    }

    for (const r of await ctx.db.query("integrationOAuthClients").collect()) {
      if (!isLegacyUserSubject(r.actorUserKey)) continue;
      await deleteDoc(ctx, r._id, "integrationOAuthClientsDeleted");
    }

    for (const r of await ctx.db.query("integrationAccessTokens").collect()) {
      if (!isLegacyUserSubject(r.actorUserKey)) continue;
      await deleteDoc(ctx, r._id, "integrationAccessTokensDeleted");
    }

    for (const r of await ctx.db.query("integrationConnectors").collect()) {
      if (!isLegacyUserSubject(r.createdByUserKey)) continue;
      if (dryRun) bump("integrationConnectorsPatched");
      else {
        await ctx.db.patch(r._id, {
          createdByUserKey: SYSTEM_ACTOR,
          updatedAt: now,
        });
        bump("integrationConnectorsPatched");
      }
    }

    for (const r of await ctx.db.query("systemEmailLog").collect()) {
      if (!isLegacyUserSubject(r.sentByUserKey)) continue;
      if (dryRun) bump("systemEmailLogPatched");
      else {
        await ctx.db.patch(r._id, {
          sentByUserKey: SYSTEM_ACTOR,
          updatedAt: now,
        });
        bump("systemEmailLogPatched");
      }
    }

    for (const r of await ctx.db.query("emailInboxSyncPreferences").collect()) {
      if (!isLegacyUserSubject(r.userKey)) continue;
      await deleteDoc(ctx, r._id, "emailInboxSyncPreferencesDeleted");
    }

    for (const r of await ctx.db.query("outboundWebhookSubscriptions").collect()) {
      if (!isLegacyUserSubject(r.createdByUserKey)) continue;
      if (dryRun) bump("outboundWebhookSubscriptionsPatched");
      else {
        await ctx.db.patch(r._id, {
          createdByUserKey: SYSTEM_ACTOR,
          updatedAt: now,
        });
        bump("outboundWebhookSubscriptionsPatched");
      }
    }

    if (deleteLegacyAuthUsers) {
      for (const u of authUsersAll) {
        if (!authUserRowIsLegacyExternal(u)) continue;
        await deleteDoc(ctx, u._id, "authUsersDeletedLegacy");
      }
    }

    const validAuthIds = new Set(
      (await ctx.db.query("authUsers").collect()).map((x) => x._id as string),
    );

    for (const s of await ctx.db.query("authSessions").collect()) {
      const orphan = !validAuthIds.has(s.userId as string);
      const expired = s.absoluteExpiresAtMs < now;
      if (orphan) {
        await deleteDoc(ctx, s._id, "authSessionsDeletedOrphan");
        continue;
      }
      if (purgeExpiredSessions && expired) {
        await deleteDoc(ctx, s._id, "authSessionsDeletedStale");
      }
    }

    for (const t of await ctx.db.query("authPasswordResetTokens").collect()) {
      if (validAuthIds.has(t.userId as string)) continue;
      await deleteDoc(ctx, t._id, "authPasswordResetTokensDeletedOrphan");
    }

    for (const t of await ctx.db.query("authEmailVerificationTokens").collect()) {
      if (validAuthIds.has(t.userId as string)) continue;
      await deleteDoc(ctx, t._id, "authEmailVerificationTokensDeletedOrphan");
    }

    return {
      ok: true as const,
      dryRun,
      purgeExpiredSessions,
      deleteLegacyAuthUserDocuments: deleteLegacyAuthUsers,
      summary,
      legacyAuthUserIdsTargeted: [...legacyAuthUserIds].sort(),
    };
  },
});
