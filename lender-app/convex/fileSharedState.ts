import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import type { SharedBusFieldKey } from "../lib/pipelineBlockAutomation";
import { runPipelineBlockAutomations } from "./pipelineBlockAutomationRunner";
import {
  fileBlockOverrideKey,
  materializeFileSharedStateOnPatch,
  normalizeFileSharedStateFromPipeline,
  type FileSharedNumericFieldKey,
  type FileSharedStateStorage,
  type PipelineFileSharedSource,
} from "../lib/fileSharedFields";
import { clampActivitySummary } from "../lib/pipelineFileActivityModel";
import {
  cloneJson,
  patchKeysForUndo,
  snapshotPipelineFields,
  stableValueKey,
  undoJsonPairWithinLimit,
  undoPayloadWithinLimit,
} from "../lib/pipelineFileUndo";
import { newMentionHandlesOnly } from "../lib/mentions";
import { appendPipelineFileActivity } from "./pipelineFileActivity";
import { collectPipelineWatcherUserKeys } from "./notificationRecipients";
import { dispatchUserNotification } from "./notifications";
import { refreshPipelineGlobalSearchText } from "./globalSearchSync";
import { assertCanAccessFile } from "./organizationAccess";

const fieldKeyValidator = v.union(
  v.literal("fundingAmount"),
  v.literal("interestRate")
);

export const getResolvedForBlock = query({
  args: {
    fileId: v.id("pipeline"),
    blockId: v.string(),
    memberUserKey: v.optional(v.string()),
  },
  handler: async (ctx, { fileId, blockId, memberUserKey }) => {
    const p = await assertCanAccessFile(ctx, fileId, memberUserKey);

    const ov = p.fileBlockFieldOverrides ?? {};
    const canonical = normalizeFileSharedStateFromPipeline(
      p as unknown as PipelineFileSharedSource
    );
    const sf = canonical.fundingAmount;
    const sr = canonical.interestRate;

    const resolve = (field: FileSharedNumericFieldKey) => {
      const row = ov[fileBlockOverrideKey(blockId, field)];
      const sharedVal = field === "fundingAmount" ? sf : sr;
      const display = row != null ? row.n : sharedVal;
      return {
        shared: sharedVal,
        display,
        source: row != null ? ("override" as const) : ("shared" as const),
      };
    };

    return {
      fileId,
      blockId,
      fields: {
        fundingAmount: resolve("fundingAmount"),
        interestRate: resolve("interestRate"),
      },
    };
  },
});

/** Lists all block override keys for a file (for debugging / admin). */
export const listOverrides = query({
  args: {
    fileId: v.id("pipeline"),
    memberUserKey: v.optional(v.string()),
  },
  handler: async (ctx, { fileId, memberUserKey }) => {
    const p = await assertCanAccessFile(ctx, fileId, memberUserKey);
    return p.fileBlockFieldOverrides ?? {};
  },
});

/** Normalized shared fields for a file (single read model). */
export const getNormalized = query({
  args: {
    fileId: v.id("pipeline"),
    memberUserKey: v.optional(v.string()),
  },
  handler: async (ctx, { fileId, memberUserKey }) => {
    const p = await assertCanAccessFile(ctx, fileId, memberUserKey);
    return normalizeFileSharedStateFromPipeline(
      p as unknown as PipelineFileSharedSource
    );
  },
});

/**
 * Updates canonical `fileSharedState` and mirrors onto top-level
 * `fundingAmount`, `rate`, `term`, `notes`, `commission`, and `netRevenue`
 * for legacy list/drawer readers.
 */
