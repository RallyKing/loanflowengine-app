import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { allContactEmailStrings } from "../lib/contact/contactMethods";

export function isGrantUsable(g: Doc<"clientPortalGrants">): boolean {
  if (g.status !== "active") return false;
  if (g.grantExpiresAt != null && g.grantExpiresAt < Date.now()) {
    return false;
  }
  return true;
}

/**
 * Effective permission for an active, non-expired grant. Legacy rows without
 * `permission` default to view + upload.
 */
export function effectivePermission(
  g: Doc<"clientPortalGrants">,
): "view" | "view_upload" | null {
  if (!isGrantUsable(g)) return null;
  const p = g.permission ?? "view_upload";
  if (p === "view" || p === "view_upload") return p;
  return "view_upload";
}

/** Broker inbox triage — legacy rows without `reviewStatus` stay in the active queue. */
export function effectivePortalUploadReviewStatus(
  row: Doc<"clientPortalUploads">,
): "unreviewed" | "archived" {
  return row.reviewStatus ?? "unreviewed";
}

export async function invalidateSessionsForGrant(
  ctx: MutationCtx,
  grantId: Id<"clientPortalGrants">,
): Promise<void> {
  const sessions = await ctx.db.query("clientPortalSessions").collect();
  for (const s of sessions) {
    if (!s.grantIds.includes(grantId)) continue;
    const remaining = s.grantIds.filter((id) => id !== grantId);
    if (remaining.length === 0) {
      await ctx.db.delete(s._id);
    } else {
      await ctx.db.patch(s._id, { grantIds: remaining });
    }
  }
}

/** Phase 39.2 — resolve CRM contact for a portal grantee email on a file. */
export async function resolvePortalGrantContactId(
  ctx: MutationCtx | QueryCtx,
  grant: Doc<"clientPortalGrants">,
  pipeline: Doc<"pipeline">,
): Promise<Id<"contacts"> | undefined> {
  const emailKey = grant.emailKey.trim();
  if (!emailKey) return undefined;

  if (pipeline.organizationId) {
    const byIndex = await ctx.db
      .query("contacts")
      .withIndex("by_organization_emailKey", (q) =>
        q.eq("organizationId", pipeline.organizationId!).eq("emailKey", emailKey),
      )
      .first();
    if (byIndex) return byIndex._id;
  }

  const links = await ctx.db
    .query("contactFileLinks")
    .withIndex("by_file", (q) => q.eq("fileId", pipeline._id))
    .collect();

  for (const link of links) {
    const contact = await ctx.db.get(link.contactId);
    if (!contact) continue;
    if (contact.emailKey === emailKey) return contact._id;
    if (allContactEmailStrings(contact).includes(emailKey)) return contact._id;
  }

  return undefined;
}
