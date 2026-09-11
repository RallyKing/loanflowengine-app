import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import {
  pipelineDealName,
  scheduleWebhookQueueEvent,
  webhookVaultContext,
} from "./webhookEventHelpers";
import { randomHex, normalizePortalToken, sha256Hex } from "./clientPortalCrypto";
import {
  assertCanMutatePipelineRow,
  assertCanReadPipelineRow,
} from "./organizationAccess";
import { snapshotBlockSettings } from "./pipelineBlockSnapshots";
import {
  extractDealSnapshotSlice,
  hydrateLivePipelineBlockFromClientSubmission,
  validateClientPortalFormData,
} from "./clientPortalBlockHydration";
import {
  getAtomicPortalBlock,
  isAtomicPortalBlockId,
  isClientEditableAtomicBlock,
  normalizeToAtomicBlockIds,
} from "../lib/atomicPortalBlockRegistry";
import {
  clientPortalBlockLabel,
  isClientPortalAssignableBlock,
  prefillValuesForPortalBlock,
} from "../lib/documentVaultClientBlocks";
import {
  normalizeAssignedBlockEntriesFromDoc,
  resolveTaskTypeFromDoc,
} from "./documentVaultTaskTypes";
import { ensureExclusiveBlockAssignmentTask } from "./documentVaultFileTasks";
import { embeddedDealPayloadIsSubstantive } from "../lib/file/embeddedDealPresence";
import { clientLinkEmailItemFromFileTask } from "../lib/clientLinkEmailCopy";
import {
  portalBlockPrefillForTask,
  portalDealSheetDtoFromSources,
  portalPublicTaskRow,
} from "./portalPublicDtos";
import { buildClientPortalUrl, clientPortalPublicOrigin, slugifyCompanySlug } from "../lib/clientPortalUrl";
import {
  loadLinkByTokenHash,
  registerClientPortalLink,
  resolveCompanySlugForPipeline,
} from "./clientPortalLinks";
import { assertLinkAccessAllowed } from "./portalAccessVerification";
import { assertFileTaskPasswordAllowed } from "./portalFileTaskPassword";
import {
  bundleIncludesFileTask,
  resolveBundleFileTaskIds,
} from "./portalBundleTaskScope";
import { recordClientVaultUpload } from "./documentVaultActivity";
import { vaultDocumentOutboundFileName } from "../lib/library/vaultOutboundFileName";

const memberKeyArg = { memberUserKey: v.optional(v.string()) };
const BUNDLE_TTL_MS = 90 * 24 * 60 * 60 * 1000;
const PREVIEW_TTL_MS = 2 * 60 * 60 * 1000;
const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

function titleFromVaultFileName(fileName: string): string {
  const base = fileName.replace(/[/\\]/g, "").trim() || "Document";
  const withoutExt = base.replace(/\.[^.]+$/, "").trim();
  return withoutExt || base;
}

function safeFileName(name: string): string {
  return name.replace(/[/\\]/g, "").trim().slice(0, 255) || "document";
}

function portalUrlForSlug(companySlug: string, plainToken: string): string {
  return buildClientPortalUrl(companySlug, plainToken);
}

function isOutstanding(task: Doc<"documentVaultFileTasks">): boolean {
  return !task.isArchived && task.status !== "complete";
}

async function loadPipelineVaultTasks(
  ctx: QueryCtx | MutationCtx,
  pipelineFileId: Id<"pipeline">,
) {
  return await ctx.db
    .query("documentVaultFileTasks")
    .withIndex("by_pipeline_sort", (q) => q.eq("pipelineFileId", pipelineFileId))
    .collect();
}

async function assertBundleTaskInScope(
  ctx: QueryCtx | MutationCtx,
  row: Doc<"documentVaultClientBundleTokens">,
  fileTaskId: Id<"documentVaultFileTasks">,
): Promise<boolean> {
  const allTasks = await loadPipelineVaultTasks(ctx, row.pipelineFileId);
  return bundleIncludesFileTask(row, allTasks, fileTaskId);
}

async function loadBundleByPlain(
  ctx: QueryCtx | MutationCtx,
  plainToken: string,
  companySlug?: string,
  accessProof?: string,
): Promise<
  | {
      ok: true;
      row: Doc<"documentVaultClientBundleTokens">;
      link: Doc<"clientPortalLinks"> | null;
    }
  | {
      ok: false;
      reason:
        | "invalid"
        | "revoked"
        | "expired"
        | "slug_mismatch"
        | "verification_required";
      verificationType?: "passcode" | "email_otp";
    }
> {
  const trimmed = normalizePortalToken(plainToken);
  if (!trimmed || trimmed.length > 128) {
    return { ok: false, reason: "invalid" };
  }
  const tokenHash = await sha256Hex(trimmed);
  const link = await loadLinkByTokenHash(ctx, tokenHash);
  if (link?.status === "revoked") {
    return { ok: false, reason: "revoked" };
  }
  const row = await ctx.db
    .query("documentVaultClientBundleTokens")
    .withIndex("by_tokenHash", (q) => q.eq("tokenHash", tokenHash))
    .first();
  if (!row || row.status !== "active") {
    return { ok: false, reason: "revoked" };
  }
  if (row.expiresAt < Date.now() || link?.status === "expired") {
    return { ok: false, reason: "expired" };
  }
  if (companySlug?.trim() && link) {
    const expected = slugifyCompanySlug(companySlug);
    if (link.companySlug !== expected) {
      return { ok: false, reason: "slug_mismatch" };
    }
  }
  if (link) {
    const gate = await assertLinkAccessAllowed(ctx, link, accessProof);
    if (!gate.ok) {
      return {
        ok: false,
        reason: "verification_required",
        verificationType: gate.verificationType,
      };
    }
  }
  return { ok: true, row, link };
}

