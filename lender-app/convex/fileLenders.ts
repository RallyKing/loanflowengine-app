/**
 * Phase 26.1–26.2 — file↔lender junction (`fileLenders`): rejection + reinstatement.
 */
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import {
  assertCanMutatePipelineRow,
  assertCanReadPipelineRow,
} from "./organizationAccess";
import {
  findFileLenderEdge,
  syncFileLenderEdgesFromPipeline,
  upsertFileLenderEdge,
} from "./indexedGraphEdgeSync";

const preferencesAccountIdArg = {
  preferencesAccountId: v.optional(v.string()),
};

const memberUserKeyArg = {
  memberUserKey: v.optional(v.string()),
};

export type FileLenderLinkSummary = {
  lenderId: Id<"lenders">;
  relationshipType: Doc<"fileLenders">["relationshipType"];
  rejectionReason?: string;
  /** Phase Modular-B — chosen loan program (name from the lender's programList). */
  selectedProgramName?: string;
  /** Lender representative assigned on this file. */
  contactRepId?: Id<"contacts">;
  contactRepName?: string;
  updatedAt: number;
};

function formatRejectionNoticeContent(
  lenderLabel: string,
  reason: string,
): string {
  const trimmedReason = reason.trim();
  return `[Rejection Notice] Lender: ${lenderLabel} - Reason: ${trimmedReason}`;
}

function formatReinstatementNoticeContent(lenderLabel: string): string {
  return `[Lender Reinstated] Lender: ${lenderLabel} - File has been updated and marked active again.`;
}

async function insertPipelineFileTimelineNote(
  ctx: MutationCtx,
  args: {
    file: Doc<"pipeline">;
    content: string;
    authorUserKey: string;
  },
): Promise<Id<"pipelineFileNotes">> {
  const organizationId = args.file.organizationId;
  if (!organizationId) {
    throw new Error("File organization required to add a timeline note");
  }
  return await ctx.db.insert("pipelineFileNotes", {
    organizationId,
    pipelineFileId: args.file._id,
    authorUserKey: args.authorUserKey,
    content: args.content,
  });
}

async function insertRejectionNoticeNote(
  ctx: MutationCtx,
  args: {
    file: Doc<"pipeline">;
    lenderLabel: string;
    reason: string;
    authorUserKey: string;
  },
): Promise<Id<"pipelineFileNotes">> {
  return insertPipelineFileTimelineNote(ctx, {
    file: args.file,
    content: formatRejectionNoticeContent(args.lenderLabel, args.reason),
    authorUserKey: args.authorUserKey,
  });
}

async function resolveAuthorUserKey(
  ctx: MutationCtx,
  memberUserKey?: string,
  preferencesAccountId?: string,
): Promise<string> {
  const identity = await ctx.auth.getUserIdentity();
  const authorUserKey =
    identity?.subject?.trim() ||
    memberUserKey?.trim() ||
    preferencesAccountId?.trim() ||
    "";
  if (!authorUserKey) {
    throw new Error("Sign in required to update lender link status");
  }
  return authorUserKey;
}

function activeRelationshipForLenderOnFile(
  file: Doc<"pipeline">,
  lenderId: Id<"lenders">,
): Doc<"fileLenders">["relationshipType"] {
  return file.selectedLenderId != null &&
    String(file.selectedLenderId) === String(lenderId)
    ? "selected"
    : "quoted";
}

