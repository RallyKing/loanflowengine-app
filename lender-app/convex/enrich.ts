/**
 * AI-powered enrichment for existing lenders.
 *
 * Flow:
 *   1. UI (or a bulk pass) calls `enrichLender(id)`.
 *   2. The action pulls the current record, builds a targeted prompt with
 *      the known company / website info, and hits OpenAI (Responses API
 *      with web_search) or Perplexity.
 *   3. The LLM returns structured JSON: programs, contacts, phones,
 *      niche, states, source URLs, etc.
 *   4. `_applyEnrichment` only fills in fields that are currently empty
 *      on the record, so broker-entered data is never overwritten.
 *
 * Required environment (same as discovery):
 *   - OPENAI_API_KEY  or  PERPLEXITY_API_KEY
 */
import {
  action,
  internalMutation,
  internalQuery,
  type ActionCtx,
} from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { applyLenderWrite, isLenderIncomplete } from "./lenderWriteStats";
import {
  buildLenderSearchBlob,
  lenderFundingMaxRaw,
  lenderFundingMinRaw,
} from "./lenderSearchText";

/* ------------------------------------------------------------------ */
/* Prompt + JSON schema                                                */
/* ------------------------------------------------------------------ */

const ENRICH_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    primary_niche: { type: "string" },
    entity_type: { type: "string" },
    programs: {
      type: "string",
      description: "Comma-separated list of loan products offered.",
    },
    program_list: {
      type: "array",
      description: "Structured list of programs with per-program requirements.",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          name: { type: "string" },
          min_fico: { type: "string" },
          requirements: { type: "string" },
        },
        required: ["name"],
      },
    },
    property_types: { type: "string" },
    states_served: { type: "string" },
    funding_amount_min: { type: "string" },
    funding_amount_max: { type: "string" },
    ltv: { type: "string" },
    interest_rates: { type: "string" },
    amort_term: { type: "string" },
    min_fico: { type: "string" },
    contacts: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          name: { type: "string" },
          title_role: { type: "string" },
          phone: { type: "string" },
          email: { type: "string" },
          notes: { type: "string" },
        },
        required: ["name"],
      },
    },
    phone_numbers: {
      type: "array",
      description:
        "Company-level phone numbers (main office, intake line, toll-free, fax).",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          label: { type: "string" },
          phone: { type: "string" },
        },
        required: ["phone"],
      },
    },
    website: { type: "string" },
    notes: {
      type: "string",
      description:
        "Additional useful info: FICO floors, LTV caps, reserve / experience rules, reviews, restrictions.",
    },
    source_urls: {
      type: "array",
      items: { type: "string" },
      description: "URLs that back the data above.",
    },
  },
  required: ["source_urls"],
} as const;

interface RawEnrichment {
  primary_niche?: string;
  entity_type?: string;
  programs?: string;
  program_list?: Array<{
    name?: string;
    min_fico?: string;
    requirements?: string;
  }>;
  property_types?: string;
  states_served?: string;
  funding_amount_min?: string;
  funding_amount_max?: string;
  ltv?: string;
  interest_rates?: string;
  amort_term?: string;
  min_fico?: string;
  contacts?: Array<{
    name?: string;
    title_role?: string;
    phone?: string;
    email?: string;
    notes?: string;
  }>;
  phone_numbers?: Array<{ label?: string; phone?: string }>;
  website?: string;
  notes?: string;
  source_urls?: string[];
}

function buildEnrichPrompt(args: {
  company: string;
  website?: string;
  knownProducts?: string;
  missingFields: string[];
}): string {
  return [
    "You are a research analyst helping a commercial-mortgage broker maintain their lender database.",
    "",
    `TASK: Use web search to find publicly available information about this lender and fill in what is missing.`,
    `Lender: ${args.company}`,
    args.website ? `Website: ${args.website}` : "",
    args.knownProducts
      ? `Known products / notes so far: ${args.knownProducts}`
      : "",
    `Missing fields we need: ${args.missingFields.join(", ")}`,
    "",
    "RULES:",
    "1. Prefer data from the lender's own website, SEC filings, LinkedIn, NMLS, or industry directories.",
    "2. Do NOT invent data. If a field is not publicly available, leave it as an empty string.",
    "3. For contacts, only include people publicly listed on the company's website or LinkedIn as working there in a lending / origination role.",
    "4. For phone_numbers, list main office / loan-intake / toll-free lines - NOT a personal cell.",
    "5. For program_list, break out each product (e.g. 'DSCR Investor', 'Fix & Flip', 'SBA 7(a)') and attach a min_fico and one-line requirements string if the site states them.",
    "6. Every non-empty field must be backed by at least one URL in source_urls.",
    "7. Keep notes under ~400 characters.",
    "",
    "Return results via the structured output schema.",
  ]
    .filter(Boolean)
    .join("\n");
}

