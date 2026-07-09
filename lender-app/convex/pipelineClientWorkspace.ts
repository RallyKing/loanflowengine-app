/**
 * Phase 55.1 — Client workspace tree (single subscription, no per-project file waterfalls).
 */
import { query } from "./_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { assertOrgMember } from "./organizationAccess";
import type { LinkedClientSummary } from "../lib/pipelineClientRelationships";
import {
  filterPipelineRowsForMember,
  resolveClientAccessLevel,
  resolveProjectAccessLevel,
  resolveRowOwnerUserId,
} from "./resourceAccess";
import {
  loadPipelineFilesForClient,
  loadProjectsForClient,
  resolveProjectClientAssociations,
} from "./pipelineHierarchyCompat";
import { getPipelineStatusInfo } from "../lib/pipelineStatus";
import { resolveTaskTriageBadgeVariant } from "../lib/pipeline/collapsibleBlockMetadata";
import type { CollapsibleBlockBadgeVariant } from "../lib/pipeline/collapsibleBlockMetadata";
import { resolveDisplayUsernameMap } from "./auth/displayIdentity";
import { loadTriageLabelsForOrg } from "./organizationTriageLabels";
import { buildTriageLabelsMap } from "../lib/inFileTaskTriageUi";
import { compareWorkspaceSortOrder } from "../lib/pipeline/workspaceSortOrder";
import {
  resolveClientAdditionalContacts,
  resolveClientEntityLinks,
} from "./pipelineClientGroupLinks";
import type { QueryCtx } from "./_generated/server";

const memberUserKeyArg = {
  memberUserKey: v.string(),
};

function slimFile(f: Doc<"pipeline">) {
  return {
    _id: f._id,
    fileName: f.fileName,
    status: f.status,
    fundingAmount: f.fundingAmount,
    stageId: f.stageId,
    subStageId: f.subStageId,
    clientId: f.clientId,
    projectId: f.projectId,
    ownerUserId: resolveRowOwnerUserId(f),
    archivedAt: f.archivedAt,
    workspaceSortOrder: f.workspaceSortOrder,
    createdAt: f.createdAt,
    updatedAt: f.updatedAt,
  };
}

async function enrichSlimFiles(
  ctx: QueryCtx,
  organizationId: Id<"organizations">,
  files: Doc<"pipeline">[],
) {
  if (files.length === 0) return [] as ReturnType<typeof slimFile>[];

  const ownerKeys = files
    .map((f) => resolveRowOwnerUserId(f))
    .filter((k): k is string => Boolean(k?.trim()));
  const ownerMap = await resolveDisplayUsernameMap(ctx, ownerKeys);

  const stages = await ctx.db
    .query("organizationPipelineStages")
    .withIndex("by_organization", (q) =>
      q.eq("organizationId", organizationId),
    )
    .collect();
  const stageNameById = new Map(
    stages.map((stage) => [String(stage._id), stage.name] as const),
  );

  const triageLabelRows = await loadTriageLabelsForOrg(ctx, organizationId);
  const labelsById = buildTriageLabelsMap([...triageLabelRows.values()]);

  const tasksByFileId = new Map<string, Doc<"tasks">[]>();
  await Promise.all(
    files.map(async (file) => {
      const tasks = await ctx.db
        .query("tasks")
        .withIndex("by_relatedFile", (q) => q.eq("relatedFileId", file._id))
        .collect();
      tasksByFileId.set(String(file._id), tasks);
    }),
  );

  return files.map((file) => {
    const base = slimFile(file);
    const ownerKey = base.ownerUserId?.trim() ?? "";
    const stageFromOrg = file.stageId
      ? stageNameById.get(String(file.stageId))?.trim()
      : undefined;
    const stageLabel =
      stageFromOrg || getPipelineStatusInfo(file.status).label;
    const tasks = tasksByFileId.get(String(file._id)) ?? [];
    const triageBadgeVariant: CollapsibleBlockBadgeVariant =
      resolveTaskTriageBadgeVariant(
        tasks.map((task) => ({
          status: task.status,
          triageLabelId: task.triageLabelId,
          isUrgent: task.isUrgent,
        })),
        labelsById,
      );

    return {
      ...base,
      stageLabel,
      ownerDisplayUsername: ownerKey ? ownerMap[ownerKey] ?? ownerKey : undefined,
      triageBadgeVariant,
    };
  });
}

