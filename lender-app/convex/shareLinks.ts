import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import {
  mergePartialCoverOnPatch,
  mergePartialSubjectPropertyOnPatch,
  syncLinkedPipelineDealDataAfterIntakeChange,
} from "./dealDataMerge";
import { SECTION_KEYS, isShareSection } from "./shareSections";
import {
  assertCanMutatePipelineRow,
  assertCanReadPipelineRow,
} from "./organizationAccess";
import type { MutationCtx, QueryCtx } from "./_generated/server";

type ShareLinkDoc = {
  section?: string;
  sections?: string[];
  access?: string;
};

function generateToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function normalizeSections(link: ShareLinkDoc): string[] {
  if (link.sections && link.sections.length > 0) return link.sections;
  if (link.section) return [link.section];
  return [];
}

function normalizeAccess(link: ShareLinkDoc): "view" | "edit" {
  return link.access === "view" ? "view" : "edit";
}

async function pipelineForIntake(
  ctx: QueryCtx | MutationCtx,
  intakeId: Id<"intakeSheets">,
) {
  return await ctx.db
    .query("pipeline")
    .withIndex("by_intakeSheetId", (q) => q.eq("intakeSheetId", intakeId))
    .first();
}

async function assertIntakeShareRead(
  ctx: QueryCtx,
  intakeId: Id<"intakeSheets">,
  memberUserKey: string | undefined,
): Promise<void> {
  const pipeline = await pipelineForIntake(ctx, intakeId);
  if (!pipeline) {
    throw new Error("Intake is not linked to an authorized workspace file.");
  }
  await assertCanReadPipelineRow(ctx, pipeline, memberUserKey);
}

async function assertIntakeShareWrite(
  ctx: MutationCtx,
  intakeId: Id<"intakeSheets">,
  memberUserKey: string | undefined,
): Promise<void> {
  const pipeline = await pipelineForIntake(ctx, intakeId);
  if (!pipeline) {
    throw new Error("Intake is not linked to an authorized workspace file.");
  }
  await assertCanMutatePipelineRow(ctx, pipeline, memberUserKey);
}

function pickIntakeForSections(
  intake: Doc<"intakeSheets">,
  sections: string[],
): Record<string, unknown> {
  const allowed = new Set<string>(["_id", "updatedAt"]);
  for (const s of sections) {
    if (!isShareSection(s)) continue;
    for (const key of SECTION_KEYS[s] as readonly string[]) {
      allowed.add(key);
    }
  }
  const out: Record<string, unknown> = {};
  for (const key of allowed) {
    if (Object.prototype.hasOwnProperty.call(intake, key)) {
      out[key] = (intake as Record<string, unknown>)[key];
    }
  }
  return out;
}

export const listForIntake = query({
  args: {
    intakeId: v.id("intakeSheets"),
    memberUserKey: v.optional(v.string()),
  },
  handler: async (ctx, { intakeId, memberUserKey }) => {
    await assertIntakeShareRead(ctx, intakeId, memberUserKey);
    return await ctx.db
      .query("shareLinks")
      .withIndex("by_intake", (q) => q.eq("intakeId", intakeId))
      .collect();
  },
});

export const create = mutation({
  args: {
    intakeId: v.id("intakeSheets"),
    memberUserKey: v.optional(v.string()),
    sections: v.array(v.string()),
    access: v.optional(v.string()), // "view" | "edit"
    audience: v.optional(v.string()), // "client" | "lender" | "partner" | "other"
    label: v.optional(v.string()),
    expiresAt: v.optional(v.number()),
  },
  handler: async (
    ctx,
    { intakeId, memberUserKey, sections, access, audience, label, expiresAt },
  ) => {
    await assertIntakeShareWrite(ctx, intakeId, memberUserKey);
    if (!sections || sections.length === 0) {
      throw new Error("At least one section is required.");
    }
    for (const s of sections) {
      if (!isShareSection(s)) {
        throw new Error(`Unknown section: ${s}`);
      }
    }
    const intake = await ctx.db.get(intakeId);
    if (!intake) throw new Error("Intake not found");

    const normalizedAccess = access === "view" ? "view" : "edit";
    const token = generateToken();
    const id = await ctx.db.insert("shareLinks", {
      intakeId,
      sections,
      access: normalizedAccess,
      audience: audience ?? "client",
      token,
      label,
      createdAt: Date.now(),
      expiresAt,
      allowEdit: normalizedAccess === "edit",
      submissionCount: 0,
    });
    return { id, token };
  },
});

