import { mutation, query, type MutationCtx } from "./_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import {
  derivePrimaryFundingAmountFromDealPayload,
  intakeRowToDealPayload,
  mergePartialCoverOnPatch,
  mergePartialSubjectPropertyOnPatch,
  mergePatchIntoDeal,
  resolveDealBaseForPipelinePatch,
} from "./dealDataMerge";
import { sanitizeDbPatch } from "./sanitizeConvexPatch";
import {
  materializeFileSharedStateOnPatch,
  normalizeFileSharedStateFromPipeline,
  serializeFileSharedStateStorage,
  type PipelineFileSharedSource,
} from "../lib/fileSharedFields";
import { revenueTotalsFromPipelineRow } from "../lib/fileRevenue";
import { buildInitialIntakeDocument } from "./intakeDocumentDefaults";
import { intakePatchableChangesValidator } from "./intakePatchable";
import { embeddedDealPayloadIsSubstantive } from "../lib/file/embeddedDealPresence";
import { pickIntakeShapedPreviewPayload } from "../lib/pipeline/pickIntakeShapedPreviewPayload";
import { buildSubjectAddressDisplay } from "../lib/pipeline/subjectAddressDisplay";
import { parseClientMomentum } from "../lib/clientMomentum";
import type { PipelineListRow } from "../lib/pipelineListRow";
import { syncPipelineStatusFromStage } from "./organizationPipelineStagesHelpers";
import { insertCollaborationActivityEvent } from "./activityEvents";
import { isCurrentlySnoozed as pipelineIsCurrentlySnoozed } from "../lib/pipelineSnooze";
import { resolvePipelineTableFundingAmount } from "../lib/pipeline/resolvePipelineTableFundingAmount";
import { resolvePrimaryTableLender } from "../lib/pipeline/resolvePrimaryTableLender";
import {
  normalizePipelineDrawerLayout,
  type PipelineDrawerLayoutV1,
} from "../lib/pipelineDrawerLayoutStorage";
import {
  finalizeFileDrawerLayoutForPersist,
  layoutToDbFields,
  resolveNewFileDrawerLayout,
} from "./pipelineGlobalBlockConfigHelpers";
import { buildNewFilePipelineMetricsContext } from "../lib/userPreferencesNewFileDrawer";
import { batchPipelineFileNoteCounts } from "./pipelineFileNotes";
import {
  clampActivitySummary,
  drawerLayoutAuditTargetsChanged,
  diffDrawerBlocksShownHidden,
} from "../lib/pipelineFileActivityModel";
import {
  cloneJson,
  drawerLayoutStableKey,
  patchKeysForUndo,
  snapshotPipelineFields,
  undoJsonPairWithinLimit,
  undoPayloadWithinLimit,
} from "../lib/pipelineFileUndo";
import { appendPipelineClientMomentumFeed } from "./activityFeed";
import { tryGetAuthUserByPermissionKey } from "./auth/globalAdmin";
import { appendPipelineFileActivity } from "./pipelineFileActivity";
import { runPipelineBlockAutomations } from "./pipelineBlockAutomationRunner";
import { runUserSimpleWorkflows } from "./userSimpleWorkflowExecutor";
import { newMentionHandlesOnly } from "../lib/mentions";
import { collectPipelineWatcherUserKeys } from "./notificationRecipients";
import { dispatchUserNotification } from "./notifications";
import {
  assertCanMutatePipelineRow,
  assertCanReadPipelineRow,
  assertLenderAttachableToPipeline,
  assertOrgMember,
  assertOrgScopeArgs,
  assertCanDeletePipelineRow,
  assertCanManagePipelineDrawerLayout,
  filterPipelineByOrgScope,
  filterPipelineRowsForMember,
  resolveMemberUserKey,
  resolveOrgPipelineFileAccessLevel,
  sessionKeyIsGlobalAdmin,
} from "./organizationAccess";
import {
  pipelineHierarchyFkArgs,
  resolvePipelineHierarchyForCreate,
} from "./hierarchyEnforcement";
import { ownerFieldsForInsert } from "./resourceAccess";
import { buildPipelineViewerAccess } from "./resourceViewerAccess";
import { buildPipelineOwnershipPresentation } from "./resourceOwnershipPresentation";
import { safeResolveFileHierarchy } from "./pipelineHierarchyCompat";
import {
  resolveTableRowClientDisplayName,
  resolveTableRowProjectDisplayTitle,
} from "../lib/pipeline/resolveTableRowHierarchyDisplay";
import {
  ensurePrimaryLoanClientLink,
  resolveProjectLinkedClients,
} from "./pipelineMultiClientLinks";
import {
  batchCapitalRollupsForProjects,
  syncCapitalSourcesFromProjectLoans,
} from "./projectCapitalStack";
import { batchGraphLinksForPipelineFiles } from "./pipelineGraphPreviewLinks";

/** Org-scoped files must record the authenticated creator as canonical owner. */
function ownerFieldsForOrgCreate(
  organizationId: Id<"organizations"> | undefined,
  preferencesAccountId: string | undefined,
): ReturnType<typeof ownerFieldsForInsert> | Record<string, never> {
  if (!organizationId) return {};
  const ownerId = preferencesAccountId?.trim();
  if (!ownerId) {
    throw new Error(
      "preferencesAccountId (authenticated creator) is required when creating an organization-scoped file.",
    );
  }
  return ownerFieldsForInsert(ownerId);
}
import {
  assertDrawerLayoutAllowedForOrgPlan,
  finalizeDrawerLayoutRespectingOrgPlan,
} from "./organizationPlan";
import { assertCanAddOrgPipelineFile } from "./orgPlanLimits";
import { refreshPipelineGlobalSearchText } from "./globalSearchSync";
import {
  detachLenderFromFile,
  findFileLenderEdge,
  resyncFileTeamEdgesFromPipeline,
  syncFileLenderEdgesFromPipeline,
} from "./indexedGraphEdgeSync";
import { deletePipelineGraph } from "./graphCleanup";
import { appendPctFeeRecomputeForLoanChange } from "./pipelineFeeRecompute";

function scheduleOrgPipelineWebhook(
  ctx: MutationCtx,
  organizationId: Id<"organizations"> | undefined,
  eventType: string,
  fileId: Id<"pipeline">,
  patchContext?: {
    changedKeys?: string[];
    previousStatus?: string;
    nextStatus?: string;
  },
): void {
  if (!organizationId) return;
  void ctx.scheduler.runAfter(0, internal.webhookOutbound.emitOrgWebhookEvent, {
    organizationId,
    eventType,
    resourceType: "pipeline",
    resourceId: fileId,
    patchContext,
  });
}

const preferencesAccountIdArg = {
  /**
   * Client `UserPreferences` account id (`useUserPreferences().accountId`).
   * When omitted, new files use only the global new-file template (system default).
   */
  preferencesAccountId: v.optional(v.string()),
};

/** Same id as preferences; required for org-scoped rows when mutating via some endpoints. */
const memberUserKeyArg = {
  memberUserKey: v.optional(v.string()),
};

const orgListScopeArgs = {
  organizationId: v.id("organizations"),
  memberUserKey: v.optional(v.string()),
};

/**
 * For drawer UIs: pipeline row + resolved `lenders` records (order follows
 * `pipeline.lenders`; missing ids are skipped).
 */
export const getDetail = query({
  args: { id: v.id("pipeline"), ...memberUserKeyArg },
  handler: async (ctx, { id, memberUserKey }) => {
    const p = await ctx.db.get(id);
    if (!p) return null;
    await assertCanReadPipelineRow(ctx, p, memberUserKey);
    const resolved: Array<Doc<"lenders">> = [];
    for (const lid of p.lenders) {
      const d = await ctx.db.get(lid);
      if (d) resolved.push(d);
    }
    const viewerAccess = await buildPipelineViewerAccess(
      ctx,
      p,
      memberUserKey,
    );
    const ownership = await buildPipelineOwnershipPresentation(
      ctx,
      p,
      memberUserKey,
    );
    return {
      pipeline: p,
      lenders: resolved,
      canMutateFile: viewerAccess.canMutate,
      viewerAccess,
      ownership,
    };
  },
});

// ---------- Shared validators (mirror `pipeline` table) ----------

const contactItem = v.object({
  name: v.string(),
  email: v.optional(v.string()),
  phone: v.optional(v.string()),
  company: v.optional(v.string()),
});

const splitItem = v.object({
  name: v.string(),
  amount: v.number(),
  reason: v.optional(v.string()),
});

const termOptionItem = v.object({
  rate: v.string(),
  term: v.string(),
  prepaymentPenalty: v.string(),
  notes: v.string(),
  appraisalRequired: v.optional(v.boolean()),
  newLoanAmount: v.optional(v.string()),
  fundingTimeframe: v.optional(v.string()),
  qualifyingIncomeType: v.optional(v.string()),
  includeQualifyingIncomeAmount: v.optional(v.boolean()),
  qualifyingIncomeAmount: v.optional(v.string()),
});

const scenarioCriteriaItem = v.object({
  fundingTypeLabel: v.optional(v.string()),
  propertyTypeLabel: v.optional(v.string()),
  state: v.optional(v.string()),
  transactionType: v.optional(v.string()),
  ficoScore: v.optional(v.number()),
  annualRevenue: v.optional(v.number()),
  timeInBusinessMonths: v.optional(v.number()),
  ltv: v.optional(v.number()),
  ownerOccupied: v.optional(
    v.union(
      v.literal("Owner"),
      v.literal("Investor"),
      v.literal("Either")
    )
  ),
  entityTypePreference: v.optional(v.string()),
  industry: v.optional(v.string()),
});

type ScenarioCriteriaInput = {
  fundingTypeLabel?: string;
  propertyTypeLabel?: string;
  state?: string;
  transactionType?: string;
  ficoScore?: number;
  annualRevenue?: number;
  timeInBusinessMonths?: number;
  ltv?: number;
  ownerOccupied?: "Owner" | "Investor" | "Either";
  entityTypePreference?: string;
  industry?: string;
};

/**
 * Strip empty strings / undefined from an inbound scenario criteria object.
 * Returns `undefined` if every leaf ends up empty so callers can clear the
 * column entirely.
 */
function normalizeScenarioCriteria(
  c: ScenarioCriteriaInput | undefined
): ScenarioCriteriaInput | undefined {
  if (!c) return undefined;
  const trimStr = (s: string | undefined) => {
    const t = s?.trim();
    return t ? t : undefined;
  };
  const num = (n: number | undefined) =>
    typeof n === "number" && Number.isFinite(n) && n > 0 ? n : undefined;
  const out: ScenarioCriteriaInput = {
    fundingTypeLabel: trimStr(c.fundingTypeLabel),
    propertyTypeLabel: trimStr(c.propertyTypeLabel),
    state: trimStr(c.state),
    transactionType: trimStr(c.transactionType),
    ficoScore: num(c.ficoScore),
    annualRevenue: num(c.annualRevenue),
    timeInBusinessMonths: num(c.timeInBusinessMonths),
    ltv: num(c.ltv),
    ownerOccupied:
      c.ownerOccupied === "Owner" ||
      c.ownerOccupied === "Investor" ||
      c.ownerOccupied === "Either"
        ? c.ownerOccupied
        : undefined,
    entityTypePreference: trimStr(c.entityTypePreference),
    industry: trimStr(c.industry),
  };
  const hasAny = Object.values(out).some((x) => x !== undefined);
  return hasAny ? out : undefined;
}

const pipelineInput = {
  fileName: v.string(),
  /** Set when the deal is linked to an intake sheet created in the same flow. */
  intakeSheetId: v.optional(v.id("intakeSheets")),
  status: v.string(),
  fundingAmount: v.number(),
  rate: v.number(),
  term: v.string(),
  propertyAddress: v.optional(v.string()),
  notes: v.optional(v.string()),
  lenders: v.array(v.id("lenders")),
  contacts: v.array(contactItem),
  lenderFee: v.optional(v.number()),
  lenderFeePct: v.optional(v.number()),
  lenderFeeOutside: v.optional(v.number()),
  brokerGross: v.optional(v.number()),
  brokerGrossPct: v.optional(v.number()),
  brokerGrossOutside: v.optional(v.number()),
  splits: v.optional(v.array(splitItem)),
  netToUser: v.optional(v.number()),
  netToUserPct: v.optional(v.number()),
  netToUserOutside: v.optional(v.number()),
  scenario: v.optional(v.string()),
  scenarioCriteria: v.optional(scenarioCriteriaItem),
  termOptions: v.optional(v.array(termOptionItem)),
  assigneeId: v.optional(v.string()),
  sharedWithIds: v.optional(v.array(v.string())),
  /** Tracked commission (USD); shared bus — not fee calculator `brokerGross`. */
  commission: v.optional(v.number()),
  netRevenue: v.optional(v.number()),
};

// ---------- Ledger (paid status) — isolated from main CRUD ----------

/**
 * Status labels that should trigger ledger insertion. Accept both the
 * canonical `paid_paying` from `lib/pipelineStatus.ts` and any legacy
 * value like "paid" or "paying" so historical rows still flow through.
 */
function isPaidStatusLabel(s: string): boolean {
  const k = s.trim().toLowerCase().replace(/[\s/]+/g, "_");
  return k === "paid_paying" || k === "paid" || k === "paying";
}

/**
 * When status is set to `"paid"`, ensure one `ledger` row for this file.
 * `gross` / `net` come from the pipeline row (`brokerGross` / `netToUser`); `date` is `dateMs`.
 * No-op if a ledger entry already exists for this `fileId` (idempotent).
 */
async function tryInsertLedgerWhenMarkedPaid(
  ctx: MutationCtx,
  fileId: Id<"pipeline">,
  source: Doc<"pipeline">,
  nextStatus: string,
  dateMs: number
): Promise<Id<"ledger"> | null> {
  if (!isPaidStatusLabel(nextStatus)) {
    return null;
  }
  const existing = await ctx.db
    .query("ledger")
    .withIndex("by_fileId", (q) => q.eq("fileId", fileId))
    .first();
  if (existing) {
    return null;
  }
  return await ctx.db.insert("ledger", {
    fileId,
    gross: source.brokerGross ?? 0,
    net: source.netToUser ?? 0,
    date: dateMs,
  });
}

// ---------- Queries ----------

/**
 * All pipeline rows, newest first. Archived rows are hidden by default —
 * pass `includeArchived: true` to surface them (e.g. the "Show archived"
 * toggle on the pipeline page).
 */
