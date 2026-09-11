/**
 * Client-upload quiet-window review pipeline (Phase 1–3) + feature flags.
 *
 * ## Manual vs automatic (coexistence)
 * Auto 15m review is **additive**. It does **not** replace Document Task Request
 * + Templates. Brokers still create/apply `documentTaskTemplates` / stacks, set
 * portal-visible `documentVaultFileTasks`, and use notifyClient / portal invite.
 * Gap analysis reads those same live vault tasks (titles, isRequired, status,
 * isPortalVisible, taskType) — including template-injected rows. Drafts cite
 * those titles; reassign draft only for incomplete missing-upload tasks. This
 * module never inserts/patches/deletes template definitions.
 *
 * ## Two notification layers (both required when auto-review is enabled)
 * 1. Immediate — existing `recordClientVaultUpload` → `notifyPipelineBrokers`
 *    (per-upload in-app + Web Push). Always fires; never gated by these flags.
 * 2. Additive — 15 minutes after the *last* upload for a pipeline file, build a
 *    gap report + draft follow-ups and notify the broker that a review package
 *    awaits approval. Distinct summary / dedupeKey from layer 1.
 *
 * Feature flags (both must be ON / unset-default-ON to schedule layer 2):
 * - Org: `organizationSettings.clientUploadAutoReviewEnabled`
 * - File: `pipeline.clientUploadAutoReviewEnabled`
 *
 * No client email/SMS send and no task reassignment in this phase (Phase 4).
 *
 * ## Convex fail-closed (Joshua blocking acceptance)
 * - `runDebouncedReview` MUST NOT call `scheduler.runAfter` / re-queue itself.
 * - No cron / idle pump / polling for this feature (upload-driven `runAfter(15m)` only).
 * - Debounce uses `generation`; stale quiet-window jobs no-op.
 * - Layer-1 notify and layer-2 review-ready notify never re-enter `recordClientVaultUpload`.
 * - All list reads use indexes + `.take()` (no unbounded `.collect()`).
 * - `approve` / `requestChanges` / `dismiss` are status-only — no further schedules.
 */
import {
  internalMutation,
  mutation,
  query,
  type MutationCtx,
} from "./_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import {
  assertCanMutatePipelineRow,
  assertCanReadPipelineRow,
  resolveMemberUserKey,
} from "./organizationAccess";
import { requireOrgMemberKey } from "./authUtils";
import { notifyPipelineBrokers } from "./documentVaultActivity";
import { pipelineDealName } from "./webhookEventHelpers";
import {
  resolvePreferredEmail,
  resolvePreferredPhone,
} from "../lib/contact/contactMethods";

/** Quiet window after last client vault upload before the review package fires. */
export const CLIENT_UPLOAD_REVIEW_QUIET_MS = 15 * 60 * 1000;

const MAX_FILE_TASKS = 200;
const MAX_LINKS_PER_TASK = 40;
const MAX_PORTAL_GRANTS = 80;
const MAX_CONTACT_LINKS = 60;
const MAX_LIST_REVIEWS = 40;

const memberKeyArg = { memberUserKey: v.optional(v.string()) };

/** Unset → ON (dev default). Explicit `false` turns the switch off. */
export function isClientUploadAutoReviewFlagOn(
  value: boolean | undefined,
): boolean {
  return value !== false;
}

export async function isClientUploadAutoReviewEnabledForFile(
  ctx: MutationCtx,
  pipeline: Doc<"pipeline">,
): Promise<boolean> {
  if (!isClientUploadAutoReviewFlagOn(pipeline.clientUploadAutoReviewEnabled)) {
    return false;
  }
  const organizationId = pipeline.organizationId;
  if (!organizationId) return false;
  const settings = await ctx.db
    .query("organizationSettings")
    .withIndex("by_organization", (q) => q.eq("organizationId", organizationId))
    .unique();
  return isClientUploadAutoReviewFlagOn(
    settings?.clientUploadAutoReviewEnabled,
  );
}

