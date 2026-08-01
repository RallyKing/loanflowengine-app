/**
 * Atomic portal block registry — every assignable client-portal slice is an
 * independent module. Broad drawer ids (dealWorkspace, fileDetails, …) are
 * legacy-only and normalized away on read.
 */
import { SECTION_KEYS, SECTION_LABELS, type ShareSectionId } from "@/convex/shareSections";
import {
  DEAL_ANALYSIS_SECTION_LABELS,
  type DealAnalysisSectionId,
} from "@/lib/file/dealAnalysisLayoutStorage";

/** Stable snake_case ids persisted on file tasks. */
export const ATOMIC_PORTAL_BLOCK_IDS = [
  // Pipeline drawer modules (atomic)
  "file_details",
  "file_notes",
  "contacts",
  "licensing",
  "lender_info",
  "fees_splits",
  "construction_budget",
  "investor_experience",
  "pfs_statement",
  // Deal intake sections
  "cover",
  "scenario",
  "overview",
  "borrower_entity",
  "guarantors",
  "business_entity",
  "property",
  "loans",
  "income",
  "assets_liabilities",
  "dependents_ages",
  "commercial_dscr",
  "hard_money",
  "schedule_real_estate",
  "fees_closing",
  "workflow",
  "deal_notes",
  // Calculators & tools
  "calculator_dti",
  "calculator_loan_comparison",
  "calculator_weighted_interest",
  "calculator_payoff",
  "calculator_day_counter",
] as const;

export type AtomicPortalBlockId = (typeof ATOMIC_PORTAL_BLOCK_IDS)[number];

const ATOMIC_SET = new Set<string>(ATOMIC_PORTAL_BLOCK_IDS);

export type AtomicPortalBlockKind =
  | "dealSection"
  | "pipelineModule"
  | "calculator";

export type AtomicPortalBlockCategory =
  | "file"
  | "intake"
  | "financial"
  | "commercial"
  | "analysis"
  | "closing";

export type AtomicPortalBlockDefinition = {
  id: AtomicPortalBlockId;
  label: string;
  description: string;
  category: AtomicPortalBlockCategory;
  kind: AtomicPortalBlockKind;
  /** When false, portal submit is rejected — broker-only slices (fees, lender, licensing). */
  clientEditable: boolean;
  /** Top-level dealData keys this block may read/write. */
  dealDataKeys: readonly string[];
  dealSectionId?: ShareSectionId;
  calculatorId?: DealAnalysisSectionId;
  pipelineModuleId?: Extract<
    AtomicPortalBlockId,
    | "file_details"
    | "file_notes"
    | "contacts"
    | "licensing"
    | "lender_info"
    | "fees_splits"
    | "construction_budget"
    | "investor_experience"
    | "pfs_statement"
  >;
  defaultSummary: string;
  defaultStatus: string;
};

const DEAL_SECTION_ATOMS: {
  id: AtomicPortalBlockId;
  dealSectionId: ShareSectionId;
  category: AtomicPortalBlockCategory;
}[] = [
  { id: "cover", dealSectionId: "cover", category: "intake" },
  { id: "scenario", dealSectionId: "scenario", category: "intake" },
  { id: "overview", dealSectionId: "overview", category: "intake" },
  { id: "borrower_entity", dealSectionId: "borrowers", category: "intake" },
  { id: "guarantors", dealSectionId: "guarantors", category: "intake" },
  { id: "business_entity", dealSectionId: "business", category: "intake" },
  { id: "property", dealSectionId: "property", category: "intake" },
  { id: "loans", dealSectionId: "loans", category: "financial" },
  { id: "income", dealSectionId: "income", category: "financial" },
  { id: "assets_liabilities", dealSectionId: "assets", category: "financial" },
  { id: "dependents_ages", dealSectionId: "household", category: "intake" },
  { id: "commercial_dscr", dealSectionId: "commercial", category: "commercial" },
  { id: "hard_money", dealSectionId: "hardmoney", category: "commercial" },
  { id: "schedule_real_estate", dealSectionId: "reo", category: "commercial" },
  { id: "fees_closing", dealSectionId: "fees", category: "closing" },
  { id: "workflow", dealSectionId: "workflow", category: "closing" },
  { id: "deal_notes", dealSectionId: "notes", category: "closing" },
];

const CALCULATOR_ATOMS: {
  id: AtomicPortalBlockId;
  calculatorId: DealAnalysisSectionId;
}[] = [
  { id: "calculator_dti", calculatorId: "dti" },
  { id: "calculator_loan_comparison", calculatorId: "comparison" },
  { id: "calculator_weighted_interest", calculatorId: "weighted" },
  { id: "calculator_payoff", calculatorId: "payoff" },
  { id: "calculator_day_counter", calculatorId: "daycounter" },
];

