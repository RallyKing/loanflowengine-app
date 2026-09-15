/**
 * Tag-only HighLevel helpers for DC award radar.
 *
 * HARD RULE: create/update contacts + tags only. Never SMS, email, sequences,
 * workflows, campaigns, or Conversation AI. Upsert bodies are an allowlist —
 * messaging keys cannot be added accidentally.
 */

import { collapseWs, dcAwardSafeHttpUrl } from "./dcAwardRadar";
import {
  uniqueContactHasGhlIdentity,
  type DcAwardRadarUniqueContact,
} from "./dcAwardRadarContacts";

export const DC_AWARD_RADAR_GHL_SOURCE = "dc-award-radar" as const;
export const DC_AWARD_RADAR_GHL_TAG = "dc-award-radar" as const;
export const DC_AWARD_RADAR_GHL_API_VERSION = "2021-07-28" as const;
export const DC_AWARD_RADAR_GHL_API_BASE =
  "https://services.leadconnectorhq.com" as const;

/** Hard cap for one client-called push — fail closed, no scheduler pump. */
export const DC_AWARD_RADAR_GHL_MAX_CONTACTS = 100;

const TAG_PART_MAX = 40;
const TAG_MAX_COUNT = 6;

export const GHL_UPSERT_ALLOWED_KEYS = [
  "locationId",
  "firstName",
  "lastName",
  "name",
  "email",
  "phone",
  "companyName",
  "website",
  "source",
] as const;

export type DcAwardGhlUpsertBody = {
  locationId: string;
  firstName?: string;
  lastName?: string;
  name?: string;
  email?: string;
  phone?: string;
  companyName?: string;
  website?: string;
  source: typeof DC_AWARD_RADAR_GHL_SOURCE;
};

export type DcAwardGhlPushContact = {
  company: string;
  contactName: string;
  email: string;
  phone: string;
  companyWebsite: string;
  markets: string[];
  trades: string[];
};

export function slugDcAwardGhlTagPart(value: string): string {
  return collapseWs(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, TAG_PART_MAX);
}

export function buildDcAwardGhlTags(input: {
  markets?: readonly string[];
  trades?: readonly string[];
}): string[] {
  const tags = new Set<string>([DC_AWARD_RADAR_GHL_TAG]);
  for (const market of input.markets ?? []) {
    const slug = slugDcAwardGhlTagPart(market);
    if (slug) tags.add(`${DC_AWARD_RADAR_GHL_TAG}-${slug}`);
    if (tags.size >= TAG_MAX_COUNT) break;
  }
  for (const trade of input.trades ?? []) {
    if (tags.size >= TAG_MAX_COUNT) break;
    const slug = slugDcAwardGhlTagPart(trade);
    if (slug) tags.add(`${DC_AWARD_RADAR_GHL_TAG}-${slug}`);
  }
  return [...tags];
}

export function splitDcAwardContactDisplayName(name: string): {
  firstName?: string;
  lastName?: string;
} {
  const trimmed = collapseWs(name);
  if (!trimmed) return {};
  const parts = trimmed.split(" ");
  const firstName = parts[0];
  const lastName = parts.slice(1).join(" ");
  return {
    ...(firstName ? { firstName } : {}),
    ...(lastName ? { lastName } : {}),
  };
}

export function uniqueContactToGhlPush(
  contact: DcAwardRadarUniqueContact,
): DcAwardGhlPushContact {
  return {
    company: contact.company,
    contactName: contact.contactName,
    email: contact.email,
    phone: contact.phone,
    companyWebsite: contact.companyWebsite,
    markets: contact.markets,
    trades: contact.trades,
  };
}

export type DcAwardGhlContactBatch<T> = {
  batch: T[];
  /** GHL-eligible (email or phone) before the one-shot cap. */
  total: number;
  sent: number;
  omitted: number;
  truncated: boolean;
  uniqueTotal: number;
  ineligible: number;
};

/**
 * Eligible (email or phone) first, then one-shot cap.
 * Ineligible rows must not consume a slot.
 */
export function selectDcAwardGhlContactBatch(
  contacts: readonly DcAwardRadarUniqueContact[],
  max = DC_AWARD_RADAR_GHL_MAX_CONTACTS,
): DcAwardGhlContactBatch<DcAwardRadarUniqueContact> {
  const safeMax = Math.max(0, Math.floor(max));
  const eligible = contacts.filter(uniqueContactHasGhlIdentity);
  const batch = eligible.slice(0, safeMax);
  const sent = batch.length;
  const omitted = Math.max(0, eligible.length - sent);
  return {
    batch,
    total: eligible.length,
    sent,
    omitted,
    truncated: omitted > 0,
    uniqueTotal: contacts.length,
    ineligible: contacts.length - eligible.length,
  };
}

export function describeDcAwardGhlSendBatch(
  selection: Pick<
    DcAwardGhlContactBatch<unknown>,
    "total" | "sent" | "omitted" | "truncated" | "ineligible"
  >,
): {
  entityName: string;
  confirmPrompt: string;
  truncationNote: string | undefined;
} {
  const ofN = `${selection.sent} of ${selection.total}`;
  const ineligibleNote =
    selection.ineligible > 0
      ? ` ${selection.ineligible} unique contact${
          selection.ineligible === 1 ? "" : "s"
        } lack email and phone and were not given a slot.`
      : "";
  return {
    entityName: `sending ${ofN} GHL-eligible contacts`,
    confirmPrompt: `Send ${ofN} GHL-eligible contacts to HighLevel (tag-only)? No email or SMS.${ineligibleNote}`,
    truncationNote: selection.truncated
      ? `Sending ${ofN} (one-shot cap ${DC_AWARD_RADAR_GHL_MAX_CONTACTS}). Remaining ${selection.omitted} eligible stay on this page — use Download contacts CSV for the full filtered set.`
      : undefined,
  };
}

