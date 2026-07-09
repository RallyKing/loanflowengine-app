import type { MutationCtx } from "./_generated/server";

export const PORTAL_PASSWORD_THROTTLE_PREFIX = "pw:";
export const PORTAL_MAGIC_THROTTLE_PREFIX = "magic:";

const MAX_PASSWORD_FAILS = 8;
const PASSWORD_LOCK_MS = 15 * 60 * 1000;
const MAX_MAGIC_FAILS = 24;
const MAGIC_LOCK_MS = 15 * 60 * 1000;
export const MAX_CONCURRENT_PORTAL_SESSIONS = 8;

async function appendSecurityAudit(
  ctx: MutationCtx,
  args: {
    kind: string;
    orgScope?: string;
    subjectKey?: string;
    detail?: string;
  },
): Promise<void> {
  await ctx.db.insert("securityAuditLog", {
    at: Date.now(),
    kind: args.kind,
    orgScope: args.orgScope,
    subjectKey: args.subjectKey?.trim().slice(0, 200),
    detail: args.detail?.slice(0, 2000),
  });
}

export async function assertPasswordSignInAllowed(
  ctx: MutationCtx,
  orgScope: string,
  emailKey: string,
): Promise<void> {
  const key = `${PORTAL_PASSWORD_THROTTLE_PREFIX}${orgScope}:${emailKey}`;
  const row = await ctx.db
    .query("portalAuthThrottle")
    .withIndex("by_key", (q) => q.eq("key", key))
    .unique();
  if (row && row.lockedUntil > Date.now()) {
    await appendSecurityAudit(ctx, {
      kind: "portal_signin_rate_limited",
      orgScope,
      subjectKey: emailKey,
      detail: "password_lock_active",
    });
    throw new Error(
      "Too many sign-in attempts. Please wait a few minutes and try again.",
    );
  }
}

export async function recordPortalPasswordFailure(
  ctx: MutationCtx,
  orgScope: string,
  emailKey: string,
): Promise<void> {
  const key = `${PORTAL_PASSWORD_THROTTLE_PREFIX}${orgScope}:${emailKey}`;
  const now = Date.now();
  const row = await ctx.db
    .query("portalAuthThrottle")
    .withIndex("by_key", (q) => q.eq("key", key))
    .unique();
  const failCount = (row?.failCount ?? 0) + 1;
  let lockedUntil = row?.lockedUntil ?? 0;
  if (failCount >= MAX_PASSWORD_FAILS) {
    lockedUntil = now + PASSWORD_LOCK_MS;
    await appendSecurityAudit(ctx, {
      kind: "portal_account_locked",
      orgScope,
      subjectKey: emailKey,
      detail: `password_failures=${failCount}`,
    });
  }
  await appendSecurityAudit(ctx, {
    kind: "portal_password_fail",
    orgScope,
    subjectKey: emailKey,
  });
  if (row) {
    await ctx.db.patch(row._id, { failCount, lockedUntil, updatedAt: now });
  } else {
    await ctx.db.insert("portalAuthThrottle", {
      key,
      failCount,
      firstFailAt: now,
      lockedUntil,
      updatedAt: now,
    });
  }
}

export async function clearPortalPasswordThrottle(
  ctx: MutationCtx,
  orgScope: string,
  emailKey: string,
): Promise<void> {
  const key = `${PORTAL_PASSWORD_THROTTLE_PREFIX}${orgScope}:${emailKey}`;
  const row = await ctx.db
    .query("portalAuthThrottle")
    .withIndex("by_key", (q) => q.eq("key", key))
    .unique();
  if (row) await ctx.db.delete(row._id);
}