export const getAll = query({
  args: {
    includeArchived: v.optional(v.boolean()),
    ...orgListScopeArgs,
  },
  handler: async (ctx, { includeArchived, organizationId, memberUserKey }) => {
    await assertOrgScopeArgs(ctx, organizationId, memberUserKey);
    const rows = await ctx.db.query("pipeline").order("desc").collect();
    let out = includeArchived ? rows : rows.filter((r) => r.archivedAt == null);
    const god = await sessionKeyIsGlobalAdmin(ctx, memberUserKey);
    out = god ? out : filterPipelineByOrgScope(out, organizationId);
    out = await filterPipelineRowsForMember(ctx, out, organizationId, memberUserKey);
    return out;
  },
});

function projectListLight(p: Doc<"pipeline">): PipelineListRow {
  const now = Date.now();
  const isSnoozed = pipelineIsCurrentlySnoozed(p.snoozedUntil, now);
  const fundingAmount =
    typeof p.fundingAmount === "number" && Number.isFinite(p.fundingAmount)
      ? p.fundingAmount
      : 0;
  const rev = revenueTotalsFromPipelineRow(
    p as unknown as PipelineFileSharedSource,
  );
  const cm = parseClientMomentum(p.clientMomentum);
  const base: PipelineListRow = {
    _id: p._id,
    _creationTime: p._creationTime,
    createdAt: p.createdAt,
    fileName: p.fileName,
    propertyAddress: p.propertyAddress,
    scenario: p.scenario,
    stageId: p.stageId,
    subStageId: p.subStageId,
    status: p.status,
    fundingAmount,
    commission: rev.commission,
    netRevenue: rev.netRevenue,
    rate: p.rate,
    term: p.term,
    updatedAt: p.updatedAt,
    archivedAt: p.archivedAt,
    snoozedUntil: p.snoozedUntil,
    isSnoozed,
    lenders: p.lenders,
    assigneeId: p.assigneeId,
    projectIntoLedger: p.projectIntoLedger,
    netToUser: p.netToUser,
    brokerGross: p.brokerGross,
  };
  return cm !== undefined ? { ...base, clientMomentum: cm } : base;
}

/**
 * Same sort/filter as `getAll` but only fields needed for pipeline list, ledger
 * projection cards, task file picker, and print ledger — much smaller over the wire.
 * Detail views should keep using `getById` / `getDetail`.
 */
export const listLight = query({
  args: {
    includeArchived: v.optional(v.boolean()),
    /**
     * When set, return at most this many rows after visibility filtering.
     * Integration API and large orgs: keep responses bounded (1–500).
     */
    maxRows: v.optional(v.number()),
    ...orgListScopeArgs,
  },
  handler: async (ctx, { includeArchived, organizationId, memberUserKey, maxRows }) => {
    await assertOrgScopeArgs(ctx, organizationId, memberUserKey);
    const rows = await ctx.db.query("pipeline").order("desc").collect();
    const filtered = includeArchived
      ? rows
      : rows.filter((r) => r.archivedAt == null);
    const god = await sessionKeyIsGlobalAdmin(ctx, memberUserKey);
    const scoped = god ? filtered : filterPipelineByOrgScope(filtered, organizationId);
    const visible = await filterPipelineRowsForMember(
      ctx,
      scoped,
      organizationId,
      memberUserKey,
    );
    const projected = visible.map(projectListLight);
    if (typeof maxRows !== "number" || !Number.isFinite(maxRows)) {
      return projected;
    }
    const cap = Math.min(Math.max(Math.floor(maxRows), 1), 500);
    return projected.slice(0, cap);
  },
});

/**
 * Intake-shaped payload for table/board previews: substantive embedded
 * `dealData` and/or linked `intakeSheets`. When both exist, the snapshot with
 * the **later `updatedAt` (else `_creationTime`)** wins so funding tracks the
 * last deal save — not unrelated `pipeline.updatedAt` bumps.
 */
function resolveDealPayloadForPreview(
  p: Doc<"pipeline">,
  intakeById: Map<Id<"intakeSheets">, Doc<"intakeSheets">>,
): Doc<"intakeSheets"> | null {
  const linked = p.intakeSheetId
    ? (intakeById.get(p.intakeSheetId) ?? null)
    : null;
  const embedded = embeddedDealPayloadIsSubstantive(p.dealData)
    ? (p.dealData as Doc<"intakeSheets">)
    : null;
  return pickIntakeShapedPreviewPayload(embedded, linked, p.updatedAt);
}

function trimStr(v: unknown): string {
  if (v == null) return "";
  if (typeof v !== "string") return String(v).trim();
  return v.trim();
}

function fmtTableDate(ms: number | undefined): string {
  if (ms == null || !Number.isFinite(ms)) return "";
  try {
    return new Date(ms).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return "";
  }
}

