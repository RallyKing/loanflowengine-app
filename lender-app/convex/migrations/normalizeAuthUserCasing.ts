/**
 * One-time / admin: lowercase all `authUsers` identity fields so indexes and
 * sign-up checks (`by_normalizedUsername`, `by_email`) match real uniqueness.
 *
 * Run with `dryRun: true` first from the Convex dashboard — aborts if two rows
 * would share the same normalized username or the same normalized email.
 */
import { v } from "convex/values";
import type { Id } from "../_generated/dataModel";
import { mutation } from "../_generated/server";
import { normalizeAuthEmail } from "../../lib/auth/normalizeAuthEmail";
import { normalizeUsername } from "../../lib/auth/normalizeUsername";
import { assertDataMigrationAdmin } from "../migrationAdminAuth";

export const normalizeAuthUserCasing = mutation({
  args: {
    adminSecret: v.string(),
    dryRun: v.optional(v.boolean()),
  },
  handler: async (ctx, { adminSecret, dryRun }) => {
    assertDataMigrationAdmin(adminSecret);
    const dry = dryRun === true;
    const now = Date.now();

    const all = await ctx.db.query("authUsers").collect();

    const targetUsernameById = new Map<Id<"authUsers">, string>();
    for (const u of all) {
      targetUsernameById.set(u._id, normalizeUsername(u.normalizedUsername));
    }

    const invalidUsernameIds = all
      .filter((u) => targetUsernameById.get(u._id)!.length === 0)
      .map((u) => u._id);

    if (invalidUsernameIds.length) {
      return {
        ok: false as const,
        dryRun: dry,
        reason: "empty_normalized_username" as const,
        authUserIds: invalidUsernameIds,
      };
    }

    const byLowerUsername = new Map<string, Id<"authUsers">[]>();
    for (const u of all) {
      const nu = targetUsernameById.get(u._id)!;
      const list = byLowerUsername.get(nu) ?? [];
      list.push(u._id);
      byLowerUsername.set(nu, list);
    }
    const usernameConflicts = [...byLowerUsername.entries()].filter(
      ([, ids]) => ids.length > 1,
    );

    const byNormEmail = new Map<string, Id<"authUsers">[]>();
    for (const u of all) {
      const e = normalizeAuthEmail(u.email);
      if (!e) continue;
      const list = byNormEmail.get(e) ?? [];
      list.push(u._id);
      byNormEmail.set(e, list);
    }
    const emailConflicts = [...byNormEmail.entries()].filter(
      ([, ids]) => ids.length > 1,
    );

    if (usernameConflicts.length || emailConflicts.length) {
      return {
        ok: false as const,
        dryRun: dry,
        reason: "casing_collision" as const,
        usernameConflicts: usernameConflicts.map(([key, ids]) => ({
          normalizedUsername: key,
          authUserIds: ids,
        })),
        emailConflicts: emailConflicts.map(([key, ids]) => ({
          email: key,
          authUserIds: ids,
        })),
        hint: "Resolve with mergeAuthUsersByEmail or manual edits, then re-run.",
      };
    }

    type Patch = {
      id: Id<"authUsers">;
      patch: Record<string, unknown>;
    };
    const patches: Patch[] = [];

    for (const u of all) {
      const nu = targetUsernameById.get(u._id)!;
      const patch: Record<string, unknown> = {};
      if (u.normalizedUsername !== nu) patch.normalizedUsername = nu;
      if (u.usernameNormalized !== nu) patch.usernameNormalized = nu;
      if (u.displayUsername !== nu) patch.displayUsername = nu;

      const emailNorm = normalizeAuthEmail(u.email);
      if (emailNorm !== undefined && u.email !== emailNorm) {
        patch.email = emailNorm;
      }

      if (Object.keys(patch).length) {
        patch.updatedAt = now;
        patches.push({ id: u._id, patch });
      }
    }

    if (dry) {
      return {
        ok: true as const,
        dryRun: true as const,
        wouldPatch: patches.length,
        authUserCount: all.length,
      };
    }

    for (const { id, patch } of patches) {
      await ctx.db.patch(id, patch);
    }

    return {
      ok: true as const,
      dryRun: false as const,
      patched: patches.length,
      authUserCount: all.length,
    };
  },
});
