import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import {
  assertCanMutatePipelineRow,
} from "./organizationAccess";
import { assertOrganizationId } from "./organizationValidators";
import {
  requireOrgReaderKey,
  requireOrgMemberKey,
} from "./authUtils";
import { seedDocumentTaskTemplatesForOrg } from "./documentTaskTemplateSeed";
import {
  assignedBlockEntryV,
  fileTaskPriorityV,
  fileTaskTypeV,
  persistAssignedBlocksPatch,
} from "./documentVaultTaskTypes";

const memberKeyArg = { memberUserKey: v.optional(v.string()) };

const folderTemplateRowV = v.object({
  name: v.string(),
  depth: v.number(),
  sortOrder: v.number(),
});

type FolderTemplateRow = {
  name: string;
  depth: number;
  sortOrder: number;
};

type FolderTemplateNode = {
  name: string;
  sortOrder: number;
  children?: FolderTemplateNode[];
};

function validateTemplateTaskConfig(args: {
  taskType?: Doc<"documentTaskTemplates">["taskType"];
  clientInstructionText?: string;
  instructionUrl?: string;
  assignedBlockEntries?: { blockId: string; sortOrder: number }[];
}): void {
  const taskType = args.taskType ?? "document_upload";
  if (taskType === "client_instruction") {
    const text = args.clientInstructionText?.trim() ?? "";
    const url = args.instructionUrl?.trim() ?? "";
    if (!text && !url) {
      throw new Error("Add instruction text or a website link.");
    }
  }
  if (taskType === "block_assignment") {
    const count = args.assignedBlockEntries?.length ?? 0;
    if (count === 0) {
      throw new Error("Select at least one pipeline block.");
    }
  }
}

function normalizeFolderTemplateRows(
  rows: FolderTemplateRow[] | undefined,
): FolderTemplateRow[] {
  if (!rows?.length) return [];
  return rows
    .map((row, index) => ({
      name: row.name.trim().slice(0, 200),
      depth: Math.max(0, Math.min(12, Math.floor(row.depth))),
      sortOrder:
        typeof row.sortOrder === "number" && Number.isFinite(row.sortOrder)
          ? row.sortOrder
          : (index + 1) * 1000,
    }))
    .filter((row) => row.name.length > 0);
}

function folderRowsToTree(rows: FolderTemplateRow[]): FolderTemplateNode[] {
  const sorted = [...rows].sort((a, b) => a.sortOrder - b.sortOrder);
  const roots: FolderTemplateNode[] = [];
  const stack: { depth: number; node: FolderTemplateNode }[] = [];
  for (const row of sorted) {
    const node: FolderTemplateNode = {
      name: row.name,
      sortOrder: row.sortOrder,
    };
    while (stack.length > 0 && stack[stack.length - 1]!.depth >= row.depth) {
      stack.pop();
    }
    if (stack.length === 0) {
      roots.push(node);
    } else {
      const parent = stack[stack.length - 1]!.node;
      parent.children = [...(parent.children ?? []), node];
    }
    stack.push({ depth: row.depth, node });
  }
  return roots;
}

async function createFoldersFromTemplateTree(
  ctx: MutationCtx,
  pipelineFileId: Id<"pipeline">,
  fileTaskId: Id<"documentVaultFileTasks">,
  nodes: FolderTemplateNode[],
  parentFolderId: Id<"documentFolders"> | null,
  sortBase: number,
): Promise<void> {
  let sortOrder = sortBase;
  const now = Date.now();
  for (const node of nodes) {
    const folderId = await ctx.db.insert("documentFolders", {
      name: node.name.trim().slice(0, 200),
      pipelineFileId,
      fileTaskId,
      ...(parentFolderId != null ? { parentFolderId } : {}),
      sortOrder,
      createdAt: now,
      updatedAt: now,
    });
    sortOrder += 1000;
    if (node.children?.length) {
      await createFoldersFromTemplateTree(
        ctx,
        pipelineFileId,
        fileTaskId,
        node.children,
        folderId,
        1000,
      );
    }
  }
}

const orgArgs = {
  organizationId: v.id("organizations"),
  ...memberKeyArg,
};

