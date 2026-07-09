/**
 * CRM relationship taxonomy — shared by Convex validators and UI.
 */
export const CRM_RELATIONSHIP_TYPES = [
  "client",
  "referral",
  "lender_rep",
] as const;

export type CrmRelationshipType = (typeof CRM_RELATIONSHIP_TYPES)[number];

export function isCrmRelationshipType(x: string): x is CrmRelationshipType {
  return (CRM_RELATIONSHIP_TYPES as readonly string[]).includes(x);
}

export const CRM_RELATIONSHIP_LABELS: Record<CrmRelationshipType, string> = {
  client: "Client",
  referral: "Referral",
  lender_rep: "Lender rep",
};

export function normalizeCrmRelationshipList(
  raw: readonly string[] | undefined,
): CrmRelationshipType[] {
  const out: CrmRelationshipType[] = [];
  const seen = new Set<string>();
  for (const s of raw ?? []) {
    if (!isCrmRelationshipType(s)) continue;
    if (seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  return out;
}

export function normalizeEmailKey(email: string): string | null {
  const t = email.trim().toLowerCase();
  if (!t) return null;
  return t;
}

export function normalizeCompanyKey(company: string): string | null {
  const t = company.trim().toLowerCase().replace(/\s+/g, " ");
  if (!t) return null;
  return t;
}
