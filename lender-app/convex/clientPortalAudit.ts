import type { MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

export async function appendPortalAudit(
  ctx: MutationCtx,
  args: {
    orgScope: string;
    kind: string;
    actorType: "client" | "broker" | "system";
    actorKey: string;
    detail?: string;
    pipelineFileId?: Id<"pipeline">;
    grantId?: Id<"clientPortalGrants">;
  },
): Promise<void> {
  await ctx.db.insert("clientPortalAudit", {
    at: Date.now(),
    orgScope: args.orgScope,
    kind: args.kind,
    actorType: args.actorType,
    actorKey: args.actorKey.trim().slice(0, 200),
    detail: args.detail?.slice(0, 2000),
    pipelineFileId: args.pipelineFileId,
    grantId: args.grantId,
  });
}
