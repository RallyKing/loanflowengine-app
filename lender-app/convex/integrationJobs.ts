import {
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { assertOrgMember, assertOrgPermission } from "./organizationAccess";
import { sha256Hex } from "./integrationCrypto";
import {
  type IntegrationCategory,
  isKnownProvider,
} from "../lib/integrations/catalog";
import { assertOrgPlanFeature } from "./organizationPlan";

const categoryV = v.union(
  v.literal("crm"),
  v.literal("email"),
  v.literal("messaging"),
);

const jobKindV = v.union(
  v.literal("inbound_event"),
  v.literal("sync_pull"),
  v.literal("sync_push"),
  v.literal("action"),
);

export const DEFAULT_MAX_ATTEMPTS = 8;

function backoffMs(attemptAfterIncrement: number): number {
  const base = 1000 * Math.pow(2, Math.max(0, attemptAfterIncrement - 1));
  return Math.min(300_000, base);
}

export const getJob = internalQuery({
  args: { jobId: v.id("integrationJobs") },
  handler: async (ctx, { jobId }) => ctx.db.get(jobId),
});

export const tryClaimJob = internalMutation({
  args: { jobId: v.id("integrationJobs") },
  handler: async (ctx, { jobId }) => {
    const j = await ctx.db.get(jobId);
    const now = Date.now();
    if (!j || j.status !== "pending" || j.nextAttemptAt > now) {
      return { claimed: false as const };
    }
    await ctx.db.patch(jobId, {
      status: "running",
      startedAt: now,
      attemptCount: j.attemptCount + 1,
      updatedAt: now,
      lastError: undefined,
    });
    return { claimed: true as const };
  },
});

export const completeJob = internalMutation({
  args: {
    jobId: v.id("integrationJobs"),
    resultSummary: v.optional(v.string()),
  },
  handler: async (ctx, { jobId, resultSummary }) => {
    const now = Date.now();
    await ctx.db.patch(jobId, {
      status: "completed",
      completedAt: now,
      updatedAt: now,
      resultSummary: resultSummary ?? "ok",
    });
  },
});

export const failJob = internalMutation({
  args: {
    jobId: v.id("integrationJobs"),
    errorMessage: v.string(),
  },
  handler: async (ctx, { jobId, errorMessage }) => {
    const j = await ctx.db.get(jobId);
    if (!j) return { scheduled: false as const };
    const now = Date.now();

    if (j.attemptCount >= j.maxAttempts) {
      await ctx.db.patch(jobId, {
        status: "dead",
        lastError: errorMessage.slice(0, 4000),
        updatedAt: now,
        completedAt: now,
      });
      return { scheduled: false as const, dead: true as const };
    }

    const delay = backoffMs(j.attemptCount);
    await ctx.db.patch(jobId, {
      status: "pending",
      lastError: errorMessage.slice(0, 4000),
      nextAttemptAt: now + delay,
      updatedAt: now,
    });

    await ctx.scheduler.runAfter(
      delay,
      internal.integrationJobWorker.executeIntegrationJob,
      { jobId },
    );
    return { scheduled: true as const, dead: false as const };
  },
});

async function insertJobAndSchedule(
  ctx: import("./_generated/server").MutationCtx,
  args: {
    organizationId: Id<"organizations">;
    connectorId?: Id<"integrationConnectors">;
    category: IntegrationCategory;
    providerKey: string;
    kind: "inbound_event" | "sync_pull" | "sync_push" | "action";
    idempotencyKey: string;
    payload: unknown;
    maxAttempts?: number;
  },
): Promise<{ jobId: Id<"integrationJobs">; deduped: boolean }> {
  await assertOrgPlanFeature(ctx, args.organizationId, "integrations");
  const trimmedIdem = args.idempotencyKey.trim();
  if (trimmedIdem) {
    const existing = await ctx.db
      .query("integrationJobs")
      .withIndex("by_org_idempotency", (q) =>
        q
          .eq("organizationId", args.organizationId)
          .eq("idempotencyKey", trimmedIdem),
      )
      .first();
    if (
      existing &&
      (existing.status === "pending" ||
        existing.status === "running" ||
        existing.status === "completed")
    ) {
      return { jobId: existing._id, deduped: true };
    }
  }

  const now = Date.now();
  const idemKey =
    trimmedIdem ||
    `nonce:${now}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;

  const jobId = await ctx.db.insert("integrationJobs", {
    organizationId: args.organizationId,
    connectorId: args.connectorId,
    category: args.category,
    providerKey: args.providerKey,
    kind: args.kind,
    idempotencyKey: idemKey,
    status: "pending",
    payload: args.payload,
    attemptCount: 0,
    maxAttempts: args.maxAttempts ?? DEFAULT_MAX_ATTEMPTS,
    nextAttemptAt: now,
    createdAt: now,
    updatedAt: now,
  });

  await ctx.scheduler.runAfter(0, internal.integrationJobWorker.executeIntegrationJob, {
    jobId,
  });

  return { jobId, deduped: false };
}

/** Called from authenticated HTTP (`integrations:invoke` scope). */
export const enqueueJobFromIntegrationHttp = internalMutation({
  args: {
    organizationId: v.id("organizations"),
    actorUserKey: v.string(),
    category: categoryV,
    providerKey: v.string(),
    kind: jobKindV,
    payload: v.any(),
    idempotencyKey: v.optional(v.string()),
    connectorPublicId: v.optional(v.string()),
    maxAttempts: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await assertOrgMember(ctx, args.organizationId, args.actorUserKey);
    const cat = args.category as IntegrationCategory;
    const pk = args.providerKey.trim();
    if (!isKnownProvider(cat, pk)) {
      throw new Error(`Unknown provider "${pk}" for category ${cat}.`);
    }
    if (args.kind === "inbound_event") {
      throw new Error("inbound_event jobs must be created via webhook ingest.");
    }

    let connectorId: Id<"integrationConnectors"> | undefined;
    if (args.connectorPublicId?.trim()) {
      const conn = await ctx.db
        .query("integrationConnectors")
        .withIndex("by_publicId", (q) =>
          q.eq("publicId", args.connectorPublicId!.trim().toLowerCase()),
        )
        .first();
      if (!conn || conn.organizationId !== args.organizationId) {
        throw new Error("Connector not found for this organization.");
      }
      if (conn.status !== "active") {
        throw new Error("Connector is paused.");
      }
      connectorId = conn._id;
    }

    return insertJobAndSchedule(ctx, {
      organizationId: args.organizationId,
      connectorId,
      category: cat,
      providerKey: pk,
      kind: args.kind,
      idempotencyKey: (args.idempotencyKey ?? "").trim(),
      payload: args.payload,
      maxAttempts: args.maxAttempts,
    });
  },
});

/** Trusted internal path: workflows with org membership proofs. */
export const enqueueFromAutomation = internalMutation({
  args: {
    organizationId: v.id("organizations"),
    actorUserKey: v.string(),
    category: categoryV,
    providerKey: v.string(),
    kind: v.union(v.literal("action"), v.literal("sync_push")),
    payload: v.any(),
    idempotencyKey: v.string(),
    connectorPublicId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await assertOrgMember(ctx, args.organizationId, args.actorUserKey);
    const cat = args.category as IntegrationCategory;
    const pk = args.providerKey.trim();
    if (!isKnownProvider(cat, pk)) {
      throw new Error(`Unknown provider "${pk}" for category ${cat}.`);
    }
    let connectorId: Id<"integrationConnectors"> | undefined;
    if (args.connectorPublicId?.trim()) {
      const conn = await ctx.db
        .query("integrationConnectors")
        .withIndex("by_publicId", (q) =>
          q.eq("publicId", args.connectorPublicId!.trim().toLowerCase()),
        )
        .first();
      if (!conn || conn.organizationId !== args.organizationId) {
        throw new Error("Connector not found for this organization.");
      }
      if (conn.status !== "active") {
        throw new Error("Connector is paused.");
      }
      connectorId = conn._id;
    }
    return insertJobAndSchedule(ctx, {
      organizationId: args.organizationId,
      connectorId,
      category: cat,
      providerKey: pk,
      kind: args.kind,
      idempotencyKey: args.idempotencyKey.trim(),
      payload: args.payload,
    });
  },
});

/**
 * Chain a follow-up job from a verified inbound integration job (no end-user
 * principal). Server-only; validates source row shape.
 */
export const enqueueChainedFromInbound = internalMutation({
  args: {
    sourceJobId: v.id("integrationJobs"),
    category: categoryV,
    providerKey: v.string(),
    kind: v.union(v.literal("action"), v.literal("sync_push")),
    payload: v.any(),
    idempotencyKey: v.string(),
    connectorPublicId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const source = await ctx.db.get(args.sourceJobId);
    if (!source) throw new Error("Source job not found.");
    if (source.kind !== "inbound_event") {
      throw new Error("invalid_source_job_kind");
    }
    const orgId = source.organizationId;
    const cat = args.category as IntegrationCategory;
    const pk = args.providerKey.trim();
    if (!isKnownProvider(cat, pk)) {
      throw new Error(`Unknown provider "${pk}" for category ${cat}.`);
    }
    let connectorId: Id<"integrationConnectors"> | undefined;
    if (args.connectorPublicId?.trim()) {
      const conn = await ctx.db
        .query("integrationConnectors")
        .withIndex("by_publicId", (q) =>
          q.eq("publicId", args.connectorPublicId!.trim().toLowerCase()),
        )
        .first();
      if (!conn || conn.organizationId !== orgId) {
        throw new Error("Connector not found for this organization.");
      }
      if (conn.status !== "active") {
        throw new Error("Connector is paused.");
      }
      connectorId = conn._id;
    }
    return insertJobAndSchedule(ctx, {
      organizationId: orgId,
      connectorId,
      category: cat,
      providerKey: pk,
      kind: args.kind,
      idempotencyKey: args.idempotencyKey.trim(),
      payload: args.payload,
    });
  },
});

/** Inbound webhook → durable queue (validates connector link only). */
export const enqueueInboundFromWebhook = internalMutation({
  args: {
    connectorPublicId: v.string(),
    inboundToken: v.optional(v.string()),
    rawBody: v.string(),
    parsedPayload: v.any(),
    idempotencyKey: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const conn = await ctx.db
      .query("integrationConnectors")
      .withIndex("by_publicId", (q) =>
        q.eq("publicId", args.connectorPublicId.trim().toLowerCase()),
      )
      .first();
    if (!conn || conn.status !== "active") {
      throw new Error("Unknown or inactive connector.");
    }

    if (conn.inboundVerifyHash && conn.inboundVerifySalt) {
      const tok = args.inboundToken?.trim() ?? "";
      if (!tok) throw new Error("Inbound token required.");
      const got = await sha256Hex(`${conn.inboundVerifySalt}:${tok}`);
      if (got !== conn.inboundVerifyHash) {
        throw new Error("Invalid inbound token.");
      }
    }

    const out = await insertJobAndSchedule(ctx, {
      organizationId: conn.organizationId,
      connectorId: conn._id,
      category: conn.category as IntegrationCategory,
      providerKey: conn.providerKey,
      kind: "inbound_event",
      idempotencyKey: args.idempotencyKey?.trim() ?? "",
      payload: {
        receivedAt: Date.now(),
        rawLength: args.rawBody.length,
        body: args.parsedPayload,
      },
    });
    if (!out.deduped) {
      await ctx.scheduler.runAfter(
        0,
        internal.integrationAutomationBridge.processInboundIntegrationJob,
        { jobId: out.jobId },
      );
    }
    return out;
  },
});

/** Product UI / Convex dashboard: enqueue under org membership. */
export const enqueueJob = mutation({
  args: {
    organizationId: v.id("organizations"),
    memberUserKey: v.optional(v.string()),
    category: categoryV,
    providerKey: v.string(),
    kind: jobKindV,
    payload: v.any(),
    idempotencyKey: v.optional(v.string()),
    connectorId: v.optional(v.id("integrationConnectors")),
    maxAttempts: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await assertOrgMember(ctx, args.organizationId, args.memberUserKey);
    const cat = args.category as IntegrationCategory;
    const pk = args.providerKey.trim();
    if (!isKnownProvider(cat, pk)) {
      throw new Error(`Unknown provider "${pk}" for category ${cat}.`);
    }
    if (args.kind === "inbound_event") {
      throw new Error("Use webhooks for inbound_event.");
    }

    if (args.connectorId) {
      const conn = await ctx.db.get(args.connectorId);
      if (!conn || conn.organizationId !== args.organizationId) {
        throw new Error("Connector not found.");
      }
      if (conn.status !== "active") {
        throw new Error("Connector is paused.");
      }
    }

    return insertJobAndSchedule(ctx, {
      organizationId: args.organizationId,
      connectorId: args.connectorId,
      category: cat,
      providerKey: pk,
      kind: args.kind,
      idempotencyKey: args.idempotencyKey?.trim() ?? "",
      payload: args.payload,
      maxAttempts: args.maxAttempts,
    });
  },
});

/** Cron / sweeper: re-schedule due pending jobs if a scheduler fire was missed. */
export const sweepDueJobs = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const due = await ctx.db
      .query("integrationJobs")
      .withIndex("by_status_next", (q) => q.eq("status", "pending"))
      .filter((q) => q.lte(q.field("nextAttemptAt"), now))
      .take(40);

    for (const j of due) {
      await ctx.scheduler.runAfter(0, internal.integrationJobWorker.executeIntegrationJob, {
        jobId: j._id,
      });
    }
    return { scheduled: due.length };
  },
});

/** Recover jobs stuck in `running` (worker crash, timeout). */
export const recoverStaleRunningJobs = internalMutation({
  args: {},
  handler: async (ctx) => {
    const cutoff = Date.now() - 15 * 60 * 1000;
    const running = await ctx.db
      .query("integrationJobs")
      .withIndex("by_status_next", (q) => q.eq("status", "running"))
      .take(80);

    let recovered = 0;
    for (const j of running) {
      if (j.startedAt == null || j.startedAt >= cutoff) continue;
      await ctx.db.patch(j._id, {
        status: "pending",
        nextAttemptAt: Date.now(),
        lastError: "stale_running_recovered",
        updatedAt: Date.now(),
      });
      await ctx.scheduler.runAfter(0, internal.integrationJobWorker.executeIntegrationJob, {
        jobId: j._id,
      });
      recovered += 1;
    }
    return { recovered };
  },
});

export const upsertSyncCursor = internalMutation({
  args: {
    connectorId: v.id("integrationConnectors"),
    resourceKey: v.string(),
    cursor: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const existing = await ctx.db
      .query("integrationSyncCursors")
      .withIndex("by_connector_resource", (q) =>
        q.eq("connectorId", args.connectorId).eq("resourceKey", args.resourceKey),
      )
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, {
        cursor: args.cursor,
        lastSyncedAt: now,
        updatedAt: now,
      });
      return { id: existing._id };
    }
    const id = await ctx.db.insert("integrationSyncCursors", {
      connectorId: args.connectorId,
      resourceKey: args.resourceKey,
      cursor: args.cursor,
      lastSyncedAt: now,
      updatedAt: now,
    });
    return { id };
  },
});

export const getSyncCursor = internalQuery({
  args: {
    connectorId: v.id("integrationConnectors"),
    resourceKey: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("integrationSyncCursors")
      .withIndex("by_connector_resource", (q) =>
        q.eq("connectorId", args.connectorId).eq("resourceKey", args.resourceKey),
      )
      .first();
  },
});

export const listRecentJobsForOrg = query({
  args: {
    organizationId: v.id("organizations"),
    memberUserKey: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { organizationId, memberUserKey, limit }) => {
    await assertOrgPermission(
      ctx,
      organizationId,
      memberUserKey,
      "settings.access",
    );
    const cap = Math.min(Math.max(limit ?? 40, 1), 100);
    const rows = await ctx.db
      .query("integrationJobs")
      .withIndex("by_organization", (q) => q.eq("organizationId", organizationId))
      .order("desc")
      .take(cap);
    return rows.map((r) => ({
      id: r._id,
      kind: r.kind,
      category: r.category,
      providerKey: r.providerKey,
      status: r.status,
      attemptCount: r.attemptCount,
      maxAttempts: r.maxAttempts,
      idempotencyKey: r.idempotencyKey,
      lastError: r.lastError,
      resultSummary: r.resultSummary,
      createdAt: r.createdAt,
      completedAt: r.completedAt,
    }));
  },
});
