import {
  DEFAULT_CONTACT_ROLE_IDS,
  effectiveContactRoleIdsFromDoc,
  sanitizeContactRoleIds,
} from "@/lib/contact/contactRoles";
import {
  resolveContactEmails,
  resolveContactPhones,
  type ContactEmailEntry,
  type ContactPhoneEntry,
} from "@/lib/contact/contactMethods";
import type { ContactHubRecord } from "@/lib/contacts/contactWithPrimaryEntity";
import type { IndividualHubDraft } from "@/components/contacts/IndividualHubDetailPanel";

export function emptyContactHubDraft(): IndividualHubDraft {
  return {
    name: "",
    emails: [],
    phones: [],
    notes: "",
    contactRoleIds: [DEFAULT_CONTACT_ROLE_IDS.client],
    fico: "",
    ssn: "",
    dob: "",
  };
}

export function normalizeContactHubDraft(
  partial?: Partial<IndividualHubDraft> | null,
): IndividualHubDraft {
  const base = emptyContactHubDraft();
  if (!partial) return base;
  return {
    name: typeof partial.name === "string" ? partial.name : "",
    notes: typeof partial.notes === "string" ? partial.notes : "",
    fico: typeof partial.fico === "string" ? partial.fico : "",
    ssn: typeof partial.ssn === "string" ? partial.ssn : "",
    dob: typeof partial.dob === "string" ? partial.dob : "",
    emails: Array.isArray(partial.emails)
      ? partial.emails.filter(
          (e): e is ContactEmailEntry =>
            Boolean(e) && typeof e === "object" && "email" in e,
        )
      : [],
    phones: Array.isArray(partial.phones)
      ? partial.phones.filter(
          (p): p is ContactPhoneEntry =>
            Boolean(p) && typeof p === "object" && "number" in p,
        )
      : [],
    contactRoleIds: sanitizeContactRoleIds(partial.contactRoleIds),
  };
}

export function contactHubDraftFromDoc(c: ContactHubRecord): IndividualHubDraft {
  return normalizeContactHubDraft({
    name: c.name ?? "",
    emails: resolveContactEmails(c),
    phones: resolveContactPhones(c),
    notes: c.notes ?? "",
    contactRoleIds: effectiveContactRoleIdsFromDoc(c),
    fico: c.fico != null ? String(c.fico) : "",
    ssn: c.ssn?.trim() ?? "",
    dob: c.dob?.trim() ?? "",
  });
}

export function contactMethodsMutationArgs(draft: {
  emails: ContactEmailEntry[];
  phones: ContactPhoneEntry[];
}): { emails: ContactEmailEntry[]; phones: ContactPhoneEntry[] } {
  // Always send arrays (including empty) so Save can clear methods.
  return {
    emails: draft.emails,
    phones: draft.phones,
  };
}

export function contactPiiMutationArgs(draft: IndividualHubDraft): {
  fico?: number;
  ssn?: string;
  dob?: string;
} {
  const ficoTrim = draft.fico.trim();
  const ssn = draft.ssn.trim();
  const dob = draft.dob.trim();
  let fico: number | undefined;
  if (ficoTrim) {
    const parsed = Number.parseFloat(ficoTrim);
    if (Number.isFinite(parsed)) fico = parsed;
  }
  return {
    ...(fico !== undefined ? { fico } : { fico: undefined }),
    ssn: ssn || undefined,
    dob: dob || undefined,
  };
}
