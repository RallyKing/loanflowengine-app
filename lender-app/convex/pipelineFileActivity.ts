import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import {
  materializeFileSharedStateOnPatch,
  type PipelineFileSharedSource,
} from "../lib/fileSharedFields";
import {
  PIPELINE_FILE_ACTIVITY_MAX_PER_FILE,
  clampActivitySummary,
} from "../lib/pipelineFileActivityModel";
import {
  cloneJson,
  drawerLayoutMatchesExpectation,
  pipelineFieldsMatchSnapshot,
  stableValueKey,
  type UndoSpec,
} from "../lib/pipelineFileUndo";
import {
  finalizeFileDrawerLayoutForPersist,
  layoutToDbFields,
} from "./pipelineGlobalBlockConfigHelpers";
import { assertCanReadPipelineRow } from "./organizationAccess";
import { mirrorPipelineActivityToFeed } from "./activityFeed";
import { refreshPipelineGlobalSearchText } from "./globalSearchSync";

export type PipelineFileActivityInsert = {
  fileId: Id<"pipeline">;
  at: number;
  kind:
    | "file_created"
    | "data_patch"
    | "deal_patch"
    | "drawer_layout"
    | "contact_link"
    | "contact_unlink"
    | "contact_link_update"
    | "lender_attach"
    | "lender_detach"
    | "lender_select"
    | "automation"
    | "undo"
    | "share_grant"
    | "share_revoke"
    | "share_update"
    | "client_momentum"
    | "vault_client_upload"
    | "vault_broker_review"
    | "lender_delivery_accessed"
    | "lender_document_previewed"
    | "lender_folder_expanded"
    | "lender_package_exported";
  keys?: string[];
  summary?: string;
  contactId?: Id<"contacts">;
  lenderId?: Id<"lenders">;
  shareTargetUserKey?: string;
  shareAccess?: "view" | "edit";
  actorUserKey?: string;
  blocksShown?: string[];
  blocksHidden?: string[];
  undoSpec?: unknown;
  expectPost?: unknown;
};

async function applyUndoByActivityDoc(
  ctx: MutationCtx,
  act: Doc<"pipelineFileActivity">,
): Promise<{ ok: true }> {
  if (act.revertedAt != null) {
    throw new Error("This change was already undone.");
  }
  if (act.undoSpec == null) {
    throw new Error("This activity cannot be undone automatically.");
  }
  const spec = act.undoSpec as UndoSpec;
  if (spec.v !== 1) {
    throw new Error("Unsupported undo format.");
  }

  const now = Date.now();
  const file = await ctx.db.get(act.fileId);
  if (!file) throw new Error("Pipeline file not found");

  switch (spec.kind) {
    case "pipeline_fields": {
      const expect = act.expectPost as Record<string, unknown>;
      if (!pipelineFieldsMatchSnapshot(file, expect, spec.keys)) {
        throw new Error(
          "Cannot undo safely: the file no longer matches the state right after that edit.",
        );
      }
      const revertPatch = cloneJson(spec.pre) as Partial<Doc<"pipeline">>;
      revertPatch.createdAt = file.createdAt;
      revertPatch.updatedAt = now;
      const merged = { ...file, ...revertPatch } as Doc<"pipeline">;
      materializeFileSharedStateOnPatch(
        revertPatch,
        merged as unknown as PipelineFileSharedSource,
        now,
      );
      await ctx.db.patch(act.fileId, revertPatch);
      break;
    }
    case "drawer_layout": {
      const expectKey = act.expectPost as string;
      if (!drawerLayoutMatchesExpectation(file.fileDrawerLayout, expectKey)) {
        throw new Error(
          "Cannot undo safely: drawer sections or block settings changed since then.",
        );
      }
      const finalized = await finalizeFileDrawerLayoutForPersist(ctx, spec.pre);
      await ctx.db.patch(act.fileId, {
        fileDrawerLayout: {
          v: 1,
          ...layoutToDbFields(finalized),
        },
        createdAt: file.createdAt,
        updatedAt: now,
      });
      break;
    }
    case "block_overrides": {
      const expectKey = act.expectPost as string;
      if (stableValueKey(file.fileBlockFieldOverrides) !== expectKey) {
        throw new Error(
          "Cannot undo safely: per-block funding overrides changed since then.",
        );
      }
      await ctx.db.patch(act.fileId, {
        fileBlockFieldOverrides: spec.pre,
        createdAt: file.createdAt,
        updatedAt: now,
      });
      break;
    }
    case "contact_link_patch": {
      const expectKey = act.expectPost as string;
      const link = await ctx.db.get(spec.linkId);
      if (!link) {
        throw new Error("Cannot undo: this contact link no longer exists.");
      }
      if (
        stableValueKey({ role: link.role, notes: link.notes ?? undefined }) !==
        expectKey
      ) {
        throw new Error("Cannot undo safely: the link was edited again.");
      }
      await ctx.db.patch(spec.linkId, {
        role: spec.pre.role,
        notes: spec.pre.notes,
        updatedAt: now,
      });
      break;
    }
    case "contact_link_insert": {
      const expectKey = act.expectPost as string;
      const link = await ctx.db.get(spec.linkId);
      if (!link) {
        throw new Error("Cannot undo: link already removed.");
      }
      const snap = stableValueKey({
        contactId: link.contactId,
        fileId: link.fileId,
        role: link.role,
        notes: link.notes,
      });
      if (snap !== expectKey) {
        throw new Error("Cannot undo safely: this link no longer matches.");
      }
      await ctx.db.delete(spec.linkId);
      break;
    }
    case "contact_unlink_restore": {
      if (act.expectPost !== "unlinked") {
        throw new Error("Invalid undo metadata for contact removal.");
      }
      const dup = await ctx.db
        .query("contactFileLinks")
        .withIndex("by_contact_file", (q) =>
          q.eq("contactId", spec.contactId).eq("fileId", spec.fileId),
        )
        .first();
      if (dup) {
        throw new Error("Cannot undo: this contact is already linked to the file.");
      }
      await ctx.db.insert("contactFileLinks", {
        contactId: spec.contactId,
        fileId: spec.fileId,
        role: spec.role,
        notes: spec.notes,
        createdAt: spec.createdAt,
        updatedAt: now,
      });
      break;
    }
    case "lenders_state": {
      const expect = act.expectPost as {
        lenders: Id<"lenders">[];
        selectedLenderId?: Id<"lenders">;
        selectedLenderSentAt?: number;
      };
      const curSnap = {
        lenders: file.lenders,
        selectedLenderId: file.selectedLenderId,
        selectedLenderSentAt: file.selectedLenderSentAt,
      };
      if (stableValueKey(curSnap) !== stableValueKey(expect)) {
        throw new Error(
          "Cannot undo safely: lenders or selection changed since then.",
        );
      }
      await ctx.db.patch(act.fileId, {
        lenders: spec.pre.lenders,
        selectedLenderId: spec.pre.selectedLenderId,
        selectedLenderSentAt: spec.pre.selectedLenderSentAt,
        createdAt: file.createdAt,
        updatedAt: now,
      });
      break;
    }
    default: {
      const _never: never = spec;
      throw new Error(`Unknown undo kind: ${String(_never)}`);
    }
  }

  await refreshPipelineGlobalSearchText(ctx, act.fileId);

  await ctx.db.patch(act._id, { revertedAt: now });
  await appendPipelineFileActivity(ctx, {
    fileId: act.fileId,
    at: now,
    kind: "undo",
    summary: clampActivitySummary(`Undid: ${act.kind}`),
  });
  return { ok: true };
}

