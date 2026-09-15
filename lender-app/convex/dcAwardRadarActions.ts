/**
 * One-shot Hermes scrape + tag-only HighLevel contact push for DC award radar.
 *
 * Ops click "Scrape with Hermes" → this action POSTs once to
 * GROKBOT_DC_RADAR_SCRAPE_WEBHOOK_URL (BOSSMAN GrokBot routine
 * `dc-award-radar-hermes-scrape`). BOSSMAN runs Hermes public-web research,
 * then pings Minion for CSV import. This app never scrapes, schedules, or
 * imports from this path.
 *
 * GHL push is TAG/CREATE ONLY: upsert contact + add tags. Never SMS, email,
 * sequences, workflows, campaigns, or Conversation AI. Client sends the full
 * filtered GHL-eligible set (no send-size cap). Internal chunking is for
 * HighLevel rate limits only. No `.collect()`, no scheduler.
 *
 * Auth: authenticated member session (`memberUserKey` / JWT), same gate as
 * `dcAwardSignals.list`. Operator migration secret is NOT required here —
 * that secret remains for Manual CSV import mutations only.
 *
 * Fail-closed: no scheduler, no cron, no polling, no scrape, no .collect().
 * Client calls this action directly (fetch requires an action; we do not
 * schedule an internalAction). Kept as an action — not mutation+scheduler —
 * so the one-shot POST stays fail-closed.
 */
import { action } from "./_generated/server";
import { v } from "convex/values";
import { api } from "./_generated/api";
import {
  DC_AWARD_RADAR_GHL_API_BASE,
  DC_AWARD_RADAR_GHL_API_VERSION,
  chunkDcAwardGhlContacts,
  buildDcAwardGhlTags,
  buildDcAwardGhlUpsertBody,
  formatGhlAuthorizationHeader,
  ghlSerializedBodyIsAllowlisted,
  resolveGhlApiKey,
  resolveGhlLocationId,
  serializeDcAwardGhlAddTagsBody,
  serializeDcAwardGhlUpsertBody,
  summarizeDcAwardGhlPushOutcome,
} from "../lib/dcAwardRadarGhl";

/** BOSSMAN GrokBot routine name (webhook target). */
export const DC_AWARD_RADAR_HERMES_SCRAPE_ROUTINE =
  "dc-award-radar-hermes-scrape" as const;

const scrapeModeV = v.union(
  v.literal("nationwide"),
  v.literal("contacts"),
  v.literal("both"),
);

const NOTES_MAX_CHARS = 500;
const REQUESTED_BY_MAX_CHARS = 120;

function resolveHermesScrapeWebhookUrl(): string | null {
  const url = process.env.GROKBOT_DC_RADAR_SCRAPE_WEBHOOK_URL?.trim() ?? "";
  return url || null;
}

/**
 * Prefer full Authorization header from routine panel env.
 * Else Bearer from key env. Never log the resolved value.
 */
function resolveHermesScrapeAuthorizationHeader(): string | null {
  const raw =
    process.env.GROKBOT_DC_RADAR_SCRAPE_WEBHOOK_AUTHORIZATION?.trim() ?? "";
  if (raw) return raw;
  const key = process.env.GROKBOT_DC_RADAR_SCRAPE_WEBHOOK_KEY?.trim() ?? "";
  if (!key) return null;
  if (/^bearer\s+/i.test(key)) return key;
  return `Bearer ${key}`;
}

function clampOptionalText(
  value: string | undefined,
  maxChars: number,
  label: string,
): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  if (trimmed.length > maxChars) {
    throw new Error(`${label} must be at most ${maxChars} characters.`);
  }
  return trimmed;
}

/**
 * Session-authenticated one-shot webhook POST to BOSSMAN's Hermes scrape routine.
 * Does not scrape, schedule, or import rows. Does not require migration admin secret.
 */
