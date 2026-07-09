/**
 * AI-powered lender discovery.
 *
 * Flow:
 *   1. UI calls the `runDiscovery` action with a natural-language query.
 *   2. Action hits OpenAI (Responses API w/ web_search) or Perplexity (sonar)
 *      to scour the live web for direct lenders matching the query.
 *   3. Results are parsed into structured candidate rows and stored in the
 *      `lenderCandidates` table with status = "pending".
 *   4. Any candidate whose normalized company name is already in the
 *      `lenders` table is auto-marked "duplicate" so brokers aren't asked
 *      to review lenders they already have.
 *   5. The broker reviews candidates in the UI and either accepts (converts
 *      to a real `lenders` row) or dismisses each.
 *
 * Required environment (set with `npx convex env set ...`):
 *   - OPENAI_API_KEY          (preferred)
 *   - PERPLEXITY_API_KEY      (alternative)
 * At least one must be set.
 */
import { action, mutation, query, internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { applyLenderWrite, isLenderIncomplete } from "./lenderWriteStats";
import { buildLenderSearchBlob } from "./lenderSearchText";

/* ------------------------------------------------------------------ */
/* Prompt + JSON schema                                                */
/* ------------------------------------------------------------------ */

const LENDER_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    candidates: {
      type: "array",
      description: "Direct lenders that match the broker's query",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          company: { type: "string", description: "Lender / company name" },
          website: { type: "string", description: "Primary website URL" },
          contact_name: { type: "string", description: "Contact person if listed publicly" },
          phone: { type: "string", description: "Public phone number" },
          email: { type: "string", description: "Public contact email" },
          entity_type: {
            type: "string",
            description:
              "Bank, Credit Union, SBA Lender, Hard Money / Bridge, Private Fund, Agency / Multifamily, Equipment / Leasing, etc.",
          },
          primary_niche: {
            type: "string",
            description: "One-line summary of the lender's specialty",
          },
          programs: {
            type: "string",
            description: "Comma-separated list of loan products (SBA 7(a), DSCR, Fix & Flip, etc.)",
          },
          property_types: {
            type: "string",
            description: "Comma-separated property types accepted",
          },
          states_served: {
            type: "string",
            description: "State list or 'Nationwide' or 'All 50 states'",
          },
          funding_amount_min: { type: "string", description: "Min loan size, e.g. $250K" },
          funding_amount_max: { type: "string", description: "Max loan size, e.g. $25M" },
          notes: {
            type: "string",
            description: "Anything else useful: FICO min, LTV, niches, restrictions, reviews",
          },
          source_url: {
            type: "string",
            description: "URL where you found the primary information",
          },
          confidence: {
            type: "number",
            description: "0-1 how confident you are this is a real DIRECT lender (not a broker/aggregator)",
          },
        },
        required: ["company"],
      },
    },
  },
  required: ["candidates"],
} as const;

function buildPrompt(query: string, maxResults: number, existing: string[]): string {
  const existingPreview = existing.slice(0, 120).join(", ");
  return [
    "You are a research analyst helping a commercial-mortgage broker expand their referral network of DIRECT lenders (not brokers, aggregators, or lead-gen sites).",
    "",
    `TASK: Use web search to find up to ${maxResults} direct lenders that match this scenario:`,
    `"${query}"`,
    "",
    "RULES:",
    "1. Only include DIRECT lenders that fund deals themselves (look for phrases like 'direct lender', 'we fund', balance sheet lender, portfolio lender). Skip lead-gen sites and marketplaces (LendingTree, Nav, Fundera, etc.).",
    "2. Prefer specialty niche lenders over household-name banks.",
    "3. For each lender, extract contact/programs/states/loan-size from their actual website where possible.",
    "4. Set confidence lower for lenders you're less certain about.",
    "5. Do NOT invent data. Leave fields blank if you genuinely cannot find them.",
    "6. Avoid duplicating lenders the broker already has (partial list below). If a candidate clearly matches one of these, skip it.",
    "",
    `EXISTING LENDERS (do not return these): ${existingPreview}`,
    "",
    "Return results via the structured output schema. Every candidate must include at minimum the company name and a source_url.",
  ].join("\n");
}