/** Token-authorized deal sheet for client portal block editing (no member session). */
export const getPortalDealSheet = query({
  args: {
    bundleToken: v.string(),
    fileTaskId: v.id("documentVaultFileTasks"),
    accessProof: v.optional(v.string()),
    taskAccessProof: v.optional(v.string()),
  },
  handler: async (ctx, { bundleToken, fileTaskId, accessProof, taskAccessProof }) => {
    const auth = await loadBundleByPlain(
      ctx,
      normalizePortalToken(bundleToken),
      undefined,
      accessProof,
    );
    if (!auth.ok) {
      return { status: auth.reason } as const;
    }
    if (!(await assertBundleTaskInScope(ctx, auth.row, fileTaskId))) {
      return { status: "unauthorized" as const };
    }

    const task = await ctx.db.get(fileTaskId);
    if (!task || task.isArchived) {
      return { status: "not_found" as const };
    }
    const passwordGate = await assertFileTaskPasswordAllowed(ctx, {
      task,
      tokenHash: auth.row.tokenHash,
      taskAccessProof,
    });
    if (!passwordGate.ok) {
      return { status: "password_required" as const };
    }

    const pipeline = await ctx.db.get(task.pipelineFileId);
    if (!pipeline) {
      return { status: "not_found" as const };
    }

    const linked =
      pipeline.intakeSheetId != null
        ? await ctx.db.get(pipeline.intakeSheetId)
        : null;

    const assigned = normalizeAssignedBlockEntriesFromDoc(task);
    const assignedBlockIds = assigned.map((e) => e.blockId);
    const blockEditable: Record<string, boolean> = {};
    for (const entry of assigned) {
      if (isAtomicPortalBlockId(entry.blockId)) {
        blockEditable[entry.blockId] = isClientEditableAtomicBlock(entry.blockId);
      }
    }

    const needsConstruction = assignedBlockIds.includes("construction_budget");
    const constructionBudgetLines = needsConstruction
      ? await ctx.db
          .query("constructionBudgetLines")
          .withIndex("by_file_sort", (q) => q.eq("fileId", pipeline._id))
          .collect()
      : [];

    return {
      status: "ok" as const,
      ...portalDealSheetDtoFromSources({
        pipeline,
        linkedIntake: linked,
        assignedBlockIds,
        constructionBudgetLines,
        blockEditable,
        readOnlyPreview: auth.row.readOnlyPreview === true,
        brokerAgentCapable: auth.row.brokerAgentCapable === true,
        fileTask: task,
      }),
    };
  },
});

export const getBundleByToken = query({
  args: {
    token: v.string(),
    companySlug: v.optional(v.string()),
    accessProof: v.optional(v.string()),
  },
  handler: async (ctx, { token, companySlug, accessProof }) => {
    const trimmed = normalizePortalToken(token);
    if (!trimmed) return { status: "not_found" as const };
    const auth = await loadBundleByPlain(ctx, trimmed, companySlug, accessProof);
    if (!auth.ok) {
      if (auth.reason === "expired") return { status: "expired" as const };
      if (auth.reason === "revoked") return { status: "revoked" as const };
      if (auth.reason === "slug_mismatch") return { status: "slug_mismatch" as const };
      if (auth.reason === "verification_required") {
        return {
          status: "verification_required" as const,
          verificationType: auth.verificationType ?? ("passcode" as const),
        };
      }
      return { status: "not_found" as const };
    }
    const row = auth.row;

    const pipeline = await ctx.db.get(row.pipelineFileId);
    if (!pipeline) return { status: "not_found" as const };

    const org = pipeline.organizationId
      ? await ctx.db.get(pipeline.organizationId)
      : null;
    const workspaceName =
      org?.name?.trim() && org.name.trim().length > 0
        ? org.name.trim()
        : "Your lender";
    const fileLabel =
      pipeline.fileName?.trim() ||
      pipeline.propertyAddress?.trim() ||
      "Loan file";

    const tasks: ReturnType<typeof portalPublicTaskRow>[] = [];

    const pipelineSettings = pipeline.fileDrawerLayout?.settings ?? {};
    const dealPayload = embeddedDealPayloadIsSubstantive(pipeline.dealData)
      ? (pipeline.dealData as Record<string, unknown>)
      : {};
    const allPipelineTasks = await loadPipelineVaultTasks(ctx, row.pipelineFileId);
    const scopedTaskIds = resolveBundleFileTaskIds(row, allPipelineTasks);

    const pushTask = async (task: Doc<"documentVaultFileTasks">) => {
      const taskType = resolveTaskTypeFromDoc(task);
      if (taskType === "internal_task") return;
      const entries = normalizeAssignedBlockEntriesFromDoc(task);
      const blockIds = entries.map((e) => e.blockId);
      const blockSettings: Record<string, unknown> = {};
      for (const blockId of blockIds) {
        if (pipelineSettings[blockId] != null) {
          blockSettings[blockId] = pipelineSettings[blockId];
        }
      }
      const passwordProtected = Boolean(
        task.accessPasswordHash?.trim() && task.accessPasswordSalt?.trim(),
      );
      const blockPrefill = passwordProtected
        ? {}
        : portalBlockPrefillForTask(blockIds, dealPayload, task);
      const clientTemplates: Array<{
        fileName: string;
        mimeType: string;
        size: number;
        url: string;
      }> = [];
      for (const att of task.clientTemplateAttachments ?? []) {
        const url = await ctx.storage.getUrl(att.storageId);
        if (!url) continue;
        clientTemplates.push({
          fileName: att.fileName,
          mimeType: att.mimeType,
          size: att.size,
          url,
        });
      }
      tasks.push(
        portalPublicTaskRow(
          task,
          entries,
          blockIds,
          blockSettings,
          blockPrefill,
          clientTemplates,
        ),
      );
    };

    for (const taskId of scopedTaskIds) {
      const task = await ctx.db.get(taskId);
      if (!task || task.isArchived || !task.isPortalVisible) continue;
      await pushTask(task);
    }

    if (tasks.length === 0 && scopedTaskIds.length > 0) {
      for (const taskId of scopedTaskIds) {
        const task = await ctx.db.get(taskId);
        if (!task) continue;
        await pushTask(task);
      }
    }

    return {
      status: "ok" as const,
      readOnlyPreview: row.readOnlyPreview === true,
      brokerAgentCapable: row.brokerAgentCapable === true,
      companySlug: auth.link?.companySlug,
      workspaceName,
      fileLabel,
      mode: row.mode,
      tasks,
    };
  },
});