/* ------------------------------------------------------------------ */
/* Provider calls                                                      */
/* ------------------------------------------------------------------ */

async function callOpenAIEnrich(
  prompt: string,
  key: string
): Promise<RawEnrichment> {
  const res = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o",
      tools: [{ type: "web_search_preview" }],
      input: prompt,
      text: {
        format: {
          type: "json_schema",
          name: "lender_enrichment",
          strict: false,
          schema: ENRICH_JSON_SCHEMA,
        },
      },
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(
      `OpenAI enrichment failed (${res.status}): ${body.slice(0, 400)}`
    );
  }
  const data = await res.json();
  const text = extractOpenAIText(data);
  return parseEnrichmentJson(text);
}

function extractOpenAIText(data: unknown): string {
  const obj = data as Record<string, unknown>;
  if (typeof obj.output_text === "string") return obj.output_text;
  const output = obj.output;
  if (Array.isArray(output)) {
    const parts: string[] = [];
    for (const item of output) {
      const content = (item as { content?: unknown[] }).content;
      if (Array.isArray(content)) {
        for (const c of content) {
          const t = (c as { text?: string }).text;
          if (typeof t === "string") parts.push(t);
        }
      }
    }
    if (parts.length) return parts.join("\n");
  }
  const choices = (obj as { choices?: unknown[] }).choices;
  if (Array.isArray(choices) && choices[0]) {
    const msg = (choices[0] as { message?: { content?: string } }).message;
    if (msg && typeof msg.content === "string") return msg.content;
  }
  return "";
}

async function callPerplexityEnrich(
  prompt: string,
  key: string
): Promise<RawEnrichment> {
  const res = await fetch("https://api.perplexity.ai/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "sonar-pro",
      messages: [
        {
          role: "system",
          content:
            "You are a commercial-mortgage lender researcher. Output ONLY valid JSON matching the schema the user describes - no prose, no markdown fences.",
        },
        { role: "user", content: prompt },
      ],
      response_format: {
        type: "json_schema",
        json_schema: { schema: ENRICH_JSON_SCHEMA },
      },
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(
      `Perplexity enrichment failed (${res.status}): ${body.slice(0, 400)}`
    );
  }
  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content ?? "";
  return parseEnrichmentJson(content);
}

/**
 * gpt-4o occasionally returns a JSON *Schema* description (with nested
 * `properties: { field: { type: "string" } }`) instead of instance data.
 * Passing that to Convex fails `rawEnrichmentValidator` with "extra field
 * `properties`". We detect and drop those payloads.
 */
function isJsonSchemaEcho(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const o = value as Record<string, unknown>;
  if (o.type !== "object" || !o.properties || typeof o.properties !== "object")
    return false;
  if (o.primary_niche != null || o.programs != null) return false;
  const props = o.properties as Record<string, unknown>;
  const first = Object.values(props)[0];
  return (
    first != null &&
    typeof first === "object" &&
    !Array.isArray(first) &&
    (first as { type?: string }).type === "string"
  );
}

const RAW_ENRICHMENT_KEYS: Array<keyof RawEnrichment> = [
  "primary_niche",
  "entity_type",
  "programs",
  "program_list",
  "property_types",
  "states_served",
  "funding_amount_min",
  "funding_amount_max",
  "ltv",
  "interest_rates",
  "amort_term",
  "min_fico",
  "contacts",
  "phone_numbers",
  "website",
  "notes",
  "source_urls",
];

/**
 * Only pass keys the `_applyEnrichment` validator knows about, so a stray
 * `properties` / `type` from the model never hits the database layer.
 */
function normalizeRawEnrichment(input: unknown): RawEnrichment {
  if (!input || typeof input !== "object" || isJsonSchemaEcho(input)) {
    return {};
  }
  const o = input as Record<string, unknown>;
  if (isJsonSchemaEcho((o as { result?: unknown }).result)) {
    return {};
  }
  const out: Record<string, unknown> = {};
  for (const k of RAW_ENRICHMENT_KEYS) {
    if (k in o && o[k] !== undefined) {
      out[k] = o[k];
    }
  }
  return out as RawEnrichment;
}

function parseEnrichmentJson(raw: string): RawEnrichment {
  if (!raw || !raw.trim()) return {};
  let text = raw.trim();
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) text = fence[1].trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    const m = text.match(/\{[\s\S]*\}/);
    if (m) {
      try {
        parsed = JSON.parse(m[0]);
      } catch {
        return {};
      }
    } else {
      return {};
    }
  }
  if (parsed && typeof parsed === "object" && "result" in (parsed as object)) {
    parsed = (parsed as { result: unknown }).result;
  }
  return normalizeRawEnrichment(parsed);
}

/* ------------------------------------------------------------------ */
/* Internal query / mutation                                           */
/* ------------------------------------------------------------------ */

