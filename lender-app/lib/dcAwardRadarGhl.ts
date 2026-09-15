/**
 * Tag-only HighLevel helpers for Award Radar.
 *
 * HARD RULE: create/update contacts + tags only. Never SMS, email, sequences,
 * workflows, campaigns, or Conversation AI. Upsert bodies are an allowlist —
 * messaging keys cannot be added accidentally.
 *
 * New writes use `award-radar` (+ category tag). Existing GHL contacts that
 * still carry `dc-award-radar` are left as-is — no mass migrate.
 */

import {
  collapseWs,
  dcAwardSafeHttpUrl,
  isDcAwardRadarCategory,
  type DcAwardRadarCategory,
} from "./dcAwardRadar";
import {
  uniqueContactHasGhlIdentity,
  type DcAwardRadarUniqueContact,
} from "./dcAwardRadarContacts";

export const DC_AWARD_RADAR_GHL_SOURCE = "award-radar" as const;
export const DC_AWARD_RADAR_GHL_TAG = "award-radar" as const;
export const DC_AWARD_RADAR_GHL_LINKEDIN_SOURCE_PREFIX =
  `${DC_AWARD_RADAR_GHL_SOURCE} | LinkedIn: ` as const;

/** Canonical category → GHL tag. Blank/unknown category → master tag only. */
export const AWARD_RADAR_GHL_CATEGORY_TAG = {
  data_center: "award-radar-data-center",
  hospital: "award-radar-hospital",
  dot_civil: "award-radar-dot-civil",
  industrial_warehouse: "award-radar-industrial",
  multifamily: "award-radar-multifamily",
  k12_higher_ed: "award-radar-k12",
  energy_renewables: "award-radar-energy",
  hospitality_mixed_use: "award-radar-hospitality",
  federal_municipal: "award-radar-federal",
} as const satisfies Record<DcAwardRadarCategory, string>;
export const DC_AWARD_RADAR_GHL_API_VERSION = "2021-07-28" as const;
export const DC_AWARD_RADAR_GHL_API_BASE =
  "https://services.leadconnectorhq.com" as const;

/**
 * Internal HighLevel rate-limit chunk size only — NOT a send cap.
 * One client-called action still processes the full eligible set; this only
 * batches upsert/tag HTTP work inside that action. No scheduler / cron.
 */
export const DC_AWARD_RADAR_GHL_CHUNK_SIZE = 50;

/** @deprecated Use DC_AWARD_RADAR_GHL_CHUNK_SIZE — there is no send-size cap. */
export const DC_AWARD_RADAR_GHL_MAX_CONTACTS = DC_AWARD_RADAR_GHL_CHUNK_SIZE;

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
  source: string;
};

export type DcAwardGhlPushContact = {
  company: string;
  contactName: string;
  email: string;
  phone: string;
  companyWebsite: string;
  markets: string[];
  trades: string[];
  linkedinUrl?: string;
  categories?: readonly string[];
};

export function slugDcAwardGhlTagPart(value: string): string {
  return collapseWs(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, TAG_PART_MAX);
}

export function awardRadarGhlCategoryTag(
  category: string | undefined | null,
): string | undefined {
  if (!category || !isDcAwardRadarCategory(category)) return undefined;
  return AWARD_RADAR_GHL_CATEGORY_TAG[category];
}

/**
 * Master `award-radar` on every push. Known signal.category adds one mapped
 * tag. Blank / unknown category → master only. Does not emit `dc-award-radar`.
 */
export function buildDcAwardGhlTags(input: {
  category?: string | null;
  categories?: readonly (string | undefined | null)[];
}): string[] {
  const tags = new Set<string>([DC_AWARD_RADAR_GHL_TAG]);
  const values = [
    ...(input.category ? [input.category] : []),
    ...(input.categories ?? []),
  ];
  for (const value of values) {
    const tag = awardRadarGhlCategoryTag(value);
    if (!tag) continue;
    tags.add(tag);
    if (tags.size >= TAG_MAX_COUNT) break;
  }
  return [...tags];
}

/** `award-radar` or `award-radar | LinkedIn: <https url>`. */
export function buildDcAwardGhlSource(linkedinUrl?: string): string {
  const url = dcAwardSafeHttpUrl(linkedinUrl);
  if (url) return `${DC_AWARD_RADAR_GHL_LINKEDIN_SOURCE_PREFIX}${url}`;
  return DC_AWARD_RADAR_GHL_SOURCE;
}

