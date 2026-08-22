import { internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import {
  type IntegrationCategory,
  isKnownProvider,
} from "../lib/integrations/catalog";
import { resolveOrganizationPlanForCtx } from "./organizationPlan";
import { planHasFeature } from "../lib/orgPlanFeatures";
import { upsertPipelineLeadFromInboundJob } from "./integrationInboundPipelineLead";
import { applyCreateFileTaskFromInbound } from "./integrationFileTask";
import { parseCreateFileTaskPayload } from "../lib/inboundFileTask";

const MAX_ORG_INBOUND_AUTOMATION_EFFECTS = 16;

/**
 * After an inbound integration job is queued, apply org-scoped automation rules
 * (tasks, chained integration jobs). Idempotent via `inboundAutomationDispatched`.
 */
export const processInboundIntegrationJob = internalMutation({
  args: { jobId: v.id("integrationJobs") },
  handler: async (ctx, { jobId }) => {
    const job = await ctx.db.get(jobId);
    if (!job || job.kind !== "inbound_event") return;
    if (job.inboundAutomationDispatched) return;

    const now = Date.now();
    const plan = await resolveOrganizationPlanForCtx(ctx, job.organizationId);
    if (!planHasFeature(plan, "integrations")) {
      await ctx.db.patch(jobId, {
        inboundAutomationDispatched: true,
        updatedAt: now,
      });
      return;
    }

    let connectorPublicId: string | undefined;
    let actorUserKey: string | undefined;
    if (job.connectorId) {
      const conn = await ctx.db.get(job.connectorId);
      connectorPublicId = conn?.publicId;
      actorUserKey = conn?.createdByUserKey?.trim();
    }

    const settings = await ctx.db
      .query("organizationIntegrationWorkflows")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", job.organizationId),
      )
      .unique();

    let effects = 0;
    let lastActionError: string | undefined;

    if (settings?.rules?.length) {
      for (const rule of settings.rules) {
        if (effects >= MAX_ORG_INBOUND_AUTOMATION_EFFECTS) break;
        if (!rule.enabled) continue;

        if (rule.connectorPublicId?.trim()) {
          const want = rule.connectorPublicId.trim().toLowerCase();
          if (!connectorPublicId || connectorPublicId.toLowerCase() !== want) {
            continue;
          }
        }

        const act = rule.action;
        if (act.type === "create_org_task") {
          const title = act.title.trim().slice(0, 200);
          if (!title) continue;
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
            organizationId: job.organizationId,
            createdAt: now,
            updatedAt: now,
          });
          effects += 1;
        } else if (act.type === "create_file_task") {
          if (!actorUserKey) {
            console.warn(
              `create_file_task rule ${rule.id} skipped: connector owner missing`,
            );
            continue;
          }
          try {
            await applyCreateFileTaskFromInbound(ctx, {
              organizationId: job.organizationId,
              actorUserKey,
              now,
              payload: {
                action: "create_file_task",
                relatedFileId: act.relatedFileId,
                title: act.title,
                description: act.body,
                triageLabelId: act.triageLabelId,
                triageLabelName: act.triageLabelName,
                category: act.category ?? "call",
                status: act.status ?? "todo",
              },
              requireAction: true,
            });
            effects += 1;
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            lastActionError = msg;
            console.warn(`create_file_task rule ${rule.id} skipped: ${msg}`);
          }
        } else if (act.type === "enqueue_integration_job") {
          const cat = act.category as IntegrationCategory;
          const pk = act.providerKey.trim();
          if (!isKnownProvider(cat, pk)) continue;

          await ctx.scheduler.runAfter(
            0,
            internal.integrationJobs.enqueueChainedFromInbound,
            {
              sourceJobId: jobId,
              category: act.category,
              providerKey: pk,
              kind: act.kind,
              payload: {
                source: "org_inbound_automation",
                inboundJobId: String(jobId),
                ruleId: rule.id,
                inboundPayload: job.payload,
              },
              idempotencyKey: `org-inbound-chain:${jobId}:${rule.id}`,
              connectorPublicId: act.connectorPublicId?.trim()
                ? act.connectorPublicId.trim().toLowerCase()
                : undefined,
            },
          );
          effects += 1;
        } else if (act.type === "upsert_pipeline_lead") {
          await upsertPipelineLeadFromInboundJob(ctx, {
            jobId,
            defaultStatus: act.defaultStatus,
          });
          effects += 1;
        }
      }
    }

    const payloadTask = parseCreateFileTaskPayload(job.payload, {
      requireAction: true,
    });
    if (payloadTask && effects < MAX_ORG_INBOUND_AUTOMATION_EFFECTS) {
      if (!actorUserKey) {
        lastActionError = "connector owner missing; cannot create file task";
        console.warn(`create_file_task webhook skipped: ${lastActionError}`);
      } else {
        try {
          await applyCreateFileTaskFromInbound(ctx, {
            organizationId: job.organizationId,
            actorUserKey,
            now,
            parsed: payloadTask,
            payload: job.payload,
            requireAction: true,
          });
          effects += 1;
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          lastActionError = msg;
          console.warn(`create_file_task webhook rejected: ${msg}`);
        }
      }
    }

    await ctx.db.patch(jobId, {
      inboundAutomationDispatched: true,
      updatedAt: now,
      ...(lastActionError
        ? { lastError: lastActionError.slice(0, 500) }
        : {}),
    });
  },
});
