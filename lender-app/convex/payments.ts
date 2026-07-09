import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import {
  assertCanAccessFile,
  assertCanMutatePipelineRow,
} from "./organizationAccess";

/**
 * Payment receipts CRUD.
 *
 * Each `payments` row is a single wire / ACH / check the user actually
 * received against a `ledger` row (i.e. a funded loan). The parent ledger
 * carries the *expected* totals; payments here are the *actuals*.
 *
 * `fileId` is denormalized from the parent ledger so per-file payment
 * lookups (and CSV / print exports) don't have to join through `ledger`.
 */

/**
 * All payments for a single funding, newest first. Pass `undefined` to
 * skip the query.
 */
export const listForLedger = query({
  args: {
    ledgerId: v.id("ledger"),
    memberUserKey: v.optional(v.string()),
  },
  handler: async (ctx, { ledgerId, memberUserKey }): Promise<Doc<"payments">[]> => {
    const ledger = await ctx.db.get(ledgerId);
    if (!ledger) return [];
    await assertCanAccessFile(ctx, ledger.fileId, memberUserKey);
    const rows = await ctx.db
      .query("payments")
      .withIndex("by_ledgerId", (q) => q.eq("ledgerId", ledgerId))
      .collect();
    rows.sort((a, b) => b.date - a.date);
    return rows;
  },
});

/**
 * All payments tied to a pipeline file (across however many ledger rows
 * may exist). Currently a file has at most one ledger, but we expose a
 * file-scoped view too in case that changes (e.g. partial paydowns split
 * across multiple funding events).
 */
export const listForFile = query({
  args: {
    fileId: v.id("pipeline"),
    memberUserKey: v.optional(v.string()),
  },
  handler: async (ctx, { fileId, memberUserKey }): Promise<Doc<"payments">[]> => {
    await assertCanAccessFile(ctx, fileId, memberUserKey);
    const rows = await ctx.db
      .query("payments")
      .withIndex("by_fileId", (q) => q.eq("fileId", fileId))
      .collect();
    rows.sort((a, b) => b.date - a.date);
    return rows;
  },
});

/**
 * Record a new payment receipt. `net` defaults to `gross` when omitted
 * (most users net what they grossed). `date` defaults to now.
 */
export const create = mutation({
  args: {
    ledgerId: v.id("ledger"),
    date: v.optional(v.number()),
    gross: v.number(),
    net: v.optional(v.number()),
    method: v.optional(v.string()),
    paidBy: v.optional(v.string()),
    notes: v.optional(v.string()),
    memberUserKey: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<{ id: Id<"payments"> }> => {
    const parent = await ctx.db.get(args.ledgerId);
    if (!parent) throw new Error("Ledger entry not found");
    const file = await ctx.db.get(parent.fileId);
    if (!file) throw new Error("Pipeline file not found");
    await assertCanMutatePipelineRow(ctx, file, args.memberUserKey);
    if (!Number.isFinite(args.gross) || args.gross < 0) {
      throw new Error("gross must be a non-negative number");
    }
    const net = args.net ?? args.gross;
    if (!Number.isFinite(net) || net < 0) {
      throw new Error("net must be a non-negative number");
    }
    const id = await ctx.db.insert("payments", {
      ledgerId: args.ledgerId,
      fileId: parent.fileId,
      date: args.date ?? Date.now(),
      gross: args.gross,
      net,
      method: args.method?.trim() || undefined,
      paidBy: args.paidBy?.trim() || undefined,
      notes: args.notes?.trim() || undefined,
    });
    return { id };
  },
});

/**
 * Inline-edit any field on a payment. `null` clears string columns;
 * numeric columns require a number (use `remove` to drop a row).
 */
export const update = mutation({
  args: {
    id: v.id("payments"),
    date: v.optional(v.number()),
    gross: v.optional(v.number()),
    net: v.optional(v.number()),
    method: v.optional(v.union(v.string(), v.null())),
    paidBy: v.optional(v.union(v.string(), v.null())),
    notes: v.optional(v.union(v.string(), v.null())),
    memberUserKey: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { id, memberUserKey, ...rest } = args;
    const row = await ctx.db.get(id);
    if (!row) throw new Error("Payment not found");
    await assertCanAccessFile(ctx, row.fileId, memberUserKey);
    const file = await ctx.db.get(row.fileId);
    if (file) {
      await assertCanMutatePipelineRow(ctx, file, memberUserKey);
    }
    const patch: Partial<Doc<"payments">> = {};
    if (rest.date !== undefined) {
      patch.date = rest.date;
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
    if (rest.method !== undefined) {
      patch.method =
        rest.method === null ? undefined : rest.method.trim() || undefined;
    }
    if (rest.paidBy !== undefined) {
      patch.paidBy =
        rest.paidBy === null ? undefined : rest.paidBy.trim() || undefined;
    }
    if (rest.notes !== undefined) {
      patch.notes =
        rest.notes === null ? undefined : rest.notes.trim() || undefined;
    }
    await ctx.db.patch(id, patch);
    return { id };
  },
});

export const remove = mutation({
  args: { id: v.id("payments"), memberUserKey: v.optional(v.string()) },
  handler: async (ctx, { id, memberUserKey }) => {
    const row = await ctx.db.get(id);
    if (!row) return { ok: false as const };
    const file = await ctx.db.get(row.fileId);
    if (file) {
      await assertCanMutatePipelineRow(ctx, file, memberUserKey);
    }
    await ctx.db.delete(id);
    return { ok: true as const };
  },
});