export async function assertMagicExchangeAllowed(
  ctx: MutationCtx,
  tokenHash: string,
): Promise<void> {
  const key = `${PORTAL_MAGIC_THROTTLE_PREFIX}${tokenHash}`;
  const row = await ctx.db
    .query("portalAuthThrottle")
    .withIndex("by_key", (q) => q.eq("key", key))
    .unique();
  if (row && row.lockedUntil > Date.now()) {
    await appendSecurityAudit(ctx, {
      kind: "portal_magic_rate_limited",
      subjectKey: tokenHash.slice(0, 24),
      detail: "magic_lock_active",
    });
    throw new Error("Too many attempts. Please wait a few minutes.");
  }
}

export async function recordMagicLinkFailure(
  ctx: MutationCtx,
  tokenHash: string,
): Promise<void> {
  const key = `${PORTAL_MAGIC_THROTTLE_PREFIX}${tokenHash}`;
  const now = Date.now();
  const row = await ctx.db
    .query("portalAuthThrottle")
    .withIndex("by_key", (q) => q.eq("key", key))
    .unique();
  const failCount = (row?.failCount ?? 0) + 1;
  let lockedUntil = row?.lockedUntil ?? 0;
  if (failCount >= MAX_MAGIC_FAILS) {
    lockedUntil = now + MAGIC_LOCK_MS;
    await appendSecurityAudit(ctx, {
      kind: "portal_magic_locked",
      subjectKey: tokenHash.slice(0, 24),
      detail: `magic_failures=${failCount}`,
    });
  }
  await appendSecurityAudit(ctx, {
    kind: "portal_magic_fail",
    subjectKey: tokenHash.slice(0, 24),
    detail: "invalid_or_expired",
  });
  if (row) {
    await ctx.db.patch(row._id, { failCount, lockedUntil, updatedAt: now });
  } else {
    await ctx.db.insert("portalAuthThrottle", {
      key,
      failCount,
      firstFailAt: now,
      lockedUntil,
      updatedAt: now,
    });
  }
}

export async function clearMagicThrottle(
  ctx: MutationCtx,
  tokenHash: string,
): Promise<void> {
  const key = `${PORTAL_MAGIC_THROTTLE_PREFIX}${tokenHash}`;
  const row = await ctx.db
    .query("portalAuthThrottle")
    .withIndex("by_key", (q) => q.eq("key", key))
    .unique();
  if (row) await ctx.db.delete(row._id);
}

/** Drop oldest active sessions so at most `budget` remain (including `newSessionId`). */
export async function enforcePortalSessionBudget(
  ctx: MutationCtx,
  orgScope: string,
  emailKey: string,
  budget: number,
): Promise<void> {
  const now = Date.now();
  const active = await ctx.db
    .query("clientPortalSessions")
    .withIndex("by_scope_email_expires", (q) =>
      q.eq("orgScope", orgScope).eq("emailKey", emailKey).gt("expiresAt", now),
    )
    .collect();
  if (active.length <= budget) return;
  const victims = active
    .sort((a, b) => a.createdAt - b.createdAt)
    .slice(0, active.length - budget);
  for (const s of victims) {
    await ctx.db.delete(s._id);
  }
  if (victims.length > 0) {
    await appendSecurityAudit(ctx, {
      kind: "portal_session_pruned",
      orgScope,
      subjectKey: emailKey,
      detail: `removed=${victims.length};max=${budget}`,
    });
  }
}

export async function invalidateOtherPortalSessions(
  ctx: MutationCtx,
  orgScope: string,
  emailKey: string,
  keepTokenHash: string,
): Promise<void> {
  const now = Date.now();
  const rows = await ctx.db
    .query("clientPortalSessions")
    .withIndex("by_scope_email_expires", (q) =>
      q.eq("orgScope", orgScope).eq("emailKey", emailKey).gt("expiresAt", now),
    )
    .collect();
  let removed = 0;
  for (const s of rows) {
    if (s.tokenHash === keepTokenHash) continue;
    await ctx.db.delete(s._id);
    removed++;
  }
  if (removed > 0) {
    await appendSecurityAudit(ctx, {
      kind: "portal_sessions_invalidated_password_reset",
      orgScope,
      subjectKey: emailKey,
      detail: `removed=${removed}`,
    });
  }
}
