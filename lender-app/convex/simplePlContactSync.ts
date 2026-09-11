/**
 * Sticky Simple P&L statements onto assigned contacts (reuse across files).
 */
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import {
  simplePlFingerprintFromInstance,
  simplePlFingerprintFromStored,
  simplePlInstanceToProfileShape,
} from "../lib/contacts/simplePlFromDeal";
import {
  normalizeSimplePlInstances,
  simplePlInstanceIsFilled,
  type SimplePlInstance,
} from "../lib/simplePl/simplePlInstances";
import { assertCanMutateContactRow } from "./organizationAccess";

export async function syncSimplePlInstanceToAssignedContacts(
  ctx: MutationCtx,
  file: Doc<"pipeline">,
  instance: SimplePlInstance,
  memberUserKey?: string,
): Promise<void> {
  if (!file.organizationId) return;
  if (!simplePlInstanceIsFilled(instance)) return;
  const contactIds = (instance.assignedContactIds ?? []).filter(Boolean);
  if (contactIds.length === 0) return;
  const fingerprint = simplePlFingerprintFromInstance(instance);
  const shape = simplePlInstanceToProfileShape(instance, 0);

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
    await assertCanMutateContactRow(ctx, contact, memberUserKey);

    const existing = await ctx.db
      .query("contactSimplePlStatements")
      .withIndex("by_contact_sort", (q) => q.eq("contactId", contact._id))
      .collect();
    const live = existing.filter((row) => row.archivedAt == null);
    const match = live.find(
      (row) => simplePlFingerprintFromStored(row) === fingerprint,
    );
    const now = Date.now();
    if (match) {
      await ctx.db.patch(match._id, {
        ...shape,
        sortOrder: match.sortOrder,
        updatedAt: now,
      });
      continue;
    }
    const nextSort =
      live.reduce((max, row) => Math.max(max, row.sortOrder), -1) + 1;
    const { sortOrder: _ignoredSort, ...fields } = shape;
    void _ignoredSort;
    await ctx.db.insert("contactSimplePlStatements", {
      organizationId: contact.organizationId ?? file.organizationId,
      contactId: contact._id,
      sortOrder: nextSort,
      ...fields,
      createdAt: now,
      updatedAt: now,
    });
  }
}

export async function syncSimplePlInstancesToAssignedContacts(
  ctx: MutationCtx,
  file: Doc<"pipeline">,
  instances: readonly SimplePlInstance[] | unknown,
  memberUserKey?: string,
): Promise<void> {
  const list = Array.isArray(instances)
    ? normalizeSimplePlInstances({ simplePlInstances: instances })
    : [];
  for (const inst of list) {
    await syncSimplePlInstanceToAssignedContacts(ctx, file, inst, memberUserKey);
  }
}
