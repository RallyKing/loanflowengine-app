/**
 * Superuser impersonation lifecycle — start, stop, validate, probe.
 */
import { v } from "convex/values";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { mutation, query } from "../_generated/server";
import { assertAuthBridgeProofWithSkew } from "../auth/bridge";
import { pickCanonicalAuthSession } from "../auth/authSessionPick";
import { authUserMayInitiateSuperuserImpersonation } from "../auth/superuserAllowlist";
import { tryGetAuthUserByPermissionKey } from "../auth/globalAdmin";
import { appendSuperuserImpersonationAudit } from "./auditLog";
import {
  IMPERSONATION_MAX_TTL_MS,
  validateImpersonationSessionRow,
} from "./runtime";
import { assertOrgPermission } from "../organizationRbac";

const SKEW_MS = 120_000;

function randomPublicId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function randomNonce(): string {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

async function sha256Hex(value: string): Promise<string> {
  const buf = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return [...new Uint8Array(buf)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function assertAuthSessionForInitiator(
  ctx: QueryCtx | MutationCtx,
  args: {
    authSessionPublicId: string;
    authSessionTokenHash: string;
    nowMs: number;
  },
) {
  const sessionRows = await ctx.db
    .query("authSessions")
    .withIndex("by_publicId", (q) => q.eq("publicId", args.authSessionPublicId))
    .collect();
  const row = pickCanonicalAuthSession(sessionRows);
  if (!row || row.revokedAtMs) throw new Error("AUTH_SESSION_INVALID");
  if (row.absoluteExpiresAtMs < args.nowMs || row.idleExpiresAtMs < args.nowMs) {
    throw new Error("AUTH_SESSION_EXPIRED");
  }
  const withinPrev =
    row.previousTokenHash === args.authSessionTokenHash &&
    row.previousTokenValidUntilMs !== undefined &&
    args.nowMs <= row.previousTokenValidUntilMs;
  if (row.tokenHash !== args.authSessionTokenHash && !withinPrev) {
    throw new Error("AUTH_SESSION_TOKEN_INVALID");
  }
  const user = await ctx.db.get(row.userId);
  if (!user) throw new Error("AUTH_USER_MISSING");
  if (!authUserMayInitiateSuperuserImpersonation(user)) {
    throw new Error("FORBIDDEN");
  }
  return { session: row, user };
}

async function revokeActiveForInitiator(
  ctx: MutationCtx,
  initiatorUserId: Id<"authUsers">,
  nowMs: number,
  reason: string,
) {
  const rows = await ctx.db
    .query("superuserImpersonationSessions")
    .withIndex("by_initiator", (q) => q.eq("initiatorUserId", initiatorUserId))
    .collect();
  for (const row of rows) {
    if (row.revokedAtMs) continue;
    await ctx.db.patch(row._id, {
      revokedAtMs: nowMs,
      revokeReason: reason,
    });
  }
}

export const validateImpersonation = query({
  args: {
    publicId: v.string(),
    tokenHash: v.string(),
    authSessionPublicId: v.string(),
    nowMs: v.number(),
  },
  handler: async (ctx, args) => {
    const validated = await validateImpersonationSessionRow(ctx, args);
    if (!validated.ok) {
      return { ok: false as const, code: validated.code };
    }
    const { row, orgName } = validated;
    return {
      ok: true as const,
      targetOrganizationId: row.targetOrganizationId,
      targetOrganizationName: orgName,
      mode: row.mode,
      issuedAt: row.issuedAt,
      expiresAt: row.expiresAt,
      initiatorUserId: row.initiatorUserId,
    };
  },
});

export const listImpersonationTargets = query({
  args: {
    memberUserKey: v.string(),
    bridgePayload: v.string(),
    bridgeProof: v.string(),
  },
  handler: async (ctx, args) => {
    await assertAuthBridgeProofWithSkew(args.bridgePayload, args.bridgeProof, SKEW_MS);
    const user = await tryGetAuthUserByPermissionKey(ctx, args.memberUserKey);
    if (!user || !authUserMayInitiateSuperuserImpersonation(user)) {
      throw new Error("FORBIDDEN");
    }
    const orgs = await ctx.db.query("organizations").collect();
    return orgs
      .map((o) => ({ _id: o._id, name: o.name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  },
});

export const start = mutation({
  args: {
    authSessionPublicId: v.string(),
    authSessionTokenHash: v.string(),
    targetOrganizationId: v.id("organizations"),
    mode: v.union(v.literal("readonly"), v.literal("operator")),
    nowMs: v.number(),
    bridgePayload: v.string(),
    bridgeProof: v.string(),
  },
  handler: async (ctx, args) => {
    await assertAuthBridgeProofWithSkew(args.bridgePayload, args.bridgeProof, SKEW_MS);
    const { user } = await assertAuthSessionForInitiator(ctx, args);

    const org = await ctx.db.get(args.targetOrganizationId);
    if (!org) throw new Error("ORG_NOT_FOUND");

    await revokeActiveForInitiator(ctx, user._id, args.nowMs, "superseded");

    const publicId = randomPublicId();
    const secret = randomNonce();
    const tokenHash = await sha256Hex(secret);
    const nonce = randomNonce();
    const issuedAt = args.nowMs;
    const expiresAt = issuedAt + IMPERSONATION_MAX_TTL_MS;

    await ctx.db.insert("superuserImpersonationSessions", {
      publicId,
      tokenHash,
      authSessionPublicId: args.authSessionPublicId,
      initiatorUserId: user._id,
      targetOrganizationId: args.targetOrganizationId,
      mode: args.mode,
      issuedAt,
      expiresAt,
      nonce,
    });

    await appendSuperuserImpersonationAudit(ctx, {
      event: "start",
      initiatorUserId: user._id,
      targetOrganizationId: args.targetOrganizationId,
      targetOrganizationName: org.name,
      impersonationPublicId: publicId,
      mode: args.mode,
    });

    return {
      ok: true as const,
      publicId,
      secret,
      targetOrganizationId: args.targetOrganizationId,
      targetOrganizationName: org.name,
      mode: args.mode,
      issuedAt,
      expiresAt,
    };
  },
});

export const stop = mutation({
  args: {
    authSessionPublicId: v.string(),
    authSessionTokenHash: v.string(),
    impersonationPublicId: v.optional(v.string()),
    nowMs: v.number(),
    bridgePayload: v.string(),
    bridgeProof: v.string(),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await assertAuthBridgeProofWithSkew(args.bridgePayload, args.bridgeProof, SKEW_MS);
    const { user } = await assertAuthSessionForInitiator(ctx, args);

    const rows = await ctx.db
      .query("superuserImpersonationSessions")
      .withIndex("by_initiator", (q) => q.eq("initiatorUserId", user._id))
      .collect();

    let stopped = 0;
    for (const row of rows) {
      if (row.revokedAtMs) continue;
      if (
        args.impersonationPublicId &&
        row.publicId !== args.impersonationPublicId
      ) {
        continue;
      }
      await ctx.db.patch(row._id, {
        revokedAtMs: args.nowMs,
        revokeReason: args.reason ?? "stop",
      });
      const org = await ctx.db.get(row.targetOrganizationId);
      await appendSuperuserImpersonationAudit(ctx, {
        event: args.reason === "logout" ? "logout" : "stop",
        initiatorUserId: user._id,
        targetOrganizationId: row.targetOrganizationId,
        targetOrganizationName: org?.name,
        impersonationPublicId: row.publicId,
        mode: row.mode,
        durationMs: args.nowMs - row.issuedAt,
      });
      stopped += 1;
    }

    return { ok: true as const, stopped };
  },
});

/** Harmless org-scoped write probe for impersonation validation. */
export const probeTenantWrite = mutation({
  args: {
    organizationId: v.id("organizations"),
    memberUserKey: v.string(),
  },
  handler: async (ctx, args) => {
    await assertOrgPermission(
      ctx,
      args.organizationId,
      args.memberUserKey,
      "settings.manage",
    );
    const org = await ctx.db.get(args.organizationId);
    if (!org) throw new Error("ORG_NOT_FOUND");
    const now = Date.now();
    await ctx.db.patch(args.organizationId, { updatedAt: now });
    return { ok: true as const, updatedAt: now };
  },
});
