/**
 * Phase 25 — org-scoped CRM contact roles (settings-driven catalog).
 * Phase 25.7b — master contacts support multiple roles via `contactRoleIds`.
 */

export type ContactRole = {
  /** Stable key — referenced by contacts and link tables. */
  id: string;
  displayName: string;
  isSystemDefault: boolean;
};

export type ContactRoleFields = {
  contactRoleIds?: readonly string[] | undefined;
  /** @deprecated Phase 25.7b — use `contactRoleIds`; kept for legacy rows/API. */
  contactRoleId?: string | undefined;
  crmRelationshipTypes?: readonly string[] | undefined;
  labels?: readonly string[] | undefined;
};

export const DEFAULT_CONTACT_ROLE_IDS = {
  client: "client",
  referralPartner: "referral_partner",
  dealPartner: "deal_partner",
  lenderRep: "lender_rep",
  lender: "lender",
  borrower: "borrower",
  guarantor: "guarantor",
} as const;

export type DefaultContactRoleId =
  (typeof DEFAULT_CONTACT_ROLE_IDS)[keyof typeof DEFAULT_CONTACT_ROLE_IDS];

export const DEFAULT_CONTACT_ROLES: ContactRole[] = [
  {
    id: DEFAULT_CONTACT_ROLE_IDS.client,
    displayName: "Client",
    isSystemDefault: true,
  },
  {
    id: DEFAULT_CONTACT_ROLE_IDS.referralPartner,
    displayName: "Referral Partner",
    isSystemDefault: true,
  },
  {
    id: DEFAULT_CONTACT_ROLE_IDS.dealPartner,
    displayName: "Deal Partner",
    isSystemDefault: true,
  },
  {
    id: DEFAULT_CONTACT_ROLE_IDS.lenderRep,
    displayName: "Lender Rep",
    isSystemDefault: true,
  },
  {
    id: DEFAULT_CONTACT_ROLE_IDS.lender,
    displayName: "Lender",
    isSystemDefault: true,
  },
  {
    id: DEFAULT_CONTACT_ROLE_IDS.borrower,
    displayName: "Borrower",
    isSystemDefault: true,
  },
  {
    id: DEFAULT_CONTACT_ROLE_IDS.guarantor,
    displayName: "Guarantor",
    isSystemDefault: true,
  },
];

const LEGACY_CRM_TO_ROLE: Record<string, DefaultContactRoleId> = {
  client: DEFAULT_CONTACT_ROLE_IDS.client,
  referral: DEFAULT_CONTACT_ROLE_IDS.referralPartner,
  lender_rep: DEFAULT_CONTACT_ROLE_IDS.lenderRep,
};