interface EnrichSnapshot {
  _id: Id<"lenders">;
  company: string;
  /** Main contact phone (dedupe against new Serp API lines). */
  phone: string;
  website: string;
  primaryNiche: string;
  entityType: string;
  programs: string;
  propertyTypes: string;
  statesServed: string;
  fundingAmountMin: string;
  fundingAmountMax: string;
  ltv: string;
  interestRates: string;
  amortTerm: string;
  minFico: string;
  notes: string;
  contactsCount: number;
  phoneNumbersCount: number;
  programListCount: number;
  enrichedAt: number | null;
}

export const _getSnapshot = internalQuery({
  args: { id: v.id("lenders") },
  handler: async (ctx, { id }): Promise<EnrichSnapshot | null> => {
    const l = await ctx.db.get(id);
    if (!l) return null;
    return {
      _id: l._id,
      company: l.company,
      phone: l.phone ?? "",
      website: l.website,
      primaryNiche: l.primaryNiche,
      entityType: l.entityType,
      programs: l.programs,
      propertyTypes: l.propertyTypes,
      statesServed: l.statesServed,
      fundingAmountMin: lenderFundingMinRaw(l) ?? "",
      fundingAmountMax: lenderFundingMaxRaw(l) ?? "",
      ltv: l.ltv,
      interestRates: l.interestRates,
      amortTerm: l.amortTerm,
      minFico: l.minFico ?? "",
      notes: l.notes,
      contactsCount: l.contacts?.length ?? 0,
      phoneNumbersCount: l.phoneNumbers?.length ?? 0,
      programListCount: Array.isArray(l.programList) ? l.programList.length : 0,
      enrichedAt: l.enrichedAt ?? null,
    };
  },
});

const rawEnrichmentValidator = v.object({
  primary_niche: v.optional(v.string()),
  entity_type: v.optional(v.string()),
  programs: v.optional(v.string()),
  program_list: v.optional(
    v.array(
      v.object({
        name: v.optional(v.string()),
        min_fico: v.optional(v.string()),
        requirements: v.optional(v.string()),
      })
    )
  ),
  property_types: v.optional(v.string()),
  states_served: v.optional(v.string()),
  funding_amount_min: v.optional(v.string()),
  funding_amount_max: v.optional(v.string()),
  ltv: v.optional(v.string()),
  interest_rates: v.optional(v.string()),
  amort_term: v.optional(v.string()),
  min_fico: v.optional(v.string()),
  contacts: v.optional(
    v.array(
      v.object({
        name: v.optional(v.string()),
        title_role: v.optional(v.string()),
        phone: v.optional(v.string()),
        email: v.optional(v.string()),
        notes: v.optional(v.string()),
      })
    )
  ),
  phone_numbers: v.optional(
    v.array(
      v.object({
        label: v.optional(v.string()),
        phone: v.optional(v.string()),
      })
    )
  ),
  website: v.optional(v.string()),
  notes: v.optional(v.string()),
  source_urls: v.optional(v.array(v.string())),
});

function cleanStr(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw.replace(/\s+/g, " ").trim();
}

