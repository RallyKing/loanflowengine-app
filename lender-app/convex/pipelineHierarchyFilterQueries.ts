/**
 * Phase 14 Step 1 — backend filters for client ↔ project/file involvement.
 * ACL unchanged: results are membership-filtered only; junction links do not grant access.
 */
import { query } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { assertOrgMember } from "./organizationAccess";
import {
  filterPipelineRowsForMember,
  resolveClientAccessLevel,
  resolvePipelineAccessLevel,
  resolveProjectAccessLevel,
  resolveRowOwnerUserId,
} from "./resourceAccess";
import {
  loadPipelineFilesForClient,
  loadProjectsForClient,
  resolveFileHierarchy,
  resolveProjectClientAssociations,
} from "./pipelineHierarchyCompat";
import { listLoanClientLinks } from "./pipelineMultiClientLinks";

const LOAN_CLIENT_ROLE_LABELS: Record<string, string> = {
  primary: "Primary borrower",
  coborrower: "Co-borrower",
  guarantor: "Corporate guarantor",
  entity: "Entity",
  sponsor: "Sponsor",
  partner: "Partner",
  other: "Other",
};

const memberUserKeyArg = {
  memberUserKey: v.string(),
};

async function filterProjectsForMember(
  ctx: QueryCtx,
  rows: Doc<"projects">[],
  organizationId: Id<"organizations">,
  memberUserKey: string,
): Promise<Doc<"projects">[]> {
  const scoped = rows.filter((r) => r.organizationId === organizationId);
  const out: Doc<"projects">[] = [];
  for (const row of scoped) {
    const level = await resolveProjectAccessLevel(ctx, row, memberUserKey);
    if (level !== "none") out.push(row);
  }
  return out;
}

async function filesInvolvingClientForMember(
  ctx: QueryCtx,
  args: {
    organizationId: Id<"organizations">;
    clientId: Id<"clients">;
    memberUserKey: string;
    includeArchived?: boolean;
  },
) {
  await assertOrgMember(ctx, args.organizationId, args.memberUserKey);
  const client = await ctx.db.get(args.clientId);
  if (!client || client.organizationId !== args.organizationId) {
    return [];
  }
  const level = await resolveClientAccessLevel(
    ctx,
    client,
    args.memberUserKey,
  );
  if (level === "none") return [];

  const rows = await loadPipelineFilesForClient(ctx, args.clientId);
  const visible = await filterPipelineRowsForMember(
    ctx,
    rows,
    args.organizationId,
    args.memberUserKey,
  );
  const filtered = visible.filter((r) => {
    if (!args.includeArchived && r.archivedAt != null) return false;
    return true;
  });

  return await Promise.all(
    filtered.map(async (f) => {
      let involvementRole = LOAN_CLIENT_ROLE_LABELS.primary;
      if (String(f.clientId) !== String(args.clientId)) {
        const links = await listLoanClientLinks(ctx, f._id);
        const hit = links.find(
          (l) => String(l.clientId) === String(args.clientId),
        );
        involvementRole =
          LOAN_CLIENT_ROLE_LABELS[hit?.relationshipType ?? "other"] ??
          "Other";
      }
      return {
        _id: f._id,
        fileName: f.fileName,
        status: f.status,
        clientId: f.clientId,
        projectId: f.projectId,
        ownerUserId: resolveRowOwnerUserId(f),
        accessLevel: await resolvePipelineAccessLevel(
          ctx,
          f,
          args.memberUserKey,
        ),
        hierarchy: await resolveFileHierarchy(ctx, f),
        updatedAt: f.updatedAt,
        fundingAmount: f.fundingAmount,
        involvementRole,
      };
    }),
  );
}

/** All visible loan files involving client X (primary FK + loanClients). */
export const listFilesInvolvingClient = query({
  args: {
    organizationId: v.id("organizations"),
    clientId: v.id("clients"),
    includeArchived: v.optional(v.boolean()),
    ...memberUserKeyArg,
  },
  handler: async (ctx, args) => filesInvolvingClientForMember(ctx, args),
});

/** All visible projects involving client X (primary FK + projectClients). */
export const listProjectsInvolvingClient = query({
  args: {
    organizationId: v.id("organizations"),
    clientId: v.id("clients"),
    ...memberUserKeyArg,
  },
  handler: async (ctx, args) => {
    await assertOrgMember(ctx, args.organizationId, args.memberUserKey);
    const client = await ctx.db.get(args.clientId);
    if (!client || client.organizationId !== args.organizationId) {
      return [];
    }
    const level = await resolveClientAccessLevel(
      ctx,
      client,
      args.memberUserKey,
    );
    if (level === "none") return [];

    const rows = await loadProjectsForClient(ctx, args.clientId);
    const visible = await filterProjectsForMember(
      ctx,
      rows,
      args.organizationId,
      args.memberUserKey,
    );

    return await Promise.all(
      visible.map(async (p) => ({
        _id: p._id,
        clientId: p.clientId,
        title: p.title,
        status: p.status,
        associations: await resolveProjectClientAssociations(ctx, p),
      })),
    );
  },
});

/**
 * Visible loan files involving client X where the member is not the file owner
 * (share- or inheritance-based visibility only).
 */
export const listSharedFilesInvolvingClient = query({
  args: {
    organizationId: v.id("organizations"),
    clientId: v.id("clients"),
    includeArchived: v.optional(v.boolean()),
    ...memberUserKeyArg,
  },
  handler: async (ctx, args) => {
    const all = await filesInvolvingClientForMember(ctx, args);
    const key = args.memberUserKey.trim();
    return all.filter(
      (row) => row.ownerUserId && row.ownerUserId !== key,
    );
  },
});
