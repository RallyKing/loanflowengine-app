import type { Doc, Id } from "@/convex/_generated/dataModel";
import {
  allContactEmailStrings,
  mergeScalarsIntoContactMethods,
  normalizeContactMethods,
  contactMethodsToConvexFields,
  primaryContactEmail,
  primaryContactPhone,
  type ContactEmailEntry,
  type ContactPhoneEntry,
} from "@/lib/contact/contactMethods";
import { normalizeEmailKey } from "@/lib/crmRelationship";
import { DEFAULT_CONTACT_ROLE_IDS } from "@/lib/contact/contactRoles";
import { contactPiiToDealStringFields } from "@/lib/contacts/contactProfileToDeal";

export type DealBorrowerRow = {
  firstName?: string;
  middleName?: string;
  lastName?: string;
  mobile?: string;
  homePhone?: string;
  altPhone?: string;
  email?: string;
};

export function collapseWhitespace(s: string): string {
  return s.trim().replace(/\s+/g, " ");
}

export function normalizePersonNameKey(name: string | undefined): string {
  return (name ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

export function personNameFromBorrowerRow(row: unknown): string {
  if (!row || typeof row !== "object") return "";
  const rec = row as DealBorrowerRow;
  return collapseWhitespace(
    [rec.firstName ?? "", rec.middleName ?? "", rec.lastName ?? ""]
      .filter(Boolean)
      .join(" "),
  );
}

export function borrowerRowHasIdentity(row: unknown): boolean {
  const name = personNameFromBorrowerRow(row);
  if (name) return true;
  if (!row || typeof row !== "object") return false;
  const rec = row as DealBorrowerRow;
  return Boolean(
    (rec.email ?? "").trim() ||
      (rec.mobile ?? "").trim() ||
      (rec.homePhone ?? "").trim() ||
      (rec.altPhone ?? "").trim(),
  );
}

export function isPrimaryBorrowerFileLink(link: Doc<"contactFileLinks">): boolean {
  if (link.registryRoleId === "primary_borrower") return true;
  if (
    link.registryRoleId === "coborrower" ||
    link.registryRoleId === "guarantor" ||
    link.registryRoleId === "key_principal"
  ) {
    return false;
  }
  const role = link.role.toLowerCase();
  if (/co-sign|co-borrow|co_sign|cosign/.test(role)) return false;
  if (link.contactRoleId === DEFAULT_CONTACT_ROLE_IDS.client) return true;
  if (/client|borrower/.test(role) && !/co-sign|co-borrow/.test(role)) return true;
  return false;
}

export function isCoBorrowerFileLink(link: Doc<"contactFileLinks">): boolean {
  if (link.registryRoleId === "coborrower") return true;
  if (link.registryRoleId === "primary_borrower") return false;
  const role = link.role.toLowerCase();
  return /co-sign|co-borrow|co_sign|cosign/.test(role);
}

export type BorrowerContactLookups = {
  byEmail: Map<string, Doc<"contacts">>;
  byName: Map<string, Doc<"contacts">>;
};

export function buildBorrowerContactLookups(
  contacts: Doc<"contacts">[],
  organizationId: Doc<"contacts">["organizationId"],
): BorrowerContactLookups {
  const byEmail = new Map<string, Doc<"contacts">>();
  const byName = new Map<string, Doc<"contacts">>();
  for (const c of contacts) {
    if (
      organizationId &&
      c.organizationId &&
      c.organizationId !== organizationId
    ) {
      continue;
    }
    for (const e of allContactEmailStrings(c)) {
      const key = normalizeEmailKey(e) ?? e.trim().toLowerCase();
      if (key && !byEmail.has(key)) byEmail.set(key, c);
    }
    const nameKey = normalizePersonNameKey(c.name);
    if (nameKey && !byName.has(nameKey)) byName.set(nameKey, c);
  }
  return { byEmail, byName };
}

export function matchContactByNormalizedName(
  name: string,
  lookups: BorrowerContactLookups,
): Doc<"contacts"> | null {
  const key = normalizePersonNameKey(name);
  if (!key) return null;
  return lookups.byName.get(key) ?? null;
}

export function matchContactByNormalizedEmail(
  email: string | undefined,
  lookups: BorrowerContactLookups,
): Doc<"contacts"> | null {
  const key = normalizeEmailKey((email ?? "").trim()) ?? (email ?? "").trim().toLowerCase();
  if (!key) return null;
  return lookups.byEmail.get(key) ?? null;
}

/** Map intake borrower row → CRM contact identity fields (name + methods). */
export type BorrowerContactIdentityPatch = {
  name?: string;
  email: string;
  phone: string;
  emailKey?: string;
  emails?: ContactEmailEntry[];
  phones?: ContactPhoneEntry[];
};

export function borrowerRowToContactIdentityPatch(
  row: unknown,
  existing?: Pick<Doc<"contacts">, "email" | "emails" | "phone" | "phones">,
): BorrowerContactIdentityPatch {
  const name = personNameFromBorrowerRow(row);
  if (!row || typeof row !== "object") {
    return { name: name || undefined, email: "", phone: "" };
  }
  const rec = row as DealBorrowerRow;
  const mobile = (rec.mobile ?? "").trim();
  const home = (rec.homePhone ?? "").trim();
  const alt = (rec.altPhone ?? "").trim();
  const email = (rec.email ?? "").trim();

  const base = existing
    ? mergeScalarsIntoContactMethods(
        existing,
        { email, phone: mobile || home || alt },
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
          phones: [
            ...(mobile
              ? [
                  {
                    id: "primary-mobile",
                    label: "Mobile" as const,
                    number: mobile,
                    isPrimary: true,
                  },
                ]
              : []),
            ...(home
              ? [
                  {
                    id: "home-phone",
                    label: "Home" as const,
                    number: home,
                    isPrimary: !mobile,
                  },
                ]
              : []),
            ...(alt
              ? [
                  {
                    id: "alt-phone",
                    label: "Other" as const,
                    number: alt,
                    isPrimary: !mobile && !home,
                  },
                ]
              : []),
          ],
        },
        normalizeEmailKey,
      );

  if (home && existing) {
    const merged = mergeScalarsIntoContactMethods(
      {
        email: base.email,
        emails: base.emails,
        phone: base.phone,
        phones: base.phones,
      },
      { phone: home },
      normalizeEmailKey,
    );
    if (alt) {
      const withAlt = mergeScalarsIntoContactMethods(
        {
          email: merged.email,
          emails: merged.emails,
          phone: merged.phone,
          phones: merged.phones,
        },
        { phone: alt },
        normalizeEmailKey,
      );
      return {
        name: name || undefined,
        ...contactMethodsToConvexFields(withAlt),
      };
    }
    return {
      name: name || undefined,
      ...contactMethodsToConvexFields(merged),
    };
  }

  return {
    name: name || undefined,
    ...contactMethodsToConvexFields(base),
  };
}

export function borrowerFileLinkRole(borrowerIndex: number): {
  role: string;
  contactRoleId: string;
} {
  if (borrowerIndex === 0) {
    return {
      role: "client",
      contactRoleId: DEFAULT_CONTACT_ROLE_IDS.client,
    };
  }
  return {
    role: "co-signer",
    contactRoleId: DEFAULT_CONTACT_ROLE_IDS.client,
  };
}

/** Hydrate deal borrower row identity from a linked CRM contact. */
export function borrowerRowIdentityFromContact(
  contact: Pick<
    Doc<"contacts">,
    "_id" | "name" | "fico" | "ssn" | "dob" | "email" | "phone" | "emails" | "phones"
  >,
): Record<string, unknown> {
  const name = contact.name.trim();
  const spaceIdx = name.lastIndexOf(" ");
  const firstName = spaceIdx > 0 ? name.slice(0, spaceIdx).trim() : name;
  const lastName = spaceIdx > 0 ? name.slice(spaceIdx + 1).trim() : "";
  const email = primaryContactEmail(contact);
  const phone = primaryContactPhone(contact);
  return {
    contactId: contact._id,
    firstName,
    ...(lastName ? { lastName } : {}),
    ...(email ? { email } : {}),
    ...(phone ? { mobile: phone } : {}),
    ...contactPiiToDealStringFields(contact),
  };
}

/** Stable React key for borrower panel rows — prefer CRM contact id. */
export function borrowerPanelRowKey(row: unknown, index: number): string {
  if (row && typeof row === "object") {
    const contactId = (row as { contactId?: Id<"contacts"> }).contactId;
    if (contactId) return `borrower-contact-${contactId}`;
  }
  return `borrower-slot-${index}`;
}
