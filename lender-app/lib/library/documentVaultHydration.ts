import type { Doc, Id } from "@/convex/_generated/dataModel";
import { isPrimaryBorrowerFileLink } from "@/lib/contacts/borrowerIdentityFromDeal";

/** Primary borrower contact for vault cross-hydration (index 0). */
export function resolvePrimaryBorrowerContactId(
  links: Doc<"contactFileLinks">[] | undefined,
): Id<"contacts"> | undefined {
  if (!links?.length) return undefined;
  const primary = links
    .filter(isPrimaryBorrowerFileLink)
    .sort((a, b) => a.createdAt - b.createdAt)[0];
  return primary?.contactId;
}

export type LibraryDocumentLinkScope = "pipeline" | "contact" | "task";
