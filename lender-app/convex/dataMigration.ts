import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Doc, Id, TableNames } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { assertDataMigrationAdmin } from "./migrationAdminAuth";

const ROLLBACK_BATCH_SIZE = 20;

const MIN_CONVEX_ID_LEN = 10;
const MAX_CONVEX_ID_LEN = 96;
const CONVEX_ID_RE = /^[a-z0-9]+$/;

export { assertDataMigrationAdmin };

/** True when `raw` looks like a legacy vendor user id (`user_<alnum>`, length ≥ prefix). */
export function isLegacyExternalUserId(raw: string | undefined | null): boolean {
  if (!raw) return false;
  const s = raw.trim();
  return /^user_[a-zA-Z0-9]{3,}$/.test(s);
}

/** True when `raw` looks like a legacy vendor org id (`org_<alnum>`). */
export function isLegacyExternalOrgId(raw: string | undefined | null): boolean {
  if (!raw) return false;
  const s = raw.trim();
  return /^org_[a-zA-Z0-9]{3,}$/.test(s);
}

function isValidConvexOrganizationIdString(s: string | undefined | null): boolean {
  if (!s) return false;
  const t = s.trim();
  if (t === "none") return true;
  if (t.length < MIN_CONVEX_ID_LEN || t.length > MAX_CONVEX_ID_LEN) return false;
  return CONVEX_ID_RE.test(t);
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  const o = value as Record<string, unknown>;
  const keys = Object.keys(o).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(o[k])}`).join(",")}}`;
}

function fingerprintFor(
  legacyUserMap: Record<string, string>,
  legacyOrgMap: Record<string, string>,
  purgeExpiredSessions: boolean,
): string {
  let h = 0;
  const str = stableStringify({
    legacyUserMap,
    legacyOrgMap,
    purgeExpiredSessions,
  });
  for (let i = 0; i < str.length; i++) {
    h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
  }
  return `fp_${(h >>> 0).toString(16)}_${str.length}`;
}

async function takeTable<T extends TableNames>(
  ctx: QueryCtx,
  table: T,
  limit: number,
): Promise<{ rows: Doc<T>[]; truncated: boolean }> {
  const batch = await ctx.db.query(table).take(limit + 1);
  if (batch.length > limit) {
    return { rows: batch.slice(0, limit) as Doc<T>[], truncated: true };
  }
  return { rows: batch as Doc<T>[], truncated: false };
}

export type LegacyExternalUserKeyHit = {
  table: string;
  docId: string;
  field: string;
  value: string;
};

export type LegacyExternalOrgScopeHit = {
  table: string;
  docId: string;
  field: string;
  value: string;
};

/** Full scan when legacyUserMap is non-empty (production migration execute). */
async function collectAllLegacyExternalUserKeyHits(ctx: QueryCtx): Promise<LegacyExternalUserKeyHit[]> {
  const hits: LegacyExternalUserKeyHit[] = [];
  const track = (table: string, docId: string, field: string, value: string | undefined) => {
    if (isLegacyExternalUserId(value)) {
      hits.push({ table, docId, field, value: value!.trim() });
    }
  };

  for (const m of await ctx.db.query("organizationMembers").collect()) {
    track("organizationMembers", m._id, "userKey", m.userKey);
  }
  for (const r of await ctx.db.query("userOnboarding").collect()) {
    track("userOnboarding", r._id, "userKey", r.userKey);
  }
  for (const p of await ctx.db.query("pipeline").collect()) {
    track("pipeline", p._id, "ownerUserKey", p.ownerUserKey);
    track("pipeline", p._id, "assigneeId", p.assigneeId);
    for (const sid of p.sharedWithIds ?? []) {
      track("pipeline", p._id, "sharedWithIds", sid);
    }
  }
  for (const r of await ctx.db.query("pipelineFileShares").collect()) {
    track("pipelineFileShares", r._id, "userKey", r.userKey);
    track("pipelineFileShares", r._id, "createdByUserKey", r.createdByUserKey);
  }
  for (const r of await ctx.db.query("pipelineFileActivity").collect()) {
    track("pipelineFileActivity", r._id, "shareTargetUserKey", r.shareTargetUserKey);
  }
  for (const t of await ctx.db.query("tasks").collect()) {
    track("tasks", t._id, "assigneeId", t.assigneeId);
    for (const sid of t.sharedWithIds ?? []) {
      track("tasks", t._id, "sharedWithIds", sid);
    }
  }
  for (const r of await ctx.db.query("taskNotifications").collect()) {
    track("taskNotifications", r._id, "userKey", r.userKey);
    track("taskNotifications", r._id, "actorUserKey", r.actorUserKey);
  }
  for (const r of await ctx.db.query("userNotifications").collect()) {
    track("userNotifications", r._id, "userKey", r.userKey);
    track("userNotifications", r._id, "actorUserKey", r.actorUserKey);
  }
  for (const r of await ctx.db.query("activityFeed").collect()) {
    track("activityFeed", r._id, "actorKey", r.actorKey);
  }
  for (const r of await ctx.db.query("libraryDocuments").collect()) {
    track("libraryDocuments", r._id, "createdByUserKey", r.createdByUserKey);
  }
  for (const r of await ctx.db.query("libraryDocumentVersions").collect()) {
    track("libraryDocumentVersions", r._id, "uploadedByUserKey", r.uploadedByUserKey);
  }
  for (const r of await ctx.db.query("libraryDocumentLinks").collect()) {
    track("libraryDocumentLinks", r._id, "linkedByUserKey", r.linkedByUserKey);
  }
  for (const r of await ctx.db.query("fileMessages").collect()) {
    track("fileMessages", r._id, "teamUserKey", r.teamUserKey);
  }
  for (const r of await ctx.db.query("clientPortalGrants").collect()) {
    track("clientPortalGrants", r._id, "invitedByUserKey", r.invitedByUserKey);
  }
  for (const r of await ctx.db.query("clientPortalRequests").collect()) {
    track("clientPortalRequests", r._id, "createdByUserKey", r.createdByUserKey);
  }
  for (const r of await ctx.db.query("clientPortalUpdates").collect()) {
    track("clientPortalUpdates", r._id, "createdByUserKey", r.createdByUserKey);
  }
  for (const r of await ctx.db.query("signatureEnvelopes").collect()) {
    track("signatureEnvelopes", r._id, "createdByUserKey", r.createdByUserKey);
  }
  for (const r of await ctx.db.query("signatureAuditEvents").collect()) {
    track("signatureAuditEvents", r._id, "actorKey", r.actorKey);
  }
  for (const r of await ctx.db.query("integrationApiKeys").collect()) {
    track("integrationApiKeys", r._id, "actorUserKey", r.actorUserKey);
  }
  for (const r of await ctx.db.query("integrationOAuthClients").collect()) {
    track("integrationOAuthClients", r._id, "actorUserKey", r.actorUserKey);
  }
  for (const r of await ctx.db.query("integrationAccessTokens").collect()) {
    track("integrationAccessTokens", r._id, "actorUserKey", r.actorUserKey);
  }
  for (const r of await ctx.db.query("integrationConnectors").collect()) {
    track("integrationConnectors", r._id, "createdByUserKey", r.createdByUserKey);
  }
  for (const r of await ctx.db.query("outboundWebhookSubscriptions").collect()) {
    track("outboundWebhookSubscriptions", r._id, "createdByUserKey", r.createdByUserKey);
  }
  for (const r of await ctx.db.query("emailInboxSyncPreferences").collect()) {
    track("emailInboxSyncPreferences", r._id, "userKey", r.userKey);
  }

  return hits;
}