const reviewStatusV = v.union(
  v.literal("awaiting_broker_approval"),
  v.literal("approved"),
  v.literal("changes_requested"),
  v.literal("dismissed"),
);

const gapItemV = v.object({
  fileTaskId: v.id("documentVaultFileTasks"),
  title: v.string(),
  status: v.union(
    v.literal("incomplete"),
    v.literal("pending_review"),
    v.literal("complete"),
  ),
  isRequired: v.boolean(),
  uploadedCount: v.number(),
  note: v.optional(v.string()),
});

type GapItem = {
  fileTaskId: Id<"documentVaultFileTasks">;
  title: string;
  status: "incomplete" | "pending_review" | "complete";
  isRequired: boolean;
  uploadedCount: number;
  note?: string;
};

/** Same upload-request kind as manual Document Task Request (incl. template inject). */
function isDocumentUploadTask(task: Doc<"documentVaultFileTasks">): boolean {
  const t = task.taskType;
  return t === undefined || t === "document_upload";
}

/**
 * Portal-visible document-upload vault tasks on the pipeline file.
 * Template-applied rows are indistinguishable here — they are live
 * `documentVaultFileTasks` with the same fields as manually created ones.
 */
function isRequestedClientTask(task: Doc<"documentVaultFileTasks">): boolean {
  if (task.isArchived) return false;
  if (!task.isPortalVisible) return false;
  return isDocumentUploadTask(task);
}

/**
 * Upsert debounce row + schedule quiet-window job when org+file flags allow.
 * Called from `recordClientVaultUpload` *after* the immediate broker notify.
 */
export async function scheduleClientUploadReview(
  ctx: MutationCtx,
  pipeline: Doc<"pipeline">,
): Promise<void> {
  const organizationId = pipeline.organizationId;
  if (!organizationId) return;

  if (!(await isClientUploadAutoReviewEnabledForFile(ctx, pipeline))) {
    return;
  }

  const now = Date.now();
  const existing = await ctx.db
    .query("clientUploadReviewDebounce")
    .withIndex("by_pipelineFile", (q) => q.eq("pipelineFileId", pipeline._id))
    .unique();

  const generation = (existing?.generation ?? 0) + 1;

  if (existing) {
    await ctx.db.patch(existing._id, {
      organizationId,
      lastUploadAt: now,
      generation,
      updatedAt: now,
    });
  } else {
    await ctx.db.insert("clientUploadReviewDebounce", {
      pipelineFileId: pipeline._id,
      organizationId,
      lastUploadAt: now,
      generation,
      updatedAt: now,
    });
  }

  await ctx.scheduler.runAfter(
    CLIENT_UPLOAD_REVIEW_QUIET_MS,
    internal.clientUploadReview.runDebouncedReview,
    {
      pipelineFileId: pipeline._id,
      generation,
    },
  );
}

async function countUploadsForTask(
  ctx: MutationCtx,
  fileTaskId: Id<"documentVaultFileTasks">,
): Promise<number> {
  const links = await ctx.db
    .query("libraryDocumentLinks")
    .withIndex("by_fileTask", (q) => q.eq("fileTaskId", fileTaskId))
    .take(MAX_LINKS_PER_TASK);
  return links.length;
}

/**
 * Gap vs the **manual** requested-task model: live `documentVaultFileTasks` on
 * this pipeline (portal-visible document_upload), compared to uploads linked
 * via `libraryDocumentLinks.fileTaskId`. Does not read or mutate templates.
 */
