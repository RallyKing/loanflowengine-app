import {
  paginationOptsValidator,
  type PaginationOptions,
  type PaginationResult,
} from "convex/server";
import {
  internalQuery,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import {
  applyLenderWrite,
  formatStatsFromRows,
  getLenderStatsSingleton,
  isLenderIncomplete,
  listIncompleteCore,
} from "./lenderWriteStats";
import { appendLenderFeed } from "./activityFeed";
import {
  normalizePhone,
  normalizeEmail,
  normalizeWebsite,
  normalizeWhitespace,
  normalizeStates,
} from "./_normalize";
import {
  borrowerFicoClearedLender,
  dealFitsLender,
  lenderMaxAtLeast,
  lenderMinAtMost,
  rowMatchesOwnerInvestor,
  rowMatchesProgramKeywords,
  rowMatchesPropertyType,
  stateMatchesLender,
} from "./filterHelpers";
import {
  buildLenderSearchBlob,
  lenderFundingMaxRaw,
  lenderFundingMinRaw,
} from "./lenderSearchText";
import {
  deleteAllForLender,
  deleteAllLenderAttachments,
  reassignToLender,
} from "./lenderFiles";
import {
  purgeLenderRelationsBeforeDelete,
  repointMergedLenderId,
} from "./graphCleanup";
import { assertOrgScopeArgs, resolveMemberUserKey } from "./organizationAccess";
import { callerHasUnrestrictedOrgDataAccess } from "./viewerOrgAccess";
import { assertOrgPermission } from "./organizationRbac";

async function assertLenderMutationAuth(
  ctx: MutationCtx | QueryCtx,
  organizationId: Id<"organizations">,
  memberUserKey: string | undefined,
  permission: "lenders.edit" | "lenders.manage" = "lenders.edit",
): Promise<void> {
  await assertOrgScopeArgs(ctx, organizationId, memberUserKey);
  const key = await resolveMemberUserKey(ctx, memberUserKey);
  await assertOrgPermission(ctx, organizationId, key, permission);
}

async function assertCanTouchLender(
  ctx: MutationCtx,
  row: Doc<"lenders">,
  organizationId: Id<"organizations">,
  memberUserKey: string | undefined,
  permission: "lenders.edit" | "lenders.manage" = "lenders.edit",
): Promise<void> {
  await assertLenderMutationAuth(ctx, organizationId, memberUserKey, permission);
  const god = await callerHasUnrestrictedOrgDataAccess(ctx, memberUserKey);
  if (!god && row.organizationId && row.organizationId !== organizationId) {
    throw new Error("Lender belongs to a different organization.");
  }
}

function lenderVisibleInOrg(
  row: Doc<"lenders">,
  organizationId: Id<"organizations">,
): boolean {
  return row.organizationId == null || row.organizationId === organizationId;
}

async function takeVisibleLendersOrdered(
  organizationId: Id<"organizations">,
  cap: number,
  includeAllOrganizations: boolean,
  fetchBatch: (take: number) => Promise<Doc<"lenders">[]>,
): Promise<Doc<"lenders">[]> {
  const out: Doc<"lenders">[] = [];
  let takeN = Math.min(Math.max(cap * 3, 48), 50_000);
  for (let round = 0; round < 40 && out.length < cap; round++) {
    const batch = await fetchBatch(takeN);
    for (const r of batch) {
      if (!includeAllOrganizations && !lenderVisibleInOrg(r, organizationId)) {
        continue;
      }
      out.push(r);
      if (out.length >= cap) break;
    }
    if (batch.length < takeN) break;
    takeN = Math.min(takeN * 2, 50_000);
  }
  return out.slice(0, cap);
}

async function paginateWithOrgVisibility(
  organizationId: Id<"organizations">,
  includeAllOrganizations: boolean,
  runPaginate: (
    opts: PaginationOptions,
  ) => Promise<PaginationResult<Doc<"lenders">>>,
  paginationOpts: PaginationOptions,
): Promise<PaginationResult<Doc<"lenders">>> {
  const res = await runPaginate(paginationOpts);
  return {
    ...res,
    page: includeAllOrganizations
      ? res.page
      : res.page.filter((r) => lenderVisibleInOrg(r, organizationId)),
  };
}

// ---------- Shared ----------
const programItem = v.object({
  name: v.string(),
  minFico: v.optional(v.string()),
  requirements: v.optional(v.string()),
});

const contactItem = v.object({
  name: v.string(),
  titleRole: v.optional(v.string()),
  phone: v.optional(v.string()),
  email: v.optional(v.string()),
  notes: v.optional(v.string()),
});

const phoneItem = v.object({
  label: v.optional(v.string()),
  phone: v.string(),
});

const lenderInput = {
  source: v.optional(v.string()),
  section: v.optional(v.string()),
  company: v.string(),
  contactName: v.optional(v.string()),
  titleRole: v.optional(v.string()),
  phone: v.optional(v.string()),
  email: v.optional(v.string()),
  website: v.optional(v.string()),
  entityType: v.optional(v.string()),
  primaryNiche: v.optional(v.string()),
  programs: v.optional(v.string()),
  programList: v.optional(v.array(programItem)),
  contacts: v.optional(v.array(contactItem)),
  phoneNumbers: v.optional(v.array(phoneItem)),
  rating: v.optional(v.number()),
  ratingNotes: v.optional(v.string()),
  propertyTypes: v.optional(v.string()),
  exclusions: v.optional(v.string()),
  statesServed: v.optional(v.string()),
  ownerOrInvestor: v.optional(v.string()),
  fundingAmountMin: v.optional(v.string()),
  fundingAmountMax: v.optional(v.string()),
  minFico: v.optional(v.string()),
  ltv: v.optional(v.string()),
  interestRates: v.optional(v.string()),
  amortTerm: v.optional(v.string()),
  referralFees: v.optional(v.string()),
  notes: v.optional(v.string()),
  status: v.optional(v.string()),
  lastUpdated: v.optional(v.string()),
};

type ProgramInput = {
  name?: string;
  minFico?: string;
  requirements?: string;
};

type ContactInput = {
  name?: string;
  titleRole?: string;
  phone?: string;
  email?: string;
  notes?: string;
};

type PhoneInput = {
  label?: string;
  phone?: string;
};

function cleanProgramList(raw: unknown): Array<{
  name: string;
  minFico: string;
  requirements: string;
}> | undefined {
  if (!Array.isArray(raw)) return undefined;
  const cleaned = (raw as ProgramInput[])
    .map((p) => ({
      name: String(p?.name ?? "").trim(),
      minFico: String(p?.minFico ?? "").trim(),
      requirements: String(p?.requirements ?? "").trim(),
    }))
    .filter((p) => p.name || p.minFico || p.requirements);
  return cleaned.length ? cleaned : undefined;
}

function cleanContactList(raw: unknown): Array<{
  name: string;
  titleRole: string;
  phone: string;
  email: string;
  notes: string;
}> | undefined {
  if (!Array.isArray(raw)) return undefined;
  const cleaned = (raw as ContactInput[])
    .map((c) => ({
      name: normalizeWhitespace(c?.name ?? ""),
      titleRole: normalizeWhitespace(c?.titleRole ?? ""),
      phone: normalizePhone(c?.phone ?? ""),
      email: normalizeEmail(c?.email ?? ""),
      notes: (c?.notes ?? "").trim(),
    }))
    .filter((c) => c.name || c.phone || c.email || c.notes);
  return cleaned.length ? cleaned : undefined;
}

function cleanPhoneList(raw: unknown): Array<{
  label: string;
  phone: string;
}> | undefined {
  if (!Array.isArray(raw)) return undefined;
  const cleaned = (raw as PhoneInput[])
    .map((p) => ({
      label: normalizeWhitespace(p?.label ?? ""),
      phone: normalizePhone(p?.phone ?? ""),
    }))
    .filter((p) => p.phone);
  // Deduplicate on digits so users can't have two entries for the same line.
  const seen = new Set<string>();
  const uniq: Array<{ label: string; phone: string }> = [];
  for (const p of cleaned) {
    const digits = p.phone.replace(/\D+/g, "");
    if (seen.has(digits)) continue;
    seen.add(digits);
    uniq.push(p);
  }
  return uniq.length ? uniq : undefined;
}

function clampRating(raw: unknown): number | undefined {
  if (raw === undefined || raw === null || raw === "") return undefined;
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n)) return undefined;
  return Math.max(0, Math.min(5, Math.round(n)));
}

