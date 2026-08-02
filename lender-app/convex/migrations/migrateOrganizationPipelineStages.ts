/**
 * Idempotent migration: seed org pipeline stages from legacy funnel and map pipeline rows.
 */
import { v } from "convex/values";
import { mutation, query } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { assertDataMigrationAdmin } from "../migrationAdminAuth";
import { LEGACY_FUNNEL_STAGE_SEEDS } from "../../lib/pipeline/legacyStageSeed";
import {
  findStageBySlug,
  findStageForPipelineStatus,
  orgHasPipelineStages,
  resolveLegacyStatusToSlug,
  seedDefaultOrgPipelineStages,
} from "../organizationPipelineStagesHelpers";

export type LegacyStatusCount = { raw: string; slug: string; count: number };

export type ProposedStageMapping = {
  organizationId: Id<"organizations">;
  organizationName: string;
  pipelineFileId: Id<"pipeline">;
  legacyStatus: string;
  resolvedSlug: string;
  targetStageName: string;
  targetStageId?: Id<"organizationPipelineStages">;
  skippedReason?: string;
};

export type MigrateOrgPipelineStagesSummary = {
  dryRun: boolean;
  startedAt: number;
  finishedAt: number;
  durationMs: number;
  organizationsScanned: number;
  organizationsRequiringMigration: number;
  organizationsWithExistingStages: number;
  stagesSeeded: number;
  pipelineRowsToMap: number;
  pipelineRowsPatched: number;
  pipelineRowsSkipped: number;
  pipelineRowsAlreadyMapped: number;
  legacyStatusesDiscovered: LegacyStatusCount[];
  proposedStageMappings: ProposedStageMapping[];
  subStageRowsCreated: number;
  errors: string[];
  idempotentSecondPass?: {
    pipelineRowsPatched: number;
    stagesSeeded: number;
    pipelineRowsToMap: number;
  };
};

function tallyLegacyStatus(
  map: Map<string, LegacyStatusCount>,
  raw: string,
  slug: string,
) {
  const key = `${raw}::${slug}`;
  const row = map.get(key) ?? { raw, slug, count: 0 };
  row.count += 1;
  map.set(key, row);
}

