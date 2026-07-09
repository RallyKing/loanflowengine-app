import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import {
  assertCanAccessFile,
  assertCanMutatePipelineRow,
  assertOrgPermission,
  assertOrgScopeArgs,
  pipelineFileReadable,
  resolveOrgPipelineFileAccessLevel,
  sessionKeyIsGlobalAdmin,
} from "./organizationAccess";

/**
 * Funding mode literals stored on `ledger.paymentMode`. Kept inline here so
 * the schema and mutation validators line up without an extra import.
 */
const paymentModeLiteral = v.union(
  v.literal("lump_sum"),
  v.literal("scheduled"),
  v.literal("monthly")
);

export type LedgerListEntry = {
  ledger: Doc<"ledger">;
  file: Doc<"pipeline"> | null;
  /** Newest payment first. */
  payments: Doc<"payments">[];
  receivedGross: number;
  receivedNet: number;
  paymentCount: number;
  lastPaymentDate: number | null;
  /** False when pipeline file is missing or viewer has view-only (not edit) access. */
  canEditFile: boolean;
};

/**
 * All ledger entries, newest funding date first, joined with the originating
 * pipeline file *and* every payment ever received against the row. Pre-rolls
 * payment totals so the UI can render Received / Balance without N round
 * trips.
 *
 * **Performance:** loads all `payments` once and groups by `ledgerId`
 * (avoids O(ledger × query) parallel collects). If the payments table grows
 * very large, consider scoping or pagination.
 *
 * Entries whose `pipeline` row was deleted still surface (so revenue is
 * never lost) — `file` will be `null` in that case.
 */
export const list = query({
  args: {
    organizationId: v.id("organizations"),
    memberUserKey: v.optional(v.string()),
  },
  handler: async (ctx, { organizationId, memberUserKey }): Promise<LedgerListEntry[]> => {
    await assertOrgScopeArgs(ctx, organizationId, memberUserKey);
    await assertOrgPermission(ctx, organizationId, memberUserKey, "files.view");

    const god = await sessionKeyIsGlobalAdmin(ctx, memberUserKey);
    const rows = await ctx.db.query("ledger").order("desc").collect();
    if (rows.length === 0) return [];

    const uniqueFileIds = [...new Set(rows.map((r) => r.fileId))];
    const [allPayments, ...fileDocs] = await Promise.all([
      ctx.db.query("payments").collect(),
      ...uniqueFileIds.map((id) => ctx.db.get(id)),
    ]);
    const fileById = new Map<Id<"pipeline">, Doc<"pipeline"> | null>();
    for (let i = 0; i < uniqueFileIds.length; i++) {
      fileById.set(uniqueFileIds[i], fileDocs[i] ?? null);
    }

    const orgRows = god
      ? rows.filter((l) => {
          const f = fileById.get(l.fileId);
          return f != null && f.organizationId === organizationId;
        })
      : (
          await Promise.all(
            rows.map(async (l) => {
              const f = fileById.get(l.fileId);
              if (!f || f.organizationId !== organizationId) return null;
              const ok = await pipelineFileReadable(ctx, f, memberUserKey);
              return ok ? l : null;
            }),
          )
        ).filter((l): l is Doc<"ledger"> => l != null);
    if (orgRows.length === 0) return [];

    const byLedgerId = new Map<Id<"ledger">, Doc<"payments">[]>();
    for (const p of allPayments) {
      const cur = byLedgerId.get(p.ledgerId);
      if (cur) cur.push(p);
      else byLedgerId.set(p.ledgerId, [p]);
    }

    const out: LedgerListEntry[] = await Promise.all(
      orgRows.map(async (l) => {
        const file = fileById.get(l.fileId) ?? null;
        const canEditFile = file
          ? (await resolveOrgPipelineFileAccessLevel(ctx, file, memberUserKey)) ===
            "edit"
          : false;
        const paymentsUnsorted = byLedgerId.get(l._id) ?? [];
        const payments = [...paymentsUnsorted].sort((a, b) => b.date - a.date);
        let receivedGross = 0;
        let receivedNet = 0;
        let lastPaymentDate: number | null = null;
        for (const p of payments) {
          receivedGross += p.gross || 0;
          receivedNet += p.net || 0;
          if (lastPaymentDate === null || p.date > lastPaymentDate) {
            lastPaymentDate = p.date;
          }
        }
        return {
          ledger: l,
          file,
          payments,
          receivedGross,
          receivedNet,
          paymentCount: payments.length,
          lastPaymentDate,
          canEditFile,
        };
      }),
    );
    out.sort((a, b) => b.ledger.date - a.ledger.date);
    return out;
  },
});

/**
 * Ledger entry for a given pipeline file, or `null` if not yet recorded.
 */
export const byFileId = query({
  args: {
    fileId: v.id("pipeline"),
    memberUserKey: v.optional(v.string()),
  },
  handler: async (ctx, { fileId, memberUserKey }) => {
    await assertCanAccessFile(ctx, fileId, memberUserKey);
    return await ctx.db
      .query("ledger")
      .withIndex("by_fileId", (q) => q.eq("fileId", fileId))
      .first();
  },
});

/**
 * Update payment-confirmation fields on a ledger entry. All fields are
 * optional; passing `null` clears the corresponding column. `gross` /
 * `net` may be edited after the fact (e.g. lender wired a slightly
 * different number).
 *
 * The funding-mode fields (`paymentMode`, `scheduledDate`,
 * `monthlyAmount`, `termMonths`, `notes`) live on the same row so a
 * single inline edit on the ledger page can set or clear them without
 * needing a separate "edit funding" form.
 */