function normalizeKey(s: string | undefined | null) {
  return (s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function classifyEntity(company: string, niche: string, notes: string): string {
  const combined = `${company} | ${niche} | ${notes}`.toLowerCase();
  const rules: Array<[string, RegExp[]]> = [
    ["Law Firm", [/\bllp\b/, /\blaw\b/, /\bp\.?c\.?\b/, /attorney/, /counsel/]],
    ["Bank / Commercial Lender", [/\bbank\b/, /bancorp/, /savings/, /trust co/, /jpmorgan/, /citizens/]],
    ["Credit Union", [/credit union/, /federal credit union/, /\bccu\b/]],
    ["SBA / USDA Lender", [/\bsba\b/, /\busda\b/, /7\(a\)/, /504/]],
    ["Factoring / A/R", [/factor/, /a\/?r /, /accounts receivable/, /invoice/]],
    ["Hard Money / Bridge Lender", [/hard money/, /bridge/]],
    ["Church Lender", [/\bchurch\b/, /\bchristian\b/]],
    ["Multifamily / Agency Lender", [/multifamily/, /apartment/, /fannie/, /freddie/, /fha/, /hud/]],
    ["Franchise Finance", [/franchise/]],
    ["Equipment / Leasing", [/equipment/, /leasing/]],
    ["Farm / Agricultural Lender", [/farm/, /agricultural/, /land loan/]],
    ["Merchant / MCA / CC Financing", [/merchant/, /cc receivable/]],
    ["Securities / IRA Lender", [/securities/, /\bira\b/, /401k/]],
    ["Life Company Lender", [/life company/, /life insurance/]],
    ["CMBS / Conduit", [/conduit/, /cmbs/, /wall street/]],
    ["Private / Hedge Fund", [/hedge fund/, /private fund/, /private money/]],
    ["Auction / Asset Disposition", [/auction/, /tranzon/, /hilco/, /tiger capital/]],
    ["Restructuring / Turnaround", [/restructur/, /turnaround/, /workout/, /bankruptcy/, /\bctp\b/]],
    ["Consulting / Advisory", [/consulting/, /advisory/, /consultants/]],
    ["Broker / Correspondent", [/broker/, /net branch/]],
  ];
  const hits: string[] = [];
  for (const [label, patterns] of rules) {
    if (patterns.some((re) => re.test(combined))) hits.push(label);
  }
  return hits.length === 0 ? "Commercial Finance" : hits.slice(0, 3).join("; ");
}

function buildDoc(args: Record<string, unknown>, now: number) {
  const s = (k: string) => (typeof args[k] === "string" ? (args[k] as string) : "");
  const company = normalizeWhitespace(s("company"));
  const email = normalizeEmail(s("email"));
  const contactName = normalizeWhitespace(s("contactName"));
  const niche = normalizeWhitespace(s("primaryNiche"));
  const notes = s("notes").trim(); // preserve line breaks in notes
  let entityType = normalizeWhitespace(s("entityType"));
  if (!entityType) entityType = classifyEntity(company, niche, notes);

  const programList = cleanProgramList(args.programList);
  const contacts = cleanContactList(args.contacts);
  const phoneNumbers = cleanPhoneList(args.phoneNumbers);
  const rating = clampRating(args.rating);
  const ratingNotes = (s("ratingNotes") || "").trim();
  const phone = normalizePhone(s("phone"));
  const website = normalizeWebsite(s("website"));
  const statesServed = normalizeStates(s("statesServed"));

  const today = new Date(now).toISOString().slice(0, 10);
  const base = {
    source: normalizeWhitespace(s("source")) || "Manual Entry",
    section: normalizeWhitespace(s("section")) || "Manual Addition",
    company,
    contactName,
    titleRole: normalizeWhitespace(s("titleRole")),
    phone,
    email,
    website,
    entityType,
    primaryNiche: niche,
    programs: s("programs").trim(),
    propertyTypes: normalizeWhitespace(s("propertyTypes")),
    exclusions: s("exclusions").trim(),
    statesServed,
    ownerOrInvestor: normalizeWhitespace(s("ownerOrInvestor")),
    fundingAmountMin: normalizeWhitespace(s("fundingAmountMin")),
    fundingAmountMax: normalizeWhitespace(s("fundingAmountMax")),
    minFico: normalizeWhitespace(s("minFico")),
    ltv: normalizeWhitespace(s("ltv")),
    interestRates: normalizeWhitespace(s("interestRates")),
    amortTerm: normalizeWhitespace(s("amortTerm")),
    referralFees: normalizeWhitespace(s("referralFees")),
    notes,
    status: normalizeWhitespace(s("status")),
    lastUpdated: normalizeWhitespace(s("lastUpdated")) || today,
    companyKey: normalizeKey(company),
    emailKey: email.toLowerCase(),
    contactKey: normalizeKey(contactName),
    createdAt: now,
    updatedAt: now,
  };
  const extras: Record<string, unknown> = {};
  if (programList) extras.programList = programList;
  if (contacts) extras.contacts = contacts;
  if (phoneNumbers) extras.phoneNumbers = phoneNumbers;
  if (rating !== undefined) extras.rating = rating;
  if (ratingNotes) extras.ratingNotes = ratingNotes;
  const programsStr = base.programs;
  const programListForIncomplete = (extras.programList ?? programList) as
    | Doc<"lenders">["programList"]
    | undefined;
  const merged = {
    ...base,
    ...extras,
    incompleteData: isLenderIncomplete({
      programs: programsStr,
      programList: programListForIncomplete,
      primaryNiche: base.primaryNiche,
    }),
    enrichedAt: 0,
  };
  return {
    ...merged,
    searchText: buildLenderSearchBlob(merged as Doc<"lenders">),
  };
}

function isBlank(s: string | undefined): boolean {
  return !s || !String(s).trim();
}

function strPick(keep: string, remove: string): string {
  if (isBlank(keep)) return (remove ?? "").trim();
  return (keep ?? "").trim();
}

function strCombineDistinct(keep: string, remove: string, between: string): string {
  const a = (keep ?? "").trim();
  const b = (remove ?? "").trim();
  if (!b) return a;
  if (!a) return b;
  if (a === b) return a;
  return a + between + b;
}

function ficoToNum(s: string | undefined): number | null {
  if (!s?.trim()) return null;
  const n = parseInt(s.replace(/\D/g, ""), 10);
  return Number.isFinite(n) && n >= 300 && n <= 900 ? n : null;
}

/** If both are numeric, keep the stricter (higher) minimum FICO. */
function mergeMinFico(ka: string | undefined, kb: string | undefined): string {
  const a = (ka ?? "").trim();
  const b = (kb ?? "").trim();
  if (!a) return b;
  if (!b) return a;
  const na = ficoToNum(a);
  const nb = ficoToNum(b);
  if (na != null && nb != null) return String(Math.max(na, nb));
  return a.length >= b.length ? a : b;
}

function mergeProgramLists(
  a: Doc<"lenders">["programList"],
  b: Doc<"lenders">["programList"]
): Doc<"lenders">["programList"] {
  const map = new Map<
    string,
    { name: string; minFico: string; requirements: string }
  >();
  for (const p of [...(a ?? []), ...(b ?? [])]) {
    if (!p?.name?.trim()) continue;
    const k = p.name.toLowerCase().trim();
    const minF = (p.minFico ?? "").trim();
    const req = (p.requirements ?? "").trim();
    const ex = map.get(k);
    if (!ex) {
      map.set(k, { name: p.name.trim(), minFico: minF, requirements: req });
    } else {
      const nextMin = mergeMinFico(ex.minFico, minF) || ex.minFico || minF;
      const nextReq = strCombineDistinct(
        ex.requirements,
        req,
        ex.requirements && req ? "\n" : ""
      );
      map.set(k, { name: ex.name, minFico: nextMin, requirements: nextReq });
    }
  }
  const out = [...map.values()].map((p) => ({
    name: p.name,
    ...(p.minFico ? { minFico: p.minFico } : {}),
    ...(p.requirements ? { requirements: p.requirements } : {}),
  }));
  return out.length ? (out as Doc<"lenders">["programList"]) : undefined;
}

type ContactRow = {
  name: string;
  titleRole: string;
  phone: string;
  email: string;
  notes: string;
};

function contactDedupeKey(c: {
  name: string;
  phone: string;
  email: string;
}): string {
  return [
    normalizeKey(c.name),
    (c.email ?? "").toLowerCase().trim(),
    c.phone.replace(/\D/g, ""),
  ].join("\u0000");
}

function mergeContactsAndPhones(
  keep: Doc<"lenders">,
  remove: Doc<"lenders">
): { contacts: Doc<"lenders">["contacts"]; phoneNumbers: Doc<"lenders">["phoneNumbers"] } {
  const fromRows: ContactRow[] = [
    ...(keep.contacts?.map((c) => ({
      name: c.name,
      titleRole: c.titleRole ?? "",
      phone: c.phone ?? "",
      email: c.email ?? "",
      notes: c.notes ?? "",
    })) ?? []),
    ...(remove.contacts?.map((c) => ({
      name: c.name,
      titleRole: c.titleRole ?? "",
      phone: c.phone ?? "",
      email: c.email ?? "",
      notes: c.notes ?? "",
    })) ?? []),
  ];
  // If the other record’s primary contact differs, preserve it in the list.
  const rName = (remove.contactName ?? "").trim();
  const rPhone = normalizePhone(remove.phone ?? "");
  const rEmail = normalizeEmail(remove.email ?? "");
  const rTitle = (remove.titleRole ?? "").trim();
  const rKey = contactDedupeKey({
    name: rName || " ",
    phone: rPhone,
    email: rEmail,
  });
  const kKey = contactDedupeKey({
    name: (keep.contactName ?? "").trim() || " ",
    phone: normalizePhone(keep.phone ?? ""),
    email: normalizeEmail(keep.email ?? ""),
  });
  if ((rName || rPhone || rEmail) && rKey !== kKey) {
    fromRows.push({
      name: rName || "Contact (merged)",
      titleRole: rTitle,
      phone: rPhone,
      email: rEmail,
      notes: "",
    });
  }

  const seenC = new Set<string>();
  const contactRows: ContactRow[] = [];
  for (const c of fromRows) {
    const k = contactDedupeKey(c);
    if (seenC.has(k)) continue;
    if (!c.name && !c.phone && !c.email) continue;
    seenC.add(k);
    contactRows.push(c);
  }
  const contacts = cleanContactList(
    contactRows
  ) as Doc<"lenders">["contacts"] | undefined;

  const phoneNumbers = cleanPhoneList([
    ...(keep.phoneNumbers ?? []),
    ...(remove.phoneNumbers ?? []),
  ]) as Doc<"lenders">["phoneNumbers"] | undefined;

  return { contacts, phoneNumbers };
}

/**
 * Combine two lenders into `keep` (filling empty fields, concatenating
 * notes, unioning structured lists). Caller deletes `remove` and runs stats.
 */
function buildMergedLenderRow(
  keep: Doc<"lenders">,
  remove: Doc<"lenders">,
  now: number
): Record<string, unknown> {
  const company = strPick(keep.company, remove.company);
  const contactName = strPick(keep.contactName, remove.contactName);
  const titleRole = strPick(keep.titleRole, remove.titleRole);
  const phone = strPick(keep.phone, remove.phone) || "";
  const email = normalizeEmail(strPick(keep.email, remove.email) || "");
  const website = strPick(keep.website, remove.website) || "";
  const primaryNiche = strPick(keep.primaryNiche, remove.primaryNiche) || "";
  const programs = strCombineDistinct(keep.programs, remove.programs, "\n\n");
  const propertyTypes = strPick(keep.propertyTypes, remove.propertyTypes) || "";
  const exclusions = strPick(keep.exclusions, remove.exclusions) || "";
  const statesServed = strPick(keep.statesServed, remove.statesServed) || "";
  const ownerOrInvestor =
    strPick(keep.ownerOrInvestor, remove.ownerOrInvestor) || "";
  const fundingAmountMin =
    strPick(
      lenderFundingMinRaw(keep) ?? "",
      lenderFundingMinRaw(remove) ?? "",
    ) || "";
  const fundingAmountMax =
    strPick(
      lenderFundingMaxRaw(keep) ?? "",
      lenderFundingMaxRaw(remove) ?? "",
    ) || "";
  const minFico = mergeMinFico(keep.minFico, remove.minFico);
  const ltv = strPick(keep.ltv, remove.ltv) || "";
  const interestRates = strPick(keep.interestRates, remove.interestRates) || "";
  const amortTerm = strPick(keep.amortTerm, remove.amortTerm) || "";
  const referralFees = strPick(keep.referralFees, remove.referralFees) || "";
  const notes = strCombineDistinct(
    keep.notes,
    remove.notes,
    "\n\n— Merged from duplicate record —\n\n"
  );
  let entityType = strPick(keep.entityType, remove.entityType) || "";
  if (!entityType.trim()) {
    entityType = classifyEntity(company, primaryNiche, notes);
  }
  const status = strPick(keep.status, remove.status) || "";
  const lastUpdated = new Date(now).toISOString().slice(0, 10);
  const source = strPick(keep.source, remove.source) || "Manual Entry";
  const section = strPick(keep.section, remove.section) || "Manual Addition";
  const ratingA = keep.rating ?? 0;
  const ratingB = remove.rating ?? 0;
  const ratingNotes = strCombineDistinct(
    keep.ratingNotes ?? "",
    remove.ratingNotes ?? "",
    "\n"
  );
  const enrichedAt = Math.max(keep.enrichedAt ?? 0, remove.enrichedAt ?? 0);
  const enrichmentStatus = strPick(
    keep.enrichmentStatus ?? "",
    remove.enrichmentStatus ?? ""
  ) || undefined;
  const { contacts, phoneNumbers } = mergeContactsAndPhones(keep, remove);
  const enrSrc = [
    ...(keep.enrichmentSources ?? []),
    ...(remove.enrichmentSources ?? []),
  ];
  const dedupedSources = Array.from(
    new Set(enrSrc.filter((s) => s && s.trim().length > 0))
  );
  const programList = mergeProgramLists(keep.programList, remove.programList);
  const programListForIncomplete: NonNullable<Doc<"lenders">["programList"]> =
    programList && programList.length > 0 ? programList : [];

  const combinedRating = Math.max(0, ratingA, ratingB);
  /** Always 0–5; 0 = not rated. Omitting the field in patch would leave a stale score. */
  const ratingOut = Math.max(0, Math.min(5, Math.round(combinedRating)));

  const base = {
    source,
    section,
    company,
    contactName,
    titleRole,
    phone: normalizePhone(phone),
    email: normalizeEmail(email),
    website: normalizeWebsite(website),
    entityType,
    primaryNiche: primaryNiche,
    programs: programs.trim(),
    propertyTypes,
    exclusions: exclusions || "",
    statesServed: normalizeStates(statesServed),
    ownerOrInvestor,
    fundingAmountMin: normalizeWhitespace(fundingAmountMin),
    fundingAmountMax: normalizeWhitespace(fundingAmountMax),
    minFico: normalizeWhitespace(minFico) || undefined,
    ltv: normalizeWhitespace(ltv),
    interestRates: normalizeWhitespace(interestRates),
    amortTerm: normalizeWhitespace(amortTerm),
    referralFees: normalizeWhitespace(referralFees),
    notes: notes || "",
    status: normalizeWhitespace(status) || "",
    lastUpdated: normalizeWhitespace(lastUpdated) || lastUpdated,
    companyKey: normalizeKey(company),
    emailKey: (normalizeEmail(email) || "").toLowerCase(),
    contactKey: normalizeKey(contactName),
    programList: programListForIncomplete,
    contacts: contacts ?? [],
    phoneNumbers: phoneNumbers ?? [],
    rating: ratingOut,
    ratingNotes: (ratingNotes || "").trim() || undefined,
    enrichedAt: enrichedAt > 0 ? enrichedAt : 0,
    enrichmentStatus: enrichmentStatus?.trim() || undefined,
    enrichmentSources: dedupedSources,
  };

  const withIncomplete: Record<string, unknown> = {
    ...base,
    incompleteData: isLenderIncomplete({
      programs: base.programs,
      programList: programListForIncomplete,
      primaryNiche: base.primaryNiche as string,
    }),
  };

  const forBlob = { ...keep, ...withIncomplete } as Doc<"lenders">;
  return {
    ...withIncomplete,
    searchText: buildLenderSearchBlob(forBlob),
    updatedAt: now,
    createdAt: Math.min(keep.createdAt, remove.createdAt),
  };
}

// ---------- Queries ----------

/**
 * Every non-empty search token must appear somewhere in the blob (all match).
 * Tokens = split on whitespace/commas (e.g. "dscr, florida" → dscr, florida).
 * Text fields are defined in `buildLenderSearchBlob` (shared with scenario).
 */
function rowMatchesLenderSearch(l: Doc<"lenders">, tokens: string[]): boolean {
  if (tokens.length === 0) return true;
  const blob = buildLenderSearchBlob(l);
  return tokens.every((t) => blob.includes(t));
}

function tokenizeFilter(s: string | undefined): string[] {
  if (!s || !s.trim()) return [];
  return s
    .trim()
    .toLowerCase()
    .split(/[\s,]+/g)
    .map((t) => t.replace(/^['"]|['"]$/g, ""))
    .filter((t) => t.length > 0);
}

type ListFilterBundle = {
  searchTokens: string[] | null;
  entityType: string | undefined;
  section: string | undefined;
  matchDealAmount: number | undefined;
  programTokens: string[];
  stateCode: string | undefined;
  minRating: number | undefined;
  ficoCleared: number | undefined;
  propertyTypeContains: string | undefined;
  ownerOrInvestor: string | undefined;
  lenderMaxAtLeast: number | undefined;
  lenderMinAtMost: number | undefined;
};

function rowMatchesAllFilters(
  l: Doc<"lenders">,
  f: ListFilterBundle
): boolean {
  if (f.searchTokens && f.searchTokens.length) {
    if (!rowMatchesLenderSearch(l, f.searchTokens)) return false;
  }
  if (f.entityType && l.entityType !== f.entityType) return false;
  if (f.section && l.section !== f.section) return false;
  if (f.matchDealAmount != null && f.matchDealAmount > 0) {
    if (!dealFitsLender(l, f.matchDealAmount)) return false;
  }
  if (f.programTokens.length) {
    if (!rowMatchesProgramKeywords(l, f.programTokens)) return false;
  }
  if (f.stateCode) {
    if (!stateMatchesLender(l, f.stateCode)) return false;
  }
  if (f.minRating != null && f.minRating > 0) {
    if ((l.rating ?? 0) < f.minRating) return false;
  }
  if (f.ficoCleared != null && f.ficoCleared > 0) {
    if (!borrowerFicoClearedLender(l, f.ficoCleared)) return false;
  }
  if (f.propertyTypeContains) {
    if (!rowMatchesPropertyType(l, f.propertyTypeContains)) return false;
  }
  if (f.ownerOrInvestor) {
    if (!rowMatchesOwnerInvestor(l, f.ownerOrInvestor)) return false;
  }
  if (f.lenderMaxAtLeast != null && f.lenderMaxAtLeast > 0) {
    if (!lenderMaxAtLeast(l, f.lenderMaxAtLeast)) return false;
  }
  if (f.lenderMinAtMost != null && f.lenderMinAtMost > 0) {
    if (!lenderMinAtMost(l, f.lenderMinAtMost)) return false;
  }
  return true;
}

function needsFullScan(f: ListFilterBundle): boolean {
  if (f.searchTokens && f.searchTokens.length) return true;
  if (f.matchDealAmount != null) return true;
  if (f.programTokens.length) return true;
  if (f.stateCode) return true;
  if (f.minRating != null && f.minRating > 0) return true;
  if (f.ficoCleared != null && f.ficoCleared > 0) return true;
  if (f.propertyTypeContains) return true;
  if (f.ownerOrInvestor) return true;
  if (f.lenderMaxAtLeast != null && f.lenderMaxAtLeast > 0) return true;
  if (f.lenderMinAtMost != null && f.lenderMinAtMost > 0) return true;
  /* No index for section alone — need a full pass to filter. */
  if (f.section && !f.entityType) return true;
  return false;
}

const listFilterFieldArgs = {
  organizationId: v.id("organizations"),
  memberUserKey: v.optional(v.string()),
  search: v.optional(v.string()),
  entityType: v.optional(v.string()),
  section: v.optional(v.string()),
  limit: v.optional(v.number()),
  matchDealAmount: v.optional(v.number()),
  programKeywords: v.optional(v.string()),
  stateCode: v.optional(v.string()),
  minRating: v.optional(v.number()),
  ficoCleared: v.optional(v.number()),
  propertyTypeContains: v.optional(v.string()),
  ownerOrInvestor: v.optional(v.string()),
  lenderMaxAtLeast: v.optional(v.number()),
  lenderMinAtMost: v.optional(v.number()),
};

function listArgsToFilterBundle(args: {
  search?: string;
  entityType?: string;
  section?: string;
  matchDealAmount?: number;
  programKeywords?: string;
  stateCode?: string;
  minRating?: number;
  ficoCleared?: number;
  propertyTypeContains?: string;
  ownerOrInvestor?: string;
  lenderMaxAtLeast?: number;
  lenderMinAtMost?: number;
}): ListFilterBundle {
  const {
    search,
    entityType,
    section,
    matchDealAmount,
    programKeywords,
    stateCode,
    minRating,
    ficoCleared,
    propertyTypeContains,
    ownerOrInvestor: ownerOrInvestorFilter,
    lenderMaxAtLeast,
    lenderMinAtMost,
  } = args;
  const searchTokens = (() => {
    if (!search || !search.trim()) return null;
    return tokenizeFilter(search);
  })();
  const programTokens = tokenizeFilter(programKeywords);
  return {
    searchTokens: searchTokens?.length ? searchTokens : null,
    entityType: entityType || undefined,
    section: section || undefined,
    matchDealAmount:
      matchDealAmount != null && matchDealAmount > 0
        ? matchDealAmount
        : undefined,
    programTokens,
    stateCode: stateCode?.trim() || undefined,
    minRating: minRating != null && minRating > 0 ? minRating : undefined,
    ficoCleared:
      ficoCleared != null && ficoCleared > 0 ? ficoCleared : undefined,
    propertyTypeContains: propertyTypeContains?.trim() || undefined,
    ownerOrInvestor: ownerOrInvestorFilter?.trim() || undefined,
    lenderMaxAtLeast:
      lenderMaxAtLeast != null && lenderMaxAtLeast > 0
        ? lenderMaxAtLeast
        : undefined,
    lenderMinAtMost:
      lenderMinAtMost != null && lenderMinAtMost > 0
        ? lenderMinAtMost
        : undefined,
  };
}

export const list = query({
  args: listFilterFieldArgs,
  handler: async (ctx, args) => {
    const { organizationId, memberUserKey, limit } = args;
    await assertOrgScopeArgs(ctx, organizationId, memberUserKey);
    const god = await callerHasUnrestrictedOrgDataAccess(ctx, memberUserKey);
    /** Default / max batch for browse (Convex payload limits — keep in sync with LenderTable + export). */
    const cap = Math.min(limit ?? 10_000, 10_000);
    const f = listArgsToFilterBundle(args);

    if (needsFullScan(f)) {
      let rows = await ctx.db.query("lenders").order("desc").collect();
      rows = rows.filter((r) => {
        if (!god && !lenderVisibleInOrg(r, organizationId)) return false;
        try {
          return rowMatchesAllFilters(r, f);
        } catch (e) {
          // Bad legacy rows (e.g. programList not an array) must not nuke the whole list query.
          console.error(
            `[lenders.list] filter skip row ${r._id}:`,
            e instanceof Error ? e.message : e
          );
          return true;
        }
      });
      return rows.slice(0, cap);
    }

    let rows: Doc<"lenders">[];
    if (f.entityType && f.section) {
      rows = await takeVisibleLendersOrdered(organizationId, cap, god, (take) =>
        ctx.db
          .query("lenders")
          .withIndex("by_entity_section", (q) =>
            q.eq("entityType", f.entityType as string).eq("section", f.section as string)
          )
          .order("desc")
          .take(take)
      );
    } else if (f.entityType) {
      rows = await takeVisibleLendersOrdered(organizationId, cap, god, (take) =>
        ctx.db
          .query("lenders")
          .withIndex("by_entityType", (qi) =>
            qi.eq("entityType", f.entityType as string)
          )
          .take(take)
      );
    } else {
      rows = await takeVisibleLendersOrdered(organizationId, cap, god, (take) =>
        ctx.db.query("lenders").order("desc").take(take)
      );
    }
    rows = rows.filter((r) => {
      try {
        return rowMatchesAllFilters(r, f);
      } catch (e) {
        console.error(
          `[lenders.list] filter skip row ${r._id}:`,
          e instanceof Error ? e.message : e
        );
        return true;
      }
    });
    return rows.slice(0, cap);
  },
});

/**
 * Indexed browse path only (same filters as `list` when a full table scan is not
 * required). Drives `usePaginatedQuery` in the browser for faster first paint
 * and smaller per-update payloads. Use `lenders.list` for heavy filters.
 */
export const listBrowsePaginated = query({
  args: {
    ...listFilterFieldArgs,
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    const { paginationOpts, organizationId, memberUserKey, limit: _l, ...listArgs } = args;
    await assertOrgScopeArgs(ctx, organizationId, memberUserKey);
    const god = await callerHasUnrestrictedOrgDataAccess(ctx, memberUserKey);
    const f = listArgsToFilterBundle(listArgs);
    if (needsFullScan(f)) {
      throw new Error(
        "lenders.listBrowsePaginated: these filters need lenders.list (full scan)."
      );
    }
    if (f.entityType && f.section) {
      return await paginateWithOrgVisibility(
        organizationId,
        god,
        (opts) =>
          ctx.db
            .query("lenders")
            .withIndex("by_entity_section", (q) =>
              q.eq("entityType", f.entityType as string).eq("section", f.section as string)
            )
            .order("desc")
            .paginate(opts),
        paginationOpts,
      );
    }
    if (f.entityType) {
      return await paginateWithOrgVisibility(
        organizationId,
        god,
        (opts) =>
          ctx.db
            .query("lenders")
            .withIndex("by_entityType", (q) =>
              q.eq("entityType", f.entityType as string)
            )
            .order("desc")
            .paginate(opts),
        paginationOpts,
      );
    }
    return await paginateWithOrgVisibility(
      organizationId,
      god,
      (opts) => ctx.db.query("lenders").order("desc").paginate(opts),
      paginationOpts,
    );
  },
});

export const get = query({
  args: {
    id: v.id("lenders"),
    organizationId: v.id("organizations"),
    memberUserKey: v.optional(v.string()),
  },
  handler: async (ctx, { id, organizationId, memberUserKey }) => {
    await assertOrgScopeArgs(ctx, organizationId, memberUserKey);
    const row = await ctx.db.get(id);
    if (!row) return null;
    const god = await callerHasUnrestrictedOrgDataAccess(ctx, memberUserKey);
    if (!god && !lenderVisibleInOrg(row, organizationId)) return null;
    return row;
  },
});

export const stats = query({
  args: {
    organizationId: v.id("organizations"),
    memberUserKey: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await assertOrgScopeArgs(ctx, args.organizationId, args.memberUserKey);
    const god = await callerHasUnrestrictedOrgDataAccess(ctx, args.memberUserKey);
    const rows = (await ctx.db.query("lenders").collect()).filter((r) =>
      god || lenderVisibleInOrg(r, args.organizationId),
    );
    return formatStatsFromRows(rows);
  },
});

/**
 * Find lenders that are missing key info (programs, primaryNiche, or
 * programList). Used by the bulk enrichment action.
 */
export const listIncomplete = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit }) => listIncompleteCore(ctx, limit),
});

/**
 * Used by `enrich` actions — same as `listIncomplete` without public exposure.
 */
export const _listIncompleteInternal = internalQuery({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit }) => listIncompleteCore(ctx, limit),
});