export const getClientWorkspaceTree = query({
  args: {
    organizationId: v.id("organizations"),
    clientId: v.id("clients"),
    includeArchived: v.optional(v.boolean()),
    ...memberUserKeyArg,
  },
  handler: async (ctx, args) => {
    await assertOrgMember(ctx, args.organizationId, args.memberUserKey);

    const client = await ctx.db.get(args.clientId);
    if (!client || client.organizationId !== args.organizationId) {
      return null;
    }

    const clientAccess = await resolveClientAccessLevel(
      ctx,
      client,
      args.memberUserKey,
    );
    if (clientAccess === "none") return null;

    const primaryContact = client.primaryContactId
      ? await ctx.db.get(client.primaryContactId)
      : null;
    const primaryContactName =
      primaryContact?.name?.trim() ||
      client.primaryContactName?.trim() ||
      null;

    const [projectRows, fileRows] = await Promise.all([
      loadProjectsForClient(ctx, args.clientId),
      loadPipelineFilesForClient(ctx, args.clientId),
    ]);

    const visibleProjects: Doc<"projects">[] = [];
    for (const project of projectRows) {
      if (project.organizationId !== args.organizationId) continue;
      const level = await resolveProjectAccessLevel(
        ctx,
        project,
        args.memberUserKey,
      );
      if (level !== "none") visibleProjects.push(project);
    }

    const scopedFiles = fileRows.filter((f) => {
      if (f.organizationId !== args.organizationId) return false;
      if (!args.includeArchived && f.archivedAt != null) return false;
      return true;
    });

    const visibleFiles = await filterPipelineRowsForMember(
      ctx,
      scopedFiles,
      args.organizationId,
      args.memberUserKey,
    );

    const visibleProjectIds = new Set(
      visibleProjects.map((p) => String(p._id)),
    );
    const filesByProject = new Map<string, Doc<"pipeline">[]>();
    const unscopedFiles: Doc<"pipeline">[] = [];

    for (const file of visibleFiles) {
      const projectKey = file.projectId ? String(file.projectId) : null;
      if (projectKey && visibleProjectIds.has(projectKey)) {
        const bucket = filesByProject.get(projectKey) ?? [];
        bucket.push(file);
        filesByProject.set(projectKey, bucket);
      } else {
        unscopedFiles.push(file);
      }
    }

    const projects = await Promise.all(
      visibleProjects.map(async (project) => {
        const associations = await resolveProjectClientAssociations(
          ctx,
          project,
        );
        const files = (filesByProject.get(String(project._id)) ?? []).sort(
          (a, b) =>
            compareWorkspaceSortOrder(a, b, (left, right) =>
              (left.fileName ?? "").localeCompare(right.fileName ?? ""),
            ),
        );
        const enrichedFiles = await enrichSlimFiles(
          ctx,
          args.organizationId,
          files,
        );
        return {
          _id: project._id,
          clientId: project.clientId,
          title: project.title,
          normalizedTitle: project.normalizedTitle,
          purpose: project.purpose,
          status: project.status,
          targetFunding: project.targetFunding,
          completionPercent: project.completionPercent,
          ownerUserId: project.ownerUserId,
          linkedClients: associations.linkedClients,
          workspaceSortOrder: project.workspaceSortOrder,
          createdAt: project.createdAt,
          updatedAt: project.updatedAt,
          files: enrichedFiles,
        };
      }),
    ).then((rows) =>
      rows.sort((a, b) =>
        compareWorkspaceSortOrder(a, b, (left, right) =>
          left.title.localeCompare(right.title),
        ),
      ),
    );

    const linkedEntities = await resolveClientEntityLinks(ctx, client);
    const additionalContacts = await resolveClientAdditionalContacts(
      ctx,
      client,
      args.organizationId,
    );

    return {
      client: {
        _id: client._id,
        displayName: client.displayName,
        normalizedName: client.normalizedName,
        primaryContactId: client.primaryContactId,
        primaryContactName,
        primaryContactEmail: client.primaryContactEmail,
        primaryContactPhone: client.primaryContactPhone,
        companyName: client.companyName,
        ownerUserId: client.ownerUserId,
        accessLevel: clientAccess,
        createdAt: client.createdAt,
        updatedAt: client.updatedAt,
      },
      projects,
      unscopedFiles: await enrichSlimFiles(
        ctx,
        args.organizationId,
        unscopedFiles.sort((a, b) =>
          compareWorkspaceSortOrder(a, b, (left, right) =>
            (left.fileName ?? "").localeCompare(right.fileName ?? ""),
          ),
        ),
      ),
      linkedEntities,
      additionalContacts,
    };
  },
});