/**
 * Ensure an exclusive block_assignment vault task for one atomic block, then
 * issue a selective client-portal bundle registered in `clientPortalLinks`
 * with linkKind `block_fill`. Client sees only that task / block.
 */
export const issueBlockFillLink = mutation({
  args: {
    pipelineFileId: v.id("pipeline"),
    blockId: v.string(),
    assignedContactId: v.optional(v.id("contacts")),
    title: v.optional(v.string()),
    ...memberKeyArg,
  },
  handler: async (ctx, args) => {
    const pipeline = await ctx.db.get(args.pipelineFileId);
    if (!pipeline) throw new Error("Pipeline file not found.");
    await assertCanMutatePipelineRow(ctx, pipeline, args.memberUserKey);

    if (args.assignedContactId) {
      const contact = await ctx.db.get(args.assignedContactId);
      if (!contact) throw new Error("Contact not found.");
    }

    const ensured = await ensureExclusiveBlockAssignmentTask(ctx, {
      pipelineFileId: args.pipelineFileId,
      blockId: args.blockId,
      memberUserKey: args.memberUserKey,
      assignedContactId: args.assignedContactId,
      title: args.title,
    });

    const task = await ctx.db.get(ensured.fileTaskId);
    if (!task || task.isArchived || !task.isPortalVisible) {
      throw new Error("Block vault task is not available for a client link.");
    }

    const now = Date.now();
    const plainToken = randomHex(24);
    const tokenHash = await sha256Hex(plainToken);
    const key = args.memberUserKey?.trim() || "__system__";
    const companySlug = await resolveCompanySlugForPipeline(ctx, pipeline);
    const linkTitle =
      args.title?.trim() ||
      `Client fill: ${clientPortalBlockLabel(ensured.blockId)}`;

    const bundleId = await ctx.db.insert("documentVaultClientBundleTokens", {
      pipelineFileId: args.pipelineFileId,
      fileTaskIds: [ensured.fileTaskId],
      tokenHash,
      status: "active",
      mode: "selective",
      readOnlyPreview: false,
      brokerAgentCapable: false,
      expiresAt: now + BUNDLE_TTL_MS,
      createdByUserKey: key,
      createdAt: now,
    });

    await registerClientPortalLink(ctx, {
      pipelineFileId: args.pipelineFileId,
      organizationId: pipeline.organizationId,
      bundleTokenId: bundleId,
      companySlug,
      tokenHash,
      title: linkTitle,
      linkKind: "block_fill",
      expiresAt: now + BUNDLE_TTL_MS,
      createdByUserKey: key,
      createdAt: now,
      targetName: clientPortalBlockLabel(ensured.blockId),
      issuedUrl: portalUrlForSlug(companySlug, plainToken),
    });

    return {
      ok: true as const,
      portalUrl: portalUrlForSlug(companySlug, plainToken),
      companySlug,
      token: plainToken,
      fileTaskId: ensured.fileTaskId,
      taskCreated: ensured.created,
      blockId: ensured.blockId,
      expiresAt: now + BUNDLE_TTL_MS,
    };
  },
});