async function buildGapReport(
  ctx: MutationCtx,
  pipelineFileId: Id<"pipeline">,
): Promise<{
  matched: GapItem[];
  missing: GapItem[];
  unclear: GapItem[];
  summaryLine: string;
}> {
  const tasks = await ctx.db
    .query("documentVaultFileTasks")
    .withIndex("by_pipeline_sort", (q) => q.eq("pipelineFileId", pipelineFileId))
    .take(MAX_FILE_TASKS);

  const matched: GapItem[] = [];
  const missing: GapItem[] = [];
  const unclear: GapItem[] = [];

  for (const task of tasks) {
    if (!isRequestedClientTask(task)) continue;

    const uploadedCount = await countUploadsForTask(ctx, task._id);
    const base: GapItem = {
      fileTaskId: task._id,
      title: task.title,
      status: task.status,
      isRequired: task.isRequired,
      uploadedCount,
    };

    if (task.status === "complete" && uploadedCount > 0) {
      matched.push({ ...base, note: "Complete with uploaded document(s)" });
      continue;
    }

    if (task.status === "pending_review" && uploadedCount > 0) {
      matched.push({
        ...base,
        note: "Uploaded — awaiting broker review",
      });
      continue;
    }

    if (task.rejectionNote?.trim()) {
      unclear.push({
        ...base,
        note: `Revision requested: ${task.rejectionNote.trim().slice(0, 160)}`,
      });
      continue;
    }

    if (uploadedCount === 0 && task.status === "incomplete") {
      missing.push({
        ...base,
        note: task.isRequired ? "Required — no upload yet" : "No upload yet",
      });
      continue;
    }

    if (task.status === "complete" && uploadedCount === 0) {
      unclear.push({
        ...base,
        note: "Marked complete but no linked upload found",
      });
      continue;
    }

    if (task.status === "pending_review" && uploadedCount === 0) {
      unclear.push({
        ...base,
        note: "Pending review without linked upload",
      });
      continue;
    }

    if (uploadedCount > 0 && task.status === "incomplete") {
      unclear.push({
        ...base,
        note: "Has upload(s) but still incomplete",
      });
      continue;
    }

    unclear.push({ ...base, note: "Needs broker judgment" });
  }

  const summaryLine = `${matched.length} matched, ${missing.length} missing, ${unclear.length} unclear`;
  return { matched, missing, unclear, summaryLine };
}

async function resolveDraftRecipients(
  ctx: MutationCtx,
  pipeline: Doc<"pipeline">,
): Promise<{ emails: string[]; phones: string[] }> {
  const emails = new Set<string>();
  const phones = new Set<string>();

  const grants = await ctx.db
    .query("clientPortalGrants")
    .withIndex("by_file", (q) => q.eq("pipelineFileId", pipeline._id))
    .take(MAX_PORTAL_GRANTS);

  for (const g of grants) {
    if (g.status !== "active") continue;
    const e = g.emailKey.trim().toLowerCase();
    if (e.includes("@")) emails.add(e);
  }

  const links = await ctx.db
    .query("contactFileLinks")
    .withIndex("by_file", (q) => q.eq("fileId", pipeline._id))
    .take(MAX_CONTACT_LINKS);

  for (const link of links) {
    const contact = await ctx.db.get(link.contactId);
    if (!contact) continue;
    const email = resolvePreferredEmail(contact).trim().toLowerCase();
    if (email.includes("@")) emails.add(email);
    const phone = resolvePreferredPhone(contact).trim();
    if (phone.length >= 7) phones.add(phone);
  }

  const deal = pipeline.dealData;
  if (deal && typeof deal === "object" && !Array.isArray(deal)) {
    const record = deal as Record<string, unknown>;
    const borrower = record.borrower as Record<string, unknown> | undefined;
    const dealEmail =
      (typeof borrower?.email === "string" && borrower.email) ||
      (typeof record.borrowerEmail === "string" && record.borrowerEmail) ||
      "";
    const dealPhone =
      (typeof borrower?.phone === "string" && borrower.phone) ||
      (typeof record.borrowerPhone === "string" && record.borrowerPhone) ||
      "";
    if (dealEmail.trim().includes("@")) {
      emails.add(dealEmail.trim().toLowerCase());
    }
    if (dealPhone.trim().length >= 7) {
      phones.add(dealPhone.trim());
    }
  }

  return {
    emails: [...emails].slice(0, 20),
    phones: [...phones].slice(0, 20),
  };
}