/** Full scan when legacyOrgMap is non-empty. */
async function collectAllLegacyExternalOrgScopeHits(ctx: QueryCtx): Promise<LegacyExternalOrgScopeHit[]> {
  const hits: LegacyExternalOrgScopeHit[] = [];
  const track = (table: string, docId: string, field: string, value: string | undefined) => {
    if (isLegacyExternalOrgId(value)) {
      hits.push({ table, docId, field, value: value!.trim() });
    }
  };
  for (const r of await ctx.db.query("clientPortalIdentities").collect()) {
    track("clientPortalIdentities", r._id, "orgScope", r.orgScope);
  }
  for (const r of await ctx.db.query("clientPortalGrants").collect()) {
    track("clientPortalGrants", r._id, "orgScope", r.orgScope);
  }
  for (const r of await ctx.db.query("clientPortalSessions").collect()) {
    track("clientPortalSessions", r._id, "orgScope", r.orgScope);
  }
  for (const r of await ctx.db.query("clientPortalMagicLinks").collect()) {
    track("clientPortalMagicLinks", r._id, "orgScope", r.orgScope);
  }
  for (const r of await ctx.db.query("activityFeed").collect()) {
    if (r.scopeKind === "org") {
      track("activityFeed", r._id, "scopeId", r.scopeId);
    }
  }
  for (const r of await ctx.db.query("securityAuditLog").collect()) {
    track("securityAuditLog", r._id, "orgScope", r.orgScope);
  }
  return hits;
}

