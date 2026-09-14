import { v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { requireAuthenticatedCaller } from "./callerAuth";
import { assertDataMigrationAdmin } from "./migrationAdminAuth";
import {
  DC_AWARD_OPERATOR_UPSERT_MAX_ROWS,
  PHASE2_DC_AWARD_SIGNAL_SEEDS,
  buildDcAwardSignalSourceKey,
  pickDefinedContactFields,
  prepareDcAwardRadarSeedRow,
  type DcAwardRadarContactFields,
  type DcAwardRadarPreparedRow,
  type DcAwardRadarSeedRow,
} from "../lib/dcAwardRadar";

const LIST_TAKE_LIMIT = 200;

const confidenceV = v.union(
  v.literal("high"),
  v.literal("med"),
  v.literal("low"),
);

const contactFieldsV = {
  contactName: v.optional(v.string()),
  contactTitle: v.optional(v.string()),
  email: v.optional(v.string()),
  phone: v.optional(v.string()),
  linkedinUrl: v.optional(v.string()),
  companyWebsite: v.optional(v.string()),
  contactNotes: v.optional(v.string()),
};

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
  contactName: v.optional(v.string()),
  contactTitle: v.optional(v.string()),
  email: v.optional(v.string()),
  phone: v.optional(v.string()),
  linkedinUrl: v.optional(v.string()),
  companyWebsite: v.optional(v.string()),
  contactNotes: v.optional(v.string()),
  createdAt: v.number(),
  updatedAt: v.number(),
});

const seedRowV = v.object({
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
  ...contactFieldsV,
});

const contactOnlyRowV = v.object({
  sourceKey: v.optional(v.string()),
  sourceUrl: v.optional(v.string()),
  projectOrCampus: v.optional(v.string()),
  stageSignal: v.optional(v.string()),
  ...contactFieldsV,
});

const importResultV = v.object({
  inserted: v.number(),
  updated: v.number(),
  skipped: v.number(),
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
    contactName: row.contactName,
    contactTitle: row.contactTitle,
    email: row.email,
    phone: row.phone,
    linkedinUrl: row.linkedinUrl,
    companyWebsite: row.companyWebsite,
    contactNotes: row.contactNotes,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function assertBoundedRows(rowCount: number, label: string) {
  if (rowCount < 1) {
    throw new Error(`${label}: payload has no rows.`);
  }
  if (rowCount > DC_AWARD_OPERATOR_UPSERT_MAX_ROWS) {
    throw new Error(
      `${label}: ${rowCount} rows exceeds the ${DC_AWARD_OPERATOR_UPSERT_MAX_ROWS}-row one-shot cap.`,
    );
  }
}

async function findBySourceKey(ctx: MutationCtx, sourceKey: string) {
  return await ctx.db
    .query("dcAwardSignals")
    .withIndex("by_sourceKey", (q) => q.eq("sourceKey", sourceKey))
    .unique();
}

function resolveContactLookupKey(row: {
  sourceKey?: string;
  sourceUrl?: string;
  projectOrCampus?: string;
  stageSignal?: string;
}): string | null {
  const explicit = row.sourceKey?.trim();
  if (explicit) return explicit;
  const sourceUrl = row.sourceUrl?.trim();
  const projectOrCampus = row.projectOrCampus?.trim();
  const stageSignal = row.stageSignal?.trim();
  if (!sourceUrl || !projectOrCampus || !stageSignal) return null;
  return buildDcAwardSignalSourceKey({
    sourceUrl,
    projectOrCampus,
    stageSignal,
  });
}

/**
 * One-shot Phase 2 upsert. Indexed lookups only — no collect, cron, or scheduler.
 * Contact fields on the bundled seed are omitted so re-runs do not wipe Hermes
 * enrichment.
 */
async function upsertPreparedRows(
  ctx: MutationCtx,
  rows: readonly DcAwardRadarPreparedRow[],
): Promise<{ inserted: number; updated: number; skipped: number; total: number }> {
  const now = Date.now();
  let inserted = 0;
  let updated = 0;

  for (const prepared of rows) {
    const existing = await findBySourceKey(ctx, prepared.sourceKey);
    const contacts = pickDefinedContactFields(prepared);

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
        ...contacts,
        updatedAt: now,
      });
      updated += 1;
      continue;
    }

    await ctx.db.insert("dcAwardSignals", {
      ...prepared,
      ...contacts,
      createdAt: now,
      updatedAt: now,
    });
    inserted += 1;
  }

  return {
    inserted,
    updated,
    skipped: 0,
    total: rows.length,
  };
}

async function upsertPhase2Seed(ctx: MutationCtx) {
  const prepared = PHASE2_DC_AWARD_SIGNAL_SEEDS.map((row) =>
    prepareDcAwardRadarSeedRow(row),
  );
  return await upsertPreparedRows(ctx, prepared);
}

async function upsertNationwideRows(
  ctx: MutationCtx,
  rows: DcAwardRadarSeedRow[],
) {
  assertBoundedRows(rows.length, "Import nationwide refresh");
  const prepared = rows.map((row) => prepareDcAwardRadarSeedRow(row));
  return await upsertPreparedRows(ctx, prepared);
}

async function upsertContactOnlyRows(
  ctx: MutationCtx,
  rows: Array<
    DcAwardRadarContactFields & {
      sourceKey?: string;
      sourceUrl?: string;
      projectOrCampus?: string;
      stageSignal?: string;
    }
  >,
) {
  assertBoundedRows(rows.length, "Refresh contacts");
  const now = Date.now();
  let updated = 0;
  let skipped = 0;

  for (const row of rows) {
    const sourceKey = resolveContactLookupKey(row);
    if (!sourceKey) {
      skipped += 1;
      continue;
    }
    const existing = await findBySourceKey(ctx, sourceKey);
    if (!existing) {
      skipped += 1;
      continue;
    }
    await ctx.db.patch(existing._id, {
      ...pickDefinedContactFields(row),
      updatedAt: now,
    });
    updated += 1;
  }

  return {
    inserted: 0,
    updated,
    skipped,
    total: rows.length,
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

/**
 * One-shot nationwide upsert from a pasted/CLI JSON payload (any US market).
 * Idempotent on sourceKey. No scrape, cron, or scheduler.
 */
export const operatorUpsertRows = mutation({
  args: {
    operatorSecret: v.string(),
    rows: v.array(seedRowV),
  },
  returns: importResultV,
  handler: async (ctx, args) => {
    assertDataMigrationAdmin(args.operatorSecret);
    return await upsertNationwideRows(ctx, args.rows);
  },
});

/**
 * Contact-only patch. Looks up sourceKey (or url+project+stage) and never
 * inserts a new project row.
 */
export const operatorUpsertContacts = mutation({
  args: {
    operatorSecret: v.string(),
    rows: v.array(contactOnlyRowV),
  },
  returns: importResultV,
  handler: async (ctx, args) => {
    assertDataMigrationAdmin(args.operatorSecret);
    return await upsertContactOnlyRows(ctx, args.rows);
  },
});
