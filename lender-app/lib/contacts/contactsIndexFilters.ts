import type { Id } from "@/convex/_generated/dataModel";
import { effectiveContactRoleIdsFromDoc } from "@/lib/contact/contactRoles";
import type { ContactHubRecord } from "@/lib/contacts/contactWithPrimaryEntity";
import { contactSearchHaystack, primaryContactEmail } from "@/lib/contact/contactMethods";
import { contactDisplayCompany } from "@/lib/contacts/contactWithPrimaryEntity";

export type ContactRecordType = "individual" | "entity";

/** Empty type filter set = show all record types. */
export function matchesTypeFilters(
  kind: ContactRecordType,
  typeFilters: readonly ContactRecordType[],
): boolean {
  if (typeFilters.length === 0) return true;
  return typeFilters.includes(kind);
}

export function contactMatchesSearchTokens(
  c: ContactHubRecord,
  q: string,
  fileHaystack: string,
): boolean {
  const trimmed = q.trim().toLowerCase();
  if (!trimmed) return true;
  const tokens = trimmed.split(/\s+/).filter(Boolean);
  const companyHay = contactDisplayCompany(c);
  const hay = `${contactSearchHaystack(c, fileHaystack)} ${companyHay}`.toLowerCase();
  return tokens.every((t) => hay.includes(t));
}

export function entityMatchesSearchTokens(
  entity: {
    displayName: string;
    companyName?: string;
    primaryContactName?: string;
    ein?: string;
  },
  q: string,
): boolean {
  const trimmed = q.trim().toLowerCase();
  if (!trimmed) return true;
  const tokens = trimmed.split(/\s+/).filter(Boolean);
  const hay = [
    entity.displayName,
    entity.companyName,
    entity.primaryContactName,
    entity.ein,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return tokens.every((t) => hay.includes(t));
}

/** Contact must have every selected CRM role (AND semantics). */
export function contactMatchesAllRoleFilters(
  contact: ContactHubRecord,
  roleIds: readonly string[],
): boolean {
  if (roleIds.length === 0) return true;
  const effective = effectiveContactRoleIdsFromDoc(contact);
  return roleIds.every((id) => effective.includes(id));
}

export function contactMatchesEntityJunctionFilters(
  contactId: Id<"contacts">,
  entityLinkIndex:
    | Array<{
        contactId: Id<"contacts">;
        relationshipRole: string;
        position: string;
      }>
    | undefined,
  entityRelRoleFilters: readonly string[],
  entityPositionFilters: readonly string[],
): boolean {
  if (entityRelRoleFilters.length === 0 && entityPositionFilters.length === 0) {
    return true;
  }
  if (!entityLinkIndex) return false;
  return entityLinkIndex.some((link) => {
    if (link.contactId !== contactId) return false;
    const roleMatch =
      entityRelRoleFilters.length === 0 ||
      entityRelRoleFilters.includes(link.relationshipRole);
    const posMatch =
      entityPositionFilters.length === 0 ||
      entityPositionFilters.some(
        (p) => link.position.toLowerCase() === p.toLowerCase(),
      );
    return roleMatch && posMatch;
  });
}

export function individualListSublabel(c: ContactHubRecord): string | undefined {
  return primaryContactEmail(c) || contactDisplayCompany(c) || undefined;
}