export function isAllowedDcAwardGhlSource(source: string): boolean {
  const trimmed = collapseWs(source);
  if (trimmed === DC_AWARD_RADAR_GHL_SOURCE) return true;
  if (!trimmed.startsWith(DC_AWARD_RADAR_GHL_LINKEDIN_SOURCE_PREFIX)) {
    return false;
  }
  const rest = trimmed.slice(DC_AWARD_RADAR_GHL_LINKEDIN_SOURCE_PREFIX.length);
  return Boolean(dcAwardSafeHttpUrl(rest));
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
    linkedinUrl: contact.linkedinUrl,
    categories: contact.categories,
  };
}

export type DcAwardGhlContactBatch<T> = {
  /** Full GHL-eligible set — no send-size cap / no silent truncation. */
  batch: T[];
  /** GHL-eligible count (email or phone). Always equals `sent` / `batch.length`. */
  total: number;
  /** Same as `total` — every eligible contact is included in this send. */
  sent: number;
  /** Always 0 — retained for callers; eligible contacts are never omitted. */
  omitted: number;
  /** Always false — retained for callers; there is no send-size truncation. */
  truncated: boolean;
  uniqueTotal: number;
  ineligible: number;
  /** How many internal rate-limit chunks the action will walk. */
  chunkCount: number;
};

/**
 * Split an already-selected send set into internal rate-limit chunks.
 * Does not drop contacts — concatenation of chunks equals the input.
 */
export function chunkDcAwardGhlContacts<T>(
  contacts: readonly T[],
  chunkSize = DC_AWARD_RADAR_GHL_CHUNK_SIZE,
): T[][] {
  const size = Math.max(1, Math.floor(chunkSize));
  const chunks: T[][] = [];
  for (let i = 0; i < contacts.length; i += size) {
    chunks.push(contacts.slice(i, i + size));
  }
  return chunks;
}

/**
 * Eligible (email or phone) only — full set, no send-size cap.
 * Ineligible rows are excluded and never consume a send slot.
 */
export function selectDcAwardGhlContactBatch(
  contacts: readonly DcAwardRadarUniqueContact[],
): DcAwardGhlContactBatch<DcAwardRadarUniqueContact> {
  const eligible = contacts.filter(uniqueContactHasGhlIdentity);
  const sent = eligible.length;
  return {
    batch: eligible,
    total: sent,
    sent,
    omitted: 0,
    truncated: false,
    uniqueTotal: contacts.length,
    ineligible: contacts.length - eligible.length,
    chunkCount: sent === 0 ? 0 : chunkDcAwardGhlContacts(eligible).length,
  };
}

export function describeDcAwardGhlSendBatch(
  selection: Pick<
    DcAwardGhlContactBatch<unknown>,
    "total" | "sent" | "ineligible" | "chunkCount"
  >,
): {
  entityName: string;
  confirmPrompt: string;
  truncationNote: undefined;
  chunkNote: string | undefined;
} {
  const n = selection.sent;
  const ineligibleNote =
    selection.ineligible > 0
      ? ` ${selection.ineligible} unique contact${
          selection.ineligible === 1 ? "" : "s"
        } lack email and phone and will not be sent.`
      : "";
  const chunkNote =
    selection.chunkCount > 1
      ? ` HighLevel writes run in ${selection.chunkCount} internal chunks of up to ${DC_AWARD_RADAR_GHL_CHUNK_SIZE} (rate-limit batching only — all ${n} eligible are included).`
      : undefined;
  return {
    entityName: `sending all ${n} GHL-eligible contact${n === 1 ? "" : "s"}`,
    confirmPrompt: `Send all ${n} GHL-eligible contact${
      n === 1 ? "" : "s"
    } to HighLevel (tag-only)? No email or SMS.${ineligibleNote}${chunkNote ?? ""}`,
    truncationNote: undefined,
    chunkNote,
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
    source: buildDcAwardGhlSource(contact.linkedinUrl),
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
): {
  locationId: string;
  source: string;
} & Partial<
  Record<
    Exclude<(typeof GHL_UPSERT_ALLOWED_KEYS)[number], "locationId" | "source">,
    string
  >
> {
  const locationId = collapseWs(body.locationId);
  if (!locationId) {
    throw new Error("GHL upsert serialize requires locationId.");
  }
  const source = collapseWs(body.source);
  if (!isAllowedDcAwardGhlSource(source)) {
    throw new Error(
      "GHL upsert source must be award-radar or award-radar | LinkedIn: …",
    );
  }
  const serialized: {
    locationId: string;
    source: string;
    firstName?: string;
    lastName?: string;
    name?: string;
    email?: string;
    phone?: string;
    companyName?: string;
    website?: string;
  } = {
    locationId,
    source,
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