export const migrateAllOrganizations = mutation({
  args: {
    adminSecret: v.string(),
    dryRun: v.optional(v.boolean()),
    /** When true (live only), immediately re-run logic to prove idempotency. */
    confirmIdempotency: v.optional(v.boolean()),
  },
  handler: async (ctx, { adminSecret, dryRun, confirmIdempotency }) => {
    assertDataMigrationAdmin(adminSecret);
    const dry = dryRun === true;
    const startedAt = Date.now();
    const legacyMap = new Map<string, LegacyStatusCount>();
    const proposed: ProposedStageMapping[] = [];
    const errors: string[] = [];

    const orgs = await ctx.db.query("organizations").collect();
    let organizationsRequiringMigration = 0;
    let organizationsWithExistingStages = 0;
    let pipelineRowsToMap = 0;
    let pipelineRowsPatched = 0;
    let pipelineRowsSkipped = 0;
    let pipelineRowsAlreadyMapped = 0;
    let stagesSeeded = 0;
    let stagesWouldSeed = 0;

    for (const org of orgs) {
      const hasStages = await orgHasPipelineStages(ctx, org._id);
      if (hasStages) organizationsWithExistingStages += 1;
      else {
        organizationsRequiringMigration += 1;
        if (dry) stagesWouldSeed += LEGACY_FUNNEL_STAGE_SEEDS.length;
      }

      if (!dry) {
        const seeded = await seedDefaultOrgPipelineStages(
          ctx,
          org._id,
          "__migration__",
        );
        if (seeded.seeded) stagesSeeded += seeded.stageCount;
      }

      const pipelines = await ctx.db
        .query("pipeline")
        .withIndex("by_organization_createdAt", (q) =>
          q.eq("organizationId", org._id),
        )
        .collect();

      for (const row of pipelines) {
        if (row.stageId) {
          pipelineRowsAlreadyMapped += 1;
          continue;
        }
        const slug = resolveLegacyStatusToSlug(row.status);
        tallyLegacyStatus(legacyMap, row.status, slug);
        let stage = await findStageForPipelineStatus(ctx, org._id, row.status);
        let targetStageName: string;
        let targetStageId: Id<"organizationPipelineStages"> | undefined;
        if (stage) {
          targetStageName = stage.name;
          targetStageId = stage._id;
        } else if (!hasStages) {
          const seed = LEGACY_FUNNEL_STAGE_SEEDS.find((s) => s.slug === slug);
          if (seed) {
            targetStageName = seed.name;
          } else {
            pipelineRowsSkipped += 1;
            proposed.push({
              organizationId: org._id,
              organizationName: org.name,
              pipelineFileId: row._id,
              legacyStatus: row.status,
              resolvedSlug: slug,
              targetStageName: "(unmapped)",
              skippedReason: "no_matching_stage",
            });
            continue;
          }
        } else {
          pipelineRowsSkipped += 1;
          proposed.push({
            organizationId: org._id,
            organizationName: org.name,
            pipelineFileId: row._id,
            legacyStatus: row.status,
            resolvedSlug: slug,
            targetStageName: "(unmapped)",
            skippedReason: "no_matching_stage",
          });
          continue;
        }
        pipelineRowsToMap += 1;
        proposed.push({
          organizationId: org._id,
          organizationName: org.name,
          pipelineFileId: row._id,
          legacyStatus: row.status,
          resolvedSlug: slug,
          targetStageName,
          ...(targetStageId ? { targetStageId } : {}),
        });
        if (!dry && targetStageId) {
          await ctx.db.patch(row._id, {
            stageId: targetStageId,
            subStageId: undefined,
            status: slug,
            updatedAt: row.updatedAt,
          });
          pipelineRowsPatched += 1;
        }
      }
    }

    const finishedAt = Date.now();
    const summary: MigrateOrgPipelineStagesSummary = {
      dryRun: dry,
      startedAt,
      finishedAt,
      durationMs: finishedAt - startedAt,
      organizationsScanned: orgs.length,
      organizationsRequiringMigration,
      organizationsWithExistingStages,
      stagesSeeded: dry ? stagesWouldSeed : stagesSeeded,
      pipelineRowsToMap,
      pipelineRowsPatched: dry ? 0 : pipelineRowsPatched,
      pipelineRowsSkipped,
      pipelineRowsAlreadyMapped,
      legacyStatusesDiscovered: [...legacyMap.values()].sort(
        (a, b) => b.count - a.count,
      ),
      proposedStageMappings: proposed,
      subStageRowsCreated: 0,
      errors,
    };

    if (!dry && confirmIdempotency === true) {
      let secondPatch = 0;
      let secondSeed = 0;
      let secondToMap = 0;
      for (const org of orgs) {
        const seeded = await seedDefaultOrgPipelineStages(
          ctx,
          org._id,
          "__migration__",
        );
        if (seeded.seeded) secondSeed += seeded.stageCount;
        const pipelines = await ctx.db
          .query("pipeline")
          .withIndex("by_organization_createdAt", (q) =>
            q.eq("organizationId", org._id),
          )
          .collect();
        for (const row of pipelines) {
          if (row.stageId) continue;
          const slug = resolveLegacyStatusToSlug(row.status);
          const stage = await findStageForPipelineStatus(ctx, org._id, row.status);
          if (!stage) continue;
          secondToMap += 1;
          await ctx.db.patch(row._id, {
            stageId: stage._id,
            status: stage.slug,
            updatedAt: row.updatedAt,
          });
          secondPatch += 1;
        }
      }
      summary.idempotentSecondPass = {
        pipelineRowsPatched: secondPatch,
        stagesSeeded: secondSeed,
        pipelineRowsToMap: secondToMap,
      };
    }

    return summary;
  },
});