export const issueBundleToken = mutation({
  args: {
    pipelineFileId: v.id("pipeline"),
    mode: v.union(v.literal("all_outstanding"), v.literal("selective")),
    fileTaskIds: v.optional(v.array(v.id("documentVaultFileTasks"))),
    ...memberKeyArg,
  },
  handler: async (ctx, { pipelineFileId, mode, fileTaskIds, memberUserKey }) => {
    const pipeline = await ctx.db.get(pipelineFileId);
    if (!pipeline) throw new Error("Pipeline file not found.");
    await assertCanMutatePipelineRow(ctx, pipeline, memberUserKey);

    const allTasks = await ctx.db
      .query("documentVaultFileTasks")
      .withIndex("by_pipeline_sort", (q) => q.eq("pipelineFileId", pipelineFileId))
      .collect();

    let selected: Id<"documentVaultFileTasks">[];
    if (mode === "all_outstanding") {
      selected = allTasks
        .filter(isOutstanding)
        .filter((t) => t.isPortalVisible)
        .map((t) => t._id);
    } else {
      const set = new Set((fileTaskIds ?? []).map(String));
      selected = allTasks
        .filter((t) => set.has(String(t._id)) && !t.isArchived && t.isPortalVisible)
        .map((t) => t._id);
    }

    if (selected.length === 0) {
      throw new Error("No eligible file tasks for this link.");
    }

    const now = Date.now();
    const plainToken = randomHex(24);
    const tokenHash = await sha256Hex(plainToken);
    const key = memberUserKey?.trim() || "__system__";
    const companySlug = await resolveCompanySlugForPipeline(ctx, pipeline);

    const bundleId = await ctx.db.insert("documentVaultClientBundleTokens", {
      pipelineFileId,
      fileTaskIds: selected,
      tokenHash,
      status: "active",
      mode,
      readOnlyPreview: false,
      brokerAgentCapable: false,
      expiresAt: now + BUNDLE_TTL_MS,
      createdByUserKey: key,
      createdAt: now,
    });

    const portalUrl = portalUrlForSlug(companySlug, plainToken);
    const taskItems = selected.map((id) => {
      const task = allTasks.find((t) => t._id === id);
      return clientLinkEmailItemFromFileTask({
        title: task?.title,
        description: task?.description,
        clientInstructionText: task?.clientInstructionText,
        instructionUrl: task?.instructionUrl,
        clientTemplateAttachments: task?.clientTemplateAttachments,
      });
    });
    const taskTitles = taskItems.map((item) => item.title);

    await registerClientPortalLink(ctx, {
      pipelineFileId,
      organizationId: pipeline.organizationId,
      bundleTokenId: bundleId,
      companySlug,
      tokenHash,
      title: pipeline.fileName?.trim() || "Client portal",
      linkKind: "client_invite",
      expiresAt: now + BUNDLE_TTL_MS,
      createdByUserKey: key,
      createdAt: now,
      issuedUrl: portalUrl,
    });

    return {
      ok: true as const,
      portalUrl,
      companySlug,
      token: plainToken,
      fileTaskCount: selected.length,
      taskTitles,
      taskItems,
      expiresAt: now + BUNDLE_TTL_MS,
    };
  },
});

export const issueViewAsClientPreview = mutation({
  args: {
    pipelineFileId: v.id("pipeline"),
    writeMode: v.optional(v.boolean()),
    ...memberKeyArg,
  },
  handler: async (ctx, { pipelineFileId, writeMode, memberUserKey }) => {
    try {
      const pipeline = await ctx.db.get(pipelineFileId);
      if (!pipeline) {
        return {
          ok: false as const,
          code: "not_found" as const,
          message: "Pipeline file not found.",
        };
      }

      await assertCanReadPipelineRow(ctx, pipeline, memberUserKey);

      const allTasks = await ctx.db
        .query("documentVaultFileTasks")
        .withIndex("by_pipeline_sort", (q) =>
          q.eq("pipelineFileId", pipelineFileId),
        )
        .collect();

      const portalVisible = allTasks.filter(
        (t) => !t.isArchived && t.isPortalVisible,
      );
      const selected = portalVisible.map((t) => t._id);

      if (selected.length === 0) {
        return {
          ok: false as const,
          code: "no_portal_tasks" as const,
          message:
            "No portal-visible file tasks. Enable “Visible” on at least one active file task to preview the client portal.",
        };
      }

      const now = Date.now();
      const plainToken = randomHex(24);
      const tokenHash = await sha256Hex(plainToken);
      const key = memberUserKey?.trim() || "__system__";
      const companySlug = await resolveCompanySlugForPipeline(ctx, pipeline);
      const agentWrite = writeMode === true;

      const bundleId = await ctx.db.insert("documentVaultClientBundleTokens", {
        pipelineFileId,
        fileTaskIds: selected,
        tokenHash,
        status: "active",
        mode: "all_outstanding",
        readOnlyPreview: !agentWrite,
        brokerAgentCapable: true,
        expiresAt: now + PREVIEW_TTL_MS,
        createdByUserKey: key,
        createdAt: now,
      });

      const previewUrl = portalUrlForSlug(companySlug, plainToken);
      await registerClientPortalLink(ctx, {
        pipelineFileId,
        organizationId: pipeline.organizationId,
        bundleTokenId: bundleId,
        companySlug,
        tokenHash,
        title: "Broker portal preview",
        linkKind: agentWrite ? "broker_agent" : "broker_preview",
        expiresAt: now + PREVIEW_TTL_MS,
        createdByUserKey: key,
        createdAt: now,
        issuedUrl: previewUrl,
      });

      return {
        ok: true as const,
        token: plainToken,
        companySlug,
        previewUrl,
        expiresAt: now + PREVIEW_TTL_MS,
        taskCount: selected.length,
        writeMode: agentWrite,
      };
    } catch (e) {
      const message =
        e instanceof Error
          ? e.message
          : "Failed to create client preview link.";
      return { ok: false as const, code: "server_error" as const, message };
    }
  },
});

