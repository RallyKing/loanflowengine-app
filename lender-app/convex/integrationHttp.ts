import { internal } from "./_generated/api";
import { api } from "./_generated/api";
import type { ActionCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { integrationScopeAllows } from "./integrationScopes";

const JSON_HDR = { "Content-Type": "application/json; charset=utf-8" };

function corsHeaders(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers":
      "Authorization, Content-Type, Idempotency-Key, X-Integration-Token",
    "Access-Control-Max-Age": "86400",
  };
}

function jsonResponse(
  body: unknown,
  status: number,
  extra?: Record<string, string>,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...JSON_HDR, ...corsHeaders(), ...extra },
  });
}

function parseClampedInt(
  raw: string | null,
  fallback: number,
  min: number,
  max: number,
): number {
  if (raw == null || raw === "") return fallback;
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(Math.max(n, min), max);
}

function parseBool(raw: string | null, fallback: boolean): boolean {
  if (raw == null || raw === "") return fallback;
  const l = raw.trim().toLowerCase();
  if (l === "true" || l === "1" || l === "yes") return true;
  if (l === "false" || l === "0" || l === "no") return false;
  return fallback;
}

const MAX_WEBHOOK_BYTES = 512 * 1024;
const MAX_JOB_BODY_BYTES = 256 * 1024;

async function readRawBodyLimited(
  request: Request,
  maxBytes: number,
): Promise<{ ok: true; raw: string } | { ok: false; response: Response }> {
  const raw = await request.text();
  if (raw.length > maxBytes) {
    return {
      ok: false,
      response: jsonResponse({ error: "payload_too_large" }, 413),
    };
  }
  return { ok: true, raw };
}

const TASK_STATUSES = new Set([
  "todo",
  "in_progress",
  "done",
  "archived",
]);

async function readFormLikeBody(
  request: Request,
): Promise<Record<string, string>> {
  const ct = (request.headers.get("content-type") ?? "").toLowerCase();
  if (ct.includes("application/json")) {
    try {
      const j = (await request.json()) as Record<string, unknown>;
      const out: Record<string, string> = {};
      for (const [k, v] of Object.entries(j)) {
        if (v == null) continue;
        out[k] = typeof v === "string" ? v : String(v);
      }
      return out;
    } catch {
      return {};
    }
  }
  const text = await request.text();
  const out: Record<string, string> = {};
  const sp = new URLSearchParams(text);
  sp.forEach((v, k) => {
    out[k] = v;
  });
  return out;
}

async function authenticate(
  ctx: ActionCtx,
  request: Request,
): Promise<
  | {
      organizationId: Id<"organizations">;
      actorUserKey: string;
      scopes: string[];
      credentialPublicId: string;
    }
  | Response
> {
  const auth = request.headers.get("Authorization");
  const bearer =
    auth?.startsWith("Bearer ") || auth?.startsWith("bearer ")
      ? auth.slice(7).trim()
      : auth?.trim() ?? "";

  const resolved = await ctx.runQuery(internal.integrationApi.resolveIntegrationBearer, {
    bearer,
  });

  if (!resolved) {
    return jsonResponse({ error: "invalid_token" }, 401);
  }

  const rl = await ctx.runMutation(
    internal.integrationApi.consumeIntegrationRateLimit,
    { credentialPublicId: resolved.credentialPublicId },
  );

  if (!rl.ok) {
    return jsonResponse(
      { error: "rate_limited" },
      429,
      rl.retryAfterSec
        ? { "Retry-After": String(rl.retryAfterSec) }
        : undefined,
    );
  }

  return {
    organizationId: resolved.organizationId,
    actorUserKey: resolved.actorUserKey,
    scopes: resolved.scopes,
    credentialPublicId: resolved.credentialPublicId,
  };
}

/**
 * Shared entry for integration HTTP routes registered in `http.ts`.
 */
