/**
 * Attach legacy / unscoped rows to a target organization so org-scoped queries
 * (`pipeline.listLight`, `tasks.getAll`, `contacts.list`, library, deal-room)
 * return them again.
 *
 * Targets:
 * - `pipeline`, `tasks`, `contacts`: `organizationId` missing OR points at a deleted org
 * - `libraryDocuments`, `savedFilterPresets`, `signatureEnvelopes`: same
 * - `fileMessages`: synced from parent pipeline file org after pipeline is patched
 * - `taskAttachments`: synced from parent task org after tasks are patched
 *
 * Does not modify `lenders` rows with `organizationId` unset (global catalog).
 */
import { v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import { mutation } from "../_generated/server";
import type { MutationCtx } from "../_generated/server";
import { assertDataMigrationAdmin } from "../migrationAdminAuth";
import { findPrimaryPlatformAuthUser } from "../auth/findPrimaryPlatformUser";
import { normalizeEmailKey } from "../../lib/crmRelationship";
import { primaryContactEmail } from "../../lib/contact/contactMethods";
import {
  seedSystemRolesForOrganization,
  syncSystemRolePermissions,
} from "../organizationRbac";

async function validOrganizationIds(ctx: MutationCtx): Promise<Set<string>> {
  const rows = await ctx.db.query("organizations").collect();
  return new Set(rows.map((r) => r._id as string));
}

function needsOrgBackfill(
  organizationId: Id<"organizations"> | undefined,
  valid: Set<string>,
): boolean {
  if (organizationId === undefined) return true;
  return !valid.has(organizationId as string);
}

function memberRoleRank(role: Doc<"organizationMembers">["role"]): number {
  if (role === "owner") return 2;
  if (role === "admin") return 1;
  return 0;
}

function pickBestOrgMember(
  rows: Doc<"organizationMembers">[],
): Doc<"organizationMembers"> | null {
  if (rows.length === 0) return null;
  return rows.reduce((best, cur) => {
    const dr = memberRoleRank(cur.role) - memberRoleRank(best.role);
    if (dr > 0) return cur;
    if (dr < 0) return best;
    return cur._creationTime > best._creationTime ? cur : best;
  });
}

export type OrgScopeBackfillSummary = {
  dryRun: boolean;
  targetOrganizationId: string;
  primaryAuthUserId: string;
  membershipDuplicateRowsRemoved: number;
  membershipInserted: boolean;
  membershipRolePatched: boolean;
  defaultOrganizationIdPatched: boolean;
  pipelinePatched: number;
  tasksPatched: number;
  contactsPatched: number;
  contactsSkippedDuplicateEmail: number;
  libraryDocumentsPatched: number;
  savedFilterPresetsPatched: number;
  fileMessagesPatched: number;
  taskAttachmentsPatched: number;
  signatureEnvelopesPatched: number;
};

async function runOrgScopeBackfill(
  ctx: MutationCtx,
  {
    orgId,
    userKey,
    dry,
    now,
  }: {
    orgId: Id<"organizations">;
    userKey: string;
    dry: boolean;
    now: number;
  },
): Promise<Omit<OrgScopeBackfillSummary, "membershipDuplicateRowsRemoved" | "membershipInserted" | "membershipRolePatched" | "defaultOrganizationIdPatched">> {
  const valid = await validOrganizationIds(ctx);

  const summary = {
    dryRun: dry,
    targetOrganizationId: orgId as string,
    primaryAuthUserId: userKey,
    pipelinePatched: 0,
    tasksPatched: 0,
    contactsPatched: 0,
    contactsSkippedDuplicateEmail: 0,
    libraryDocumentsPatched: 0,
    savedFilterPresetsPatched: 0,
    fileMessagesPatched: 0,
    taskAttachmentsPatched: 0,
    signatureEnvelopesPatched: 0,
  };

  const emailKeysInOrg = new Set<string>();
  for (const c of await ctx.db.query("contacts").collect()) {
    if (c.organizationId !== orgId) continue;
    const k = normalizeEmailKey(primaryContactEmail(c));
    if (k) emailKeysInOrg.add(k);
  }

  for (const p of await ctx.db.query("pipeline").collect()) {
    if (!needsOrgBackfill(p.organizationId, valid)) continue;
    if (!dry) {
      const patch: Record<string, unknown> = {
        organizationId: orgId,
        updatedAt: now,
      };
      const owner = p.ownerUserKey?.trim();
      if (!owner) patch.ownerUserKey = userKey;
      await ctx.db.patch(p._id, patch);
    }
    summary.pipelinePatched++;
  }

  for (const t of await ctx.db.query("tasks").collect()) {
    if (!needsOrgBackfill(t.organizationId, valid)) continue;
    if (!dry) {
      await ctx.db.patch(t._id, {
        organizationId: orgId,
        updatedAt: now,
      });
    }
    summary.tasksPatched++;
  }

  for (const c of await ctx.db.query("contacts").collect()) {
    if (!needsOrgBackfill(c.organizationId, valid)) continue;
    const ek = normalizeEmailKey(primaryContactEmail(c));
    if (ek && emailKeysInOrg.has(ek)) {
      summary.contactsSkippedDuplicateEmail++;
      continue;
    }
    if (!dry) {
      await ctx.db.patch(c._id, {
        organizationId: orgId,
        updatedAt: now,
        ...(ek ? { emailKey: ek } : {}),
      });
      if (ek) emailKeysInOrg.add(ek);
    }
    summary.contactsPatched++;
  }

  for (const d of await ctx.db.query("libraryDocuments").collect()) {
    if (!needsOrgBackfill(d.organizationId, valid)) continue;
    if (!dry) {
      await ctx.db.patch(d._id, {
        organizationId: orgId,
        updatedAt: now,
      });
    }
    summary.libraryDocumentsPatched++;
  }

  for (const f of await ctx.db.query("savedFilterPresets").collect()) {
    if (!needsOrgBackfill(f.organizationId, valid)) continue;
    if (!dry) {
      await ctx.db.patch(f._id, {
        organizationId: orgId,
        updatedAt: now,
      });
    }
    summary.savedFilterPresetsPatched++;
  }

  for (const msg of await ctx.db.query("fileMessages").collect()) {
    const file = await ctx.db.get(msg.pipelineFileId);
    let targetOrg: Id<"organizations"> | undefined;
    if (!file) {
      targetOrg = orgId;
    } else if (needsOrgBackfill(file.organizationId, valid)) {
      targetOrg = orgId;
    } else {
      targetOrg = file.organizationId as Id<"organizations">;
    }
    if (
      !needsOrgBackfill(msg.organizationId, valid) &&
      msg.organizationId === targetOrg
    ) {
      continue;
    }
    if (!dry) {
      await ctx.db.patch(msg._id, {
        organizationId: targetOrg,
        updatedAt: now,
      });
    }
    summary.fileMessagesPatched++;
  }

  for (const a of await ctx.db.query("taskAttachments").collect()) {
    const task = await ctx.db.get(a.taskId);
    if (!task) continue;
    let targetOrg: Id<"organizations"> | undefined;
    if (needsOrgBackfill(task.organizationId, valid)) {
      targetOrg = orgId;
    } else {
      targetOrg = task.organizationId as Id<"organizations">;
    }
    if (
      !needsOrgBackfill(a.organizationId, valid) &&
      a.organizationId === targetOrg
    ) {
      continue;
    }
    if (!dry) {
      await ctx.db.patch(a._id, { organizationId: targetOrg });
    }
    summary.taskAttachmentsPatched++;
  }

  for (const env of await ctx.db.query("signatureEnvelopes").collect()) {
    const doc = await ctx.db.get(env.libraryDocumentId);
    let targetOrg: Id<"organizations"> | undefined;
    if (!doc) {
      targetOrg = orgId;
    } else if (needsOrgBackfill(doc.organizationId, valid)) {
      targetOrg = orgId;
    } else {
      targetOrg = doc.organizationId as Id<"organizations">;
    }
    if (
      !needsOrgBackfill(env.organizationId, valid) &&
      env.organizationId === targetOrg
    ) {
      continue;
    }
    if (!dry) {
      await ctx.db.patch(env._id, {
        organizationId: targetOrg,
        updatedAt: now,
      });
    }
    summary.signatureEnvelopesPatched++;
  }

  return summary;
}

/**
 * Ensures the primary platform admin is an owner of `organizationId`, sets
 * `defaultOrganizationId`, dedupes `organizationMembers` for that pair, seeds
 * RBAC roles, then runs the full scoped backfill.
 *
 * Use this when `backfillLegacyOrgScopeToPrimary` fails because the primary user
 * is not yet a member of the target org.
 */
export const ensurePrimaryOrgMembershipAndBackfill = mutation({
  args: {
    adminSecret: v.string(),
    organizationId: v.id("organizations"),
    dryRun: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    assertDataMigrationAdmin(args.adminSecret);
    const dry = args.dryRun === true;
    const now = Date.now();
    const orgId = args.organizationId;

    const primary = await findPrimaryPlatformAuthUser(ctx);
    if (!primary) {
      throw new Error(
        "ensurePrimaryOrgMembershipAndBackfill: no primary platform admin auth user found.",
      );
    }
    const org = await ctx.db.get(orgId);
    if (!org) {
      throw new Error(
        `ensurePrimaryOrgMembershipAndBackfill: organization ${orgId} not found.`,
      );
    }

    const userKey = primary._id as string;
    const { adminId } = await seedSystemRolesForOrganization(ctx, orgId);
    if (!dry) {
      await syncSystemRolePermissions(ctx, orgId);
    }

    const membershipRows = await ctx.db
      .query("organizationMembers")
      .withIndex("by_org_user", (q) =>
        q.eq("organizationId", orgId).eq("userKey", userKey),
      )
      .collect();

    const best = pickBestOrgMember(membershipRows);
    let membershipDuplicateRowsRemoved = 0;
    let membershipInserted = false;
    let membershipRolePatched = false;

    if (best && membershipRows.length > 1) {
      for (const row of membershipRows) {
        if (row._id === best._id) continue;
        membershipDuplicateRowsRemoved++;
        if (!dry) {
          await ctx.db.delete(row._id);
        }
      }
    }

    if (!best) {
      membershipInserted = true;
      if (!dry) {
        await ctx.db.insert("organizationMembers", {
          organizationId: orgId,
          userKey,
          role: "owner",
          assignedRoleId: adminId,
          createdAt: now,
        });
      }
    } else {
      const needRole =
        best.role !== "owner" || best.assignedRoleId !== adminId;
      if (needRole) {
        membershipRolePatched = true;
        if (!dry) {
          await ctx.db.patch(best._id, {
            role: "owner",
            assignedRoleId: adminId,
          });
        }
      }
    }

    let defaultOrganizationIdPatched = false;
    if (primary.defaultOrganizationId !== orgId) {
      defaultOrganizationIdPatched = true;
      if (!dry) {
        await ctx.db.patch(primary._id, {
          defaultOrganizationId: orgId,
          updatedAt: now,
        });
      }
    }

    const backfillSummary = await runOrgScopeBackfill(ctx, {
      orgId,
      userKey,
      dry,
      now,
    });

    return {
      ...backfillSummary,
      membershipDuplicateRowsRemoved,
      membershipInserted,
      membershipRolePatched,
      defaultOrganizationIdPatched,
    } satisfies OrgScopeBackfillSummary;
  },
});

export const backfillLegacyOrgScopeToPrimary = mutation({
  args: {
    adminSecret: v.string(),
    /** Defaults to primary admin's `defaultOrganizationId`. */
    organizationId: v.optional(v.id("organizations")),
    dryRun: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    assertDataMigrationAdmin(args.adminSecret);
    const dry = args.dryRun === true;
    const now = Date.now();

    const primary = await findPrimaryPlatformAuthUser(ctx);
    if (!primary) {
      throw new Error(
        "backfillLegacyOrgScopeToPrimary: no primary platform admin auth user found.",
      );
    }
    const orgId = args.organizationId ?? primary.defaultOrganizationId;
    if (!orgId) {
      throw new Error(
        "backfillLegacyOrgScopeToPrimary: pass organizationId or set defaultOrganizationId on primary admin.",
      );
    }
    const org = await ctx.db.get(orgId);
    if (!org) {
      throw new Error(`backfillLegacyOrgScopeToPrimary: organization ${orgId} not found.`);
    }

    const userKey = primary._id as string;
    const mem = await ctx.db
      .query("organizationMembers")
      .withIndex("by_org_user", (q) =>
        q.eq("organizationId", orgId).eq("userKey", userKey),
      )
      .first();
    if (!mem) {
      throw new Error(
        "backfillLegacyOrgScopeToPrimary: primary admin is not a member of the target organization. " +
          "Run `ensurePrimaryOrgMembershipAndBackfill` with the same `organizationId` first.",
      );
    }

    return runOrgScopeBackfill(ctx, { orgId, userKey, dry, now });
  },
});