/** Post-migration integrity counts for one organization. */
export const verifyOrganizationIntegrity = query({
  args: {
    adminSecret: v.string(),
    organizationId: v.id("organizations"),
  },
  handler: async (ctx, { adminSecret, organizationId }) => {
    assertDataMigrationAdmin(adminSecret);
    const org = await ctx.db.get(organizationId);
    if (!org) throw new Error("Organization not found");

    const stages = await ctx.db
      .query("organizationPipelineStages")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", organizationId),
      )
      .collect();
    const subStages = await ctx.db
      .query("organizationPipelineSubStages")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", organizationId),
      )
      .collect();
    const stageById = new Map(stages.map((s) => [s._id as string, s]));
    const subById = new Map(subStages.map((s) => [s._id as string, s]));

    const pipelines = await ctx.db
      .query("pipeline")
      .withIndex("by_organization_createdAt", (q) =>
        q.eq("organizationId", organizationId),
      )
      .collect();

    let missingStageId = 0;
    let invalidStageId = 0;
    let orphanedSubStageId = 0;
    let statusMirrorMismatch = 0;
    let nullAssignmentDrift = 0;

    for (const row of pipelines) {
      if (!row.stageId) {
        missingStageId += 1;
        nullAssignmentDrift += 1;
        continue;
      }
      const stage = stageById.get(row.stageId as string);
      if (!stage) {
        invalidStageId += 1;
        continue;
      }
      const sub = row.subStageId
        ? subById.get(row.subStageId as string)
        : undefined;
      const expectedStatus = sub
        ? `${stage.slug}::${sub.slug}`
        : stage.slug;
      if (row.status !== expectedStatus) {
        statusMirrorMismatch += 1;
      }
      if (row.subStageId) {
        const sub = subById.get(row.subStageId as string);
        if (!sub || sub.parentStageId !== row.stageId) {
          orphanedSubStageId += 1;
        }
      }
    }

    const activeDefaults = stages.filter((s) => s.isDefault && !s.isArchived);
    return {
      organizationId,
      organizationName: org.name,
      pipelineFileCount: pipelines.length,
      stageCount: stages.length,
      subStageCount: subStages.length,
      missingStageId,
      invalidStageId,
      orphanedSubStageId,
      statusMirrorMismatch,
      nullAssignmentDrift,
      defaultStageCount: activeDefaults.length,
      defaultStageOk: activeDefaults.length === 1,
      defaultStageNames: activeDefaults.map((s) => s.name),
    };
  },
});

export const migrateOrganization = mutation({
  args: {
    adminSecret: v.string(),
    organizationId: v.id("organizations"),
    dryRun: v.optional(v.boolean()),
  },
  handler: async (ctx, { adminSecret, organizationId, dryRun }) => {
    assertDataMigrationAdmin(adminSecret);
    const dry = dryRun === true;
    let stagesSeeded = 0;
    let pipelineRowsPatched = 0;
    let pipelineRowsSkipped = 0;

    if (!dry) {
      const seeded = await seedDefaultOrgPipelineStages(
        ctx,
        organizationId,
        "__migration__",
      );
      if (seeded.seeded) stagesSeeded = seeded.stageCount;
    }

    const pipelines = await ctx.db
      .query("pipeline")
      .withIndex("by_organization_createdAt", (q) =>
        q.eq("organizationId", organizationId),
      )
      .collect();

    for (const row of pipelines) {
      if (row.stageId) {
        pipelineRowsSkipped += 1;
        continue;
      }
      const slug = resolveLegacyStatusToSlug(row.status);
      const stage = await findStageForPipelineStatus(ctx, organizationId, row.status);
      if (!stage) {
        pipelineRowsSkipped += 1;
        continue;
      }
      if (!dry) {
        await ctx.db.patch(row._id, {
          stageId: stage._id,
          status: stage.slug,
          updatedAt: row.updatedAt,
        });
      }
      pipelineRowsPatched += 1;
    }

    return {
      dryRun: dry,
      organizationId,
      stagesSeeded,
      pipelineRowsPatched,
      pipelineRowsSkipped,
    };
  },
});
