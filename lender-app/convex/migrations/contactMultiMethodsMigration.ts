/**
 * Phase 24 — Migrate legacy `contacts.email` / `contacts.phone` into `emails[]` / `phones[]`.
 * Idempotent: skips rows that already have non-empty method arrays.
 */
import { v } from "convex/values";
import { mutation } from "../_generated/server";
import type { MutationCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { assertDataMigrationAdmin } from "../migrationAdminAuth";
import { refreshContactGlobalSearchText } from "../globalSearchSync";
import { newContactMethodId } from "../../lib/contact/contactMethods";

export type ContactMultiMethodsMigrationSummary = {
  dryRun: boolean;
  scanned: number;
  migrated: number;
  skippedAlreadyMigrated: number;
  skippedEmpty: number;
  errors: string[];
  rollbackLogIds: Id<"contactMultiMethodsMigrationLog">[];
};

function needsMigration(row: Doc<"contacts">): boolean {
  const legacyEmail = (row.email ?? "").trim();
  const legacyPhone = (row.phone ?? "").trim();
  const hasEmails = (row.emails?.length ?? 0) > 0;
  const hasPhones = (row.phones?.length ?? 0) > 0;
  if (legacyEmail && !hasEmails) return true;
  if (legacyPhone && !hasPhones) return true;
  return false;
}

function buildMigratedArrays(row: Doc<"contacts">): {
  emails: NonNullable<Doc<"contacts">["emails"]>;
  phones: NonNullable<Doc<"contacts">["phones"]>;
} {
  const legacyEmail = (row.email ?? "").trim();
  const legacyPhone = (row.phone ?? "").trim();
  const emails =
    (row.emails?.length ?? 0) > 0
      ? row.emails!
      : legacyEmail
        ? [
            {
              id: newContactMethodId(),
              label: "Other" as const,
              email: legacyEmail,
              isPrimary: true,
            },
          ]
        : [];
  const phones =
    (row.phones?.length ?? 0) > 0
      ? row.phones!
      : legacyPhone
        ? [
            {
              id: newContactMethodId(),
              label: "Other" as const,
              number: legacyPhone,
              isPrimary: true,
            },
          ]
        : [];
  return { emails, phones };
}

async function runMigration(
  ctx: MutationCtx,
  dryRun: boolean,
): Promise<ContactMultiMethodsMigrationSummary> {
  const summary: ContactMultiMethodsMigrationSummary = {
    dryRun,
    scanned: 0,
    migrated: 0,
    skippedAlreadyMigrated: 0,
    skippedEmpty: 0,
    errors: [],
    rollbackLogIds: [],
  };

  const rows = await ctx.db.query("contacts").collect();

  for (const row of rows) {
    summary.scanned += 1;
    if (!needsMigration(row)) {
      if ((row.emails?.length ?? 0) > 0 || (row.phones?.length ?? 0) > 0) {
        summary.skippedAlreadyMigrated += 1;
      } else {
        summary.skippedEmpty += 1;
      }
      continue;
    }

    const { emails, phones } = buildMigratedArrays(row);

    if (!dryRun) {
      try {
        const logId = await ctx.db.insert("contactMultiMethodsMigrationLog", {
          contactId: row._id,
          migratedAt: Date.now(),
          beforeEmail: row.email ?? "",
          beforePhone: row.phone ?? "",
          hadEmailsArray: (row.emails?.length ?? 0) > 0,
          hadPhonesArray: (row.phones?.length ?? 0) > 0,
          beforeEmailsJson: row.emails
            ? JSON.stringify(row.emails)
            : undefined,
          beforePhonesJson: row.phones
            ? JSON.stringify(row.phones)
            : undefined,
        });
        summary.rollbackLogIds.push(logId);

        await ctx.db.patch(row._id, {
          emails: emails.length ? emails : undefined,
          phones: phones.length ? phones : undefined,
          email: emails.find((e) => e.isPrimary)?.email ?? row.email,
          phone: phones.find((p) => p.isPrimary)?.number ?? row.phone,
          updatedAt: Date.now(),
        });
        await refreshContactGlobalSearchText(ctx, row._id);
        summary.migrated += 1;
      } catch (caught) {
        const msg =
          caught instanceof Error ? caught.message : "Unknown migration error";
        summary.errors.push(`${String(row._id)}: ${msg}`);
      }
    } else {
      summary.migrated += 1;
    }
  }

  return summary;
}

export const migrateContactMultiMethods = mutation({
  args: {
    adminSecret: v.string(),
    dryRun: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    assertDataMigrationAdmin(args.adminSecret);
    return runMigration(ctx, args.dryRun === true);
  },
});

export const rollbackContactMultiMethodsMigration = mutation({
  args: {
    adminSecret: v.string(),
    dryRun: v.optional(v.boolean()),
    /** When set, only rollback these log row ids. */
    logIds: v.optional(v.array(v.id("contactMultiMethodsMigrationLog"))),
  },
  handler: async (ctx, args) => {
    assertDataMigrationAdmin(args.adminSecret);
    const dryRun = args.dryRun === true;
    let logs = await ctx.db.query("contactMultiMethodsMigrationLog").collect();
    if (args.logIds?.length) {
      const want = new Set(args.logIds.map(String));
      logs = logs.filter((l) => want.has(String(l._id)));
    }
    logs = logs.filter((l) => l.rolledBackAt == null);

    let rolled = 0;
    const errors: string[] = [];

    for (const log of logs) {
      const contact = await ctx.db.get(log.contactId);
      if (!contact) {
        errors.push(`${String(log._id)}: contact missing`);
        continue;
      }
      if (!dryRun) {
        try {
          await ctx.db.patch(log.contactId, {
            email: log.beforeEmail,
            phone: log.beforePhone,
            emails: log.hadEmailsArray
              ? log.beforeEmailsJson
                ? JSON.parse(log.beforeEmailsJson)
                : undefined
              : undefined,
            phones: log.hadPhonesArray
              ? log.beforePhonesJson
                ? JSON.parse(log.beforePhonesJson)
                : undefined
              : undefined,
            updatedAt: Date.now(),
          });
          await ctx.db.patch(log._id, { rolledBackAt: Date.now() });
          await refreshContactGlobalSearchText(ctx, log.contactId);
          rolled += 1;
        } catch (caught) {
          errors.push(
            `${String(log._id)}: ${
              caught instanceof Error ? caught.message : "rollback failed"
            }`,
          );
        }
      } else {
        rolled += 1;
      }
    }

    return { dryRun, rolled, errors };
  },
});