export const _applyEnrichment = internalMutation({
  args: {
    id: v.id("lenders"),
    raw: rawEnrichmentValidator,
    provider: v.string(),
  },
  handler: async (ctx, { id, raw, provider }) => {
    const l = await ctx.db.get(id);
    if (!l) throw new Error("Lender not found");

    const patch: Record<string, unknown> = {};
    const filled: string[] = [];

    const fillText = (key: string, incoming: string) => {
      const existing =
        ((l as unknown as Record<string, string>)[key] ?? "").trim();
      if (!existing && incoming) {
        patch[key] = incoming;
        filled.push(key);
      }
    };

    fillText("primaryNiche", cleanStr(raw.primary_niche));
    fillText("entityType", cleanStr(raw.entity_type));
    fillText("programs", cleanStr(raw.programs));
    fillText("propertyTypes", cleanStr(raw.property_types));
    fillText("statesServed", cleanStr(raw.states_served));
    fillText("fundingAmountMin", cleanStr(raw.funding_amount_min));
    fillText("fundingAmountMax", cleanStr(raw.funding_amount_max));
    fillText("ltv", cleanStr(raw.ltv));
    fillText("interestRates", cleanStr(raw.interest_rates));
    fillText("amortTerm", cleanStr(raw.amort_term));
    fillText("minFico", cleanStr(raw.min_fico));
    fillText("website", cleanStr(raw.website));

    // Notes: append with a separator if existing notes are present.
    const newNote = cleanStr(raw.notes);
    if (newNote) {
      const existingNotes = (l.notes ?? "").trim();
      if (!existingNotes) {
        patch.notes = newNote;
        filled.push("notes");
      } else if (!existingNotes.toLowerCase().includes(newNote.toLowerCase().slice(0, 40))) {
        patch.notes = `${existingNotes}\n\n---\n[auto-enriched]\n${newNote}`;
        filled.push("notes");
      }
    }

    // Structured programs: only fill if empty.
    if (
      (!Array.isArray(l.programList) || l.programList.length === 0) &&
      Array.isArray(raw.program_list)
    ) {
      const cleaned = raw.program_list
        .map((p) => ({
          name: cleanStr(p.name),
          minFico: cleanStr(p.min_fico),
          requirements: cleanStr(p.requirements),
        }))
        .filter((p) => p.name);
      if (cleaned.length > 0) {
        patch.programList = cleaned;
        filled.push("programList");
      }
    }

    // Contacts: only fill if empty.
    if ((l.contacts?.length ?? 0) === 0 && Array.isArray(raw.contacts)) {
      const cleaned = raw.contacts
        .map((c) => ({
          name: cleanStr(c.name),
          titleRole: cleanStr(c.title_role),
          phone: cleanStr(c.phone),
          email: cleanStr(c.email).toLowerCase(),
          notes: cleanStr(c.notes),
        }))
        .filter((c) => c.name);
      if (cleaned.length > 0) {
        patch.contacts = cleaned;
        filled.push("contacts");
      }
    }

    // Phone numbers: merge - add any phone the lender doesn't already have.
    if (Array.isArray(raw.phone_numbers) && raw.phone_numbers.length > 0) {
      const existingDigits = new Set<string>();
      const primary = cleanStr(l.phone).replace(/\D+/g, "");
      if (primary) existingDigits.add(primary);
      for (const p of l.phoneNumbers ?? []) {
        existingDigits.add(cleanStr(p.phone).replace(/\D+/g, ""));
      }
      const toAdd = raw.phone_numbers
        .map((p) => ({
          label: cleanStr(p.label),
          phone: cleanStr(p.phone),
        }))
        .filter((p) => {
          const d = p.phone.replace(/\D+/g, "");
          if (!d || existingDigits.has(d)) return false;
          existingDigits.add(d);
          return true;
        });
      if (toAdd.length > 0) {
        patch.phoneNumbers = [...(l.phoneNumbers ?? []), ...toAdd];
        filled.push("phoneNumbers");
      }
    }

    const sources = Array.isArray(raw.source_urls)
      ? raw.source_urls.map((s) => cleanStr(s)).filter(Boolean)
      : [];

    patch.enrichedAt = Date.now();
    patch.enrichmentStatus =
      filled.length > 0 ? `enriched-via-${provider}` : `no-new-data-${provider}`;
    if (sources.length > 0) patch.enrichmentSources = sources;
    patch.updatedAt = Date.now();

    const merged = { ...l, ...patch } as Doc<"lenders">;
    patch.incompleteData = isLenderIncomplete(merged);
    patch.searchText = buildLenderSearchBlob(merged);

    await ctx.db.patch(id, patch);

    const after = await ctx.db.get(id);
    if (after) await applyLenderWrite(ctx, l, after);

    return { filled, sources };
  },
});

export const _markFailed = internalMutation({
  args: { id: v.id("lenders"), message: v.string() },
  handler: async (ctx, { id, message }) => {
    const before = await ctx.db.get(id);
    if (!before) return;
    await ctx.db.patch(id, {
      enrichedAt: Date.now(),
      enrichmentStatus: `failed: ${message.slice(0, 120)}`,
      updatedAt: Date.now(),
    });
    const after = await ctx.db.get(id);
    if (after) await applyLenderWrite(ctx, before, after);
  },
});

/* ------------------------------------------------------------------ */
/* Actions                                                             */
/* ------------------------------------------------------------------ */

interface EnrichResult {
  status: "ok" | "failed" | "skipped";
  provider: string;
  filled: string[];
  sources: string[];
  error?: string;
}

/**
 * Shared worker used by both the single-lender action and the bulk loop.
 * Takes a minimal ActionCtx-like object so we don't care whether the caller
 * is enrichLender or enrichMissing.
 */