// ---------- Mutations ----------

/** Org-scoped lender row for the removable demo workspace (not the global catalog). */
export async function insertDemoWorkspaceLender(
  ctx: MutationCtx,
  args: {
    organizationId: Id<"organizations">;
    memberUserKey: string;
    demoBundleId: string;
    fields: Record<string, unknown>;
  },
): Promise<Id<"lenders">> {
  await assertOrgScopeArgs(ctx, args.organizationId, args.memberUserKey);
  const now = Date.now();
  const base = buildDoc(args.fields, now);
  const doc = {
    ...base,
    organizationId: args.organizationId,
    demoBundleId: args.demoBundleId,
  };
  const id = await ctx.db.insert("lenders", doc);
  const inserted = await ctx.db.get(id);
  if (inserted) {
    await applyLenderWrite(ctx, null, inserted);
    await appendLenderFeed(
      ctx,
      inserted,
      "lender_created",
      `Added lender “${inserted.company.trim() || "Lender"}”`,
    );
  }
  return id;
}

/**
 * Idempotent upsert by (companyKey, emailKey) or (companyKey, contactKey).
 * Returns {action: "inserted"|"updated", id}.
 *
 * This is the single mutation the Cursor agent can call via the Convex MCP
 * `run` tool to add lenders from a chat prompt.
 */