async function buildScanReport(
  ctx: QueryCtx,
  scanLimitPerTable: number,
): Promise<Record<string, unknown>> {
  const truncatedTables: string[] = [];
  const legacyExternalUserKeyHits: LegacyExternalUserKeyHit[] = [];
  const legacyExternalOrgScopeHits: LegacyExternalOrgScopeHit[] = [];
  const malformedOrgScopeIds: Array<Record<string, string>> = [];
  const duplicateMemberships: Array<{
    organizationId: string;
    userKey: string;
    memberIds: string[];
  }> = [];
  const orphanedOrganizationMembers: string[] = [];
  const orphanedAuthSessions: string[] = [];
  const staleAuthSessions: string[] = [];
  const danglingOrganizationIds: Array<Record<string, string>> = [];
  const invalidForeignKeys: Array<Record<string, string>> = [];

  const trackLegacyExternalUserKey = (table: string, docId: string, field: string, value: string) => {
    if (isLegacyExternalUserId(value)) {
      legacyExternalUserKeyHits.push({ table, docId, field, value: value.trim() });
    }
  };

  const trackLegacyExternalOrgScope = (table: string, docId: string, field: string, value: string) => {
    if (isLegacyExternalOrgId(value)) {
      legacyExternalOrgScopeHits.push({ table, docId, field, value: value.trim() });
    }
  };

  const { rows: orgRows, truncated: orgTrunc } = await takeTable(
    ctx,
    "organizations",
    scanLimitPerTable,
  );
  if (orgTrunc) truncatedTables.push("organizations");
  const orgIds = new Set(orgRows.map((r) => r._id));

  const { rows: authUserRows, truncated: authTrunc } = await takeTable(
    ctx,
    "authUsers",
    scanLimitPerTable,
  );
  if (authTrunc) truncatedTables.push("authUsers");
  const authUserIds = new Set(authUserRows.map((r) => r._id));

  const { rows: memberRows, truncated: memTrunc } = await takeTable(
    ctx,
    "organizationMembers",
    scanLimitPerTable,
  );
  if (memTrunc) truncatedTables.push("organizationMembers");
  const group = new Map<string, Id<"organizationMembers">[]>();
  for (const m of memberRows) {
    if (!orgIds.has(m.organizationId)) {
      orphanedOrganizationMembers.push(m._id);
    }
    trackLegacyExternalUserKey("organizationMembers", m._id, "userKey", m.userKey);
    const k = `${m.organizationId}|${m.userKey}`;
    const g = group.get(k) ?? [];
    g.push(m._id);
    group.set(k, g);
  }
  for (const [key, ids] of group) {
    if (ids.length > 1) {
      const [organizationId, userKey] = key.split("|");
      duplicateMemberships.push({
        organizationId,
        userKey,
        memberIds: ids.map(String),
      });
    }
  }

  {
    const now = Date.now();
    const { rows, truncated } = await takeTable(ctx, "authSessions", scanLimitPerTable);
    if (truncated) truncatedTables.push("authSessions");
    for (const s of rows) {
      if (!authUserIds.has(s.userId)) orphanedAuthSessions.push(s._id);
      if (s.absoluteExpiresAtMs < now) staleAuthSessions.push(s._id);
    }
  }

  for (const tokTable of ["authPasswordResetTokens", "authEmailVerificationTokens"] as const) {
    const { rows, truncated } = await takeTable(ctx, tokTable, scanLimitPerTable);
    if (truncated) truncatedTables.push(tokTable);
    for (const t of rows) {
      if (!authUserIds.has(t.userId)) {
        invalidForeignKeys.push({
          table: tokTable,
          docId: t._id,
          field: "userId",
          ref: String(t.userId),
          reason: "authUsers row missing",
        });
      }
    }
  }

  const { rows: lenderRows, truncated: lendTrunc } = await takeTable(
    ctx,
    "lenders",
    scanLimitPerTable,
  );
  if (lendTrunc) truncatedTables.push("lenders");
  const lenderIds = new Set(lenderRows.map((r) => r._id));

  const { rows: intakeRows, truncated: intTrunc } = await takeTable(
    ctx,
    "intakeSheets",
    scanLimitPerTable,
  );
  if (intTrunc) truncatedTables.push("intakeSheets");
  const intakeIds = new Set(intakeRows.map((r) => r._id));

  const { rows: pipelineRows, truncated: pipeTrunc } = await takeTable(
    ctx,
    "pipeline",
    scanLimitPerTable,
  );
  if (pipeTrunc) truncatedTables.push("pipeline");
  const pipelineIds = new Set(pipelineRows.map((r) => r._id));

  for (const len of lenderRows) {
    if (len.organizationId && !orgIds.has(len.organizationId)) {
      danglingOrganizationIds.push({
        table: "lenders",
        docId: len._id,
        organizationId: String(len.organizationId),
      });
    }
  }

  for (const p of pipelineRows) {
    if (p.organizationId && !orgIds.has(p.organizationId)) {
      danglingOrganizationIds.push({
        table: "pipeline",
        docId: p._id,
        organizationId: String(p.organizationId),
      });
    }
    if (p.intakeSheetId && !intakeIds.has(p.intakeSheetId)) {
      invalidForeignKeys.push({
        table: "pipeline",
        docId: p._id,
        field: "intakeSheetId",
        ref: String(p.intakeSheetId),
        reason: "intakeSheets row missing",
      });
    }
    for (const lid of p.lenders) {
      if (!lenderIds.has(lid)) {
        invalidForeignKeys.push({
          table: "pipeline",
          docId: p._id,
          field: "lenders",
          ref: String(lid),
          reason: "lenders row missing",
        });
      }
    }
    if (p.selectedLenderId && !lenderIds.has(p.selectedLenderId)) {
      invalidForeignKeys.push({
        table: "pipeline",
        docId: p._id,
        field: "selectedLenderId",
        ref: String(p.selectedLenderId),
        reason: "lenders row missing",
      });
    }
    trackLegacyExternalUserKey("pipeline", p._id, "ownerUserKey", p.ownerUserKey ?? "");
    if (p.assigneeId) trackLegacyExternalUserKey("pipeline", p._id, "assigneeId", p.assigneeId);
    for (const sid of p.sharedWithIds ?? []) {
      trackLegacyExternalUserKey("pipeline", p._id, "sharedWithIds", sid);
    }
  }

  {
    const { rows, truncated } = await takeTable(ctx, "pipelineFileShares", scanLimitPerTable);
    if (truncated) truncatedTables.push("pipelineFileShares");
    for (const r of rows) {
      if (!pipelineIds.has(r.fileId)) {
        invalidForeignKeys.push({
          table: "pipelineFileShares",
          docId: r._id,
          field: "fileId",
          ref: String(r.fileId),
          reason: "pipeline row missing",
        });
      }
      trackLegacyExternalUserKey("pipelineFileShares", r._id, "userKey", r.userKey);
      trackLegacyExternalUserKey("pipelineFileShares", r._id, "createdByUserKey", r.createdByUserKey);
    }
  }

  {
    const { rows, truncated } = await takeTable(ctx, "ledger", scanLimitPerTable);
    if (truncated) truncatedTables.push("ledger");
    for (const r of rows) {
      if (!pipelineIds.has(r.fileId)) {
        invalidForeignKeys.push({
          table: "ledger",
          docId: r._id,
          field: "fileId",
          ref: String(r.fileId),
          reason: "pipeline row missing",
        });
      }
    }
  }

  const { rows: contactRows, truncated: conTrunc } = await takeTable(
    ctx,
    "contacts",
    scanLimitPerTable,
  );
  if (conTrunc) truncatedTables.push("contacts");
  const contactIds = new Set(contactRows.map((r) => r._id));

  for (const c of contactRows) {
    if (c.organizationId && !orgIds.has(c.organizationId)) {
      danglingOrganizationIds.push({
        table: "contacts",
        docId: c._id,
        organizationId: String(c.organizationId),
      });
    }
  }

  {
    const { rows, truncated } = await takeTable(ctx, "tasks", scanLimitPerTable);
    if (truncated) truncatedTables.push("tasks");
    for (const t of rows) {
      if (t.organizationId && !orgIds.has(t.organizationId)) {
        danglingOrganizationIds.push({
          table: "tasks",
          docId: t._id,
          organizationId: String(t.organizationId),
        });
      }
      if (t.relatedFileId && !pipelineIds.has(t.relatedFileId)) {
        invalidForeignKeys.push({
          table: "tasks",
          docId: t._id,
          field: "relatedFileId",
          ref: String(t.relatedFileId),
          reason: "pipeline row missing",
        });
      }
      if (t.relatedContactId && !contactIds.has(t.relatedContactId)) {
        invalidForeignKeys.push({
          table: "tasks",
          docId: t._id,
          field: "relatedContactId",
          ref: String(t.relatedContactId),
          reason: "contacts row missing",
        });
      }
      if (t.parentTaskId) {
        const parent = await ctx.db.get(t.parentTaskId);
        if (!parent) {
          invalidForeignKeys.push({
            table: "tasks",
            docId: t._id,
            field: "parentTaskId",
            ref: String(t.parentTaskId),
            reason: "tasks row missing",
          });
        }
      }
      if (t.assigneeId) trackLegacyExternalUserKey("tasks", t._id, "assigneeId", t.assigneeId);
      for (const sid of t.sharedWithIds ?? []) {
        trackLegacyExternalUserKey("tasks", t._id, "sharedWithIds", sid);
      }
    }
  }

  {
    const { rows, truncated } = await takeTable(ctx, "userOnboarding", scanLimitPerTable);
    if (truncated) truncatedTables.push("userOnboarding");
    for (const r of rows) {
      trackLegacyExternalUserKey("userOnboarding", r._id, "userKey", r.userKey);
    }
  }

  {
    const { rows, truncated } = await takeTable(ctx, "activityFeed", scanLimitPerTable);
    if (truncated) truncatedTables.push("activityFeed");
    for (const r of rows) {
      if (r.scopeKind === "org" && !isValidConvexOrganizationIdString(r.scopeId)) {
        malformedOrgScopeIds.push({
          table: "activityFeed",
          docId: r._id,
          scopeId: r.scopeId,
        });
      }
      if (isLegacyExternalOrgId(r.scopeId)) {
        legacyExternalOrgScopeHits.push({
          table: "activityFeed",
          docId: r._id,
          field: "scopeId",
          value: r.scopeId.trim(),
        });
      }
      trackLegacyExternalUserKey("activityFeed", r._id, "actorKey", r.actorKey);
    }
  }

  for (const t of [
    "clientPortalIdentities",
    "clientPortalGrants",
    "clientPortalSessions",
    "clientPortalMagicLinks",
  ] as const) {
    const { rows, truncated } = await takeTable(ctx, t, scanLimitPerTable);
    if (truncated) truncatedTables.push(t);
    for (const r of rows) {
      trackLegacyExternalOrgScope(t, r._id, "orgScope", (r as { orgScope: string }).orgScope);
    }
  }

  for (const u of authUserRows) {
    if (u.defaultOrganizationId && !orgIds.has(u.defaultOrganizationId)) {
      danglingOrganizationIds.push({
        table: "authUsers",
        docId: u._id,
        organizationId: String(u.defaultOrganizationId),
      });
    }
  }

  const counts = {
    legacyExternalUserKeyHits: legacyExternalUserKeyHits.length,
    legacyExternalOrgScopeHits: legacyExternalOrgScopeHits.length,
    malformedOrgScopeIds: malformedOrgScopeIds.length,
    duplicateMembershipGroups: duplicateMemberships.length,
    orphanedOrganizationMembers: orphanedOrganizationMembers.length,
    orphanedAuthSessions: orphanedAuthSessions.length,
    staleAuthSessions: staleAuthSessions.length,
    danglingOrganizationIds: danglingOrganizationIds.length,
    invalidForeignKeys: invalidForeignKeys.length,
  };

  return {
    generatedAt: Date.now(),
    scanLimitPerTable,
    truncatedTables: [...new Set(truncatedTables)],
    legacyExternalUserKeyHits,
    legacyExternalOrgScopeHits,
    malformedOrgScopeIds,
    duplicateMemberships,
    orphanedOrganizationMembers,
    orphanedAuthSessions,
    staleAuthSessions,
    danglingOrganizationIds,
    invalidForeignKeys,
    counts,
  };
}

