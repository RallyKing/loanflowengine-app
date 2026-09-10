/**
 * P0-05 â€” Attach legacy unscoped discovery rows to a target organization.
 *
 * Targets rows in `lenderCandidates` and `discoveryRuns` where
 * `organizationId` is missing (or points at a deleted org).
 *
 * Admin-gated via `DATA_MIGRATION_ADMIN_SECRET` / `ORG_INTEGRITY_ADMIN_SECRET`.
 * Additive only â€” does not delete or redesign discovery product tables.
 *
 * ## Dry-run (recommended first)
 *
 * ```bash
 * npx convex run migrations/backfillDiscoveryOrgScope:backfillDiscoveryOrgScope \
 *   '{"adminSecret":"<DATA_MIGRATION_ADMIN_SECRET>","organizationId":"<orgId>","dryRun":true}'
 * ```
 *
 * Returns counts of rows that *would* be patched without writing.
 *
 * ## Apply
 *
 * ```bash
 * npx convex run migrations/backfillDiscoveryOrgScope:backfillDiscoveryOrgScope \
 *   '{"adminSecret":"<DATA_MIGRATION_ADMIN_SECRET>","organizationId":"<orgId>","dryRun":false}'
 * ```
 *
 * Or omit `dryRun` (defaults to apply). Prefer an explicit `dryRun:false`.
 */
import { v } from "convex/values";
import type { Id } from "../_generated/dataModel";
import { mutation } from "../_generated/server";
import type { MutationCtx } from "../_generated/server";
import { assertDataMigrationAdmin } from "../migrationAdminAuth";

export type DiscoveryOrgBackfillSummary = {
  dryRun: boolean;
  targetOrganizationId: string;
  lenderCandidatesPatched: number;
  lenderCandidatesAlreadyScoped: number;
  discoveryRunsPatched: number;
  discoveryRunsAlreadyScoped: number;
};

async function validOrganizationIds(ctx: MutationCtx): Promise<Set<string>> {
  const rows = await ctx.db.query("organizations").collect() /* bounded: organizations table is tenant registry, small */;
  return new Set(rows.map((r) => r._id as string));
}

function needsOrgBackfill(
  organizationId: Id<"organizations"> | undefined,
  valid: Set<string>,
): boolean {
  if (organizationId === undefined) return true;
  return !valid.has(organizationId as string);
}

async function runDiscoveryOrgBackfill(
  ctx: MutationCtx,
  {
    orgId,
    dry,
  }: {
    orgId: Id<"organizations">;
    dry: boolean;
  },
): Promise<DiscoveryOrgBackfillSummary> {
  const valid = await validOrganizationIds(ctx);
  const summary: DiscoveryOrgBackfillSummary = {
    dryRun: dry,
    targetOrganizationId: orgId as string,
    lenderCandidatesPatched: 0,
    lenderCandidatesAlreadyScoped: 0,
    discoveryRunsPatched: 0,
    discoveryRunsAlreadyScoped: 0,
  };

  for (const row of await ctx.db.query("lenderCandidates").collect() /* bounded: admin one-shot backfill over lenderCandidates; gated by assertDataMigrationAdmin */) {
    if (!needsOrgBackfill(row.organizationId, valid)) {
      summary.lenderCandidatesAlreadyScoped += 1;
      continue;
    }
    if (!dry) {
      await ctx.db.patch(row._id, { organizationId: orgId });
    }
    summary.lenderCandidatesPatched += 1;
  }

  for (const row of await ctx.db.query("discoveryRuns").collect() /* bounded: admin one-shot backfill over discoveryRuns; gated by assertDataMigrationAdmin */) {
    if (!needsOrgBackfill(row.organizationId, valid)) {
      summary.discoveryRunsAlreadyScoped += 1;
      continue;
    }
    if (!dry) {
      await ctx.db.patch(row._id, { organizationId: orgId });
    }
    summary.discoveryRunsPatched += 1;
  }

  return summary;
}

/**
 * Backfill `organizationId` on unscoped discovery candidates and runs.
 * Always dry-run first in production.
 */
export const backfillDiscoveryOrgScope = mutation({
  args: {
    adminSecret: v.string(),
    organizationId: v.id("organizations"),
    /** When true, count rows that need patching without writing. */
    dryRun: v.optional(v.boolean()),
  },
  handler: async (ctx, args): Promise<DiscoveryOrgBackfillSummary> => {
    assertDataMigrationAdmin(args.adminSecret);
    const org = await ctx.db.get(args.organizationId);
    if (!org) {
      throw new Error(
        `backfillDiscoveryOrgScope: organization ${args.organizationId} not found.`,
      );
    }
    const dry = args.dryRun === true;
    return runDiscoveryOrgBackfill(ctx, {
      orgId: args.organizationId,
      dry,
    });
  },
});
