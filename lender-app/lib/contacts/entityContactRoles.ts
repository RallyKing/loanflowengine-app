/**
 * Labels and helpers for entity ↔ contact junction roles (CRM ingestion).
 */
export const ENTITY_CONTACT_RELATIONSHIP_ROLES = [
  { id: "client", label: "Client" },
  { id: "deal_partner", label: "Deal Partner" },
  { id: "referral_partner", label: "Referral Partner" },
  { id: "lender_rep", label: "Lender Rep" },
  { id: "lender", label: "Lender" },
  { id: "borrower", label: "Borrower" },
  { id: "guarantor", label: "Guarantor" },
  { id: "other", label: "Other" },
] as const;

export type EntityContactRelationshipRoleId =
  (typeof ENTITY_CONTACT_RELATIONSHIP_ROLES)[number]["id"];

export function entityContactRelationshipLabel(
  roleId: string | undefined,
): string {
  const row = ENTITY_CONTACT_RELATIONSHIP_ROLES.find((r) => r.id === roleId);
  return row?.label ?? roleId ?? "Other";
}

export const COMMON_ENTITY_POSITIONS = [
  "Owner",
  "President",
  "CEO",
  "CFO",
  "Member",
  "Guarantor",
  "Other",
] as const;
