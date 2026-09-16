/**
 * Hotfix: `/pipeline/[id]` sometimes receives a contacts/clients id
 * (e.g. primaryContactId). `v.id("pipeline")` then throws ArgumentValidationError
 * which surfaces as Convex "Server Error" on getDetail and sibling file queries.
 *
 * Soft-normalize + classify so the file route can redirect instead of crashing.
 */
import { query } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { assertOrgMember } from "./organizationAccess";
import { PIPELINE_HUB_ACL_OWNER_SCAN_CAP } from "../lib/pipeline/tablePreviewReadBounds";

/** Normalize a raw path id to a pipeline file id, or null if wrong table / bad format. */
export function normalizePipelineFileId(
  ctx: Pick<QueryCtx, "db">,
  raw: string,
): Id<"pipeline"> | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  return ctx.db.normalizeId("pipeline", trimmed);
}

const resolveResultValidator = v.union(
  v.object({
    kind: v.literal("pipeline"),
    fileId: v.id("pipeline"),
  }),
  v.object({
    kind: v.literal("client"),
    clientId: v.id("clients"),
  }),
  v.object({
    kind: v.literal("contact"),
    contactId: v.id("contacts"),
  }),
  v.object({
    kind: v.literal("missing"),
  }),
  v.object({
    kind: v.literal("invalid"),
  }),
);

/**
 * Classify a `/pipeline/[rawId]` path segment so the client can redirect
 * contact/client ids away from the file workspace before getDetail runs.
 */
export const resolveFileRouteTarget = query({
  args: {
    rawId: v.string(),
    organizationId: v.optional(v.id("organizations")),
    memberUserKey: v.optional(v.string()),
  },
  returns: resolveResultValidator,
  handler: async (ctx, args) => {
    const raw = args.rawId.trim();
    if (!raw) return { kind: "invalid" as const };

    const asPipeline = ctx.db.normalizeId("pipeline", raw);
    if (asPipeline) {
      const doc = await ctx.db.get(asPipeline);
      if (!doc) return { kind: "missing" as const };
      return { kind: "pipeline" as const, fileId: asPipeline };
    }

    const asClient = ctx.db.normalizeId("clients", raw);
    if (asClient) {
      const doc = await ctx.db.get(asClient);
      if (!doc) return { kind: "missing" as const };
      return { kind: "client" as const, clientId: asClient };
    }

    const asContact = ctx.db.normalizeId("contacts", raw);
    if (asContact) {
      const contact = await ctx.db.get(asContact);
      if (!contact) return { kind: "missing" as const };

      // Prefer client workspace when we can bind primaryContact → clients.
      if (args.organizationId && args.memberUserKey?.trim()) {
        await assertOrgMember(
          ctx,
          args.organizationId,
          args.memberUserKey.trim(),
        );
        if (contact.organizationId === args.organizationId) {
          const clients = await ctx.db
            .query("clients")
            .withIndex("by_organization", (q) =>
              q.eq("organizationId", args.organizationId!),
            )
            .take(PIPELINE_HUB_ACL_OWNER_SCAN_CAP);
          const match = clients.find(
            (c) =>
              c.primaryContactId != null &&
              String(c.primaryContactId) === String(asContact),
          );
          if (match) {
            return { kind: "client" as const, clientId: match._id };
          }
        }
      }

      return { kind: "contact" as const, contactId: asContact };
    }

    return { kind: "invalid" as const };
  },
});
