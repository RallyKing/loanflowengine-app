import { v } from "convex/values";
import {
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { appendTaskFeed } from "./activityFeed";
import { refreshTaskGlobalSearchText } from "./globalSearchSync";
import { syncFileTaskEdgeFromTask } from "./indexedGraphEdgeSync";
import { assertOrgMember, resolveMemberUserKey } from "./organizationAccess";
import { assertOrganizationId } from "./organizationValidators";
import {
  requireOrgReaderKey,
  requireOrgMemberKey,
} from "./authUtils";
import { ownerUserIdFieldsForInsert } from "./resourceAccess";
import { assertAndResolveTaskTriageFields } from "./tasks";

const orgArgs = {
  organizationId: v.id("organizations"),
  memberUserKey: v.optional(v.string()),
};

const TASK_FILE_MAX_NAME_LEN = 255;

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
    "taskTemplateLibrary.requireOrgReader",
  );
}

async function requireOrgSettingsAdmin(
  ctx: MutationCtx,
  organizationId: Id<"organizations">,
  memberUserKey?: string,
) {
  await assertOrganizationId(ctx, organizationId);
  return requireOrgMemberKey(ctx, organizationId, memberUserKey, {
    permission: "settings.manage",
    stage: "taskTemplateLibrary.requireOrgSettingsAdmin",
  });
}

function safeAttachmentFileName(name: string) {
  const base = name.replace(/[/\\]/g, "").trim() || "file";
  return base.slice(0, TASK_FILE_MAX_NAME_LEN);
}

async function attachTemplateBlobToTask(
  ctx: MutationCtx,
  task: Doc<"tasks">,
  template: Doc<"taskTemplates">,
): Promise<void> {
  if (!template.attachmentStorageId) return;
  const fileName = safeAttachmentFileName(
    template.attachmentFileName ?? "template-attachment",
  );
  await ctx.db.insert("taskAttachments", {
    taskId: task._id,
    organizationId: task.organizationId,
    storageId: template.attachmentStorageId,
    fileName,
    contentType: template.attachmentContentType,
    size: template.attachmentSize,
    label: "From playbook template",
    createdAt: Date.now(),
  });
}

/** Groups + template counts for library browser and settings. */
export const listTemplateGroups = query({
  args: orgArgs,
  handler: async (ctx, { organizationId, memberUserKey }) => {
    await requireOrgReader(ctx, organizationId, memberUserKey);
    const groups = await ctx.db
      .query("taskTemplateGroups")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", organizationId),
      )
      .collect();
    groups.sort(
      (a, b) =>
        (a.sortOrder ?? a._creationTime) - (b.sortOrder ?? b._creationTime) ||
        a.name.localeCompare(b.name),
    );

    const out = [];
    for (const group of groups) {
      const templates = await ctx.db
        .query("taskTemplates")
        .withIndex("by_group", (q) => q.eq("templateGroupId", group._id))
        .collect();
      out.push({
        ...group,
        templateCount: templates.length,
      });
    }
    return out;
  },
});

/** Templates in a group (ordered). */
export const listTemplatesInGroup = query({
  args: {
    ...orgArgs,
    templateGroupId: v.id("taskTemplateGroups"),
  },
  handler: async (ctx, { organizationId, memberUserKey, templateGroupId }) => {
    await requireOrgReader(ctx, organizationId, memberUserKey);
    const group = await ctx.db.get(templateGroupId);
    if (!group || group.organizationId !== organizationId) {
      return [];
    }
    const templates = await ctx.db
      .query("taskTemplates")
      .withIndex("by_group", (q) => q.eq("templateGroupId", templateGroupId))
      .collect();
    templates.sort(
      (a, b) =>
        (a.sortOrder ?? a._creationTime) - (b.sortOrder ?? b._creationTime),
    );
    return templates;
  },
});

