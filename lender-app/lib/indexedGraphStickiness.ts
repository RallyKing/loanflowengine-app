/**
 * Phase 15 Step 2 — entity stickiness keys for dedupe at create/link time.
 * Edges do not grant ACL; keys prevent duplicate logical entities.
 */
import { canonicalizeHierarchyKey } from "./pipelineHierarchyNormalize";
import { normalizeEmailKey } from "./crmRelationship";

export type ClientStickinessKey =
  | { kind: "email"; key: string }
  | { kind: "phone"; key: string }
  | { kind: "name"; key: string };

export function normalizePhoneDigits(raw: string | undefined | null): string {
  if (!raw) return "";
  const digits = String(raw).replace(/\D+/g, "");
  if (digits.length === 11 && digits.startsWith("1")) {
    return digits.slice(1);
  }
  return digits;
}

export function computeClientStickinessKey(args: {
  displayName?: string;
  primaryContactEmail?: string;
  primaryContactPhone?: string;
  email?: string;
  phone?: string;
}): ClientStickinessKey {
  const email = normalizeEmailKey(
    args.primaryContactEmail ?? args.email ?? "",
  );
  if (email) return { kind: "email", key: email };

  const phone = normalizePhoneDigits(
    args.primaryContactPhone ?? args.phone ?? "",
  );
  if (phone.length >= 7) return { kind: "phone", key: phone };

  const name = canonicalizeHierarchyKey(args.displayName ?? "");
  return { kind: "name", key: name || "unknown" };
}

/** Referral partners use contacts — same stickiness as CRM contacts. */
export function computeReferralPartnerStickinessKey(args: {
  name?: string;
  email?: string;
  phone?: string;
}): ClientStickinessKey {
  return computeClientStickinessKey({
    displayName: args.name,
    email: args.email,
    phone: args.phone,
  });
}

export function computeLenderStickinessKey(args: {
  companyKey?: string;
  emailKey?: string;
  contactKey?: string;
}): string {
  const company = (args.companyKey ?? "").trim().toLowerCase();
  const email = (args.emailKey ?? "").trim().toLowerCase();
  const contact = (args.contactKey ?? "").trim().toLowerCase();
  if (company && email) return `company_email:${company}:${email}`;
  if (company && contact) return `company_contact:${company}:${contact}`;
  if (company) return `company:${company}`;
  return "";
}

export function computeTeamMemberStickinessKey(userKey: string): string {
  return userKey.trim();
}

export function computeTaskStickinessKey(taskId: string): string {
  return String(taskId).trim();
}

export function stickinessKeyString(key: ClientStickinessKey): string {
  return `${key.kind}:${key.key}`;
}