export const sendBundleInvite = mutation({
  args: {
    pipelineFileId: v.id("pipeline"),
    to: v.string(),
    subject: v.string(),
    bodyText: v.string(),
    portalUrl: v.string(),
    clientName: v.optional(v.string()),
    ...memberKeyArg,
  },
  handler: async (ctx, args) => {
    const pipeline = await ctx.db.get(args.pipelineFileId);
    if (!pipeline) throw new Error("Pipeline file not found.");
    await assertCanMutatePipelineRow(ctx, pipeline, args.memberUserKey);

    const org = pipeline.organizationId
      ? await ctx.db.get(pipeline.organizationId)
      : null;
    const workspaceLabel =
      org?.name?.trim() && org.name.trim().length > 0
        ? org.name.trim()
        : "Your lender";

    const clientName = args.clientName?.trim() || "there";
    const renderedSubject = args.subject
      .replace(/\{\{Client_Name\}\}/gi, clientName)
      .replace(/\{\{Upload_Link\}\}/gi, args.portalUrl);
    const renderedBody = args.bodyText
      .replace(/\{\{Client_Name\}\}/gi, clientName)
      .replace(/\{\{Upload_Link\}\}/gi, args.portalUrl);

    await ctx.scheduler.runAfter(0, internal.clientPortalEmails.deliverCustomInvite, {
      to: args.to.trim(),
      subject: renderedSubject,
      bodyText: renderedBody,
      workspaceLabel,
    });

    return { ok: true as const };
  },
});

export const issueTaskUploadTokenForBundle = mutation({
  args: {
    bundleToken: v.string(),
    fileTaskId: v.id("documentVaultFileTasks"),
    accessProof: v.optional(v.string()),
  },
  handler: async (ctx, { bundleToken, fileTaskId, accessProof }) => {
    const auth = await loadBundleByPlain(
      ctx,
      normalizePortalToken(bundleToken),
      undefined,
      accessProof,
    );
    if (!auth.ok) {
      if (auth.reason === "verification_required") {
        throw new Error("Additional verification is required for this portal link.");
      }
      throw new Error(
        auth.reason === "expired"
          ? "This portal link has expired."
          : "This portal link is invalid.",
      );
    }
    if (auth.row.readOnlyPreview) {
      throw new Error("This is a read-only preview link.");
    }
    if (!(await assertBundleTaskInScope(ctx, auth.row, fileTaskId))) {
      throw new Error("Task not included in this portal link.");
    }

    const task = await ctx.db.get(fileTaskId);
    if (!task || task.isArchived || !task.isPortalVisible) {
      throw new Error("File task not available.");
    }

    const now = Date.now();
    const plainToken = randomHex(24);
    const tokenHash = await sha256Hex(plainToken);
    const expiresAt = now + BUNDLE_TTL_MS;

    const existing = await ctx.db
      .query("documentVaultFileTaskUploadTokens")
      .withIndex("by_fileTask", (q) => q.eq("fileTaskId", fileTaskId))
      .collect();
    for (const row of existing) {
      if (row.status === "active") {
        await ctx.db.patch(row._id, { status: "revoked" });
      }
    }

    await ctx.db.insert("documentVaultFileTaskUploadTokens", {
      fileTaskId,
      pipelineFileId: task.pipelineFileId,
      tokenHash,
      status: "active",
      createdByUserKey: "__client_bundle__",
      createdAt: now,
      expiresAt,
      uploadCount: 0,
    });

    const uploadUrl = `${clientPortalPublicOrigin()}/upload/${encodeURIComponent(plainToken)}`;
    return { ok: true as const, uploadUrl };
  },
});

async function authorizeBundleTaskUpload(
  ctx: MutationCtx,
  bundleToken: string,
  fileTaskId: Id<"documentVaultFileTasks">,
  accessProof?: string,
  taskAccessProof?: string,
) {
  const auth = await loadBundleByPlain(
    ctx,
    normalizePortalToken(bundleToken),
    undefined,
    accessProof,
  );
  if (!auth.ok) {
    if (auth.reason === "verification_required") {
      throw new Error("Additional verification is required for this portal link.");
    }
    throw new Error(
      auth.reason === "expired"
        ? "This portal link has expired."
        : "This portal link is invalid.",
    );
  }
  if (auth.row.readOnlyPreview) {
    throw new Error("This is a read-only preview link.");
  }
  if (!(await assertBundleTaskInScope(ctx, auth.row, fileTaskId))) {
    throw new Error("Task not included in this portal link.");
  }
  const task = await ctx.db.get(fileTaskId);
  if (!task || task.isArchived || !task.isPortalVisible) {
    throw new Error("File task not available.");
  }
  if (task.status === "complete") {
    throw new Error("This task is complete and no longer accepts uploads.");
  }
  const passwordGate = await assertFileTaskPasswordAllowed(ctx, {
    task,
    tokenHash: auth.row.tokenHash,
    taskAccessProof,
  });
  if (!passwordGate.ok) {
    throw new Error("This request requires a password.");
  }
  const taskType = resolveTaskTypeFromDoc(task);
  const pipeline = await ctx.db.get(task.pipelineFileId);
  if (!pipeline) throw new Error("Pipeline file not found.");
  return { auth, task, pipeline, taskType };
}