function buildDrafts(args: {
  dealName: string;
  gap: {
    matched: GapItem[];
    missing: GapItem[];
    unclear: GapItem[];
    summaryLine: string;
  };
  emails: string[];
  phones: string[];
  ownerUserKey: string | undefined;
}): {
  draftEmail: { toEmails: string[]; subject: string; body: string };
  draftSms: { toPhones: string[]; body: string };
  draftTaskReassignment?: {
    suggestedAssigneeUserKey: string;
    reason: string;
  };
} {
  // Titles come from existing vault file tasks (manual or template-injected) —
  // never a parallel invented checklist.
  const missingTitles = args.gap.missing.map((m) => m.title);
  const unclearTitles = args.gap.unclear.map((u) => u.title);

  const missingBlock =
    missingTitles.length > 0
      ? missingTitles.map((t) => `• ${t}`).join("\n")
      : "(none)";
  const unclearBlock =
    unclearTitles.length > 0
      ? unclearTitles.map((t) => `• ${t}`).join("\n")
      : "(none)";

  const subject = `Documents still needed — ${args.dealName}`;
  const body = [
    `Hi,`,
    ``,
    `Thanks for the recent uploads on ${args.dealName}.`,
    ``,
    `Per your document request list, we're still missing:`,
    missingBlock,
    ``,
    unclearTitles.length > 0
      ? `Please also clarify or re-upload:\n${unclearBlock}\n`
      : "",
    `Reply to this email or use your secure portal link to upload the remaining items.`,
    ``,
    `Thank you`,
  ]
    .filter((line) => line !== "")
    .join("\n");

  const smsMissing =
    missingTitles.length > 0
      ? missingTitles.slice(0, 3).join("; ")
      : "a few items";
  const smsBody = `Hi — for ${args.dealName}, we still need: ${smsMissing}${
    missingTitles.length > 3 ? "…" : ""
  }. Please upload via your portal. Thanks!`.slice(0, 320);

  // Reassign draft only when there are incomplete vault tasks (missing uploads).
  // Never mutates templates or live tasks in Phase 1–3 — draft only.
  let draftTaskReassignment:
    | { suggestedAssigneeUserKey: string; reason: string }
    | undefined;
  const owner = args.ownerUserKey?.trim();
  if (args.gap.missing.length > 0 && owner) {
    const incompleteTitles = missingTitles.slice(0, 8).join("; ");
    draftTaskReassignment = {
      suggestedAssigneeUserKey: owner,
      reason: `Incomplete vault tasks still need uploads: ${incompleteTitles}${
        missingTitles.length > 8 ? "…" : ""
      }. Suggest keeping follow-up with pipeline owner. (Draft only — does not change templates or tasks.)`,
    };
  }

  return {
    draftEmail: {
      toEmails: args.emails,
      subject: subject.slice(0, 200),
      body: body.slice(0, 4000),
    },
    draftSms: {
      toPhones: args.phones,
      body: smsBody,
    },
    draftTaskReassignment,
  };
}

/**
 * Quiet-window worker. No-ops when `generation` no longer matches, or when
 * org/file flags turned off during the quiet window.
 *
 * FAIL CLOSED: this handler must never call `ctx.scheduler.runAfter` /
 * `runAt` (no self-reschedule). Broker notify here is in-app/Web Push only and
 * must not re-enter `recordClientVaultUpload`.
 */
