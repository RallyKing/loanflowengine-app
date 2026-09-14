import { v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { requireAuthenticatedCaller } from "./callerAuth";
import { assertDataMigrationAdmin } from "./migrationAdminAuth";
import {
  PHASE2_DC_AWARD_SIGNAL_SEEDS,
  prepareDcAwardRadarSeedRow,
} from "../lib/dcAwardRadar";

const LIST_TAKE_LIMIT = 200;

const confidenceV = v.union(
  v.literal("high"),
  v.literal("med"),
  v.literal("low"),
);

const dcAwardSignalPublicV = v.object({
  _id: v.id("dcAwardSignals"),
  market: v.string(),
  projectOrCampus: v.string(),
  stageSignal: v.string(),
  tradeFocus: v.string(),
  company: v.string(),
  roleIfKnown: v.string(),
  signalDate: v.string(),
  sourceUrl: v.string(),
  sourceType: v.string(),
  confidence: confidenceV,
  whyItMattersForDlc: v.string(),
  notes: v.string(),
  sourceKey: v.string(),
  createdAt: v.number(),
  updatedAt: v.number(),
});

const importResultV = v.object({
  inserted: v.number(),
  updated: v.number(),
  total: v.number(),
});

function toPublicRow(row: Doc<"dcAwardSignals">) {
  return {
    _id: row._id,
    market: row.market,
    projectOrCampus: row.projectOrCampus,
    stageSignal: row.stageSignal,
    tradeFocus: row.tradeFocus,
    company: row.company,
    roleIfKnown: row.roleIfKnown,
    signalDate: row.signalDate,
    sourceUrl: row.sourceUrl,
    sourceType: row.sourceType,
    confidence: row.confidence,
    whyItMattersForDlc: row.whyItMattersForDlc,
    notes: row.notes,
    sourceKey: row.sourceKey,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/**
 * One-shot Phase 2 upsert. Indexed lookups only — no collect, cron, or scheduler.
 */
async function upsertPhase2Seed(ctx: MutationCtx): Promise<{
  inserted: number;
  updated: number;
  total: number;
}> {
  const now = Date.now();
  let inserted = 0;
  let updated = 0;

  for (const raw of PHASE2_DC_AWARD_SIGNAL_SEEDS) {
    const prepared = prepareDcAwardRadarSeedRow(raw);
    const existing = await ctx.db
      .query("dcAwardSignals")
      .withIndex("by_sourceKey", (q) => q.eq("sourceKey", prepared.sourceKey))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        market: prepared.market,
        projectOrCampus: prepared.projectOrCampus,
        stageSignal: prepared.stageSignal,
        tradeFocus: prepared.tradeFocus,
        company: prepared.company,
        roleIfKnown: prepared.roleIfKnown,
        signalDate: prepared.signalDate,
        sourceUrl: prepared.sourceUrl,
        sourceType: prepared.sourceType,
        confidence: prepared.confidence,
        whyItMattersForDlc: prepared.whyItMattersForDlc,
        notes: prepared.notes,
        sourceKey: prepared.sourceKey,
        updatedAt: now,
      });
      updated += 1;
      continue;
    }

    await ctx.db.insert("dcAwardSignals", {
      ...prepared,
      createdAt: now,
      updatedAt: now,
    });
    inserted += 1;
  }

  return {
    inserted,
    updated,
    total: PHASE2_DC_AWARD_SIGNAL_SEEDS.length,
  };
}

export const list = query({
  args: {
    memberUserKey: v.optional(v.string()),
    market: v.optional(v.string()),
    confidence: v.optional(confidenceV),
  },
  returns: v.object({
    signals: v.array(dcAwardSignalPublicV),
    truncated: v.boolean(),
  }),
  handler: async (ctx, args) => {
    await requireAuthenticatedCaller(ctx, args.memberUserKey);

    const market = args.market?.trim() || undefined;
    const confidence = args.confidence;

    const page = market && confidence
      ? await ctx.db
          .query("dcAwardSignals")
          .withIndex("by_market_and_confidence", (q) =>
            q.eq("market", market).eq("confidence", confidence),
          )
          .take(LIST_TAKE_LIMIT)
      : market
        ? await ctx.db
            .query("dcAwardSignals")
            .withIndex("by_market", (q) => q.eq("market", market))
            .take(LIST_TAKE_LIMIT)
        : confidence
          ? await ctx.db
              .query("dcAwardSignals")
              .withIndex("by_confidence", (q) => q.eq("confidence", confidence))
              .take(LIST_TAKE_LIMIT)
          : await ctx.db.query("dcAwardSignals").take(LIST_TAKE_LIMIT);

    const signals = page
      .map(toPublicRow)
      .sort((a, b) => {
        const marketCmp = a.market.localeCompare(b.market);
        if (marketCmp !== 0) return marketCmp;
        const confidenceRank = { high: 0, med: 1, low: 2 } as const;
        const confCmp =
          confidenceRank[a.confidence] - confidenceRank[b.confidence];
        if (confCmp !== 0) return confCmp;
        return a.projectOrCampus.localeCompare(b.projectOrCampus);
      });

    return {
      signals,
      truncated: page.length >= LIST_TAKE_LIMIT,
    };
  },
});

/** Operator CLI / Convex dashboard. Secret matches data-migration admin. */
export const operatorImportPhase2 = mutation({
  args: {
    operatorSecret: v.string(),
  },
  returns: importResultV,
  handler: async (ctx, args) => {
    assertDataMigrationAdmin(args.operatorSecret);
    return await upsertPhase2Seed(ctx);
  },
});

/** Dashboard / `npx convex run` internal path — no cron, no self-reschedule. */
export const importPhase2Seed = internalMutation({
  args: {},
  returns: importResultV,
  handler: async (ctx) => {
    return await upsertPhase2Seed(ctx);
  },
});
