/**
 * Write-through for `dealData.clientName` so search / legacy readers stay
 * aligned with the live primary-borrower Client title. The pipeline hub table
 * computes the same label in `listTablePreview` and does not depend on this
 * stored field.
 *
 * Does **not** bump `pipeline.updatedAt` (OCC / expectedUpdatedAt safe).
 * Does **not** overwrite `pipeline.fileName` (user-editable file title).
 */
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import {
  mergePatchIntoDeal,
  resolveDealBaseForPipelinePatch,
} from "./dealDataMerge";
import { refreshPipelineGlobalSearchText } from "./globalSearchSync";
import { listLoanClientLinks } from "./pipelineMultiClientLinks";
import { sanitizeDbPatch } from "./sanitizeConvexPatch";
import {
  entityBorrowerLabelFromDealBusiness,
  resolveEntityDisplayNameForClientTitle,
  resolveFileHeaderPrimaryBorrowerLabel,
  type FileHeaderBorrowerContactLite,
} from "../lib/pipeline/resolveFileHeaderPrimaryBorrowerLabel";

function dealBusinessFromFile(file: Doc<"pipeline">): unknown {
  const deal =
    file.dealData != null &&
    typeof file.dealData === "object" &&
    !Array.isArray(file.dealData)
      ? (file.dealData as Record<string, unknown>)
      : null;
  return deal?.business;
}

export async function syncFileClientTitleFromPrimaryParties(
  ctx: MutationCtx,
  fileId: Id<"pipeline">,
): Promise<{ updated: boolean; title: string }> {
  const file = await ctx.db.get(fileId);
  if (!file) return { updated: false, title: "" };

  const links = await ctx.db
    .query("contactFileLinks")
    .withIndex("by_file", (q) => q.eq("fileId", fileId))
    .collect();

  const contactsById = new Map<
    Id<"contacts">,
    FileHeaderBorrowerContactLite
  >();
  for (const link of links) {
    const contact = await ctx.db.get(link.contactId);
    if (!contact) continue;
    contactsById.set(contact._id, {
      _id: contact._id,
      name: contact.name,
      companyName: contact.companyName,
    });
  }

  const linkedClients: Array<{
    displayName: string;
    relationshipType: string;
  }> = [];
  const loanLinks = await listLoanClientLinks(ctx, fileId);
  for (const lc of loanLinks) {
    const client = await ctx.db.get(lc.clientId);
    if (!client) continue;
    linkedClients.push({
      displayName: client.displayName,
      relationshipType: lc.relationshipType,
    });
  }

  let clientRecordLabel = "";
  let clientRecordEntityType: string | null = null;
  if (file.clientId) {
    const primary = await ctx.db.get(file.clientId);
    if (primary) {
      clientRecordLabel = primary.displayName.trim();
      clientRecordEntityType = primary.entityType ?? null;
    }
  }

  const deal =
    file.dealData != null &&
    typeof file.dealData === "object" &&
    !Array.isArray(file.dealData)
      ? (file.dealData as Record<string, unknown>)
      : {};
  const borrowers = Array.isArray(deal.borrowers) ? deal.borrowers : [];

  const entityDisplayName = resolveEntityDisplayNameForClientTitle({
    linkedClients,
    clientRecordLabel,
    clientRecordEntityType,
    dealBusiness: dealBusinessFromFile(file),
  });

  const live = resolveFileHeaderPrimaryBorrowerLabel({
    links,
    contactsById,
    dealBorrowers: borrowers,
    entityDisplayName,
    fallbackClientDisplayName:
      typeof deal.clientName === "string" ? deal.clientName : "",
  });

  const title = live.fromPrimaryBorrower
    ? live.label
    : entityBorrowerLabelFromDealBusiness(deal.business) ||
      (typeof deal.clientName === "string" ? deal.clientName.trim() : "");
  if (!title) return { updated: false, title: "" };

  const previous =
    typeof deal.clientName === "string" ? deal.clientName.trim() : "";
  if (previous === title) return { updated: false, title };

  const base = await resolveDealBaseForPipelinePatch(ctx, file);
  const mergedDeal = mergePatchIntoDeal(base, {
    clientName: title,
    updatedAt: Date.now(),
  }) as Record<string, unknown>;

  await ctx.db.patch(
    fileId,
    sanitizeDbPatch({
      dealData: mergedDeal as Doc<"pipeline">["dealData"],
    }) as Partial<Doc<"pipeline">>,
  );

  if (file.intakeSheetId) {
    await ctx.db.patch(
      file.intakeSheetId,
      sanitizeDbPatch({
        clientName: title,
        updatedAt: Date.now(),
      }) as Partial<Doc<"intakeSheets">>,
    );
  }

  await refreshPipelineGlobalSearchText(ctx, fileId);
  return { updated: true, title };
}
