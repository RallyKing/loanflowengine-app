import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";

export type ImpersonationAuditEvent =
  | "start"
  | "stop"
  | "mutation_blocked"
  | "mutation_allowed"
  | "expired"
  | "logout";

export async function appendSuperuserImpersonationAudit(
  ctx: MutationCtx,
  args: {
    event: ImpersonationAuditEvent;
    initiatorUserId: Id<"authUsers">;
    targetOrganizationId: Id<"organizations">;
    targetOrganizationName?: string;
    impersonationPublicId?: string;
    mode?: "readonly" | "operator";
    durationMs?: number;
    mutationPath?: string;
    detail?: string;
    at?: number;
  },
) {
  await ctx.db.insert("superuserImpersonationAudit", {
    event: args.event,
    initiatorUserId: args.initiatorUserId,
    impersonationPublicId: args.impersonationPublicId,
    targetOrganizationId: args.targetOrganizationId,
    targetOrganizationName: args.targetOrganizationName,
    mode: args.mode,
    durationMs: args.durationMs,
    mutationPath: args.mutationPath,
    detail: args.detail,
    at: args.at ?? Date.now(),
  });
}