export const upsertTemplateGroup = mutation({
  args: {
    ...orgArgs,
    groupId: v.optional(v.id("taskTemplateGroups")),
    name: v.string(),
    description: v.optional(v.string()),
    /** Phase Modular-B — bind (id) or clear (null) the lender playbook link. */
    lenderId: v.optional(v.union(v.id("lenders"), v.null())),
  },
  handler: async (
    ctx,
    { organizationId, memberUserKey, groupId, name, description, lenderId },
  ) => {
    const actor = await requireOrgSettingsAdmin(ctx, organizationId, memberUserKey);
    const trimmed = name.trim();
    if (!trimmed) throw new Error("Group name is required");
    if (lenderId) {
      const lender = await ctx.db.get(lenderId);
      if (!lender) throw new Error("Lender not found");
    }
    const now = Date.now();
    if (groupId) {
      const existing = await ctx.db.get(groupId);
      if (!existing || existing.organizationId !== organizationId) {
        throw new Error("Template group not found");
      }
      await ctx.db.patch(groupId, {
        name: trimmed,
        description: description?.trim() || undefined,
        ...(lenderId !== undefined ? { lenderId: lenderId ?? undefined } : {}),
        updatedAt: now,
        updatedByUserKey: actor,
      });
      return { id: groupId };
    }
    const id = await ctx.db.insert("taskTemplateGroups", {
      organizationId,
      name: trimmed,
      description: description?.trim() || undefined,
      ...(lenderId ? { lenderId } : {}),
      sortOrder: now,
      updatedAt: now,
      updatedByUserKey: actor,
    });
    return { id };
  },
});

export const upsertTaskTemplate = mutation({
  args: {
    ...orgArgs,
    templateId: v.optional(v.id("taskTemplates")),
    templateGroupId: v.id("taskTemplateGroups"),
    title: v.string(),
    description: v.optional(v.string()),
    triageLabelId: v.optional(v.id("organizationTriageLabels")),
    attachmentStorageId: v.optional(v.id("_storage")),
    attachmentFileName: v.optional(v.string()),
    attachmentContentType: v.optional(v.string()),
    attachmentSize: v.optional(v.number()),
    clearAttachment: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const actor = await requireOrgSettingsAdmin(
      ctx,
      args.organizationId,
      args.memberUserKey,
    );
    const title = args.title.trim();
    if (!title) throw new Error("Template title is required");

    const group = await ctx.db.get(args.templateGroupId);
    if (!group || group.organizationId !== args.organizationId) {
      throw new Error("Template group not found");
    }

    if (args.triageLabelId) {
      const label = await ctx.db.get(args.triageLabelId);
      if (!label || label.organizationId !== args.organizationId) {
        throw new Error("Triage label not found for this organization");
      }
    }

    const now = Date.now();
    const attachmentFields = args.clearAttachment
      ? {
          attachmentStorageId: undefined,
          attachmentFileName: undefined,
          attachmentContentType: undefined,
          attachmentSize: undefined,
        }
      : args.attachmentStorageId
        ? {
            attachmentStorageId: args.attachmentStorageId,
            attachmentFileName: args.attachmentFileName
              ? safeAttachmentFileName(args.attachmentFileName)
              : "template-attachment",
            attachmentContentType: args.attachmentContentType,
            attachmentSize: args.attachmentSize,
          }
        : {};

    if (args.templateId) {
      const existing = await ctx.db.get(args.templateId);
      if (
        !existing ||
        existing.organizationId !== args.organizationId ||
        existing.templateGroupId !== args.templateGroupId
      ) {
        throw new Error("Task template not found");
      }
      await ctx.db.patch(args.templateId, {
        title,
        description: args.description?.trim() || undefined,
        triageLabelId: args.triageLabelId,
        ...attachmentFields,
        updatedAt: now,
        updatedByUserKey: actor,
      });
      return { id: args.templateId };
    }

    const id = await ctx.db.insert("taskTemplates", {
      organizationId: args.organizationId,
      templateGroupId: args.templateGroupId,
      title,
      description: args.description?.trim() || undefined,
      triageLabelId: args.triageLabelId,
      sortOrder: now,
      updatedAt: now,
      updatedByUserKey: actor,
      ...(args.attachmentStorageId && !args.clearAttachment
        ? {
            attachmentStorageId: args.attachmentStorageId,
            attachmentFileName: args.attachmentFileName
              ? safeAttachmentFileName(args.attachmentFileName)
              : "template-attachment",
            attachmentContentType: args.attachmentContentType,
            attachmentSize: args.attachmentSize,
          }
        : {}),
    });
    return { id };
  },
});

export const deleteTaskTemplate = mutation({
  args: {
    ...orgArgs,
    templateId: v.id("taskTemplates"),
  },
  handler: async (ctx, { organizationId, memberUserKey, templateId }) => {
    await requireOrgSettingsAdmin(ctx, organizationId, memberUserKey);
    const row = await ctx.db.get(templateId);
    if (!row || row.organizationId !== organizationId) {
      throw new Error("Task template not found");
    }
    // Retain storage blobs — applied task attachments may reference the same id.
    await ctx.db.delete(templateId);
    return { ok: true as const };
  },
});

