import { internalMutation } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { sha256Hex } from "./integrationCrypto";
import { assertOrgPlanFeature } from "./organizationPlan";
import { upsertPipelineLeadFromInboundJob } from "./integrationInboundPipelineLead";
import { applyCreateFileTaskFromInbound } from "./integrationFileTask";
import { ownerUserIdFieldsForInsert } from "./resourceAccess";
import { refreshTaskGlobalSearchText } from "./globalSearchSync";

const BOT_ACTIONS = [
  "upsert_pipeline_lead",
  "add_note",
  "create_task",
  "create_file_task",
  "list_files",
  "list_contacts",
  "get_file",
] as const;

type BotAction = (typeof BOT_ACTIONS)[number];

const MAX_LIST = 50;
const MAX_NOTE = 8000;
const MAX_TASK_TITLE = 200;
const MAX_TASK_BODY = 4000;

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const t = value.trim();
  return t || undefined;
}

function asFiniteInt(value: unknown, fallback: number, min: number, max: number): number {
  const n =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? parseInt(value, 10)
        : NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.min(Math.max(Math.floor(n), min), max);
}

function isBotAction(raw: string): raw is BotAction {
  return (BOT_ACTIONS as readonly string[]).includes(raw);
}

async function verifyConnectorToken(
  ctx: MutationCtx,
  connectorPublicId: string,
  inboundToken: string | undefined,
): Promise<{
  connectorId: Id<"integrationConnectors">;
  organizationId: Id<"organizations">;
  actorUserKey: string;
  providerKey: string;
  category: "crm" | "email" | "messaging";
  publicId: string;
}> {
  const conn = await ctx.db
    .query("integrationConnectors")
    .withIndex("by_publicId", (q) =>
      q.eq("publicId", connectorPublicId.trim().toLowerCase()),
    )
    .first();
  if (!conn || conn.status !== "active") {
    throw new Error("Unknown or inactive connector.");
  }
  if (conn.inboundVerifyHash && conn.inboundVerifySalt) {
    const tok = inboundToken?.trim() ?? "";
    if (!tok) throw new Error("Inbound token required.");
    const got = await sha256Hex(`${conn.inboundVerifySalt}:${tok}`);
    if (got !== conn.inboundVerifyHash) {
      throw new Error("Invalid inbound token.");
    }
  }
  const actorUserKey = conn.createdByUserKey?.trim();
  if (!actorUserKey) {
    throw new Error("Inbound connector owner missing; cannot act for org.");
  }
  // Connector token is the auth boundary (same as inbound webhook). Do not call
  // assertOrgMember / requireAuthenticatedCaller — HTTP has no JWT.
  await assertOrgPlanFeature(ctx, conn.organizationId, "integrations");
  return {
    connectorId: conn._id,
    organizationId: conn.organizationId,
    actorUserKey,
    providerKey: conn.providerKey,
    category: conn.category,
    publicId: conn.publicId,
  };
}

async function findCompletedIdempotent(
  ctx: MutationCtx,
  organizationId: Id<"organizations">,
  idempotencyKey: string,
): Promise<{ jobId: Id<"integrationJobs">; result: unknown } | null> {
  const existing = await ctx.db
    .query("integrationJobs")
    .withIndex("by_org_idempotency", (q) =>
      q.eq("organizationId", organizationId).eq("idempotencyKey", idempotencyKey),
    )
    .first();
  if (!existing) return null;
  if (existing.status === "completed" && existing.resultSummary) {
    try {
      return {
        jobId: existing._id,
        result: JSON.parse(existing.resultSummary) as unknown,
      };
    } catch {
      return {
        jobId: existing._id,
        result: { ok: true, deduped: true, summary: existing.resultSummary },
      };
    }
  }
  if (existing.status === "pending" || existing.status === "running") {
    return {
      jobId: existing._id,
      result: { ok: true, deduped: true, pending: true, jobId: existing._id },
    };
  }
  return null;
}

async function beginBotJob(
  ctx: MutationCtx,
  args: {
    organizationId: Id<"organizations">;
    connectorId: Id<"integrationConnectors">;
    category: "crm" | "email" | "messaging";
    providerKey: string;
    action: string;
    payload: unknown;
    idempotencyKey?: string;
  },
): Promise<{ jobId: Id<"integrationJobs">; dedupedResult?: unknown }> {
  const trimmedIdem = args.idempotencyKey?.trim() ?? "";
  if (trimmedIdem) {
    const prior = await findCompletedIdempotent(
      ctx,
      args.organizationId,
      trimmedIdem,
    );
    if (prior) {
      return { jobId: prior.jobId, dedupedResult: prior.result };
    }
  }
  const now = Date.now();
  const idemKey =
    trimmedIdem ||
    `bot:${args.action}:${now}-${Math.random().toString(36).slice(2)}`;
  const jobId = await ctx.db.insert("integrationJobs", {
    organizationId: args.organizationId,
    connectorId: args.connectorId,
    category: args.category,
    providerKey: args.providerKey,
    kind: "action",
    idempotencyKey: idemKey,
    status: "running",
    payload: {
      source: "integration_bot",
      action: args.action,
      body: args.payload,
      receivedAt: now,
    },
    attemptCount: 1,
    maxAttempts: 1,
    nextAttemptAt: now,
    startedAt: now,
    createdAt: now,
    updatedAt: now,
    inboundAutomationDispatched: true,
  });
  return { jobId };
}

