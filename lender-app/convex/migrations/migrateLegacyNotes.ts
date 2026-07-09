/**
 * Phase 19.6 — Copy legacy `pipeline.notes` strings into `pipelineFileNotes`.
 * Clears the legacy field after successful insert to avoid duplicate runs.
 */
import { v } from "convex/values";
import type { Id } from "../_generated/dataModel";
import { mutation } from "../_generated/server";
import type { MutationCtx } from "../_generated/server";
import { assertDataMigrationAdmin } from "../migrationAdminAuth";

export const LEGACY_NOTES_MIGRATION_AUTHOR = "SYSTEM_MIGRATION" as const;

export type MigrateLegacyNotesSummary = {
  dryRun: boolean;
  scanned: number;
  migrated: number;
  skippedEmpty: number;
  skippedNoOrg: number;
  skippedAlreadyMigrated: number;
  errors: string[];
};

async function runMigrateLegacyNotes(
  ctx: MutationCtx,
  dryRun: boolean,
): Promise<MigrateLegacyNotesSummary> {
  const summary: MigrateLegacyNotesSummary = {
    dryRun,
    scanned: 0,
    migrated: 0,
    skippedEmpty: 0,
    skippedNoOrg: 0,
    skippedAlreadyMigrated: 0,
    errors: [],
  };

  const rows = await ctx.db.query("pipeline").collect();

  for (const file of rows) {
    summary.scanned += 1;
    const legacy = file.notes?.trim() ?? "";
    if (!legacy) {
      summary.skippedEmpty += 1;
      continue;
    }

    if (!file.organizationId) {
      summary.skippedNoOrg += 1;
      continue;
    }

    const existing = await ctx.db
      .query("pipelineFileNotes")
      .withIndex("by_file", (q) => q.eq("pipelineFileId", file._id))
      .collect();

    const alreadyMigrated = existing.some(
      (n) => n.authorUserKey === LEGACY_NOTES_MIGRATION_AUTHOR,
    );
    if (alreadyMigrated) {
      summary.skippedAlreadyMigrated += 1;
      continue;
    }

    if (!dryRun) {
      try {
        await ctx.db.insert("pipelineFileNotes", {
          organizationId: file.organizationId as Id<"organizations">,
          pipelineFileId: file._id,
          authorUserKey: LEGACY_NOTES_MIGRATION_AUTHOR,
          content: legacy,
          attachments: undefined,
        });
        await ctx.db.patch(file._id, { notes: undefined });
        summary.migrated += 1;
      } catch (caught) {
        const msg =
          caught instanceof Error ? caught.message : "Unknown migration error";
        summary.errors.push(`${String(file._id)}: ${msg}`);
      }
    } else {
      summary.migrated += 1;
    }
  }

  return summary;
}

/** Operator migration: legacy `pipeline.notes` → `pipelineFileNotes`. */
export const migrateLegacyNotes = mutation({
  args: {
    adminSecret: v.string(),
    dryRun: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    assertDataMigrationAdmin(args.adminSecret);
    return runMigrateLegacyNotes(ctx, args.dryRun === true);
  },
});
