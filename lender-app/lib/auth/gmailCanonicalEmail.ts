/**
 * Gmail / Googlemail delivery-equivalent lookup keys (dots, plus-tags).
 * Used only for auth lookup — stored `authUsers.email` remains normalized literal.
 */
import { normalizeAuthEmail } from "./normalizeAuthEmail";

const GMAIL_DOMAINS = new Set(["gmail.com", "googlemail.com"]);

/** Gmail-local canonical form for duplicate detection (not for display). */
export function gmailMailboxKey(
  email: string | undefined | null,
): string | undefined {
  const norm = normalizeAuthEmail(email);
  if (!norm) return undefined;
  const at = norm.indexOf("@");
  if (at < 1) return undefined;
  const domain = norm.slice(at + 1);
  if (!GMAIL_DOMAINS.has(domain)) return undefined;
  let local = norm.slice(0, at);
  const plus = local.indexOf("+");
  if (plus >= 0) local = local.slice(0, plus);
  local = local.replace(/\./g, "");
  if (!local) return undefined;
  return `${local}@${domain}`;
}

/** Extra index keys to query when resolving a login email. */
export function gmailLookupVariants(
  email: string | undefined | null,
): string[] {
  const norm = normalizeAuthEmail(email);
  if (!norm) return [];
  const out = new Set<string>();
  out.add(norm);
  const mailbox = gmailMailboxKey(norm);
  if (mailbox) out.add(mailbox);
  return [...out];
}