export const patchShared = mutation({
  args: {
    fileId: v.id("pipeline"),
    fundingAmount: v.optional(v.number()),
    interestRate: v.optional(v.number()),
    term: v.optional(v.string()),
    commission: v.optional(v.number()),
    netRevenue: v.optional(v.number()),
    notes: v.optional(v.union(v.string(), v.null())),
    /** Caller account id — excludes this user from file-update notifications. */
    preferencesAccountId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const {
      fileId,
      fundingAmount,
      interestRate,
      term,
      commission,
      netRevenue,
      notes,
      preferencesAccountId,
    } = args;
    if (
      fundingAmount === undefined &&
      interestRate === undefined &&
      term === undefined &&
      notes === undefined &&
      commission === undefined &&
      netRevenue === undefined
    ) {
      throw new Error(
        "Provide at least one of: fundingAmount, interestRate, term, notes, commission, netRevenue",
      );
    }
    const existing = await ctx.db.get(fileId);
    if (!existing) throw new Error("Pipeline not found");
    const now = Date.now();

    const prev = normalizeFileSharedStateFromPipeline(
      existing as unknown as PipelineFileSharedSource
    );

    const nextFunding =
      fundingAmount !== undefined ? fundingAmount : prev.fundingAmount;
    const nextRate =
      interestRate !== undefined ? interestRate : prev.interestRate;
    const nextTerm = term !== undefined ? term.trim() : prev.term;
    const nextNotes =
      notes !== undefined
        ? notes === null
          ? ""
          : notes.trim()
        : prev.notes;

    const nextCommission =
      commission !== undefined ? commission : prev.commission;
    const nextNetRevenue =
      netRevenue !== undefined ? netRevenue : prev.netRevenue;

    if (!Number.isFinite(nextFunding) || nextFunding < 0) {
      throw new Error("fundingAmount must be a non-negative number");
    }
    if (!Number.isFinite(nextRate) || nextRate < 0) {
      throw new Error("interestRate must be a non-negative number");
    }
    if (!Number.isFinite(nextCommission) || nextCommission < 0) {
      throw new Error("commission must be a non-negative number");
    }
    if (!Number.isFinite(nextNetRevenue) || nextNetRevenue < 0) {
      throw new Error("netRevenue must be a non-negative number");
    }

    /** Only touch top-level mirrors the caller provided — avoid rewriting others. */
    const patchObj: Partial<Doc<"pipeline">> = { updatedAt: now };
    if (fundingAmount !== undefined) patchObj.fundingAmount = nextFunding;
    if (interestRate !== undefined) patchObj.rate = nextRate;
    if (term !== undefined) patchObj.term = nextTerm;
    if (notes !== undefined) patchObj.notes = nextNotes ? nextNotes : undefined;
    if (commission !== undefined) patchObj.commission = nextCommission;
    if (netRevenue !== undefined) patchObj.netRevenue = nextNetRevenue;

    const changedKeys: SharedBusFieldKey[] = [];
    if (fundingAmount !== undefined && nextFunding !== prev.fundingAmount) {
      changedKeys.push("fundingAmount");
    }
    if (interestRate !== undefined && nextRate !== prev.interestRate) {
      changedKeys.push("interestRate");
    }
    if (term !== undefined && nextTerm !== prev.term) {
      changedKeys.push("term");
    }
    if (notes !== undefined && nextNotes !== prev.notes) {
      changedKeys.push("notes");
    }
    if (commission !== undefined && nextCommission !== prev.commission) {
      changedKeys.push("commission");
    }
    if (netRevenue !== undefined && nextNetRevenue !== prev.netRevenue) {
      changedKeys.push("netRevenue");
    }
    if (changedKeys.length > 0) {
      await runPipelineBlockAutomations({
        ctx,
        fileId,
        existing,
        now,
        patchObj,
        nextFundingForBus: nextFunding,
        event: {
          type: "shared_fields_changed",
          changedKeys,
          feeContext: "patch_shared",
        },
      });
    }

    /** Rematerialize bus from the full next shared snapshot (not a partial patch). */
    const busMaterialize: {
      fundingAmount: number;
      rate: number;
      term: string;
      notes: string;
      commission: number;
      netRevenue: number;
      fileSharedState?: FileSharedStateStorage;
    } = {
      fundingAmount: nextFunding,
      rate: nextRate,
      term: nextTerm,
      notes: nextNotes,
      commission: nextCommission,
      netRevenue: nextNetRevenue,
    };
    materializeFileSharedStateOnPatch(
      busMaterialize,
      {
        ...(existing as unknown as PipelineFileSharedSource),
        fundingAmount: nextFunding,
        rate: nextRate,
        term: nextTerm,
        notes: nextNotes,
        commission: nextCommission,
        netRevenue: nextNetRevenue,
        fileSharedState: undefined,
      },
      now,
    );
    if (busMaterialize.fileSharedState) {
      patchObj.fileSharedState = busMaterialize.fileSharedState;
    }

    const undoKeys = patchKeysForUndo(patchObj as unknown as Record<string, unknown>);
    const allowUndo = undoKeys.length > 0 && undoKeys.length <= 48;
    const undoPre = allowUndo
      ? snapshotPipelineFields(existing, undoKeys)
      : null;

    await ctx.db.patch(fileId, patchObj);

    const auditKeyLabels = changedKeys.map((k) =>
      k === "interestRate" ? "rate" : k,
    );
    const afterRow = await ctx.db.get(fileId);
    let undoPost: Record<string, unknown> | null = null;
    if (allowUndo && afterRow && undoPre != null) {
      undoPost = snapshotPipelineFields(afterRow, undoKeys);
    }
    const undoOk =
      allowUndo &&
      undoPre != null &&
      undoPost != null &&
      undoPayloadWithinLimit(undoPre, undoPost);

    if (auditKeyLabels.length > 0) {
      await appendPipelineFileActivity(ctx, {
        fileId,
        at: now,
        kind: "data_patch",
        keys: auditKeyLabels,
        summary: clampActivitySummary(
          `Shared data: ${auditKeyLabels.join(", ")}`,
        ),
        ...(undoOk
          ? {
              undoSpec: {
                v: 1 as const,
                kind: "pipeline_fields" as const,
                keys: undoKeys,
                pre: cloneJson(undoPre),
              },
              expectPost: cloneJson(undoPost),
            }
          : {}),
      });
      const row = await ctx.db.get(fileId);
      if (row) {
        const watchers = collectPipelineWatcherUserKeys(
          row,
          preferencesAccountId,
        );
        const label = `Pipeline file updated: “${row.fileName.trim()}” (shared fields)`;
        const detail = auditKeyLabels.join(", ");
        for (const w of watchers) {
          await dispatchUserNotification(ctx, {
            userKey: w,
            category: "file_update",
            summary: label,
            detail,
            actorUserKey: preferencesAccountId,
            fileId,
          });
        }
      }
    }

    if (notes !== undefined) {
      const prevNotes = existing.notes ?? "";
      const nextNoteStr = notes === null ? "" : notes.trim();
      for (const h of newMentionHandlesOnly(prevNotes, nextNoteStr)) {
        await dispatchUserNotification(ctx, {
          userKey: h,
          category: "mention",
          summary: `You were mentioned in notes on “${existing.fileName.trim()}”`,
          actorUserKey: preferencesAccountId,
          fileId,
        });
      }
    }

    await refreshPipelineGlobalSearchText(ctx, fileId);
    return { ok: true as const };
  },
});

