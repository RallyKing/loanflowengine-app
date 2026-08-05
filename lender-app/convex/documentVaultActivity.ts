import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { appendPipelineFileActivity } from "./pipelineFileActivity";
import { insertCollaborationActivityEvent } from "./activityEvents";
import { dispatchUserNotification } from "./notifications";
import { resolveCompanySlugForPipeline, registerClientPortalLink } from "./clientPortalLinks";
import { buildClientPortalUrl } from "../lib/clientPortalUrl";
import { sha256Hex, randomHex } from "./clientPortalCrypto";

const BUNDLE_TTL_MS = 90 * 24 * 60 * 60 * 1000;

export type DocumentVaultAuditKind =
  | "vault_client_upload"
  | "vault_broker_review"
  | "lender_delivery_accessed"
  | "lender_document_previewed"
  | "lender_folder_expanded"
  | "lender_package_exported";

function brokerRecipientKeys(
  pipeline: Doc<"pipeline">,
  exclude?: string,
): string[] {
  const keys = new Set<string>();
  const owner = pipeline.ownerUserKey?.trim();
  if (owner) keys.add(owner);
  if (exclude?.trim()) keys.delete(exclude.trim());
  return [...keys];
}

export async function logDocumentVaultAudit(
  ctx: MutationCtx,
  args: {
    pipeline: Doc<"pipeline">;
    kind: DocumentVaultAuditKind;
    actorUserKey: string;
    summary: string;
    keys?: string[];
    meta?: Record<string, unknown>;
    lenderId?: Id<"lenders">;
    libraryDocumentId?: Id<"libraryDocuments">;
  },
): Promise<void> {
  const at = Date.now();
  const actor = args.actorUserKey.trim() || "__system__";
  const summary = args.summary.trim().slice(0, 420);
  if (!summary || !args.pipeline.organizationId) return;

  await appendPipelineFileActivity(ctx, {
    fileId: args.pipeline._id,
    at,
    kind: args.kind,
    actorUserKey: actor,
    summary,
    keys: args.keys,
    lenderId: args.lenderId,
  });

  const eventType =
    args.kind === "vault_client_upload"
      ? ("document_uploaded" as const)
      : args.kind === "vault_broker_review"
        ? ("status_changed" as const)
        : ("lender_interaction_created" as const);

  await insertCollaborationActivityEvent(ctx, {
    organizationId: args.pipeline.organizationId,
    eventType,
    visibility: "org_wide",
    actorUserKey: actor,
    summary,
    pipelineFileId: args.pipeline._id,
    lenderId: args.lenderId,
    libraryDocumentId: args.libraryDocumentId,
    delta: args.meta,
  });
}

export async function notifyPipelineBrokers(
  ctx: MutationCtx,
  args: {
    pipeline: Doc<"pipeline">;
    category: "document_activity" | "status_change" | "file_update";
    summary: string;
    detail?: string;
    actorUserKey?: string;
    dedupeKey?: string;
    libraryDocumentId?: Id<"libraryDocuments">;
  },
): Promise<void> {
  for (const userKey of brokerRecipientKeys(args.pipeline, args.actorUserKey)) {
    await dispatchUserNotification(ctx, {
      userKey,
      category: args.category,
      summary: args.summary,
      detail: args.detail,
      actorUserKey: args.actorUserKey,
      fileId: args.pipeline._id,
      libraryDocumentId: args.libraryDocumentId,
      dedupeKey: args.dedupeKey,
    });
  }
}

async function issueRevisionPortalUrl(
  ctx: MutationCtx,
  pipeline: Doc<"pipeline">,
  task: Doc<"documentVaultFileTasks">,
): Promise<string> {
  const now = Date.now();
  const plainToken = randomHex(24);
  const tokenHash = await sha256Hex(plainToken);
  const companySlug = await resolveCompanySlugForPipeline(ctx, pipeline);

  const bundleId = await ctx.db.insert("documentVaultClientBundleTokens", {
    pipelineFileId: pipeline._id,
    fileTaskIds: [task._id],
    tokenHash,
    status: "active",
    mode: "selective",
    readOnlyPreview: false,
    brokerAgentCapable: false,
    expiresAt: now + BUNDLE_TTL_MS,
    createdByUserKey: "__revision_notify__",
    createdAt: now,
  });

  await registerClientPortalLink(ctx, {
    pipelineFileId: pipeline._id,
    organizationId: pipeline.organizationId,
    bundleTokenId: bundleId,
    companySlug,
    tokenHash,
    title: task.title,
    linkKind: "client_invite",
    expiresAt: now + BUNDLE_TTL_MS,
    createdByUserKey: "__revision_notify__",
    createdAt: now,
    issuedUrl: buildClientPortalUrl(companySlug, plainToken),
  });

  return buildClientPortalUrl(companySlug, plainToken);
}