/** Lender junction edges for one file (workspace UI + hub filtering). */
export const listByFile = query({
  args: {
    fileId: v.id("pipeline"),
    ...memberUserKeyArg,
  },
  handler: async (ctx, { fileId, memberUserKey }) => {
    const file = await ctx.db.get(fileId);
    if (!file) return [];
    await assertCanReadPipelineRow(ctx, file, memberUserKey);
    const edges = await ctx.db
      .query("fileLenders")
      .withIndex("by_file", (q) => q.eq("fileId", fileId))
      .collect();
    const out: FileLenderLinkSummary[] = [];
    for (const e of edges) {
      let contactRepName: string | undefined;
      if (e.contactRepId) {
        const rep = await ctx.db.get(e.contactRepId);
        contactRepName = rep?.name?.trim() || undefined;
      }
      out.push({
        lenderId: e.lenderId,
        relationshipType: e.relationshipType,
        rejectionReason: e.rejectionReason?.trim() || undefined,
        selectedProgramName: e.selectedProgramName?.trim() || undefined,
        contactRepId: e.contactRepId,
        contactRepName,
        updatedAt: e.updatedAt,
      });
    }
    return out;
  },
});

/**
 * Phase Modular-B — operator-assigned lender roles on a file (multi-lender
 * structures). `selected` and `declined` keep their dedicated flows.
 */
export const setLenderLinkRole = mutation({
  args: {
    fileId: v.id("pipeline"),
    lenderId: v.id("lenders"),
    relationshipType: v.union(
      v.literal("quoted"),
      v.literal("submitted"),
      v.literal("syndication_partner"),
      v.literal("sub_lender"),
      v.literal("partner_group"),
      v.literal("other"),
    ),
    ...preferencesAccountIdArg,
    ...memberUserKeyArg,
  },
  handler: async (ctx, args) => {
    const file = await ctx.db.get(args.fileId);
    if (!file) throw new Error("Pipeline file not found");
    await assertCanMutatePipelineRow(
      ctx,
      file,
      args.preferencesAccountId ?? args.memberUserKey,
    );
    if (!file.organizationId) throw new Error("File organization required");
    if (!file.lenders.some((id) => String(id) === String(args.lenderId))) {
      throw new Error("Lender is not linked to this file");
    }

    const edge = await findFileLenderEdge(ctx, args.fileId, args.lenderId);
    const now = Date.now();
    if (edge) {
      if (edge.relationshipType === "declined") {
        throw new Error("Reinstate the lender before changing its role");
      }
      await ctx.db.patch(edge._id, {
        relationshipType: args.relationshipType,
        updatedAt: now,
      });
      return { ok: true as const };
    }

    const sortOrder = Math.max(
      0,
      file.lenders.findIndex((id) => String(id) === String(args.lenderId)),
    );
    await upsertFileLenderEdge(ctx, {
      organizationId: file.organizationId,
      fileId: args.fileId,
      lenderId: args.lenderId,
      relationshipType: args.relationshipType,
      sortOrder,
      actor: args.preferencesAccountId?.trim() || args.memberUserKey?.trim(),
    });
    return { ok: true as const };
  },
});

/**
 * Phase Modular-B — choose (or clear) the loan program for this file from the
 * lender's `programList`.
 */
export const setLenderLinkProgram = mutation({
  args: {
    fileId: v.id("pipeline"),
    lenderId: v.id("lenders"),
    programName: v.optional(v.string()),
    ...preferencesAccountIdArg,
    ...memberUserKeyArg,
  },
  handler: async (ctx, args) => {
    const file = await ctx.db.get(args.fileId);
    if (!file) throw new Error("Pipeline file not found");
    await assertCanMutatePipelineRow(
      ctx,
      file,
      args.preferencesAccountId ?? args.memberUserKey,
    );
    if (!file.organizationId) throw new Error("File organization required");
    if (!file.lenders.some((id) => String(id) === String(args.lenderId))) {
      throw new Error("Lender is not linked to this file");
    }

    const programName = args.programName?.trim() || undefined;
    if (programName) {
      const lender = await ctx.db.get(args.lenderId);
      if (!lender) throw new Error("Lender not found");
      const known = (lender.programList ?? []).some(
        (p) => p.name.trim() === programName,
      );
      if (!known) {
        throw new Error("Program not found on this lender");
      }
    }

    let edge = await findFileLenderEdge(ctx, args.fileId, args.lenderId);
    if (!edge) {
      const sortOrder = Math.max(
        0,
        file.lenders.findIndex((id) => String(id) === String(args.lenderId)),
      );
      await upsertFileLenderEdge(ctx, {
        organizationId: file.organizationId,
        fileId: args.fileId,
        lenderId: args.lenderId,
        relationshipType:
          file.selectedLenderId != null &&
          String(file.selectedLenderId) === String(args.lenderId)
            ? "selected"
            : "quoted",
        sortOrder,
        actor: args.preferencesAccountId?.trim() || args.memberUserKey?.trim(),
      });
      edge = await findFileLenderEdge(ctx, args.fileId, args.lenderId);
    }
    if (!edge) throw new Error("Lender link not found");

    await ctx.db.patch(edge._id, {
      selectedProgramName: programName,
      updatedAt: Date.now(),
    });
    return { ok: true as const };
  },
});

