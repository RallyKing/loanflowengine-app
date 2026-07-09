/**
 * Phase 25.7b — append CRM roles to master `contacts.contactRoleIds` without overwrite.
 */
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import {
  canonicalContactRoleIdsFromDoc,
  mergeContactRoleIds,
  primaryContactRoleIdFromDoc,
} from "../../lib/contact/contactRoles";
import { readContactRolesForOrg } from "../organizationSettings";
import { isValidContactRoleId } from "../../lib/contact/contactRoles";
import { refreshContactGlobalSearchText } from "../globalSearchSync";

async function resolveRoleIdForOrg(
  ctx: QueryCtx | MutationCtx,
  organizationId: Id<"organizations"> | undefined,
  roleId: string,
): Promise<string> {
  const trimmed = roleId.trim();
  if (!organizationId) return trimmed;
  const roles = await readContactRolesForOrg(ctx, organizationId);
  if (isValidContactRoleId(roles, trimmed)) return trimmed;
  return trimmed;
}

/** Union `roleId` onto master contact (no duplicate ids). */
export async function appendMasterContactRoleId(
  ctx: MutationCtx,
  contact: Doc<"contacts">,
  roleId: string,
): Promise<Doc<"contacts">> {
  const resolved = await resolveRoleIdForOrg(
    ctx,
    contact.organizationId,
    roleId,
  );
  const current = canonicalContactRoleIdsFromDoc(contact);
  if (current.includes(resolved)) {
    return contact;
  }
  const nextIds = mergeContactRoleIds(current, [resolved]);
  const now = Date.now();
  await ctx.db.patch(contact._id, {
    contactRoleIds: nextIds,
    contactRoleId: contact.contactRoleId?.trim()
      ? contact.contactRoleId
      : primaryContactRoleIdFromDoc({ contactRoleIds: nextIds }),
    updatedAt: now,
  });
  await refreshContactGlobalSearchText(ctx, contact._id);
  const updated = await ctx.db.get(contact._id);
  return updated ?? contact;
}