/**
 * Append one audit row and trim oldest events when a file exceeds the cap.
 */
export async function appendPipelineFileActivity(
  ctx: MutationCtx,
  row: PipelineFileActivityInsert,
): Promise<void> {
  const { actorUserKey, ...activityDoc } = row;
  await ctx.db.insert("pipelineFileActivity", activityDoc);
  await mirrorPipelineActivityToFeed(ctx, {
    fileId: row.fileId,
    at: row.at,
    kind: row.kind,
    summary: row.summary,
    keys: row.keys,
    contactId: row.contactId,
    lenderId: row.lenderId,
    actorUserKey: row.actorUserKey,
  });
  let guard = 0;
  while (guard++ < 120) {
    const batch = await ctx.db
      .query("pipelineFileActivity")
      .withIndex("by_file_at", (q) => q.eq("fileId", row.fileId))
      .order("desc")
      .take(PIPELINE_FILE_ACTIVITY_MAX_PER_FILE + 1);
    if (batch.length <= PIPELINE_FILE_ACTIVITY_MAX_PER_FILE) {
      break;
    }
    const victim = await ctx.db
      .query("pipelineFileActivity")
      .withIndex("by_file_at", (q) => q.eq("fileId", row.fileId))
      .order("asc")
      .first();
    if (!victim) break;
    await ctx.db.delete(victim._id);
  }
}

/** Roll back one tracked change. Verifies current data still matches `expectPost`. */
export const undoActivity = mutation({
  args: { activityId: v.id("pipelineFileActivity") },
  handler: async (ctx, { activityId }) => {
    const act = await ctx.db.get(activityId);
    if (!act) throw new Error("Activity not found");
    return await applyUndoByActivityDoc(ctx, act);
  },
});

/** Undo the most recent reversible activity on this file (skips non-undo rows). */
export const undoMostRecentForFile = mutation({
  args: {
    fileId: v.id("pipeline"),
    memberUserKey: v.optional(v.string()),
  },
  handler: async (ctx, { fileId, memberUserKey }) => {
    const file = await ctx.db.get(fileId);
    if (!file) throw new Error("File not found");
    await assertCanReadPipelineRow(ctx, file, memberUserKey);
    const recent = await ctx.db
      .query("pipelineFileActivity")
      .withIndex("by_file_at", (q) => q.eq("fileId", fileId))
      .order("desc")
      .take(60);
    const target = recent.find(
      (r) =>
        r.undoSpec != null &&
        r.revertedAt == null &&
        r.kind !== "undo" &&
        r.kind !== "file_created" &&
        r.kind !== "deal_patch" &&
        r.kind !== "automation" &&
        r.kind !== "share_grant" &&
        r.kind !== "share_revoke" &&
        r.kind !== "share_update" &&
        r.kind !== "client_momentum",
    );
    if (!target) {
      throw new Error("No undoable change found for this file.");
    }
    return await applyUndoByActivityDoc(ctx, target);
  },
});

/**
 * Recent file events (newest first). Bounded for performance.
 */
export const listForFile = query({
  args: {
    fileId: v.id("pipeline"),
    limit: v.optional(v.number()),
    memberUserKey: v.optional(v.string()),
  },
  handler: async (ctx, { fileId, limit, memberUserKey }) => {
    const file = await ctx.db.get(fileId);
    if (!file) return [];
    await assertCanReadPipelineRow(ctx, file, memberUserKey);
    const cap = Math.min(Math.max(limit ?? 120, 1), 200);
    return await ctx.db
      .query("pipelineFileActivity")
      .withIndex("by_file_at", (q) => q.eq("fileId", fileId))
      .order("desc")
      .take(cap);
  },
});