const PIPELINE_MODULE_DEFS: AtomicPortalBlockDefinition[] = [
  {
    id: "file_details",
    label: "File details",
    description: "Core file metadata, loan amount, and subject property.",
    category: "file",
    kind: "pipelineModule",
    clientEditable: true,
    pipelineModuleId: "file_details",
    dealDataKeys: ["cover", "subjectProperty", "borrowers"],
    defaultSummary: "File identity and property",
    defaultStatus: "Draft",
  },
  {
    id: "file_notes",
    label: "File notes",
    description: "Threaded notes, pins, and attachments on the pipeline file.",
    category: "file",
    kind: "pipelineModule",
    clientEditable: true,
    pipelineModuleId: "file_notes",
    dealDataKeys: ["clientPortalNotes", "notes"],
    defaultSummary: "Team notes and audit trail",
    defaultStatus: "Draft",
  },
  {
    id: "contacts",
    label: "Contacts",
    description: "Link contacts and assign borrower slots.",
    category: "file",
    kind: "pipelineModule",
    clientEditable: true,
    pipelineModuleId: "contacts",
    dealDataKeys: ["borrowers"],
    defaultSummary: "Linked contacts on this file",
    defaultStatus: "Draft",
  },
  {
    id: "licensing",
    label: "Licensing",
    description: "NMLS and licensing fields for LO and broker.",
    category: "file",
    kind: "pipelineModule",
    clientEditable: false,
    pipelineModuleId: "licensing",
    dealDataKeys: ["licensing"],
    defaultSummary: "Licensing identifiers",
    defaultStatus: "Draft",
  },
  {
    id: "lender_info",
    label: "Lender info",
    description: "Lender shopping, terms, and selected lender on the file.",
    category: "file",
    kind: "pipelineModule",
    clientEditable: false,
    pipelineModuleId: "lender_info",
    dealDataKeys: ["lenders"],
    defaultSummary: "Lender pipeline on file",
    defaultStatus: "Draft",
  },
  {
    id: "fees_splits",
    label: "Fees & splits",
    description: "Fee worksheet and commission splits.",
    category: "financial",
    kind: "pipelineModule",
    clientEditable: false,
    pipelineModuleId: "fees_splits",
    dealDataKeys: ["fees", "splits"],
    defaultSummary: "Fees and revenue splits",
    defaultStatus: "Draft",
  },
  {
    id: "construction_budget",
    label: "Construction budget",
    description: "Line-item construction budget with draw tracking.",
    category: "financial",
    kind: "pipelineModule",
    clientEditable: true,
    pipelineModuleId: "construction_budget",
    dealDataKeys: [],
    defaultSummary: "Budget lines and draws",
    defaultStatus: "Draft",
  },
  {
    id: "investor_experience",
    label: "Investor experience",
    description: "Track record and prior projects for the borrower.",
    category: "financial",
    kind: "pipelineModule",
    clientEditable: true,
    pipelineModuleId: "investor_experience",
    dealDataKeys: [],
    defaultSummary: "Prior deals and experience",
    defaultStatus: "Draft",
  },
  {
    id: "pfs_statement",
    label: "Personal financial statement",
    description: "Assets, liabilities, and net worth spreadsheet.",
    category: "financial",
    kind: "pipelineModule",
    clientEditable: true,
    pipelineModuleId: "pfs_statement",
    dealDataKeys: ["assets", "liabilities", "pfs"],
    defaultSummary: "PFS assets and liabilities",
    defaultStatus: "Draft",
  },
];

function dealSectionDef(
  row: (typeof DEAL_SECTION_ATOMS)[number],
): AtomicPortalBlockDefinition {
  const keys = SECTION_KEYS[row.dealSectionId];
  return {
    id: row.id,
    label: SECTION_LABELS[row.dealSectionId],
    description: `Deal intake — ${SECTION_LABELS[row.dealSectionId]}.`,
    category: row.category,
    kind: "dealSection",
    clientEditable: true,
    dealSectionId: row.dealSectionId,
    dealDataKeys: keys,
    defaultSummary: SECTION_LABELS[row.dealSectionId],
    defaultStatus: "Draft",
  };
}

function calculatorDef(
  row: (typeof CALCULATOR_ATOMS)[number],
): AtomicPortalBlockDefinition {
  const keys = SECTION_KEYS[row.calculatorId];
  return {
    id: row.id,
    label: DEAL_ANALYSIS_SECTION_LABELS[row.calculatorId],
    description: `Analysis tool — ${DEAL_ANALYSIS_SECTION_LABELS[row.calculatorId]}.`,
    category: "analysis",
    kind: "calculator",
    clientEditable: true,
    calculatorId: row.calculatorId,
    dealDataKeys: keys,
    defaultSummary: DEAL_ANALYSIS_SECTION_LABELS[row.calculatorId],
    defaultStatus: "Ready",
  };
}

export const ATOMIC_PORTAL_BLOCKS: readonly AtomicPortalBlockDefinition[] = [
  ...PIPELINE_MODULE_DEFS,
  ...DEAL_SECTION_ATOMS.map(dealSectionDef),
  ...CALCULATOR_ATOMS.map(calculatorDef),
];

const BLOCK_BY_ID = new Map(
  ATOMIC_PORTAL_BLOCKS.map((b) => [b.id, b] as const),
);