function assertTaskAllowsUpload(
  taskType: ReturnType<typeof resolveTaskTypeFromDoc>,
): void {
  if (taskType === "client_instruction" || taskType === "internal_task") {
    throw new Error("This task does not accept file uploads.");
  }
}

function collectFolderSubtreeIds(
  folders: Doc<"documentFolders">[],
  rootFolderId: Id<"documentFolders">,
): Set<string> {
  const out = new Set<string>([String(rootFolderId)]);
  const queue: Id<"documentFolders">[] = [rootFolderId];
  while (queue.length > 0) {
    const id = queue.pop()!;
    for (const f of folders) {
      if (f.parentFolderId === id) {
        const key = String(f._id);
        if (!out.has(key)) {
          out.add(key);
          queue.push(f._id);
        }
      }
    }
  }
  return out;
}

function collectTaskFolderSubtreeIds(
  folders: Doc<"documentFolders">[],
  fileTaskId: Id<"documentVaultFileTasks">,
): Set<string> {
  const out = new Set<string>();
  const roots = folders.filter((f) => f.fileTaskId === fileTaskId);
  for (const root of roots) {
    for (const id of collectFolderSubtreeIds(folders, root._id)) {
      out.add(id);
    }
  }
  return out;
}

async function assertFolderBelongsToTask(
  ctx: MutationCtx,
  folderId: Id<"documentFolders">,
  task: Doc<"documentVaultFileTasks">,
): Promise<Doc<"documentFolders">> {
  const folder = await ctx.db.get(folderId);
  if (!folder || folder.pipelineFileId !== task.pipelineFileId) {
    throw new Error("Invalid folder for this upload.");
  }
  const allFolders = await ctx.db
    .query("documentFolders")
    .withIndex("by_pipeline", (q) => q.eq("pipelineFileId", task.pipelineFileId))
    .collect();
  const subtree = collectTaskFolderSubtreeIds(allFolders, task._id);
  if (!subtree.has(String(folderId))) {
    throw new Error("This folder is not part of the document request.");
  }
  return folder;
}

/** Token-authorized nested folder tree + uploaded docs for client portal dropzones. */
export const getBundleTaskUploadTree = query({
  args: {
    bundleToken: v.string(),
    fileTaskId: v.id("documentVaultFileTasks"),
    accessProof: v.optional(v.string()),
  },
  handler: async (ctx, { bundleToken, fileTaskId, accessProof }) => {
    const auth = await loadBundleByPlain(
      ctx,
      normalizePortalToken(bundleToken),
      undefined,
      accessProof,
    );
    if (!auth.ok) {
      return { status: auth.reason } as const;
    }
    if (!(await assertBundleTaskInScope(ctx, auth.row, fileTaskId))) {
      return { status: "unauthorized" as const };
    }

    const task = await ctx.db.get(fileTaskId);
    if (!task || task.isArchived) {
      return { status: "not_found" as const };
    }

    const allFolders = await ctx.db
      .query("documentFolders")
      .withIndex("by_pipeline", (q) => q.eq("pipelineFileId", task.pipelineFileId))
      .collect();
    const taskSubtree = collectTaskFolderSubtreeIds(allFolders, task._id);
    const folders = allFolders
      .filter((f) => taskSubtree.has(String(f._id)))
      .map((f) => ({
        _id: f._id,
        name: f.name,
        parentFolderId: f.parentFolderId,
        fileTaskId: f.fileTaskId,
        sortOrder: f.sortOrder,
      }));

    const links = await ctx.db
      .query("libraryDocumentLinks")
      .withIndex("by_pipeline_linkedAt", (q) =>
        q.eq("pipelineFileId", task.pipelineFileId),
      )
      .collect();

    const documents: {
      documentId: Id<"libraryDocuments">;
      title: string;
      fileName?: string;
      folderId?: Id<"documentFolders">;
    }[] = [];

    for (const link of links) {
      const inTaskRoot =
        link.fileTaskId != null &&
        String(link.fileTaskId) === String(task._id) &&
        !link.folderId;
      const inTaskFolder =
        link.folderId != null && taskSubtree.has(String(link.folderId));
      if (!inTaskRoot && !inTaskFolder) continue;

      const doc = await ctx.db.get(link.documentId);
      if (!doc) continue;
      documents.push({
        documentId: doc._id,
        title: doc.title,
        fileName: vaultDocumentOutboundFileName(doc),
        folderId: link.folderId,
      });
    }

    return {
      status: "ok" as const,
      folders,
      documents,
      taskStatus: task.status,
    };
  },
});

export const markClientInstructionComplete = mutation({
  args: {
    bundleToken: v.string(),
    fileTaskId: v.id("documentVaultFileTasks"),
    accessProof: v.optional(v.string()),
  },
  handler: async (ctx, { bundleToken, fileTaskId, accessProof }) => {
    const { task, taskType } = await authorizeBundleTaskUpload(
      ctx,
      bundleToken,
      fileTaskId,
      accessProof,
    );
    if (taskType !== "client_instruction") {
      throw new Error("This task is not a client instruction.");
    }
    const now = Date.now();
    await ctx.db.patch(task._id, {
      status: "complete",
      updatedAt: now,
    });
    return { ok: true as const, status: "complete" as const };
  },
});