async function activeClientEmailsForFile(
  ctx: MutationCtx,
  pipelineFileId: Id<"pipeline">,
): Promise<string[]> {
  const grants = await ctx.db
    .query("clientPortalGrants")
    .withIndex("by_file", (q) => q.eq("pipelineFileId", pipelineFileId))
    .collect();
  return [
    ...new Set(
      grants
        .filter((g) => g.status === "active")
        .map((g) => g.emailKey)
        .filter((e) => e.includes("@")),
    ),
  ];
}

async function workspaceLabel(
  ctx: MutationCtx,
  pipeline: Doc<"pipeline">,
): Promise<string> {
  if (!pipeline.organizationId) return "Your lender";
  const org = await ctx.db.get(pipeline.organizationId);
  return org?.name?.trim() || "Your lender";
}

export async function notifyClientRevisionRequested(
  ctx: MutationCtx,
  args: {
    pipeline: Doc<"pipeline">;
    task: Doc<"documentVaultFileTasks">;
    revisionNote: string;
    brokerUserKey?: string;
  },
): Promise<void> {
  const emails = await activeClientEmailsForFile(ctx, args.pipeline._id);
  if (emails.length === 0) return;

  const portalUrl = await issueRevisionPortalUrl(ctx, args.pipeline, args.task);
  const label = await workspaceLabel(ctx, args.pipeline);
  for (const email of emails) {
    await ctx.scheduler.runAfter(
      0,
      internal.clientPortalEmails.deliverRevisionRequest,
      {
        to: email,
        taskTitle: args.task.title,
        revisionNote: args.revisionNote,
        portalUrl,
        workspaceLabel: label,
      },
    );
  }
}

export async function recordClientVaultUpload(
  ctx: MutationCtx,
  args: {
    pipeline: Doc<"pipeline">;
    task: Doc<"documentVaultFileTasks">;
    fileName: string;
    documentId?: Id<"libraryDocuments">;
  },
): Promise<void> {
  const summary = `Client uploaded "${args.fileName}" for ${args.task.title}`;
  await logDocumentVaultAudit(ctx, {
    pipeline: args.pipeline,
    kind: "vault_client_upload",
    actorUserKey: "__client_portal__",
    summary,
    keys: [args.fileName, String(args.task._id)],
    meta: {
      fileTaskId: args.task._id,
      fileName: args.fileName,
      documentId: args.documentId,
    },
    libraryDocumentId: args.documentId,
  });

  await notifyPipelineBrokers(ctx, {
    pipeline: args.pipeline,
    category: "document_activity",
    summary: `${args.task.title} — client submission pending review`,
    detail: summary,
    dedupeKey: `vault-upload:${args.task._id}:${Date.now()}`,
    libraryDocumentId: args.documentId,
  });
}

export async function recordBrokerVaultReview(
  ctx: MutationCtx,
  args: {
    pipeline: Doc<"pipeline">;
    task: Doc<"documentVaultFileTasks">;
    action: "approved" | "revision_requested";
    revisionNote?: string;
    brokerUserKey?: string;
  },
): Promise<void> {
  const summary =
    args.action === "approved"
      ? `Approved "${args.task.title}"`
      : `Requested revision on "${args.task.title}"`;
  const detail =
    args.action === "revision_requested" && args.revisionNote
      ? args.revisionNote
      : undefined;

  await logDocumentVaultAudit(ctx, {
    pipeline: args.pipeline,
    kind: "vault_broker_review",
    actorUserKey: args.brokerUserKey?.trim() || "__broker__",
    summary: detail ? `${summary}: ${detail}` : summary,
    keys: [args.action, String(args.task._id)],
    meta: {
      fileTaskId: args.task._id,
      action: args.action,
      revisionNote: args.revisionNote,
    },
  });

  if (args.action === "revision_requested" && args.revisionNote) {
    await notifyClientRevisionRequested(ctx, {
      pipeline: args.pipeline,
      task: args.task,
      revisionNote: args.revisionNote,
      brokerUserKey: args.brokerUserKey,
    });
  }
}

export async function recordLenderDeliveryAccess(
  ctx: MutationCtx,
  args: {
    pipeline: Doc<"pipeline">;
    lenderId: Id<"lenders">;
    lenderName: string;
    clientIp?: string;
    userAgent?: string;
  },
): Promise<void> {
  const ip = args.clientIp?.trim().slice(0, 80);
  const summary = ip
    ? `${args.lenderName} opened the lender data room (${ip})`
    : `${args.lenderName} opened the lender data room`;

  await logDocumentVaultAudit(ctx, {
    pipeline: args.pipeline,
    kind: "lender_delivery_accessed",
    actorUserKey: "__lender_portal__",
    summary,
    keys: ip ? [ip] : undefined,
    meta: {
      clientIp: ip,
      userAgent: args.userAgent?.slice(0, 200),
      lenderId: args.lenderId,
    },
    lenderId: args.lenderId,
  });
}