export const requestHermesScrape = action({
  args: {
    memberUserKey: v.optional(v.string()),
    mode: scrapeModeV,
    requestedBy: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  returns: v.object({
    ok: v.boolean(),
    skipped: v.optional(v.boolean()),
    reason: v.optional(v.string()),
    mode: scrapeModeV,
    requestedAt: v.number(),
  }),
  handler: async (ctx, args) => {
    const callerKey = await ctx.runQuery(
      api.dcAwardSignals.assertHermesScrapeAccessForAction,
      { memberUserKey: args.memberUserKey },
    );

    const requestedAt = Date.now();
    const requestedBy =
      clampOptionalText(args.requestedBy, REQUESTED_BY_MAX_CHARS, "requestedBy") ??
      callerKey.slice(0, REQUESTED_BY_MAX_CHARS);
    const notes = clampOptionalText(args.notes, NOTES_MAX_CHARS, "notes");

    const url = resolveHermesScrapeWebhookUrl();
    if (!url) {
      return {
        ok: false,
        skipped: true,
        reason: "missing_url",
        mode: args.mode,
        requestedAt,
      };
    }

    const payload: Record<string, unknown> = {
      kind: "dc_award_radar_scrape",
      routine: DC_AWARD_RADAR_HERMES_SCRAPE_ROUTINE,
      mode: args.mode,
      requestedBy,
      requestedAt,
      source: "lfe_dc_award_radar_ops",
    };
    if (notes) {
      payload.notes = notes;
    }

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json",
      "User-Agent": "loanflowengine-dc-award-radar",
    };
    const authorization = resolveHermesScrapeAuthorizationHeader();
    if (authorization) {
      headers.Authorization = authorization;
    }

    try {
      const res = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errBody = (await res.text()).slice(0, 300);
        console.error(
          "dcAwardRadar: BOSSMAN Hermes scrape webhook failed",
          res.status,
          errBody,
        );
        return {
          ok: false,
          reason: `http_${res.status}`,
          mode: args.mode,
          requestedAt,
        };
      }

      return {
        ok: true,
        mode: args.mode,
        requestedAt,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : "unknown_error";
      console.error(
        "dcAwardRadar: BOSSMAN Hermes scrape webhook threw",
        message,
      );
      return {
        ok: false,
        reason: message.slice(0, 240),
        mode: args.mode,
        requestedAt,
      };
    }
  },
});

const ghlPushContactV = v.object({
  company: v.string(),
  contactName: v.string(),
  email: v.string(),
  phone: v.string(),
  companyWebsite: v.string(),
  markets: v.array(v.string()),
  trades: v.array(v.string()),
});

const ghlPushResultV = v.object({
  ok: v.boolean(),
  configured: v.boolean(),
  created: v.number(),
  updated: v.number(),
  skipped: v.number(),
  tagFailed: v.number(),
  mode: v.union(v.literal("upsert"), v.literal("not_configured")),
  reason: v.optional(v.string()),
});

function parseGhlContactId(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const record = payload as Record<string, unknown>;
  const direct = record.id;
  if (typeof direct === "string" && direct.trim()) return direct.trim();
  const contact = record.contact;
  if (contact && typeof contact === "object") {
    const nestedId = (contact as Record<string, unknown>).id;
    if (typeof nestedId === "string" && nestedId.trim()) return nestedId.trim();
  }
  return null;
}

function parseGhlCreatedFlag(payload: unknown): boolean {
  if (!payload || typeof payload !== "object") return false;
  const record = payload as Record<string, unknown>;
  return record.new === true || record.created === true;
}

async function ghlJsonRequest(
  url: string,
  authorization: string,
  body: object,
): Promise<{ ok: boolean; status: number; payload: unknown }> {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: authorization,
      Version: DC_AWARD_RADAR_GHL_API_VERSION,
      "Content-Type": "application/json",
      Accept: "application/json",
      "User-Agent": "loanflowengine-dc-award-radar",
    },
    body: JSON.stringify(body),
  });
  let payload: unknown = null;
  try {
    payload = await res.json();
  } catch {
    payload = null;
  }
  return { ok: res.ok, status: res.status, payload };
}