function fmtTableMoney(n: number | undefined): string {
  if (n == null || !Number.isFinite(n)) return "";
  return `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function fmtTableNet(n: number | undefined): string {
  if (n == null || !Number.isFinite(n)) return "";
  return `$${n.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/**
 * **Source** column — deal document only (embedded `dealData` or linked intake).
 * - **`sourceType`** — canonical lead / channel origin (referral, internet, etc.).
 * - **`clientName` · `projectName`** — borrower / deal identity shown for context
 * - **`business.legalName` · `business.dba`** when top-level names are empty
 * Empty string when nothing is set (UI shows em dash). No `pipeline`-only text.
 */
function buildSourceLabel(intake: Doc<"intakeSheets"> | null): string {
  if (!intake) return "";
  const st = trimStr(intake.sourceType);
  const client = trimStr(intake.clientName);
  const project = trimStr(intake.projectName);
  const whoTop = [client, project].filter(Boolean).join(" · ");
  const b = intake.business;
  const whoBiz =
    !whoTop && b
      ? [trimStr(b.legalName), trimStr(b.dba)].filter(Boolean).join(" · ")
      : "";
  const who = whoTop || whoBiz;
  if (st && who) return `${st} — ${who}`;
  if (who) return who;
  if (st) return st;
  return "";
}

/**
 * **Funding type** column — **`fundingType`** on the deal document only
 * (File → Overview). Empty until the user sets it; no inference from
 * `dealType`, `cover.fundingType` (product), or other tabs.
 */
function buildFundingTypeDisplay(intake: Doc<"intakeSheets"> | null): string {
  if (!intake) return "";
  return trimStr(intake.fundingType);
}

/**
 * **Purchase / refi** column — transaction intent on the deal first, then
 * scenario match mirror on the pipeline row:
 * 1. `cover.purpose` — coversheet purpose (Purchase, Rate/Term, Cash-Out, …)
 * 2. `loans[0].purpose` — first-lien purpose when entered on loans tab
 * 3. `business.useOfFunds` — business funding category when applicable
 * 4. `scenario.loanPurpose` — scenario worksheet free text
 * 5. `pipeline.scenarioCriteria.transactionType` — scenario-match mirror (last)
 */
function buildPurchaseRefiDisplay(
  intake: Doc<"intakeSheets"> | null,
  p: Doc<"pipeline">,
): string {
  if (!intake) {
    return trimStr(p.scenarioCriteria?.transactionType);
  }
  return (
    trimStr(intake.cover?.purpose) ||
    trimStr(intake.loans?.[0]?.purpose) ||
    trimStr(intake.business?.useOfFunds) ||
    trimStr(intake.scenario?.loanPurpose) ||
    trimStr(p.scenarioCriteria?.transactionType) ||
    ""
  );
}

/**
 * Enriched pipeline row for the main table / board (`listTablePreview`).
 * Reads deal fields from **`resolveDealPayloadForPreview`** (substantive
 * embedded `pipeline.dealData` and/or linked `intakeSheets` — **whichever
 * deal snapshot has the later `updatedAt` / `_creationTime`** so the table
 * tracks the latest funding and deal fields).
 *
 * | Column / cell | Source |
 * |---------------|--------|
 * | File name | `pipeline.fileName` (synced from `dealData.fileName` when embedded) |
 * | Stage | `pipeline.status` |
 * | Source | `buildSourceLabel` → deal `sourceType` (+ borrower / business context) |
 * | Subject address | `buildSubjectAddressDisplay` → `subjectProperty`, `cover.subjectProperty`, `primaryProperty`, `propertyAddress`, `scenario.propertyAddress` |
 * | Funding type | Deal root `fundingType` (see `buildFundingTypeDisplay`) |
 * | Funding program | `cover.program` or `business.fundingProduct` only (not `pipeline.scenario`) |
 * | Purchase / refi | `buildPurchaseRefiDisplay` |
 * | Funding amount | `cover.fundingAmount` when key exists (SSOT, cleared → 0); else `resolvePipelineTableFundingAmount` derivation / `pipeline` |
 * | Selected lender | `lenders.company` for `pipeline.selectedLenderId` |
 * | Lender sent | `fmtTableDate(pipeline.selectedLenderSentAt)` — user-set; not auto-filled when choosing a lender |
 * | Target close | `fmtTableDate(pipeline.targetCloseDate)` then `cover.estCOE` (string) |
 * | Net to you | `fmtTableNet(pipeline.netToUser)` |
 * | Notes | `pipeline.notes` |
 * | Updated (row subtext) | `pipeline.updatedAt` (client relative time) |
 *
 * **Update mechanisms (table inline):** file name / subject / funding amount / lead
 * `sourceType` → `commitPipeline*` + `patchDeal` when `isDealBackedPipelineRow`, else
 * `pipeline.patch`; **funding type** is edited via `patchDeal` (`fundingType` on the deal)
 * from the file workspace or the pipeline table (`commitPipelineFundingType`) and appears
 * on the next `listTablePreview` tick. Stage /
 * target close (ms) / lender sent (ms) / net / notes → `pipeline.patch`; target close
 * also writes `cover.estCOE` via `patchDeal` when deal-backed (`commitPipelineTargetClose`).
 * All writes bump `pipeline.updatedAt`; `patchDeal` refreshes `dealData` so
 * `useQuery(listTablePreview)` reflects file workspace edits immediately.
 */
function buildTablePreviewRow(
  p: Doc<"pipeline">,
  intake: Doc<"intakeSheets"> | null,
  lenderById: Map<Id<"lenders">, Doc<"lenders">>,
) {
  /** Single projection from live file deal payload (`dealData` or linked intake). */
  const fileFundingAmount = resolvePipelineTableFundingAmount(intake, p);

  const { fundingAmount: _pipelineStoredFunding, ...listFields } =
    projectListLight(p);
  void _pipelineStoredFunding;
  const subjectAddressDisplay = buildSubjectAddressDisplay(intake, p);

  const fundingTypeDisplay = buildFundingTypeDisplay(intake);

  /** Program column: coversheet program or business funding product only. */
  const fundingProgramDisplay =
    trimStr(intake?.cover?.program) ||
    trimStr(intake?.business?.fundingProduct) ||
    "";

  const purchaseRefiDisplay = buildPurchaseRefiDisplay(intake, p);

  const selected = p.selectedLenderId
    ? lenderById.get(p.selectedLenderId)
    : undefined;
  const selectedLenderDisplay = trimStr(selected?.company);

  const targetCloseDisplay =
    fmtTableDate(p.targetCloseDate) ||
    trimStr(
      intake?.cover != null
        ? (intake.cover as { estCOE?: unknown }).estCOE
        : undefined,
    ) ||
    "";

  const netToUserDisplay = fmtTableNet(p.netToUser);

  const crit = p.scenarioCriteria;
  const cm = parseClientMomentum(p.clientMomentum);
  const searchText = [
    p.fileName,
    p.status,
    buildSourceLabel(intake),
    subjectAddressDisplay,
    fundingTypeDisplay,
    fundingProgramDisplay,
    purchaseRefiDisplay,
    String(fileFundingAmount),
    selectedLenderDisplay,
    p.notes,
    p.scenario,
    p.propertyAddress,
    trimStr(p.assigneeId),
    ...(cm !== undefined
      ? [String(cm), "★".repeat(cm)]
      : ["unrated", "not rated", "client confidence"]),
    trimStr(crit?.fundingTypeLabel),
    trimStr(crit?.transactionType),
    trimStr(crit?.propertyTypeLabel),
    trimStr(crit?.state),
    trimStr(crit?.industry),
    trimStr(intake?.fundingType),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return {
    ...listFields,
    /** Always the live file-derived amount (not `pipeline.fundingAmount` alone). */
    fundingAmount: fileFundingAmount,
    intakeSheetId: p.intakeSheetId,
    scenarioCriteria: p.scenarioCriteria,
    selectedLenderId: p.selectedLenderId,
    selectedLenderSentAt: p.selectedLenderSentAt,
    targetCloseDate: p.targetCloseDate,
    sourceLabel: buildSourceLabel(intake),
    subjectAddressDisplay,
    fundingTypeDisplay,
    fundingProgramDisplay,
    purchaseRefiDisplay,
    selectedLenderDisplay,
    selectedLenderSentDisplay: fmtTableDate(p.selectedLenderSentAt),
    targetCloseDisplay,
    fundingAmountDisplay: fmtTableMoney(fileFundingAmount),
    netToUserDisplay,
    notesDisplay: trimStr(p.notes),
    searchText,
    hasEmbeddedDealData: embeddedDealPayloadIsSubstantive(p.dealData),
  };
}

/**
 * Pipeline list + joined intake + selected lender labels for the table/board.
 * Prefer this over `listLight` on the pipeline page so columns stay in sync
 * with intake; other callers keep using `listLight` for a slimmer payload.
 */
export const listTablePreview = query({
  args: {
    includeArchived: v.optional(v.boolean()),
    includeSnoozed: v.optional(v.boolean()),
    ...orgListScopeArgs,
  },
  handler: async (ctx, { includeArchived, includeSnoozed, organizationId, memberUserKey }) => {
    await assertOrgScopeArgs(ctx, organizationId, memberUserKey);
    const now = Date.now();
    const rows = await ctx.db.query("pipeline").order("desc").collect();
    const filtered = rows.filter((r) => {
      if (!includeArchived && r.archivedAt != null) return false;
      if (!includeSnoozed && pipelineIsCurrentlySnoozed(r.snoozedUntil, now)) {
        return false;
      }
      return true;
    });
    const god = await sessionKeyIsGlobalAdmin(ctx, memberUserKey);
    const scoped = god ? filtered : filterPipelineByOrgScope(filtered, organizationId);
    const visible = await filterPipelineRowsForMember(
      ctx,
      scoped,
      organizationId,
      memberUserKey,
    );
    const intakeIds = new Set<Id<"intakeSheets">>();
    const lenderIds = new Set<Id<"lenders">>();
    const fileIdSet = new Set(visible.map((r) => String(r._id)));
    const orgStr = String(organizationId);
    for (const r of visible) {
      if (r.intakeSheetId) intakeIds.add(r.intakeSheetId);
      if (r.selectedLenderId) lenderIds.add(r.selectedLenderId);
      for (const lid of r.lenders ?? []) lenderIds.add(lid);
    }
    const fileLenderEdgesByFile = new Map<string, Doc<"fileLenders">[]>();
    const allFileLenders = (await ctx.db.query("fileLenders").collect()).filter(
      (edge) =>
        fileIdSet.has(String(edge.fileId)) &&
        String(edge.organizationId) === orgStr,
    );
    for (const edge of allFileLenders) {
      const key = String(edge.fileId);
      const bucket = fileLenderEdgesByFile.get(key) ?? [];
      bucket.push(edge);
      fileLenderEdgesByFile.set(key, bucket);
      lenderIds.add(edge.lenderId);
    }
    const intakeDocs = await Promise.all(
      [...intakeIds].map((id) => ctx.db.get(id)),
    );
    const intakeById = new Map(
      intakeDocs
        .filter((d): d is Doc<"intakeSheets"> => d != null)
        .map((d) => [d._id, d]),
    );
    const lenderDocs = await Promise.all(
      [...lenderIds].map((id) => ctx.db.get(id)),
    );
    const lenderById = new Map(
      lenderDocs
        .filter((d): d is Doc<"lenders"> => d != null)
        .map((d) => [d._id, d]),
    );
    const lenderLabelById = new Map<string, string>();
    for (const [id, doc] of lenderById) {
      lenderLabelById.set(
        String(id),
        doc.company?.trim() || doc.contactName?.trim() || "Lender",
      );
    }
    const editAccess = await Promise.all(
      visible.map((row) =>
        resolveOrgPipelineFileAccessLevel(ctx, row, memberUserKey),
      ),
    );
    const ownershipRows = await Promise.all(
      visible.map((p) =>
        buildPipelineOwnershipPresentation(ctx, p, memberUserKey),
      ),
    );
    const hierarchyRows = await Promise.all(
      visible.map((p) => safeResolveFileHierarchy(ctx, p)),
    );
    const projectIds = [
      ...new Set(
        visible
          .map((p) => p.projectId)
          .filter((id): id is Id<"projects"> => id != null),
      ),
    ];
    const clientIds = [
      ...new Set(
        visible
          .map((p) => p.clientId)
          .filter((id): id is Id<"clients"> => id != null),
      ),
    ];
    const projectTitleById = new Map<string, string>();
    const projectLinkedById = new Map<
      string,
      Awaited<ReturnType<typeof resolveProjectLinkedClients>>
    >();
    await Promise.all(
      projectIds.map(async (pid) => {
        const project = await ctx.db.get(pid);
        if (!project) return;
        const title = project.title?.trim();
        if (title) projectTitleById.set(String(pid), title);
        projectLinkedById.set(
          String(pid),
          await resolveProjectLinkedClients(ctx, project),
        );
      }),
    );
    const clientLabelById = new Map<string, string>();
    await Promise.all(
      clientIds.map(async (cid) => {
        const client = await ctx.db.get(cid);
        if (!client) return;
        const label =
          client.displayName?.trim() ||
          client.companyName?.trim() ||
          client.primaryContactName?.trim() ||
          client.normalizedName?.trim() ||
          "";
        if (label) clientLabelById.set(String(cid), label);
      }),
    );
    const capitalRollupByProject = await batchCapitalRollupsForProjects(
      ctx,
      projectIds,
    );
    const fileNoteCounts = await batchPipelineFileNoteCounts(ctx, visible);
    const graphLinksByFile = await batchGraphLinksForPipelineFiles(
      ctx,
      visible,
      organizationId,
      visible.map((p, i) => {
        const h = hierarchyRows[i]!;
        return {
          fileId: p._id,
          linkedFromHierarchy: h.linkedClients.map((c) => ({
            clientId: String(c.clientId),
            displayName: c.displayName,
            relationshipType: c.relationshipType,
          })),
          clientDisplayName:
            h.client.kind === "record"
              ? h.client.displayName
              : h.client.displayName,
          projectDisplayTitle:
            h.project.kind === "record" ? h.project.title : h.project.title,
        };
      }),
    );
    return visible.map((p, i) => {
      const h = hierarchyRows[i]!;
      const intake = resolveDealPayloadForPreview(p, intakeById);
      const graphLinks = graphLinksByFile.get(String(p._id));
      const clientDisplayName = resolveTableRowClientDisplayName({
        hierarchy: h,
        intake,
        pipeline: p,
        graphLinks,
        clientRecordLabel: p.clientId
          ? clientLabelById.get(String(p.clientId))
          : undefined,
      });
      const projectDisplayTitle = resolveTableRowProjectDisplayTitle({
        hierarchy: h,
        intake,
        pipeline: p,
        graphLinks,
        projectRecordTitle: p.projectId
          ? projectTitleById.get(String(p.projectId))
          : undefined,
      });
      const fileLenderEdges = fileLenderEdgesByFile.get(String(p._id)) ?? [];
      const primaryLender = resolvePrimaryTableLender({
        selectedLenderId: p.selectedLenderId,
        pipelineLenderIds: p.lenders ?? [],
        edges: fileLenderEdges.map((e) => ({
          lenderId: e.lenderId,
          relationshipType: e.relationshipType,
          createdAt: e.createdAt,
        })),
        lenderLabelById,
      });
      const previewCore = buildTablePreviewRow(p, intake, lenderById);
      return {
        ...previewCore,
        searchText: [
          previewCore.searchText,
          clientDisplayName,
          projectDisplayTitle,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase(),
        primaryLender,
        canEditFile: editAccess[i] === "edit",
        ownership: ownershipRows[i],
        clientId: p.clientId,
        projectId: p.projectId,
        clientDisplayName,
        projectDisplayTitle,
        linkedClients: h.linkedClients,
        projectLinkedClients: p.projectId
          ? (projectLinkedById.get(String(p.projectId)) ?? [])
          : [],
        projectCapitalRollup: p.projectId
          ? capitalRollupByProject.get(String(p.projectId))
          : undefined,
        graphLinks,
        fileNotesCount: fileNoteCounts.get(String(p._id)) ?? 0,
      };
    });
  },
});

/**
 * Rows with a given pipeline stage (via `by_status` index).
 */
export const getByStatus = query({
  args: { status: v.string(), ...orgListScopeArgs },
  handler: async (ctx, { status, organizationId, memberUserKey }) => {
    await assertOrgScopeArgs(ctx, organizationId, memberUserKey);
    const rows = await ctx.db
      .query("pipeline")
      .withIndex("by_status", (q) => q.eq("status", status))
      .order("desc")
      .collect();
    const god = await sessionKeyIsGlobalAdmin(ctx, memberUserKey);
    const scoped = god ? rows : filterPipelineByOrgScope(rows, organizationId);
    return await filterPipelineRowsForMember(
      ctx,
      scoped,
      organizationId,
      memberUserKey,
    );
  },
});

/**
 * One pipeline row by id, or `null` if missing.
 */
export const getById = query({
  args: { id: v.id("pipeline"), ...memberUserKeyArg },
  handler: async (ctx, { id, memberUserKey }) => {
    const row = await ctx.db.get(id);
    if (!row) return null;
    await assertCanReadPipelineRow(ctx, row, memberUserKey);
    return row;
  },
});

/**
 * Intake-shaped document for the deal editor. Resolves **`sheet`** from
 * substantive embedded `pipeline.dealData` and/or linked `intakeSheets` —
 * **whichever snapshot has the later `updatedAt` / `_creationTime`**
 * (same rule as `listTablePreview`) so the workspace matches the latest saved
 * funding and deal fields. The linked row stays in sync via `patchDeal` /
 * `intakeSheets.patch`.
 */
export const getDealForEditor = query({
  args: { fileId: v.id("pipeline"), ...memberUserKeyArg },
  handler: async (ctx, { fileId, memberUserKey }) => {
    const p = await ctx.db.get(fileId);
    if (!p) return null;
    await assertCanReadPipelineRow(ctx, p, memberUserKey);
    const linked =
      p.intakeSheetId != null ? await ctx.db.get(p.intakeSheetId) : null;
    const embedded = embeddedDealPayloadIsSubstantive(p.dealData)
      ? (p.dealData as Doc<"intakeSheets">)
      : null;
    const sheet = pickIntakeShapedPreviewPayload(
      embedded,
      linked,
      p.updatedAt,
    );
    return { pipeline: p, sheet };
  },
});

function inferClientProjectFromFileName(fileName: string): {
  clientName: string;
  projectName: string;
} {
  const trimmed = fileName.trim();
  if (!trimmed) {
    return { clientName: "Borrower", projectName: "Project" };
  }
  const parts = trimmed.split(/\s+[–—-]\s+/);
  if (parts.length >= 2) {
    return {
      clientName: parts[0]!.trim() || "Borrower",
      projectName: parts.slice(1).join(" – ").trim() || "Project",
    };
  }
  return { clientName: trimmed, projectName: "Project" };
}

/**
 * Materializes `pipeline.dealData` when missing: copies a linked legacy
 * `intakeSheets` row into the file, or seeds a blank intake-shaped document.
 * After this runs, the deal editor reads a single embedded source (`dealData`)
 * while optional `intakeSheetId` remains only for legacy share-link rows.
 */
export const initDealDataIfMissing = mutation({
  args: { fileId: v.id("pipeline"), ...preferencesAccountIdArg },
  handler: async (ctx, { fileId, preferencesAccountId }) => {
    const p = await ctx.db.get(fileId);
    if (!p) throw new Error("Pipeline not found");
    await assertCanMutatePipelineRow(ctx, p, preferencesAccountId);
    if (embeddedDealPayloadIsSubstantive(p.dealData)) {
      return;
    }
    const now = Date.now();
    if (p.intakeSheetId) {
      const leg = await ctx.db.get(p.intakeSheetId);
      if (!leg) throw new Error("Linked intake not found");
      const dealData = {
        ...intakeRowToDealPayload(leg),
        updatedAt: now,
      };
      await ctx.db.patch(fileId, { dealData, updatedAt: now });
      await refreshPipelineGlobalSearchText(ctx, fileId);
      return;
    }
    const { clientName, projectName } = inferClientProjectFromFileName(p.fileName);
    const dealData = buildInitialIntakeDocument({
      clientName,
      projectName,
      fileName: p.fileName.trim() || undefined,
    });
    await ctx.db.patch(fileId, { dealData, updatedAt: now });
    await refreshPipelineGlobalSearchText(ctx, fileId);
  },
});

/**
 * Merge intake-shaped `changes` into `pipeline.dealData`.
 * When `dealData` is still empty but `intakeSheetId` is set, the base document
 * is the linked intake row — the merged result is written to `dealData`
 * (materialized) and the same `changes` are patched onto the intake row so
 * share links and the library stay consistent.
 */
export const patchDeal = mutation({
  args: {
    fileId: v.id("pipeline"),
    changes: intakePatchableChangesValidator,
    expectedUpdatedAt: v.optional(v.number()),
    ...preferencesAccountIdArg,
  },
  handler: async (ctx, { fileId, changes, preferencesAccountId, expectedUpdatedAt }) => {
    const p = await ctx.db.get(fileId);
    if (!p) throw new Error("Pipeline not found");
    if (
      expectedUpdatedAt !== undefined &&
      p.updatedAt !== expectedUpdatedAt
    ) {
      return {
        ok: false as const,
        code: "CONFLICT_DATA_CHANGED" as const,
        serverUpdatedAt: p.updatedAt,
      };
    }
    await assertCanMutatePipelineRow(ctx, p, preferencesAccountId);
    const cleaned: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(changes)) {
      if (val !== undefined) cleaned[k] = val;
    }
    if (typeof cleaned.fundingType === "string") {
      cleaned.fundingType = cleaned.fundingType.trim().slice(0, 120);
    }
    if (Object.keys(cleaned).length === 0) return { ok: true as const };

    const deal = await resolveDealBaseForPipelinePatch(ctx, p);
    if (cleaned.cover != null) {
      const mergedCover = mergePartialCoverOnPatch(deal.cover, cleaned.cover);
      if (mergedCover !== undefined) cleaned.cover = mergedCover;
    }
    if (cleaned.subjectProperty != null) {
      const mergedSp = mergePartialSubjectPropertyOnPatch(
        deal.subjectProperty,
        cleaned.subjectProperty,
      );
      if (mergedSp !== undefined) cleaned.subjectProperty = mergedSp;
    }
    const mergedDeal = mergePatchIntoDeal(deal, {
      ...cleaned,
      updatedAt: Date.now(),
    }) as Record<string, unknown>;
    const now = Date.now();
    const trimmedDealFileName =
      typeof cleaned.fileName === "string" ? cleaned.fileName.trim() : "";
    const patchBody: Partial<Doc<"pipeline">> = {
      dealData: mergedDeal as Doc<"pipeline">["dealData"],
      updatedAt: now,
      ...(trimmedDealFileName ? { fileName: trimmedDealFileName } : {}),
    };
    const derivedLoan = derivePrimaryFundingAmountFromDealPayload(mergedDeal);
    const coverPatch = cleaned.cover;
    const coverFundingKeysTouched =
      coverPatch != null &&
      typeof coverPatch === "object" &&
      !Array.isArray(coverPatch) &&
      "fundingAmount" in coverPatch;
    if (
      derivedLoan != null &&
      Number.isFinite(derivedLoan) &&
      derivedLoan >= 0 &&
      derivedLoan !== p.fundingAmount
    ) {
      appendPctFeeRecomputeForLoanChange(p, patchBody, derivedLoan, { now });
    } else if (
      coverFundingKeysTouched &&
      (derivedLoan == null || !Number.isFinite(derivedLoan)) &&
      p.fundingAmount !== 0
    ) {
      /** Cleared coversheet funding with no other deal amount — keep `pipeline.fundingAmount` aligned. */
      appendPctFeeRecomputeForLoanChange(p, patchBody, 0, { now });
    }
    await ctx.db.patch(
      fileId,
      sanitizeDbPatch(patchBody as unknown as Record<string, unknown>) as Partial<
        Doc<"pipeline">
      >,
    );

    const dealKeys = Object.keys(cleaned).slice(0, 40);
    await appendPipelineFileActivity(ctx, {
      fileId,
      at: now,
      kind: "deal_patch",
      keys: dealKeys.length ? dealKeys : undefined,
      summary: clampActivitySummary(
        dealKeys.length ? `Deal: ${dealKeys.slice(0, 12).join(", ")}` : undefined,
      ),
    });

    if (p.intakeSheetId) {
      const intakeRow = await ctx.db.get(p.intakeSheetId);
      if (intakeRow) {
        const intakeUpdate: Record<string, unknown> = {
          ...cleaned,
          updatedAt: Date.now(),
        };
        if (cleaned.cover != null) {
          const mergedIntakeCover = mergePartialCoverOnPatch(
            intakeRow.cover,
            cleaned.cover,
          );
          if (mergedIntakeCover !== undefined) {
            intakeUpdate.cover = mergedIntakeCover;
          }
        }
        if (cleaned.subjectProperty != null) {
          const mergedIntakeSp = mergePartialSubjectPropertyOnPatch(
            intakeRow.subjectProperty,
            cleaned.subjectProperty,
          );
          if (mergedIntakeSp !== undefined) {
            intakeUpdate.subjectProperty = mergedIntakeSp;
          }
        }
        await ctx.db.patch(
          p.intakeSheetId,
          sanitizeDbPatch(intakeUpdate) as Partial<Doc<"intakeSheets">>,
        );
      }
    }

    const afterDeal = await ctx.db.get(fileId);
    if (afterDeal && dealKeys.length > 0) {
      const watchers = collectPipelineWatcherUserKeys(
        afterDeal,
        preferencesAccountId,
      );
      const label = `Deal updated on “${afterDeal.fileName.trim()}”`;
      const detail = dealKeys.join(", ");
      for (const w of watchers) {
        await dispatchUserNotification(ctx, {
          userKey: w,
          category: "file_update",
          summary: label,
          detail,
          actorUserKey: preferencesAccountId,
          fileId,
        });
      }
    }

    if (p.organizationId && dealKeys.length > 0) {
      scheduleOrgPipelineWebhook(
        ctx,
        p.organizationId,
        "pipeline.file.updated",
        fileId,
        {
          changedKeys: dealKeys.map((k) => `dealData.${k}`),
        },
      );
    }

    await refreshPipelineGlobalSearchText(ctx, fileId);
    const fundingTouched =
      coverFundingKeysTouched ||
      (derivedLoan != null &&
        Number.isFinite(derivedLoan) &&
        derivedLoan >= 0 &&
        derivedLoan !== p.fundingAmount);
    if (fundingTouched && p.projectId) {
      await syncCapitalSourcesFromProjectLoans(ctx, p.projectId);
    }
    return { ok: true as const };
  },
});

/**
 * Creates a pipeline file with embedded `dealData` (no separate intake row).
 * Used by the "New file" flow so the file is the single store for deal detail.
 */
export const createFileWithDeal = mutation({
  args: {
    fileName: v.string(),
    status: v.string(),
    fundingAmount: v.float64(),
    rate: v.float64(),
    term: v.string(),
    propertyAddress: v.optional(v.string()),
    lenders: v.array(v.id("lenders")),
    contacts: v.array(contactItem),
    clientName: v.string(),
    projectName: v.string(),
    /** When set, file is scoped to this org (requires `preferencesAccountId` as a member). */
    organizationId: v.optional(v.id("organizations")),
    /** Optional catalog template id (`lib/pipelineFileTemplates.ts`). Omit to use account new-file drawer prefs only. */
    catalogFileTemplateId: v.optional(v.string()),
    /** Optional account-owned template (`pipelineFileUserTemplates`). Mutually exclusive with `catalogFileTemplateId`. */
    userPipelineFileTemplateId: v.optional(v.id("pipelineFileUserTemplates")),
    ...pipelineHierarchyFkArgs,
    ...preferencesAccountIdArg,
  },
  handler: async (ctx, args) => {
    const trimmedClient = args.clientName.trim();
    const trimmedProject = args.projectName.trim();
    if (!trimmedClient) throw new Error("Client name is required");
    if (!trimmedProject) throw new Error("Project name is required");
    const resolvedFunding = args.fundingAmount;
    if (!Number.isFinite(resolvedFunding) || resolvedFunding < 0) {
      throw new Error("Provide a non-negative fundingAmount.");
    }
    if (args.organizationId) {
      const key = args.preferencesAccountId?.trim();
      if (!key) {
        throw new Error(
          "preferencesAccountId is required when creating an organization-scoped file.",
        );
      }
      await assertOrgMember(ctx, args.organizationId, key);
    }
    await assertCanAddOrgPipelineFile(ctx, args.organizationId);
    const orgAttachFileStub = {
      organizationId: args.organizationId,
    } as Doc<"pipeline">;
    for (const lid of args.lenders) {
      const l = await ctx.db.get(lid);
      if (!l) throw new Error(`Lender not found: ${lid}`);
      assertLenderAttachableToPipeline(l, orgAttachFileStub);
    }
    const dealData = buildInitialIntakeDocument({
      clientName: trimmedClient,
      projectName: trimmedProject,
      fileName: args.fileName.trim() || undefined,
    });
    const now = Date.now();
    const body = normalizePipelineFields({
      fileName: args.fileName.trim() || `${trimmedClient} – ${trimmedProject}`,
      status: args.status,
      fundingAmount: resolvedFunding,
      rate: args.rate,
      term: args.term,
      propertyAddress: args.propertyAddress,
      notes: undefined,
      lenders: args.lenders,
      contacts: args.contacts,
    });
    const metrics = buildNewFilePipelineMetricsContext({
      body,
      dealData,
      intakeSheetId: undefined,
    });
    const drawerUnscoped = await resolveNewFileDrawerLayout(
      ctx,
      args.preferencesAccountId,
      metrics,
      {
        catalogFileTemplateId: args.catalogFileTemplateId,
        userPipelineFileTemplateId: args.userPipelineFileTemplateId,
      },
    );
    const drawer = await finalizeDrawerLayoutRespectingOrgPlan(
      ctx,
      args.organizationId,
      drawerUnscoped,
    );
    const hierarchyFks = await resolvePipelineHierarchyForCreate(ctx, {
      organizationId: args.organizationId,
      clientId: args.clientId,
      projectId: args.projectId,
      allowLegacyHierarchyBypass: args.allowLegacyHierarchyBypass,
    });
    const id = await ctx.db.insert("pipeline", {
      ...body,
      dealData,
      intakeSheetId: undefined,
      organizationId: args.organizationId,
      ...hierarchyFks,
      ...ownerFieldsForOrgCreate(args.organizationId, args.preferencesAccountId),
      fileDrawerLayout: {
        v: 1,
        ...layoutToDbFields(drawer),
      },
      fileSharedState: serializeFileSharedStateStorage(
        normalizeFileSharedStateFromPipeline({
          fundingAmount: body.fundingAmount,
          rate: body.rate,
          term: body.term,
          notes: body.notes,
          updatedAt: now,
          fileSharedState: undefined,
        }),
        now
      ),
      createdAt: now,
      updatedAt: now,
    });
    if (hierarchyFks.clientId) {
      // Bidirectional integrity: mirror the FK into the loanClients junction
      // so the client workspace tree picks the file up immediately.
      const inserted = await ctx.db.get(id);
      if (inserted) {
        await ensurePrimaryLoanClientLink(ctx, inserted);
      }
    }
    await appendPipelineFileActivity(ctx, {
      fileId: id,
      at: now,
      kind: "file_created",
      summary: clampActivitySummary(`Created “${body.fileName}”`),
    });
    await runUserSimpleWorkflows({
      ctx,
      accountId: args.preferencesAccountId,
      fileId: id,
      event: { type: "file_created" },
      now,
    });
    await refreshPipelineGlobalSearchText(ctx, id);
    scheduleOrgPipelineWebhook(
      ctx,
      args.organizationId,
      "pipeline.file.created",
      id,
    );
    return { id };
  },
});

/**
 * Inserts an org-scoped pipeline file for the removable demo workspace bundle.
 * Leaves `ownerUserKey` unset so teammates with `files.delete` can remove demo files.
 * Skips user workflow hooks and outbound webhooks.
 */
export async function insertDemoWorkspacePipelineFile(
  ctx: MutationCtx,
  args: {
    organizationId: Id<"organizations">;
    memberUserKey: string;
    preferencesAccountId: string | undefined;
    demoBundleId: string;
    fileName: string;
    status: string;
    fundingAmount: number;
    rate: number;
    term: string;
    propertyAddress?: string;
    lenders: Id<"lenders">[];
    contacts: Array<{
      name: string;
      email?: string;
      phone?: string;
      company?: string;
    }>;
    clientName: string;
    projectName: string;
    clientId?: Id<"clients">;
    projectId?: Id<"projects">;
    allowLegacyHierarchyBypass?: boolean;
    catalogFileTemplateId?: string;
    userPipelineFileTemplateId?: Id<"pipelineFileUserTemplates">;
  },
): Promise<Id<"pipeline">> {
  const trimmedClient = args.clientName.trim();
  const trimmedProject = args.projectName.trim();
  if (!trimmedClient) throw new Error("Client name is required");
  if (!trimmedProject) throw new Error("Project name is required");
  const resolvedFunding = args.fundingAmount;
  if (!Number.isFinite(resolvedFunding) || resolvedFunding < 0) {
    throw new Error("Provide a non-negative fundingAmount.");
  }
  await assertOrgMember(ctx, args.organizationId, args.memberUserKey);
  await assertCanAddOrgPipelineFile(ctx, args.organizationId);
  const orgAttachFileStub = {
    organizationId: args.organizationId,
  } as Doc<"pipeline">;
  for (const lid of args.lenders) {
    const l = await ctx.db.get(lid);
    if (!l) throw new Error(`Lender not found: ${lid}`);
    assertLenderAttachableToPipeline(l, orgAttachFileStub);
  }
  const dealData = buildInitialIntakeDocument({
    clientName: trimmedClient,
    projectName: trimmedProject,
    fileName: args.fileName.trim() || undefined,
  });
  const now = Date.now();
  const body = normalizePipelineFields({
    fileName: args.fileName.trim() || `${trimmedClient} – ${trimmedProject}`,
    status: args.status,
    fundingAmount: resolvedFunding,
    rate: args.rate,
    term: args.term,
    propertyAddress: args.propertyAddress,
    notes: undefined,
    lenders: args.lenders,
    contacts: args.contacts,
  });
  const metrics = buildNewFilePipelineMetricsContext({
    body,
    dealData,
    intakeSheetId: undefined,
  });
  const drawerUnscoped = await resolveNewFileDrawerLayout(
    ctx,
    args.preferencesAccountId,
    metrics,
    {
      catalogFileTemplateId: args.catalogFileTemplateId,
      userPipelineFileTemplateId: args.userPipelineFileTemplateId,
    },
  );
  const drawer = await finalizeDrawerLayoutRespectingOrgPlan(
    ctx,
    args.organizationId,
    drawerUnscoped,
  );
  const hierarchyFks = await resolvePipelineHierarchyForCreate(ctx, {
    organizationId: args.organizationId,
    clientId: args.clientId,
    projectId: args.projectId,
    allowLegacyHierarchyBypass: args.allowLegacyHierarchyBypass ?? true,
  });
  const id = await ctx.db.insert("pipeline", {
    ...body,
    dealData,
    intakeSheetId: undefined,
    ...hierarchyFks,
    organizationId: args.organizationId,
    ownerUserKey: undefined,
    demoBundleId: args.demoBundleId,
    fileDrawerLayout: {
      v: 1,
      ...layoutToDbFields(drawer),
    },
    fileSharedState: serializeFileSharedStateStorage(
      normalizeFileSharedStateFromPipeline({
        fundingAmount: body.fundingAmount,
        rate: body.rate,
        term: body.term,
        notes: body.notes,
        updatedAt: now,
        fileSharedState: undefined,
      }),
      now,
    ),
    createdAt: now,
    updatedAt: now,
  });
  await appendPipelineFileActivity(ctx, {
    fileId: id,
    at: now,
    kind: "file_created",
    summary: clampActivitySummary(`Created “${body.fileName}”`),
  });
  await refreshPipelineGlobalSearchText(ctx, id);
  return id;
}

/**
 * Promotes a standalone `intakeSheets` row into a pipeline file: embedded
 * `dealData` is a full copy of the sheet and `intakeSheetId` is set so legacy
 * share links keep working. Clears any stale `intakeSheetId` on other files
 * pointing at the same row (same rule as `pipeline.create`).
 */
export const createFileFromIntakeSheet = mutation({
  args: {
    intakeSheetId: v.id("intakeSheets"),
    organizationId: v.optional(v.id("organizations")),
    ...pipelineHierarchyFkArgs,
    ...preferencesAccountIdArg,
  },
  handler: async (ctx, {
    intakeSheetId,
    organizationId,
    preferencesAccountId,
    clientId,
    projectId,
    allowLegacyHierarchyBypass,
  }) => {
    const sheet = await ctx.db.get(intakeSheetId);
    if (!sheet) throw new Error("Intake sheet not found");
    if (organizationId) {
      const key = preferencesAccountId?.trim();
      if (!key) {
        throw new Error(
          "preferencesAccountId is required when creating an organization-scoped file.",
        );
      }
      await assertOrgMember(ctx, organizationId, key);
    }
    await assertCanAddOrgPipelineFile(ctx, organizationId);
    const now = Date.now();
    const prior = await ctx.db
      .query("pipeline")
      .withIndex("by_intakeSheetId", (q) =>
        q.eq("intakeSheetId", intakeSheetId)
      )
      .collect();
    for (const row of prior) {
      await ctx.db.patch(row._id, {
        intakeSheetId: undefined,
        updatedAt: now,
      });
    }
    const displayName =
      sheet.fileName?.trim() ||
      `${sheet.clientName.trim()} – ${sheet.projectName.trim()}`;
    const dealData = {
      ...intakeRowToDealPayload(sheet),
      updatedAt: now,
    };
    const body = normalizePipelineFields({
      fileName: displayName,
      status: "confirm_interest",
      fundingAmount: 0,
      rate: 0,
      term: "",
      propertyAddress: undefined,
      lenders: [],
      contacts: [],
    });
    const metrics = buildNewFilePipelineMetricsContext({
      body,
      dealData,
      intakeSheetId,
      dealSheet: sheet,
    });
    const drawerUnscoped = await resolveNewFileDrawerLayout(
      ctx,
      preferencesAccountId,
      metrics,
    );
    const drawer = await finalizeDrawerLayoutRespectingOrgPlan(
      ctx,
      organizationId,
      drawerUnscoped,
    );
    const hierarchyFks = await resolvePipelineHierarchyForCreate(ctx, {
      organizationId,
      clientId,
      projectId,
      allowLegacyHierarchyBypass,
    });
    const id = await ctx.db.insert("pipeline", {
      ...body,
      dealData,
      intakeSheetId,
      organizationId,
      ...hierarchyFks,
      ...ownerFieldsForOrgCreate(organizationId, preferencesAccountId),
      fileDrawerLayout: {
        v: 1,
        ...layoutToDbFields(drawer),
      },
      fileSharedState: serializeFileSharedStateStorage(
        normalizeFileSharedStateFromPipeline({
          fundingAmount: body.fundingAmount,
          rate: body.rate,
          term: body.term,
          notes: body.notes,
          updatedAt: now,
          fileSharedState: undefined,
        }),
        now
      ),
      createdAt: now,
      updatedAt: now,
    });
    await appendPipelineFileActivity(ctx, {
      fileId: id,
      at: now,
      kind: "file_created",
      summary: clampActivitySummary(`Created “${body.fileName}” from intake`),
    });
    await runUserSimpleWorkflows({
      ctx,
      accountId: preferencesAccountId,
      fileId: id,
      event: { type: "file_created" },
      now,
    });
    await refreshPipelineGlobalSearchText(ctx, id);
    scheduleOrgPipelineWebhook(
      ctx,
      organizationId,
      "pipeline.file.created",
      id,
    );
    return { id };
  },
});

/**
 * The pipeline file (if any) that links to this intake sheet. When multiple
 * rows point at the same intake (rare), returns the most recently updated.
 */
export const getIdForIntakeSheet = query({
  args: { intakeSheetId: v.id("intakeSheets") },
  handler: async (ctx, { intakeSheetId }) => {
    const rows = await ctx.db
      .query("pipeline")
      .withIndex("by_intakeSheetId", (q) =>
        q.eq("intakeSheetId", intakeSheetId)
      )
      .collect();
    if (rows.length === 0) return null;
    rows.sort((a, b) => b.updatedAt - a.updatedAt);
    return rows[0]._id;
  },
});

// ---------- Mutations ----------

function normalizePipelineFields(
  args: Record<string, unknown>
): Omit<Doc<"pipeline">, "_id" | "_creationTime" | "createdAt" | "updatedAt"> {
  const a = args as {
    fileName: string;
    status: string;
    fundingAmount: number;
    rate: number;
    term: string;
    propertyAddress?: string;
    notes?: string;
    lenders: Id<"lenders">[];
    contacts: Array<{
      name: string;
      email?: string;
      phone?: string;
      company?: string;
    }>;
    lenderFee?: number;
    lenderFeePct?: number;
    lenderFeeOutside?: number;
    brokerGross?: number;
    brokerGrossPct?: number;
    brokerGrossOutside?: number;
    splits?: Array<{ name: string; amount: number; reason?: string }>;
    netToUser?: number;
    netToUserPct?: number;
    netToUserOutside?: number;
    scenario?: string;
    scenarioCriteria?: ScenarioCriteriaInput;
    termOptions?: Array<{
      rate: string;
      term: string;
      prepaymentPenalty: string;
      notes: string;
      appraisalRequired?: boolean;
      newLoanAmount?: string;
      fundingTimeframe?: string;
      qualifyingIncomeType?: string;
      includeQualifyingIncomeAmount?: boolean;
      qualifyingIncomeAmount?: string;
    }>;
    assigneeId?: string;
    sharedWithIds?: string[];
    commission?: number;
    netRevenue?: number;
  };
  return {
    fileName: a.fileName.trim() || "Untitled",
    status: a.status.trim() || "Unknown",
    fundingAmount: a.fundingAmount,
    rate: a.rate,
    term: a.term.trim() || "",
    propertyAddress: a.propertyAddress?.trim() || undefined,
    notes: a.notes?.trim() || undefined,
    lenders: a.lenders,
    contacts: a.contacts.map((c) => ({
      name: c.name.trim() || "Unknown",
      email: c.email?.trim() || undefined,
      phone: c.phone?.trim() || undefined,
      company: c.company?.trim() || undefined,
    })),
    lenderFee: a.lenderFee,
    lenderFeePct: a.lenderFeePct,
    lenderFeeOutside: a.lenderFeeOutside,
    brokerGross: a.brokerGross,
    brokerGrossPct: a.brokerGrossPct,
    brokerGrossOutside: a.brokerGrossOutside,
    splits: a.splits,
    netToUser: a.netToUser,
    netToUserPct: a.netToUserPct,
    netToUserOutside: a.netToUserOutside,
    scenario: a.scenario?.trim() || undefined,
    scenarioCriteria: normalizeScenarioCriteria(a.scenarioCriteria),
    termOptions: a.termOptions,
    assigneeId: a.assigneeId?.trim() || undefined,
    sharedWithIds:
      a.sharedWithIds && a.sharedWithIds.length > 0
        ? a.sharedWithIds
        : undefined,
    commission: a.commission,
    netRevenue: a.netRevenue,
  };
}

export const create = mutation({
  args: {
    ...pipelineInput,
    organizationId: v.optional(v.id("organizations")),
    ...pipelineHierarchyFkArgs,
    ...preferencesAccountIdArg,
  },
  handler: async (ctx, args) => {
    const {
      preferencesAccountId,
      organizationId,
      clientId,
      projectId,
      allowLegacyHierarchyBypass,
      ...createRest
    } = args;
    if (!createRest.fileName.trim()) {
      throw new Error("fileName is required");
    }
    const now = Date.now();
    if (createRest.intakeSheetId) {
      const sheet = await ctx.db.get(createRest.intakeSheetId);
      if (!sheet) throw new Error("Intake sheet not found");
      // At most one canonical link per intake (`getIdForIntakeSheet` assumes
      // this). Re-linking clears older rows so the new file wins.
      const prior = await ctx.db
        .query("pipeline")
        .withIndex("by_intakeSheetId", (q) =>
          q.eq("intakeSheetId", createRest.intakeSheetId!)
        )
        .collect();
      for (const row of prior) {
        await ctx.db.patch(row._id, {
          intakeSheetId: undefined,
          updatedAt: now,
        });
      }
    }
    if (organizationId) {
      const key = preferencesAccountId?.trim();
      if (!key) {
        throw new Error(
          "preferencesAccountId is required when creating an organization-scoped file.",
        );
      }
      await assertOrgMember(ctx, organizationId, key);
    }
    await assertCanAddOrgPipelineFile(ctx, organizationId);
    const orgAttachFileStub = {
      organizationId,
    } as Doc<"pipeline">;
    for (const lid of createRest.lenders) {
      const l = await ctx.db.get(lid);
      if (!l) {
        throw new Error(`Lender not found: ${lid}`);
      }
      assertLenderAttachableToPipeline(l, orgAttachFileStub);
    }
    const body = normalizePipelineFields(createRest);
    const metrics = buildNewFilePipelineMetricsContext({
      body,
      dealData: undefined,
      intakeSheetId: createRest.intakeSheetId,
    });
    const drawerUnscoped = await resolveNewFileDrawerLayout(
      ctx,
      preferencesAccountId,
      metrics,
    );
    const drawer = await finalizeDrawerLayoutRespectingOrgPlan(
      ctx,
      organizationId,
      drawerUnscoped,
    );
    const hierarchyFks = await resolvePipelineHierarchyForCreate(ctx, {
      organizationId,
      clientId,
      projectId,
      allowLegacyHierarchyBypass,
    });
    const id = await ctx.db.insert("pipeline", {
      ...body,
      intakeSheetId: createRest.intakeSheetId,
      organizationId,
      ...hierarchyFks,
      ...ownerFieldsForOrgCreate(organizationId, preferencesAccountId),
      fileDrawerLayout: {
        v: 1,
        ...layoutToDbFields(drawer),
      },
      fileSharedState: serializeFileSharedStateStorage(
        normalizeFileSharedStateFromPipeline({
          fundingAmount: body.fundingAmount,
          rate: body.rate,
          term: body.term,
          notes: body.notes,
          updatedAt: now,
          fileSharedState: undefined,
        }),
        now
      ),
      createdAt: now,
      updatedAt: now,
    });
    await appendPipelineFileActivity(ctx, {
      fileId: id,
      at: now,
      kind: "file_created",
      summary: clampActivitySummary(`Created “${body.fileName}”`),
    });
    await runUserSimpleWorkflows({
      ctx,
      accountId: preferencesAccountId,
      fileId: id,
      event: { type: "file_created" },
      now,
    });
    await refreshPipelineGlobalSearchText(ctx, id);
    scheduleOrgPipelineWebhook(
      ctx,
      organizationId,
      "pipeline.file.created",
      id,
    );
    return { id };
  },
});

export const update = mutation({
  args: { id: v.id("pipeline"), ...pipelineInput, ...preferencesAccountIdArg },
  handler: async (ctx, args) => {
    const { id, preferencesAccountId, ...rest } = args;
    if (!rest.fileName.trim()) {
      throw new Error("fileName is required");
    }
    const existing = await ctx.db.get(id);
    if (!existing) throw new Error("Pipeline not found");
    await assertCanMutatePipelineRow(ctx, existing, preferencesAccountId);
    for (const lid of rest.lenders) {
      const l = await ctx.db.get(lid);
      if (!l) {
        throw new Error(`Lender not found: ${lid}`);
      }
    }
    const now = Date.now();
    const body = normalizePipelineFields(rest);
    const merged = { ...existing, ...body } as Doc<"pipeline">;
    await ctx.db.patch(id, {
      ...body,
      fileSharedState: serializeFileSharedStateStorage(
        normalizeFileSharedStateFromPipeline(
          merged as unknown as PipelineFileSharedSource
        ),
        now
      ),
      createdAt: existing.createdAt,
      updatedAt: now,
    });
    await refreshPipelineGlobalSearchText(ctx, id);
    scheduleOrgPipelineWebhook(
      ctx,
      existing.organizationId,
      "pipeline.file.updated",
      id,
      { changedKeys: ["full_replace"] },
    );
    return { id };
  },
});

export const updateStatus = mutation({
  args: {
    id: v.id("pipeline"),
    status: v.string(),
    ...preferencesAccountIdArg,
  },
  handler: async (ctx, { id, status, preferencesAccountId }) => {
    const row = await ctx.db.get(id);
    if (!row) throw new Error("Pipeline not found");
    await assertCanMutatePipelineRow(ctx, row, preferencesAccountId);
    const next = status.trim() || "Unknown";
    const now = Date.now();
    const patchObj: Partial<Doc<"pipeline">> = {
      status: next,
      createdAt: row.createdAt,
      updatedAt: now,
    };
    // Once funded, the file leaves the forecast and joins the ledger
    // proper — clear the projection flag so we don't double-count.
    if (isPaidStatusLabel(next) && row.projectIntoLedger) {
      patchObj.projectIntoLedger = undefined;
    }
    await ctx.db.patch(id, patchObj);
    const ledgerId = await tryInsertLedgerWhenMarkedPaid(
      ctx,
      id,
      row,
      next,
      now
    );
    await refreshPipelineGlobalSearchText(ctx, id);
    if (row.organizationId && row.status !== next) {
      scheduleOrgPipelineWebhook(
        ctx,
        row.organizationId,
        "pipeline.file.status_changed",
        id,
        { previousStatus: row.status, nextStatus: next },
      );
    }
    return { id, ledgerId: ledgerId ?? undefined };
  },
});

/**
 * Partial update for inline editors. Each field is optional; any provided
 * field is normalized & patched. Fields that are not present are left as-is.
 *
 * Optional fields can be cleared by passing the explicit "clear" sentinels
 * (`null` / empty string / empty array) that map to `undefined` after
 * normalization.
 */
export const patch = mutation({
  args: {
    id: v.id("pipeline"),
    /**
     * When set, the mutation runs only if `pipeline.updatedAt` still matches.
     * Used for offline sync so concurrent edits never silently overwrite.
     */
    expectedUpdatedAt: v.optional(v.number()),
    /** Manual “lender sent” date (Unix ms). Clear with `null`. */
    selectedLenderSentAt: v.optional(v.union(v.float64(), v.null())),
    fileName: v.optional(v.string()),
    status: v.optional(v.string()),
    stageId: v.optional(v.union(v.id("organizationPipelineStages"), v.null())),
    subStageId: v.optional(
      v.union(v.id("organizationPipelineSubStages"), v.null()),
    ),
    fundingAmount: v.optional(v.number()),
    rate: v.optional(v.number()),
    term: v.optional(v.string()),
    propertyAddress: v.optional(v.union(v.string(), v.null())),
    notes: v.optional(v.union(v.string(), v.null())),
    commission: v.optional(v.number()),
    netRevenue: v.optional(v.number()),
    contacts: v.optional(v.array(contactItem)),
    lenderFee: v.optional(v.union(v.number(), v.null())),
    lenderFeePct: v.optional(v.union(v.number(), v.null())),
    lenderFeeOutside: v.optional(v.union(v.number(), v.null())),
    brokerGross: v.optional(v.union(v.number(), v.null())),
    brokerGrossPct: v.optional(v.union(v.number(), v.null())),
    brokerGrossOutside: v.optional(v.union(v.number(), v.null())),
    splits: v.optional(v.array(splitItem)),
    netToUser: v.optional(v.union(v.number(), v.null())),
    netToUserPct: v.optional(v.union(v.number(), v.null())),
    netToUserOutside: v.optional(v.union(v.number(), v.null())),
    scenario: v.optional(v.union(v.string(), v.null())),
    scenarioCriteria: v.optional(v.union(scenarioCriteriaItem, v.null())),
    termOptions: v.optional(v.array(termOptionItem)),
    assigneeId: v.optional(v.union(v.string(), v.null())),
    sharedWithIds: v.optional(v.array(v.string())),
    targetCloseDate: v.optional(v.union(v.float64(), v.null())),
    loNmls: v.optional(v.union(v.string(), v.null())),
    brokerNmls: v.optional(v.union(v.string(), v.null())),
    ...preferencesAccountIdArg,
  },
  handler: async (ctx, args) => {
    const { id, preferencesAccountId, expectedUpdatedAt, ...rest } = args;
    const existing = await ctx.db.get(id);
    if (!existing) throw new Error("Pipeline not found");
    if (
      expectedUpdatedAt !== undefined &&
      existing.updatedAt !== expectedUpdatedAt
    ) {
      throw new Error("CONFLICT_DATA_CHANGED");
    }
    await assertCanMutatePipelineRow(ctx, existing, preferencesAccountId);
    const now = Date.now();
    const patchObj: Partial<Doc<"pipeline">> = { updatedAt: now };
    let nextStatusForLedger: string | null = null;
    let stageAssignmentChanged = false;

    if (rest.fileName !== undefined) {
      const trimmed = rest.fileName.trim();
      if (!trimmed) throw new Error("fileName must not be empty");
      patchObj.fileName = trimmed;
    }
    if (rest.status !== undefined) {
      const next = rest.status.trim() || "Unknown";
      patchObj.status = next;
      nextStatusForLedger = next;
    }
    if (rest.stageId !== undefined) {
      const nextStageId =
        rest.stageId === null ? undefined : rest.stageId;
      if (nextStageId !== existing.stageId) {
        patchObj.stageId = nextStageId;
        stageAssignmentChanged = true;
      }
    }
    if (rest.subStageId !== undefined) {
      const nextSubStageId =
        rest.subStageId === null ? undefined : rest.subStageId;
      if (nextSubStageId !== existing.subStageId) {
        patchObj.subStageId = nextSubStageId;
        stageAssignmentChanged = true;
      }
    }
    if (rest.stageId !== undefined || rest.subStageId !== undefined) {
      const mergedStageId =
        rest.stageId !== undefined
          ? rest.stageId === null
            ? undefined
            : rest.stageId
          : existing.stageId;
      const mergedSubStageId =
        rest.subStageId !== undefined
          ? rest.subStageId === null
            ? undefined
            : rest.subStageId
          : existing.subStageId;
      const synced = await syncPipelineStatusFromStage(
        ctx,
        mergedStageId,
        mergedSubStageId,
      );
      if (synced && rest.status === undefined) {
        patchObj.status = synced;
        nextStatusForLedger = synced;
      }
    }
    if (rest.fundingAmount !== undefined) {
      if (!Number.isFinite(rest.fundingAmount) || rest.fundingAmount < 0) {
        throw new Error("fundingAmount must be a non-negative number");
      }
      patchObj.fundingAmount = rest.fundingAmount;
    }
    if (rest.rate !== undefined) {
      if (!Number.isFinite(rest.rate) || rest.rate < 0) {
        throw new Error("rate must be a non-negative number");
      }
      patchObj.rate = rest.rate;
    }
    if (rest.term !== undefined) {
      patchObj.term = rest.term.trim();
    }
    if (rest.propertyAddress !== undefined) {
      const v2 =
        rest.propertyAddress === null ? undefined : rest.propertyAddress.trim();
      patchObj.propertyAddress = v2 || undefined;
    }
    if (rest.notes !== undefined) {
      const v2 = rest.notes === null ? undefined : rest.notes.trim();
      patchObj.notes = v2 || undefined;
    }
    if (rest.commission !== undefined) {
      if (!Number.isFinite(rest.commission) || rest.commission < 0) {
        throw new Error("commission must be a non-negative number");
      }
      patchObj.commission = rest.commission;
    }
    if (rest.netRevenue !== undefined) {
      if (!Number.isFinite(rest.netRevenue) || rest.netRevenue < 0) {
        throw new Error("netRevenue must be a non-negative number");
      }
      patchObj.netRevenue = rest.netRevenue;
    }
    if (rest.contacts !== undefined) {
      patchObj.contacts = rest.contacts.map((c) => ({
        name: c.name.trim() || "Unknown",
        email: c.email?.trim() || undefined,
        phone: c.phone?.trim() || undefined,
        company: c.company?.trim() || undefined,
      }));
    }
    if (rest.lenderFee !== undefined) {
      patchObj.lenderFee =
        rest.lenderFee === null ? undefined : rest.lenderFee;
    }
    if (rest.lenderFeePct !== undefined) {
      const v2 =
        rest.lenderFeePct === null ? undefined : rest.lenderFeePct;
      if (v2 !== undefined && (!Number.isFinite(v2) || v2 < 0)) {
        throw new Error("lenderFeePct must be a non-negative number");
      }
      patchObj.lenderFeePct = v2;
    }
    if (rest.lenderFeeOutside !== undefined) {
      const v2 =
        rest.lenderFeeOutside === null ? undefined : rest.lenderFeeOutside;
      if (v2 !== undefined && (!Number.isFinite(v2) || v2 < 0)) {
        throw new Error("lenderFeeOutside must be a non-negative number");
      }
      patchObj.lenderFeeOutside = v2;
    }
    if (rest.brokerGross !== undefined) {
      patchObj.brokerGross =
        rest.brokerGross === null ? undefined : rest.brokerGross;
    }
    if (rest.brokerGrossPct !== undefined) {
      const v2 =
        rest.brokerGrossPct === null ? undefined : rest.brokerGrossPct;
      if (v2 !== undefined && (!Number.isFinite(v2) || v2 < 0)) {
        throw new Error("brokerGrossPct must be a non-negative number");
      }
      patchObj.brokerGrossPct = v2;
    }
    if (rest.brokerGrossOutside !== undefined) {
      const v2 =
        rest.brokerGrossOutside === null ? undefined : rest.brokerGrossOutside;
      if (v2 !== undefined && (!Number.isFinite(v2) || v2 < 0)) {
        throw new Error("brokerGrossOutside must be a non-negative number");
      }
      patchObj.brokerGrossOutside = v2;
    }
    if (rest.netToUser !== undefined) {
      patchObj.netToUser =
        rest.netToUser === null ? undefined : rest.netToUser;
    }
    if (rest.netToUserPct !== undefined) {
      const v2 =
        rest.netToUserPct === null ? undefined : rest.netToUserPct;
      if (v2 !== undefined && (!Number.isFinite(v2) || v2 < 0)) {
        throw new Error("netToUserPct must be a non-negative number");
      }
      patchObj.netToUserPct = v2;
    }
    if (rest.netToUserOutside !== undefined) {
      const v2 =
        rest.netToUserOutside === null ? undefined : rest.netToUserOutside;
      if (v2 !== undefined && (!Number.isFinite(v2) || v2 < 0)) {
        throw new Error("netToUserOutside must be a non-negative number");
      }
      patchObj.netToUserOutside = v2;
    }
    if (rest.splits !== undefined) {
      patchObj.splits = rest.splits.length === 0 ? undefined : rest.splits;
    }

    // ---------- Auto-recompute fee totals from (fundingAmount × pct%) + outside ----------
    //
    // Source of truth for editable fees is the (pct, outside) pair; the
    // dollar `*` total is derived. We recompute whenever fundingAmount, the
    // pct, or the outside changes — *unless* the caller explicitly set the
    // total in the same patch (legacy / direct-entry escape hatch).
    const merged: Doc<"pipeline"> = {
      ...existing,
      ...patchObj,
    } as Doc<"pipeline">;
    const loanChanged = rest.fundingAmount !== undefined;

    type FeeKeys = {
      total: "lenderFee" | "brokerGross" | "netToUser";
      pct:
        | "lenderFeePct"
        | "brokerGrossPct"
        | "netToUserPct";
      outside:
        | "lenderFeeOutside"
        | "brokerGrossOutside"
        | "netToUserOutside";
    };
    const feeGroups: FeeKeys[] = [
      {
        total: "lenderFee",
        pct: "lenderFeePct",
        outside: "lenderFeeOutside",
      },
      {
        total: "brokerGross",
        pct: "brokerGrossPct",
        outside: "brokerGrossOutside",
      },
      {
        total: "netToUser",
        pct: "netToUserPct",
        outside: "netToUserOutside",
      },
    ];

    for (const g of feeGroups) {
      const userSetTotalExplicitly = rest[g.total] !== undefined;
      const pctChanged = rest[g.pct] !== undefined;
      const outsideChanged = rest[g.outside] !== undefined;
      if (userSetTotalExplicitly) continue;
      if (!loanChanged && !pctChanged && !outsideChanged) continue;

      const pct = merged[g.pct];
      const outside = merged[g.outside];
      // If neither pct nor outside is set, leave the legacy total alone.
      if (pct === undefined && outside === undefined) continue;

      const fundingBase = merged.fundingAmount ?? 0;
      const computed = (fundingBase * (pct ?? 0)) / 100 + (outside ?? 0);
      patchObj[g.total] = Number.isFinite(computed)
        ? Math.round(computed * 100) / 100
        : 0;
    }
    if (rest.scenario !== undefined) {
      const v2 = rest.scenario === null ? undefined : rest.scenario.trim();
      patchObj.scenario = v2 || undefined;
    }
    if (rest.scenarioCriteria !== undefined) {
      patchObj.scenarioCriteria =
        rest.scenarioCriteria === null
          ? undefined
          : normalizeScenarioCriteria(rest.scenarioCriteria);
    }
    if (rest.termOptions !== undefined) {
      patchObj.termOptions =
        rest.termOptions.length === 0 ? undefined : rest.termOptions;
    }
    if (rest.assigneeId !== undefined) {
      const v2 =
        rest.assigneeId === null ? undefined : rest.assigneeId.trim();
      patchObj.assigneeId = v2 || undefined;
    }
    if (rest.sharedWithIds !== undefined) {
      patchObj.sharedWithIds =
        rest.sharedWithIds.length === 0 ? undefined : rest.sharedWithIds;
    }
    if (rest.targetCloseDate !== undefined) {
      patchObj.targetCloseDate =
        rest.targetCloseDate === null ? undefined : rest.targetCloseDate;
    }
    if (rest.selectedLenderSentAt !== undefined) {
      if (rest.selectedLenderSentAt === null) {
        patchObj.selectedLenderSentAt = undefined;
      } else {
        const t = rest.selectedLenderSentAt;
        if (!Number.isFinite(t)) {
          throw new Error("selectedLenderSentAt must be a finite Unix timestamp");
        }
        patchObj.selectedLenderSentAt = t;
      }
    }
    if (rest.loNmls !== undefined) {
      const v2 = rest.loNmls === null ? undefined : rest.loNmls.trim();
      patchObj.loNmls = v2 || undefined;
    }
    if (rest.brokerNmls !== undefined) {
      const v2 =
        rest.brokerNmls === null ? undefined : rest.brokerNmls.trim();
      patchObj.brokerNmls = v2 || undefined;
    }

    // Auto-clear the ledger-projection flag once the file flips to
    // Paid/Paying — at that point the file lives in the ledger proper
    // and shouldn't double-count in the forecast.
    if (
      nextStatusForLedger !== null &&
      isPaidStatusLabel(nextStatusForLedger) &&
      existing.projectIntoLedger
    ) {
      patchObj.projectIntoLedger = undefined;
    }

    const sharedFieldsTouched =
      rest.fundingAmount !== undefined ||
      rest.rate !== undefined ||
      rest.term !== undefined ||
      rest.notes !== undefined ||
      rest.commission !== undefined ||
      rest.netRevenue !== undefined;
    if (sharedFieldsTouched || existing.fileSharedState === undefined) {
      const mergedForBus = { ...existing, ...patchObj } as Doc<"pipeline">;
      materializeFileSharedStateOnPatch(
        patchObj,
        mergedForBus as unknown as PipelineFileSharedSource,
        now
      );
    }

    const undoKeys = patchKeysForUndo(patchObj as unknown as Record<string, unknown>);
    const allowUndo =
      rest.status === undefined &&
      undoKeys.length > 0 &&
      undoKeys.length <= 48;
    const undoPre = allowUndo
      ? snapshotPipelineFields(existing, undoKeys)
      : null;

    await ctx.db.patch(id, patchObj);

    if (rest.assigneeId !== undefined || rest.sharedWithIds !== undefined) {
      const teamRow = (await ctx.db.get(id))!;
      await resyncFileTeamEdgesFromPipeline(
        ctx,
        teamRow,
        preferencesAccountId,
      );
    }

    let ledgerId: Id<"ledger"> | undefined;
    if (nextStatusForLedger !== null) {
      const sourceForLedger = (await ctx.db.get(id)) ?? existing;
      const inserted = await tryInsertLedgerWhenMarkedPaid(
        ctx,
        id,
        sourceForLedger,
        nextStatusForLedger,
        now
      );
      ledgerId = inserted ?? undefined;
    }

    const auditKeys = (
      Object.keys(rest) as (keyof typeof rest)[]
    )
      .filter((k) => rest[k] !== undefined)
      .filter(
        (k) =>
          !stageAssignmentChanged ||
          (k !== "stageId" && k !== "subStageId" && k !== "status"),
      )
      .map(String);

    const canAttachUndo =
      allowUndo && ledgerId === undefined && undoPre != null;
    let undoPost: Record<string, unknown> | null = null;
    if (canAttachUndo) {
      const afterRow = (await ctx.db.get(id))!;
      undoPost = snapshotPipelineFields(afterRow, undoKeys);
    }
    const undoOk =
      canAttachUndo &&
      undoPost != null &&
      undoPayloadWithinLimit(undoPre, undoPost);

    if (auditKeys.length > 0) {
      await appendPipelineFileActivity(ctx, {
        fileId: id,
        at: now,
        kind: "data_patch",
        keys: auditKeys.slice(0, 48),
        summary: clampActivitySummary(
          `${auditKeys.length} field${auditKeys.length === 1 ? "" : "s"} updated`,
        ),
        ...(undoOk
          ? {
              undoSpec: {
                v: 1 as const,
                kind: "pipeline_fields" as const,
                keys: undoKeys,
                pre: cloneJson(undoPre),
              },
              expectPost: cloneJson(undoPost),
            }
          : {}),
      });
    }

    if (stageAssignmentChanged && existing.organizationId) {
      const freshStage = (await ctx.db.get(id))!;
      const actorKey =
        preferencesAccountId?.trim() ||
        (await resolveMemberUserKey(ctx, undefined)) ||
        "__system__";
      await insertCollaborationActivityEvent(ctx, {
        organizationId: existing.organizationId,
        eventType: "status_changed",
        visibility: "org_wide",
        pipelineFileId: id,
        actorUserKey: actorKey,
        summary: `Stage changed on “${existing.fileName.trim()}”`,
        delta: {
          previousStatus: existing.status,
          nextStatus: freshStage.status,
          previousStageId: existing.stageId ?? null,
          nextStageId: freshStage.stageId ?? null,
          previousSubStageId: existing.subStageId ?? null,
          nextSubStageId: freshStage.subStageId ?? null,
        },
      });
    }

    if (auditKeys.length > 0) {
      const fresh = await ctx.db.get(id);
      if (fresh) {
        const watchers = collectPipelineWatcherUserKeys(
          fresh,
          preferencesAccountId,
        );
        const label = `Pipeline file updated: “${fresh.fileName.trim()}”`;
        const detail = auditKeys.slice(0, 20).join(", ");
        for (const w of watchers) {
          await dispatchUserNotification(ctx, {
            userKey: w,
            category: "file_update",
            summary: label,
            detail,
            actorUserKey: preferencesAccountId,
            fileId: id,
          });
        }
      }
    }

    if (rest.notes !== undefined) {
      const prevNotes = existing.notes ?? "";
      const nextNotes = rest.notes === null ? "" : rest.notes.trim();
      for (const h of newMentionHandlesOnly(prevNotes, nextNotes)) {
        await dispatchUserNotification(ctx, {
          userKey: h,
          category: "mention",
          summary: `You were mentioned in notes on “${existing.fileName.trim()}”`,
          actorUserKey: preferencesAccountId,
          fileId: id,
        });
      }
    }

    await refreshPipelineGlobalSearchText(ctx, id);
    if (loanChanged && existing.projectId) {
      await syncCapitalSourcesFromProjectLoans(ctx, existing.projectId);
    }
    if (auditKeys.length > 0 && existing.organizationId) {
      scheduleOrgPipelineWebhook(
        ctx,
        existing.organizationId,
        "pipeline.file.updated",
        id,
        { changedKeys: auditKeys },
      );
    }
    return { id, ledgerId };
  },
});

export const setClientMomentum = mutation({
  args: {
    id: v.id("pipeline"),
    /** 1–5 to set a rating, or `null` to clear back to unrated. */
    clientMomentum: v.union(v.number(), v.null()),
    expectedUpdatedAt: v.optional(v.number()),
    ...preferencesAccountIdArg,
  },
  handler: async (ctx, args) => {
    const isClear = args.clientMomentum === null;
    let nextStars: number | undefined;
    if (!isClear) {
      const next = Math.round(args.clientMomentum as number);
      if (!Number.isFinite(next) || next < 1 || next > 5) {
        throw new Error("clientMomentum must be between 1 and 5");
      }
      nextStars = next;
    }
    const existing = await ctx.db.get(args.id);
    if (!existing) throw new Error("Pipeline not found");
    if (
      args.expectedUpdatedAt !== undefined &&
      existing.updatedAt !== args.expectedUpdatedAt
    ) {
      throw new Error("CONFLICT_DATA_CHANGED");
    }
    await assertCanMutatePipelineRow(ctx, existing, args.preferencesAccountId);
    const prev = parseClientMomentum(existing.clientMomentum);
    if (isClear) {
      if (prev === undefined) {
        return { id: args.id, clientMomentum: undefined };
      }
    } else if (prev === nextStars) {
      return { id: args.id, clientMomentum: nextStars };
    }
    const now = Date.now();
    await ctx.db.patch(args.id, {
      clientMomentum: isClear ? undefined : nextStars,
      createdAt: existing.createdAt,
      updatedAt: now,
    });
    const key = await resolveMemberUserKey(ctx, args.preferencesAccountId);
    const auth = await tryGetAuthUserByPermissionKey(ctx, key);
    const label =
      auth?.displayUsername?.trim() ||
      auth?.normalizedUsername?.trim() ||
      "Someone";
    const starsFrom =
      prev != null ? "★".repeat(prev) : "unrated";
    const starsTo = isClear ? "unrated" : "★".repeat(nextStars!);
    const summaryRaw = `${label} changed client confidence from ${starsFrom} to ${starsTo}`;
    const summary = clampActivitySummary(summaryRaw) ?? summaryRaw;
    await appendPipelineFileActivity(ctx, {
      fileId: args.id,
      at: now,
      kind: "client_momentum",
      summary,
    });
    await appendPipelineClientMomentumFeed(ctx, existing, summary, key);
    await refreshPipelineGlobalSearchText(ctx, args.id);
    if (existing.organizationId) {
      scheduleOrgPipelineWebhook(
        ctx,
        existing.organizationId,
        "pipeline.file.updated",
        args.id,
        { changedKeys: ["clientMomentum"] },
      );
    }
    return {
      id: args.id,
      clientMomentum: isClear ? undefined : nextStars,
    };
  },
});

/**
 * Toggle the "include in ledger forecast" flag for a pipeline file.
 * Independent of status — the user chooses which not-yet-funded deals
 * are confident enough to forecast. When set, the ledger's Projections
 * card sums the file's `netToUser` into the net-revenue forecast.
 *
 * The flag is auto-cleared by `pipeline.patch` when the file flips to
 * Paid/Paying (the file then lives in the ledger proper).
 */
export const setProjected = mutation({
  args: {
    id: v.id("pipeline"),
    projected: v.boolean(),
    ...preferencesAccountIdArg,
  },
  handler: async (ctx, { id, projected, preferencesAccountId }) => {
    const row = await ctx.db.get(id);
    if (!row) throw new Error("Pipeline not found");
    await assertCanMutatePipelineRow(ctx, row, preferencesAccountId);
    await ctx.db.patch(id, {
      projectIntoLedger: projected ? true : undefined,
      createdAt: row.createdAt,
      updatedAt: Date.now(),
    });
    return { id, projected };
  },
});

/**
 * Soft-archive a pipeline file. The row is preserved (and its ledger
 * refs / history stay intact) but it disappears from the default
 * pipeline list, board, and ledger forecast. Also auto-clears the
 * `projectIntoLedger` flag — an archived deal shouldn't keep
 * inflating the net-revenue projection.
 *
 * Idempotent: archiving an already-archived file just refreshes the
 * timestamp.
 */
export const archive = mutation({
  args: { id: v.id("pipeline"), ...preferencesAccountIdArg },
  handler: async (ctx, { id, preferencesAccountId }) => {
    const row = await ctx.db.get(id);
    if (!row) throw new Error("Pipeline not found");
    await assertCanMutatePipelineRow(ctx, row, preferencesAccountId);
    const now = Date.now();
    await ctx.db.patch(id, {
      archivedAt: now,
      projectIntoLedger: undefined,
      createdAt: row.createdAt,
      updatedAt: now,
    });
    if (row.organizationId && row.archivedAt == null) {
      scheduleOrgPipelineWebhook(
        ctx,
        row.organizationId,
        "pipeline.file.archived",
        id,
      );
    }
    return { id, archivedAt: now };
  },
});

/**
 * Restore a previously archived file by clearing `archivedAt`.
 * No-op if the file isn't archived.
 */
export const unarchive = mutation({
  args: { id: v.id("pipeline"), ...preferencesAccountIdArg },
  handler: async (ctx, { id, preferencesAccountId }) => {
    const row = await ctx.db.get(id);
    if (!row) throw new Error("Pipeline not found");
    await assertCanMutatePipelineRow(ctx, row, preferencesAccountId);
    if (row.archivedAt == null) return { id, archivedAt: null };
    await ctx.db.patch(id, {
      archivedAt: undefined,
      createdAt: row.createdAt,
      updatedAt: Date.now(),
    });
    scheduleOrgPipelineWebhook(
      ctx,
      row.organizationId,
      "pipeline.file.restored",
      id,
    );
    return { id, archivedAt: null };
  },
});

/**
 * Snooze a pipeline file until a specific future datetime (Unix ms).
 * While snoozed, the file is hidden from default pipeline views.
 */
export const snooze = mutation({
  args: {
    id: v.id("pipeline"),
    /** Unix ms end instant, or ISO 8601 string (parsed with `Date.parse`). */
    snoozedUntil: v.union(v.number(), v.string()),
    ...preferencesAccountIdArg,
  },
  handler: async (ctx, { id, snoozedUntil, preferencesAccountId }) => {
    const row = await ctx.db.get(id);
    if (!row) throw new Error("Pipeline not found");
    await assertCanMutatePipelineRow(ctx, row, preferencesAccountId);
    const ms =
      typeof snoozedUntil === "number"
        ? snoozedUntil
        : Date.parse(snoozedUntil);
    if (!Number.isFinite(ms)) {
      throw new Error("Invalid snooze date");
    }
    const now = Date.now();
    if (ms <= now) {
      await ctx.db.patch(id, {
        snoozedUntil: undefined,
        createdAt: row.createdAt,
        updatedAt: now,
      });
      return { id, snoozedUntil: null as null };
    }
    const stored = new Date(ms).toISOString();
    await ctx.db.patch(id, {
      snoozedUntil: stored,
      createdAt: row.createdAt,
      updatedAt: now,
    });
    return { id, snoozedUntil: stored };
  },
});

/**
 * Clear a file's snooze state immediately.
 */
export const unsnooze = mutation({
  args: { id: v.id("pipeline"), ...preferencesAccountIdArg },
  handler: async (ctx, { id, preferencesAccountId }) => {
    const row = await ctx.db.get(id);
    if (!row) throw new Error("Pipeline not found");
    await assertCanMutatePipelineRow(ctx, row, preferencesAccountId);
    if (row.snoozedUntil == null) return { id, snoozedUntil: null };
    await ctx.db.patch(id, {
      snoozedUntil: undefined,
      createdAt: row.createdAt,
      updatedAt: Date.now(),
    });
    return { id, snoozedUntil: null };
  },
});

/**
 * Add a lender to the `lenders` list on a pipeline file; idempotent (no
 * duplicate ids).
 */
export const attachLender = mutation({
  args: {
    fileId: v.id("pipeline"),
    lenderId: v.id("lenders"),
    contactRepId: v.optional(v.id("contacts")),
    ...preferencesAccountIdArg,
  },
  handler: async (ctx, { fileId, lenderId, contactRepId, preferencesAccountId }) => {
    const row = await ctx.db.get(fileId);
    if (!row) throw new Error("Pipeline not found");
    await assertCanMutatePipelineRow(ctx, row, preferencesAccountId);
    const lender = await ctx.db.get(lenderId);
    if (!lender) throw new Error("Lender not found");
    assertLenderAttachableToPipeline(lender, row);
    if (contactRepId) {
      const link = await ctx.db
        .query("contactLenderLinks")
        .withIndex("by_contact_lender", (q) =>
          q.eq("contactId", contactRepId).eq("lenderId", lenderId),
        )
        .first();
      if (!link) {
        throw new Error(
          "Selected contact is not a representative of this lender.",
        );
      }
    }
    const inArray = row.lenders.some((x) => x === lenderId);
    const existingEdge = await findFileLenderEdge(ctx, fileId, lenderId);
    if (inArray && existingEdge) {
      return { id: fileId, lenders: row.lenders };
    }
    const lenders = inArray ? row.lenders : [...row.lenders, lenderId];
    const now = Date.now();
    const lendersPre = {
      lenders: row.lenders,
      selectedLenderId: row.selectedLenderId,
      selectedLenderSentAt: row.selectedLenderSentAt,
    };
    if (!inArray) {
      await ctx.db.patch(fileId, {
        lenders,
        createdAt: row.createdAt,
        updatedAt: now,
      });
    }
    const afterAttach = (await ctx.db.get(fileId))!;
    await syncFileLenderEdgesFromPipeline(
      ctx,
      afterAttach,
      preferencesAccountId,
    );
    if (contactRepId) {
      const edge = await findFileLenderEdge(ctx, fileId, lenderId);
      if (edge) {
        await ctx.db.patch(edge._id, { contactRepId, updatedAt: now });
      }
    }
    const lendersPost = {
      lenders: afterAttach.lenders,
      selectedLenderId: afterAttach.selectedLenderId,
      selectedLenderSentAt: afterAttach.selectedLenderSentAt,
    };
    const lendersUndoOk = undoJsonPairWithinLimit(lendersPre, lendersPost);
    await appendPipelineFileActivity(ctx, {
      fileId,
      at: now,
      kind: "lender_attach",
      lenderId,
      summary: clampActivitySummary(
        lender.company ? `Attached ${lender.company}` : "Lender attached",
      ),
      ...(lendersUndoOk
        ? {
            undoSpec: {
              v: 1 as const,
              kind: "lenders_state" as const,
              pre: cloneJson(lendersPre),
            },
            expectPost: cloneJson(lendersPost),
          }
        : {}),
    });
    const after = await ctx.db.get(fileId);
    if (after) {
      await runPipelineBlockAutomations({
        ctx,
        fileId,
        existing: after,
        now,
        event: {
          type: "lender_attached",
          lenderId: String(lenderId),
        },
      });
      await runUserSimpleWorkflows({
        ctx,
        accountId: preferencesAccountId,
        fileId,
        event: { type: "lender_attached", lenderId: String(lenderId) },
        now,
      });
    }
    return { id: fileId, lenders };
  },
});

/**
 * Remove a lender from the `lenders` list on a pipeline file. No-op if the
 * lender is not currently linked. If the detached lender was the chosen
 * lender (`selectedLenderId`), the selection is cleared so the file never
 * holds a dangling reference.
 */
export const detachLender = mutation({
  args: {
    fileId: v.id("pipeline"),
    lenderId: v.id("lenders"),
    ...preferencesAccountIdArg,
  },
  handler: async (ctx, { fileId, lenderId, preferencesAccountId }) => {
    const row = await ctx.db.get(fileId);
    if (!row) throw new Error("Pipeline not found");
    await assertCanMutatePipelineRow(ctx, row, preferencesAccountId);
    const hadArray = row.lenders.some((x) => x === lenderId);
    const hadEdge = !!(await findFileLenderEdge(ctx, fileId, lenderId));
    if (!hadArray && !hadEdge) {
      return { id: fileId, lenders: row.lenders };
    }
    const lendersPre = {
      lenders: row.lenders,
      selectedLenderId: row.selectedLenderId,
      selectedLenderSentAt: row.selectedLenderSentAt,
    };
    await detachLenderFromFile(ctx, row, lenderId, preferencesAccountId);
    const now = Date.now();
    const lender = await ctx.db.get(lenderId);
    const afterDetach = (await ctx.db.get(fileId))!;
    const lenders = afterDetach.lenders;
    const lendersPost = {
      lenders: afterDetach.lenders,
      selectedLenderId: afterDetach.selectedLenderId,
      selectedLenderSentAt: afterDetach.selectedLenderSentAt,
    };
    const lendersUndoOk = undoJsonPairWithinLimit(lendersPre, lendersPost);
    await appendPipelineFileActivity(ctx, {
      fileId,
      at: now,
      kind: "lender_detach",
      lenderId,
      summary: clampActivitySummary(
        lender?.company ? `Removed ${lender.company}` : "Lender removed",
      ),
      ...(lendersUndoOk
        ? {
            undoSpec: {
              v: 1 as const,
              kind: "lenders_state" as const,
              pre: cloneJson(lendersPre),
            },
            expectPost: cloneJson(lendersPost),
          }
        : {}),
    });
    return { id: fileId, lenders };
  },
});

/**
 * Mark one of the file's linked lenders as the "chosen" lender (the one
 * the user has decided to actually fund the deal with). Pass `null` to
 * clear the selection. The lender must already be attached to the file
 * — call `attachLender` first if the user picked one off a search hit.
 *
 * Does **not** set `selectedLenderSentAt`; the user records that separately
 * on the pipeline table (or future drawer control) so it reflects when the
 * package was actually sent to the lender.
 */
export const selectLender = mutation({
  args: {
    fileId: v.id("pipeline"),
    lenderId: v.union(v.id("lenders"), v.null()),
    ...preferencesAccountIdArg,
  },
  handler: async (ctx, { fileId, lenderId, preferencesAccountId }) => {
    const row = await ctx.db.get(fileId);
    if (!row) throw new Error("Pipeline not found");
    await assertCanMutatePipelineRow(ctx, row, preferencesAccountId);
    if (lenderId !== null && !row.lenders.some((x) => x === lenderId)) {
      throw new Error(
        "Cannot select a lender that isn't attached to this file"
      );
    }
    if (lenderId !== null) {
      const edge = await findFileLenderEdge(ctx, fileId, lenderId);
      if (edge?.relationshipType === "declined") {
        throw new Error(
          "Cannot select a lender that has declined this file. Clear rejection or remove the lender first.",
        );
      }
    }
    const now = Date.now();
    const lendersPre = {
      lenders: row.lenders,
      selectedLenderId: row.selectedLenderId,
      selectedLenderSentAt: row.selectedLenderSentAt,
    };
    const patchBody: Partial<Doc<"pipeline">> = {
      selectedLenderId: lenderId === null ? undefined : lenderId,
      createdAt: row.createdAt,
      updatedAt: now,
    };
    if (lenderId === null) {
      patchBody.selectedLenderSentAt = undefined;
    }
    await ctx.db.patch(fileId, patchBody);
    const afterSelectRow = (await ctx.db.get(fileId))!;
    await syncFileLenderEdgesFromPipeline(
      ctx,
      afterSelectRow,
      preferencesAccountId,
    );
    const lendersPost = {
      lenders: afterSelectRow.lenders,
      selectedLenderId: afterSelectRow.selectedLenderId,
      selectedLenderSentAt: afterSelectRow.selectedLenderSentAt,
    };
    const lendersUndoOk = undoJsonPairWithinLimit(lendersPre, lendersPost);
    const lendersUndoFields = lendersUndoOk
      ? {
          undoSpec: {
            v: 1 as const,
            kind: "lenders_state" as const,
            pre: cloneJson(lendersPre),
          },
          expectPost: cloneJson(lendersPost),
        }
      : {};
    if (lenderId === null) {
      await appendPipelineFileActivity(ctx, {
        fileId,
        at: now,
        kind: "lender_select",
        summary: clampActivitySummary("Cleared chosen lender"),
        ...lendersUndoFields,
      });
    } else {
      const sel = await ctx.db.get(lenderId);
      await appendPipelineFileActivity(ctx, {
        fileId,
        at: now,
        kind: "lender_select",
        lenderId,
        summary: clampActivitySummary(
          sel?.company ? `Chose ${sel.company}` : "Lender selected",
        ),
        ...lendersUndoFields,
      });
    }
    const afterSelect = await ctx.db.get(fileId);
    if (afterSelect && lenderId !== null) {
      await runPipelineBlockAutomations({
        ctx,
        fileId,
        existing: afterSelect,
        now,
        event: {
          type: "lender_selected",
          lenderId: String(lenderId),
        },
      });
      await runUserSimpleWorkflows({
        ctx,
        accountId: preferencesAccountId,
        fileId,
        event: { type: "lender_selected", lenderId: String(lenderId) },
        now,
      });
    }
    return { id: fileId, selectedLenderId: lenderId };
  },
});

/**
 * Prune the lender list on a file. Two modes:
 *   - `keep: "selected"` (default): keeps only `selectedLenderId` (errors
 *     if no selection is set). Use this once the user has decided who's
 *     funding the deal and wants to clean out the also-rans.
 *   - `keep: "none"`: clears the whole list. Use this when the user wants
 *     to start over from scratch. Also clears `selectedLenderId`.
 */
export const clearOtherLenders = mutation({
  args: {
    fileId: v.id("pipeline"),
    keep: v.optional(v.union(v.literal("selected"), v.literal("none"))),
    ...preferencesAccountIdArg,
  },
  handler: async (ctx, { fileId, keep = "selected", preferencesAccountId }) => {
    const row = await ctx.db.get(fileId);
    if (!row) throw new Error("Pipeline not found");
    await assertCanMutatePipelineRow(ctx, row, preferencesAccountId);
    const now = Date.now();
    if (keep === "none") {
      await ctx.db.patch(fileId, {
        lenders: [],
        selectedLenderId: undefined,
        selectedLenderSentAt: undefined,
        createdAt: row.createdAt,
        updatedAt: now,
      });
      return { id: fileId, lenders: [] };
    }
    // keep === "selected"
    if (!row.selectedLenderId) {
      throw new Error(
        "No lender is selected — choose one before clearing the list."
      );
    }
    const selected = row.selectedLenderId;
    const lenders = row.lenders.filter((x) => x === selected);
    await ctx.db.patch(fileId, {
      lenders,
      // Selection unchanged.
      createdAt: row.createdAt,
      updatedAt: now,
    });
    return { id: fileId, lenders };
  },
});

/**
 * Delete a pipeline file and dependent rows (CRM file links, shares, per-file
 * activity, tasks’ file links, notifications, intake when sole owner).
 * Ledger entries that reference this file are preserved (historical record)
 * but become orphaned, matching prior behavior.
 */
export const remove = mutation({
  args: { id: v.id("pipeline"), ...preferencesAccountIdArg },
  handler: async (ctx, { id, preferencesAccountId }) => {
    const row = await ctx.db.get(id);
    if (!row) return { ok: false as const };
    await assertCanDeletePipelineRow(ctx, row, preferencesAccountId);
    await deletePipelineGraph(ctx, id);
    return { ok: true as const };
  },
});

/**
 * One-shot migration that maps legacy short funnel values
 * (lead/app/approved/funded/paid/dead/etc.) onto the canonical funnel
 * defined in `lib/pipelineStatus.ts`. Idempotent — re-running on
 * already-canonical rows is a no-op.
 *
 * Triggered manually from the /ledger page (or anywhere in the app)
 * via a one-time button; not auto-scheduled.
 */
const LEGACY_TO_CANONICAL: Record<string, string> = {
  lead: "confirm_interest",
  app: "portal_collecting_docs",
  application: "portal_collecting_docs",
  approved: "accepted",
  funded: "funding",
  paid: "paid_paying",
  paying: "paid_paying",
  dead: "confirm_interest",
};

const fileDrawerLayoutValidator = v.object({
  v: v.literal(1),
  order: v.array(v.string()),
  hidden: v.array(v.string()),
  expanded: v.optional(v.record(v.string(), v.boolean())),
  settings: v.optional(v.record(v.string(), v.any())),
});

/**
 * Persists per-file drawer block order / visibility (see `fileDrawerLayout` on `pipeline`).
 * Mandatory blocks cannot remain hidden; they are stripped server-side.
 */
export const patchFileDrawerLayout = mutation({
  args: {
    id: v.id("pipeline"),
    layout: fileDrawerLayoutValidator,
    ...preferencesAccountIdArg,
  },
  handler: async (ctx, { id, layout, preferencesAccountId }) => {
    const row = await ctx.db.get(id);
    if (!row) throw new Error("Pipeline not found");
    await assertCanManagePipelineDrawerLayout(ctx, row, preferencesAccountId);
    const normalized = normalizePipelineDrawerLayout(layout);
    const next = await finalizeFileDrawerLayoutForPersist(ctx, normalized);
    await assertDrawerLayoutAllowedForOrgPlan(ctx, row.organizationId, next);
    const now = Date.now();
    if (drawerLayoutAuditTargetsChanged(row.fileDrawerLayout, next)) {
      const { blocksShown, blocksHidden } = diffDrawerBlocksShownHidden(
        row.fileDrawerLayout,
        next,
      );
      const parts: string[] = [];
      if (blocksShown.length) parts.push(`Shown: ${blocksShown.join(", ")}`);
      if (blocksHidden.length) parts.push(`Hidden: ${blocksHidden.join(", ")}`);
      const layoutPre = cloneJson(
        normalizePipelineDrawerLayout(row.fileDrawerLayout),
      );
      await ctx.db.patch(id, {
        fileDrawerLayout: {
          v: 1,
          ...layoutToDbFields(next),
        },
        updatedAt: now,
      });
      const afterRow = (await ctx.db.get(id))!;
      const expectKey = drawerLayoutStableKey(afterRow.fileDrawerLayout);
      const drawerUndoOk = undoJsonPairWithinLimit(layoutPre, expectKey);
      await appendPipelineFileActivity(ctx, {
        fileId: id,
        at: now,
        kind: "drawer_layout",
        blocksShown: blocksShown.length ? blocksShown : undefined,
        blocksHidden: blocksHidden.length ? blocksHidden : undefined,
        summary: clampActivitySummary(
          parts.length ? parts.join(" · ") : "Drawer layout updated",
        ),
        ...(drawerUndoOk
          ? {
              undoSpec: {
                v: 1 as const,
                kind: "drawer_layout" as const,
                pre: layoutPre,
              },
              expectPost: expectKey,
            }
          : {}),
      });
    } else {
      // Expanded-only or no audit-target delta — skip Convex write (client persists expand locally).
      return {
        ok: true as const,
        fileDrawerLayout: row.fileDrawerLayout ?? {
          v: 1 as const,
          ...layoutToDbFields(next),
        },
      };
    }
    return {
      ok: true as const,
      fileDrawerLayout: {
        v: 1 as const,
        ...layoutToDbFields(next),
      },
    };
  },
});

/**
 * Resets the file drawer to the template: optional client-supplied order/hidden
 * (from Settings), otherwise registry defaults via `normalizePipelineDrawerLayout`.
 */
export const resetFileDrawerLayoutToTemplate = mutation({
  args: {
    id: v.id("pipeline"),
    templateOrder: v.optional(v.array(v.string())),
    templateHidden: v.optional(v.array(v.string())),
    ...preferencesAccountIdArg,
  },
  handler: async (ctx, { id, templateOrder, templateHidden, preferencesAccountId }) => {
    const row = await ctx.db.get(id);
    if (!row) throw new Error("Pipeline not found");
    await assertCanManagePipelineDrawerLayout(ctx, row, preferencesAccountId);
    const normalized = normalizePipelineDrawerLayout({
      v: 1,
      order: templateOrder ?? [],
      hidden: templateHidden ?? [],
      expanded: {},
    });
    const next = await finalizeFileDrawerLayoutForPersist(ctx, normalized);
    await assertDrawerLayoutAllowedForOrgPlan(ctx, row.organizationId, next);
    const now = Date.now();
    if (drawerLayoutAuditTargetsChanged(row.fileDrawerLayout, next)) {
      const { blocksShown, blocksHidden } = diffDrawerBlocksShownHidden(
        row.fileDrawerLayout,
        next,
      );
      const layoutPre = cloneJson(
        normalizePipelineDrawerLayout(row.fileDrawerLayout),
      );
      await ctx.db.patch(id, {
        fileDrawerLayout: {
          v: 1,
          ...layoutToDbFields(next),
        },
        updatedAt: now,
      });
      const afterRow = (await ctx.db.get(id))!;
      const expectKey = drawerLayoutStableKey(afterRow.fileDrawerLayout);
      const drawerUndoOk = undoJsonPairWithinLimit(layoutPre, expectKey);
      await appendPipelineFileActivity(ctx, {
        fileId: id,
        at: now,
        kind: "drawer_layout",
        blocksShown: blocksShown.length ? blocksShown : undefined,
        blocksHidden: blocksHidden.length ? blocksHidden : undefined,
        summary: clampActivitySummary("Drawer reset to template"),
        ...(drawerUndoOk
          ? {
              undoSpec: {
                v: 1 as const,
                kind: "drawer_layout" as const,
                pre: layoutPre,
              },
              expectPost: expectKey,
            }
          : {}),
      });
    } else {
      await ctx.db.patch(id, {
        fileDrawerLayout: {
          v: 1,
          ...layoutToDbFields(next),
        },
        updatedAt: now,
      });
    }
    return {
      ok: true as const,
      fileDrawerLayout: {
        v: 1 as const,
        ...layoutToDbFields(next),
      },
    };
  },
});

export const migrateLegacyStatuses = mutation({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("pipeline").collect();
    let migrated = 0;
    for (const r of rows) {
      const key = r.status.trim().toLowerCase().replace(/[\s/]+/g, "_");
      const target = LEGACY_TO_CANONICAL[key];
      if (target && target !== r.status) {
        await ctx.db.patch(r._id, {
          status: target,
          createdAt: r.createdAt,
          updatedAt: Date.now(),
        });
        await refreshPipelineGlobalSearchText(ctx, r._id);
        migrated++;
      }
    }
    return { migrated, total: rows.length };
  },
});