export const upsert = mutation({
  args: {
    organizationId: v.id("organizations"),
    memberUserKey: v.string(),
    ...lenderInput,
  },
  returns: v.object({
    action: v.union(v.literal("inserted"), v.literal("updated")),
    id: v.id("lenders"),
  }),
  handler: async (ctx, { organizationId, memberUserKey, ...args }) => {
    await assertLenderMutationAuth(ctx, organizationId, memberUserKey, "lenders.edit");
    if (!args.company || !args.company.trim()) {
      throw new Error("Company is required");
    }
    const now = Date.now();
    const doc = buildDoc(args as Record<string, unknown>, now);

    let existing: Doc<"lenders"> | null = null;
    if (doc.emailKey) {
      existing = await ctx.db
        .query("lenders")
        .withIndex("by_company_email", (q) =>
          q.eq("companyKey", doc.companyKey).eq("emailKey", doc.emailKey)
        )
        .first();
    }
    if (!existing && doc.contactKey) {
      existing = await ctx.db
        .query("lenders")
        .withIndex("by_company_contact", (q) =>
          q.eq("companyKey", doc.companyKey).eq("contactKey", doc.contactKey)
        )
        .first();
    }

    if (existing) {
      const before = existing;
      const patch: Partial<typeof doc> = {
        ...doc,
        createdAt: existing.createdAt,
        updatedAt: now,
        enrichedAt: existing.enrichedAt ?? 0,
      };
      await ctx.db.patch(existing._id, patch);
      const after = await ctx.db.get(existing._id);
      if (after) {
        await applyLenderWrite(ctx, before, after);
        await appendLenderFeed(
          ctx,
          after,
          "lender_updated",
          `Updated lender “${after.company.trim() || "Lender"}”`,
        );
      }
      return { action: "updated" as const, id: existing._id };
    }

    const id = await ctx.db.insert("lenders", doc);
    const inserted = await ctx.db.get(id);
    if (inserted) {
      await applyLenderWrite(ctx, null, inserted);
      await appendLenderFeed(
        ctx,
        inserted,
        "lender_created",
        `Added lender “${inserted.company.trim() || "Lender"}”`,
      );
    }
    return { action: "inserted" as const, id };
  },
});

