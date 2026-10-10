/**
 * Append-only platform account activity log for the primary platform admin.
 * Slim DTOs only — never store passwords or hashes.
 */
import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import type { Id } from "../_generated/dataModel";
import {
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "../_generated/server";
import { validateStoredArgon2PasswordHash } from "../../lib/auth/passwordPolicy";
import { requireAuthenticatedCaller } from "../callerAuth";
import { tryGetAuthUserByPermissionKey } from "./globalAdmin";
import { authUserIsPrimaryPlatformAdmin } from "./primaryPlatformAdmin";
import {
  bumpCredentialForUserKey,
  revokeAllSessionsForUserId,
} from "./sessionInvalidate";

export type PlatformAccountEventType =
  | "signup"
  | "signup_approved"
  | "signup_rejected"
  | "account_disabled"
  | "account_reenabled"
  | "login_success"
  | "login_failure"
  | "password_reset_by_owner"
  | "password_reset_by_org_admin"
  | "force_logout"
  | "document_download"
  | "lender_import"
  | "pipeline_file_created"
  | "data_export";

async function requirePrimaryPlatformAdminCaller(
  ctx: QueryCtx | MutationCtx,
  memberUserKey: string | undefined,
) {
  const key = await requireAuthenticatedCaller(ctx, memberUserKey);
  const user = await tryGetAuthUserByPermissionKey(ctx, key);
  if (!user || !authUserIsPrimaryPlatformAdmin(user)) {
    throw new Error("Unauthorized");
  }
  return user;
}

function sanitizeDetail(detail: string | undefined): string | undefined {
  if (!detail) return undefined;
  const trimmed = detail.trim().slice(0, 280);
  if (!trimmed) return undefined;
  // Defense-in-depth: never persist anything that looks like a secret.
  if (
    /password|passwd|secret|token|hash|argon2|bearer/i.test(trimmed) &&
    /[=:$]/.test(trimmed)
  ) {
    return undefined;
  }
  return trimmed;
}

/**
 * Best-effort append. Call sites should not let this fail the primary write.
 */
export async function recordPlatformAccountAudit(
  ctx: MutationCtx,
  args: {
    subjectUserId: Id<"authUsers">;
    actorUserId?: Id<"authUsers">;
    eventType: PlatformAccountEventType;
    summary: string;
    detail?: string;
  },
): Promise<void> {
  const summary = args.summary.trim().slice(0, 160);
  if (!summary) return;
  const detail = sanitizeDetail(args.detail);
  await ctx.db.insert("platformAccountAuditEvents", {
    subjectUserId: args.subjectUserId,
    actorUserId: args.actorUserId,
    at: Date.now(),
    eventType: args.eventType,
    summary,
    ...(detail ? { detail } : {}),
  });
}

/** Resolve memberUserKey → authUsers id and append (no-op if unknown key). */
export async function recordPlatformAccountAuditForUserKey(
  ctx: MutationCtx,
  args: {
    userKey: string;
    actorUserKey?: string;
    eventType: PlatformAccountEventType;
    summary: string;
    detail?: string;
  },
): Promise<void> {
  const subject = await tryGetAuthUserByPermissionKey(ctx, args.userKey);
  if (!subject) return;
  let actorUserId: Id<"authUsers"> | undefined;
  if (args.actorUserKey) {
    const actor = await tryGetAuthUserByPermissionKey(ctx, args.actorUserKey);
    actorUserId = actor?._id;
  }
  await recordPlatformAccountAudit(ctx, {
    subjectUserId: subject._id,
    actorUserId,
    eventType: args.eventType,
    summary: args.summary,
    detail: args.detail,
  });
}

/**
 * Paginated activity log for one account. Owner-only.
 * Client uses load-more; no nested scrollport in Settings.
 */
export const listAccountActivityLog = query({
  args: {
    memberUserKey: v.optional(v.string()),
    subjectUserId: v.id("authUsers"),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    await requirePrimaryPlatformAdminCaller(ctx, args.memberUserKey);

    const page = await ctx.db
      .query("platformAccountAuditEvents")
      .withIndex("by_subject_at", (q) =>
        q.eq("subjectUserId", args.subjectUserId),
      )
      .order("desc")
      .paginate(args.paginationOpts);

    return {
      ...page,
      page: page.page.map((row) => ({
        id: row._id,
        at: row.at,
        eventType: row.eventType,
        summary: row.summary,
        detail: row.detail ?? null,
        actorUserId: row.actorUserId ?? null,
      })),
    };
  },
});

/**
 * Platform admin sets a new password hash for any account.
 * Sessions revoked; credential version bumped. Never logs plaintext/hash.
 */
export const platformAdminSetPassword = mutation({
  args: {
    memberUserKey: v.optional(v.string()),
    targetUserId: v.id("authUsers"),
    passwordHash: v.string(),
  },
  returns: v.object({ ok: v.literal(true) }),
  handler: async (ctx, args) => {
    const actor = await requirePrimaryPlatformAdminCaller(
      ctx,
      args.memberUserKey,
    );

    const hashErr = validateStoredArgon2PasswordHash(args.passwordHash);
    if (hashErr) throw new Error(hashErr);

    const target = await ctx.db.get(args.targetUserId);
    if (!target) throw new Error("User not found.");

    const now = Date.now();
    await ctx.db.patch(target._id, {
      passwordHash: args.passwordHash,
      updatedAt: now,
    });
    await bumpCredentialForUserKey(ctx, target._id as string);
    await revokeAllSessionsForUserId(
      ctx,
      target._id,
      "platform_admin_password_reset",
    );
    await recordPlatformAccountAudit(ctx, {
      subjectUserId: target._id,
      actorUserId: actor._id,
      eventType: "password_reset_by_owner",
      summary: "Password reset by platform owner",
      detail: "All sessions revoked",
    });
    return { ok: true as const };
  },
});
