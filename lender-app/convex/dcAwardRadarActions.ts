/**
 * One-shot Hermes scrape trigger for DC award radar.
 *
 * Ops click "Scrape with Hermes" → this action POSTs once to
 * GROKBOT_DC_RADAR_SCRAPE_WEBHOOK_URL (BOSSMAN GrokBot routine
 * `dc-award-radar-hermes-scrape`). BOSSMAN runs Hermes public-web research,
 * then pings Minion for CSV import. This app never scrapes, schedules, or
 * imports from this path.
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