/** Legacy broad block ids → atomic expansion (read-time normalization only). */
export const LEGACY_BROAD_BLOCK_EXPANSION: Record<string, AtomicPortalBlockId[]> = {
  dealWorkspace: DEAL_SECTION_ATOMS.map((r) => r.id),
  financials: [
    "income",
    "assets_liabilities",
    "pfs_statement",
    "loans",
    "fees_closing",
    "construction_budget",
  ],
  fileDetails: ["file_details"],
  fileNotes: ["file_notes"],
  contacts: ["contacts"],
  licensing: ["licensing"],
  lenders: ["lender_info"],
  feesSplits: ["fees_splits"],
  pfs: ["pfs_statement"],
  constructionBudget: ["construction_budget"],
  investorExperience: ["investor_experience"],
};

/** Legacy camelCase aliases → single atomic id. */
export const LEGACY_BLOCK_ALIASES: Record<string, AtomicPortalBlockId> = {
  fileDetails: "file_details",
  fileNotes: "file_notes",
  contacts: "contacts",
  licensing: "licensing",
  lenders: "lender_info",
  lender_info: "lender_info",
  feesSplits: "fees_splits",
  pfs: "pfs_statement",
  constructionBudget: "construction_budget",
  investorExperience: "investor_experience",
  borrowers: "borrower_entity",
  business: "business_entity",
  assets: "assets_liabilities",
  household: "dependents_ages",
  commercial: "commercial_dscr",
  hardmoney: "hard_money",
  reo: "schedule_real_estate",
  fees: "fees_closing",
  notes: "deal_notes",
  dti: "calculator_dti",
  comparison: "calculator_loan_comparison",
  weighted: "calculator_weighted_interest",
  payoff: "calculator_payoff",
  daycounter: "calculator_day_counter",
};

export function isAtomicPortalBlockId(
  id: string,
): id is AtomicPortalBlockId {
  return ATOMIC_SET.has(id);
}

export function getAtomicPortalBlock(
  id: AtomicPortalBlockId,
): AtomicPortalBlockDefinition {
  const row = BLOCK_BY_ID.get(id);
  if (!row) throw new Error(`Unknown atomic portal block: ${id}`);
  return row;
}

export function atomicPortalBlockLabel(id: string): string {
  if (isAtomicPortalBlockId(id)) return getAtomicPortalBlock(id).label;
  return id;
}

export function atomicPortalBlockDescription(id: string): string | undefined {
  if (isAtomicPortalBlockId(id)) return getAtomicPortalBlock(id).description;
  return undefined;
}

export function isClientEditableAtomicBlock(blockId: string): boolean {
  if (!isAtomicPortalBlockId(blockId)) return false;
  return getAtomicPortalBlock(blockId).clientEditable;
}

/**
 * Normalize any persisted block id to a canonical atomic id, or null if unknown.
 * Expands legacy broad parents (dealWorkspace) into multiple atoms when requested.
 */
export function normalizeToAtomicBlockIds(
  rawId: string,
  expandBroad = false,
): AtomicPortalBlockId[] {
  const id = rawId.trim();
  if (!id) return [];
  if (isAtomicPortalBlockId(id)) return [id];
  if (expandBroad && LEGACY_BROAD_BLOCK_EXPANSION[id]) {
    return LEGACY_BROAD_BLOCK_EXPANSION[id];
  }
  const alias = LEGACY_BLOCK_ALIASES[id];
  if (alias) return [alias];
  return [];
}

/** Sanitize assigned entries — only atomic ids, deduped, ordered. */
export function sanitizeAtomicAssignedBlockEntries(
  entries: { blockId: string; sortOrder: number }[],
): { blockId: AtomicPortalBlockId; sortOrder: number }[] {
  const seen = new Set<string>();
  const out: { blockId: AtomicPortalBlockId; sortOrder: number }[] = [];
  const sorted = [...entries].sort((a, b) => a.sortOrder - b.sortOrder);
  sorted.forEach((entry, index) => {
    const atoms = normalizeToAtomicBlockIds(entry.blockId, true);
    for (const atom of atoms) {
      if (seen.has(atom)) continue;
      seen.add(atom);
      out.push({ blockId: atom, sortOrder: (index + 1) * 1000 + out.length });
    }
  });
  return out.map((e, index) => ({
    blockId: e.blockId,
    sortOrder: (index + 1) * 1000,
  }));
}

export const ATOMIC_PORTAL_BLOCKS_BY_CATEGORY = ATOMIC_PORTAL_BLOCK_IDS.reduce(
  (acc, id) => {
    const def = getAtomicPortalBlock(id);
    const list = acc.get(def.category) ?? [];
    list.push(def);
    acc.set(def.category, list);
    return acc;
  },
  new Map<AtomicPortalBlockCategory, AtomicPortalBlockDefinition[]>(),
);

export const ATOMIC_PORTAL_CATEGORY_LABELS: Record<
  AtomicPortalBlockCategory,
  string
> = {
  file: "File & contacts",
  intake: "Borrower intake",
  financial: "Financials",
  commercial: "Commercial & REO",
  analysis: "Calculators",
  closing: "Closing & workflow",
};