export async function integrationDispatch(
  ctx: ActionCtx,
  request: Request,
): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }

  const url = new URL(request.url);
  const path = url.pathname.replace(/\/$/, "") || "/";

  try {
    if (path === "/api/v1/oauth/token" && request.method === "POST") {
      const fields = await readFormLikeBody(request);
      const grant = (fields.grant_type ?? "").trim();
      if (grant !== "client_credentials") {
        return jsonResponse(
          { error: "unsupported_grant_type" },
          400,
        );
      }
      const clientId = (fields.client_id ?? "").trim();
      const clientSecret = (fields.client_secret ?? "").trim();
      const tok = await ctx.runMutation(
        internal.integrationApi.oauthClientCredentials,
        { clientId, clientSecret },
      );
      if (!tok) {
        return jsonResponse({ error: "invalid_client" }, 401);
      }
      return jsonResponse(
        {
          access_token: tok.accessToken,
          token_type: "Bearer",
          expires_in: tok.expiresInSec,
        },
        200,
      );
    }

    if (path === "/api/v1/integrations/webhook" && request.method === "POST") {
      const connectorPublicId = url.searchParams.get("connector")?.trim();
      if (!connectorPublicId) {
        return jsonResponse(
          {
            error: "validation_error",
            detail: "Query parameter `connector` (public id) is required.",
          },
          400,
        );
      }
      const rb = await readRawBodyLimited(request, MAX_WEBHOOK_BYTES);
      if (!rb.ok) return rb.response;

      let parsedPayload: unknown = {};
      const trimmed = rb.raw.trim();
      if (trimmed.length > 0) {
        try {
          parsedPayload = JSON.parse(trimmed) as unknown;
        } catch {
          return jsonResponse({ error: "invalid_json" }, 400);
        }
      }

      const inboundToken =
        request.headers.get("X-Integration-Token")?.trim() ||
        url.searchParams.get("token")?.trim() ||
        undefined;
      const idempotencyKey =
        request.headers.get("Idempotency-Key")?.trim() || undefined;

      try {
        const out = await ctx.runMutation(
          internal.integrationJobs.enqueueInboundFromWebhook,
          {
            connectorPublicId,
            inboundToken,
            rawBody: rb.raw,
            parsedPayload,
            idempotencyKey,
          },
        );
        return jsonResponse(
          { accepted: true, jobId: out.jobId, deduped: out.deduped },
          202,
        );
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        const lower = msg.toLowerCase();
        if (lower.includes("invalid inbound") || lower.includes("required")) {
          return jsonResponse({ error: "unauthorized", detail: msg }, 401);
        }
        if (
          lower.includes("unknown") ||
          lower.includes("inactive") ||
          lower.includes("not found")
        ) {
          return jsonResponse({ error: "not_found", detail: msg }, 404);
        }
        throw e;
      }
    }

    /**
     * Private bot work API (same connector token as webhook).
     * Body: `{ action, payload?, idempotencyKey? }`
     * Returns 200 with synchronous result (not 202 queue-only).
     */
    if (path === "/api/v1/integrations/bot" && request.method === "POST") {
      const connectorPublicId = url.searchParams.get("connector")?.trim();
      if (!connectorPublicId) {
        return jsonResponse(
          {
            error: "validation_error",
            detail: "Query parameter `connector` (public id) is required.",
          },
          400,
        );
      }
      const rb = await readRawBodyLimited(request, MAX_WEBHOOK_BYTES);
      if (!rb.ok) return rb.response;

      let body: Record<string, unknown>;
      try {
        body =
          rb.raw.trim() === ""
            ? {}
            : (JSON.parse(rb.raw) as Record<string, unknown>);
      } catch {
        return jsonResponse({ error: "invalid_json" }, 400);
      }

      const action =
        typeof body.action === "string" ? body.action.trim() : "";
      if (!action) {
        return jsonResponse(
          {
            error: "validation_error",
            detail:
              "JSON must include string field `action` (e.g. upsert_pipeline_lead, add_note, create_task, create_file_task, list_files, list_contacts, get_file).",
          },
          400,
        );
      }

      const inboundToken =
        request.headers.get("X-Integration-Token")?.trim() ||
        url.searchParams.get("token")?.trim() ||
        undefined;
      const idempotencyKey =
        request.headers.get("Idempotency-Key")?.trim() ||
        (typeof body.idempotencyKey === "string"
          ? body.idempotencyKey.trim()
          : undefined) ||
        undefined;

      try {
        const out = await ctx.runMutation(
          internal.integrationBot.dispatchBotAction,
          {
            connectorPublicId,
            inboundToken,
            action,
            payload: body.payload ?? body.args ?? body,
            idempotencyKey,
          },
        );
        const failed =
          out &&
          typeof out === "object" &&
          "ok" in out &&
          (out as { ok: unknown }).ok === false;
        return jsonResponse(out, failed ? 400 : 200);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        const lower = msg.toLowerCase();
        if (
          lower.includes("invalid inbound") ||
          lower.includes("inbound token") ||
          lower.includes("unauthorized") ||
          (lower.includes("token") && lower.includes("required"))
        ) {
          return jsonResponse({ error: "unauthorized", detail: msg }, 401);
        }
        if (
          lower.includes("unknown") ||
          lower.includes("inactive") ||
          lower.includes("not found")
        ) {
          return jsonResponse({ error: "not_found", detail: msg }, 404);
        }
        throw e;
      }
    }

    if (path === "/api/v1/integrations/jobs" && request.method === "POST") {
      const auth = await authenticate(ctx, request);
      if (auth instanceof Response) return auth;
      if (!integrationScopeAllows(auth.scopes, "integrations:invoke")) {
        return jsonResponse({ error: "insufficient_scope" }, 403);
      }

      const rb = await readRawBodyLimited(request, MAX_JOB_BODY_BYTES);
      if (!rb.ok) return rb.response;
      let body: Record<string, unknown>;
      try {
        body =
          rb.raw.trim() === ""
            ? {}
            : (JSON.parse(rb.raw) as Record<string, unknown>);
      } catch {
        return jsonResponse({ error: "invalid_json" }, 400);
      }

      const kind = body.kind;
      const category = body.category;
      const providerKey = body.providerKey;
      if (
        typeof kind !== "string" ||
        typeof category !== "string" ||
        typeof providerKey !== "string"
      ) {
        return jsonResponse(
          {
            error: "validation_error",
            detail: "JSON must include string fields: kind, category, providerKey.",
          },
          400,
        );
      }

      const idempotencyKey =
        typeof body.idempotencyKey === "string"
          ? body.idempotencyKey
          : undefined;
      const connectorPublicId =
        typeof body.connectorPublicId === "string"
          ? body.connectorPublicId
          : undefined;
      const maxAttempts =
        typeof body.maxAttempts === "number" &&
        Number.isFinite(body.maxAttempts)
          ? Math.min(Math.max(Math.floor(body.maxAttempts), 1), 20)
          : undefined;

      try {
        const out = await ctx.runMutation(
          internal.integrationJobs.enqueueJobFromIntegrationHttp,
          {
            organizationId: auth.organizationId,
            actorUserKey: auth.actorUserKey,
            category: category as "crm" | "email" | "messaging",
            providerKey,
            kind: kind as
              | "sync_pull"
              | "sync_push"
              | "action"
              | "inbound_event",
            payload: body.payload ?? {},
            idempotencyKey,
            connectorPublicId,
            maxAttempts,
          },
        );
        return jsonResponse(
          { accepted: true, jobId: out.jobId, deduped: out.deduped },
          202,
        );
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return jsonResponse({ error: "validation_error", detail: msg }, 400);
      }
    }

    if (request.method !== "GET") {
      return jsonResponse({ error: "method_not_allowed" }, 405);
    }

    const auth = await authenticate(ctx, request);
    if (auth instanceof Response) return auth;

    const { organizationId, actorUserKey, scopes } = auth;

    if (path === "/api/v1/files") {
      if (!integrationScopeAllows(scopes, "files:read")) {
        return jsonResponse({ error: "insufficient_scope" }, 403);
      }
      const limit = parseClampedInt(url.searchParams.get("limit"), 100, 1, 500);
      const includeArchived = parseBool(
        url.searchParams.get("includeArchived"),
        false,
      );
      const rows = await ctx.runQuery(api.pipeline.listLight, {
        organizationId,
        memberUserKey: actorUserKey,
        includeArchived,
        maxRows: limit,
      });
      return jsonResponse({ files: rows }, 200);
    }

    if (path === "/api/v1/files/detail") {
      if (!integrationScopeAllows(scopes, "files:read")) {
        return jsonResponse({ error: "insufficient_scope" }, 403);
      }
      const idRaw =
        url.searchParams.get("id") ?? url.searchParams.get("fileId");
      if (!idRaw?.trim()) {
        return jsonResponse(
          { error: "validation_error", detail: "id query parameter required" },
          400,
        );
      }
      const detail = await ctx.runQuery(api.pipeline.getDetail, {
        id: idRaw.trim() as Id<"pipeline">,
        memberUserKey: actorUserKey,
      });
      if (!detail) {
        return jsonResponse({ error: "not_found" }, 404);
      }
      return jsonResponse(detail, 200);
    }

    if (path === "/api/v1/contacts") {
      if (!integrationScopeAllows(scopes, "contacts:read")) {
        return jsonResponse({ error: "insufficient_scope" }, 403);
      }
      const contactRoleIdFilter =
        url.searchParams.get("contactRoleId")?.trim() ||
        url.searchParams.get("contactRoleIdFilter")?.trim() ||
        undefined;
      const rows = await ctx.runQuery(api.contacts.list, {
        organizationId,
        memberUserKey: actorUserKey,
        contactRoleIdFilter,
      });
      return jsonResponse({ contacts: rows }, 200);
    }

    if (path === "/api/v1/lenders") {
      if (!integrationScopeAllows(scopes, "lenders:read")) {
        return jsonResponse({ error: "insufficient_scope" }, 403);
      }
      const limit = parseClampedInt(url.searchParams.get("limit"), 200, 1, 500);
      const rows = await ctx.runQuery(
        internal.integrationResources.listLendersForIntegration,
        { organizationId, memberUserKey: actorUserKey, limit },
      );
      return jsonResponse({ lenders: rows }, 200);
    }

    if (path === "/api/v1/tasks") {
      if (!integrationScopeAllows(scopes, "tasks:read")) {
        return jsonResponse({ error: "insufficient_scope" }, 403);
      }
      const limit = parseClampedInt(url.searchParams.get("limit"), 100, 1, 500);
      const statusRaw = url.searchParams.get("status")?.trim();
      let status:
        | "todo"
        | "in_progress"
        | "done"
        | "archived"
        | undefined;
      if (statusRaw) {
        if (!TASK_STATUSES.has(statusRaw)) {
          return jsonResponse(
            {
              error: "validation_error",
              detail:
                "status must be one of: todo, in_progress, done, archived",
            },
            400,
          );
        }
        status = statusRaw as typeof status;
      }
      const rows = await ctx.runQuery(
        internal.integrationResources.listTasksForIntegration,
        {
          organizationId,
          memberUserKey: actorUserKey,
          limit,
          status,
        },
      );
      return jsonResponse({ tasks: rows }, 200);
    }

    return jsonResponse({ error: "not_found" }, 404);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const lower = msg.toLowerCase();
    if (
      lower.includes("not found") ||
      lower.includes("not a member") ||
      lower.includes("required")
    ) {
      return jsonResponse({ error: "forbidden", detail: msg }, 403);
    }
    if (lower.includes("argumentvalidationerror") || lower.includes("invalid")) {
      return jsonResponse({ error: "validation_error", detail: msg }, 400);
    }
    console.error("[integrationDispatch]", e);
    return jsonResponse({ error: "internal_error" }, 500);
  }
}
