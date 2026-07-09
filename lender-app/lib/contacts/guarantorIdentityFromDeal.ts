import type { Doc } from "@/convex/_generated/dataModel";
import {
  contactMethodsToConvexFields,
  mergeScalarsIntoContactMethods,
  normalizeContactMethods,
  type ContactEmailEntry,
  type ContactPhoneEntry,
} from "@/lib/contact/contactMethods";
import { normalizeEmailKey } from "@/lib/crmRelationship";
import {
  buildBorrowerContactLookups,
  matchContactByNormalizedEmail,
  matchContactByNormalizedName,
  normalizePersonNameKey,
  type BorrowerContactLookups,
} from "@/lib/contacts/borrowerIdentityFromDeal";

export type DealGuarantorRow = {
  name?: string;
  role?: string;
  ownershipPct?: string;
  mobile?: string;
  email?: string;
};

export function personNameFromGuarantorRow(row: unknown): string {
  if (!row || typeof row !== "object") return "";
  return ((row as DealGuarantorRow).name ?? "").trim().replace(/\s+/g, " ");
}

export function guarantorRowHasIdentity(row: unknown): boolean {
  const name = personNameFromGuarantorRow(row);
  if (name) return true;
  if (!row || typeof row !== "object") return false;
  const rec = row as DealGuarantorRow;
  return Boolean((rec.email ?? "").trim() || (rec.mobile ?? "").trim());
}

export type GuarantorContactIdentityPatch = {
  name?: string;
  email: string;
  phone: string;
  emailKey?: string;
  emails?: ContactEmailEntry[];
  phones?: ContactPhoneEntry[];
};

/** Map intake guarantor row → CRM contact identity fields (name + methods). */
export function guarantorRowToContactIdentityPatch(
  row: unknown,
  existing?: Pick<Doc<"contacts">, "email" | "emails" | "phone" | "phones">,
): GuarantorContactIdentityPatch {
  const name = personNameFromGuarantorRow(row);
  if (!row || typeof row !== "object") {
    return { name: name || undefined, email: "", phone: "" };
  }
  const rec = row as DealGuarantorRow;
  const mobile = (rec.mobile ?? "").trim();
  const email = (rec.email ?? "").trim();

  const base = existing
    ? mergeScalarsIntoContactMethods(
        existing,
        { email, phone: mobile },
        normalizeEmailKey,
      )
    : normalizeContactMethods(
        {
          legacyEmail: email,
          legacyPhone: mobile,
          emails: email
            ? [
                {
                  id: "primary-email",
                  label: "Work" as const,
                  email,
                  isPrimary: true,
                },
              ]
            : undefined,
          phones: mobile
            ? [
                {
                  id: "primary-mobile",
                  label: "Mobile" as const,
                  number: mobile,
                  isPrimary: true,
                },
              ]
            : undefined,
        },
        normalizeEmailKey,
      );

  return {
    name: name || undefined,
    ...contactMethodsToConvexFields(base),
  };
}

/** Mirrors backfill `matchContactForOwnerName` + email safety rails. */
export function matchGuarantorContact(
  row: unknown,
  lookups: BorrowerContactLookups,
  primary: Doc<"contacts"> | null,
  coBorrowers: readonly Doc<"contacts">[],
): Doc<"contacts"> | null {
  if (row && typeof row === "object") {
    const rec = row as DealGuarantorRow;
    const byEmail = matchContactByNormalizedEmail(rec.email, lookups);
    if (byEmail) return byEmail;
  }

  const name = personNameFromGuarantorRow(row);
  if (!name) return null;

  const nameKey = normalizePersonNameKey(name);
  if (primary && normalizePersonNameKey(primary.name) === nameKey) {
    return primary;
  }
  for (const co of coBorrowers) {
    if (normalizePersonNameKey(co.name) === nameKey) return co;
  }
  return matchContactByNormalizedName(name, lookups);
}

export { buildBorrowerContactLookups };