async function requireOrgReader(
  ctx: QueryCtx,
  organizationId: Id<"organizations">,
  memberUserKey?: string,
) {
  await assertOrganizationId(ctx, organizationId);
  return requireOrgReaderKey(
    ctx,
    organizationId,
    memberUserKey,
    "documentTaskTemplates.requireOrgReader",
  );
}

async function requireOrgFilesEditor(
  ctx: MutationCtx,
  organizationId: Id<"organizations">,
  memberUserKey?: string,
) {
  await assertOrganizationId(ctx, organizationId);
  return requireOrgMemberKey(ctx, organizationId, memberUserKey, {
    permission: "files.edit",
    stage: "documentTaskTemplates.requireOrgFilesEditor",
  });
}

async function nextStackSortOrder(
  ctx: MutationCtx,
  organizationId: Id<"organizations">,
): Promise<number> {
  const rows = await ctx.db
    .query("documentTaskTemplateStacks")
    .withIndex("by_org", (q) => q.eq("organizationId", organizationId))
    .collect();
  return rows.reduce((acc, r) => Math.max(acc, r.sortOrder), 0) + 1000;
}

async function nextTemplateSortOrder(
  ctx: MutationCtx,
  organizationId: Id<"organizations">,
  stackId?: Id<"documentTaskTemplateStacks">,
): Promise<number> {
  const rows = stackId
    ? await ctx.db
        .query("documentTaskTemplates")
        .withIndex("by_stack", (q) => q.eq("stackId", stackId))
        .collect()
    : await ctx.db
        .query("documentTaskTemplates")
        .withIndex("by_org", (q) => q.eq("organizationId", organizationId))
        .collect();
  const scoped = stackId
    ? rows
    : rows.filter((r) => !r.stackId);
  return scoped.reduce((acc, r) => Math.max(acc, r.sortOrder), 0) + 1000;
}

export const listStacksWithTemplates = query({
  args: {
    organizationId: v.id("organizations"),
    ...memberKeyArg,
  },
  handler: async (ctx, { organizationId, memberUserKey }) => {
    await requireOrgReader(ctx, organizationId, memberUserKey);
    const stacks = await ctx.db
      .query("documentTaskTemplateStacks")
      .withIndex("by_org", (q) => q.eq("organizationId", organizationId))
      .collect();
    stacks.sort((a, b) => a.sortOrder - b.sortOrder);

    const out = [];
    for (const stack of stacks) {
      const templates = await ctx.db
        .query("documentTaskTemplates")
        .withIndex("by_stack", (q) => q.eq("stackId", stack._id))
        .collect();
      templates.sort((a, b) => a.sortOrder - b.sortOrder);
      out.push({ ...stack, templates });
    }

    const loose = await ctx.db
      .query("documentTaskTemplates")
      .withIndex("by_org", (q) => q.eq("organizationId", organizationId))
      .collect();
    const individual = loose
      .filter((t) => !t.stackId)
      .sort((a, b) => a.sortOrder - b.sortOrder);

    return { stacks: out, individualTemplates: individual };
  },
});

export const seedStarterTemplates = mutation({
  args: {
    organizationId: v.id("organizations"),
    ...memberKeyArg,
  },
  handler: async (ctx, { organizationId, memberUserKey }) => {
    const key = await requireOrgFilesEditor(ctx, organizationId, memberUserKey);
    return await seedDocumentTaskTemplatesForOrg(ctx, organizationId, key);
  },
});

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function normalizeDueOffsetDays(value: number | undefined | null): number | undefined {
  if (value == null || !Number.isFinite(value)) return undefined;
  const days = Math.floor(value);
  if (days <= 0) return undefined;
  return Math.min(days, 3650);
}

function resolveTemplateDueDate(
  template: Doc<"documentTaskTemplates">,
  appliedAt: number,
): number | undefined {
  const offset = normalizeDueOffsetDays(template.dueOffsetDays);
  if (offset != null) return appliedAt + offset * MS_PER_DAY;
  if (template.dueDate != null && Number.isFinite(template.dueDate)) {
    return template.dueDate;
  }
  return undefined;
}