type RollbackEntry = {
  table: string;
  docId: string;
  op: "patch" | "delete";
  before?: unknown;
};

async function flushRollback(
  ctx: MutationCtx,
  runId: string,
  seq: { n: number },
  buf: RollbackEntry[],
) {
  if (!buf.length) return;
  await ctx.db.insert("dataMigrationRollbackChunks", {
    runId,
    seq: seq.n++,
    createdAt: Date.now(),
    entries: buf.splice(0, buf.length),
  });
}

async function recordRollback(
  ctx: MutationCtx,
  runId: string,
  seq: { n: number },
  buf: RollbackEntry[],
  entry: RollbackEntry,
) {
  buf.push(entry);
  if (buf.length >= ROLLBACK_BATCH_SIZE) {
    await flushRollback(ctx, runId, seq, buf);
  }
}

export const analyze = query({
  args: {
    adminSecret: v.string(),
    scanLimitPerTable: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    assertDataMigrationAdmin(args.adminSecret);
    const lim = Math.min(Math.max(args.scanLimitPerTable ?? 25_000, 100), 100_000);
    return await buildScanReport(ctx, lim);
  },
});

const JOSHUA_AUDIT_EMAIL = "joshua@directlendingconnection.com";

function isClerkPrefixedUserKey(raw: string | undefined | null): boolean {
  const s = raw?.trim() ?? "";
  return s.startsWith("clerk_");
}