export const setBlockOverride = mutation({
  args: {
    fileId: v.id("pipeline"),
    blockId: v.string(),
    fieldKey: fieldKeyValidator,
    value: v.number(),
  },
  handler: async (ctx, { fileId, blockId, fieldKey, value }) => {
    if (!Number.isFinite(value)) throw new Error("Invalid value");
    const existing = await ctx.db.get(fileId);
    if (!existing) throw new Error("Pipeline not found");
    const now = Date.now();
    const key = fileBlockOverrideKey(blockId, fieldKey);
    const prev = existing.fileBlockFieldOverrides ?? {};
    const preOverrides =
      existing.fileBlockFieldOverrides === undefined
        ? undefined
        : cloneJson(existing.fileBlockFieldOverrides);
    await ctx.db.patch(fileId, {
      updatedAt: now,
      fileBlockFieldOverrides: {
        ...prev,
        [key]: { n: value, updatedAt: now },
      },
    });
    const afterOverrides = (await ctx.db.get(fileId))!.fileBlockFieldOverrides;
    const expectKey = stableValueKey(afterOverrides);
    const blockUndoOk = undoJsonPairWithinLimit(
      preOverrides ?? null,
      expectKey,
    );
    await appendPipelineFileActivity(ctx, {
      fileId,
      at: now,
      kind: "data_patch",
      keys: [`fileBlockOverride:${blockId}:${fieldKey}`],
      summary: clampActivitySummary(`Per-block ${fieldKey} (${blockId})`),
      ...(blockUndoOk
        ? {
            undoSpec: {
              v: 1 as const,
              kind: "block_overrides" as const,
              pre: preOverrides,
            },
            expectPost: expectKey,
          }
        : {}),
    });
    return { ok: true as const };
  },
});

export const clearBlockOverride = mutation({
  args: {
    fileId: v.id("pipeline"),
    blockId: v.string(),
    fieldKey: fieldKeyValidator,
  },
  handler: async (ctx, { fileId, blockId, fieldKey }) => {
    const existing = await ctx.db.get(fileId);
    if (!existing) throw new Error("Pipeline not found");
    const key = fileBlockOverrideKey(blockId, fieldKey);
    const prev = existing.fileBlockFieldOverrides ?? {};
    if (!(key in prev)) return { ok: true as const };
    const preOverrides = cloneJson(prev);
    const { [key]: _, ...rest } = prev;
    const now = Date.now();
    await ctx.db.patch(fileId, {
      updatedAt: now,
      fileBlockFieldOverrides:
        Object.keys(rest).length > 0 ? rest : undefined,
    });
    const afterOverrides = (await ctx.db.get(fileId))!.fileBlockFieldOverrides;
    const expectKey = stableValueKey(afterOverrides);
    const blockUndoOk = undoJsonPairWithinLimit(
      preOverrides,
      expectKey,
    );
    await appendPipelineFileActivity(ctx, {
      fileId,
      at: now,
      kind: "data_patch",
      keys: [`fileBlockOverrideClear:${blockId}:${fieldKey}`],
      summary: clampActivitySummary(`Cleared ${fieldKey} override (${blockId})`),
      ...(blockUndoOk
        ? {
            undoSpec: {
              v: 1 as const,
              kind: "block_overrides" as const,
              pre: preOverrides,
            },
            expectPost: expectKey,
          }
        : {}),
    });
    return { ok: true as const };
  },
});