/**
 * Session-authenticated tag-only HighLevel upsert.
 * Client supplies already-filtered unique contacts. No list collect, no
 * outbound messaging, no campaigns/workflows/sequences.
 */
export const pushFilteredContactsToGhl = action({
  args: {
    memberUserKey: v.optional(v.string()),
    contacts: v.array(ghlPushContactV),
  },
  returns: ghlPushResultV,
  handler: async (ctx, args) => {
    await ctx.runQuery(api.dcAwardSignals.assertHermesScrapeAccessForAction, {
      memberUserKey: args.memberUserKey,
    });

    const apiKey = resolveGhlApiKey();
    const locationId = resolveGhlLocationId();
    if (!apiKey || !locationId) {
      return {
        ok: false,
        configured: false,
        created: 0,
        updated: 0,
        skipped: args.contacts.length,
        tagFailed: 0,
        mode: "not_configured" as const,
        reason: "missing_credentials",
      };
    }

    const authorization = formatGhlAuthorizationHeader(apiKey);
    let created = 0;
    let updated = 0;
    let skipped = 0;
    let tagFailed = 0;

    // Full eligible set — no send-size cap. Chunk only for HighLevel rate limits
    // inside this one client-called action (no scheduler / cron / follow-up jobs).
    for (const chunk of chunkDcAwardGhlContacts(args.contacts)) {
      for (const contact of chunk) {
        const email = contact.email.trim();
        const phone = contact.phone.trim();
        if (!email && !phone) {
          skipped += 1;
          continue;
        }

        let upsertBody: ReturnType<typeof serializeDcAwardGhlUpsertBody>;
        try {
          upsertBody = serializeDcAwardGhlUpsertBody(
            buildDcAwardGhlUpsertBody(contact, locationId),
          );
        } catch {
          skipped += 1;
          continue;
        }
        if (!ghlSerializedBodyIsAllowlisted(upsertBody)) {
          console.error(
            "dcAwardRadar: GHL upsert body failed allowlist serialize",
          );
          skipped += 1;
          continue;
        }

        try {
          const upsert = await ghlJsonRequest(
            `${DC_AWARD_RADAR_GHL_API_BASE}/contacts/upsert`,
            authorization,
            upsertBody,
          );
          if (!upsert.ok) {
            console.error(
              "dcAwardRadar: HighLevel contact upsert failed",
              upsert.status,
            );
            skipped += 1;
            continue;
          }

          const contactId = parseGhlContactId(upsert.payload);
          if (parseGhlCreatedFlag(upsert.payload)) created += 1;
          else updated += 1;

          if (!contactId) {
            tagFailed += 1;
            continue;
          }

          const tagBody = serializeDcAwardGhlAddTagsBody(
            buildDcAwardGhlTags({
              markets: contact.markets,
              trades: contact.trades,
            }),
          );
          const tagRes = await ghlJsonRequest(
            `${DC_AWARD_RADAR_GHL_API_BASE}/contacts/${encodeURIComponent(contactId)}/tags`,
            authorization,
            tagBody,
          );
          if (!tagRes.ok) {
            console.error(
              "dcAwardRadar: HighLevel add-tags failed",
              tagRes.status,
            );
            tagFailed += 1;
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : "unknown_error";
          console.error("dcAwardRadar: HighLevel push threw", message);
          skipped += 1;
        }
      }
    }

    const outcome = summarizeDcAwardGhlPushOutcome({
      created,
      updated,
      skipped,
      tagFailed,
      configured: true,
      contactCount: args.contacts.length,
    });

    return {
      ok: outcome.ok,
      configured: true,
      created,
      updated,
      skipped,
      tagFailed,
      mode: "upsert" as const,
      ...(outcome.reason ? { reason: outcome.reason } : {}),
    };
  },
});