/** Admin-only: row counts, membership gaps, Joshua row, migration scan, and `clerk_`-prefixed user keys. */
export const integrityAudit = query({
  args: {
    adminSecret: v.string(),
    scanLimitPerTable: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    assertDataMigrationAdmin(args.adminSecret);
    const lim = Math.min(Math.max(args.scanLimitPerTable ?? 100_000, 100), 200_000);
    const scan = (await buildScanReport(ctx, lim)) as {
      counts: Record<string, number>;
      truncatedTables: string[];
      legacyExternalUserKeyHits: LegacyExternalUserKeyHit[];
      legacyExternalOrgScopeHits: LegacyExternalOrgScopeHit[];
      malformedOrgScopeIds: Array<Record<string, string>>;
      duplicateMemberships: unknown[];
      orphanedOrganizationMembers: string[];
      orphanedAuthSessions: string[];
      danglingOrganizationIds: Array<Record<string, string>>;
      invalidForeignKeys: Array<Record<string, string>>;
    };

    const authUsers = await ctx.db.query("authUsers").collect();
    const organizationMembers = await ctx.db.query("organizationMembers").collect();
    const memberKeys = new Set(organizationMembers.map((m) => m.userKey));

    const authUsersWithoutMembership = authUsers
      .filter((u) => !memberKeys.has(u._id as string))
      .map((u) => ({
        authUserId: u._id as string,
        email: u.email ?? null,
        normalizedUsername: u.normalizedUsername,
      }));

    const joshuaLower = JOSHUA_AUDIT_EMAIL.toLowerCase();
    const joshuaUser =
      authUsers.find(
        (u) =>
          u.email === JOSHUA_AUDIT_EMAIL ||
          u.email?.trim().toLowerCase() === joshuaLower,
      ) ?? null;

    const joshuaMemberships = joshuaUser
      ? organizationMembers.filter((m) => m.userKey === (joshuaUser._id as string))
      : [];

    const clerkUserKeyHits: LegacyExternalUserKeyHit[] = [];
    const trackClerk = (
      table: string,
      docId: string,
      field: string,
      value: string | undefined,
    ) => {
      if (isClerkPrefixedUserKey(value)) {
        clerkUserKeyHits.push({
          table,
          docId,
          field,
          value: value!.trim(),
        });
      }
    };

    for (const m of organizationMembers) {
      trackClerk("organizationMembers", m._id, "userKey", m.userKey);
    }
    for (const r of await ctx.db.query("userOnboarding").collect()) {
      trackClerk("userOnboarding", r._id, "userKey", r.userKey);
    }
    for (const p of await ctx.db.query("pipeline").collect()) {
      trackClerk("pipeline", p._id, "ownerUserKey", p.ownerUserKey);
      trackClerk("pipeline", p._id, "assigneeId", p.assigneeId);
      for (const sid of p.sharedWithIds ?? []) {
        trackClerk("pipeline", p._id, "sharedWithIds", sid);
      }
    }
    for (const r of await ctx.db.query("pipelineFileShares").collect()) {
      trackClerk("pipelineFileShares", r._id, "userKey", r.userKey);
      trackClerk("pipelineFileShares", r._id, "createdByUserKey", r.createdByUserKey);
    }
    for (const r of await ctx.db.query("pipelineFileActivity").collect()) {
      trackClerk("pipelineFileActivity", r._id, "shareTargetUserKey", r.shareTargetUserKey);
    }

    const tableCounts = {
      authUsers: authUsers.length,
      organizations: (await ctx.db.query("organizations").collect()).length,
      organizationMembers: organizationMembers.length,
      pipeline: (await ctx.db.query("pipeline").collect()).length,
      lenders: (await ctx.db.query("lenders").collect()).length,
      contacts: (await ctx.db.query("contacts").collect()).length,
      intakeSheets: (await ctx.db.query("intakeSheets").collect()).length,
      authSessions: (await ctx.db.query("authSessions").collect()).length,
      userOnboarding: (await ctx.db.query("userOnboarding").collect()).length,
      userPreferences: (await ctx.db.query("userPreferences").collect()).length,
    };

    const sampleCap = 40;
    const legacyUserHits = scan.legacyExternalUserKeyHits;
    const legacyOrgHits = scan.legacyExternalOrgScopeHits;

    return {
      generatedAt: Date.now(),
      note:
        "Legacy vendor user export files are not stored in this repo; compare `tableCounts` to your export row counts manually.",
      scanLimitPerTable: lim,
      tableCounts,
      joshua: joshuaUser
        ? {
            found: true as const,
            authUserId: joshuaUser._id as string,
            email: joshuaUser.email ?? null,
            isGlobalAdmin: joshuaUser.isGlobalAdmin === true,
            systemRole: joshuaUser.systemRole ?? null,
            defaultOrganizationId: joshuaUser.defaultOrganizationId ?? null,
            organizationMemberships: joshuaMemberships.map((m) => ({
              organizationMemberId: m._id as string,
              organizationId: m.organizationId as string,
            })),
          }
        : { found: false as const },
      authUsersWithoutMembership: authUsersWithoutMembership,
      authUsersWithoutMembershipCount: authUsersWithoutMembership.length,
      migrationScan: {
        counts: scan.counts,
        truncatedTables: scan.truncatedTables,
        legacyExternalUserKeyHitsTotal: legacyUserHits.length,
        legacyExternalOrgScopeHitsTotal: legacyOrgHits.length,
        legacyExternalUserKeyHitsSample: legacyUserHits.slice(0, sampleCap),
        legacyExternalOrgScopeHitsSample: legacyOrgHits.slice(0, sampleCap),
        malformedOrgScopeIdsSample: scan.malformedOrgScopeIds.slice(0, sampleCap),
        danglingOrganizationIdsSample: scan.danglingOrganizationIds.slice(0, sampleCap),
        invalidForeignKeysSample: scan.invalidForeignKeys.slice(0, sampleCap),
        orphanedOrganizationMemberIdsSample: scan.orphanedOrganizationMembers
          .slice(0, sampleCap)
          .map(String),
        orphanedAuthSessionIdsSample: scan.orphanedAuthSessions.slice(0, sampleCap).map(String),
        duplicateMembershipGroupsCount: scan.duplicateMemberships.length,
      },
      clerkPrefixedUserKeyHits: clerkUserKeyHits,
      clerkPrefixedUserKeyHitsCount: clerkUserKeyHits.length,
    };
  },
});

export const verify = query({
  args: {
    adminSecret: v.string(),
    scanLimitPerTable: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    assertDataMigrationAdmin(args.adminSecret);
    const lim = Math.min(Math.max(args.scanLimitPerTable ?? 25_000, 100), 100_000);
    const report = (await buildScanReport(ctx, lim)) as {
      counts: Record<string, number>;
      legacyExternalUserKeyHits: unknown[];
      legacyExternalOrgScopeHits: unknown[];
      malformedOrgScopeIds: unknown[];
      invalidForeignKeys: unknown[];
      orphanedOrganizationMembers: unknown[];
      orphanedAuthSessions: unknown[];
      truncatedTables: string[];
    };
    const openIssues =
      report.legacyExternalUserKeyHits.length +
      report.legacyExternalOrgScopeHits.length +
      report.malformedOrgScopeIds.length +
      report.invalidForeignKeys.length +
      report.orphanedOrganizationMembers.length +
      report.orphanedAuthSessions.length +
      report.truncatedTables.length;
    return {
      severity: openIssues > 0 ? ("warn" as const) : ("ok" as const),
      openIssues,
      report,
    };
  },
});

