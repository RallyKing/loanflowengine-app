import { v } from "convex/values";
import { mutation, query, type MutationCtx } from "./_generated/server";
import { getEffectiveMandatoryPipelineBlockIds } from "../lib/pipelineGlobalBlockPolicy";
import { coerceUserDrawerPreferenceLists } from "../lib/userPreferencesNewFileDrawer";
import { getPipelineGlobalBlockConfigRow } from "./pipelineGlobalBlockConfigHelpers";
import { assertOrgPermission } from "./organizationRbac";
import { pickCanonicalUserPreferences } from "./userPreferencesPick";

const collapseBehaviorV = v.union(
  v.literal("all_open"),
  v.literal("all_closed"),
  v.literal("smart"),
);

/**
 * Load persisted preferences for this account id (or `null` if none).
 */
export const getByAccountId = query({
  args: { accountId: v.string() },
  handler: async (ctx, { accountId }) => {
    if (!accountId.trim()) return null;
    const rows = await ctx.db
      .query("userPreferences")
      .withIndex("by_accountId", (q) => q.eq("accountId", accountId))
      .collect();
    return pickCanonicalUserPreferences(rows);
  },
});

/**
 * Patch getting-started flags on `userPreferences` (canonical store for checklist UI).
 * Creates a minimal preferences row if none exists.
 */
export async function patchGettingStartedForAccount(
  ctx: MutationCtx,
  accountId: string,
  patch: {
    resume?: boolean;
    gettingStartedDismissed?: boolean;
    gettingStartedComplete?: boolean;
    gettingStartedSkipped?: boolean;
  },
) {
  const trimmed = accountId.trim();
  if (!trimmed) throw new Error("accountId is required");

  const now = Date.now();
  const prefRows = await ctx.db
    .query("userPreferences")
    .withIndex("by_accountId", (q) => q.eq("accountId", trimmed))
    .collect();
  let existing = pickCanonicalUserPreferences(prefRows);

  if (!existing) {
    const globalRow = await getPipelineGlobalBlockConfigRow(ctx);
    const effectiveMandatory = getEffectiveMandatoryPipelineBlockIds(
      globalRow?.adminRequiredBlockIds,
    );
    const lists = coerceUserDrawerPreferenceLists(effectiveMandatory, {
      defaultBlocks: [],
      blockOrder: [],
    });
    const id = await ctx.db.insert("userPreferences", {
      accountId: trimmed,
      updatedAt: now,
      formatVersion: 1,
      defaultBlocks: lists.defaultBlocks,
      blockOrder: lists.blockOrder,
      collapseBehavior: "all_closed",
      displaySettings: {},
      behaviorSettings: {},
      newFileDrawerSettings: {},
      gettingStartedDismissed: false,
      gettingStartedComplete: false,
      gettingStartedSkipped: false,
    });
    existing = await ctx.db.get(id);
    if (!existing) throw new Error("userPreferences insert failed");
  }

  const next: {
    updatedAt: number;
    gettingStartedDismissed?: boolean;
    gettingStartedComplete?: boolean;
    gettingStartedSkipped?: boolean;
  } = { updatedAt: now };

  if (patch.resume) {
    next.gettingStartedDismissed = false;
    next.gettingStartedComplete = false;
    next.gettingStartedSkipped = false;
  } else {
    if (patch.gettingStartedDismissed !== undefined) {
      next.gettingStartedDismissed = patch.gettingStartedDismissed;
    }
    if (patch.gettingStartedComplete !== undefined) {
      next.gettingStartedComplete = patch.gettingStartedComplete;
    }
    if (patch.gettingStartedSkipped !== undefined) {
      next.gettingStartedSkipped = patch.gettingStartedSkipped;
    }
  }

  await ctx.db.patch(existing._id, next);
}

/**
 * Insert or replace the full preferences payload for `accountId`.
 */
export const upsert = mutation({
  args: {
    accountId: v.string(),
    defaultBlocks: v.array(v.string()),
    blockOrder: v.array(v.string()),
    collapseBehavior: collapseBehaviorV,
    displaySettings: v.any(),
    behaviorSettings: v.any(),
    newFileDrawerSettings: v.optional(v.any()),
    /** Pinned pipeline block ids (favorites quick-access bar); omitted = keep existing. */
    favoriteFileBlocks: v.optional(v.array(v.string())),
    gettingStartedDismissed: v.optional(v.boolean()),
    gettingStartedComplete: v.optional(v.boolean()),
    gettingStartedSkipped: v.optional(v.boolean()),
    /** When set, requires `settings.access` in this org (RBAC). */
    rbacOrganizationId: v.optional(v.id("organizations")),
  },
  handler: async (ctx, args) => {
    const trimmed = args.accountId.trim();
    if (!trimmed) {
      throw new Error("accountId is required");
    }
    if (args.rbacOrganizationId) {
      await assertOrgPermission(
        ctx,
        args.rbacOrganizationId,
        trimmed,
        "settings.access",
      );
    }
    const now = Date.now();
    const prefRows = await ctx.db
      .query("userPreferences")
      .withIndex("by_accountId", (q) => q.eq("accountId", trimmed))
      .collect();
    const existing = pickCanonicalUserPreferences(prefRows);

    const globalRow = await getPipelineGlobalBlockConfigRow(ctx);
    const effectiveMandatory = getEffectiveMandatoryPipelineBlockIds(
      globalRow?.adminRequiredBlockIds,
    );
    const lists = coerceUserDrawerPreferenceLists(effectiveMandatory, {
      defaultBlocks: args.defaultBlocks,
      blockOrder: args.blockOrder,
    });

    const row = {
      accountId: trimmed,
      updatedAt: now,
      formatVersion: 1 as const,
      defaultBlocks: lists.defaultBlocks,
      blockOrder: lists.blockOrder,
      collapseBehavior: args.collapseBehavior,
      displaySettings:
        args.displaySettings === undefined || args.displaySettings === null
          ? {}
          : args.displaySettings,
      behaviorSettings:
        args.behaviorSettings === undefined || args.behaviorSettings === null
          ? {}
          : args.behaviorSettings,
      newFileDrawerSettings:
        args.newFileDrawerSettings !== undefined && args.newFileDrawerSettings !== null
          ? args.newFileDrawerSettings
          : {},
      favoriteFileBlocks:
        args.favoriteFileBlocks !== undefined
          ? args.favoriteFileBlocks
          : existing?.favoriteFileBlocks,
      gettingStartedDismissed:
        args.gettingStartedDismissed !== undefined
          ? args.gettingStartedDismissed
          : existing?.gettingStartedDismissed,
      gettingStartedComplete:
        args.gettingStartedComplete !== undefined
          ? args.gettingStartedComplete
          : existing?.gettingStartedComplete,
      gettingStartedSkipped:
        args.gettingStartedSkipped !== undefined
          ? args.gettingStartedSkipped
          : existing?.gettingStartedSkipped,
    };

    if (existing) {
      await ctx.db.patch(existing._id, row);
      return existing._id;
    }
    return await ctx.db.insert("userPreferences", row);
  },
});