async function completeBotJob(
  ctx: MutationCtx,
  jobId: Id<"integrationJobs">,
  result: unknown,
): Promise<void> {
  const now = Date.now();
  await ctx.db.patch(jobId, {
    status: "completed",
    completedAt: now,
    updatedAt: now,
    resultSummary: JSON.stringify(result).slice(0, 8000),
  });
}

async function failBotJob(
  ctx: MutationCtx,
  jobId: Id<"integrationJobs">,
  errorMessage: string,
): Promise<void> {
  const now = Date.now();
  await ctx.db.patch(jobId, {
    status: "dead",
    completedAt: now,
    updatedAt: now,
    lastError: errorMessage.slice(0, 4000),
    resultSummary: JSON.stringify({ ok: false, error: errorMessage }).slice(
      0,
      8000,
    ),
  });
}

/**
 * Synchronous bot action dispatcher (connector-token auth already applied by caller
 * via args; this mutation re-verifies the token).
 */
export const dispatchBotAction = internalMutation({
  args: {
    connectorPublicId: v.string(),
    inboundToken: v.optional(v.string()),
    action: v.string(),
    payload: v.any(),
    idempotencyKey: v.optional(v.string()),
  },
  returns: v.any(),
  handler: async (ctx, args) => {
    const auth = await verifyConnectorToken(
      ctx,
      args.connectorPublicId,
      args.inboundToken,
    );
    const actionRaw = args.action.trim().toLowerCase();
    if (!isBotAction(actionRaw)) {
      return {
        ok: false,
        error: "unknown_action",
        detail: `Unknown action "${args.action}". Supported: ${BOT_ACTIONS.join(", ")}`,
        supportedActions: [...BOT_ACTIONS],
      };
    }

    const payload = args.payload ?? {};

    if (actionRaw === "list_files") {
      const body = asRecord(payload) ?? {};
      const limit = asFiniteInt(body.limit, 20, 1, MAX_LIST);
      const includeArchived = body.includeArchived === true;
      const files = await ctx.db
        .query("pipeline")
        .withIndex("by_organization_createdAt", (q) =>
          q.eq("organizationId", auth.organizationId),
        )
        .order("desc")
        .take(includeArchived ? limit : Math.min(limit * 3, MAX_LIST * 3));
      const filtered = includeArchived
        ? files
        : files.filter((r) => r.archivedAt == null);
      return {
        ok: true,
        action: actionRaw,
        files: filtered.slice(0, limit).map((r) => ({
          id: r._id,
          fileName: r.fileName,
          status: r.status,
          createdAt: r.createdAt,
          updatedAt: r.updatedAt,
          archivedAt: r.archivedAt ?? null,
          clientId: r.clientId ?? null,
          projectId: r.projectId ?? null,
        })),
      };
    }

    if (actionRaw === "list_contacts") {
      const body = asRecord(payload) ?? {};
      const limit = asFiniteInt(body.limit, 20, 1, MAX_LIST);
      const rows = await ctx.db
        .query("contacts")
        .withIndex("by_organization_updatedAt", (q) =>
          q.eq("organizationId", auth.organizationId),
        )
        .order("desc")
        .take(limit);
      return {
        ok: true,
        action: actionRaw,
        contacts: rows.map((r) => ({
          id: r._id,
          name: r.name,
          email: (r.email ?? "").trim() || null,
          phone: (r.phone ?? "").trim() || null,
          companyName: (r.companyName ?? "").trim() || null,
          updatedAt: r.updatedAt,
        })),
      };
    }

    if (actionRaw === "get_file") {
      const body = asRecord(payload) ?? {};
      const fileIdRaw = asString(body.fileId) ?? asString(body.id);
      if (!fileIdRaw) {
        return {
          ok: false,
          error: "validation_error",
          detail: "payload.fileId is required",
        };
      }
      const file = await ctx.db.get(fileIdRaw as Id<"pipeline">);
      if (!file || file.organizationId !== auth.organizationId) {
        return { ok: false, error: "not_found", detail: "File not found" };
      }
      return {
        ok: true,
        action: actionRaw,
        file: {
          id: file._id,
          fileName: file.fileName,
          status: file.status,
          notes: file.notes ?? null,
          createdAt: file.createdAt,
          updatedAt: file.updatedAt,
          archivedAt: file.archivedAt ?? null,
          clientId: file.clientId ?? null,
          projectId: file.projectId ?? null,
          fundingAmount: file.fundingAmount ?? null,
        },
      };
    }

    // ---- Writes (idempotent via integrationJobs) ----
    const job = await beginBotJob(ctx, {
      organizationId: auth.organizationId,
      connectorId: auth.connectorId,
      category: auth.category,
      providerKey: auth.providerKey,
      action: actionRaw,
      payload,
      idempotencyKey: args.idempotencyKey,
    });
    if (job.dedupedResult !== undefined) {
      return {
        ok: true,
        action: actionRaw,
        deduped: true,
        jobId: job.jobId,
        result: job.dedupedResult,
      };
    }

    try {
      let result: unknown;

      if (actionRaw === "upsert_pipeline_lead") {
        // Reuse inbound upsert: wrap payload like webhook ingest.
        const now = Date.now();
        await ctx.db.patch(job.jobId, {
          kind: "inbound_event",
          payload: {
            receivedAt: now,
            rawLength: JSON.stringify(payload).length,
            body: payload,
          },
          updatedAt: now,
        });
        const upserted = await upsertPipelineLeadFromInboundJob(ctx, {
          jobId: job.jobId,
        });
        if (!upserted) {
          throw new Error(
            "Could not extract lead fields (need name or company, plus optional email/phone/stage).",
          );
        }
        result = { ok: true, ...upserted };
      } else if (actionRaw === "add_note") {
        const body = asRecord(payload) ?? {};
        const fileIdRaw = asString(body.fileId) ?? asString(body.pipelineFileId);
        const content = asString(body.content) ?? asString(body.note) ?? asString(body.text);
        if (!fileIdRaw) {
          throw new Error("payload.fileId is required");
        }
        if (!content) {
          throw new Error("payload.content is required");
        }
        const file = await ctx.db.get(fileIdRaw as Id<"pipeline">);
        if (!file || file.organizationId !== auth.organizationId) {
          throw new Error("File not found in this organization");
        }
        const noteId = await ctx.db.insert("pipelineFileNotes", {
          organizationId: auth.organizationId,
          pipelineFileId: file._id,
          authorUserKey: auth.actorUserKey,
          content: content.slice(0, MAX_NOTE),
        });
        result = { ok: true, noteId, fileId: file._id };
      } else if (actionRaw === "create_task") {
        const body = asRecord(payload) ?? {};
        const title = asString(body.title);
        if (!title) throw new Error("payload.title is required");
        const description =
          asString(body.description) ?? asString(body.body) ?? undefined;
        const fileIdRaw =
          asString(body.fileId) ??
          asString(body.relatedFileId) ??
          asString(body.pipelineFileId);
        let relatedFileId: Id<"pipeline"> | undefined;
        if (fileIdRaw) {
          const file = await ctx.db.get(fileIdRaw as Id<"pipeline">);
          if (!file || file.organizationId !== auth.organizationId) {
            throw new Error("related file not found in this organization");
          }
          relatedFileId = file._id;
        }
        const now = Date.now();
        const taskId = await ctx.db.insert("tasks", {
          title: title.slice(0, MAX_TASK_TITLE),
          description: description?.slice(0, MAX_TASK_BODY),
          type: "work",
          category: "admin",
          quadrant: 2,
          status: "todo",
          priority: 2,
          relatedFileId,
          organizationId: auth.organizationId,
          ...ownerUserIdFieldsForInsert(auth.actorUserKey),
          createdAt: now,
          updatedAt: now,
        });
        await refreshTaskGlobalSearchText(ctx, taskId);
        result = {
          ok: true,
          taskId,
          relatedFileId: relatedFileId ?? null,
        };
      } else if (actionRaw === "create_file_task") {
        const created = await applyCreateFileTaskFromInbound(ctx, {
          organizationId: auth.organizationId,
          actorUserKey: auth.actorUserKey,
          now: Date.now(),
          payload: payload,
          requireAction: false,
        });
        result = {
          ok: true,
          taskId: created.taskId,
          relatedFileId: created.relatedFileId,
        };
      } else {
        throw new Error(`Unhandled action ${actionRaw}`);
      }

      await completeBotJob(ctx, job.jobId, result);
      return {
        ok: true,
        action: actionRaw,
        deduped: false,
        jobId: job.jobId,
        result,
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await failBotJob(ctx, job.jobId, msg);
      return {
        ok: false,
        action: actionRaw,
        jobId: job.jobId,
        error: "action_failed",
        detail: msg,
      };
    }
  },
});
