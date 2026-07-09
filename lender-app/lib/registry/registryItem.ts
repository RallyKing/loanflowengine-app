/**
 * Phase Registry-2 — unified read model for the federated directory.
 * Shared between Convex mappers and the Phase 3 UI.
 */
import type { Doc } from "@/convex/_generated/dataModel";
import {
  primaryContactEmail,
  primaryContactPhone,
} from "@/lib/contact/contactMethods";
import {
  effectiveContactRoleIdsFromDoc,
} from "@/lib/contact/contactRoles";
import {
  REGISTRY_ROLE_IDS,
  coerceRegistryRoleId,
  type RegistryRoleId,
} from "@/lib/registry/universalRoles";

export const REGISTRY_TYPES = ["contact", "entity", "lender"] as const;
export type RegistryType = (typeof REGISTRY_TYPES)[number];

/** Normalized row returned by `api.registry.list`. */
export type RegistryItem = {
  /** Original Convex document id (string form). */
  _id: string;
  registryType: RegistryType;
  displayName: string;
  primaryEmail: string;
  primaryPhone: string;
  roles: RegistryRoleId[];
  updatedAt: number;
};

export function mapContactToRegistryItem(
  contact: Doc<"contacts">,
): RegistryItem {
  const legacyRoles = effectiveContactRoleIdsFromDoc(contact);
  const roles = [...new Set(legacyRoles.map((id) => coerceRegistryRoleId(id)))];
  return {
    _id: String(contact._id),
    registryType: "contact",
    displayName: contact.name?.trim() || "Contact",
    primaryEmail: primaryContactEmail(contact).trim(),
    primaryPhone: primaryContactPhone(contact).trim(),
    roles: roles.length > 0 ? roles : [REGISTRY_ROLE_IDS.client],
    updatedAt: contact.updatedAt,
  };
}

/** Borrower / partner business entity (`clients` table). */
export function mapEntityToRegistryItem(client: Doc<"clients">): RegistryItem {
  return {
    _id: String(client._id),
    registryType: "entity",
    displayName: client.displayName?.trim() || client.companyName?.trim() || "Entity",
    primaryEmail: (client.primaryContactEmail ?? "").trim(),
    primaryPhone: (client.primaryContactPhone ?? "").trim(),
    roles: [REGISTRY_ROLE_IDS.client],
    updatedAt: client.updatedAt,
  };
}

export function mapLenderToRegistryItem(lender: Doc<"lenders">): RegistryItem {
  return {
    _id: String(lender._id),
    registryType: "lender",
    displayName: lender.company?.trim() || "Lender",
    primaryEmail: (lender.email ?? "").trim(),
    primaryPhone: (lender.phone ?? "").trim(),
    roles: [REGISTRY_ROLE_IDS.lenderRep],
    updatedAt: lender.updatedAt,
  };
}

export function registrySearchHaystack(item: RegistryItem): string {
  return [
    item.displayName,
    item.primaryEmail,
    item.primaryPhone,
    item.registryType,
    ...item.roles,
  ]
    .join(" ")
    .toLowerCase();
}

/** Every whitespace token must appear in the haystack (AND semantics). */
export function registryItemMatchesSearchQuery(
  item: RegistryItem,
  searchQuery: string,
): boolean {
  const trimmed = searchQuery.trim().toLowerCase();
  if (!trimmed) return true;
  const tokens = trimmed.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return true;
  const hay = registrySearchHaystack(item);
  return tokens.every((token) => hay.includes(token));
}

/** Item must include every selected registry role id (AND semantics). */
export function registryItemMatchesRoleFilter(
  item: RegistryItem,
  roleFilter: readonly RegistryRoleId[],
): boolean {
  if (roleFilter.length === 0) return true;
  const roleSet = new Set(item.roles);
  return roleFilter.every((roleId) => roleSet.has(roleId));
}

export function registryItemMatchesTypeFilter(
  item: RegistryItem,
  typeFilter: readonly RegistryType[],
): boolean {
  if (typeFilter.length === 0) return true;
  return typeFilter.includes(item.registryType);
}

export function sortRegistryItems(
  items: RegistryItem[],
  sortBy: "updatedAt" | "displayName" = "updatedAt",
): RegistryItem[] {
  const sorted = [...items];
  if (sortBy === "displayName") {
    sorted.sort((a, b) =>
      a.displayName.localeCompare(b.displayName, "en", { sensitivity: "base" }),
    );
    return sorted;
  }
  sorted.sort((a, b) => b.updatedAt - a.updatedAt);
  return sorted;
}