/**
 * Lightweight create/upsert for Deliver-to-Lender modal.
 * - Directory add: same idempotent keys as `upsert` (shared catalog).
 * - One-time recipient: org-scoped row so it does not pollute the global catalog.
 */
export const upsertDeliveryRecipient = mutation({
  args: {
    organizationId: v.id("organizations"),
    memberUserKey: v.string(),
    company: v.string(),
    contactName: v.optional(v.string()),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    titleRole: v.optional(v.string()),
    oneTimeRecipient: v.optional(v.boolean()),
  },
  returns: v.object({
    action: v.union(v.literal("inserted"), v.literal("updated")),
    id: v.id("lenders"),
  }),
  handler: async (ctx, args) => {
    await assertLenderMutationAuth(
      ctx,
      args.organizationId,
      args.memberUserKey,
      "lenders.edit",
    );
    const company = args.company.trim();
    if (!company) throw new Error("Company is required");

    const oneTime = args.oneTimeRecipient === true;
    const now = Date.now();
    const doc = buildDoc(
      {
        company,
        contactName: args.contactName,
        email: args.email,
        phone: args.phone,
        titleRole: args.titleRole,
        source: oneTime ? "One-time delivery recipient" : "Manual Entry",
        section: oneTime ? "Delivery Recipient" : "Manual Addition",
        notes: oneTime
          ? "Created from Deliver to Lender as a one-time / custom recipient."
          : undefined,
      },
      now,
    );

    let existing: Doc<"lenders"> | null = null;
    if (doc.emailKey) {
      existing = await ctx.db
        .query("lenders")
        .withIndex("by_company_email", (q) =>
          q.eq("companyKey", doc.companyKey).eq("emailKey", doc.emailKey),
        )
        .first();
    }
    if (!existing && doc.contactKey) {
      existing = await ctx.db
        .query("lenders")
        .withIndex("by_company_contact", (q) =>
          q.eq("companyKey", doc.companyKey).eq("contactKey", doc.contactKey),
        )
        .first();
    }
    if (existing) {
      const god = await callerHasUnrestrictedOrgDataAccess(ctx, args.memberUserKey);
      if (
        !god &&
        existing.organizationId &&
        existing.organizationId !== args.organizationId
      ) {
        throw new Error("A matching lender belongs to a different organization.");
      }

      const sameOrg =
        existing.organizationId == null ||
        existing.organizationId === args.organizationId;

      // One-time recipients intentionally create an org-scoped row when the
      // only match is the shared catalog (avoid mutating global lenders).
      const reuseExisting =
        sameOrg &&
        (!oneTime || existing.organizationId === args.organizationId);

      if (reuseExisting) {
        if (!oneTime) {
          // Directory pick: never overwrite a full lender profile with a
          // sparse modal payload — just select the match.
          return { action: "updated" as const, id: existing._id };
        }
        const before = existing;
        await ctx.db.patch(existing._id, {
          ...doc,
          organizationId: args.organizationId,
          createdAt: existing.createdAt,
          updatedAt: now,
          enrichedAt: existing.enrichedAt ?? 0,
        });
        const after = await ctx.db.get(existing._id);
        if (after) {
          await applyLenderWrite(ctx, before, after);
          await appendLenderFeed(
            ctx,
            after,
            "lender_updated",
            `Updated delivery recipient “${after.company.trim() || "Lender"}”`,
          );
        }
        return { action: "updated" as const, id: existing._id };
      }
    }

    const id = await ctx.db.insert("lenders", {
      ...doc,
      ...(oneTime ? { organizationId: args.organizationId } : {}),
    });
    const inserted = await ctx.db.get(id);
    if (inserted) {
      await applyLenderWrite(ctx, null, inserted);
      await appendLenderFeed(
        ctx,
        inserted,
        "lender_created",
        oneTime
          ? `Added one-time delivery recipient “${inserted.company.trim() || "Lender"}”`
          : `Added lender “${inserted.company.trim() || "Lender"}”`,
      );
    }
    return { action: "inserted" as const, id };
  },
});

