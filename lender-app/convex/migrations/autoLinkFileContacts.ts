/**
 * Phase 37.1.E — Auto-link pipeline files to existing contacts by borrower name.
 * Creates `contactFileLinks` when `deal.borrowers[0]` matches `contacts.name`.
 */
import { v } from "convex/values";
import { mutation } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { assertDataMigrationAdmin } from "../migrationAdminAuth";
import { embeddedDealPayloadIsSubstantive } from "../../lib/file/embeddedDealPresence";
import { pickIntakeShapedPreviewPayload } from "../../lib/pipeline/pickIntakeShapedPreviewPayload";
import { DEFAULT_CONTACT_ROLE_IDS } from "../../lib/contact/contactRoles";

const CLIENT_ROLE_ID = DEFAULT_CONTACT_ROLE_IDS.client;

export type AutoLinkSummary = {
  dryRun: boolean;
  scannedFiles: number;
  filesWithoutLinks: number;
  filesWithLinksSkipped: number;
  noBorrowerPrimaryName: number;
  wouldLink: number;
  linked: number;
  noContactMatch: number;
  linkAlreadyExists: number;
  sampleWouldLink: Array<{
    fileId: string;
    fileName: string;
    borrowerName: string;
    contactId: string;
    contactName: string;
  }>;
  sampleUnresolved: Array<{
    fileId: string;
    fileName: string;
    borrowerName: string;
  }>;
  nextCursor: Id<"pipeline"> | null;
};

type DealRecord = Record<string, unknown>;

function str(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const t = value.trim();
  return t || undefined;
}