export const deleteTemplateGroup = mutation({
  args: {
    ...orgArgs,
    groupId: v.id("taskTemplateGroups"),
  },
  handler: async (ctx, { organizationId, memberUserKey, groupId }) => {
    await requireOrgSettingsAdmin(ctx, organizationId, memberUserKey);
    const group = await ctx.db.get(groupId);
    if (!group || group.organizationId !== organizationId) {
      throw new Error("Template group not found");
    }
    const templates = await ctx.db
      .query("taskTemplates")
      .withIndex("by_group", (q) => q.eq("templateGroupId", groupId))
      .collect();
    for (const tmpl of templates) {
      await ctx.db.delete(tmpl._id);
    }
    await ctx.db.delete(groupId);
    return { ok: true as const };
  },
});

/** Admin upload URL for template attachment blobs. */
export const generateTemplateAttachmentUploadUrl = mutation({
  args: orgArgs,
  handler: async (ctx, { organizationId, memberUserKey }) => {
    await requireOrgSettingsAdmin(ctx, organizationId, memberUserKey);
    return await ctx.storage.generateUploadUrl();
  },
});

/** Clone all templates in a group onto the active pipeline file. */
export const applyTemplateGroupToFile = mutation({
  args: {
    ...orgArgs,
    templateGroupId: v.id("taskTemplateGroups"),
    pipelineFileId: v.id("pipeline"),
    actorUserKey: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const key = await resolveMemberUserKey(ctx, args.memberUserKey);
    if (!key) throw new Error("Not authenticated");
    await assertOrgMember(ctx, args.organizationId, key);
    const actor = args.actorUserKey?.trim() || key;

    const group = await ctx.db.get(args.templateGroupId);
    if (!group || group.organizationId !== args.organizationId) {
      throw new Error("Template group not found");
    }

    const file = await ctx.db.get(args.pipelineFileId);
    if (!file || file.organizationId !== args.organizationId) {
      throw new Error("Pipeline file not found");
    }

    const templates = await ctx.db
      .query("taskTemplates")
      .withIndex("by_group", (q) =>
        q.eq("templateGroupId", args.templateGroupId),
      )
      .collect();
    if (templates.length === 0) {
      throw new Error("This playbook group has no task templates");
    }
    templates.sort(
      (a, b) =>
        (a.sortOrder ?? a._creationTime) - (b.sortOrder ?? b._creationTime),
    );

    const createdTaskIds: Id<"tasks">[] = [];
    for (const template of templates) {
      const resolved = await assertAndResolveTaskTriageFields(
        ctx,
        args.organizationId,
        {
          triageLabelId: template.triageLabelId,
          scheduledTriggerTime: undefined,
        },
      );
      const now = Date.now();
      const taskId = await ctx.db.insert("tasks", {
        title: template.title.trim(),
        description: template.description?.trim() || undefined,
        type: "work",
        category: "admin",
        quadrant: 2,
        status: "todo",
        priority: 0,
        relatedFileId: args.pipelineFileId,
        triageLabelId: resolved.triageLabelId,
        labelAppliedAt: resolved.triageLabelId ? now : undefined,
        highlightColorId: resolved.highlightColorId,
        scheduledTriggerTime: resolved.scheduledTriggerTime,
        organizationId: args.organizationId,
        ...ownerUserIdFieldsForInsert(actor),
        createdAt: now,
        updatedAt: now,
      });
      const inserted = await ctx.db.get(taskId);
      if (inserted) {
        await attachTemplateBlobToTask(ctx, inserted, template);
        await appendTaskFeed(
          ctx,
          inserted,
          "task_created",
          `Applied playbook task “${inserted.title.trim()}”`,
          actor,
        );
      }
      await refreshTaskGlobalSearchText(ctx, taskId);
      const taskRow = await ctx.db.get(taskId);
      if (taskRow) {
        await syncFileTaskEdgeFromTask(ctx, taskRow, { actor });
      }
      createdTaskIds.push(taskId);
    }

    return {
      ok: true as const,
      groupName: group.name,
      taskIds: createdTaskIds,
      count: createdTaskIds.length,
    };
  },
});