async function nextFileTaskSortOrder(
  ctx: MutationCtx,
  pipelineFileId: Id<"pipeline">,
): Promise<number> {
  const rows = await ctx.db
    .query("documentVaultFileTasks")
    .withIndex("by_pipeline_sort", (q) => q.eq("pipelineFileId", pipelineFileId))
    .collect();
  return rows.reduce((acc, r) => Math.max(acc, r.sortOrder), 0) + 1000;
}

export const injectTemplates = mutation({
  args: {
    pipelineFileId: v.id("pipeline"),
    stackIds: v.optional(v.array(v.id("documentTaskTemplateStacks"))),
    templateIds: v.optional(v.array(v.id("documentTaskTemplates"))),
    ...memberKeyArg,
  },
  handler: async (ctx, { pipelineFileId, stackIds, templateIds, memberUserKey }) => {
    const pipeline = await ctx.db.get(pipelineFileId);
    if (!pipeline) throw new Error("Pipeline file not found.");
    await assertCanMutatePipelineRow(ctx, pipeline, memberUserKey);

    if (pipeline.organizationId) {
      const key = memberUserKey?.trim() || "__system__";
      await seedDocumentTaskTemplatesForOrg(ctx, pipeline.organizationId, key);
    }

    const templatesToInject: Doc<"documentTaskTemplates">[] = [];
    const seen = new Set<string>();

    for (const stackId of stackIds ?? []) {
      const rows = await ctx.db
        .query("documentTaskTemplates")
        .withIndex("by_stack", (q) => q.eq("stackId", stackId))
        .collect();
      rows.sort((a, b) => a.sortOrder - b.sortOrder);
      for (const row of rows) {
        if (!seen.has(String(row._id))) {
          seen.add(String(row._id));
          templatesToInject.push(row);
        }
      }
    }

    for (const templateId of templateIds ?? []) {
      if (seen.has(String(templateId))) continue;
      const row = await ctx.db.get(templateId);
      if (row) {
        seen.add(String(templateId));
        templatesToInject.push(row);
      }
    }

    if (templatesToInject.length === 0) {
      throw new Error("Select at least one template or stack.");
    }

    const key = memberUserKey?.trim() || "__system__";
    const now = Date.now();
    let sortOrder = await nextFileTaskSortOrder(ctx, pipelineFileId);
    const createdIds: Id<"documentVaultFileTasks">[] = [];

    for (const template of templatesToInject) {
      const taskType = template.taskType ?? "document_upload";
      const id = await ctx.db.insert("documentVaultFileTasks", {
        pipelineFileId,
        title: template.title,
        description: template.description,
        sortOrder,
        status: "incomplete",
        taskType,
        clientInstructionText:
          taskType === "client_instruction"
            ? template.clientInstructionText
            : undefined,
        instructionUrl:
          taskType === "client_instruction" ? template.instructionUrl : undefined,
        isRequired: template.isRequired,
        isPortalVisible:
          taskType === "internal_task" ? false : template.isPortalVisible,
        dueDate: resolveTemplateDueDate(template, now),
        priority: template.priority,
        assignedBlockEntries:
          taskType === "block_assignment"
            ? template.assignedBlockEntries
            : undefined,
        assignedBlocks:
          taskType === "block_assignment" ? template.assignedBlocks : undefined,
        isArchived: false,
        createdByUserKey: key,
        createdAt: now,
        updatedAt: now,
      });
      createdIds.push(id);

      const folderRows = normalizeFolderTemplateRows(template.folderTemplate);
      if (
        folderRows.length > 0 &&
        (template.taskType ?? "document_upload") === "document_upload"
      ) {
        const tree = folderRowsToTree(folderRows);
        await createFoldersFromTemplateTree(
          ctx,
          pipelineFileId,
          id,
          tree,
          null,
          1000,
        );
      }

      sortOrder += 1000;
    }

    return { ok: true as const, created: createdIds.length, fileTaskIds: createdIds };
  },
});