function normName(s: string | undefined): string {
  return (s ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

function collapseWs(s: string): string {
  return s.trim().replace(/\s+/g, " ");
}

function personNameFromBorrowerRow(row: unknown): string {
  if (!row || typeof row !== "object") return "";
  const rec = row as Record<string, unknown>;
  const first = typeof rec.firstName === "string" ? rec.firstName : "";
  const middle = typeof rec.middleName === "string" ? rec.middleName : "";
  const last = typeof rec.lastName === "string" ? rec.lastName : "";
  return collapseWs([first, middle, last].filter(Boolean).join(" "));
}

function primaryBorrowerName(deal: DealRecord): string {
  const borrowers = Array.isArray(deal.borrowers) ? deal.borrowers : [];
  if (borrowers.length > 0) {
    const name = personNameFromBorrowerRow(borrowers[0]);
    if (name) return name;
  }
  const clientName = str(deal.clientName);
  if (clientName) return clientName;
  return "";
}

type ContactLookups = {
  byName: Map<string, Doc<"contacts">[]>;
};

function buildContactLookups(
  contacts: Doc<"contacts">[],
  organizationId: Id<"organizations"> | undefined,
): ContactLookups {
  const byName = new Map<string, Doc<"contacts">[]>();
  for (const c of contacts) {
    if (organizationId && c.organizationId && c.organizationId !== organizationId) {
      continue;
    }
    const key = normName(c.name);
    if (!key) continue;
    const list = byName.get(key) ?? [];
    list.push(c);
    byName.set(key, list);
  }
  return { byName };
}

function matchContactByName(
  name: string,
  lookups: ContactLookups,
  organizationId: Id<"organizations"> | undefined,
): Doc<"contacts"> | null {
  const key = normName(name);
  if (!key) return null;
  const candidates = lookups.byName.get(key) ?? [];
  if (candidates.length === 0) return null;
  if (organizationId) {
    const orgMatch = candidates.find(
      (c) => c.organizationId === organizationId || c.organizationId == null,
    );
    if (orgMatch) return orgMatch;
  }
  return candidates[0] ?? null;
}

async function loadDealPayload(
  ctx: MutationCtx,
  file: Doc<"pipeline">,
): Promise<DealRecord | null> {
  const linked =
    file.intakeSheetId != null ? await ctx.db.get(file.intakeSheetId) : null;
  const embedded = embeddedDealPayloadIsSubstantive(file.dealData)
    ? (file.dealData as DealRecord)
    : null;
  return pickIntakeShapedPreviewPayload(
    embedded,
    linked as DealRecord | null,
    file.updatedAt,
  ) as DealRecord | null;
}

function emptySummary(dryRun: boolean): AutoLinkSummary {
  return {
    dryRun,
    scannedFiles: 0,
    filesWithoutLinks: 0,
    filesWithLinksSkipped: 0,
    noBorrowerPrimaryName: 0,
    wouldLink: 0,
    linked: 0,
    noContactMatch: 0,
    linkAlreadyExists: 0,
    sampleWouldLink: [],
    sampleUnresolved: [],
    nextCursor: null,
  };
}

export const autoLinkFileContacts = mutation({
  args: {
    adminSecret: v.string(),
    dryRun: v.boolean(),
    limit: v.optional(v.number()),
    organizationId: v.optional(v.id("organizations")),
    cursor: v.optional(v.id("pipeline")),
    preferNewestFirst: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    assertDataMigrationAdmin(args.adminSecret);

    const dryRun = args.dryRun;
    const limit = Math.max(1, Math.min(5000, Math.floor(args.limit ?? 100)));
    const preferNewest = args.preferNewestFirst !== false;
    const summary = emptySummary(dryRun);
    const now = Date.now();

    let files = await ctx.db.query("pipeline").collect();
    if (args.organizationId) {
      files = files.filter((f) => f.organizationId === args.organizationId);
    }
    if (preferNewest) {
      files.sort((a, b) => b.updatedAt - a.updatedAt);
    } else {
      files.sort((a, b) => a.updatedAt - b.updatedAt);
    }

    let startIdx = 0;
    if (args.cursor) {
      const cursorIdx = files.findIndex((f) => f._id === args.cursor);
      if (cursorIdx >= 0) startIdx = cursorIdx + 1;
    }

    const batch = files.slice(startIdx, startIdx + limit);
    const hasMore = startIdx + batch.length < files.length;
    summary.nextCursor =
      hasMore && batch.length > 0 ? batch[batch.length - 1]!._id : null;

    const allContacts = await ctx.db.query("contacts").collect();

    for (const file of batch) {
      summary.scannedFiles += 1;

      const existingLinks = await ctx.db
        .query("contactFileLinks")
        .withIndex("by_file", (q) => q.eq("fileId", file._id))
        .collect();

      if (existingLinks.length > 0) {
        summary.filesWithLinksSkipped += 1;
        continue;
      }

      summary.filesWithoutLinks += 1;

      const deal = await loadDealPayload(ctx, file);
      if (!deal) {
        summary.noBorrowerPrimaryName += 1;
        if (summary.sampleUnresolved.length < 50) {
          summary.sampleUnresolved.push({
            fileId: String(file._id),
            fileName: file.fileName,
            borrowerName: "",
          });
        }
        continue;
      }

      const borrowerName = primaryBorrowerName(deal);
      if (!borrowerName) {
        summary.noBorrowerPrimaryName += 1;
        if (summary.sampleUnresolved.length < 50) {
          summary.sampleUnresolved.push({
            fileId: String(file._id),
            fileName: file.fileName,
            borrowerName: "",
          });
        }
        continue;
      }

      const lookups = buildContactLookups(allContacts, file.organizationId);
      const contact = matchContactByName(
        borrowerName,
        lookups,
        file.organizationId,
      );

      if (!contact) {
        summary.noContactMatch += 1;
        if (summary.sampleUnresolved.length < 50) {
          summary.sampleUnresolved.push({
            fileId: String(file._id),
            fileName: file.fileName,
            borrowerName,
          });
        }
        continue;
      }

      const dup = await ctx.db
        .query("contactFileLinks")
        .withIndex("by_contact_file", (q) =>
          q.eq("contactId", contact._id).eq("fileId", file._id),
        )
        .first();
      if (dup) {
        summary.linkAlreadyExists += 1;
        continue;
      }

      if (dryRun) {
        summary.wouldLink += 1;
        if (summary.sampleWouldLink.length < 50) {
          summary.sampleWouldLink.push({
            fileId: String(file._id),
            fileName: file.fileName,
            borrowerName,
            contactId: String(contact._id),
            contactName: contact.name,
          });
        }
        continue;
      }

      await ctx.db.insert("contactFileLinks", {
        contactId: contact._id,
        fileId: file._id,
        role: "client",
        contactRoleId: CLIENT_ROLE_ID,
        notes: "Auto-linked by Phase 37.1.E migration (borrowers[0] name match)",
        createdAt: now,
        updatedAt: now,
      });
      summary.linked += 1;
      if (summary.sampleWouldLink.length < 50) {
        summary.sampleWouldLink.push({
          fileId: String(file._id),
          fileName: file.fileName,
          borrowerName,
          contactId: String(contact._id),
          contactName: contact.name,
        });
      }
    }

    return summary;
  },
});
