/**
 * Tag-only HighLevel helpers for DC award radar.
 *
 * HARD RULE: create/update contacts + tags only. Never SMS, email, sequences,
 * workflows, campaigns, or Conversation AI. Upsert bodies are an allowlist —
 * messaging keys cannot be added accidentally.
 */

import { collapseWs, dcAwardSafeHttpUrl } from "./dcAwardRadar";
import type { DcAwardRadarUniqueContact } from "./dcAwardRadarContacts";

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

export function ghlUpsertBodyKeys(
  body: DcAwardGhlUpsertBody,
): readonly string[] {
  return (GHL_UPSERT_ALLOWED_KEYS as readonly string[]).filter(
    (key) => body[key as keyof DcAwardGhlUpsertBody] !== undefined,
  );
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