export const generateBundleUploadUrl = mutation({
  args: {
    bundleToken: v.string(),
    fileTaskId: v.id("documentVaultFileTasks"),
    accessProof: v.optional(v.string()),
    taskAccessProof: v.optional(v.string()),
  },
  handler: async (ctx, { bundleToken, fileTaskId, accessProof, taskAccessProof }) => {
    const { taskType } = await authorizeBundleTaskUpload(
      ctx,
      bundleToken,
      fileTaskId,
      accessProof,
      taskAccessProof,
    );
    assertTaskAllowsUpload(taskType);
    return await ctx.storage.generateUploadUrl();
  },
});

export const ingestBundleUpload = mutation({
  args: {
    bundleToken: v.string(),
    fileTaskId: v.id("documentVaultFileTasks"),
    folderId: v.optional(v.id("documentFolders")),
    storageId: v.id("_storage"),
    fileName: v.string(),
    contentType: v.optional(v.string()),
    size: v.optional(v.number()),
    accessProof: v.optional(v.string()),
    taskAccessProof: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { task, pipeline, taskType } = await authorizeBundleTaskUpload(
      ctx,
      args.bundleToken,
      args.fileTaskId,
      args.accessProof,
      args.taskAccessProof,
    );
    assertTaskAllowsUpload(taskType);

    let targetFolderId: Id<"documentFolders"> | undefined;
    if (args.folderId) {
      await assertFolderBelongsToTask(ctx, args.folderId, task);
      targetFolderId = args.folderId;
    }

    const byteSize = args.size ?? 0;
    if (typeof byteSize === "number" && byteSize > MAX_UPLOAD_BYTES) {
      try {
        await ctx.storage.delete(args.storageId);
      } catch {
        /* best effort */
      }
      throw new Error("File is too large (max 25 MB).");
    }

    const meta = await ctx.storage.getMetadata(args.storageId);
    if (!meta) {
      throw new Error("Upload not found. Try again.");
    }

    const safeName = safeFileName(args.fileName);
    const now = Date.now();
    const title = titleFromVaultFileName(safeName);

    const docId = await ctx.db.insert("libraryDocuments", {
      organizationId: pipeline.organizationId,
      title,
      createdByUserKey: "__client_bundle__",
      latestVersionNumber: 0,
      createdAt: now,
      updatedAt: now,
    });

    await ctx.db.insert("libraryDocumentLinks", {
      documentId: docId,
      pipelineFileId: task.pipelineFileId,
      fileTaskId: task._id,
      ...(targetFolderId ? { folderId: targetFolderId } : {}),
      isSharedWithClient: task.isPortalVisible,
      linkedAt: now,
      linkedByUserKey: "__client_bundle__",
    });

    const versionId = await ctx.db.insert("libraryDocumentVersions", {
      documentId: docId,
      version: 1,
      storageId: args.storageId,
      fileName: safeName,
      contentType: args.contentType || meta.contentType || undefined,
      size: args.size ?? meta.size,
      uploadedByUserKey: "__client_bundle__",
      uploadedAt: now,
    });

    await ctx.db.patch(docId, {
      latestVersionNumber: 1,
      latestVersionId: versionId,
      latestFileName: safeName,
      latestContentType: args.contentType || meta.contentType || undefined,
      latestSize: args.size ?? meta.size,
      latestUploadedAt: now,
      updatedAt: now,
    });

    if (task.status === "incomplete") {
      await ctx.db.patch(task._id, {
        status: "pending_review",
        rejectionNote: undefined,
        updatedAt: now,
      });
    }

    await recordClientVaultUpload(ctx, {
      pipeline,
      task,
      fileName: safeName,
      documentId: docId,
    });

    let folderName = "Root";
    if (targetFolderId) {
      const folder = await ctx.db.get(targetFolderId);
      if (folder?.name?.trim()) folderName = folder.name.trim();
    }

    const dealName = pipelineDealName(pipeline);
    await scheduleWebhookQueueEvent(ctx, {
      organizationId: pipeline.organizationId,
      event: "client_document_uploaded",
      data: {
        ...webhookVaultContext(pipeline._id, dealName),
        folderName,
        fileName: safeName,
        fileTaskId: String(task._id),
        documentId: String(docId),
      },
    });

    return {
      ok: true as const,
      documentId: docId,
      title,
      folderId: targetFolderId,
      status: "pending_review" as const,
    };
  },
});