export const update = mutation({
  args: {
    id: v.id("lenders"),
    organizationId: v.id("organizations"),
    memberUserKey: v.string(),
    ...lenderInput,
  },
  handler: async (ctx, { id, organizationId, memberUserKey, ...rest }) => {
    const existing = await ctx.db.get(id);
    if (!existing) throw new Error("Lender not found");
    await assertCanTouchLender(ctx, existing, organizationId, memberUserKey, "lenders.edit");
    const now = Date.now();
    const doc = buildDoc(rest as Record<string, unknown>, now);
    const before = existing;
    await ctx.db.patch(id, {
      ...doc,
      createdAt: existing.createdAt,
      updatedAt: now,
      enrichedAt: existing.enrichedAt ?? 0,
    });
    const after = await ctx.db.get(id);
    if (after) {
      await applyLenderWrite(ctx, before, after);
      await appendLenderFeed(
        ctx,
        after,
        "lender_profile_updated",
        `Updated lender “${after.company.trim() || "Lender"}”`,
      );
    }
    return { id };
  },
});

/** Update only `notes` + search text (e.g. profile notes from the drawer). */
export const setNotes = mutation({
  args: {
    id: v.id("lenders"),
    organizationId: v.id("organizations"),
    memberUserKey: v.string(),
    notes: v.string(),
  },
  handler: async (ctx, { id, organizationId, memberUserKey, notes: notesRaw }) => {
    const existing = await ctx.db.get(id);
    if (!existing) throw new Error("Lender not found");
    await assertCanTouchLender(ctx, existing, organizationId, memberUserKey, "lenders.edit");
    const before = existing;
    const now = Date.now();
    const trimmed = notesRaw.trim();
    const merged: Doc<"lenders"> = { ...existing, notes: trimmed };
    await ctx.db.patch(id, {
      notes: trimmed,
      searchText: buildLenderSearchBlob(merged),
      updatedAt: now,
    });
    const after = await ctx.db.get(id);
    if (after) {
      await applyLenderWrite(ctx, before, after);
      await appendLenderFeed(
        ctx,
        after,
        "lender_notes_updated",
        `Updated notes — “${after.company.trim() || "Lender"}”`,
      );
    }
    return { ok: true as const };
  },
});

