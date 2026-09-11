import {
  personNameFromBorrowerRow,
  type DealBorrowerRow,
} from "@/lib/contacts/borrowerIdentityFromDeal";
import { personNameFromGuarantorRow } from "@/lib/contacts/guarantorIdentityFromDeal";

function trimStr(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim().replace(/\s+/g, " ");
}

/**
 * Borrowers / guarantors / entity legal+DBA tokens for pipeline hub search.
 * Used so typing a borrower first/last or entity name matches loan files.
 */
export function buildPipelineDealPartySearchBlob(deal: {
  clientName?: string | null;
  business?: unknown;
  borrowers?: unknown[] | null;
  guarantors?: unknown[] | null;
  cover?: { borrowers?: string | null } | null;
} | null | undefined): string {
  if (!deal) return "";
  const parts: string[] = [];

  const clientName = trimStr(deal.clientName);
  if (clientName) parts.push(clientName);

  if (deal.business && typeof deal.business === "object" && !Array.isArray(deal.business)) {
    const biz = deal.business as { legalName?: unknown; dba?: unknown };
    const legal = trimStr(biz.legalName);
    const dba = trimStr(biz.dba);
    if (legal) parts.push(legal);
    if (dba) parts.push(dba);
  }

  if (Array.isArray(deal.borrowers)) {
    for (const row of deal.borrowers) {
      const full = personNameFromBorrowerRow(row);
      if (full) parts.push(full);
      if (row && typeof row === "object") {
        const rec = row as DealBorrowerRow;
        const first = trimStr(rec.firstName);
        const last = trimStr(rec.lastName);
        if (first) parts.push(first);
        if (last) parts.push(last);
      }
    }
  }

  if (Array.isArray(deal.guarantors)) {
    for (const row of deal.guarantors) {
      const name = personNameFromGuarantorRow(row);
      if (name) parts.push(name);
    }
  }

  const coverBorrowers = trimStr(deal.cover?.borrowers);
  if (coverBorrowers) parts.push(coverBorrowers);

  return parts.filter(Boolean).join(" ");
}