export const submitClientBlockFromBundle = mutation({
  args: {
    bundleToken: v.string(),
    fileTaskId: v.id("documentVaultFileTasks"),
    blockId: v.string(),
    formData: v.any(),
    accessProof: v.optional(v.string()),
    taskAccessProof: v.optional(v.string()),
  },
  handler: async (ctx, { bundleToken, fileTaskId, blockId, formData, accessProof, taskAccessProof }) => {
    const { task, pipeline } = await authorizeBundleTaskUpload(
      ctx,
      bundleToken,
      fileTaskId,
      accessProof,
      taskAccessProof,
    );
    const trimmedBlock = blockId.trim();
    if (!trimmedBlock) throw new Error("Block id is required.");
    const assigned = normalizeAssignedBlockEntriesFromDoc(task);
    const assignedIds = new Set(assigned.map((e) => e.blockId));
    const submitAtoms = isAtomicPortalBlockId(trimmedBlock)
      ? [trimmedBlock]
      : normalizeToAtomicBlockIds(trimmedBlock, true);
    if (!submitAtoms.some((id) => assignedIds.has(id))) {
      throw new Error("This block is not assigned to the task.");
    }
    const atomicBlockId = submitAtoms[0]!;

    if (!isClientEditableAtomicBlock(atomicBlockId)) {
      throw new Error(
        `The block "${getAtomicPortalBlock(atomicBlockId).label}" is not editable in the client portal.`,
      );
    }

    validateClientPortalFormData(atomicBlockId, formData);

    const dealPayload = embeddedDealPayloadIsSubstantive(pipeline.dealData)
      ? (pipeline.dealData as Record<string, unknown>)
      : {};
    const priorSlice = isAtomicPortalBlockId(atomicBlockId)
      ? extractDealSnapshotSlice(dealPayload, atomicBlockId, { fileTask: task })
      : null;

    await snapshotBlockSettings(ctx, {
      pipelineFileId: pipeline._id,
      blockId: atomicBlockId,
      fileTaskId: task._id,
      snapshotData: priorSlice ?? null,
      source: "client_submission",
      createdByUserKey: "__client_bundle__",
      label: "Before client form submission",
    });

    if (isClientPortalAssignableBlock(atomicBlockId)) {
      await hydrateLivePipelineBlockFromClientSubmission(
        ctx,
        pipeline,
        atomicBlockId,
        formData,
        task,
      );
    }

    const now = Date.now();
    const layout = pipeline.fileDrawerLayout ?? {
      v: 1 as const,
      order: [],
      hidden: [],
    };
    const settings = { ...(layout.settings ?? {}) };
    const prior = settings[atomicBlockId];

    settings[atomicBlockId] = {
      ...(typeof prior === "object" && prior != null ? prior : {}),
      clientPortalSubmission: {
        ...(typeof formData === "object" && formData != null ? formData : {
          notes: String(formData ?? ""),
        }),
        submittedAt: now,
        submittedViaFileTaskId: fileTaskId,
      },
    };

    await ctx.db.patch(pipeline._id, {
      fileDrawerLayout: { ...layout, settings },
      updatedAt: now,
    });

    const wasIncomplete = task.status === "incomplete";
    await ctx.db.patch(task._id, {
      status: "pending_review",
      rejectionNote: undefined,
      updatedAt: now,
    });
    if (wasIncomplete) {
      await recordClientVaultUpload(ctx, {
        pipeline,
        task,
        fileName: `Form: ${getAtomicPortalBlock(atomicBlockId).label}`,
      });
    }

    return { ok: true as const, status: "pending_review" as const };
  },
});

/**
 * Debounced / on-blur draft persistence — hydrates dealData for live broker sync.
 * Must NOT promote task status (Submit alone moves incomplete → pending_review).
 */
export const autosaveClientBlockDraftFromBundle = mutation({
  args: {
    bundleToken: v.string(),
    fileTaskId: v.id("documentVaultFileTasks"),
    blockId: v.string(),
    formData: v.any(),
    accessProof: v.optional(v.string()),
    taskAccessProof: v.optional(v.string()),
  },
  handler: async (ctx, { bundleToken, fileTaskId, blockId, formData, accessProof, taskAccessProof }) => {
    const { task, pipeline } = await authorizeBundleTaskUpload(
      ctx,
      bundleToken,
      fileTaskId,
      accessProof,
      taskAccessProof,
    );
    const trimmedBlock = blockId.trim();
    if (!trimmedBlock) throw new Error("Block id is required.");
    const assigned = normalizeAssignedBlockEntriesFromDoc(task);
    const assignedIds = new Set(assigned.map((e) => e.blockId));
    const submitAtoms = isAtomicPortalBlockId(trimmedBlock)
      ? [trimmedBlock]
      : normalizeToAtomicBlockIds(trimmedBlock, true);
    if (!submitAtoms.some((id) => assignedIds.has(id))) {
      throw new Error("This block is not assigned to the task.");
    }
    const atomicBlockId = submitAtoms[0]!;

    if (!isClientEditableAtomicBlock(atomicBlockId)) {
      throw new Error(
        `The block "${getAtomicPortalBlock(atomicBlockId).label}" is not editable in the client portal.`,
      );
    }

    if (isClientPortalAssignableBlock(atomicBlockId)) {
      await hydrateLivePipelineBlockFromClientSubmission(
        ctx,
        pipeline,
        atomicBlockId,
        formData,
        task,
      );
    }

    const now = Date.now();
    const refreshed = await ctx.db.get(pipeline._id);
    if (refreshed) {
      await ctx.db.patch(refreshed._id, { updatedAt: now });
    }

    return {
      ok: true as const,
      pipelineUpdatedAt: now,
      /** Unchanged by autosave — draft stays incomplete until explicit Submit. */
      taskStatus: task.status,
    };
  },
});
