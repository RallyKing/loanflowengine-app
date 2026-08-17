/**
 * Sticky PFS financials onto assigned contacts (reuse across files).
 */
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import {
  assetsToProfileArray,
  liabilitiesToProfileArray,
} from "../lib/contacts/pfsFromDeal";
import { pfsToLegacyAssetLiabilityRows } from "../lib/pfs/personalFinancialStatementModel";
import { normalizePfsInstances, type PfsInstance } from "../lib/pfs/pfsInstances";
import { assertCanMutateContactRow } from "./organizationAccess";

export async function upsertContactFinancialProfilePfs(
  ctx: MutationCtx,
  args: {
    contact: Doc<"contacts">;
    file: Doc<"pipeline">;
    assets?: ReturnType<typeof assetsToProfileArray>;
    liabilities?: ReturnType<typeof liabilitiesToProfileArray>;
    memberUserKey?: string;
  },
): Promise<void> {
  const { contact, file, assets, liabilities, memberUserKey } = args;
  if (assets === undefined && liabilities === undefined) return;

  await assertCanMutateContactRow(ctx, contact, memberUserKey);

  const existing = await ctx.db
    .query("contactFinancialProfiles")
    .withIndex("by_contact", (q) => q.eq("contactId", contact._id))
    .first();

  const now = Date.now();
  const financialPatch = {
    ...(assets !== undefined ? { assets } : {}),
    ...(liabilities !== undefined ? { liabilities } : {}),
  };

  if (existing) {
    await ctx.db.patch(existing._id, {
      ...financialPatch,
      updatedAt: now,
    });
    return;
  }

  await ctx.db.insert("contactFinancialProfiles", {
    organizationId: contact.organizationId ?? file.organizationId,
    contactId: contact._id,
    income: [],
    assets: assets ?? [],
    liabilities: liabilities ?? [],
    createdAt: now,
    updatedAt: now,
  });
}

export async function syncPfsInstanceToAssignedContacts(
  ctx: MutationCtx,
  file: Doc<"pipeline">,
  instance: PfsInstance,
  memberUserKey?: string,
): Promise<void> {
  if (!file.organizationId) return;
  const contactIds = (instance.assignedContactIds ?? []).filter(Boolean);
  if (contactIds.length === 0) return;
  const legacy = pfsToLegacyAssetLiabilityRows(instance.data);
  for (const rawId of contactIds) {
    const contact = await ctx.db.get(rawId as Id<"contacts">);
    if (!contact) continue;
    if (
      contact.organizationId &&
      file.organizationId &&
      contact.organizationId !== file.organizationId
    ) {
      continue;
    }
    await upsertContactFinancialProfilePfs(ctx, {
      contact,
      file,
      assets: assetsToProfileArray(legacy.assets),
      liabilities: liabilitiesToProfileArray(legacy.liabilities),
      memberUserKey,
    });
  }
}

export async function syncPfsInstancesToAssignedContacts(
  ctx: MutationCtx,
  file: Doc<"pipeline">,
  instances: readonly PfsInstance[] | unknown,
  memberUserKey?: string,
): Promise<void> {
  const list = Array.isArray(instances)
    ? normalizePfsInstances({ pfsInstances: instances })
    : [];
  for (const inst of list) {
    await syncPfsInstanceToAssignedContacts(ctx, file, inst, memberUserKey);
  }
}