/** Assign or clear the lender representative on a file↔lender link. */
export const setLenderLinkRep = mutation({
  args: {
    fileId: v.id("pipeline"),
    lenderId: v.id("lenders"),
    contactRepId: v.union(v.id("contacts"), v.null()),
    ...preferencesAccountIdArg,
    ...memberUserKeyArg,
  },
  handler: async (ctx, args) => {
    const file = await ctx.db.get(args.fileId);
    if (!file) throw new Error("Pipeline file not found");
    await assertCanMutatePipelineRow(
      ctx,
      file,
      args.preferencesAccountId ?? args.memberUserKey,
    );
    if (!file.organizationId) throw new Error("File organization required");
    if (!file.lenders.some((id) => String(id) === String(args.lenderId))) {
      throw new Error("Lender is not linked to this file");
    }

    let edge = await findFileLenderEdge(ctx, args.fileId, args.lenderId);
    if (!edge) {
      const sortOrder = Math.max(
        0,
        file.lenders.findIndex((id) => String(id) === String(args.lenderId)),
      );
      await upsertFileLenderEdge(ctx, {
        organizationId: file.organizationId,
        fileId: args.fileId,
        lenderId: args.lenderId,
        relationshipType: activeRelationshipForLenderOnFile(file, args.lenderId),
        sortOrder,
        actor: args.preferencesAccountId?.trim() || args.memberUserKey?.trim(),
      });
      edge = await findFileLenderEdge(ctx, args.fileId, args.lenderId);
    }
    if (!edge) throw new Error("Lender link not found");

    if (args.contactRepId !== null) {
      const link = await ctx.db
        .query("contactLenderLinks")
        .withIndex("by_contact_lender", (q) =>
          q
            .eq("contactId", args.contactRepId as Id<"contacts">)
            .eq("lenderId", args.lenderId),
        )
        .first();
      if (!link) {
        throw new Error(
          "Selected contact is not a representative of this lender.",
        );
      }
    }

    await ctx.db.patch(edge._id, {
      contactRepId: args.contactRepId === null ? undefined : args.contactRepId,
      updatedAt: Date.now(),
    });
    return { ok: true as const };
  },
});

/**
 * Mark a file↔lender link as declined (rejected). Lender stays on `pipeline.lenders[]`
 * for duplicate-guard visibility; hub Lender View excludes declined edges only.
 */
