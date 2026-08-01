import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";

export type ContactLinkStatus = "linked" | "unlinked" | "partial";

const INTERACTION_KINDS = new Set<Doc<"contactActivity">["kind"]>([
  "note",
  "call",
  "email",
  "meeting",
]);

export async function resolveContactLinkStatus(
  ctx: MutationCtx,
  contactId: Id<"contacts">,
): Promise<ContactLinkStatus> {
  const fileLinks = await ctx.db
    .query("contactFileLinks")
    .withIndex("by_contact", (q) => q.eq("contactId", contactId))
    .take(2);
  if (fileLinks.length === 0) return "unlinked";
  return "linked";
}

export async function refreshContactCrmListFields(
  ctx: MutationCtx,
  contactId: Id<"contacts">,
): Promise<void> {
  const contact = await ctx.db.get(contactId);
  if (!contact) return;

  const linkStatus = await resolveContactLinkStatus(ctx, contactId);

  const activities = await ctx.db
    .query("contactActivity")
    .withIndex("by_contact_at", (q) => q.eq("contactId", contactId))
    .order("desc")
    .take(50);

  let lastActivityAt = contact.lastActivityAt;
  let lastInteractionAt = contact.lastInteractionAt;

  for (const row of activities) {
    if (lastActivityAt == null || row.at > lastActivityAt) {
      lastActivityAt = row.at;
    }
    if (
      INTERACTION_KINDS.has(row.kind) &&
      (lastInteractionAt == null || row.at > lastInteractionAt)
    ) {
      lastInteractionAt = row.at;
    }
  }

  const patch: Partial<Doc<"contacts">> = { linkStatus };
  if (lastActivityAt != null) patch.lastActivityAt = lastActivityAt;
  if (lastInteractionAt != null) patch.lastInteractionAt = lastInteractionAt;

  if (
    contact.linkStatus !== patch.linkStatus ||
    contact.lastActivityAt !== patch.lastActivityAt ||
    contact.lastInteractionAt !== patch.lastInteractionAt
  ) {
    await ctx.db.patch(contactId, patch);
  }
}

/** Incremental patch after a single activity row is inserted. */
export async function patchContactAfterActivity(
  ctx: MutationCtx,
  contactId: Id<"contacts">,
  activity: { at: number; kind: Doc<"contactActivity">["kind"] },
): Promise<void> {
  const contact = await ctx.db.get(contactId);
  if (!contact) return;

  const patch: Partial<Doc<"contacts">> = {};
  if (contact.lastActivityAt == null || activity.at > contact.lastActivityAt) {
    patch.lastActivityAt = activity.at;
  }
  if (
    INTERACTION_KINDS.has(activity.kind) &&
    (contact.lastInteractionAt == null || activity.at > contact.lastInteractionAt)
  ) {
    patch.lastInteractionAt = activity.at;
  }

  if (
    activity.kind === "file_linked" ||
    activity.kind === "file_unlinked" ||
    activity.kind === "lender_linked" ||
    activity.kind === "lender_unlinked"
  ) {
    patch.linkStatus = await resolveContactLinkStatus(ctx, contactId);
  }

  if (Object.keys(patch).length > 0) {
    await ctx.db.patch(contactId, patch);
  }
}
