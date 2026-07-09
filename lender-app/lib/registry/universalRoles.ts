/**
 * Phase Registry-1 — canonical relationship role catalog for the federated registry.
 *
 * Single source of truth for role **ids** referenced by:
 * - `contacts.contactRoleIds` (master profile tags)
 * - `entityContactLinks.registryRoleId` (entity ↔ individual gateway)
 * - `contactFileLinks.registryRoleId` (deal ↔ contact association)
 * - `contactLenderLinks.registryRoleId` (lender ↔ rep association)
 * - `clientContactLinks.registryRoleId` (client workspace secondary contacts)
 *
 * Legacy fields (`relationshipRole`, `contactRoleId`, free-text `role`) remain
 * readable during migration; new writes should populate `registryRoleId`.
 */

export const REGISTRY_ROLE_IDS = {
  /** Primary obligor on a deal or entity. */
  primaryBorrower: "primary_borrower",
  borrower: "borrower",
  guarantor: "guarantor",
  coborrower: "coborrower",
  /** Capital-provider side */
  accountExecutive: "account_executive",
  lenderRep: "lender_rep",
  /** Entity governance */
  authorizedSigner: "authorized_signer",
  keyPrincipal: "key_principal",
  /** Partner / referral */
  referralPartner: "referral_partner",
  dealPartner: "deal_partner",
  /** Generic CRM */
  client: "client",
  other: "other",
} as const;

export type RegistryRoleId =
  (typeof REGISTRY_ROLE_IDS)[keyof typeof REGISTRY_ROLE_IDS];

export const REGISTRY_ROLE_CATALOG: ReadonlyArray<{
  id: RegistryRoleId;
  displayName: string;
  /** Where this role is typically assigned. */
  scope: "master" | "junction" | "both";
  isSystemDefault: boolean;
}> = [
  {
    id: REGISTRY_ROLE_IDS.primaryBorrower,
    displayName: "Primary Borrower",
    scope: "both",
    isSystemDefault: true,
  },
  {
    id: REGISTRY_ROLE_IDS.borrower,
    displayName: "Borrower",
    scope: "both",
    isSystemDefault: true,
  },
  {
    id: REGISTRY_ROLE_IDS.guarantor,
    displayName: "Guarantor",
    scope: "both",
    isSystemDefault: true,
  },
  {
    id: REGISTRY_ROLE_IDS.coborrower,
    displayName: "Co-Borrower",
    scope: "junction",
    isSystemDefault: true,
  },
  {
    id: REGISTRY_ROLE_IDS.accountExecutive,
    displayName: "Account Executive",
    scope: "junction",
    isSystemDefault: true,
  },
  {
    id: REGISTRY_ROLE_IDS.lenderRep,
    displayName: "Lender Rep",
    scope: "both",
    isSystemDefault: true,
  },
  {
    id: REGISTRY_ROLE_IDS.authorizedSigner,
    displayName: "Authorized Signer",
    scope: "junction",
    isSystemDefault: true,
  },
  {
    id: REGISTRY_ROLE_IDS.keyPrincipal,
    displayName: "Key Principal",
    scope: "junction",
    isSystemDefault: true,
  },
  {
    id: REGISTRY_ROLE_IDS.referralPartner,
    displayName: "Referral Partner",
    scope: "both",
    isSystemDefault: true,
  },
  {
    id: REGISTRY_ROLE_IDS.dealPartner,
    displayName: "Deal Partner",
    scope: "both",
    isSystemDefault: true,
  },
  {
    id: REGISTRY_ROLE_IDS.client,
    displayName: "Client",
    scope: "master",
    isSystemDefault: true,
  },
  {
    id: REGISTRY_ROLE_IDS.other,
    displayName: "Other",
    scope: "both",
    isSystemDefault: true,
  },
];

const REGISTRY_ROLE_ID_SET = new Set<string>(
  REGISTRY_ROLE_CATALOG.map((r) => r.id),
);

export function isRegistryRoleId(value: string): value is RegistryRoleId {
  return REGISTRY_ROLE_ID_SET.has(value);
}

export function registryRoleDisplayName(roleId: string | undefined): string {
  if (!roleId) return "Other";
  const row = REGISTRY_ROLE_CATALOG.find((r) => r.id === roleId);
  return row?.displayName ?? roleId;
}

/** @deprecated Phase 25 master role ids → registry ids (1:1 where possible). */
export const LEGACY_CONTACT_ROLE_TO_REGISTRY: Record<string, RegistryRoleId> = {
  client: REGISTRY_ROLE_IDS.client,
  referral_partner: REGISTRY_ROLE_IDS.referralPartner,
  deal_partner: REGISTRY_ROLE_IDS.dealPartner,
  lender_rep: REGISTRY_ROLE_IDS.lenderRep,
  lender: REGISTRY_ROLE_IDS.lenderRep,
  borrower: REGISTRY_ROLE_IDS.borrower,
  guarantor: REGISTRY_ROLE_IDS.guarantor,
};

/** @deprecated entityContactLinks.relationshipRole → registryRoleId */
export const LEGACY_ENTITY_JUNCTION_ROLE_TO_REGISTRY: Record<
  string,
  RegistryRoleId
> = {
  client: REGISTRY_ROLE_IDS.client,
  deal_partner: REGISTRY_ROLE_IDS.dealPartner,
  referral_partner: REGISTRY_ROLE_IDS.referralPartner,
  lender_rep: REGISTRY_ROLE_IDS.lenderRep,
  lender: REGISTRY_ROLE_IDS.lenderRep,
  borrower: REGISTRY_ROLE_IDS.borrower,
  guarantor: REGISTRY_ROLE_IDS.guarantor,
  other: REGISTRY_ROLE_IDS.other,
};

/** Resolve canonical registry role from any legacy junction / master id. */
export function coerceRegistryRoleId(
  raw: string | undefined,
  fallback: RegistryRoleId = REGISTRY_ROLE_IDS.other,
): RegistryRoleId {
  const trimmed = raw?.trim();
  if (!trimmed) return fallback;
  if (isRegistryRoleId(trimmed)) return trimmed;
  return (
    LEGACY_CONTACT_ROLE_TO_REGISTRY[trimmed] ??
    LEGACY_ENTITY_JUNCTION_ROLE_TO_REGISTRY[trimmed] ??
    fallback
  );
}

/** Default gateway role when promoting an individual to an entity. */
export const CONVERSION_DEFAULT_GATEWAY_ROLE = REGISTRY_ROLE_IDS.authorizedSigner;
export const CONVERSION_DEFAULT_GATEWAY_POSITION = "Authorized Signer";