export const runDebouncedReview = internalMutation({
  args: {
    pipelineFileId: v.id("pipeline"),
    generation: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const debounce = await ctx.db
      .query("clientUploadReviewDebounce")
      .withIndex("by_pipelineFile", (q) =>
        q.eq("pipelineFileId", args.pipelineFileId),
      )
      .unique();

    // Generation debounce: only the latest quiet-window job for this file runs.
    if (!debounce || debounce.generation !== args.generation) {
      return null;
    }

    const pipeline = await ctx.db.get(args.pipelineFileId);
    if (!pipeline?.organizationId) return null;

    if (!(await isClientUploadAutoReviewEnabledForFile(ctx, pipeline))) {
      return null;
    }

    const gap = await buildGapReport(ctx, args.pipelineFileId);
    const recipients = await resolveDraftRecipients(ctx, pipeline);
    const dealName = pipelineDealName(pipeline);
    const drafts = buildDrafts({
      dealName,
      gap,
      emails: recipients.emails,
      phones: recipients.phones,
      ownerUserKey: pipeline.ownerUserKey,
    });

    const now = Date.now();
    const reviewId = await ctx.db.insert("clientUploadReviews", {
      pipelineFileId: args.pipelineFileId,
      organizationId: pipeline.organizationId,
      status: "awaiting_broker_approval",
      generation: args.generation,
      lastUploadAt: debounce.lastUploadAt,
      gapReport: gap,
      draftEmail: drafts.draftEmail,
      draftSms: drafts.draftSms,
      draftTaskReassignment: drafts.draftTaskReassignment,
      createdAt: now,
      updatedAt: now,
    });

    const missingN = gap.missing.length;
    const unclearN = gap.unclear.length;
    const detailParts = [
      gap.summaryLine,
      missingN > 0 ? `${missingN} still missing` : null,
      unclearN > 0 ? `${unclearN} unclear` : null,
      "Draft follow-up ready for your approval (not sent).",
    ].filter(Boolean);

    // Layer-2 broker notify only — must not call recordClientVaultUpload /
    // scheduleClientUploadReview (would create a usage loop).
    await notifyPipelineBrokers(ctx, {
      pipeline,
      category: "document_activity",
      summary: "Client upload review ready",
      detail: detailParts.join(" · ").slice(0, 420),
      dedupeKey: `client-upload-review:${reviewId}`,
      contextFileName: dealName,
    });

    // Intentionally no ctx.scheduler.* here — worker is terminal.
    return null;
  },
});

/**
 * Phase 4 stub — never call from approve in this PR.
 * Reserved for sending draft email/SMS / applying task reassignment after broker OK.
 */
export const sendFollowUp = internalMutation({
  args: {
    reviewId: v.id("clientUploadReviews"),
  },
  returns: v.null(),
  handler: async (_ctx, _args) => {
    // TODO(Phase 4): send draftEmail / draftSms and optionally apply
    // draftTaskReassignment after broker approve. Intentionally a no-op stub
    // so approveReview cannot accidentally outbound in Phase 1–3.
    return null;
  },
});

const reviewListItemV = v.object({
  _id: v.id("clientUploadReviews"),
  pipelineFileId: v.id("pipeline"),
  organizationId: v.id("organizations"),
  status: reviewStatusV,
  generation: v.number(),
  lastUploadAt: v.number(),
  gapReport: v.object({
    matched: v.array(gapItemV),
    missing: v.array(gapItemV),
    unclear: v.array(gapItemV),
    summaryLine: v.string(),
  }),
  draftEmail: v.object({
    toEmails: v.array(v.string()),
    subject: v.string(),
    body: v.string(),
  }),
  draftSms: v.object({
    toPhones: v.array(v.string()),
    body: v.string(),
  }),
  draftTaskReassignment: v.optional(
    v.object({
      suggestedAssigneeUserKey: v.string(),
      reason: v.string(),
    }),
  ),
  createdAt: v.number(),
  updatedAt: v.number(),
  decidedAt: v.optional(v.number()),
  decidedByUserKey: v.optional(v.string()),
});

function toListItem(row: Doc<"clientUploadReviews">) {
  return {
    _id: row._id,
    pipelineFileId: row.pipelineFileId,
    organizationId: row.organizationId,
    status: row.status,
    generation: row.generation,
    lastUploadAt: row.lastUploadAt,
    gapReport: row.gapReport,
    draftEmail: row.draftEmail,
    draftSms: row.draftSms,
    draftTaskReassignment: row.draftTaskReassignment,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    decidedAt: row.decidedAt,
    decidedByUserKey: row.decidedByUserKey,
  };
}

