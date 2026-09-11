import type { Doc } from "@/convex/_generated/dataModel";
import { effectiveContactRoleIdFromDoc } from "@/lib/contact/contactRoles";

export const CONTACT_EMAIL_LABELS = [
  "Work",
  "Personal",
  "Billing",
  "Assistant",
  "Other",
] as const;

export type ContactEmailLabel = (typeof CONTACT_EMAIL_LABELS)[number];

export const CONTACT_PHONE_LABELS = [
  "Mobile",
  "Work",
  "Home",
  "Direct",
  "Office",
  "Fax",
  "Assistant",
  "Emergency",
  "Other",
] as const;

export type ContactPhoneLabel = (typeof CONTACT_PHONE_LABELS)[number];

export type ContactEmailEntry = {
  id: string;
  label: ContactEmailLabel;
  email: string;
  isPrimary: boolean;
};

export type ContactPhoneEntry = {
  id: string;
  label: ContactPhoneLabel;
  number: string;
  isPrimary: boolean;
};

export function newContactMethodId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 11)}`;
}

function isEmailLabel(x: string): x is ContactEmailLabel {
  return (CONTACT_EMAIL_LABELS as readonly string[]).includes(x);
}

function isPhoneLabel(x: string): x is ContactPhoneLabel {
  return (CONTACT_PHONE_LABELS as readonly string[]).includes(x);
}

/** Stable fallback id when a stored method row is missing `id` (never random). */
function stableMethodFallbackId(
  kind: "email" | "phone",
  index: number,
  value: string,
): string {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
  return `${kind}-${index}-${slug || "empty"}`;
}

/**
 * Drop progressive-typing junk: keep the longest value when one entry's value is
 * a strict prefix of another (e.g. "M", "MP", "MPushye@…"). Exact duplicates
 * also collapse to a single row (primary preferred).
 */
export function collapsePrefixContactMethodValues<
  T extends { email?: string; number?: string; isPrimary: boolean },
>(list: T[], valueOf: (item: T) => string): T[] {
  if (list.length <= 1) return list;
  const normalized = list.map((item, index) => ({
    item,
    index,
    value: valueOf(item).trim().toLowerCase(),
  }));
  const keep = new Set<number>();
  for (const candidate of normalized) {
    if (!candidate.value) {
      keep.add(candidate.index);
      continue;
    }
    const dominated = normalized.some(
      (other) =>
        other.index !== candidate.index &&
        other.value.length > candidate.value.length &&
        other.value.startsWith(candidate.value),
    );
    if (!dominated) keep.add(candidate.index);
  }
  // Exact-duplicate collapse: keep primary, else first.
  const byValue = new Map<string, number>();
  for (const candidate of normalized) {
    if (!keep.has(candidate.index) || !candidate.value) continue;
    const prev = byValue.get(candidate.value);
    if (prev === undefined) {
      byValue.set(candidate.value, candidate.index);
      continue;
    }
    const preferCurrent = list[candidate.index]?.isPrimary === true;
    if (preferCurrent) {
      keep.delete(prev);
      byValue.set(candidate.value, candidate.index);
    } else {
      keep.delete(candidate.index);
    }
  }
  return list.filter((_, index) => keep.has(index));
}

/** Resolve stored arrays with legacy scalar fallback (pre-migration rows). */
export function resolveContactEmails(
  row: Pick<Doc<"contacts">, "email" | "emails">,
): ContactEmailEntry[] {
  const stored = row.emails ?? [];
  if (stored.length > 0) {
    const mapped = stored.map((e, index) => {
      const email = (e.email ?? "").trim();
      return {
        id: e.id?.trim() || stableMethodFallbackId("email", index, email),
        label: isEmailLabel(e.label) ? e.label : "Other",
        email,
        isPrimary: Boolean(e.isPrimary),
      };
    });
    return sortPrimaryFirst(
      collapsePrefixContactMethodValues(mapped, (e) => e.email),
    );
  }
  const legacy = (row.email ?? "").trim();
  if (!legacy) return [];
  return [
    {
      id: "legacy-email",
      label: "Other",
      email: legacy,
      isPrimary: true,
    },
  ];
}

export function resolveContactPhones(
  row: Pick<Doc<"contacts">, "phone" | "phones">,
): ContactPhoneEntry[] {
  const stored = row.phones ?? [];
  if (stored.length > 0) {
    const mapped = stored.map((p, index) => {
      const number = (p.number ?? "").trim();
      return {
        id: p.id?.trim() || stableMethodFallbackId("phone", index, number),
        label: isPhoneLabel(p.label) ? p.label : "Other",
        number,
        isPrimary: Boolean(p.isPrimary),
      };
    });
    return sortPrimaryFirst(
      collapsePrefixContactMethodValues(mapped, (p) =>
        p.number.replace(/\D/g, ""),
      ),
    );
  }
  const legacy = (row.phone ?? "").trim();
  if (!legacy) return [];
  return [
    {
      id: "legacy-phone",
      label: "Other",
      number: legacy,
      isPrimary: true,
    },
  ];
}

function sortPrimaryFirst<T extends { isPrimary: boolean }>(list: T[]): T[] {
  return [...list].sort((a, b) => {
    if (a.isPrimary === b.isPrimary) return 0;
    return a.isPrimary ? -1 : 1;
  });
}

export function primaryContactEmail(
  row: Pick<Doc<"contacts">, "email" | "emails">,
): string {
  const emails = resolveContactEmails(row);
  return emails.find((e) => e.isPrimary)?.email ?? emails[0]?.email ?? "";
}

export function primaryContactPhone(
  row: Pick<Doc<"contacts">, "phone" | "phones">,
): string {
  const phones = resolveContactPhones(row);
  return phones.find((p) => p.isPrimary)?.number ?? phones[0]?.number ?? "";
}

/** Alias for UI/audit naming — same as `primaryContactEmail`. */
export const resolvePrimaryEmail = primaryContactEmail;

/** Alias for UI/audit naming — same as `primaryContactPhone`. */
export const resolvePrimaryPhone = primaryContactPhone;

export const PREFERRED_CONTACT_METHODS = ["email", "phone", "sms"] as const;
export type PreferredContactMethod = (typeof PREFERRED_CONTACT_METHODS)[number];

export type ContactCommunicationPrefs = Pick<
  Doc<"contacts">,
  "preferredEmailId" | "preferredPhoneId" | "preferredContactMethod"
>;

/** Preferred email entry id, else primary entry, else legacy scalar. */
export function resolvePreferredEmailId(
  row: Pick<Doc<"contacts">, "preferredEmailId" | "email" | "emails">,
): string | undefined {
  const emails = resolveContactEmails(row);
  if (row.preferredEmailId) {
    const hit = emails.find((e) => e.id === row.preferredEmailId);
    if (hit?.email.trim()) return hit.id;
  }
  return emails.find((e) => e.isPrimary)?.id ?? emails[0]?.id;
}

export function resolvePreferredEmail(
  row: Pick<Doc<"contacts">, "preferredEmailId" | "email" | "emails">,
): string {
  const emails = resolveContactEmails(row);
  const id = resolvePreferredEmailId(row);
  if (id) {
    const hit = emails.find((e) => e.id === id);
    if (hit?.email.trim()) return hit.email.trim();
  }
  return primaryContactEmail(row);
}

/** Preferred phone entry id, else primary entry, else legacy scalar. */
export function resolvePreferredPhoneId(
  row: Pick<Doc<"contacts">, "preferredPhoneId" | "phone" | "phones">,
): string | undefined {
  const phones = resolveContactPhones(row);
  if (row.preferredPhoneId) {
    const hit = phones.find((p) => p.id === row.preferredPhoneId);
    if (hit?.number.trim()) return hit.id;
  }
  return phones.find((p) => p.isPrimary)?.id ?? phones[0]?.id;
}

export function resolvePreferredPhone(
  row: Pick<Doc<"contacts">, "preferredPhoneId" | "phone" | "phones">,
): string {
  const phones = resolveContactPhones(row);
  const id = resolvePreferredPhoneId(row);
  if (id) {
    const hit = phones.find((p) => p.id === id);
    if (hit?.number.trim()) return hit.number.trim();
  }
  return primaryContactPhone(row);
}

/** Defaults to primary email channel when unset. `sms` uses preferred phone number. */
export function resolvePreferredContactMethod(
  row: Pick<
    Doc<"contacts">,
    | "preferredContactMethod"
    | "preferredEmailId"
    | "preferredPhoneId"
    | "email"
    | "emails"
    | "phone"
    | "phones"
  >,
): PreferredContactMethod {
  const method = row.preferredContactMethod;
  if (method === "phone" || method === "sms") {
    if (resolvePreferredPhone(row).trim()) return method;
  }
  if (method === "email" && resolvePreferredEmail(row).trim()) return "email";
  if (resolvePreferredEmail(row).trim()) return "email";
  if (resolvePreferredPhone(row).trim()) return "phone";
  return "email";
}

export function allContactEmailStrings(
  row: Pick<Doc<"contacts">, "email" | "emails">,
): string[] {
  const keys = new Set<string>();
  for (const e of resolveContactEmails(row)) {
    const t = e.email.trim().toLowerCase();
    if (t) keys.add(t);
  }
  const legacy = (row.email ?? "").trim().toLowerCase();
  if (legacy) keys.add(legacy);
  return [...keys];
}

export function allContactPhoneStrings(
  row: Pick<Doc<"contacts">, "phone" | "phones">,
): string[] {
  const out = new Set<string>();
  for (const p of resolveContactPhones(row)) {
    const t = p.number.trim();
    if (t) out.add(t);
  }
  const legacy = (row.phone ?? "").trim();
  if (legacy) out.add(legacy);
  return [...out];
}

export type ContactMethodsInput = {
  emails?: readonly ContactEmailEntry[];
  phones?: readonly ContactPhoneEntry[];
  legacyEmail?: string;
  legacyPhone?: string;
  /** When true, legacyEmail/legacyPhone were explicitly set (scalar writers). */
  legacyIsExplicitScalar?: boolean;
};

export type NormalizedContactMethods = {
  emails: ContactEmailEntry[];
  phones: ContactPhoneEntry[];
  /** Denormalized primary for legacy readers and indexes. */
  email: string;
  phone: string;
  emailKey: string | null;
};

function normalizeEmailEntries(
  raw: readonly ContactEmailEntry[] | undefined,
  legacyEmail: string,
  options?: { legacyIsExplicitScalar?: boolean },
): ContactEmailEntry[] {
  const cleaned: ContactEmailEntry[] = [];
  for (const [index, e] of (raw ?? []).entries()) {
    const email = e.email.trim();
    if (!email) continue;
    cleaned.push({
      id: e.id?.trim() || stableMethodFallbackId("email", index, email),
      label: isEmailLabel(e.label) ? e.label : "Other",
      email,
      isPrimary: Boolean(e.isPrimary),
    });
  }
  const legacy = legacyEmail.trim();
  if (cleaned.length === 0 && legacy) {
    cleaned.push({
      id: newContactMethodId(),
      label: "Other",
      email: legacy,
      isPrimary: true,
    });
  } else if (
    cleaned.length > 0 &&
    legacy &&
    options?.legacyIsExplicitScalar === true
  ) {
    // Scalar-only writers (inspector): update primary in place — never append.
    const legacyLower = legacy.toLowerCase();
    if (!cleaned.some((e) => e.email.toLowerCase() === legacyLower)) {
      const primaryIdx = cleaned.findIndex((e) => e.isPrimary);
      const idx = primaryIdx >= 0 ? primaryIdx : 0;
      cleaned[idx] = { ...cleaned[idx], email: legacy };
    }
  }
  return enforceSinglePrimary(
    collapsePrefixContactMethodValues(cleaned, (e) => e.email),
    "email",
  );
}

function normalizePhoneEntries(
  raw: readonly ContactPhoneEntry[] | undefined,
  legacyPhone: string,
  options?: { legacyIsExplicitScalar?: boolean },
): ContactPhoneEntry[] {
  const cleaned: ContactPhoneEntry[] = [];
  for (const [index, p] of (raw ?? []).entries()) {
    const number = p.number.trim();
    if (!number) continue;
    cleaned.push({
      id: p.id?.trim() || stableMethodFallbackId("phone", index, number),
      label: isPhoneLabel(p.label) ? p.label : "Other",
      number,
      isPrimary: Boolean(p.isPrimary),
    });
  }
  const legacy = legacyPhone.trim();
  if (cleaned.length === 0 && legacy) {
    cleaned.push({
      id: newContactMethodId(),
      label: "Other",
      number: legacy,
      isPrimary: true,
    });
  } else if (
    cleaned.length > 0 &&
    legacy &&
    options?.legacyIsExplicitScalar === true
  ) {
    const legacyDigits = legacy.replace(/\D/g, "");
    if (
      legacyDigits &&
      !cleaned.some((p) => p.number.replace(/\D/g, "") === legacyDigits)
    ) {
      const primaryIdx = cleaned.findIndex((p) => p.isPrimary);
      const idx = primaryIdx >= 0 ? primaryIdx : 0;
      cleaned[idx] = { ...cleaned[idx], number: legacy };
    }
  }
  return enforceSinglePrimary(
    collapsePrefixContactMethodValues(cleaned, (p) =>
      p.number.replace(/\D/g, ""),
    ),
    "number",
  );
}

function enforceSinglePrimary<T extends { isPrimary: boolean }>(
  list: T[],
  _kind: "email" | "number",
): T[] {
  if (list.length === 0) return list;
  let primaryIdx = list.findIndex((x) => x.isPrimary);
  if (primaryIdx < 0) primaryIdx = 0;
  return list.map((item, i) => ({
    ...item,
    isPrimary: i === primaryIdx,
  }));
}

/** Normalize collections + keep legacy scalar fields aligned with primary values. */
export function normalizeContactMethods(
  input: ContactMethodsInput,
  normalizeEmailKey: (email: string) => string | null,
): NormalizedContactMethods {
  const legacyEmail = (input.legacyEmail ?? "").trim();
  const legacyPhone = (input.legacyPhone ?? "").trim();
  const scalarOpts = {
    legacyIsExplicitScalar: input.legacyIsExplicitScalar === true,
  };
  const emails = normalizeEmailEntries(input.emails, legacyEmail, scalarOpts);
  const phones = normalizePhoneEntries(input.phones, legacyPhone, scalarOpts);
  const email = primaryContactEmail({ email: legacyEmail, emails });
  const phone = primaryContactPhone({ phone: legacyPhone, phones });
  return {
    emails,
    phones,
    email,
    phone,
    emailKey: normalizeEmailKey(email),
  };
}

export function contactMethodsToConvexFields(
  normalized: NormalizedContactMethods,
): {
  email: string;
  phone: string;
  emailKey?: string;
  emails: ContactEmailEntry[];
  phones: ContactPhoneEntry[];
} {
  return {
    email: normalized.email,
    phone: normalized.phone,
    emailKey: normalized.emailKey ?? undefined,
    // Always write arrays so clears persist (empty = no methods).
    emails: normalized.emails,
    phones: normalized.phones,
  };
}

export function formatPhoneDisplay(number: string): string {
  const digits = number.replace(/\D/g, "");
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  return number.trim();
}

/** Build `emails` / `phones` create args from simple form fields (no scalar writes on `Doc`). */
export function contactMethodsCreateArgs(input: {
  email?: string;
  phone?: string;
}): {
  emails?: ContactEmailEntry[];
  phones?: ContactPhoneEntry[];
} {
  const emails: ContactEmailEntry[] = [];
  const phones: ContactPhoneEntry[] = [];
  const e = (input.email ?? "").trim();
  const p = (input.phone ?? "").trim();
  if (e) {
    emails.push({
      id: newContactMethodId(),
      label: "Work",
      email: e,
      isPrimary: true,
    });
  }
  if (p) {
    phones.push({
      id: newContactMethodId(),
      label: "Mobile",
      number: p,
      isPrimary: true,
    });
  }
  return {
    emails: emails.length ? emails : undefined,
    phones: phones.length ? phones : undefined,
  };
}

/**
 * Merge optional scalar values into existing contact methods (migration / link /
 * deal dual-write flows).
 *
 * Email is single-valued from scalar sources: update the primary entry in place
 * instead of appending progressive keystroke values ("M", "MP", "MPu"…).
 * Phones may append distinct numbers, but treat digit prefix/extension of the
 * primary as an in-place edit (same typing bug).
 */
export function mergeScalarsIntoContactMethods(
  contact: Pick<Doc<"contacts">, "email" | "emails" | "phone" | "phones">,
  add: { email?: string; phone?: string },
  normalizeEmailKey: (email: string) => string | null,
): NormalizedContactMethods {
  const emails = [...resolveContactEmails(contact)];
  const phones = [...resolveContactPhones(contact)];
  const emailKeys = new Set(allContactEmailStrings(contact));
  const phoneKeys = new Set(
    allContactPhoneStrings(contact).map((n) => n.replace(/\D/g, "")),
  );
  const addE = (add.email ?? "").trim();
  const addP = (add.phone ?? "").trim();
  if (addE) {
    const lower = addE.toLowerCase();
    if (!emailKeys.has(lower)) {
      if (emails.length === 0) {
        emails.push({
          id: newContactMethodId(),
          label: "Other",
          email: addE,
          isPrimary: true,
        });
      } else {
        const primaryIdx = emails.findIndex((e) => e.isPrimary);
        const idx = primaryIdx >= 0 ? primaryIdx : 0;
        emails[idx] = { ...emails[idx], email: addE };
      }
    }
  }
  if (addP) {
    const digits = addP.replace(/\D/g, "");
    if (digits && !phoneKeys.has(digits)) {
      if (phones.length === 0) {
        phones.push({
          id: newContactMethodId(),
          label: "Other",
          number: addP,
          isPrimary: true,
        });
      } else {
        const primaryIdx = phones.findIndex((p) => p.isPrimary);
        const idx = primaryIdx >= 0 ? primaryIdx : 0;
        const primary = phones[idx];
        if (!primary) {
          phones.push({
            id: newContactMethodId(),
            label: "Other",
            number: addP,
            isPrimary: true,
          });
        } else {
          const primaryDigits = primary.number.replace(/\D/g, "");
          const isTypingExtension =
            Boolean(primaryDigits) &&
            (digits.startsWith(primaryDigits) ||
              primaryDigits.startsWith(digits));
          if (isTypingExtension) {
            phones[idx] = { ...primary, number: addP };
          } else {
            phones.push({
              id: newContactMethodId(),
              label: "Other",
              number: addP,
              isPrimary: false,
            });
          }
        }
      }
    }
  }
  return normalizeContactMethods({ emails, phones }, normalizeEmailKey);
}

/** Lowercase haystack for client-side contact filtering (all emails, phones, role). */
export function contactSearchHaystack(
  c: Pick<
    Doc<"contacts">,
    | "name"
    | "email"
    | "emails"
    | "phone"
    | "phones"
    | "companyName"
    | "contactRoleId"
  > & {
    labels?: string[];
    crmRelationshipTypes?: string[];
  },
  extra = "",
): string {
  const labelParts = [
    ...(c.emails ?? []).map((e) => e.label),
    ...(c.phones ?? []).map((p) => p.label),
  ];
  return [
    c.name,
    ...allContactEmailStrings(c),
    ...allContactPhoneStrings(c),
    ...labelParts,
    c.companyName ?? "",
    effectiveContactRoleIdFromDoc(c),
    ...(c.labels ?? []),
    ...(c.crmRelationshipTypes ?? []),
    extra,
  ]
    .join(" ")
    .toLowerCase();
}

export function hasOrphanPreferredEmailId(
  row: Pick<Doc<"contacts">, "preferredEmailId" | "email" | "emails">,
): boolean {
  if (!row.preferredEmailId?.trim()) return false;
  return !resolveContactEmails(row).some((e) => e.id === row.preferredEmailId);
}

export function hasOrphanPreferredPhoneId(
  row: Pick<Doc<"contacts">, "preferredPhoneId" | "phone" | "phones">,
): boolean {
  if (!row.preferredPhoneId?.trim()) return false;
  return !resolveContactPhones(row).some((p) => p.id === row.preferredPhoneId);
}