function uniqRoleIds(ids: readonly unknown[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of ids) {
    let id = "";
    if (typeof raw === "string") {
      id = raw.trim();
    } else if (raw && typeof raw === "object" && "value" in raw) {
      const v = (raw as { value?: unknown }).value;
      id = typeof v === "string" ? v.trim() : "";
    }
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

/** Coerce dirty API/UI role lists to stable string ids (never null). */
export function sanitizeContactRoleIds(
  raw: readonly unknown[] | null | undefined,
): string[] {
  const ids = uniqRoleIds(raw ?? []);
  return ids.length > 0 ? ids : [DEFAULT_CONTACT_ROLE_IDS.client];
}

/** Infer role id from legacy crmRelationshipTypes (first match wins). */
export function inferContactRoleIdFromLegacyCrm(
  types: readonly string[] | undefined,
): DefaultContactRoleId | undefined {
  if (!types?.length) return undefined;
  for (const t of types) {
    const mapped = LEGACY_CRM_TO_ROLE[t];
    if (mapped) return mapped;
  }
  return undefined;
}

/** Infer role id from free-form labels (case-insensitive token match). */
export function inferContactRoleIdFromLegacyLabels(
  labels: readonly string[] | undefined,
): DefaultContactRoleId | undefined {
  if (!labels?.length) return undefined;
  for (const raw of labels) {
    const t = raw.trim().toLowerCase();
    if (!t) continue;
    if (t === "client" || t.includes("borrower")) {
      return DEFAULT_CONTACT_ROLE_IDS.client;
    }
    if (
      t.includes("referral") ||
      (t.includes("partner") && !t.includes("deal"))
    ) {
      return DEFAULT_CONTACT_ROLE_IDS.referralPartner;
    }
    if (t.includes("deal partner") || t === "deal_partner") {
      return DEFAULT_CONTACT_ROLE_IDS.dealPartner;
    }
    if (t.includes("lender")) {
      return DEFAULT_CONTACT_ROLE_IDS.lenderRep;
    }
  }
  return undefined;
}

export function resolveContactRoleIdFromLegacyDoc(doc: {
  crmRelationshipTypes?: readonly string[] | undefined;
  labels?: readonly string[] | undefined;
}): DefaultContactRoleId {
  return (
    inferContactRoleIdFromLegacyCrm(doc.crmRelationshipTypes) ??
    inferContactRoleIdFromLegacyLabels(doc.labels) ??
    DEFAULT_CONTACT_ROLE_IDS.client
  );
}

/** Stored + legacy single field merged (no label inference). */
export function canonicalContactRoleIdsFromDoc(
  doc: ContactRoleFields,
): string[] {
  const fromArray = uniqRoleIds(doc.contactRoleIds ?? []);
  const single = doc.contactRoleId?.trim();
  if (single && !fromArray.includes(single)) {
    return uniqRoleIds([...fromArray, single]);
  }
  return fromArray;
}

/** All effective master roles (array, legacy single, or inferred default). */
export function effectiveContactRoleIdsFromDoc(doc: ContactRoleFields): string[] {
  const canonical = canonicalContactRoleIdsFromDoc(doc);
  if (canonical.length > 0) return canonical;
  return [resolveContactRoleIdFromLegacyDoc(doc)];
}

/** Primary role for legacy single-field consumers (first in effective list). */
export function primaryContactRoleIdFromDoc(doc: ContactRoleFields): string {
  const ids = effectiveContactRoleIdsFromDoc(doc);
  const clientIdx = ids.indexOf(DEFAULT_CONTACT_ROLE_IDS.client);
  if (clientIdx >= 0) return ids[clientIdx]!;
  return ids[0] ?? DEFAULT_CONTACT_ROLE_IDS.client;
}

/** @deprecated Prefer `primaryContactRoleIdFromDoc` / `effectiveContactRoleIdsFromDoc`. */
export function effectiveContactRoleIdFromDoc(doc: ContactRoleFields): string {
  return primaryContactRoleIdFromDoc(doc);
}

export function contactHasRoleId(
  doc: ContactRoleFields | null | undefined,
  roleId: string,
): boolean {
  if (!doc) return false;
  return effectiveContactRoleIdsFromDoc(doc).includes(roleId);
}

export function mergeContactRoleIds(
  existing: readonly string[],
  toAdd: readonly string[],
): string[] {
  return uniqRoleIds([...existing, ...toAdd]);
}

/**
 * Phase 25.8 — bridge legacy `contactRoleId` and `contactRoleIds` mutation args.
 */
export function coalesceContactRoleIdsFromArgs(args: {
  contactRoleIds?: readonly unknown[] | null | undefined;
  contactRoleId?: string | null | undefined;
}): string[] {
  const fromArray = uniqRoleIds(args.contactRoleIds ?? []);
  if (fromArray.length > 0) return fromArray;
  const single = args.contactRoleId?.trim();
  return single ? [single] : [];
}

/** Payload for `contacts.create` / `contacts.update` (always non-empty array). */
export function contactRoleIdsMutationPayload(
  roleIds: readonly string[] | undefined,
  fallbackRoleId?: string,
): { contactRoleIds: string[]; contactRoleId: string } {
  const coalesced = coalesceContactRoleIdsFromArgs({
    contactRoleIds: roleIds,
    contactRoleId: fallbackRoleId,
  });
  const contactRoleIds =
    coalesced.length > 0 ? coalesced : [DEFAULT_CONTACT_ROLE_IDS.client];
  return {
    contactRoleIds,
    contactRoleId: primaryContactRoleIdFromDoc({ contactRoleIds }),
  };
}

export function normalizeContactRoles(
  raw: readonly ContactRole[] | undefined,
): ContactRole[] {
  if (!raw?.length) return [...DEFAULT_CONTACT_ROLES];
  const byId = new Map<string, ContactRole>();
  for (const role of raw) {
    const id = role.id.trim();
    const displayName = role.displayName.trim();
    if (!id || !displayName) continue;
    byId.set(id, {
      id,
      displayName,
      isSystemDefault: Boolean(role.isSystemDefault),
    });
  }
  for (const def of DEFAULT_CONTACT_ROLES) {
    if (!byId.has(def.id)) byId.set(def.id, { ...def });
  }
  return [...byId.values()].sort((a, b) => {
    if (a.isSystemDefault !== b.isSystemDefault) {
      return a.isSystemDefault ? -1 : 1;
    }
    return a.displayName.localeCompare(b.displayName, "en", {
      sensitivity: "base",
    });
  });
}

export function contactRoleDisplayName(
  roles: readonly ContactRole[],
  roleId: string | undefined,
): string | null {
  if (!roleId) return null;
  return roles.find((r) => r.id === roleId)?.displayName ?? roleId;
}

export function contactRoleDisplayNames(
  roles: readonly ContactRole[],
  roleIds: readonly string[] | undefined,
): string[] {
  if (!roleIds?.length) return [];
  return roleIds
    .map((id) => contactRoleDisplayName(roles, id) ?? id)
    .filter(Boolean);
}

export function isValidContactRoleId(
  roles: readonly ContactRole[],
  roleId: string,
): boolean {
  return roles.some((r) => r.id === roleId);
}

export function legacyRelationshipTypeToRoleId(
  relationshipType: string | undefined,
): DefaultContactRoleId | undefined {
  if (!relationshipType) return undefined;
  return LEGACY_CRM_TO_ROLE[relationshipType];
}

/** @deprecated Use `canonicalContactRoleIdsFromDoc`. */
export function canonicalContactRoleIdFromDoc(
  doc: ContactRoleFields,
): string | undefined {
  const ids = canonicalContactRoleIdsFromDoc(doc);
  return ids[0];
}

export function isReferralPartnerRoleId(
  roleId: string | undefined,
): roleId is typeof DEFAULT_CONTACT_ROLE_IDS.referralPartner {
  return roleId === DEFAULT_CONTACT_ROLE_IDS.referralPartner;
}

export function isLenderRepRoleId(
  roleId: string | undefined,
): roleId is typeof DEFAULT_CONTACT_ROLE_IDS.lenderRep {
  return roleId === DEFAULT_CONTACT_ROLE_IDS.lenderRep;
}

/** Master profile includes Referral Partner (multi-role). */
export function contactQualifiesForReferralHub(
  contact: ContactRoleFields | null | undefined,
): boolean {
  return contactHasRoleId(contact, DEFAULT_CONTACT_ROLE_IDS.referralPartner);
}

/**
 * File↔contact association counts for referral hub when master includes role
 * or link explicitly tags referral (blocks lender-only leak).
 */
export function isReferralPartnerFileAssociation(args: {
  linkContactRoleId?: string | undefined;
  contact?: ContactRoleFields | null;
}): boolean {
  const linkRole = args.linkContactRoleId?.trim();
  const contact = args.contact;

  if (isReferralPartnerRoleId(linkRole)) {
    if (!contact) return false;
    const roles = canonicalContactRoleIdsFromDoc(contact);
    if (
      roles.length === 1 &&
      roles[0] === DEFAULT_CONTACT_ROLE_IDS.lenderRep
    ) {
      return false;
    }
    return true;
  }

  if (!contactQualifiesForReferralHub(contact)) return false;
  if (linkRole) return isReferralPartnerRoleId(linkRole);
  return true;
}

export function isReferralPartnerGraphLink(link: {
  relationshipType?: string | undefined;
  contactRoleId?: string | undefined;
  canonicalContactRoleIds?: readonly string[] | undefined;
}): boolean {
  const canonical = uniqRoleIds(link.canonicalContactRoleIds ?? []);
  if (canonical.length > 0) {
    if (!canonical.includes(DEFAULT_CONTACT_ROLE_IDS.referralPartner)) {
      return false;
    }
    if (
      canonical.length === 1 &&
      canonical[0] === DEFAULT_CONTACT_ROLE_IDS.lenderRep
    ) {
      return false;
    }
  }
  const linkRole = link.contactRoleId?.trim() ?? link.relationshipType?.trim();
  return isReferralPartnerRoleId(linkRole);
}