/** Latest awaiting review packages for an org (bounded). */
export const listAwaitingForOrg = query({
  args: {
    organizationId: v.id("organizations"),
    ...memberKeyArg,
    limit: v.optional(v.number()),
  },
  returns: v.array(reviewListItemV),
  handler: async (ctx, args) => {
    await requireOrgMemberKey(ctx, args.organizationId, args.memberUserKey, {
      stage: "clientUploadReview.listAwaitingForOrg",
    });
    const limit = Math.min(Math.max(args.limit ?? 20, 1), MAX_LIST_REVIEWS);
    const rows = await ctx.db
      .query("clientUploadReviews")
      .withIndex("by_org_status_createdAt", (q) =>
        q
          .eq("organizationId", args.organizationId)
          .eq("status", "awaiting_broker_approval"),
      )
      .order("desc")
      .take(limit);

    return rows.map(toListItem);
  },
});

/** Single review by id (pipeline ACL). */
export const getReview = query({
  args: {
    reviewId: v.id("clientUploadReviews"),
    ...memberKeyArg,
  },
  returns: v.union(reviewListItemV, v.null()),
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.reviewId);
    if (!row) return null;
    const pipeline = await ctx.db.get(row.pipelineFileId);
    if (!pipeline) return null;
    await assertCanReadPipelineRow(ctx, pipeline, args.memberUserKey);
    return toListItem(row);
  },
});

async function decideReview(
  ctx: MutationCtx,
  args: {
    reviewId: Id<"clientUploadReviews">;
    memberUserKey?: string;
    next: "approved" | "changes_requested" | "dismissed";
  },
): Promise<
  { ok: true; status: typeof args.next } | { ok: false; reason: string }
> {
  const row = await ctx.db.get(args.reviewId);
  if (!row) return { ok: false, reason: "Review not found" };
  if (row.status !== "awaiting_broker_approval") {
    return { ok: false, reason: `Review already ${row.status}` };
  }
  const pipeline = await ctx.db.get(row.pipelineFileId);
  if (!pipeline) return { ok: false, reason: "Pipeline file not found" };
  const actor = await resolveMemberUserKey(ctx, args.memberUserKey);
  await assertCanMutatePipelineRow(ctx, pipeline, actor);
  const now = Date.now();
  await ctx.db.patch(row._id, {
    status: args.next,
    updatedAt: now,
    decidedAt: now,
    decidedByUserKey: actor,
  });
  // Phase 4: do NOT call sendFollowUp / Resend / SMS / task patch here.
  return { ok: true, status: args.next };
}

const decideResultV = v.union(
  v.object({
    ok: v.literal(true),
    status: v.union(
      v.literal("approved"),
      v.literal("changes_requested"),
      v.literal("dismissed"),
    ),
  }),
  v.object({ ok: v.literal(false), reason: v.string() }),
);

/**
 * Broker approves the review package.
 * Status only — does not send email/SMS or reassign tasks (Phase 4).
 */
export const approveReview = mutation({
  args: {
    reviewId: v.id("clientUploadReviews"),
    ...memberKeyArg,
  },
  returns: decideResultV,
  handler: async (ctx, args) => {
    return await decideReview(ctx, {
      reviewId: args.reviewId,
      memberUserKey: args.memberUserKey,
      next: "approved",
    });
  },
});

/** Broker requests changes — status only. */
export const requestChanges = mutation({
  args: {
    reviewId: v.id("clientUploadReviews"),
    ...memberKeyArg,
  },
  returns: decideResultV,
  handler: async (ctx, args) => {
    return await decideReview(ctx, {
      reviewId: args.reviewId,
      memberUserKey: args.memberUserKey,
      next: "changes_requested",
    });
  },
});

/** Broker dismisses the package — status only. */
export const dismiss = mutation({
  args: {
    reviewId: v.id("clientUploadReviews"),
    ...memberKeyArg,
  },
  returns: decideResultV,
  handler: async (ctx, args) => {
    return await decideReview(ctx, {
      reviewId: args.reviewId,
      memberUserKey: args.memberUserKey,
      next: "dismissed",
    });
  },
});
