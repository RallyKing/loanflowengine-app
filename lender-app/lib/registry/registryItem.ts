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
import {
  entityWebsitesSearchBlob,
  resolveEntityWebsites,
  type EntityWebsite,
} from "@/lib/contacts/entityWebsites";

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
  /** CRM list fields (contacts; entities/lenders may omit). */
  linkStatus?: "linked" | "unlinked" | "partial";
  lastActivityAt?: number;
  lastInteractionAt?: number;
  crmTags?: string[];
  notes?: string;
  /** Entity websites (clients only). */
  websites?: EntityWebsite[];
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
    linkStatus: contact.linkStatus,
    lastActivityAt: contact.lastActivityAt,
    lastInteractionAt: contact.lastInteractionAt,
    crmTags: contact.crmTags,
    notes: contact.notes?.trim() || undefined,
  };
}

/** Borrower / partner business entity (`clients` table). */
export function mapEntityToRegistryItem(client: Doc<"clients">): RegistryItem {
  const websites = resolveEntityWebsites(client);
  return {
    _id: String(client._id),
    registryType: "entity",
    displayName: client.displayName?.trim() || client.companyName?.trim() || "Entity",
    primaryEmail: (client.primaryContactEmail ?? "").trim(),
    primaryPhone: (client.primaryContactPhone ?? "").trim(),
    roles: [REGISTRY_ROLE_IDS.client],
    updatedAt: client.updatedAt,
    ...(websites.length > 0 ? { websites } : {}),
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
    item.notes ?? "",
    ...(item.crmTags ?? []),
    ...item.roles,
    entityWebsitesSearchBlob(item.websites),
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
  sortBy:
    | "updatedAt"
    | "displayName"
    | "lastActivityAt"
    | "lastInteractionAt" = "updatedAt",
): RegistryItem[] {
  const sorted = [...items];
  if (sortBy === "displayName") {
    sorted.sort((a, b) =>
      a.displayName.localeCompare(b.displayName, "en", { sensitivity: "base" }),
    );
    return sorted;
  }
  if (sortBy === "lastActivityAt") {
    sorted.sort(
      (a, b) => (b.lastActivityAt ?? 0) - (a.lastActivityAt ?? 0),
    );
    return sorted;
  }
  if (sortBy === "lastInteractionAt") {
    sorted.sort(
      (a, b) => (b.lastInteractionAt ?? 0) - (a.lastInteractionAt ?? 0),
    );
    return sorted;
  }
  sorted.sort((a, b) => b.updatedAt - a.updatedAt);
  return sorted;
}

export function registryItemMatchesLinkStatusFilter(
  item: RegistryItem,
  linkStatusFilter: readonly RegistryItem["linkStatus"][],
): boolean {
  if (linkStatusFilter.length === 0) return true;
  if (item.registryType !== "contact") return true;
  const status = item.linkStatus ?? "unlinked";
  return linkStatusFilter.includes(status);
}

export function registryItemMatchesTagFilter(
  item: RegistryItem,
  tagFilter: readonly string[],
): boolean {
  if (tagFilter.length === 0) return true;
  const tags = new Set((item.crmTags ?? []).map((t) => t.toLowerCase()));
  return tagFilter.every((t) => tags.has(t.toLowerCase()));
}

export function registryItemMatchesDateRange(
  item: RegistryItem,
  field: "lastActivityAt" | "lastInteractionAt" | "updatedAt",
  fromMs?: number,
  toMs?: number,
): boolean {
  const value = item[field];
  if (fromMs != null && (value == null || value < fromMs)) return false;
  if (toMs != null && (value == null || value > toMs)) return false;
  return true;
}
