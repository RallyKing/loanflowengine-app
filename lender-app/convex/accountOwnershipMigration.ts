/**
 * Planning / audit helpers for consolidating workspace identity keys onto a single
 * internal-auth user (`authUsers._id` as `userKey`). Pair with
 * `migrations.mergeAuthUsersByEmail.mergeAuthUsersByEmail` (+ optional `additionalKeysToRekey`).
 */
import { v } from "convex/values";
import { query } from "./_generated/server";
import { assertDataMigrationAdmin } from "./migrationAdminAuth";
import { normalizeAuthEmail } from "../lib/auth/normalizeAuthEmail";
import { normalizeUsername } from "../lib/auth/normalizeUsername";
import { isLegacyExternalUserId } from "./dataMigration";

type KeyClass =
  | "self"
  | "legacy_vendor"
  | "clerk"
  | "anonymous"
  | "other_auth";

function classifyKey(
  raw: string,
  destKey: string,
  authIdSet: Set<string>,
): KeyClass {
  const k = raw.trim();
  if (!k) return "self";
  if (k === destKey) return "self";
  if (isLegacyExternalUserId(k)) return "legacy_vendor";
  if (k.startsWith("clerk_")) return "clerk";
  if (authIdSet.has(k)) return "other_auth";
  return "anonymous";
}

function addKeys(
  into: Set<string>,
  values: Array<string | undefined | null>,
): void {
  for (const v of values) {
    const t = v?.trim();
    if (t) into.add(t);
  }
}

/**
 * Admin-only: discover workspace keys that differ from the canonical auth user id for an email,
 * plus `dataMigration.integrityAudit` snapshot for `docs/account-migration-audit.md` / operators.
 */
export const planAccountOwnershipMigration = query({
  args: {
    adminSecret: v.string(),
    email: v.string(),
  },
  handler: async (ctx, args) => {
    assertDataMigrationAdmin(args.adminSecret);
    const normEmail = normalizeAuthEmail(args.email);
    if (!normEmail) {
      throw new Error("planAccountOwnershipMigration: email required.");
    }
    const matchUsername = true;
    const allAuth = await ctx.db.query("authUsers").collect();
    const authIdSet = new Set(allAuth.map((u) => u._id as string));
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
        keysSample: [] as Array<{ key: string; class: KeyClass }>,
      };
    }
    let canonical = matches[0]!;
    for (let i = 1; i < matches.length; i++) {
      const cur = matches[i]!;
      if (cur.createdAt > canonical.createdAt) canonical = cur;
    }
    const destKey = canonical._id as string;

    const discovered = new Set<string>();

    for (const m of await ctx.db.query("organizationMembers").collect()) {
      addKeys(discovered, [m.userKey]);
    }
    for (const p of await ctx.db.query("userPreferences").collect()) {
      addKeys(discovered, [p.accountId]);
    }
    for (const r of await ctx.db.query("userOnboarding").collect()) {
      addKeys(discovered, [r.userKey]);
    }
    for (const r of await ctx.db.query("navigationUserConfig").collect()) {
      addKeys(discovered, [r.accountId]);
    }
    for (const r of await ctx.db.query("userSimpleWorkflows").collect()) {
      addKeys(discovered, [r.accountId]);
    }
    for (const r of await ctx.db.query("pipelineFileUserTemplates").collect()) {
      addKeys(discovered, [r.accountId]);
    }

    for (const p of await ctx.db.query("pipeline").collect()) {
      addKeys(discovered, [p.ownerUserKey, p.assigneeId]);
      for (const sid of p.sharedWithIds ?? []) addKeys(discovered, [sid]);
    }
    for (const t of await ctx.db.query("tasks").collect()) {
      addKeys(discovered, [t.assigneeId]);
      for (const sid of t.sharedWithIds ?? []) addKeys(discovered, [sid]);
    }
    for (const r of await ctx.db.query("pipelineFileShares").collect()) {
      addKeys(discovered, [r.userKey, r.createdByUserKey]);
    }
    for (const r of await ctx.db.query("userNotifications").collect()) {
      addKeys(discovered, [r.userKey, r.actorUserKey]);
    }
    for (const r of await ctx.db.query("taskNotifications").collect()) {
      addKeys(discovered, [r.userKey, r.actorUserKey]);
    }
    for (const r of await ctx.db.query("libraryDocuments").collect()) {
      addKeys(discovered, [r.createdByUserKey]);
    }

    const foreign = [...discovered].filter((k) => k !== destKey);
    const byClass: Record<KeyClass, string[]> = {
      self: [],
      legacy_vendor: [],
      clerk: [],
      anonymous: [],
      other_auth: [],
    };
    for (const k of foreign) {
      const c = classifyKey(k, destKey, authIdSet);
      byClass[c].push(k);
    }

    /** Safe to pass as `additionalKeysToRekey` with `mergeAuthUsersByEmail` (non–auth-user keys only). */
    const suggestedAdditionalKeysToRekey = [
      ...byClass.legacy_vendor,
      ...byClass.clerk,
      ...byClass.anonymous,
    ].filter((k, i, a) => a.indexOf(k) === i);

    return {
      ok: true as const,
      targetEmail: normEmail,
      canonicalAuthUserId: canonical._id,
      destinationUserKey: destKey,
      matchedAuthUsers: matches.map((m) => ({
        _id: m._id,
        email: m.email ?? null,
        normalizedUsername: m.normalizedUsername,
        createdAt: m.createdAt,
      })),
      duplicateAuthUsersToMerge: matches
        .filter((m) => m._id !== canonical._id)
        .map((m) => m._id as string),
      keysDiscoveredDistinctForeign: foreign.length,
      keysByClass: {
        legacy_vendor: byClass.legacy_vendor.length,
        clerk: byClass.clerk.length,
        anonymous: byClass.anonymous.length,
        other_auth: byClass.other_auth.length,
      },
      suggestedAdditionalKeysToRekey,
      /** Other live auth user ids still referenced — merge those accounts by email (or hand-fix) before re-running. */
      otherAuthKeysStillReferenced: [...new Set(byClass.other_auth)],
      keysSample: foreign.slice(0, 80).map((key) => ({
        key,
        class: classifyKey(key, destKey, authIdSet),
      })),
      note:
        "For full FK / legacy-vendor / Clerk-prefix scan, run `dataMigration.integrityAudit` with the same admin secret (see docs/account-migration-audit.md).",
    };
  },
});