export const createTemplateStack = mutation({
  args: {
    ...orgArgs,
    name: v.string(),
    description: v.optional(v.string()),
  },
  handler: async (ctx, { organizationId, memberUserKey, name, description }) => {
    const key = await requireOrgFilesEditor(ctx, organizationId, memberUserKey);
    const trimmed = name.trim();
    if (!trimmed) throw new Error("Stack name is required.");
    const now = Date.now();
    const sortOrder = await nextStackSortOrder(ctx, organizationId);
    const id = await ctx.db.insert("documentTaskTemplateStacks", {
      organizationId,
      name: trimmed,
      description: description?.trim() || undefined,
      sortOrder,
      createdByUserKey: key,
      createdAt: now,
      updatedAt: now,
    });
    return { ok: true as const, stackId: id };
  },
});

export const updateTemplateStack = mutation({
  args: {
    ...orgArgs,
    stackId: v.id("documentTaskTemplateStacks"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
  },
  handler: async (ctx, { organizationId, memberUserKey, stackId, name, description }) => {
    await requireOrgFilesEditor(ctx, organizationId, memberUserKey);
    const stack = await ctx.db.get(stackId);
    if (!stack || stack.organizationId !== organizationId) {
      throw new Error("Template stack not found.");
    }
    const patch: Partial<Doc<"documentTaskTemplateStacks">> = {
      updatedAt: Date.now(),
    };
    if (name !== undefined) {
      const trimmed = name.trim();
      if (!trimmed) throw new Error("Stack name cannot be empty.");
      patch.name = trimmed;
    }
    if (description !== undefined) {
      patch.description = description.trim() || undefined;
    }
    await ctx.db.patch(stackId, patch);
    return { ok: true as const };
  },
});

export const deleteTemplateStack = mutation({
  args: {
    ...orgArgs,
    stackId: v.id("documentTaskTemplateStacks"),
  },
  handler: async (ctx, { organizationId, memberUserKey, stackId }) => {
    await requireOrgFilesEditor(ctx, organizationId, memberUserKey);
    const stack = await ctx.db.get(stackId);
    if (!stack || stack.organizationId !== organizationId) {
      throw new Error("Template stack not found.");
    }
    const templates = await ctx.db
      .query("documentTaskTemplates")
      .withIndex("by_stack", (q) => q.eq("stackId", stackId))
      .collect();
    for (const tpl of templates) {
      await ctx.db.delete(tpl._id);
    }
    await ctx.db.delete(stackId);
    return { ok: true as const, deletedTemplates: templates.length };
  },
});

export const createTemplate = mutation({
  args: {
    ...orgArgs,
    title: v.string(),
    description: v.optional(v.string()),
    isRequired: v.boolean(),
    isPortalVisible: v.boolean(),
    dueDate: v.optional(v.number()),
    dueOffsetDays: v.optional(v.number()),
    priority: v.optional(fileTaskPriorityV),
    taskType: v.optional(fileTaskTypeV),
    clientInstructionText: v.optional(v.string()),
    instructionUrl: v.optional(v.string()),
    assignedBlockEntries: v.optional(v.array(assignedBlockEntryV)),
    assignedBlocks: v.optional(v.array(v.string())),
    folderTemplate: v.optional(v.array(folderTemplateRowV)),
    stackId: v.optional(v.id("documentTaskTemplateStacks")),
  },
  handler: async (ctx, args) => {
    const key = await requireOrgFilesEditor(ctx, args.organizationId, args.memberUserKey);
    const trimmed = args.title.trim();
    if (!trimmed) throw new Error("Task title is required.");
    if (args.stackId) {
      const stack = await ctx.db.get(args.stackId);
      if (!stack || stack.organizationId !== args.organizationId) {
        throw new Error("Template stack not found.");
      }
    }
    const now = Date.now();
    const sortOrder = await nextTemplateSortOrder(
      ctx,
      args.organizationId,
      args.stackId,
    );
    const taskType = args.taskType ?? "document_upload";
    const blockPatch =
      taskType === "block_assignment"
        ? persistAssignedBlocksPatch(
            args.assignedBlockEntries ??
              (args.assignedBlocks ?? []).map((blockId, index) => ({
                blockId,
                sortOrder: (index + 1) * 1000,
              })),
          )
        : {
            assignedBlockEntries: undefined,
            assignedBlocks: undefined,
          };
    validateTemplateTaskConfig({
      taskType,
      clientInstructionText: args.clientInstructionText,
      instructionUrl: args.instructionUrl,
      assignedBlockEntries: blockPatch.assignedBlockEntries,
    });
    const folderRows =
      taskType === "document_upload"
        ? normalizeFolderTemplateRows(args.folderTemplate)
        : [];
    const id = await ctx.db.insert("documentTaskTemplates", {
      organizationId: args.organizationId,
      stackId: args.stackId,
      title: trimmed,
      description: args.description?.trim().slice(0, 4000) || undefined,
      taskType,
      clientInstructionText:
        taskType === "client_instruction"
          ? args.clientInstructionText?.trim().slice(0, 8000)
          : undefined,
      instructionUrl:
        taskType === "client_instruction"
          ? args.instructionUrl?.trim().slice(0, 2000) || undefined
          : undefined,
      isRequired: args.isRequired,
      isPortalVisible:
        taskType === "internal_task" ? false : args.isPortalVisible,
      dueOffsetDays: normalizeDueOffsetDays(args.dueOffsetDays),
      priority: args.priority,
      ...blockPatch,
      folderTemplate: folderRows.length > 0 ? folderRows : undefined,
      sortOrder,
      createdByUserKey: key,
      createdAt: now,
      updatedAt: now,
    });
    return { ok: true as const, templateId: id };
  },
});

export const updateTemplate = mutation({
  args: {
    ...orgArgs,
    templateId: v.id("documentTaskTemplates"),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    isRequired: v.optional(v.boolean()),
    isPortalVisible: v.optional(v.boolean()),
    dueDate: v.optional(v.union(v.number(), v.null())),
    dueOffsetDays: v.optional(v.union(v.number(), v.null())),
    priority: v.optional(v.union(fileTaskPriorityV, v.null())),
    taskType: v.optional(fileTaskTypeV),
    clientInstructionText: v.optional(v.string()),
    instructionUrl: v.optional(v.string()),
    assignedBlockEntries: v.optional(v.array(assignedBlockEntryV)),
    assignedBlocks: v.optional(v.array(v.string())),
    folderTemplate: v.optional(v.array(folderTemplateRowV)),
    stackId: v.optional(v.union(v.id("documentTaskTemplateStacks"), v.null())),
  },
  handler: async (ctx, args) => {
    await requireOrgFilesEditor(ctx, args.organizationId, args.memberUserKey);
    const tpl = await ctx.db.get(args.templateId);
    if (!tpl || tpl.organizationId !== args.organizationId) {
      throw new Error("Template not found.");
    }
    const taskType = args.taskType ?? tpl.taskType ?? "document_upload";
    const nextInstructionText =
      args.clientInstructionText !== undefined
        ? args.clientInstructionText.trim().slice(0, 8000) || undefined
        : tpl.clientInstructionText;
    const nextInstructionUrl =
      args.instructionUrl !== undefined
        ? args.instructionUrl.trim().slice(0, 2000) || undefined
        : tpl.instructionUrl;
    const nextBlockEntries =
      args.assignedBlockEntries !== undefined
        ? persistAssignedBlocksPatch(args.assignedBlockEntries).assignedBlockEntries
        : args.assignedBlocks !== undefined
          ? persistAssignedBlocksPatch(
              args.assignedBlocks.map((blockId, index) => ({
                blockId,
                sortOrder: (index + 1) * 1000,
              })),
            ).assignedBlockEntries
          : tpl.assignedBlockEntries;

    validateTemplateTaskConfig({
      taskType,
      clientInstructionText: nextInstructionText,
      instructionUrl: nextInstructionUrl,
      assignedBlockEntries: nextBlockEntries,
    });

    const patch: Partial<Doc<"documentTaskTemplates">> = {
      updatedAt: Date.now(),
    };
    if (args.title !== undefined) {
      const trimmed = args.title.trim();
      if (!trimmed) throw new Error("Task title cannot be empty.");
      patch.title = trimmed;
    }
    if (args.description !== undefined) {
      patch.description = args.description.trim().slice(0, 4000) || undefined;
    }
    if (args.isRequired !== undefined) patch.isRequired = args.isRequired;
    if (args.taskType !== undefined) patch.taskType = args.taskType;
    if (args.isPortalVisible !== undefined) {
      patch.isPortalVisible =
        taskType === "internal_task" ? false : args.isPortalVisible;
    } else if (taskType === "internal_task") {
      patch.isPortalVisible = false;
    }
    if (taskType === "client_instruction") {
      patch.clientInstructionText = nextInstructionText;
      patch.instructionUrl = nextInstructionUrl;
    } else if (args.taskType !== undefined) {
      patch.clientInstructionText = undefined;
      patch.instructionUrl = undefined;
    }
    if (args.dueDate !== undefined) {
      patch.dueDate = args.dueDate === null ? undefined : args.dueDate;
    }
    if (args.dueOffsetDays !== undefined) {
      patch.dueOffsetDays =
        args.dueOffsetDays === null
          ? undefined
          : normalizeDueOffsetDays(args.dueOffsetDays);
      if (args.dueOffsetDays !== null) {
        patch.dueDate = undefined;
      }
    }
    if (args.priority !== undefined) {
      patch.priority = args.priority === null ? undefined : args.priority;
    }
    if (args.assignedBlockEntries !== undefined) {
      Object.assign(patch, persistAssignedBlocksPatch(args.assignedBlockEntries));
    } else if (args.assignedBlocks !== undefined) {
      Object.assign(
        patch,
        persistAssignedBlocksPatch(
          args.assignedBlocks.map((blockId, index) => ({
            blockId,
            sortOrder: (index + 1) * 1000,
          })),
        ),
      );
    }
    if (args.folderTemplate !== undefined) {
      const folderRows = normalizeFolderTemplateRows(args.folderTemplate);
      patch.folderTemplate = folderRows.length > 0 ? folderRows : undefined;
    }
    if (args.stackId !== undefined) {
      if (args.stackId === null) {
        patch.stackId = undefined;
      } else {
        const stack = await ctx.db.get(args.stackId);
        if (!stack || stack.organizationId !== args.organizationId) {
          throw new Error("Template stack not found.");
        }
        patch.stackId = args.stackId;
      }
    }
    await ctx.db.patch(args.templateId, patch);
    return { ok: true as const };
  },
});

export const deleteTemplate = mutation({
  args: {
    ...orgArgs,
    templateId: v.id("documentTaskTemplates"),
  },
  handler: async (ctx, { organizationId, memberUserKey, templateId }) => {
    await requireOrgFilesEditor(ctx, organizationId, memberUserKey);
    const tpl = await ctx.db.get(templateId);
    if (!tpl || tpl.organizationId !== organizationId) {
      throw new Error("Template not found.");
    }
    await ctx.db.delete(templateId);
    return { ok: true as const };
  },
});

export const addTemplateToStack = mutation({
  args: {
    ...orgArgs,
    templateId: v.id("documentTaskTemplates"),
    stackId: v.id("documentTaskTemplateStacks"),
  },
  handler: async (ctx, { organizationId, memberUserKey, templateId, stackId }) => {
    await requireOrgFilesEditor(ctx, organizationId, memberUserKey);
    const tpl = await ctx.db.get(templateId);
    if (!tpl || tpl.organizationId !== organizationId) {
      throw new Error("Template not found.");
    }
    const stack = await ctx.db.get(stackId);
    if (!stack || stack.organizationId !== organizationId) {
      throw new Error("Template stack not found.");
    }
    const sortOrder = await nextTemplateSortOrder(ctx, organizationId, stackId);
    await ctx.db.patch(templateId, {
      stackId,
      sortOrder,
      updatedAt: Date.now(),
    });
    return { ok: true as const };
  },
});

export const removeTemplateFromStack = mutation({
  args: {
    ...orgArgs,
    templateId: v.id("documentTaskTemplates"),
  },
  handler: async (ctx, { organizationId, memberUserKey, templateId }) => {
    await requireOrgFilesEditor(ctx, organizationId, memberUserKey);
    const tpl = await ctx.db.get(templateId);
    if (!tpl || tpl.organizationId !== organizationId) {
      throw new Error("Template not found.");
    }
    const sortOrder = await nextTemplateSortOrder(ctx, organizationId);
    await ctx.db.patch(templateId, {
      stackId: undefined,
      sortOrder,
      updatedAt: Date.now(),
    });
    return { ok: true as const };
  },
});