async function enrichOne(
  ctx: ActionCtx,
  id: Id<"lenders">
): Promise<EnrichResult> {
  const openaiKey = process.env.OPENAI_API_KEY;
  const pplxKey = process.env.PERPLEXITY_API_KEY;
  if (!openaiKey && !pplxKey) {
    return {
      status: "failed",
      provider: "none",
      filled: [],
      sources: [],
      error:
        "No LLM key configured. Run `npx convex env set OPENAI_API_KEY <key>` or PERPLEXITY_API_KEY.",
    };
  }

  const snapshot: EnrichSnapshot | null = await ctx.runQuery(
    internal.enrich._getSnapshot,
    { id }
  );
  if (!snapshot) {
    return {
      status: "failed",
      provider: "none",
      filled: [],
      sources: [],
      error: "Lender not found",
    };
  }

  const missing: string[] = [];
  if (!snapshot.primaryNiche) missing.push("primary_niche");
  if (!snapshot.programs && snapshot.programListCount === 0)
    missing.push("programs + program_list");
  if (!snapshot.propertyTypes) missing.push("property_types");
  if (!snapshot.statesServed) missing.push("states_served");
  if (!snapshot.fundingAmountMin && !snapshot.fundingAmountMax)
    missing.push("funding_amount_min/max");
  if (!snapshot.minFico) missing.push("min_fico");
  if (!snapshot.website) missing.push("website");
  if (snapshot.contactsCount === 0) missing.push("contacts");
  if (snapshot.phoneNumbersCount === 0) missing.push("phone_numbers");
  if (!snapshot.notes) missing.push("notes");
  if (missing.length === 0) missing.push("program_list", "contacts");

  const prompt = buildEnrichPrompt({
    company: snapshot.company,
    website: snapshot.website || undefined,
    knownProducts: [snapshot.primaryNiche, snapshot.programs, snapshot.notes]
      .filter(Boolean)
      .join(" | "),
    missingFields: missing,
  });

  let provider: "openai" | "perplexity" = "openai";
  try {
    let raw: RawEnrichment;
    if (openaiKey) {
      try {
        provider = "openai";
        raw = await callOpenAIEnrich(prompt, openaiKey);
      } catch (err) {
        if (!pplxKey) throw err;
        provider = "perplexity";
        raw = await callPerplexityEnrich(prompt, pplxKey);
      }
    } else {
      provider = "perplexity";
      raw = await callPerplexityEnrich(prompt, pplxKey as string);
    }

    raw = normalizeRawEnrichment(raw);

    const res: { filled: string[]; sources: string[] } = await ctx.runMutation(
      internal.enrich._applyEnrichment,
      { id, raw, provider }
    );
    if (res.filled.length === 0 && process.env.SERPAPI_KEY) {
      const serp = await enrichOneSerpApi(ctx, id);
      if (serp.filled.length > 0) {
        return {
          status: "ok",
          provider: `${provider}+serpapi`,
          filled: serp.filled,
          sources: serp.sources,
        };
      }
    }
    return {
      status: "ok",
      provider,
      filled: res.filled,
      sources: res.sources,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (process.env.SERPAPI_KEY) {
      try {
        return await enrichOneSerpApi(ctx, id);
      } catch {
        // fall through to _markFailed
      }
    }
    await ctx.runMutation(internal.enrich._markFailed, {
      id,
      message,
    });
    return {
      status: "failed",
      provider,
      filled: [],
      sources: [],
      error: message,
    };
  }
}

export const enrichLender = action({
  args: { id: v.id("lenders") },
  handler: async (ctx, { id }): Promise<EnrichResult> => enrichOne(ctx, id),
});

interface BulkEnrichResult {
  total: number;
  succeeded: number;
  filled: number;
  failed: number;
  details: Array<{
    id: Id<"lenders">;
    status: "ok" | "failed" | "skipped";
    filled: string[];
    error?: string;
  }>;
}

/**
 * Bulk-enrich the N most-stale incomplete lenders. Runs sequentially with a
 * small delay to stay inside LLM rate limits.
 */
export const enrichMissing = action({
  args: {
    limit: v.optional(v.number()),
    delayMs: v.optional(v.number()),
    /** If true, omit per-lender `details` in the return value (huge for large runs). */
    summaryOnly: v.optional(v.boolean()),
  },
  handler: async (
    ctx,
    { limit, delayMs, summaryOnly }
  ): Promise<BulkEnrichResult> => {
    const delay = Math.max(0, Math.min(delayMs ?? 800, 5000));
    const incomplete: { total: number; ids: Id<"lenders">[] } =
      await ctx.runQuery(internal.lenders._listIncompleteInternal, {
        limit: limit ?? 25,
      });

    const details: BulkEnrichResult["details"] = [];
    let succeeded = 0;
    let failed = 0;
    let filledTotal = 0;
    for (const id of incomplete.ids) {
      const r: EnrichResult = await enrichOne(ctx, id);
      const filled = r.filled ?? [];
      if (r.status === "ok") {
        succeeded += 1;
        filledTotal += filled.length;
      } else {
        failed += 1;
      }
      if (!summaryOnly) {
        details.push({
          id,
          status: r.status,
          filled,
          error: r.error,
        });
      }
      if (delay > 0) await new Promise((r) => setTimeout(r, delay));
    }
    return {
      total: incomplete.ids.length,
      succeeded,
      filled: filledTotal,
      failed,
      details: summaryOnly ? [] : details,
    };
  },
});

/* =====================================================================
 * SerpAPI-only enrichment path (no LLM required)
 *
 * Uses Google search results (via SerpAPI) and regex extraction to fill in
 * *public* contact data - phone numbers, emails, website, address. It
 * cannot synthesize programs/niche/program_list the way an LLM can, so
 * this path only patches fields where regex has high confidence.
 * ===================================================================== */

interface SerpApiResult {
  knowledge_graph?: {
    phone?: string;
    website?: string;
    title?: string;
    address?: string;
    type?: string;
    description?: string;
  };
  local_results?: {
    places?: Array<{
      phone?: string;
      address?: string;
      title?: string;
      website?: string;
    }>;
  };
  organic_results?: Array<{
    title?: string;
    link?: string;
    snippet?: string;
    displayed_link?: string;
  }>;
  answer_box?: {
    phone?: string;
    snippet?: string;
    link?: string;
  };
}

// Matches US/Canada phone numbers in +1 / (###) ###-#### / ###-###-#### / ###.###.####
const PHONE_RE =
  /(?:\+?1[\s.\-]?)?\(?([2-9]\d{2})\)?[\s.\-]?([2-9]\d{2})[\s.\-]?(\d{4})/g;

const EMAIL_RE = /[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}/g;

const US_STATE_NAMES: Record<string, string> = {
  alabama: "AL",
  alaska: "AK",
  arizona: "AZ",
  arkansas: "AR",
  california: "CA",
  colorado: "CO",
  connecticut: "CT",
  delaware: "DE",
  florida: "FL",
  georgia: "GA",
  hawaii: "HI",
  idaho: "ID",
  illinois: "IL",
  indiana: "IN",
  iowa: "IA",
  kansas: "KS",
  kentucky: "KY",
  louisiana: "LA",
  maine: "ME",
  maryland: "MD",
  massachusetts: "MA",
  michigan: "MI",
  minnesota: "MN",
  mississippi: "MS",
  missouri: "MO",
  montana: "MT",
  nebraska: "NE",
  nevada: "NV",
  "new hampshire": "NH",
  "new jersey": "NJ",
  "new mexico": "NM",
  "new york": "NY",
  "north carolina": "NC",
  "north dakota": "ND",
  ohio: "OH",
  oklahoma: "OK",
  oregon: "OR",
  pennsylvania: "PA",
  "rhode island": "RI",
  "south carolina": "SC",
  "south dakota": "SD",
  tennessee: "TN",
  texas: "TX",
  utah: "UT",
  vermont: "VT",
  virginia: "VA",
  washington: "WA",
  "west virginia": "WV",
  wisconsin: "WI",
  wyoming: "WY",
};

/**
 * Common Google/social domains we never want to record as a lender's
 * "official" website. Ranked in the order we check them so we can skip to
 * the first non-garbage `organic_results` entry.
 */
const DOMAIN_BLOCKLIST = [
  "google.",
  "facebook.com",
  "linkedin.com",
  "twitter.com",
  "x.com",
  "instagram.com",
  "youtube.com",
  "yelp.com",
  "bbb.org",
  "bloomberg.com",
  "wikipedia.org",
  "crunchbase.com",
  "reuters.com",
  "zoominfo.com",
  "rocketreach.co",
  "glassdoor.com",
  "indeed.com",
  "apollo.io",
];

function looksLikeBlockedDomain(url: string): boolean {
  const lower = url.toLowerCase();
  return DOMAIN_BLOCKLIST.some((d) => lower.includes(d));
}

function normalizeDomain(url: string | undefined): string {
  if (!url) return "";
  try {
    const u = new URL(url.includes("://") ? url : `https://${url}`);
    return u.hostname.toLowerCase();
  } catch {
    return "";
  }
}

async function fetchSerpApi(
  key: string,
  company: string,
  hintDomain: string
): Promise<SerpApiResult> {
  const queryParts = [`"${company}"`, "loan OR lender OR financing"];
  if (hintDomain) queryParts.push(`site:${hintDomain} OR ${company}`);
  queryParts.push("contact phone");
  const q = queryParts.join(" ");
  const url = `https://serpapi.com/search.json?engine=google&num=10&api_key=${encodeURIComponent(
    key
  )}&q=${encodeURIComponent(q)}`;
  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.text();
    throw new Error(
      `SerpAPI call failed (${res.status}): ${body.slice(0, 300)}`
    );
  }
  return (await res.json()) as SerpApiResult;
}