export function summarizeDcAwardGhlPushOutcome(input: {
  created: number;
  updated: number;
  skipped: number;
  tagFailed: number;
  configured: boolean;
  contactCount: number;
}): { ok: boolean; reason?: string } {
  if (!input.configured) {
    return { ok: false, reason: "missing_credentials" };
  }
  if (input.contactCount < 1) {
    return { ok: false, reason: "empty_batch" };
  }
  if (input.created + input.updated === 0) {
    return { ok: false, reason: "all_skipped_or_failed" };
  }
  return { ok: true };
}

export function buildDcAwardGhlUpsertBody(
  contact: DcAwardGhlPushContact,
  locationId: string,
): DcAwardGhlUpsertBody {
  const name = collapseWs(contact.contactName);
  const { firstName, lastName } = splitDcAwardContactDisplayName(name);
  const email = collapseWs(contact.email);
  const phone = collapseWs(contact.phone);
  const companyName = collapseWs(contact.company);
  const website = dcAwardSafeHttpUrl(contact.companyWebsite);
  const body: DcAwardGhlUpsertBody = {
    locationId,
    source: DC_AWARD_RADAR_GHL_SOURCE,
  };
  if (firstName) body.firstName = firstName;
  if (lastName) body.lastName = lastName;
  if (name) body.name = name;
  if (email) body.email = email;
  if (phone) body.phone = phone;
  if (companyName) body.companyName = companyName;
  if (website) body.website = website;
  return body;
}

/**
 * Positive allowlist serialize — only these keys can leave the process.
 * Messaging / campaign / workflow / conversation fields cannot be copied through.
 */
export function serializeDcAwardGhlUpsertBody(
  body: DcAwardGhlUpsertBody,
): Record<(typeof GHL_UPSERT_ALLOWED_KEYS)[number], string | undefined> & {
  locationId: string;
  source: typeof DC_AWARD_RADAR_GHL_SOURCE;
} {
  const locationId = collapseWs(body.locationId);
  if (!locationId) {
    throw new Error("GHL upsert serialize requires locationId.");
  }
  if (body.source !== DC_AWARD_RADAR_GHL_SOURCE) {
    throw new Error("GHL upsert source must be dc-award-radar.");
  }
  const serialized: {
    locationId: string;
    source: typeof DC_AWARD_RADAR_GHL_SOURCE;
    firstName?: string;
    lastName?: string;
    name?: string;
    email?: string;
    phone?: string;
    companyName?: string;
    website?: string;
  } = {
    locationId,
    source: DC_AWARD_RADAR_GHL_SOURCE,
  };
  const firstName = collapseWs(body.firstName ?? "");
  const lastName = collapseWs(body.lastName ?? "");
  const name = collapseWs(body.name ?? "");
  const email = collapseWs(body.email ?? "");
  const phone = collapseWs(body.phone ?? "");
  const companyName = collapseWs(body.companyName ?? "");
  const website = dcAwardSafeHttpUrl(body.website) ?? "";
  if (firstName) serialized.firstName = firstName;
  if (lastName) serialized.lastName = lastName;
  if (name) serialized.name = name;
  if (email) serialized.email = email;
  if (phone) serialized.phone = phone;
  if (companyName) serialized.companyName = companyName;
  if (website) serialized.website = website;
  return serialized;
}

export function serializeDcAwardGhlAddTagsBody(
  tags: readonly string[],
): { tags: string[] } {
  const next: string[] = [];
  const seen = new Set<string>();
  for (const tag of tags) {
    const trimmed = collapseWs(tag);
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    next.push(trimmed);
    if (next.length >= TAG_MAX_COUNT) break;
  }
  return { tags: next };
}

export function ghlUpsertBodyKeys(
  body: object,
): readonly string[] {
  return Object.keys(body).sort((a, b) => a.localeCompare(b));
}

export function ghlSerializedBodyIsAllowlisted(body: object): boolean {
  const allowed = new Set<string>(GHL_UPSERT_ALLOWED_KEYS);
  return ghlUpsertBodyKeys(body).every((key) => allowed.has(key));
}

const FORBIDDEN_GHL_KEYS = [
  "sms",
  "emailMessage",
  "message",
  "messages",
  "sequence",
  "sequences",
  "workflow",
  "workflows",
  "campaign",
  "campaigns",
  "conversationAi",
  "conversationAI",
  "dnd",
  "tags",
] as const;

export function ghlUpsertBodyHasForbiddenKeys(body: object): boolean {
  return FORBIDDEN_GHL_KEYS.some((key) => key in body);
}

export function resolveGhlApiKey(
  env: Record<string, string | undefined> = process.env,
): string | null {
  const key =
    env.HIGHLEVEL_API_KEY?.trim() ||
    env.GHL_API_KEY?.trim() ||
    env.HIGHLEVEL_PIT?.trim() ||
    "";
  return key || null;
}

export function resolveGhlLocationId(
  env: Record<string, string | undefined> = process.env,
): string | null {
  const id =
    env.HIGHLEVEL_LOCATION_ID?.trim() || env.GHL_LOCATION_ID?.trim() || "";
  return id || null;
}

export function isDcAwardGhlConfigured(
  env: Record<string, string | undefined> = process.env,
): boolean {
  return Boolean(resolveGhlApiKey(env) && resolveGhlLocationId(env));
}

export function formatGhlAuthorizationHeader(apiKey: string): string {
  if (/^bearer\s+/i.test(apiKey)) return apiKey;
  return `Bearer ${apiKey}`;
}