/* ------------------------------------------------------------------ */
/* Provider calls                                                      */
/* ------------------------------------------------------------------ */

interface RawCandidate {
  company?: string;
  website?: string;
  contact_name?: string;
  phone?: string;
  email?: string;
  entity_type?: string;
  primary_niche?: string;
  programs?: string;
  property_types?: string;
  states_served?: string;
  funding_amount_min?: string;
  funding_amount_max?: string;
  notes?: string;
  source_url?: string;
  confidence?: number;
}

async function callOpenAI(prompt: string, key: string): Promise<RawCandidate[]> {
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
          name: "lender_candidates",
          strict: false,
          schema: LENDER_JSON_SCHEMA,
        },
      },
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`OpenAI discovery failed (${res.status}): ${body.slice(0, 400)}`);
  }
  const data = await res.json();
  const text = extractOpenAIText(data);
  return parseCandidatesJson(text);
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
  // Responses API legacy shape
  const choices = (obj as { choices?: unknown[] }).choices;
  if (Array.isArray(choices) && choices[0]) {
    const msg = (choices[0] as { message?: { content?: string } }).message;
    if (msg && typeof msg.content === "string") return msg.content;
  }
  return "";
}

async function callPerplexity(prompt: string, key: string): Promise<RawCandidate[]> {
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
        json_schema: { schema: LENDER_JSON_SCHEMA },
      },
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Perplexity discovery failed (${res.status}): ${body.slice(0, 400)}`);
  }
  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content ?? "";
  return parseCandidatesJson(content);
}

function parseCandidatesJson(raw: string): RawCandidate[] {
  if (!raw || !raw.trim()) return [];
  // Strip markdown fences if a model accidentally wraps JSON
  let text = raw.trim();
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) text = fence[1].trim();
  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) return parsed as RawCandidate[];
    if (parsed && Array.isArray(parsed.candidates))
      return parsed.candidates as RawCandidate[];
    return [];
  } catch {
    // Try to grab the first {...} block
    const m = text.match(/\{[\s\S]*\}/);
    if (m) {
      try {
        const parsed = JSON.parse(m[0]);
        if (parsed && Array.isArray(parsed.candidates))
          return parsed.candidates as RawCandidate[];
      } catch {
        // fall through
      }
    }
    return [];
  }
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function normalizeKey(s: string | undefined | null): string {
  return (s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function cleanStr(v: unknown): string {
  if (typeof v !== "string") return "";
  return v.replace(/\s+/g, " ").trim();
}

/* ------------------------------------------------------------------ */
/* Internal query / mutations                                          */
/* ------------------------------------------------------------------ */

export const _existingCompanyKeys = internalQuery({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("lenders").collect();
    const names = Array.from(new Set(rows.map((r) => r.company).filter(Boolean)));
    const keyPairs: Array<{ key: string; lenderId: Id<"lenders"> }> = [];
    const seen = new Set<string>();
    for (const r of rows) {
      if (r.companyKey && !seen.has(r.companyKey)) {
        seen.add(r.companyKey);
        keyPairs.push({ key: r.companyKey, lenderId: r._id });
      }
    }
    return { names, keyPairs };
  },
});

export const _storeCandidates = internalMutation({
  args: {
    query: v.string(),
    provider: v.string(),
    rawCandidates: v.array(
      v.object({
        company: v.optional(v.string()),
        website: v.optional(v.string()),
        contact_name: v.optional(v.string()),
        phone: v.optional(v.string()),
        email: v.optional(v.string()),
        entity_type: v.optional(v.string()),
        primary_niche: v.optional(v.string()),
        programs: v.optional(v.string()),
        property_types: v.optional(v.string()),
        states_served: v.optional(v.string()),
        funding_amount_min: v.optional(v.string()),
        funding_amount_max: v.optional(v.string()),
        notes: v.optional(v.string()),
        source_url: v.optional(v.string()),
        confidence: v.optional(v.number()),
      })
    ),
    existingKeyPairs: v.array(
      v.object({ key: v.string(), lenderId: v.id("lenders") })
    ),
  },
  handler: async (ctx, { query, provider, rawCandidates, existingKeyPairs }) => {
    const now = Date.now();
    const existingKeys = new Map<string, Id<"lenders">>(
      existingKeyPairs.map((pair) => [pair.key, pair.lenderId])
    );
    let inserted = 0;
    let duplicates = 0;
    const warnings: string[] = [];

    const uniqueKeys = new Set<string>();
    for (const raw of rawCandidates) {
      const c = cleanStr(raw.company);
      if (!c) continue;
      const k = normalizeKey(c);
      if (k) uniqueKeys.add(k);
    }

    const hasPending = new Map<string, boolean>();
    if (uniqueKeys.size > 0) {
      await Promise.all(
        Array.from(uniqueKeys, async (key) => {
          const alreadyPending = await ctx.db
            .query("lenderCandidates")
            .withIndex("by_company", (q) => q.eq("companyKey", key))
            .filter((q) => q.neq(q.field("status"), "dismissed"))
            .first();
          hasPending.set(key, Boolean(alreadyPending));
        })
      );
    }

    for (const raw of rawCandidates) {
      const company = cleanStr(raw.company);
      if (!company) {
        warnings.push("skipped empty company");
        continue;
      }
      const key = normalizeKey(company);
      if (!key) continue;

      if (hasPending.get(key)) {
        duplicates += 1;
        continue;
      }

      const existingLenderId = existingKeys.get(key);
      const status: "pending" | "duplicate" = existingLenderId
        ? "duplicate"
        : "pending";

      await ctx.db.insert("lenderCandidates", {
        query,
        provider,
        company,
        website: cleanStr(raw.website),
        contactName: cleanStr(raw.contact_name),
        phone: cleanStr(raw.phone),
        email: cleanStr(raw.email),
        entityType: cleanStr(raw.entity_type),
        primaryNiche: cleanStr(raw.primary_niche),
        programs: cleanStr(raw.programs),
        propertyTypes: cleanStr(raw.property_types),
        statesServed: cleanStr(raw.states_served),
        fundingAmountMin: cleanStr(raw.funding_amount_min),
        fundingAmountMax: cleanStr(raw.funding_amount_max),
        notes: cleanStr(raw.notes),
        sourceUrl: cleanStr(raw.source_url),
        confidence: typeof raw.confidence === "number" ? raw.confidence : 0.5,
        status,
        duplicateOfLenderId: existingLenderId,
        createdAt: now,
        updatedAt: now,
        companyKey: key,
      });
      if (status === "duplicate") duplicates += 1;
      else inserted += 1;
    }

    await ctx.db.insert("discoveryRuns", {
      query,
      provider,
      candidatesFound: inserted,
      duplicatesSkipped: duplicates,
      warnings,
      createdAt: now,
    });

    return { inserted, duplicates, warnings };
  },
});

/* ------------------------------------------------------------------ */
/* Public action: kicks off an AI search                               */
/* ------------------------------------------------------------------ */

interface DiscoveryResult {
  query: string;
  provider: string;
  inserted: number;
  duplicates: number;
  warnings: string[];
}

export const runDiscovery = action({
  args: {
    query: v.string(),
    maxResults: v.optional(v.number()),
    provider: v.optional(v.union(v.literal("openai"), v.literal("perplexity"))),
  },
  handler: async (ctx, { query, maxResults, provider }): Promise<DiscoveryResult> => {
    const q = query.trim();
    if (!q) throw new Error("Query is required");
    const cap = Math.max(1, Math.min(maxResults ?? 10, 25));

    const openaiKey = process.env.OPENAI_API_KEY;
    const perplexityKey = process.env.PERPLEXITY_API_KEY;
    if (!openaiKey && !perplexityKey) {
      throw new Error(
        "No AI search key configured. Run `npx convex env set OPENAI_API_KEY sk-...` " +
          "or `npx convex env set PERPLEXITY_API_KEY pplx-...` from the lender-app directory."
      );
    }

    // Build prompt with existing lender names for dedupe awareness
    const existing: {
      names: string[];
      keyPairs: Array<{ key: string; lenderId: Id<"lenders"> }>;
    } = await ctx.runQuery(internal.discovery._existingCompanyKeys, {});
    const { names, keyPairs } = existing;
    const prompt = buildPrompt(q, cap, names);

    const preferred = provider ?? (openaiKey ? "openai" : "perplexity");
    const order =
      preferred === "openai"
        ? (["openai", "perplexity"] as const)
        : (["perplexity", "openai"] as const);

    let raw: RawCandidate[] = [];
    let used: string = "";
    let lastError: Error | null = null;

    for (const prov of order) {
      if (prov === "openai" && !openaiKey) continue;
      if (prov === "perplexity" && !perplexityKey) continue;
      try {
        raw =
          prov === "openai"
            ? await callOpenAI(prompt, openaiKey!)
            : await callPerplexity(prompt, perplexityKey!);
        used = prov;
        if (raw.length > 0) break;
      } catch (e) {
        lastError = e as Error;
        continue;
      }
    }

    if (!used) {
      throw lastError ?? new Error("All configured providers failed");
    }

    const result: {
      inserted: number;
      duplicates: number;
      warnings: string[];
    } = await ctx.runMutation(internal.discovery._storeCandidates, {
      query: q,
      provider: used,
      rawCandidates: raw,
      existingKeyPairs: keyPairs,
    });

    return {
      query: q,
      provider: used,
      inserted: result.inserted,
      duplicates: result.duplicates,
      warnings: result.warnings,
    };
  },
});

/* ------------------------------------------------------------------ */
/* Public queries                                                      */
/* ------------------------------------------------------------------ */

export const listCandidates = query({
  args: {
    status: v.optional(
      v.union(
        v.literal("pending"),
        v.literal("accepted"),
        v.literal("dismissed"),
        v.literal("duplicate"),
        v.literal("all")
      )
    ),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { status, limit }) => {
    const cap = Math.min(limit ?? 200, 500);
    const effective = status ?? "pending";
    if (effective === "all") {
      return await ctx.db.query("lenderCandidates").order("desc").take(cap);
    }
    return await ctx.db
      .query("lenderCandidates")
      .withIndex("by_status", (q) => q.eq("status", effective))
      .order("desc")
      .take(cap);
  },
});

export const recentRuns = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit }) => {
    const cap = Math.min(limit ?? 20, 100);
    return await ctx.db
      .query("discoveryRuns")
      .withIndex("by_created")
      .order("desc")
      .take(cap);
  },
});

export const providerStatus = query({
  args: {},
  handler: async () => {
    return {
      openai: Boolean(process.env.OPENAI_API_KEY),
      perplexity: Boolean(process.env.PERPLEXITY_API_KEY),
    };
  },
});

/* ------------------------------------------------------------------ */
/* Public mutations: edit / accept / dismiss                           */
/* ------------------------------------------------------------------ */

export const updateCandidate = mutation({
  args: {
    id: v.id("lenderCandidates"),
    patch: v.object({
      company: v.optional(v.string()),
      website: v.optional(v.string()),
      contactName: v.optional(v.string()),
      phone: v.optional(v.string()),
      email: v.optional(v.string()),
      entityType: v.optional(v.string()),
      primaryNiche: v.optional(v.string()),
      programs: v.optional(v.string()),
      propertyTypes: v.optional(v.string()),
      statesServed: v.optional(v.string()),
      fundingAmountMin: v.optional(v.string()),
      fundingAmountMax: v.optional(v.string()),
      notes: v.optional(v.string()),
      sourceUrl: v.optional(v.string()),
    }),
  },
  handler: async (ctx, { id, patch }) => {
    const existing = await ctx.db.get(id);
    if (!existing) throw new Error("Candidate not found");
    const clean: Record<string, string> = {};
    for (const [k, v] of Object.entries(patch)) {
      if (typeof v === "string") clean[k] = v;
    }
    const nextCompany =
      typeof patch.company === "string" ? patch.company : existing.company;
    await ctx.db.patch(id, {
      ...clean,
      companyKey: normalizeKey(nextCompany),
      updatedAt: Date.now(),
    });
    return { ok: true };
  },
});

export const dismissCandidate = mutation({
  args: { id: v.id("lenderCandidates") },
  handler: async (ctx, { id }) => {
    await ctx.db.patch(id, { status: "dismissed", updatedAt: Date.now() });
    return { ok: true };
  },
});

export const deleteCandidate = mutation({
  args: { id: v.id("lenderCandidates") },
  handler: async (ctx, { id }) => {
    await ctx.db.delete(id);
    return { ok: true };
  },
});

export const clearDismissed = mutation({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db
      .query("lenderCandidates")
      .withIndex("by_status", (q) => q.eq("status", "dismissed"))
      .collect();
    for (const r of rows) await ctx.db.delete(r._id);
    return { deleted: rows.length };
  },
});

export const acceptCandidate = mutation({
  args: { id: v.id("lenderCandidates") },
  handler: async (ctx, { id }) => {
    const c = await ctx.db.get(id);
    if (!c) throw new Error("Candidate not found");
    const now = Date.now();
    const today = new Date(now).toISOString().slice(0, 10);
    const emailKey = c.email.toLowerCase();
    const contactKey = normalizeKey(c.contactName);

    // Try to find an existing lender to update
    let existing: Doc<"lenders"> | null = null;
    if (emailKey) {
      existing = await ctx.db
        .query("lenders")
        .withIndex("by_company_email", (q) =>
          q.eq("companyKey", c.companyKey).eq("emailKey", emailKey)
        )
        .first();
    }
    if (!existing && contactKey) {
      existing = await ctx.db
        .query("lenders")
        .withIndex("by_company_contact", (q) =>
          q.eq("companyKey", c.companyKey).eq("contactKey", contactKey)
        )
        .first();
    }
    if (!existing) {
      // Fall back to any lender with the same companyKey
      existing = await ctx.db
        .query("lenders")
        .withIndex("by_company", (q) => q.eq("companyKey", c.companyKey))
        .first();
    }

    const baseNotes = c.notes
      ? c.sourceUrl
        ? `${c.notes}\n\nSource: ${c.sourceUrl}`
        : c.notes
      : c.sourceUrl
      ? `Source: ${c.sourceUrl}`
      : "";

    const doc = {
      source: `AI Discovery (${c.provider}) — "${c.query}"`,
      section: "Discovered Lender",
      company: c.company,
      contactName: c.contactName,
      titleRole: "",
      phone: c.phone,
      email: c.email,
      website: c.website,
      entityType: c.entityType || "Commercial Finance",
      primaryNiche: c.primaryNiche,
      programs: c.programs,
      propertyTypes: c.propertyTypes,
      exclusions: "",
      statesServed: c.statesServed,
      ownerOrInvestor: "",
      fundingAmountMin: c.fundingAmountMin,
      fundingAmountMax: c.fundingAmountMax,
      ltv: "",
      interestRates: "",
      amortTerm: "",
      referralFees: "",
      notes: baseNotes,
      status: "",
      lastUpdated: today,
      companyKey: c.companyKey,
      emailKey,
      contactKey,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    const incA = isLenderIncomplete({
      programs: doc.programs,
      programList: undefined,
      primaryNiche: doc.primaryNiche,
    });
    const evA = existing ? (existing.enrichedAt ?? 0) : 0;
    const withDerived = {
      ...doc,
      incompleteData: incA,
      enrichedAt: evA,
      searchText: buildLenderSearchBlob({
        ...doc,
        incompleteData: incA,
        enrichedAt: evA,
      } as Doc<"lenders">),
    };

    let lenderId: Id<"lenders">;
    if (existing) {
      const before = existing;
      await ctx.db.patch(existing._id, withDerived);
      const after = await ctx.db.get(existing._id);
      if (after) await applyLenderWrite(ctx, before, after);
      lenderId = existing._id;
    } else {
      lenderId = await ctx.db.insert("lenders", withDerived);
      const after = await ctx.db.get(lenderId);
      if (after) await applyLenderWrite(ctx, null, after);
    }
    await ctx.db.patch(id, {
      status: "accepted",
      duplicateOfLenderId: lenderId,
      updatedAt: now,
    });
    return { lenderId };
  },
});

export const acceptMany = mutation({
  args: { ids: v.array(v.id("lenderCandidates")) },
  handler: async (ctx, { ids }) => {
    let accepted = 0;
    const now = Date.now();
    const today = new Date(now).toISOString().slice(0, 10);
    for (const id of ids) {
      const c = await ctx.db.get(id);
      if (!c) continue;
      const emailKey = c.email.toLowerCase();
      const contactKey = normalizeKey(c.contactName);
      let existing: Doc<"lenders"> | null = null;
      if (emailKey) {
        existing = await ctx.db
          .query("lenders")
          .withIndex("by_company_email", (q) =>
            q.eq("companyKey", c.companyKey).eq("emailKey", emailKey)
          )
          .first();
      }
      if (!existing) {
        existing = await ctx.db
          .query("lenders")
          .withIndex("by_company", (q) => q.eq("companyKey", c.companyKey))
          .first();
      }
      const baseNotes = c.notes
        ? c.sourceUrl
          ? `${c.notes}\n\nSource: ${c.sourceUrl}`
          : c.notes
        : c.sourceUrl
        ? `Source: ${c.sourceUrl}`
        : "";
      const doc = {
        source: `AI Discovery (${c.provider}) — "${c.query}"`,
        section: "Discovered Lender",
        company: c.company,
        contactName: c.contactName,
        titleRole: "",
        phone: c.phone,
        email: c.email,
        website: c.website,
        entityType: c.entityType || "Commercial Finance",
        primaryNiche: c.primaryNiche,
        programs: c.programs,
        propertyTypes: c.propertyTypes,
        exclusions: "",
        statesServed: c.statesServed,
        ownerOrInvestor: "",
        fundingAmountMin: c.fundingAmountMin,
        fundingAmountMax: c.fundingAmountMax,
        ltv: "",
        interestRates: "",
        amortTerm: "",
        referralFees: "",
        notes: baseNotes,
        status: "",
        lastUpdated: today,
        companyKey: c.companyKey,
        emailKey,
        contactKey,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      };
      const inc = isLenderIncomplete({
        programs: doc.programs,
        programList: undefined,
        primaryNiche: doc.primaryNiche,
      });
      const ev = existing ? (existing.enrichedAt ?? 0) : 0;
      const withDerived = {
        ...doc,
        incompleteData: inc,
        enrichedAt: ev,
        searchText: buildLenderSearchBlob({
          ...doc,
          incompleteData: inc,
          enrichedAt: ev,
        } as Doc<"lenders">),
      };
      let lenderId: Id<"lenders">;
      if (existing) {
        const before = existing;
        await ctx.db.patch(existing._id, withDerived);
        const after = await ctx.db.get(existing._id);
        if (after) await applyLenderWrite(ctx, before, after);
        lenderId = existing._id;
      } else {
        lenderId = await ctx.db.insert("lenders", withDerived);
        const after = await ctx.db.get(lenderId);
        if (after) await applyLenderWrite(ctx, null, after);
      }
      await ctx.db.patch(id, {
        status: "accepted",
        duplicateOfLenderId: lenderId,
        updatedAt: now,
      });
      accepted += 1;
    }
    return { accepted };
  },
});