function extractFromSerp(
  result: SerpApiResult,
  snapshot: EnrichSnapshot
): { raw: RawEnrichment; sources: string[] } {
  const sources: string[] = [];
  const raw: RawEnrichment = {};

  const kg = result.knowledge_graph;
  const company = snapshot.company.toLowerCase();
  const existingDigits = new Set<string>();
  const primary = cleanStr(snapshot.phone).replace(/\D+/g, "");
  if (primary) existingDigits.add(primary);

  // --- Website ---
  // Prefer knowledge_graph.website, fall back to the first non-blocklisted organic
  // result whose domain looks plausibly owned by the lender.
  let website = "";
  if (kg?.website && !looksLikeBlockedDomain(kg.website)) {
    website = kg.website;
    if (!sources.includes(website)) sources.push(website);
  } else if (result.organic_results) {
    for (const o of result.organic_results) {
      const link = o.link ?? "";
      if (!link) continue;
      if (looksLikeBlockedDomain(link)) continue;
      const host = normalizeDomain(link);
      if (!host) continue;
      // Prefer a domain whose host contains a token from the company name.
      const tokens = company
        .split(/[^a-z0-9]+/)
        .filter((t) => t.length >= 4);
      if (tokens.some((t) => host.includes(t))) {
        // Store origin only (strip paths/queries) so we don't record a 404 deep link.
        try {
          const u = new URL(link);
          website = `${u.protocol}//${u.host}`;
        } catch {
          website = link;
        }
        sources.push(link);
        break;
      }
    }
  }
  if (website) raw.website = website;

  // --- Phone (primary, if missing) ---
  const phoneCandidates: Array<{ phone: string; label: string }> = [];
  const addPhone = (maybe: string | undefined, label: string) => {
    if (!maybe) return;
    PHONE_RE.lastIndex = 0;
    const m = PHONE_RE.exec(maybe);
    if (!m) return;
    const formatted = `(${m[1]}) ${m[2]}-${m[3]}`;
    const digits = `${m[1]}${m[2]}${m[3]}`;
    if (existingDigits.has(digits)) return;
    existingDigits.add(digits);
    phoneCandidates.push({ phone: formatted, label });
  };

  if (kg?.phone) addPhone(kg.phone, "Main");
  if (result.answer_box?.phone) addPhone(result.answer_box.phone, "Main");
  for (const lr of result.local_results?.places ?? []) {
    addPhone(lr.phone, lr.title ?? "Office");
    if (lr.website && !website && !looksLikeBlockedDomain(lr.website)) {
      website = lr.website;
      raw.website = website;
    }
  }
  // Also regex-scan top organic snippets for phones.
  for (const o of result.organic_results?.slice(0, 5) ?? []) {
    const text = `${o.title ?? ""} ${o.snippet ?? ""}`;
    if (!text) continue;
    PHONE_RE.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = PHONE_RE.exec(text)) !== null) {
      const formatted = `(${match[1]}) ${match[2]}-${match[3]}`;
      const digits = `${match[1]}${match[2]}${match[3]}`;
      if (existingDigits.has(digits)) continue;
      existingDigits.add(digits);
      phoneCandidates.push({ phone: formatted, label: "" });
      if (o.link && !sources.includes(o.link)) sources.push(o.link);
    }
  }

  if (phoneCandidates.length > 0) {
    raw.phone_numbers = phoneCandidates.slice(0, 6);
  }

  // --- Emails ---
  // Scan top results' snippets for email addresses that match the company domain.
  const emails = new Set<string>();
  const snippetBlob = (result.organic_results ?? [])
    .slice(0, 5)
    .map((o) => `${o.title ?? ""} ${o.snippet ?? ""}`)
    .join("\n");
  let em: RegExpExecArray | null;
  EMAIL_RE.lastIndex = 0;
  while ((em = EMAIL_RE.exec(snippetBlob)) !== null) {
    emails.add(em[0].toLowerCase());
  }
  // Keep emails from the official domain if we have one, otherwise take the first.
  const preferredDomain = normalizeDomain(website);
  const emailArr = Array.from(emails);
  let pickedEmail = "";
  if (preferredDomain) {
    pickedEmail =
      emailArr.find((e) => e.endsWith(`@${preferredDomain.replace(/^www\./, "")}`)) ??
      "";
  }
  if (!pickedEmail && emailArr.length > 0) pickedEmail = emailArr[0];
  // Use a private "synthetic contact" to smuggle the email into
  // `_applyEnrichment` via the contacts channel - that path only fills the
  // `contacts` field when it's currently empty so broker primaries are safe.
  // Alternatively we can skip it; prefer storing it on contacts so the raw
  // `email` lender field remains broker-curated.
  if (pickedEmail && snapshot.contactsCount === 0) {
    raw.contacts = [
      {
        name: snapshot.company,
        title_role: "General Inquiries",
        email: pickedEmail,
      },
    ];
  }

  // --- Short notes from knowledge graph / answer box ---
  const notesBits: string[] = [];
  if (kg?.description) notesBits.push(kg.description);
  if (result.answer_box?.snippet && !kg?.description)
    notesBits.push(result.answer_box.snippet);
  if (kg?.address) notesBits.push(`HQ: ${kg.address}`);
  if (notesBits.length > 0) {
    raw.notes = notesBits.join(" • ").slice(0, 400);
  }

  // --- States (from kg address or business profile) ---
  if (!snapshot.statesServed) {
    const addressBlob = [kg?.address, ...(result.local_results?.places ?? []).map((p) => p.address)]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    const codes = new Set<string>();
    // 2-letter codes (word boundary), skip when preceded by @ so emails don't count.
    const codeRe = /\b([A-Z]{2})\b/g;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const originalBlob = [kg?.address, ...(result.local_results?.places ?? []).map((p) => p.address)]
      .filter(Boolean)
      .join(" ");
    let cm: RegExpExecArray | null;
    while ((cm = codeRe.exec(originalBlob)) !== null) {
      const c = cm[1];
      if (Object.values(US_STATE_NAMES).includes(c)) codes.add(c);
    }
    for (const [name, code] of Object.entries(US_STATE_NAMES)) {
      if (addressBlob.includes(name)) codes.add(code);
    }
    if (codes.size > 0) {
      raw.states_served = Array.from(codes).sort().join(", ");
    }
  }

  // Always track the organic result links as sources so brokers can QC.
  for (const o of result.organic_results?.slice(0, 5) ?? []) {
    if (o.link && !sources.includes(o.link) && !looksLikeBlockedDomain(o.link))
      sources.push(o.link);
  }
  raw.source_urls = sources.slice(0, 6);

  return { raw, sources: raw.source_urls };
}