function isOpenClientTask(status: Doc<"tasks">["status"]): boolean {
  return status !== "done" && status !== "archived";
}

/**
 * Phase 56 — All tasks on pipeline files belonging to a client (with file/project context).
 */
export const getClientAggregatedTasks = query({
  args: {
    organizationId: v.id("organizations"),
    clientId: v.id("clients"),
    includeArchivedFiles: v.optional(v.boolean()),
    ...memberUserKeyArg,
  },
  handler: async (ctx, args) => {
    await assertOrgMember(ctx, args.organizationId, args.memberUserKey);

    const client = await ctx.db.get(args.clientId);
    if (!client || client.organizationId !== args.organizationId) {
      return null;
    }

    const clientAccess = await resolveClientAccessLevel(
      ctx,
      client,
      args.memberUserKey,
    );
    if (clientAccess === "none") return null;

    const [projectRows, fileRows] = await Promise.all([
      loadProjectsForClient(ctx, args.clientId),
      loadPipelineFilesForClient(ctx, args.clientId),
    ]);

    const projectTitleById = new Map<string, string>();
    const visibleProjectIds = new Set<string>();
    for (const project of projectRows) {
      if (project.organizationId !== args.organizationId) continue;
      const level = await resolveProjectAccessLevel(
        ctx,
        project,
        args.memberUserKey,
      );
      if (level === "none") continue;
      visibleProjectIds.add(String(project._id));
      projectTitleById.set(String(project._id), project.title);
    }

    const scopedFiles = fileRows.filter((f) => {
      if (f.organizationId !== args.organizationId) return false;
      if (!args.includeArchivedFiles && f.archivedAt != null) return false;
      return true;
    });

    const visibleFiles = await filterPipelineRowsForMember(
      ctx,
      scopedFiles,
      args.organizationId,
      args.memberUserKey,
    );

    const tasks: Array<{
      task: Doc<"tasks">;
      fileId: Id<"pipeline">;
      fileName: string;
      projectId?: Id<"projects">;
      projectTitle?: string;
    }> = [];

    await Promise.all(
      visibleFiles.map(async (file) => {
        const rows = await ctx.db
          .query("tasks")
          .withIndex("by_relatedFile", (q) => q.eq("relatedFileId", file._id))
          .collect();
        const projectKey = file.projectId ? String(file.projectId) : null;
        const projectTitle =
          projectKey && visibleProjectIds.has(projectKey)
            ? projectTitleById.get(projectKey)
            : undefined;

        for (const task of rows) {
          if (task.organizationId !== args.organizationId) continue;
          tasks.push({
            task,
            fileId: file._id,
            fileName: file.fileName,
            ...(file.projectId &&
            visibleProjectIds.has(String(file.projectId)) &&
            projectTitle
              ? {
                  projectId: file.projectId,
                  projectTitle,
                }
              : {}),
          });
        }
      }),
    );

    tasks.sort((a, b) => {
      const aOpen = isOpenClientTask(a.task.status) ? 0 : 1;
      const bOpen = isOpenClientTask(b.task.status) ? 0 : 1;
      if (aOpen !== bOpen) return aOpen - bOpen;
      const aDue = a.task.dueDate ?? Number.POSITIVE_INFINITY;
      const bDue = b.task.dueDate ?? Number.POSITIVE_INFINITY;
      if (aDue !== bDue) return aDue - bDue;
      return b.task._creationTime - a.task._creationTime;
    });

    const activeCount = tasks.filter((row) =>
      isOpenClientTask(row.task.status),
    ).length;

    return { activeCount, tasks };
  },
});
