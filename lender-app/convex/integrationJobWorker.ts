import { internalAction } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";

/**
 * Executes a single integration job. Replace the placeholder section with
 * provider SDK calls (CRM / email / messaging) and map into Convex mutations.
 */
export const executeIntegrationJob = internalAction({
  args: { jobId: v.id("integrationJobs") },
  handler: async (ctx, { jobId }) => {
    const claimed = await ctx.runMutation(internal.integrationJobs.tryClaimJob, {
      jobId,
    });
    if (!claimed.claimed) {
      return;
    }

    const job = await ctx.runQuery(internal.integrationJobs.getJob, { jobId });
    if (!job) {
      return;
    }

    try {
      let summary = `ok:${job.kind}:${job.providerKey}`;

      switch (job.kind) {
        case "inbound_event":
          summary = `inbound:${job.providerKey}`;
          break;
        case "sync_pull":
          if (job.connectorId) {
            await ctx.runMutation(internal.integrationJobs.upsertSyncCursor, {
              connectorId: job.connectorId,
              resourceKey:
                typeof (job.payload as { resourceKey?: string })?.resourceKey ===
                "string"
                  ? (job.payload as { resourceKey: string }).resourceKey
                  : "default",
              cursor: `t=${Date.now()}`,
            });
          }
          summary = `sync_pull:${job.providerKey}`;
          break;
        case "sync_push":
          summary = `sync_push:${job.providerKey}`;
          break;
        case "action":
          summary = `action:${job.providerKey}`;
          break;
        default:
          break;
      }

      await ctx.runMutation(internal.integrationJobs.completeJob, {
        jobId,
        resultSummary: summary.slice(0, 500),
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await ctx.runMutation(internal.integrationJobs.failJob, {
        jobId,
        errorMessage: msg.slice(0, 4000),
      });
    }
  },
});