async function enrichOneSerpApi(
  ctx: ActionCtx,
  id: Id<"lenders">
): Promise<EnrichResult> {
  const key = process.env.SERPAPI_KEY;
  if (!key) {
    return {
      status: "failed",
      provider: "serpapi",
      filled: [],
      sources: [],
      error:
        "No SerpAPI key configured. Run `npx convex env set SERPAPI_KEY <key>`.",
    };
  }

  const snapshot: EnrichSnapshot | null = await ctx.runQuery(
    internal.enrich._getSnapshot,
    { id }
  );
  if (!snapshot) {
    return {
      status: "failed",
      provider: "serpapi",
      filled: [],
      sources: [],
      error: "Lender not found",
    };
  }

  try {
    const hint = normalizeDomain(snapshot.website).replace(/^www\./, "");
    const serp = await fetchSerpApi(key, snapshot.company, hint);
    const { raw } = extractFromSerp(serp, snapshot);

    // If we didn't get anything actionable, mark as no-new-data so we don't
    // immediately re-process this lender on the next pass.
    const actionable =
      !!raw.website ||
      !!raw.notes ||
      !!raw.states_served ||
      (raw.phone_numbers?.length ?? 0) > 0 ||
      (raw.contacts?.length ?? 0) > 0;
    if (!actionable) {
      await ctx.runMutation(internal.enrich._applyEnrichment, {
        id,
        raw: {} as never,
        provider: "serpapi",
      });
      return {
        status: "ok",
        provider: "serpapi",
        filled: [],
        sources: [],
      };
    }

    const res: { filled: string[]; sources: string[] } =
      await ctx.runMutation(internal.enrich._applyEnrichment, {
        id,
        raw: raw as never,
        provider: "serpapi",
      });
    return {
      status: "ok",
      provider: "serpapi",
      filled: res.filled,
      sources: res.sources,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await ctx.runMutation(internal.enrich._markFailed, {
      id,
      message,
    });
    return {
      status: "failed",
      provider: "serpapi",
      filled: [],
      sources: [],
      error: message,
    };
  }
}

export const enrichLenderSerp = action({
  args: { id: v.id("lenders") },
  handler: async (ctx, { id }): Promise<EnrichResult> => enrichOneSerpApi(ctx, id),
});

/**
 * Bulk-enrich via SerpAPI. Default chunk size is 50 so we stay comfortably
 * inside the per-action execution limits; call repeatedly until
 * `listIncomplete.total` stops dropping.
 */
export const enrichMissingSerp = action({
  args: {
    limit: v.optional(v.number()),
    delayMs: v.optional(v.number()),
  },
  handler: async (
    ctx,
    { limit, delayMs }
  ): Promise<BulkEnrichResult> => {
    const delay = Math.max(0, Math.min(delayMs ?? 250, 5000));
    const incomplete: { total: number; ids: Id<"lenders">[] } =
      await ctx.runQuery(internal.lenders._listIncompleteInternal, {
        limit: limit ?? 50,
      });

    const details: BulkEnrichResult["details"] = [];
    let succeeded = 0;
    let failed = 0;
    let filledTotal = 0;
    for (const id of incomplete.ids) {
      const r: EnrichResult = await enrichOneSerpApi(ctx, id);
      const filled = r.filled ?? [];
      if (r.status === "ok") {
        succeeded += 1;
        filledTotal += filled.length;
      } else {
        failed += 1;
      }
      details.push({
        id,
        status: r.status,
        filled,
        error: r.error,
      });
      if (delay > 0) await new Promise((r) => setTimeout(r, delay));
    }
    return {
      total: incomplete.ids.length,
      succeeded,
      filled: filledTotal,
      failed,
      details,
    };
  },
});