export const remove = mutation({
  args: {
    id: v.id("lenders"),
    organizationId: v.id("organizations"),
    memberUserKey: v.string(),
  },
  handler: async (ctx, { id, organizationId, memberUserKey }) => {
    const before = await ctx.db.get(id);
    if (!before) return { ok: false as const };
    await assertCanTouchLender(ctx, before, organizationId, memberUserKey, "lenders.manage");
    await appendLenderFeed(
      ctx,
      before,
      "lender_deleted",
      `Deleted lender “${before.company.trim() || "Lender"}”`,
    );
    await deleteAllForLender(ctx, id);
    await purgeLenderRelationsBeforeDelete(ctx, id);
    await ctx.db.delete(id);
    await applyLenderWrite(ctx, before, null);
    return { ok: true as const };
  },
});

/**
 * Merge `removeId` into `keepId` (filling empty fields, unioning lists, then
 * deleting the duplicate). Discovery candidates pointing at the removed
 * lender are repointed to the kept record.
 */
export const mergeLenders = mutation({
  args: {
    keepId: v.id("lenders"),
    removeId: v.id("lenders"),
    organizationId: v.id("organizations"),
    memberUserKey: v.string(),
  },
  handler: async (ctx, { keepId, removeId, organizationId, memberUserKey }) => {
    if (keepId === removeId) {
      throw new Error("Cannot merge a lender with itself");
    }
    const keep = await ctx.db.get(keepId);
    const remove = await ctx.db.get(removeId);
    if (!keep) throw new Error("Lender to keep was not found");
    if (!remove) throw new Error("Lender to remove was not found");
    await assertCanTouchLender(ctx, keep, organizationId, memberUserKey, "lenders.manage");
    await assertCanTouchLender(ctx, remove, organizationId, memberUserKey, "lenders.manage");
    const now = Date.now();

    const repointCandRows = await ctx.db
      .query("lenderCandidates")
      .filter((q) => q.eq(q.field("duplicateOfLenderId"), removeId))
      .collect();
    const repointedDiscoveryCandidates = repointCandRows.length;

    await repointMergedLenderId(ctx, removeId, keepId);

    const beforeKeep = keep;
    const row = buildMergedLenderRow(keep, remove, now);
    const rowClean = Object.fromEntries(
      Object.entries(row).filter(([, v]) => v !== undefined)
    ) as Record<string, unknown>;
    await ctx.db.patch(keepId, rowClean);
    const afterKeep = await ctx.db.get(keepId);
    if (afterKeep) {
      await applyLenderWrite(ctx, beforeKeep, afterKeep);
      await appendLenderFeed(
        ctx,
        afterKeep,
        "lender_merged",
        `Merged lender into “${afterKeep.company.trim() || "Lender"}”`,
      );
    }

    await reassignToLender(ctx, removeId, keepId);
    const beforeRem = remove;
    await ctx.db.delete(removeId);
    await applyLenderWrite(ctx, beforeRem, null);
    return {
      keepId,
      removedId: removeId,
      repointedDiscoveryCandidates,
    };
  },
});

/**
 * Rate a lender 0-5. Allows the broker to favor partners they trust so the
 * scenario matcher can surface them first.
 */
export const rate = mutation({
  args: {
    id: v.id("lenders"),
    organizationId: v.id("organizations"),
    memberUserKey: v.string(),
    rating: v.number(),
    ratingNotes: v.optional(v.string()),
  },
  handler: async (ctx, { id, organizationId, memberUserKey, rating, ratingNotes }) => {
    const existing = await ctx.db.get(id);
    if (!existing) throw new Error("Lender not found");
    await assertCanTouchLender(ctx, existing, organizationId, memberUserKey, "lenders.edit");
    const clamped = clampRating(rating) ?? 0;
    const before = existing;
    const nextNotes =
      ratingNotes !== undefined ? ratingNotes.trim() : existing.ratingNotes;
    const merged = {
      ...existing,
      rating: clamped,
      ratingNotes: nextNotes,
    } as Doc<"lenders">;
    await ctx.db.patch(id, {
      rating: clamped,
      ratingNotes: nextNotes,
      searchText: buildLenderSearchBlob(merged),
      updatedAt: Date.now(),
    });
    const after = await ctx.db.get(id);
    if (after) {
      await applyLenderWrite(ctx, before, after);
      await appendLenderFeed(
        ctx,
        after,
        "lender_rated",
        `Rated “${after.company.trim() || "Lender"}” (${clamped}/5)`,
      );
    }
    return { rating: clamped };
  },
});

/**
 * Bulk-upsert for the CSV upload flow.
 * Accepts an array of raw lender objects (strings only) and returns counts.
 * Splits into chunks inside a single mutation so writes are transactional.
 */
export const bulkUpsert = mutation({
  args: {
    organizationId: v.id("organizations"),
    memberUserKey: v.string(),
    records: v.array(v.object(lenderInput)),
  },
  handler: async (ctx, { organizationId, memberUserKey, records }) => {
    await assertLenderMutationAuth(ctx, organizationId, memberUserKey, "lenders.manage");
    let inserted = 0;
    let updated = 0;
    const now = Date.now();
    for (const args of records) {
      if (!args.company || !args.company.trim()) continue;
      const doc = buildDoc(args as Record<string, unknown>, now);

      let existing: Doc<"lenders"> | null = null;
      if (doc.emailKey) {
        existing = await ctx.db
          .query("lenders")
          .withIndex("by_company_email", (q) =>
            q.eq("companyKey", doc.companyKey).eq("emailKey", doc.emailKey)
          )
          .first();
      }
      if (!existing && doc.contactKey) {
        existing = await ctx.db
          .query("lenders")
          .withIndex("by_company_contact", (q) =>
            q.eq("companyKey", doc.companyKey).eq("contactKey", doc.contactKey)
          )
          .first();
      }
      if (existing) {
        const before = existing;
        await ctx.db.patch(existing._id, {
          ...doc,
          createdAt: existing.createdAt,
          updatedAt: now,
          enrichedAt: existing.enrichedAt ?? 0,
        });
        const after = await ctx.db.get(existing._id);
        if (after) await applyLenderWrite(ctx, before, after);
        updated += 1;
      } else {
        const newId = await ctx.db.insert("lenders", doc);
        const after = await ctx.db.get(newId);
        if (after) await applyLenderWrite(ctx, null, after);
        inserted += 1;
      }
    }
    return { inserted, updated, total: records.length };
  },
});

