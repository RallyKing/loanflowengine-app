/**
 * Phase 37.1.D — Backfill contact sticky data from `pipeline.dealData`.
 * Does NOT modify `pipeline.dealData` or intake validators.
 */
import { v } from "convex/values";
import { mutation } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { assertDataMigrationAdmin } from "../migrationAdminAuth";
import { embeddedDealPayloadIsSubstantive } from "../../lib/file/embeddedDealPresence";
import { pickIntakeShapedPreviewPayload } from "../../lib/pipeline/pickIntakeShapedPreviewPayload";
import {
  DEFAULT_CONTACT_ROLE_IDS,
  resolveContactRoleIdFromLegacyDoc,
} from "../../lib/contact/contactRoles";
import {
  allContactEmailStrings,
  contactMethodsToConvexFields,
  normalizeContactMethods,
} from "../../lib/contact/contactMethods";
import { normalizeEmailKey } from "../../lib/crmRelationship";

const MIGRATION_ACTOR = "__migration_37_1_c__";

export type BackfillSummary = {
  dryRun: boolean;
  scannedFiles: number;
  skippedNoDeal: number;
  skippedNoPrimaryContact: number;
  wouldInsertReo: number;
  wouldInsertPfs: number;
  wouldMergePfs: number;
  wouldInsertBusiness: number;
  wouldInsertDebt: number;
  wouldInsertBusinessOwnership: number;
  skippedDuplicateReo: number;
  skippedDuplicateLiability: number;
  skippedManualPfs: number;
  wouldCreateContacts: number;
  wouldCreateLinks: number;
  sampleWarnings: string[];
  nextCursor: Id<"pipeline"> | null;
};

type DealRecord = Record<string, unknown>;
type IncomeRow = {
  borrower?: string;
  source?: string;
  description?: string;
  monthlyAmount?: string;
  notes?: string;
};
type AssetRow = {
  description?: string;
  estimatedValue?: string;
  notes?: string;
};
type LiabilityRow = {
  description?: string;
  monthlyPayment?: string;
  balance?: string;
  notes?: string;
};
type ReoRow = {
  address?: string;
  apn?: string;
  state?: string;
  propertyType?: string;
  usage?: string;
  purchasedDate?: string;
  marketValue?: string;
  zillowUrl?: string;
  balance?: string;
  mortgagePayment?: string;
  rate?: string;
  position?: string;
  taxes?: string;
  insurance?: string;
  hoa?: string;
  escrow?: string;
  grossRent?: string;
  netRent?: string;
  invested?: string;
  latLong?: string;
  lotSf?: string;
  propSf?: string;
  mostRecent?: string;
};
type WeightedInterestRow = {
  account?: string;
  balance?: string;
  monthlyPayment?: string;
  note?: string;
  include?: boolean;
};

function str(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const t = value.trim();
  return t || undefined;
}