export const run = mutation({
  args: {
    adminSecret: v.string(),
    runId: v.string(),
    dryRun: v.boolean(),
    legacyUserMap: v.optional(v.record(v.string(), v.string())),
    legacyOrgMap: v.optional(v.record(v.string(), v.string())),
    purgeExpiredSessions: v.optional(v.boolean()),
    scanLimitPerTable: v.optional(v.number()),
    force: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    assertDataMigrationAdmin(args.adminSecret);
    const scanLimit = Math.min(Math.max(args.scanLimitPerTable ?? 25_000, 100), 100_000);
    const legacyUserMap = args.legacyUserMap ?? {};
    const legacyOrgMap = args.legacyOrgMap ?? {};
    const purgeExpiredSessions = args.purgeExpiredSessions ?? false;
    const fp = fingerprintFor(legacyUserMap, legacyOrgMap, purgeExpiredSessions);

    if (!args.dryRun && !args.force) {
      const prior = await ctx.db
        .query("dataMigrationRuns")
        .withIndex("by_fingerprint_mode_status", (q) =>
          q.eq("fingerprint", fp).eq("mode", "execute").eq("status", "completed"),
        )
        .first();
      if (prior) {
        return {
          skipped: true as const,
          reason: "duplicate_fingerprint",
          fingerprint: fp,
          priorRunId: prior.runId,
        };
      }
    }

    for (const [, to] of Object.entries(legacyUserMap)) {
      const u = await ctx.db.get(to as Id<"authUsers">);
      if (!u) {
        throw new Error(`legacyUserMap target missing authUsers row: ${to}`);
      }
    }
    for (const [, to] of Object.entries(legacyOrgMap)) {
      const o = await ctx.db.get(to as Id<"organizations">);
      if (!o) {
        throw new Error(`legacyOrgMap target missing organizations row: ${to}`);
      }
    }

    const report = await buildScanReport(ctx, scanLimit);

    const orgRowsFull = await ctx.db.query("organizations").collect();
    const orgIdSet = new Set(orgRowsFull.map((o) => o._id));

    let legacyUserHits: LegacyExternalUserKeyHit[] =
      (report as { legacyExternalUserKeyHits: LegacyExternalUserKeyHit[] }).legacyExternalUserKeyHits ?? [];
    let legacyOrgHits: LegacyExternalOrgScopeHit[] =
      (report as { legacyExternalOrgScopeHits: LegacyExternalOrgScopeHit[] }).legacyExternalOrgScopeHits ?? [];
    if (Object.keys(legacyUserMap).length > 0) {
      legacyUserHits = await collectAllLegacyExternalUserKeyHits(ctx);
    }
    if (Object.keys(legacyOrgMap).length > 0) {
      legacyOrgHits = await collectAllLegacyExternalOrgScopeHits(ctx);
    }

    const summary = {
      repairedRows: 0,
      deletedRows: 0,
      mergedDuplicates: 0,
      sessionsPurged: 0,
      rollbackChunks: 0,
      unresolved: [] as string[],
    };

    const runRowId = await ctx.db.insert("dataMigrationRuns", {
      runId: args.runId,
      mode: args.dryRun ? "dry_run" : "execute",
      fingerprint: fp,
      startedAt: Date.now(),
      status: "running",
    });

    const rollbackBuf: RollbackEntry[] = [];
    const seq = { n: 0 };

    try {
      for (const hit of legacyUserHits) {
        if (!legacyUserMap[hit.value]) {
          summary.unresolved.push(
            `legacy_external_user_key ${hit.table} ${hit.docId} ${hit.field}=${hit.value}`,
          );
        }
      }
      for (const hit of legacyOrgHits) {
        if (!legacyOrgMap[hit.value]) {
          summary.unresolved.push(
            `legacy_external_org_scope ${hit.table} ${hit.docId} ${hit.field}=${hit.value}`,
          );
        }
      }

      const members = await ctx.db.query("organizationMembers").collect();
      const byKey = new Map<string, typeof members>();
      for (const m of members) {
        const k = `${m.organizationId}|${m.userKey}`;
        const g = byKey.get(k) ?? [];
        g.push(m);
        byKey.set(k, g);
      }
      for (const rows of byKey.values()) {
        if (rows.length <= 1) continue;
        rows.sort((a, b) => a._creationTime - b._creationTime);
        const drop = rows.slice(0, -1);
        summary.mergedDuplicates += drop.length;
        if (args.dryRun) {
          summary.deletedRows += drop.length;
          continue;
        }
        for (const d of drop) {
          const full = await ctx.db.get(d._id);
          if (!full) continue;
          await recordRollback(ctx, args.runId, seq, rollbackBuf, {
            table: "organizationMembers",
            docId: full._id,
            op: "delete",
            before: full,
          });
          await ctx.db.delete(d._id);
          summary.deletedRows++;
        }
      }

      for (const m of members) {
        if (orgIdSet.has(m.organizationId)) continue;
        if (args.dryRun) {
          summary.deletedRows++;
          continue;
        }
        const full = await ctx.db.get(m._id);
        if (!full) continue;
        await recordRollback(ctx, args.runId, seq, rollbackBuf, {
          table: "organizationMembers",
          docId: full._id,
          op: "delete",
          before: full,
        });
        await ctx.db.delete(full._id);
        summary.deletedRows++;
      }

      const lenderIdSet = new Set(
        (await ctx.db.query("lenders").collect()).map((l) => l._id),
      );
      for (const p of await ctx.db.query("pipeline").collect()) {
        const filtered = p.lenders.filter((id) => lenderIdSet.has(id));
        const selBad =
          p.selectedLenderId != null && !lenderIdSet.has(p.selectedLenderId);
        if (filtered.length === p.lenders.length && !selBad) continue;
        if (args.dryRun) {
          summary.repairedRows++;
          continue;
        }
        await recordRollback(ctx, args.runId, seq, rollbackBuf, {
          table: "pipeline",
          docId: p._id,
          op: "patch",
          before: p,
        });
        const patch: { lenders: typeof p.lenders; selectedLenderId?: undefined } = {
          lenders: filtered,
        };
        if (selBad) patch.selectedLenderId = undefined;
        await ctx.db.patch(p._id, patch);
        summary.repairedRows++;
      }

      const optionalOrgTables = [
        "pipeline",
        "contacts",
        "lenders",
        "tasks",
        "libraryDocuments",
        "lenderAttachments",
        "taskAttachments",
        "signatureEnvelopes",
      ] as const;

      for (const tableName of optionalOrgTables) {
        for (const row of await ctx.db.query(tableName).collect()) {
          const oid = (row as { organizationId?: Id<"organizations"> }).organizationId;
          if (!oid || orgIdSet.has(oid)) continue;
          if (args.dryRun) {
            summary.repairedRows++;
            continue;
          }
          const before = await ctx.db.get(row._id);
          if (!before) continue;
          await recordRollback(ctx, args.runId, seq, rollbackBuf, {
            table: tableName,
            docId: row._id,
            op: "patch",
            before,
          });
          await ctx.db.patch(row._id, { organizationId: undefined });
          summary.repairedRows++;
        }
      }

      const authUsersAll = await ctx.db.query("authUsers").collect();
      for (const u of authUsersAll) {
        if (!u.defaultOrganizationId) continue;
        const o = await ctx.db.get(u.defaultOrganizationId);
        if (o) continue;
        if (args.dryRun) {
          summary.repairedRows++;
          continue;
        }
        await recordRollback(ctx, args.runId, seq, rollbackBuf, {
          table: "authUsers",
          docId: u._id,
          op: "patch",
          before: u,
        });
        await ctx.db.patch(u._id, { defaultOrganizationId: undefined });
        summary.repairedRows++;
      }

      const patchDoc = async (
        table: string,
        docId: string,
        patch: Record<string, unknown>,
      ) => {
        if (args.dryRun) {
          summary.repairedRows++;
          return;
        }
        const id = docId as Id<TableNames>;
        const before = await ctx.db.get(id);
        if (!before) return;
        await recordRollback(ctx, args.runId, seq, rollbackBuf, {
          table,
          docId,
          op: "patch",
          before,
        });
        await ctx.db.patch(id, patch);
        summary.repairedRows++;
      };

      for (const hit of legacyUserHits) {
        const to = legacyUserMap[hit.value];
        if (!to) continue;

        if (hit.table === "organizationMembers") {
          const doc = await ctx.db.get(hit.docId as Id<"organizationMembers">);
          if (!doc || doc.userKey === to) continue;
          await patchDoc("organizationMembers", hit.docId, { userKey: to });
          continue;
        }
        if (hit.table === "userOnboarding") {
          const doc = await ctx.db.get(hit.docId as Id<"userOnboarding">);
          if (!doc || doc.userKey === to) continue;
          await patchDoc("userOnboarding", hit.docId, { userKey: to });
          continue;
        }
        if (hit.table === "pipeline") {
          const doc = await ctx.db.get(hit.docId as Id<"pipeline">);
          if (!doc) continue;
          if (hit.field === "ownerUserKey" && doc.ownerUserKey === hit.value && doc.ownerUserKey !== to) {
            await patchDoc("pipeline", hit.docId, { ownerUserKey: to });
          } else if (hit.field === "assigneeId" && doc.assigneeId === hit.value && doc.assigneeId !== to) {
            await patchDoc("pipeline", hit.docId, { assigneeId: to });
          } else if (hit.field === "sharedWithIds") {
            const next = (doc.sharedWithIds ?? []).map((x) => (x === hit.value ? to : x));
            const same =
              next.length === (doc.sharedWithIds ?? []).length &&
              next.every((x, i) => x === (doc.sharedWithIds ?? [])[i]);
            if (!same) await patchDoc("pipeline", hit.docId, { sharedWithIds: next });
          }
          continue;
        }
        if (hit.table === "pipelineFileShares") {
          const doc = await ctx.db.get(hit.docId as Id<"pipelineFileShares">);
          if (!doc) continue;
          if (hit.field === "userKey" && doc.userKey === hit.value && doc.userKey !== to) {
            await patchDoc("pipelineFileShares", hit.docId, { userKey: to });
          }
          if (hit.field === "createdByUserKey" && doc.createdByUserKey === hit.value && doc.createdByUserKey !== to) {
            await patchDoc("pipelineFileShares", hit.docId, { createdByUserKey: to });
          }
          continue;
        }
        if (hit.table === "pipelineFileActivity") {
          const doc = await ctx.db.get(hit.docId as Id<"pipelineFileActivity">);
          if (!doc || doc.shareTargetUserKey !== hit.value || doc.shareTargetUserKey === to) continue;
          await patchDoc("pipelineFileActivity", hit.docId, { shareTargetUserKey: to });
          continue;
        }
        if (hit.table === "tasks") {
          const doc = await ctx.db.get(hit.docId as Id<"tasks">);
          if (!doc) continue;
          if (hit.field === "assigneeId" && doc.assigneeId === hit.value && doc.assigneeId !== to) {
            await patchDoc("tasks", hit.docId, { assigneeId: to });
          } else if (hit.field === "sharedWithIds") {
            const next = (doc.sharedWithIds ?? []).map((x) => (x === hit.value ? to : x));
            const same =
              next.length === (doc.sharedWithIds ?? []).length &&
              next.every((x, i) => x === (doc.sharedWithIds ?? [])[i]);
            if (!same) await patchDoc("tasks", hit.docId, { sharedWithIds: next });
          }
          continue;
        }
        if (hit.table === "taskNotifications") {
          const doc = await ctx.db.get(hit.docId as Id<"taskNotifications">);
          if (!doc) continue;
          if (hit.field === "userKey" && doc.userKey === hit.value && doc.userKey !== to) {
            await patchDoc("taskNotifications", hit.docId, { userKey: to });
          }
          if (hit.field === "actorUserKey" && doc.actorUserKey === hit.value && doc.actorUserKey !== to) {
            await patchDoc("taskNotifications", hit.docId, { actorUserKey: to });
          }
          continue;
        }
        if (hit.table === "userNotifications") {
          const doc = await ctx.db.get(hit.docId as Id<"userNotifications">);
          if (!doc) continue;
          if (hit.field === "userKey" && doc.userKey === hit.value && doc.userKey !== to) {
            await patchDoc("userNotifications", hit.docId, { userKey: to });
          }
          if (hit.field === "actorUserKey" && doc.actorUserKey === hit.value && doc.actorUserKey !== to) {
            await patchDoc("userNotifications", hit.docId, { actorUserKey: to });
          }
          continue;
        }
        if (hit.table === "activityFeed") {
          const doc = await ctx.db.get(hit.docId as Id<"activityFeed">);
          if (!doc || doc.actorKey !== hit.value || doc.actorKey === to) continue;
          await patchDoc("activityFeed", hit.docId, { actorKey: to });
          continue;
        }
        if (hit.table === "libraryDocuments") {
          const doc = await ctx.db.get(hit.docId as Id<"libraryDocuments">);
          if (!doc || doc.createdByUserKey !== hit.value || doc.createdByUserKey === to) continue;
          await patchDoc("libraryDocuments", hit.docId, { createdByUserKey: to });
          continue;
        }
        if (hit.table === "libraryDocumentVersions") {
          const doc = await ctx.db.get(hit.docId as Id<"libraryDocumentVersions">);
          if (!doc || doc.uploadedByUserKey !== hit.value || doc.uploadedByUserKey === to) continue;
          await patchDoc("libraryDocumentVersions", hit.docId, { uploadedByUserKey: to });
          continue;
        }
        if (hit.table === "libraryDocumentLinks") {
          const doc = await ctx.db.get(hit.docId as Id<"libraryDocumentLinks">);
          if (!doc || doc.linkedByUserKey !== hit.value || doc.linkedByUserKey === to) continue;
          await patchDoc("libraryDocumentLinks", hit.docId, { linkedByUserKey: to });
          continue;
        }
        if (hit.table === "fileMessages") {
          const doc = await ctx.db.get(hit.docId as Id<"fileMessages">);
          if (!doc || doc.teamUserKey !== hit.value || doc.teamUserKey === to) continue;
          await patchDoc("fileMessages", hit.docId, { teamUserKey: to });
          continue;
        }
        if (hit.table === "clientPortalGrants") {
          const doc = await ctx.db.get(hit.docId as Id<"clientPortalGrants">);
          if (!doc || doc.invitedByUserKey !== hit.value || doc.invitedByUserKey === to) continue;
          await patchDoc("clientPortalGrants", hit.docId, { invitedByUserKey: to });
          continue;
        }
        if (hit.table === "clientPortalRequests") {
          const doc = await ctx.db.get(hit.docId as Id<"clientPortalRequests">);
          if (!doc || doc.createdByUserKey !== hit.value || doc.createdByUserKey === to) continue;
          await patchDoc("clientPortalRequests", hit.docId, { createdByUserKey: to });
          continue;
        }
        if (hit.table === "clientPortalUpdates") {
          const doc = await ctx.db.get(hit.docId as Id<"clientPortalUpdates">);
          if (!doc || doc.createdByUserKey !== hit.value || doc.createdByUserKey === to) continue;
          await patchDoc("clientPortalUpdates", hit.docId, { createdByUserKey: to });
          continue;
        }
        if (hit.table === "signatureEnvelopes") {
          const doc = await ctx.db.get(hit.docId as Id<"signatureEnvelopes">);
          if (!doc || doc.createdByUserKey !== hit.value || doc.createdByUserKey === to) continue;
          await patchDoc("signatureEnvelopes", hit.docId, { createdByUserKey: to });
          continue;
        }
        if (hit.table === "signatureAuditEvents") {
          const doc = await ctx.db.get(hit.docId as Id<"signatureAuditEvents">);
          if (!doc || doc.actorKey !== hit.value || doc.actorKey === to) continue;
          await patchDoc("signatureAuditEvents", hit.docId, { actorKey: to });
          continue;
        }
        if (hit.table === "integrationApiKeys") {
          const doc = await ctx.db.get(hit.docId as Id<"integrationApiKeys">);
          if (!doc || doc.actorUserKey !== hit.value || doc.actorUserKey === to) continue;
          await patchDoc("integrationApiKeys", hit.docId, { actorUserKey: to });
          continue;
        }
        if (hit.table === "integrationOAuthClients") {
          const doc = await ctx.db.get(hit.docId as Id<"integrationOAuthClients">);
          if (!doc || doc.actorUserKey !== hit.value || doc.actorUserKey === to) continue;
          await patchDoc("integrationOAuthClients", hit.docId, { actorUserKey: to });
          continue;
        }
        if (hit.table === "integrationAccessTokens") {
          const doc = await ctx.db.get(hit.docId as Id<"integrationAccessTokens">);
          if (!doc || doc.actorUserKey !== hit.value || doc.actorUserKey === to) continue;
          await patchDoc("integrationAccessTokens", hit.docId, { actorUserKey: to });
          continue;
        }
        if (hit.table === "integrationConnectors") {
          const doc = await ctx.db.get(hit.docId as Id<"integrationConnectors">);
          if (!doc || doc.createdByUserKey !== hit.value || doc.createdByUserKey === to) continue;
          await patchDoc("integrationConnectors", hit.docId, { createdByUserKey: to });
          continue;
        }
        if (hit.table === "outboundWebhookSubscriptions") {
          const doc = await ctx.db.get(hit.docId as Id<"outboundWebhookSubscriptions">);
          if (!doc || doc.createdByUserKey !== hit.value || doc.createdByUserKey === to) continue;
          await patchDoc("outboundWebhookSubscriptions", hit.docId, { createdByUserKey: to });
          continue;
        }
        if (hit.table === "emailInboxSyncPreferences") {
          const doc = await ctx.db.get(hit.docId as Id<"emailInboxSyncPreferences">);
          if (!doc || doc.userKey !== hit.value || doc.userKey === to) continue;
          await patchDoc("emailInboxSyncPreferences", hit.docId, { userKey: to });
          continue;
        }
      }

      for (const hit of legacyOrgHits) {
        const to = legacyOrgMap[hit.value];
        if (!to) continue;
        if (args.dryRun) {
          summary.repairedRows++;
          continue;
        }
        const id = hit.docId as Id<TableNames>;
        const before = await ctx.db.get(id);
        if (!before) continue;
        if (hit.field === "orgScope" && "orgScope" in before) {
          const cur = (before as { orgScope: string }).orgScope;
          if (cur !== hit.value || cur === to) continue;
          await recordRollback(ctx, args.runId, seq, rollbackBuf, {
            table: hit.table,
            docId: hit.docId,
            op: "patch",
            before,
          });
          await ctx.db.patch(id, { orgScope: to });
          summary.repairedRows++;
        } else if (hit.field === "scopeId" && "scopeId" in before) {
          const cur = (before as { scopeId: string }).scopeId;
          if (cur !== hit.value || cur === to) continue;
          await recordRollback(ctx, args.runId, seq, rollbackBuf, {
            table: hit.table,
            docId: hit.docId,
            op: "patch",
            before,
          });
          await ctx.db.patch(id, { scopeId: to });
          summary.repairedRows++;
        }
      }

      const now = Date.now();
      for (const s of await ctx.db.query("authSessions").collect()) {
        const orphan = !(await ctx.db.get(s.userId));
        const expired = s.absoluteExpiresAtMs < now;
        const shouldDrop = orphan || (purgeExpiredSessions && expired);
        if (!shouldDrop) continue;
        if (args.dryRun) {
          summary.sessionsPurged++;
          continue;
        }
        const full = await ctx.db.get(s._id);
        if (!full) continue;
        await recordRollback(ctx, args.runId, seq, rollbackBuf, {
          table: "authSessions",
          docId: full._id,
          op: "delete",
          before: full,
        });
        await ctx.db.delete(s._id);
        summary.sessionsPurged++;
        summary.deletedRows++;
      }

      await flushRollback(ctx, args.runId, seq, rollbackBuf);
      summary.rollbackChunks = seq.n;

      await ctx.db.patch(runRowId, {
        status: "completed",
        completedAt: Date.now(),
        summary,
      });

      return {
        skipped: false as const,
        dryRun: args.dryRun,
        runId: args.runId,
        fingerprint: fp,
        summary,
        unresolvedCorruption: summary.unresolved,
      };
    } catch (e) {
      await flushRollback(ctx, args.runId, seq, rollbackBuf);
      await ctx.db.patch(runRowId, {
        status: "failed",
        completedAt: Date.now(),
        error: e instanceof Error ? e.message : String(e),
        summary,
      });
      throw e;
    }
  },
});
