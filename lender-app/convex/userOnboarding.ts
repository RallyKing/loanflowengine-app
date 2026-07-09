import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import {
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { resolveMemberUserKey } from "./organizationAccess";
import { assertDataMigrationAdmin } from "./migrationAdminAuth";
import { patchGettingStartedForAccount } from "./userPreferences";

/** `.unique()` throws when multiple rows share `userKey`; collect + pick instead. */
function pickCanonicalOnboardingRow(
  rows: Doc<"userOnboarding">[],
): Doc<"userOnboarding"> | null {
  if (rows.length === 0) return null;
  let best = rows[0]!;
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i]!;
    if (
      r.updatedAt > best.updatedAt ||
      (r.updatedAt === best.updatedAt && r._creationTime > best._creationTime)
    ) {
      best = r;
    }
  }
  return best;
}

async function listOnboardingByUserKey(
  ctx: QueryCtx | MutationCtx,
  userKey: string,
) {
  return ctx.db
    .query("userOnboarding")
    .withIndex("by_userKey", (q) => q.eq("userKey", userKey))
    .collect();
}

/**
 * Canonical getting-started UI state:
 * - **Persisted:** `userPreferences` (`accountId` === session user key)
 * - **Legacy read:** `userOnboarding` until rows are orphaned (writes go to prefs only)
 */
export const getForViewer = query({
  args: { memberUserKey: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const userKey = await resolveMemberUserKey(ctx, args.memberUserKey);
    const prefsRows = await ctx.db
      .query("userPreferences")
      .withIndex("by_accountId", (q) => q.eq("accountId", userKey))
      .collect();
    let prefs: (typeof prefsRows)[number] | null = null;
    if (prefsRows.length > 1) {
      console.warn(
        "[userOnboarding.getForViewer] duplicate userPreferences rows for accountId; using latest updatedAt",
        { accountId: userKey, count: prefsRows.length },
      );
      prefs = prefsRows.reduce((best, r) =>
        r.updatedAt > best.updatedAt ? r : best,
      );
    } else if (prefsRows.length === 1) {
      prefs = prefsRows[0] ?? null;
    }

    const rows = await listOnboardingByUserKey(ctx, userKey);
    const row = pickCanonicalOnboardingRow(rows);
    const legacySkipped = row?.skipped === true;
    const legacyCollapsed = row?.collapsed === true;
    const legacyStoredDismissed = row?.gettingStartedDismissed === true;

    const prefsDismissed = prefs?.gettingStartedDismissed === true;
    const prefsComplete = prefs?.gettingStartedComplete === true;
    const prefsSkipped = prefs?.gettingStartedSkipped === true;

    const gettingStartedDismissed =
      prefsDismissed || legacyStoredDismissed || legacyCollapsed;
    const gettingStartedSkipped = prefsSkipped || legacySkipped;
    const skipped = gettingStartedSkipped;
    const gettingStartedComplete = prefsComplete;
    const collapsed = legacyCollapsed;

    return {
      skipped,
      collapsed,
      gettingStartedDismissed,
      gettingStartedComplete,
      gettingStartedSkipped,
    };
  },
});

export const setSkipped = mutation({
  args: {
    skipped: v.boolean(),
    memberUserKey: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userKey = await resolveMemberUserKey(ctx, args.memberUserKey);
    if (!userKey.trim()) throw new Error("Invalid user.");
    await patchGettingStartedForAccount(ctx, userKey, {
      gettingStartedSkipped: args.skipped,
      ...(args.skipped ? { gettingStartedDismissed: true } : {}),
    });
  },
});

/** Floating “Getting started” checklist: user chose Minimize — hide until resumed from Settings. */
export const dismissGettingStarted = mutation({
  args: { memberUserKey: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const userKey = await resolveMemberUserKey(ctx, args.memberUserKey);
    if (!userKey.trim()) throw new Error("Invalid user.");
    await patchGettingStartedForAccount(ctx, userKey, {
      gettingStartedDismissed: true,
    });
  },
});

/** Persist all checklist steps satisfied (cross-device; prevents modal reopen). */
export const markGettingStartedComplete = mutation({
  args: { memberUserKey: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const userKey = await resolveMemberUserKey(ctx, args.memberUserKey);
    if (!userKey.trim()) throw new Error("Invalid user.");
    await patchGettingStartedForAccount(ctx, userKey, {
      gettingStartedComplete: true,
    });
  },
});

export const setCollapsed = mutation({
  args: {
    collapsed: v.boolean(),
    memberUserKey: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userKey = await resolveMemberUserKey(ctx, args.memberUserKey);
    if (!userKey.trim()) throw new Error("Invalid user.");
    await patchGettingStartedForAccount(ctx, userKey, {
      gettingStartedDismissed: args.collapsed,
    });
  },
});

/** Clear skip + expand checklist (e.g. from Settings). */
export const resume = mutation({
  args: { memberUserKey: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const userKey = await resolveMemberUserKey(ctx, args.memberUserKey);
    if (!userKey.trim()) throw new Error("Invalid user.");
    await patchGettingStartedForAccount(ctx, userKey, { resume: true });
  },
});

/**
 * Operator-only: set getting-started complete + dismissed for an `authUsers` email
 * (fixes stale state after auth migration when prefs lived under a different key).
 *
 * Run (prod): `npx convex run userOnboarding:operatorMarkGettingStartedCompleteByEmail --prod`
 * with JSON args: `{ "adminSecret": "<DATA_MIGRATION_ADMIN_SECRET>", "email": "…" }`
 */
export const operatorMarkGettingStartedCompleteByEmail = mutation({
  args: {
    adminSecret: v.string(),
    email: v.string(),
  },
  handler: async (ctx, args) => {
    assertDataMigrationAdmin(args.adminSecret);
    const raw = args.email.trim();
    if (!raw) throw new Error("email is required");
    const lower = raw.toLowerCase();
    let user =
      (await ctx.db
        .query("authUsers")
        .withIndex("by_email", (q) => q.eq("email", raw))
        .first()) ??
      (await ctx.db
        .query("authUsers")
        .withIndex("by_email", (q) => q.eq("email", lower))
        .first());
    if (!user) {
      const all = await ctx.db.query("authUsers").collect();
      user =
        all.find((u) => u.email?.trim().toLowerCase() === lower) ?? null;
    }
    if (!user) throw new Error(`No authUsers row for email: ${raw}`);

    const userKey = user._id as string;
    await patchGettingStartedForAccount(ctx, userKey, {
      gettingStartedComplete: true,
      gettingStartedDismissed: true,
      gettingStartedSkipped: false,
    });

    const legacy = await listOnboardingByUserKey(ctx, userKey);
    const now = Date.now();
    for (const r of legacy) {
      await ctx.db.patch(r._id, {
        gettingStartedDismissed: true,
        skipped: false,
        updatedAt: now,
      });
    }

    return { ok: true as const, authUserId: userKey };
  },
});