function norm(s: string | undefined): string {
  return (s ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

function normName(s: string | undefined): string {
  return norm(s);
}

function collapseWs(s: string): string {
  return s.trim().replace(/\s+/g, " ");
}

function personNameFromBorrowerRow(row: unknown): string {
  if (!row || typeof row !== "object") return "";
  const rec = row as Record<string, unknown>;
  const first = typeof rec.firstName === "string" ? rec.firstName : "";
  const middle = typeof rec.middleName === "string" ? rec.middleName : "";
  const last = typeof rec.lastName === "string" ? rec.lastName : "";
  return collapseWs([first, middle, last].filter(Boolean).join(" "));
}

function parseCoverBorrowers(raw: unknown): string[] {
  if (typeof raw !== "string") return [];
  const t = raw.trim();
  if (!t) return [];
  return t
    .split(/,|&| and /gi)
    .map((s) => collapseWs(s))
    .filter(Boolean);
}

function reoFingerprint(row: ReoRow): string {
  return `${norm(row.address)}|${norm(row.apn)}|${norm(row.state)}`;
}

function reoFingerprintFromStored(row: Doc<"contactReoProperties">): string {
  return `${norm(row.propertyAddress)}|${norm(row.apn)}|${norm(row.state)}`;
}

function assetFingerprint(row: AssetRow): string {
  return `${norm(row.description)}|${norm(row.estimatedValue)}`;
}

function liabilityFingerprint(row: LiabilityRow): string {
  return `${norm(row.description)}|${norm(row.balance)}|${norm(row.monthlyPayment)}`;
}

function incomeFingerprint(row: IncomeRow): string {
  return `${norm(row.borrower)}|${norm(row.source)}|${norm(row.description)}|${norm(row.monthlyAmount)}`;
}

function debtFingerprint(row: WeightedInterestRow): string {
  return `${norm(row.account)}|${norm(row.balance)}|${norm(row.monthlyPayment)}`;
}

function businessEntityFingerprint(
  orgId: string | undefined,
  legalName: string,
  ein?: string,
): string {
  const org = norm(orgId);
  const einNorm = norm(ein);
  if (einNorm) return `${org}|ein:${einNorm}`;
  return `${org}|name:${norm(legalName)}`;
}

function isPrimaryFileLink(link: Doc<"contactFileLinks">): boolean {
  const role = link.role.toLowerCase();
  if (/co-sign|co-borrow|co_sign|cosign/.test(role)) return false;
  if (link.contactRoleId === DEFAULT_CONTACT_ROLE_IDS.client) return true;
  if (/client|borrower/.test(role) && !/co-sign|co-borrow/.test(role)) return true;
  return false;
}

function isCoSignerFileLink(link: Doc<"contactFileLinks">): boolean {
  const role = link.role.toLowerCase();
  return /co-sign|co-borrow|co_sign|cosign/.test(role);
}

function incomeBorrowerTagIndex(borrowerTag: string | undefined): number {
  const tag = norm(borrowerTag);
  if (!tag || tag === "borrower 1" || tag === "borrower1") return 0;
  const m = tag.match(/borrower\s*(\d+)/);
  if (m) {
    const n = parseInt(m[1]!, 10);
    return Number.isFinite(n) && n > 0 ? n - 1 : 0;
  }
  return 0;
}

function mapReoRow(row: ReoRow, sortOrder: number) {
  return {
    sortOrder,
    propertyAddress: str(row.address),
    propertyType: str(row.propertyType),
    usage: str(row.usage),
    state: str(row.state),
    purchasedDate: str(row.purchasedDate),
    marketValue: str(row.marketValue),
    zillowUrl: str(row.zillowUrl),
    mortgageBalance: str(row.balance),
    monthlyPayment: str(row.mortgagePayment),
    rate: str(row.rate),
    position: str(row.position),
    taxes: str(row.taxes),
    insurance: str(row.insurance),
    hoa: str(row.hoa),
    escrow: str(row.escrow),
    grossRent: str(row.grossRent),
    netRent: str(row.netRent),
    apn: str(row.apn),
    invested: str(row.invested),
    latLong: str(row.latLong),
    lotSf: str(row.lotSf),
    propSf: str(row.propSf),
    mostRecent: str(row.mostRecent),
  };
}

function migrationVersionWrapper(args: {
  sourceFileId: Id<"pipeline">;
  sourceDealKey: string;
  fingerprint: string;
  payload: unknown;
  dryRun: boolean;
}) {
  return {
    _migration: "37.1.c",
    phase: "backfill",
    sourceFileId: args.sourceFileId,
    sourceDealKey: args.sourceDealKey,
    fingerprint: args.fingerprint,
    payload: args.payload,
    dryRun: args.dryRun,
  };
}

async function appendMigrationVersion(
  ctx: MutationCtx,
  args: {
    contact: Doc<"contacts">;
    entityType: Doc<"contactDataVersions">["entityType"];
    entityId?: string;
    sourceFileId: Id<"pipeline">;
    sourceDealKey: string;
    fingerprint: string;
    previousPayload: unknown;
    dryRun: boolean;
  },
) {
  if (args.dryRun) return;
  await ctx.db.insert("contactDataVersions", {
    organizationId: args.contact.organizationId,
    contactId: args.contact._id,
    entityType: args.entityType,
    entityId: args.entityId,
    previousState: migrationVersionWrapper({
      sourceFileId: args.sourceFileId,
      sourceDealKey: args.sourceDealKey,
      fingerprint: args.fingerprint,
      payload: args.previousPayload,
      dryRun: false,
    }),
    modifiedBy: MIGRATION_ACTOR,
    modifiedAt: Date.now(),
  });
}

type ContactLookups = {
  byEmail: Map<string, Doc<"contacts">>;
  byName: Map<string, Doc<"contacts">>;
};

function buildContactLookups(
  contacts: Doc<"contacts">[],
  organizationId: Id<"organizations"> | undefined,
): ContactLookups {
  const byEmail = new Map<string, Doc<"contacts">>();
  const byName = new Map<string, Doc<"contacts">>();
  for (const c of contacts) {
    if (organizationId && c.organizationId && c.organizationId !== organizationId) {
      continue;
    }
    for (const e of allContactEmailStrings(c)) {
      const key = norm(e);
      if (key && !byEmail.has(key)) byEmail.set(key, c);
    }
    const nameKey = normName(c.name);
    if (nameKey && !byName.has(nameKey)) byName.set(nameKey, c);
  }
  return { byEmail, byName };
}

function matchContactByName(
  name: string,
  lookups: ContactLookups,
): Doc<"contacts"> | null {
  const key = normName(name);
  if (!key) return null;
  return lookups.byName.get(key) ?? null;
}

async function resolvePrimaryContact(
  ctx: MutationCtx,
  file: Doc<"pipeline">,
  deal: DealRecord,
  lookups: ContactLookups,
): Promise<Doc<"contacts"> | null> {
  const links = await ctx.db
    .query("contactFileLinks")
    .withIndex("by_file", (q) => q.eq("fileId", file._id))
    .collect();

  const primaryLinks = links
    .filter(isPrimaryFileLink)
    .sort((a, b) => a.createdAt - b.createdAt);

  for (const link of primaryLinks) {
    const contact = await ctx.db.get(link.contactId);
    if (contact) return contact;
  }

  if (links.length > 0 && primaryLinks.length === 0) {
    const earliest = [...links].sort((a, b) => a.createdAt - b.createdAt)[0];
    if (earliest) {
      const contact = await ctx.db.get(earliest.contactId);
      if (contact && !isCoSignerFileLink(earliest)) return contact;
    }
  }

  const clientName = str(deal.clientName);
  if (clientName) {
    const matched = matchContactByName(clientName, lookups);
    if (matched) return matched;
  }

  const borrowers = Array.isArray(deal.borrowers) ? deal.borrowers : [];
  if (borrowers.length > 0) {
    const name = personNameFromBorrowerRow(borrowers[0]);
    const matched = matchContactByName(name, lookups);
    if (matched) return matched;
  }

  const cover =
    deal.cover != null && typeof deal.cover === "object" && !Array.isArray(deal.cover)
      ? (deal.cover as Record<string, unknown>)
      : null;
  const coverNames = parseCoverBorrowers(cover?.borrowers);
  if (coverNames[0]) {
    const matched = matchContactByName(coverNames[0]!, lookups);
    if (matched) return matched;
  }

  return null;
}

async function resolveCoBorrowerContacts(
  ctx: MutationCtx,
  file: Doc<"pipeline">,
  deal: DealRecord,
  primary: Doc<"contacts">,
  lookups: ContactLookups,
): Promise<Doc<"contacts">[]> {
  const result: Doc<"contacts">[] = [];
  const seen = new Set<string>([String(primary._id)]);

  const links = await ctx.db
    .query("contactFileLinks")
    .withIndex("by_file", (q) => q.eq("fileId", file._id))
    .collect();

  for (const link of links.filter(isCoSignerFileLink)) {
    const contact = await ctx.db.get(link.contactId);
    if (contact && !seen.has(String(contact._id))) {
      result.push(contact);
      seen.add(String(contact._id));
    }
  }

  const borrowers = Array.isArray(deal.borrowers) ? deal.borrowers : [];
  for (let i = 1; i < borrowers.length; i += 1) {
    const name = personNameFromBorrowerRow(borrowers[i]);
    const matched = matchContactByName(name, lookups);
    if (matched && !seen.has(String(matched._id))) {
      result.push(matched);
      seen.add(String(matched._id));
    }
  }

  const cover =
    deal.cover != null && typeof deal.cover === "object" && !Array.isArray(deal.cover)
      ? (deal.cover as Record<string, unknown>)
      : null;
  const coverNames = parseCoverBorrowers(cover?.borrowers);
  for (let i = 1; i < coverNames.length; i += 1) {
    const matched = matchContactByName(coverNames[i]!, lookups);
    if (matched && !seen.has(String(matched._id))) {
      result.push(matched);
      seen.add(String(matched._id));
    }
  }

  return result;
}

async function loadDealPayload(
  ctx: MutationCtx,
  file: Doc<"pipeline">,
): Promise<DealRecord | null> {
  const linked =
    file.intakeSheetId != null ? await ctx.db.get(file.intakeSheetId) : null;
  const embedded = embeddedDealPayloadIsSubstantive(file.dealData)
    ? (file.dealData as DealRecord)
    : null;
  const picked = pickIntakeShapedPreviewPayload(
    embedded,
    linked as DealRecord | null,
    file.updatedAt,
  );
  return picked as DealRecord | null;
}

async function contactHasMigrationMarker(
  ctx: MutationCtx,
  contactId: Id<"contacts">,
): Promise<boolean> {
  const row = await ctx.db
    .query("contactDataVersions")
    .withIndex("by_contact_at", (q) => q.eq("contactId", contactId))
    .order("desc")
    .first();
  return row?.modifiedBy === MIGRATION_ACTOR;
}

async function contactHasManualPfs(
  ctx: MutationCtx,
  contactId: Id<"contacts">,
): Promise<boolean> {
  const profile = await ctx.db
    .query("contactFinancialProfiles")
    .withIndex("by_contact", (q) => q.eq("contactId", contactId))
    .first();
  if (!profile) return false;
  const hasMigration = await contactHasMigrationMarker(ctx, contactId);
  if (hasMigration) return false;
  const pfsVersion = await ctx.db
    .query("contactDataVersions")
    .withIndex("by_contact_entity_type_at", (q) =>
      q.eq("contactId", contactId).eq("entityType", "pfs"),
    )
    .first();
  if (pfsVersion && pfsVersion.modifiedBy !== MIGRATION_ACTOR) return true;
  if (!pfsVersion) return true;
  return false;
}

async function loadExistingReoFingerprints(
  ctx: MutationCtx,
  contactId: Id<"contacts">,
): Promise<Set<string>> {
  const rows = await ctx.db
    .query("contactReoProperties")
    .withIndex("by_contact", (q) => q.eq("contactId", contactId))
    .collect();
  return new Set(rows.filter((r) => r.archivedAt == null).map(reoFingerprintFromStored));
}

async function loadExistingDebtFingerprints(
  ctx: MutationCtx,
  businessEntityId: Id<"contactBusinessEntities">,
): Promise<Set<string>> {
  const rows = await ctx.db
    .query("contactBusinessDebtSchedules")
    .withIndex("by_business_entity", (q) =>
      q.eq("businessEntityId", businessEntityId),
    )
    .collect();
  return new Set(
    rows
      .filter((r) => r.archivedAt == null)
      .map((r) =>
        `${norm(r.creditor)}|${norm(r.balance)}|${norm(r.monthlyPayment)}`,
      ),
  );
}

function collectWeightedInterestRows(deal: DealRecord): WeightedInterestRow[] {
  const rows: WeightedInterestRow[] = [];
  const top = deal.weightedInterest;
  if (Array.isArray(top)) {
    for (const row of top) {
      if (row && typeof row === "object") rows.push(row as WeightedInterestRow);
    }
  }
  const instances = deal.weightedInterestInstances;
  if (Array.isArray(instances)) {
    for (const inst of instances) {
      if (!inst || typeof inst !== "object") continue;
      const data = (inst as Record<string, unknown>).data;
      if (!data || typeof data !== "object") continue;
      const instRows = (data as Record<string, unknown>).rows;
      if (!Array.isArray(instRows)) continue;
      for (const row of instRows) {
        if (row && typeof row === "object") rows.push(row as WeightedInterestRow);
      }
    }
  }
  return rows;
}

function splitIncomeRows(
  incomeRows: IncomeRow[],
  primary: Doc<"contacts">,
  coBorrowers: Doc<"contacts">[],
): Map<Id<"contacts">, IncomeRow[]> {
  const map = new Map<Id<"contacts">, IncomeRow[]>();
  map.set(primary._id, []);

  for (const co of coBorrowers) {
    map.set(co._id, []);
  }

  for (const row of incomeRows) {
    const idx = incomeBorrowerTagIndex(row.borrower);
    if (idx === 0) {
      map.get(primary._id)!.push(row);
    } else {
      const coIdx = idx - 1;
      const co = coBorrowers[coIdx];
      if (co) {
        map.get(co._id)!.push(row);
      } else {
        map.get(primary._id)!.push(row);
      }
    }
  }

  return map;
}

function mergeArrayWithDedupe<T>(
  existing: T[],
  incoming: T[],
  fingerprint: (row: T) => string,
  existingFingerprints: Set<string>,
): { merged: T[]; added: number; skippedDuplicate: number } {
  const merged = [...existing];
  let added = 0;
  let skippedDuplicate = 0;
  for (const row of incoming) {
    const fp = fingerprint(row);
    if (!fp.replace(/\|/g, "").trim()) continue;
    if (existingFingerprints.has(fp)) {
      skippedDuplicate += 1;
      continue;
    }
    existingFingerprints.add(fp);
    merged.push(row);
    added += 1;
  }
  return { merged, added, skippedDuplicate };
}

async function findBusinessEntity(
  ctx: MutationCtx,
  organizationId: Id<"organizations"> | undefined,
  legalName: string,
  ein?: string,
): Promise<Doc<"contactBusinessEntities"> | null> {
  if (!organizationId) return null;
  if (ein) {
    const all = await ctx.db
      .query("contactBusinessEntities")
      .withIndex("by_organization", (q) => q.eq("organizationId", organizationId))
      .collect();
    const einNorm = norm(ein);
    const byEin = all.find((e) => norm(e.ein) === einNorm);
    if (byEin) return byEin;
  }
  return await ctx.db
    .query("contactBusinessEntities")
    .withIndex("by_organization_entity_name", (q) =>
      q.eq("organizationId", organizationId).eq("entityName", legalName),
    )
    .first();
}

async function matchContactForOwnerName(
  name: string | undefined,
  lookups: ContactLookups,
  primary: Doc<"contacts">,
  coBorrowers: Doc<"contacts">[],
): Promise<Doc<"contacts"> | null> {
  const n = str(name);
  if (!n) return null;
  if (normName(primary.name) === normName(n)) return primary;
  for (const co of coBorrowers) {
    if (normName(co.name) === normName(n)) return co;
  }
  return matchContactByName(n, lookups);
}

function emptySummary(dryRun: boolean): BackfillSummary {
  return {
    dryRun,
    scannedFiles: 0,
    skippedNoDeal: 0,
    skippedNoPrimaryContact: 0,
    wouldInsertReo: 0,
    wouldInsertPfs: 0,
    wouldMergePfs: 0,
    wouldInsertBusiness: 0,
    wouldInsertDebt: 0,
    wouldInsertBusinessOwnership: 0,
    skippedDuplicateReo: 0,
    skippedDuplicateLiability: 0,
    skippedManualPfs: 0,
    wouldCreateContacts: 0,
    wouldCreateLinks: 0,
    sampleWarnings: [],
    nextCursor: null,
  };
}

function primaryNameFromDeal(deal: DealRecord): string {
  const borrowers = Array.isArray(deal.borrowers) ? deal.borrowers : [];
  if (borrowers.length > 0) {
    const name = personNameFromBorrowerRow(borrowers[0]);
    if (name) return name;
  }
  const clientName = str(deal.clientName);
  if (clientName) return clientName;
  const cover =
    deal.cover != null && typeof deal.cover === "object" && !Array.isArray(deal.cover)
      ? (deal.cover as Record<string, unknown>)
      : null;
  const coverNames = parseCoverBorrowers(cover?.borrowers);
  return coverNames[0] ?? "";
}

function stubContactForDryRun(
  file: Doc<"pipeline">,
  name: string,
): Doc<"contacts"> {
  return {
    _id: file._id as unknown as Id<"contacts">,
    _creationTime: Date.now(),
    name,
    email: "",
    phone: "",
    notes: "",
    organizationId: file.organizationId,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  } as Doc<"contacts">;
}

async function ensurePrimaryContact(
  ctx: MutationCtx,
  file: Doc<"pipeline">,
  deal: DealRecord,
  dryRun: boolean,
  createMissingContacts: boolean,
  summary: BackfillSummary,
  lookups: ContactLookups,
  allContacts: Doc<"contacts">[],
): Promise<Doc<"contacts"> | null> {
  const existing = await resolvePrimaryContact(ctx, file, deal, lookups);
  if (existing) return existing;
  if (!createMissingContacts) return null;

  const name = primaryNameFromDeal(deal);
  if (!name) return null;

  if (dryRun) {
    summary.wouldCreateContacts += 1;
    summary.wouldCreateLinks += 1;
    return stubContactForDryRun(file, name);
  }

  const now = Date.now();
  const methods = normalizeContactMethods({}, (e) => normalizeEmailKey(e));
  const methodFields = contactMethodsToConvexFields(methods);
  const contactId = await ctx.db.insert("contacts", {
    name,
    ...methodFields,
    notes: "Created by Phase 37.1 contact sticky-data backfill",
    contactRoleId: resolveContactRoleIdFromLegacyDoc({ labels: ["client"] }),
    contactRoleIds: [DEFAULT_CONTACT_ROLE_IDS.client],
    organizationId: file.organizationId,
    createdAt: now,
    updatedAt: now,
  });
  const created = await ctx.db.get(contactId);
  if (!created) return null;

  await ctx.db.insert("contactFileLinks", {
    contactId: created._id,
    fileId: file._id,
    role: "client",
    contactRoleId: DEFAULT_CONTACT_ROLE_IDS.client,
    notes: "Created by Phase 37.1 contact sticky-data backfill",
    createdAt: now,
    updatedAt: now,
  });

  allContacts.push(created);
  const nameKey = normName(created.name);
  if (nameKey) lookups.byName.set(nameKey, created);
  summary.wouldCreateContacts += 1;
  summary.wouldCreateLinks += 1;
  return created;
}

function pushWarning(summary: BackfillSummary, message: string) {
  if (summary.sampleWarnings.length < 50) {
    summary.sampleWarnings.push(message);
  }
}

async function processFile(
  ctx: MutationCtx,
  file: Doc<"pipeline">,
  deal: DealRecord,
  lookups: ContactLookups,
  dryRun: boolean,
  createMissingContacts: boolean,
  summary: BackfillSummary,
  allContacts: Doc<"contacts">[],
  sessionReoFingerprints: Map<string, Set<string>>,
  sessionEntityIds: Map<string, Id<"contactBusinessEntities">>,
) {
  const primary = await ensurePrimaryContact(
    ctx,
    file,
    deal,
    dryRun,
    createMissingContacts,
    summary,
    lookups,
    allContacts,
  );
  if (!primary) {
    summary.skippedNoPrimaryContact += 1;
    pushWarning(
      summary,
      `file ${String(file._id)}: unresolved primary contact (${file.fileName})`,
    );
    return;
  }

  const coBorrowers = await resolveCoBorrowerContacts(
    ctx,
    file,
    deal,
    primary,
    lookups,
  );

  const contactKey = String(primary._id);
  if (!sessionReoFingerprints.has(contactKey)) {
    sessionReoFingerprints.set(
      contactKey,
      await loadExistingReoFingerprints(ctx, primary._id),
    );
  }
  const reoFps = sessionReoFingerprints.get(contactKey)!;

  const reoRows = Array.isArray(deal.reo) ? (deal.reo as ReoRow[]) : [];
  let reoSort = reoFps.size;
  for (let i = 0; i < reoRows.length; i += 1) {
    const row = reoRows[i]!;
    const fp = reoFingerprint(row);
    if (!fp.replace(/\|/g, "").trim()) continue;
    if (reoFps.has(fp)) {
      summary.skippedDuplicateReo += 1;
      continue;
    }
    if (dryRun) {
      summary.wouldInsertReo += 1;
      reoFps.add(fp);
      continue;
    }
    const mapped = mapReoRow(row, reoSort);
    reoSort += 1;
    const id = await ctx.db.insert("contactReoProperties", {
      organizationId: primary.organizationId ?? file.organizationId,
      contactId: primary._id,
      ...mapped,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    reoFps.add(fp);
    summary.wouldInsertReo += 1;
    await appendMigrationVersion(ctx, {
      contact: primary,
      entityType: "reo",
      entityId: id,
      sourceFileId: file._id,
      sourceDealKey: `reo[${i}]`,
      fingerprint: fp,
      previousPayload: null,
      dryRun,
    });
  }

  const assets = Array.isArray(deal.assets) ? (deal.assets as AssetRow[]) : [];
  const liabilities = Array.isArray(deal.liabilities)
    ? (deal.liabilities as LiabilityRow[])
    : [];
  const incomeRows = Array.isArray(deal.incomeRows)
    ? (deal.incomeRows as IncomeRow[])
    : [];

  const incomeSplit = splitIncomeRows(incomeRows, primary, coBorrowers);
  const primaryIncome = incomeSplit.get(primary._id) ?? [];

  async function applyPfsForContact(
    contact: Doc<"contacts">,
    income: IncomeRow[],
    includeFileLevelArrays: boolean,
    sourceKey: string,
  ) {
    if (await contactHasManualPfs(ctx, contact._id)) {
      summary.skippedManualPfs += 1;
      pushWarning(
        summary,
        `contact ${String(contact._id)}: skipped PFS (manual profile without migration marker)`,
      );
      return;
    }

    const assetsForContact = includeFileLevelArrays ? assets : [];
    const liabilitiesForContact = includeFileLevelArrays ? liabilities : [];

    if (
      income.length === 0 &&
      assetsForContact.length === 0 &&
      liabilitiesForContact.length === 0
    ) {
      return;
    }

    const existing = await ctx.db
      .query("contactFinancialProfiles")
      .withIndex("by_contact", (q) => q.eq("contactId", contact._id))
      .first();

    const assetFps = new Set(
      (existing?.assets ?? []).map((r) => assetFingerprint(r)),
    );
    const liabilityFps = new Set(
      (existing?.liabilities ?? []).map((r) => liabilityFingerprint(r)),
    );
    const incomeFps = new Set(
      (existing?.income ?? []).map((r) => incomeFingerprint(r)),
    );

    const assetMerge = mergeArrayWithDedupe(
      existing?.assets ?? [],
      assetsForContact,
      assetFingerprint,
      assetFps,
    );
    const liabilityMerge = mergeArrayWithDedupe(
      existing?.liabilities ?? [],
      liabilitiesForContact,
      liabilityFingerprint,
      liabilityFps,
    );
    const incomeMerge = mergeArrayWithDedupe(
      existing?.income ?? [],
      income,
      incomeFingerprint,
      incomeFps,
    );

    summary.skippedDuplicateLiability += liabilityMerge.skippedDuplicate;

    const netWorth =
      existing?.netWorth ??
      (includeFileLevelArrays && Array.isArray(deal.guarantors)
        ? str((deal.guarantors[0] as Record<string, unknown> | undefined)?.netWorth)
        : undefined);
    const liquidAssets =
      existing?.liquidAssets ??
      (includeFileLevelArrays && Array.isArray(deal.guarantors)
        ? str(
            (deal.guarantors[0] as Record<string, unknown> | undefined)
              ?.liquidAssets,
          )
        : undefined);

    const patch = {
      income: incomeMerge.merged,
      assets: assetMerge.merged,
      liabilities: liabilityMerge.merged,
      netWorth,
      liquidAssets,
    };

    const addedCount =
      assetMerge.added + liabilityMerge.added + incomeMerge.added;

    if (!existing) {
      if (dryRun) {
        if (addedCount > 0 || income.length > 0) summary.wouldInsertPfs += 1;
        return;
      }
      const id = await ctx.db.insert("contactFinancialProfiles", {
        organizationId: contact.organizationId ?? file.organizationId,
        contactId: contact._id,
        ...patch,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      summary.wouldInsertPfs += 1;
      await appendMigrationVersion(ctx, {
        contact,
        entityType: "pfs",
        entityId: id,
        sourceFileId: file._id,
        sourceDealKey: sourceKey,
        fingerprint: `pfs:${contactKey}`,
        previousPayload: null,
        dryRun,
      });
      return;
    }

    if (addedCount === 0) return;

    if (dryRun) {
      summary.wouldMergePfs += 1;
      return;
    }

    await appendMigrationVersion(ctx, {
      contact,
      entityType: "pfs",
      entityId: existing._id,
      sourceFileId: file._id,
      sourceDealKey: sourceKey,
      fingerprint: `pfs:${contactKey}`,
      previousPayload: existing,
      dryRun,
    });
    await ctx.db.patch(existing._id, {
      ...patch,
      updatedAt: Date.now(),
    });
    summary.wouldMergePfs += 1;
  }

  await applyPfsForContact(primary, primaryIncome, true, "pfs:primary");

  for (const co of coBorrowers) {
    const coIncome = incomeSplit.get(co._id) ?? [];
    await applyPfsForContact(co, coIncome, false, `pfs:co-borrower:${co._id}`);
  }

  const business =
    deal.business != null &&
    typeof deal.business === "object" &&
    !Array.isArray(deal.business)
      ? (deal.business as Record<string, unknown>)
      : null;
  const legalName = business ? str(business.legalName) : undefined;

  if (legalName) {
    const orgId = primary.organizationId ?? file.organizationId;
    const ein = str(business?.ein);
    const entityFp = businessEntityFingerprint(
      orgId ? String(orgId) : undefined,
      legalName,
      ein,
    );

    let entityId = sessionEntityIds.get(entityFp) ?? null;
    let entityDoc: Doc<"contactBusinessEntities"> | null = null;

    if (!entityId) {
      entityDoc = await findBusinessEntity(ctx, orgId, legalName, ein);
      if (entityDoc) {
        entityId = entityDoc._id;
        sessionEntityIds.set(entityFp, entityId);
      }
    } else {
      entityDoc = await ctx.db.get(entityId);
    }

    if (!entityId) {
      if (dryRun) {
        summary.wouldInsertBusiness += 1;
      } else {
        entityId = await ctx.db.insert("contactBusinessEntities", {
          organizationId: orgId,
          entityName: legalName,
          dba: str(business?.dba),
          ein,
          entityType: str(business?.entityType),
          state: str(business?.stateOfFormation),
          formationDate: str(business?.formationDate),
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });
        sessionEntityIds.set(entityFp, entityId);
        summary.wouldInsertBusiness += 1;
        await appendMigrationVersion(ctx, {
          contact: primary,
          entityType: "business",
          entityId,
          sourceFileId: file._id,
          sourceDealKey: "business",
          fingerprint: entityFp,
          previousPayload: null,
          dryRun,
        });
      }
    }

    const resolvedEntityId = entityId ?? sessionEntityIds.get(entityFp);
    if (resolvedEntityId) {
      async function upsertOwnership(
        ownerContact: Doc<"contacts">,
        ownershipPct?: string,
        title?: string,
        sourceDealKey?: string,
      ) {
        const existingLink = await ctx.db
          .query("contactBusinessOwnership")
          .withIndex("by_contact_entity", (q) =>
            q
              .eq("contactId", ownerContact._id)
              .eq("businessEntityId", resolvedEntityId!),
          )
          .first();
        if (existingLink) return;

        if (dryRun) {
          summary.wouldInsertBusinessOwnership += 1;
          return;
        }

        const linkId = await ctx.db.insert("contactBusinessOwnership", {
          organizationId: ownerContact.organizationId ?? orgId,
          contactId: ownerContact._id,
          businessEntityId: resolvedEntityId!,
          ownershipPercentage: ownershipPct,
          title,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });
        summary.wouldInsertBusinessOwnership += 1;
        await appendMigrationVersion(ctx, {
          contact: ownerContact,
          entityType: "business_ownership",
          entityId: linkId,
          sourceFileId: file._id,
          sourceDealKey: sourceDealKey ?? "business.ownership",
          fingerprint: `${ownerContact._id}|${resolvedEntityId}`,
          previousPayload: null,
          dryRun,
        });
      }

      await upsertOwnership(primary, undefined, undefined, "business.primary");

      const owners = Array.isArray(business?.owners) ? business!.owners : [];
      for (let i = 0; i < owners.length; i += 1) {
        const owner = owners[i] as Record<string, unknown>;
        const ownerContact = await matchContactForOwnerName(
          str(owner.name),
          lookups,
          primary,
          coBorrowers,
        );
        if (!ownerContact) continue;
        await upsertOwnership(
          ownerContact,
          str(owner.ownershipPct),
          str(owner.title),
          `business.owners[${i}]`,
        );
      }

      const guarantors = Array.isArray(deal.guarantors) ? deal.guarantors : [];
      for (let i = 0; i < guarantors.length; i += 1) {
        const g = guarantors[i] as Record<string, unknown>;
        const gContact = await matchContactForOwnerName(
          str(g.name),
          lookups,
          primary,
          coBorrowers,
        );
        if (!gContact) continue;
        await upsertOwnership(
          gContact,
          str(g.ownershipPct),
          str(g.role),
          `guarantors[${i}]`,
        );
      }

      const debtRows = collectWeightedInterestRows(deal);
      if (resolvedEntityId && debtRows.length > 0) {
        const debtFps = await loadExistingDebtFingerprints(ctx, resolvedEntityId);
        let debtSort = debtFps.size;
        for (let i = 0; i < debtRows.length; i += 1) {
          const row = debtRows[i]!;
          if (row.include === false) continue;
          const fp = debtFingerprint(row);
          if (!fp.replace(/\|/g, "").trim()) continue;
          if (debtFps.has(fp)) continue;
          if (dryRun) {
            summary.wouldInsertDebt += 1;
            debtFps.add(fp);
            continue;
          }
          const id = await ctx.db.insert("contactBusinessDebtSchedules", {
            organizationId: orgId,
            businessEntityId: resolvedEntityId,
            sortOrder: debtSort,
            creditor: str(row.account),
            balance: str(row.balance),
            monthlyPayment: str(row.monthlyPayment),
            position: str(row.note),
            createdAt: Date.now(),
            updatedAt: Date.now(),
          });
          debtSort += 1;
          debtFps.add(fp);
          summary.wouldInsertDebt += 1;
          await appendMigrationVersion(ctx, {
            contact: primary,
            entityType: "business_debt",
            entityId: id,
            sourceFileId: file._id,
            sourceDealKey: `weightedInterest[${i}]`,
            fingerprint: fp,
            previousPayload: null,
            dryRun,
          });
        }
      }
    }
  }
}

export const backfillContactStickyData = mutation({
  args: {
    adminSecret: v.string(),
    dryRun: v.boolean(),
    limit: v.optional(v.number()),
    organizationId: v.optional(v.id("organizations")),
    cursor: v.optional(v.id("pipeline")),
    preferNewestFirst: v.optional(v.boolean()),
    createMissingContacts: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    assertDataMigrationAdmin(args.adminSecret);

    const dryRun = args.dryRun;
    const createMissingContacts = args.createMissingContacts === true;
    const limit = Math.max(1, Math.min(5000, Math.floor(args.limit ?? 100)));
    const preferNewest = args.preferNewestFirst !== false;
    const summary = emptySummary(dryRun);

    let files = await ctx.db.query("pipeline").collect();
    if (args.organizationId) {
      files = files.filter((f) => f.organizationId === args.organizationId);
    }
    if (preferNewest) {
      files.sort((a, b) => b.updatedAt - a.updatedAt);
    } else {
      files.sort((a, b) => a.updatedAt - b.updatedAt);
    }

    let startIdx = 0;
    if (args.cursor) {
      const cursorIdx = files.findIndex((f) => f._id === args.cursor);
      if (cursorIdx >= 0) startIdx = cursorIdx + 1;
    }

    const batch = files.slice(startIdx, startIdx + limit);
    const hasMore = startIdx + batch.length < files.length;
    summary.nextCursor =
      hasMore && batch.length > 0 ? batch[batch.length - 1]!._id : null;

    const allContacts = await ctx.db.query("contacts").collect();
    const sessionReoFingerprints = new Map<string, Set<string>>();
    const sessionEntityIds = new Map<string, Id<"contactBusinessEntities">>();

    for (const file of batch) {
      summary.scannedFiles += 1;
      const deal = await loadDealPayload(ctx, file);
      if (!deal) {
        summary.skippedNoDeal += 1;
        continue;
      }

      const lookups = buildContactLookups(allContacts, file.organizationId);
      await processFile(
        ctx,
        file,
        deal,
        lookups,
        dryRun,
        createMissingContacts,
        summary,
        allContacts,
        sessionReoFingerprints,
        sessionEntityIds,
      );
    }

    return summary;
  },
});
