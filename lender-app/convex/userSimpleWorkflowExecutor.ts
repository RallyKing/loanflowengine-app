import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { assertOrgMember } from "./organizationAccess";
import { ALL_PIPELINE_BLOCK_IDS, type PipelineBlockId } from "../lib/pipelineBlockRegistry";
import {
  normalizePipelineDrawerLayout,
  unhideDrawerBlockInLayout,
} from "../lib/pipelineDrawerLayoutStorage";
import {
  userWorkflowTriggerMatches,
  workflowIntegrationIdempotencyKey,
  type UserWorkflowDispatchEvent,
} from "../lib/userWorkflowsModel";
import { WORKFLOW_AUTOMATION_EVENT } from "../lib/webhooks/outboundEnvelope";
import {
  clampActivitySummary,
  diffDrawerBlocksShownHidden,
} from "../lib/pipelineFileActivityModel";
import {
  cloneJson,
  drawerLayoutStableKey,
  undoJsonPairWithinLimit,
} from "../lib/pipelineFileUndo";
import {
  finalizeFileDrawerLayoutForPersist,
  layoutToDbFields,
} from "./pipelineGlobalBlockConfigHelpers";
import { appendPipelineFileActivity } from "./pipelineFileActivity";
import { resolveOrganizationPlanForCtx } from "./organizationPlan";
import { layoutExposesAdvancedBlock, planHasFeature } from "../lib/orgPlanFeatures";

type StoredWorkflowRule = Doc<"userSimpleWorkflows">["rules"][number];

/** Cap user workflow side effects so a single event cannot spam writes. */
export const MAX_USER_WORKFLOW_SIDE_EFFECTS_PER_EVENT = 6;

function layoutUnhideWouldChange(
  file: Doc<"pipeline">,
  blockId: PipelineBlockId,
): boolean {
  const prev = normalizePipelineDrawerLayout(file.fileDrawerLayout);
  const isHidden = prev.hidden.includes(blockId);
  const isCollapsed = prev.expanded[blockId] !== true;
  return isHidden || isCollapsed;
}

export async function runUserSimpleWorkflows(opts: {
  ctx: MutationCtx;
  accountId: string | undefined;
  fileId: Id<"pipeline">;
  event: UserWorkflowDispatchEvent;
  now: number;
}): Promise<{ appliedRuleIds: string[] }> {
  const accountId = opts.accountId?.trim();
  if (!accountId) {
    return { appliedRuleIds: [] };
  }

  const doc = await opts.ctx.db
    .query("userSimpleWorkflows")
    .withIndex("by_accountId", (q) => q.eq("accountId", accountId))
    .unique();

  if (!doc?.rules.length) {
    return { appliedRuleIds: [] };
  }

  const fileForPlan = await opts.ctx.db.get(opts.fileId);
  const orgPlan = fileForPlan?.organizationId
    ? await resolveOrganizationPlanForCtx(opts.ctx, fileForPlan.organizationId)
    : null;

  if (orgPlan && !planHasFeature(orgPlan, "automation")) {
    return { appliedRuleIds: [] };
  }

  const applied: string[] = [];
  let effects = 0;

  for (const rule of doc.rules as StoredWorkflowRule[]) {
    if (effects >= MAX_USER_WORKFLOW_SIDE_EFFECTS_PER_EVENT) break;
    if (!rule.enabled) continue;
    if (orgPlan && !planHasFeature(orgPlan, "integrations")) {
      if (rule.action.type === "enqueue_integration_job") continue;
    }
    if (!userWorkflowTriggerMatches(rule.trigger, opts.event)) continue;

    const row = await opts.ctx.db.get(opts.fileId);
    if (!row) return { appliedRuleIds: applied };

    const did = await applyUserWorkflowRule(
      accountId,
      opts.ctx,
      row,
      rule,
      opts.fileId,
      opts.event,
      opts.now,
    );
    if (did) {
      applied.push(rule.id);
      effects += 1;
    }
  }

  return { appliedRuleIds: applied };
}