export const wipeAll = mutation({
  args: {
    confirm: v.literal("YES-DELETE-EVERYTHING"),
    memberUserKey: v.string(),
  },
  handler: async (ctx, { memberUserKey }) => {
    const god = await callerHasUnrestrictedOrgDataAccess(ctx, memberUserKey);
    if (!god) throw new Error("Unauthorized");
    const st = await getLenderStatsSingleton(ctx);
    if (st) await ctx.db.delete(st._id);
    const fileRows = await deleteAllLenderAttachments(ctx);
    const all = await ctx.db.query("lenders").collect();
    for (const r of all) await ctx.db.delete(r._id);
    return { deleted: all.length, filesDeleted: fileRows };
  },
});

/**
 * One-shot cleanup: re-runs every lender through the normalizers and patches
 * any rows whose phone / email / website / statesServed / whitespace fields
 * have drifted from canonical form. Idempotent — running it twice on clean
 * data returns `{ changed: 0 }`.
 *
 * Optional `limit` lets the UI chunk the cleanup (e.g. 200 rows at a time)
 * so very large databases don't timeout.
 */
export const normalizeAll = mutation({
  args: {
    organizationId: v.id("organizations"),
    memberUserKey: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { organizationId, memberUserKey, limit }) => {
    await assertLenderMutationAuth(ctx, organizationId, memberUserKey, "lenders.manage");
    const all = await ctx.db.query("lenders").collect();
    const cap = Math.min(limit ?? all.length, all.length);
    let changed = 0;
    const now = Date.now();

    for (let i = 0; i < cap; i++) {
      const r = all[i];
      const patch: Record<string, string> = {};

      const nextPhone = normalizePhone(r.phone);
      if (nextPhone !== r.phone) patch.phone = nextPhone;

      const nextEmail = normalizeEmail(r.email);
      if (nextEmail !== r.email) {
        patch.email = nextEmail;
        patch.emailKey = nextEmail;
      }

      const nextSite = normalizeWebsite(r.website);
      if (nextSite !== r.website) patch.website = nextSite;

      const nextStates = normalizeStates(r.statesServed);
      if (nextStates !== r.statesServed) patch.statesServed = nextStates;

      const whitespaceFields: Array<keyof Doc<"lenders">> = [
        "company",
        "contactName",
        "titleRole",
        "entityType",
        "primaryNiche",
        "propertyTypes",
        "ownerOrInvestor",
        "fundingAmountMin",
        "fundingAmountMax",
        "minFico",
        "ltv",
        "interestRates",
        "amortTerm",
        "referralFees",
        "status",
        "source",
        "section",
      ];
      for (const f of whitespaceFields) {
        const curr = (r as unknown as Record<string, unknown>)[f as string];
        if (typeof curr !== "string") continue;
        const next = normalizeWhitespace(curr);
        if (next !== curr) patch[f as string] = next;
      }

      if (Object.keys(patch).length > 0) {
        if (patch.company) patch.companyKey = normalizeKey(patch.company);
        if (patch.contactName) patch.contactKey = normalizeKey(patch.contactName);
        const merged = { ...r, ...patch } as Doc<"lenders">;
        await ctx.db.patch(r._id, {
          ...(patch as Partial<Doc<"lenders">>),
          incompleteData: isLenderIncomplete(merged),
          searchText: buildLenderSearchBlob(merged),
          updatedAt: now,
        });
        const after = await ctx.db.get(r._id);
        if (after) await applyLenderWrite(ctx, r, after);
        changed += 1;
      }
    }

    return { examined: cap, changed, total: all.length };
  },
});

/**
 * Fills `searchText` for the `lender_scenario` search index (faster
 * `scenario.matchScenario` when funding type is set). Paginate with `continueCursor`
 * from the previous response until `isDone` is true. Example:
 * `npx convex run lenders:rebuildLenderSearchText`
 * then re-run with `'{"cursor":"<cursor from prior run>"}'` if `isDone` is false.
 */
export const rebuildLenderSearchText = mutation({
  args: {
    limit: v.optional(v.number()),
    cursor: v.optional(v.union(v.string(), v.null())),
  },
  handler: async (ctx, { limit, cursor }) => {
    const pageSize = Math.min(Math.max(1, limit ?? 500), 2000);
    const startCursor = cursor === undefined || cursor === null ? null : cursor;
    const { page, isDone, continueCursor } = await ctx.db
      .query("lenders")
      .order("asc")
      .paginate({ numItems: pageSize, cursor: startCursor });
    let updated = 0;
    for (const l of page) {
      const st = buildLenderSearchBlob(l);
      if (l.searchText !== st) {
        await ctx.db.patch(l._id, { searchText: st });
        updated += 1;
      }
    }
    return {
      examined: page.length,
      updated,
      isDone,
      continueCursor: isDone ? null : continueCursor,
    };
  },
});

/**
 * Operator/CLI upsert — gated by DATA_MIGRATION_ADMIN_SECRET on the Convex deployment.
 * Uses APP_AUTH_ORGANIZATION_ID + APP_AUTH_USER_KEY from Convex env (not client args).
 */
export const operatorUpsert = mutation({
  args: {
    operatorSecret: v.string(),
    ...lenderInput,
  },
  handler: async (ctx, { operatorSecret, ...args }) => {
    const expected =
      process.env.DATA_MIGRATION_ADMIN_SECRET?.trim() ||
      process.env.ORG_INTEGRITY_ADMIN_SECRET?.trim();
    if (!expected || operatorSecret.trim() !== expected) {
      throw new Error("Unauthorized");
    }
    const organizationId = process.env.APP_AUTH_ORGANIZATION_ID?.trim() as
      | Id<"organizations">
      | undefined;
    const memberUserKey = process.env.APP_AUTH_USER_KEY?.trim();
    if (!organizationId || !memberUserKey) {
      throw new Error(
        "APP_AUTH_ORGANIZATION_ID and APP_AUTH_USER_KEY must be set on Convex for operator upsert.",
      );
    }
    await assertLenderMutationAuth(ctx, organizationId, memberUserKey, "lenders.edit");
    if (!args.company || !args.company.trim()) {
      throw new Error("Company is required");
    }
    const now = Date.now();
    const doc = buildDoc(args as Record<string, unknown>, now);

    let existing: Doc<"lenders"> | null = null;
    if (doc.emailKey) {
      existing = await ctx.db
        .query("lenders")
        .withIndex("by_company_email", (q) =>
          q.eq("companyKey", doc.companyKey).eq("emailKey", doc.emailKey),
        )
        .first();
    }
    if (!existing && doc.contactKey) {
      existing = await ctx.db
        .query("lenders")
        .withIndex("by_company_contact", (q) =>
          q.eq("companyKey", doc.companyKey).eq("contactKey", doc.contactKey),
        )
        .first();
    }

    if (existing) {
      const before = existing;
      const patch: Partial<typeof doc> = {
        ...doc,
        createdAt: existing.createdAt,
        updatedAt: now,
        enrichedAt: existing.enrichedAt ?? 0,
      };
      await ctx.db.patch(existing._id, patch);
      const after = await ctx.db.get(existing._id);
      if (after) {
        await applyLenderWrite(ctx, before, after);
        await appendLenderFeed(
          ctx,
          after,
          "lender_updated",
          `Updated lender “${after.company.trim() || "Lender"}”`,
        );
      }
      return { action: "updated" as const, id: existing._id };
    }

    const id = await ctx.db.insert("lenders", doc);
    const inserted = await ctx.db.get(id);
    if (inserted) {
      await applyLenderWrite(ctx, null, inserted);
      await appendLenderFeed(
        ctx,
        inserted,
        "lender_created",
        `Added lender “${inserted.company.trim() || "Lender"}”`,
      );
    }
    return { action: "inserted" as const, id };
  },
});
