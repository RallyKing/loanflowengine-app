import type { Doc, Id } from "@/convex/_generated/dataModel";
import {
  isPrimaryBorrowerFileLink,
  personNameFromBorrowerRow,
} from "@/lib/contacts/borrowerIdentityFromDeal";

export const FILE_HEADER_NO_PRIMARY_BORROWER = "No primary borrower";

export type FileHeaderBorrowerContactLite = Pick<
  Doc<"contacts">,
  "_id" | "name" | "companyName"
>;

function trimLabel(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim().replace(/\s+/g, " ");
}

/** Entity borrower legal / DBA label from deal workspace sheet business block. */
export function entityBorrowerLabelFromDealBusiness(
  business: unknown,
): string {
  if (!business || typeof business !== "object" || Array.isArray(business)) {
    return "";
  }
  const rec = business as { legalName?: unknown; dba?: unknown };
  return trimLabel(rec.legalName) || trimLabel(rec.dba);
}

/**
 * Individual name(s) for primary borrower slot(s): prefer contactFileLinks with
 * primary borrower role, else dealData.borrowers[0].
 */
export function resolvePrimaryBorrowerIndividualNames(args: {
  links?: Doc<"contactFileLinks">[] | null;
  contactsById?: ReadonlyMap<
    Id<"contacts">,
    FileHeaderBorrowerContactLite
  > | null;
  dealBorrowers?: unknown[] | null;
}): string[] {
  const names: string[] = [];
  const seen = new Set<string>();

  const push = (raw: string) => {
    const name = trimLabel(raw);
    if (!name) return;
    const key = name.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    names.push(name);
  };

  const links = (args.links ?? [])
    .filter(isPrimaryBorrowerFileLink)
    .sort((a, b) => a.createdAt - b.createdAt);

  for (const link of links) {
    const contact = args.contactsById?.get(link.contactId);
    if (contact?.name) {
      push(contact.name);
      continue;
    }
    const fromDeal = (args.dealBorrowers ?? []).find(
      (row) =>
        row != null &&
        typeof row === "object" &&
        (row as { contactId?: Id<"contacts"> }).contactId === link.contactId,
    );
    push(personNameFromBorrowerRow(fromDeal));
  }

  if (names.length === 0 && Array.isArray(args.dealBorrowers)) {
    for (const row of args.dealBorrowers) {
      const name = personNameFromBorrowerRow(row);
      if (name) {
        push(name);
        break;
      }
    }
  }

  return names;
}

/**
 * File workspace header subtitle: live primary borrower entity + individual(s)
 * from Borrowers & Guarantors — not the create-time client display name.
 */
export function resolveFileHeaderPrimaryBorrowerLabel(args: {
  links?: Doc<"contactFileLinks">[] | null;
  contactsById?: ReadonlyMap<
    Id<"contacts">,
    FileHeaderBorrowerContactLite
  > | null;
  dealBorrowers?: unknown[] | null;
  /** Canonical entity / business legal name when an entity borrower is set. */
  entityDisplayName?: string | null;
  /** Last-resort fallback (hierarchy client name) when no primary borrower yet. */
  fallbackClientDisplayName?: string | null;
}): { label: string; fromPrimaryBorrower: boolean } {
  const entity = trimLabel(args.entityDisplayName) || "";
  const individuals = resolvePrimaryBorrowerIndividualNames({
    links: args.links,
    contactsById: args.contactsById,
    dealBorrowers: args.dealBorrowers,
  });

  const parts: string[] = [];
  if (entity) parts.push(entity);
  if (individuals.length > 0) parts.push(individuals.join(", "));

  if (parts.length > 0) {
    return { label: parts.join(" · "), fromPrimaryBorrower: true };
  }

  const fallback = trimLabel(args.fallbackClientDisplayName);
  if (fallback) {
    return { label: fallback, fromPrimaryBorrower: false };
  }

  return {
    label: FILE_HEADER_NO_PRIMARY_BORROWER,
    fromPrimaryBorrower: false,
  };
}