async function applyUserWorkflowRule(
  actorUserKey: string | undefined,
  ctx: MutationCtx,
  file: Doc<"pipeline">,
  rule: StoredWorkflowRule,
  fileId: Id<"pipeline">,
  event: UserWorkflowDispatchEvent,
  now: number,
): Promise<boolean> {
  const act = rule.action;
  if (act.type === "show_drawer_block") {
    const bidRaw = act.blockId;
    if (typeof bidRaw !== "string" || !ALL_PIPELINE_BLOCK_IDS.has(bidRaw as PipelineBlockId)) {
      return false;
    }
    const bid = bidRaw as PipelineBlockId;
    if (bid === "dangerZone") return false;
    if (!layoutUnhideWouldChange(file, bid)) return false;
    const layoutPre = cloneJson(
      normalizePipelineDrawerLayout(file.fileDrawerLayout),
    );
    const draft = unhideDrawerBlockInLayout(file.fileDrawerLayout, bid);
    const layout = await finalizeFileDrawerLayoutForPersist(ctx, draft);
    if (file.organizationId) {
      const plan = await resolveOrganizationPlanForCtx(
        ctx,
        file.organizationId,
      );
      if (
        layoutExposesAdvancedBlock(layout) &&
        !planHasFeature(plan, "advanced_blocks")
      ) {
        return false;
      }
    }
    await ctx.db.patch(fileId, {
      fileDrawerLayout: { v: 1, ...layoutToDbFields(layout) },
      createdAt: file.createdAt,
      updatedAt: now,
    });
    const afterRow = (await ctx.db.get(fileId))!;
    const expectKey = drawerLayoutStableKey(afterRow.fileDrawerLayout);
    const drawerUndoOk = undoJsonPairWithinLimit(layoutPre, expectKey);
    const { blocksShown, blocksHidden } = diffDrawerBlocksShownHidden(
      file.fileDrawerLayout,
      layout,
    );
    await appendPipelineFileActivity(ctx, {
      fileId,
      at: now,
      kind: "drawer_layout",
      blocksShown: blocksShown.length ? blocksShown : undefined,
      blocksHidden: blocksHidden.length ? blocksHidden : undefined,
      summary: clampActivitySummary("Workflow: section revealed"),
      ...(drawerUndoOk
        ? {
            undoSpec: {
              v: 1 as const,
              kind: "drawer_layout" as const,
              pre: layoutPre,
            },
            expectPost: expectKey,
          }
        : {}),
    });
    return true;
  }

  if (act.type === "create_task_reminder") {
    const title = act.title.trim().slice(0, 200);
    if (!title) return false;
    const description = act.body?.trim()
      ? act.body.trim().slice(0, 2000)
      : undefined;
    await ctx.db.insert("tasks", {
      title,
      description,
      type: "work",
      category: "admin",
      quadrant: 2,
      status: "todo",
      priority: 2,
      relatedFileId: fileId,
      createdAt: now,
      updatedAt: now,
    });
    return true;
  }

  if (act.type === "enqueue_integration_job") {
    const orgId = file.organizationId;
    if (!orgId || !actorUserKey?.trim()) return false;
    await assertOrgMember(ctx, orgId, actorUserKey);
    const idem = workflowIntegrationIdempotencyKey(
      rule.id,
      event,
      String(fileId),
    );
    void ctx.scheduler.runAfter(0, internal.integrationJobs.enqueueFromAutomation, {
      organizationId: orgId,
      actorUserKey: actorUserKey.trim(),
      category: act.category,
      providerKey: act.providerKey,
      kind: act.kind,
      payload: {
        source: "user_workflow",
        ruleId: rule.id,
        trigger: event.type,
        fileId: String(fileId),
        ...(event.type === "file_created"
          ? {}
          : { lenderId: event.lenderId }),
      },
      idempotencyKey: idem,
      connectorPublicId: act.connectorPublicId,
    });
    return true;
  }

  if (act.type === "emit_automation_webhook") {
    const orgId = file.organizationId;
    if (!orgId || !actorUserKey?.trim()) return false;
    await assertOrgMember(ctx, orgId, actorUserKey);
    void ctx.scheduler.runAfter(0, internal.webhookOutbound.emitOrgWebhookEvent, {
      organizationId: orgId,
      eventType: WORKFLOW_AUTOMATION_EVENT,
      resourceType: "pipeline",
      resourceId: fileId,
      includePipelineSnapshot: act.includeFileSnapshot,
      patchContext: {
        automationRuleId: rule.id,
        triggerType: event.type,
        automationSource: "user_workflow",
      },
    });
    return true;
  }

  return false;
}