export const revoke = mutation({
  args: {
    id: v.id("shareLinks"),
    memberUserKey: v.optional(v.string()),
  },
  handler: async (ctx, { id, memberUserKey }) => {
    const link = await ctx.db.get(id);
    if (!link) return;
    await assertIntakeShareWrite(ctx, link.intakeId, memberUserKey);
    await ctx.db.patch(id, { revokedAt: Date.now() });
  },
});

export const remove = mutation({
  args: {
    id: v.id("shareLinks"),
    memberUserKey: v.optional(v.string()),
  },
  handler: async (ctx, { id, memberUserKey }) => {
    const link = await ctx.db.get(id);
    if (!link) return;
    await assertIntakeShareWrite(ctx, link.intakeId, memberUserKey);
    await ctx.db.delete(id);
  },
});

export const getByToken = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const link = await ctx.db
      .query("shareLinks")
      .withIndex("by_token", (q) => q.eq("token", token))
      .unique();
    if (!link) return { status: "not_found" as const };
    if (link.revokedAt) return { status: "revoked" as const };
    if (link.expiresAt && link.expiresAt < Date.now())
      return { status: "expired" as const };

    const intake = await ctx.db.get(link.intakeId);
    if (!intake) return { status: "not_found" as const };

    const sections = normalizeSections(link);
    return {
      status: "ok" as const,
      link: {
        _id: link._id,
        sections,
        access: normalizeAccess(link),
        audience: link.audience ?? "client",
        label: link.label,
        createdAt: link.createdAt,
        expiresAt: link.expiresAt,
      },
      intake: pickIntakeForSections(intake, sections),
    };
  },
});

export const markOpened = mutation({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const link = await ctx.db
      .query("shareLinks")
      .withIndex("by_token", (q) => q.eq("token", token))
      .unique();
    if (!link || link.revokedAt) return;
    await ctx.db.patch(link._id, { lastOpenedAt: Date.now() });
  },
});

/**
 * Public write endpoint. Validates the token, rejects view-only links, and
 * strips the incoming payload down to only the top-level keys belonging to
 * the link's section(s) before patching the underlying intake document.
 */
export const patchByToken = mutation({
  args: { token: v.string(), changes: v.any() },
  handler: async (ctx, { token, changes }) => {
    const link = await ctx.db
      .query("shareLinks")
      .withIndex("by_token", (q) => q.eq("token", token))
      .unique();
    if (!link) throw new Error("Invalid link");
    if (link.revokedAt) throw new Error("This share link has been revoked.");
    if (link.expiresAt && link.expiresAt < Date.now())
      throw new Error("This share link has expired.");

    if (normalizeAccess(link) !== "edit") {
      throw new Error("This link is view-only.");
    }

    const sections = normalizeSections(link);
    if (sections.length === 0) throw new Error("This link has no sections.");

    const allowedSet = new Set<string>();
    for (const s of sections) {
      if (!isShareSection(s)) continue;
      for (const key of SECTION_KEYS[s] as readonly string[]) {
        allowedSet.add(key);
      }
    }

    const safe: Record<string, unknown> = {};
    for (const key of allowedSet) {
      if (changes && Object.prototype.hasOwnProperty.call(changes, key)) {
        safe[key] = changes[key];
      }
    }
    if (Object.keys(safe).length === 0) return;

    const intakeRow = await ctx.db.get(link.intakeId);
    if (!intakeRow) throw new Error("Intake not found");
    if (safe.cover != null) {
      const mergedCover = mergePartialCoverOnPatch(intakeRow.cover, safe.cover);
      if (mergedCover !== undefined) safe.cover = mergedCover;
    }
    if (safe.subjectProperty != null) {
      const mergedSp = mergePartialSubjectPropertyOnPatch(
        intakeRow.subjectProperty,
        safe.subjectProperty,
      );
      if (mergedSp !== undefined) safe.subjectProperty = mergedSp;
    }

    safe.updatedAt = Date.now();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await ctx.db.patch(link.intakeId, safe as any);
    await syncLinkedPipelineDealDataAfterIntakeChange(ctx, link.intakeId, safe);

    await ctx.db.patch(link._id, {
      lastSubmittedAt: Date.now(),
      submissionCount: (link.submissionCount ?? 0) + 1,
    });
  },
});