export const setPayment = mutation({
  args: {
    id: v.id("ledger"),
    memberUserKey: v.optional(v.string()),
    paymentMethod: v.optional(v.union(v.string(), v.null())),
    paidBy: v.optional(v.union(v.string(), v.null())),
    gross: v.optional(v.number()),
    net: v.optional(v.number()),
    date: v.optional(v.number()),
    paymentMode: v.optional(v.union(paymentModeLiteral, v.null())),
    scheduledDate: v.optional(v.union(v.number(), v.null())),
    monthlyAmount: v.optional(v.union(v.number(), v.null())),
    termMonths: v.optional(v.union(v.number(), v.null())),
    notes: v.optional(v.union(v.string(), v.null())),
  },
  handler: async (ctx, args) => {
    const { id, memberUserKey, ...rest } = args;
    const row = await ctx.db.get(id);
    if (!row) throw new Error("Ledger entry not found");
    const file = await ctx.db.get(row.fileId);
    if (!file) throw new Error("Pipeline file not found");
    await assertCanMutatePipelineRow(ctx, file, memberUserKey);
    const patch: Partial<Doc<"ledger">> = {};
    if (rest.paymentMethod !== undefined) {
      patch.paymentMethod =
        rest.paymentMethod === null
          ? undefined
          : rest.paymentMethod.trim() || undefined;
    }
    if (rest.paidBy !== undefined) {
      patch.paidBy =
        rest.paidBy === null ? undefined : rest.paidBy.trim() || undefined;
    }
    if (rest.gross !== undefined) {
      if (!Number.isFinite(rest.gross) || rest.gross < 0) {
        throw new Error("gross must be a non-negative number");
      }
      patch.gross = rest.gross;
    }
    if (rest.net !== undefined) {
      if (!Number.isFinite(rest.net) || rest.net < 0) {
        throw new Error("net must be a non-negative number");
      }
      patch.net = rest.net;
    }
    if (rest.date !== undefined) {
      patch.date = rest.date;
    }
    if (rest.paymentMode !== undefined) {
      patch.paymentMode = rest.paymentMode === null ? undefined : rest.paymentMode;
    }
    if (rest.scheduledDate !== undefined) {
      patch.scheduledDate =
        rest.scheduledDate === null ? undefined : rest.scheduledDate;
    }
    if (rest.monthlyAmount !== undefined) {
      const v2 =
        rest.monthlyAmount === null ? undefined : rest.monthlyAmount;
      if (v2 !== undefined && (!Number.isFinite(v2) || v2 < 0)) {
        throw new Error("monthlyAmount must be a non-negative number");
      }
      patch.monthlyAmount = v2;
    }
    if (rest.termMonths !== undefined) {
      const v2 = rest.termMonths === null ? undefined : rest.termMonths;
      if (v2 !== undefined && (!Number.isFinite(v2) || v2 < 0)) {
        throw new Error("termMonths must be a non-negative number");
      }
      patch.termMonths = v2;
    }
    if (rest.notes !== undefined) {
      patch.notes =
        rest.notes === null ? undefined : rest.notes.trim() || undefined;
    }
    await ctx.db.patch(id, patch);
    return { id };
  },
});

/**
 * Manually create a ledger entry for a file (in case the auto-insert on
 * status flip didn't run, or to backfill historical revenue). Idempotent
 * per `fileId` — returns the existing row instead of duplicating.
 */
export const createFor = mutation({
  args: {
    fileId: v.id("pipeline"),
    memberUserKey: v.optional(v.string()),
    gross: v.number(),
    net: v.number(),
    date: v.optional(v.number()),
    paymentMethod: v.optional(v.string()),
    paidBy: v.optional(v.string()),
    paymentMode: v.optional(paymentModeLiteral),
    scheduledDate: v.optional(v.number()),
    monthlyAmount: v.optional(v.number()),
    termMonths: v.optional(v.number()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<{ id: Id<"ledger"> }> => {
    const file = await assertCanAccessFile(ctx, args.fileId, args.memberUserKey);
    await assertCanMutatePipelineRow(ctx, file, args.memberUserKey);
    const existing = await ctx.db
      .query("ledger")
      .withIndex("by_fileId", (q) => q.eq("fileId", args.fileId))
      .first();
    if (existing) return { id: existing._id };
    const id = await ctx.db.insert("ledger", {
      fileId: args.fileId,
      gross: args.gross,
      net: args.net,
      date: args.date ?? Date.now(),
      paymentMethod: args.paymentMethod?.trim() || undefined,
      paidBy: args.paidBy?.trim() || undefined,
      paymentMode: args.paymentMode,
      scheduledDate: args.scheduledDate,
      monthlyAmount: args.monthlyAmount,
      termMonths: args.termMonths,
      notes: args.notes?.trim() || undefined,
    });
    return { id };
  },
});

/**
 * Delete a ledger row **and** all of its child payment receipts. We cascade
 * here so a removed funding doesn't leave orphan payment rows.
 */
export const remove = mutation({
  args: { id: v.id("ledger"), memberUserKey: v.optional(v.string()) },
  handler: async (ctx, { id, memberUserKey }) => {
    const row = await ctx.db.get(id);
    if (!row) return { ok: false as const };
    const file = await ctx.db.get(row.fileId);
    if (!file) return { ok: false as const };
    await assertCanMutatePipelineRow(ctx, file, memberUserKey);
    const childPayments = await ctx.db
      .query("payments")
      .withIndex("by_ledgerId", (q) => q.eq("ledgerId", id))
      .collect();
    for (const p of childPayments) {
      await ctx.db.delete(p._id);
    }
    await ctx.db.delete(id);
    return { ok: true as const };
  },
});