export const rejectLenderLink = mutation({
  args: {
    fileId: v.id("pipeline"),
    lenderId: v.id("lenders"),
    reason: v.string(),
    ...preferencesAccountIdArg,
    ...memberUserKeyArg,
  },
  handler: async (ctx, args) => {
    const reason = args.reason.trim();
    if (!reason) throw new Error("Rejection reason is required");

    const file = await ctx.db.get(args.fileId);
    if (!file) throw new Error("Pipeline file not found");
    await assertCanMutatePipelineRow(
      ctx,
      file,
      args.preferencesAccountId ?? args.memberUserKey,
    );

    if (!file.organizationId) {
      throw new Error("File organization required");
    }
    if (!file.lenders.some((id) => String(id) === String(args.lenderId))) {
      throw new Error("Lender is not linked to this file");
    }

    const lender = await ctx.db.get(args.lenderId);
    if (!lender) throw new Error("Lender not found");
    const lenderLabel = lender.company?.trim() || "Unknown lender";

    const now = Date.now();
    const existing = await findFileLenderEdge(ctx, args.fileId, args.lenderId);
    const sortOrder =
      existing?.sortOrder ??
      Math.max(0, file.lenders.findIndex((id) => String(id) === String(args.lenderId)));

    await upsertFileLenderEdge(ctx, {
      organizationId: file.organizationId,
      fileId: args.fileId,
      lenderId: args.lenderId,
      relationshipType: "declined",
      sortOrder,
      actor: args.preferencesAccountId?.trim() || args.memberUserKey?.trim(),
    });

    const edge = await findFileLenderEdge(ctx, args.fileId, args.lenderId);
    if (edge) {
      await ctx.db.patch(edge._id, {
        rejectionReason: reason,
        updatedAt: now,
      });
    }

    if (
      file.selectedLenderId != null &&
      String(file.selectedLenderId) === String(args.lenderId)
    ) {
      await ctx.db.patch(args.fileId, {
        selectedLenderId: undefined,
        selectedLenderSentAt: undefined,
        updatedAt: now,
      });
      const refreshed = (await ctx.db.get(args.fileId))!;
      await syncFileLenderEdgesFromPipeline(
        ctx,
        refreshed,
        args.preferencesAccountId ?? args.memberUserKey,
      );
    }

    const authorUserKey = await resolveAuthorUserKey(
      ctx,
      args.memberUserKey,
      args.preferencesAccountId,
    );

    await insertRejectionNoticeNote(ctx, {
      file,
      lenderLabel,
      reason,
      authorUserKey,
    });

    return { ok: true as const };
  },
});

/**
 * Reinstate a declined file↔lender link (Bring Back). Clears rejection lock;
 * hub Lender View includes the file again when `relationshipType` ≠ `declined`.
 */
export const restoreLenderLink = mutation({
  args: {
    fileLenderLinkId: v.optional(v.id("fileLenders")),
    fileId: v.optional(v.id("pipeline")),
    lenderId: v.optional(v.id("lenders")),
    ...preferencesAccountIdArg,
    ...memberUserKeyArg,
  },
  handler: async (ctx, args) => {
    let edge: Doc<"fileLenders"> | null = null;
    if (args.fileLenderLinkId) {
      edge = await ctx.db.get(args.fileLenderLinkId);
    } else if (args.fileId && args.lenderId) {
      edge = await findFileLenderEdge(ctx, args.fileId, args.lenderId);
    } else {
      throw new Error("Provide fileLenderLinkId or fileId + lenderId");
    }
    if (!edge) throw new Error("Lender link not found");
    if (edge.relationshipType !== "declined") {
      throw new Error("Only declined lender links can be reinstated");
    }

    const file = await ctx.db.get(edge.fileId);
    if (!file) throw new Error("Pipeline file not found");
    await assertCanMutatePipelineRow(
      ctx,
      file,
      args.preferencesAccountId ?? args.memberUserKey,
    );

    if (!file.lenders.some((id) => String(id) === String(edge!.lenderId))) {
      throw new Error("Lender is not linked to this file");
    }

    const lender = await ctx.db.get(edge.lenderId);
    if (!lender) throw new Error("Lender not found");
    const lenderLabel = lender.company?.trim() || "Unknown lender";

    const now = Date.now();
    const nextRel = activeRelationshipForLenderOnFile(file, edge.lenderId);

    await ctx.db.patch(edge._id, {
      relationshipType: nextRel,
      rejectionReason: undefined,
      updatedAt: now,
    });

    const authorUserKey = await resolveAuthorUserKey(
      ctx,
      args.memberUserKey,
      args.preferencesAccountId,
    );

    await insertPipelineFileTimelineNote(ctx, {
      file,
      content: formatReinstatementNoticeContent(lenderLabel),
      authorUserKey,
    });

    return { ok: true as const };
  },
});
