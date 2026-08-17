/**
 * Core edge-case and stress checks for pure domain logic (no Convex server).
 * Run: `npm run test:core`
 */
import assert from "node:assert/strict";
import {
  derivePrimaryFundingAmountFromDealPayload,
  intakeRowToDealPayload,
  isEmbeddedDealDataPresent,
  mergePartialCoverOnPatch,
  mergePartialSubjectPropertyOnPatch,
  mergePatchIntoDeal,
} from "../convex/dealDataMerge";
import type { DealTabId } from "../lib/file/dealTabGroups";
import {
  moveDealWorkspaceTab,
  parseDealWorkspaceLayoutFromUnknown,
} from "../lib/file/dealWorkspaceLayout";
import { computeComparisonLoanSideMetrics } from "../lib/intake/comparisonLoanSide";
import { computeDtiMetrics } from "../lib/intake/dtiCompute";
import {
  buildAmortization,
  formatPct,
  formatUSD,
  monthlyPayment,
  parseRate,
  toNumber,
} from "../lib/intake/finance";
import {
  sumAssetsEstimatedValue,
  sumIncomeRowsMonthly,
  sumLiabilitiesBalances,
  sumLiabilitiesMonthlyPayments,
} from "../lib/intake/moneyAggregates";
import {
  computeWeightedAverageRateByBalance,
  sumWeightedInterestMonthlyPayments,
} from "../lib/intake/weightedInterestBlend";
import {
  computeBusinessDebtScheduleTotals,
  formatBusinessDebtTypeLabel,
  businessDebtRowIsComplete,
  ensureDealBusinessDebtRowId,
  normalizeBusinessDebtType,
  sanitizeDealBusinessDebtRow,
} from "../lib/businessDebt/scheduleOfBusinessDebtModel";
import { businessDebtScheduleToDealRow } from "../lib/contacts/contactProfileToDeal";
import { toHtmlDateInputValue } from "../lib/schedule/dateInput";
import {
  applyBusinessDebtCopyPlan,
  planBusinessDebtCopy,
} from "../lib/businessDebt/businessDebtCopy";
import { businessDebtRowToScheduleShape } from "../lib/contacts/businessDebtFromDeal";
import { mergeIntakeDraftWithServer } from "../lib/share/mergeIntakeDraftWithServer";
import { embeddedDealPayloadIsSubstantive } from "../lib/file/embeddedDealPresence";
import {
  buildVaultDocumentZipPath,
  buildVaultFolderSubtreeZipPath,
  sanitizeZipPathSegment,
} from "../lib/library/vaultZipPaths";
import { dedupeZipPath } from "../lib/library/downloadVaultDocumentsZip";
import {
  defaultVaultDownloadFormat,
  isCreatedVaultHtmlDocument,
  vaultOutboundPdfFileName,
} from "../lib/library/vaultOutboundFileName";
import JSZip from "jszip";
import { isDealBackedPipelineRow } from "../lib/pipeline/dealBackedRow";
import {
  buildDealCommitRow,
  subjectAddressEditorValue,
} from "../lib/pipeline/pipelineTableCommits";
import { buildSubjectAddressDisplay } from "../lib/pipeline/subjectAddressDisplay";
import { resolvePipelineTableFundingAmount } from "../lib/pipeline/resolvePipelineTableFundingAmount";
import { convexHttpActionsBaseUrl, parseConvexPublicUrl } from "../lib/convexPublicUrl";
import {
  materializeFileSharedStateOnPatch,
  normalizeFileSharedStateFromPipeline,
} from "../lib/fileSharedFields";
import {
  isTermOptionsOnlyPipelinePatch,
  patchWithConflictRetry,
} from "../modules/pipeline/lib/core/patchWithConflictRetry";
import { convexClientErrorMessage } from "../lib/ui/convexErrorMessage";
import { revenueTotalsFromPipelineRow } from "../lib/fileRevenue";
import {
  getActivePipelineBlockIdsForFile,
  sanitizeActivePipelineBlockIdsForRender,
} from "../lib/pipelineActiveBlocks";
import {
  blockMeetsVisibilitySpec,
  extractDrawerVisibilitySignals,
  type PipelineBlockVisibilitySpec,
} from "../lib/pipelineBlockVisibility";
import {
  computeRuleBasedDrawerBlockSuggestions,
  listHiddenBlocksEligibleToShow,
} from "../lib/pipelineBlockRecommendations";
import {
  sanitizeDtiAiPatch,
  sanitizeLenderCriteriaAiPatch,
  buildLocalDealBlockSuggestions,
} from "../lib/dealBlockAiAssistModel";
import {
  buildContactFileAlerts,
  buildCoverScenarioFundingAlerts,
  buildDtiToolAlerts,
  buildPipelineFundingMirrorAlerts,
} from "../lib/intelligentAlerts";
import {
  getPipelineBlock,
  PIPELINE_BLOCK_IDS,
} from "../lib/pipelineBlockRegistry";
import { pickIntakeShapedPreviewPayload } from "../lib/pipeline/pickIntakeShapedPreviewPayload";
import {
  fileTaskOutcomeHeadline,
  formatFileTaskOutcomeNote,
} from "../lib/pipeline/formatFileTaskOutcomeNote";
import {
  DEFAULT_PIPELINE_DRAWER_ORDER,
  defaultPipelineDrawerLayout,
  normalizePipelineDrawerLayout,
  resolveDrawerLayoutForHydration,
  type PipelineDrawerLayoutV1,
} from "../lib/pipelineDrawerLayoutStorage";
import type { Doc, Id } from "../convex/_generated/dataModel";
import {
  BLOCK_SYNC_BEHAVIOR_KEYS,
  mergeBlockSyncBehaviorIntoSettings,
  parseBlockSyncBehavior,
} from "../lib/blockSyncBehaviorSettings";
import { getEffectiveMandatoryPipelineBlockIds } from "../lib/pipelineGlobalBlockPolicy";
import { getMandatoryPipelineBlockIds } from "../lib/pipelineBlockRegistry";
import {
  getDefaultUserPreferences,
  mergeServerUserPreferences,
  mergeUserPreferencesPatch,
} from "../lib/userPreferencesModel";
import {
  getPipelineFileTemplate,
  applyCatalogFileTemplateToLayout,
} from "../lib/pipelineFileTemplates";
import { evaluateFileHealthTier } from "../lib/pipelineFileInsights";
import {
  sanitizeUserSimpleWorkflowRules,
  userWorkflowTriggerMatches,
} from "../lib/userWorkflowsModel";
import {
  drawerLayoutAuditTargetsChanged,
} from "../lib/pipelineFileActivityModel";
import { buildPipelineDrawerMetricsContext } from "../lib/file/fileSectionMetrics";
import {
  applyPipelineFileExpandUxToExpanded,
  parsePipelineFileExpandUxRules,
  PIPELINE_FILE_EXPAND_UX_KEY,
  readPipelineFileExpandUxRules,
} from "../lib/pipelineFileExpandUx";
import {
  applyUserPreferencesToNewFileDrawerLayout,
  buildNewFilePipelineMetricsContext,
  coerceUserDrawerPreferenceLists,
} from "../lib/userPreferencesNewFileDrawer";
import {
  evaluateAutomationCondition,
  PIPELINE_BLOCK_AUTOMATION_RULES,
  triggerMatchesEvent,
} from "../lib/pipelineBlockAutomation";
import {
  buildLenderScenarioSeed,
  unhideDealWorkspaceTabInDealData,
} from "../lib/dealDataAutomationHelpers";
import {
  AUTO_ARCHIVE_CRON_ENABLED,
  AUTO_ARCHIVE_PRESET_DAYS,
  AUTO_ARCHIVE_SWEEP_BATCH,
  autoArchiveFieldsForActivity,
  computeAutoArchiveAfterAt,
  dueIndexPatchWhenNotActuallyDue,
  formatAutoArchiveRemainingShort,
  isAutoArchiveDue,
  lastPipelineActivityAt,
  MS_PER_DAY,
  normalizeAutoArchiveInactivityDays,
  remainingAutoArchiveMs,
  shouldChainAutoArchiveSweep,
} from "../lib/pipelineAutoArchive";
import { DURABLE_JOB_BACKUP_SWEEP_MINUTES } from "../lib/convexCronIntervals";

let passed = 0;
function test(name: string, fn: () => void) {
  try {
    fn();
    passed += 1;
    console.log(`ok — ${name}`);
  } catch (e) {
    console.error(`FAIL — ${name}`);
    throw e;
  }
}

test("pipeline auto-archive: presets, custom clamp, inactivity clock", () => {
  assert.deepEqual([...AUTO_ARCHIVE_PRESET_DAYS], [15, 30, 45, 60]);
  assert.equal(normalizeAutoArchiveInactivityDays(30), 30);
  assert.equal(normalizeAutoArchiveInactivityDays(90.4), 90);
  assert.equal(normalizeAutoArchiveInactivityDays(0), null);
  assert.equal(normalizeAutoArchiveInactivityDays(731), null);

  const last = Date.UTC(2026, 0, 1);
  assert.equal(lastPipelineActivityAt({ updatedAt: last, createdAt: 1 }), last);
  assert.equal(lastPipelineActivityAt({ createdAt: 42 }), 42);

  const due = computeAutoArchiveAfterAt(last, 30);
  assert.equal(due, last + 30 * MS_PER_DAY);

  assert.equal(
    isAutoArchiveDue({
      now: last + 29 * MS_PER_DAY,
      lastActivityAt: last,
      inactivityDays: 30,
    }),
    false,
  );
  assert.equal(
    isAutoArchiveDue({
      now: last + 30 * MS_PER_DAY,
      lastActivityAt: last,
      inactivityDays: 30,
    }),
    true,
  );
  assert.equal(
    isAutoArchiveDue({
      now: last + 40 * MS_PER_DAY,
      lastActivityAt: last,
      inactivityDays: 30,
      archivedAt: last + 1,
    }),
    false,
  );

  const refreshed = last + 10 * MS_PER_DAY;
  assert.equal(
    isAutoArchiveDue({
      now: last + 30 * MS_PER_DAY,
      lastActivityAt: refreshed,
      inactivityDays: 30,
    }),
    false,
  );
  assert.deepEqual(autoArchiveFieldsForActivity({ autoArchiveInactivityDays: 15 }, refreshed), {
    autoArchiveAfterAt: refreshed + 15 * MS_PER_DAY,
  });
  assert.deepEqual(autoArchiveFieldsForActivity({}, refreshed), {});
  assert.deepEqual(
    autoArchiveFieldsForActivity(
      { autoArchiveInactivityDays: 15, archivedAt: refreshed },
      refreshed,
    ),
    {},
  );

  assert.equal(
    formatAutoArchiveRemainingShort(
      remainingAutoArchiveMs({
        now: last + 28 * MS_PER_DAY,
        lastActivityAt: last,
        inactivityDays: 30,
      }),
    ),
    "2d",
  );
  assert.equal(
    formatAutoArchiveRemainingShort(
      remainingAutoArchiveMs({
        now: last + 30 * MS_PER_DAY,
        lastActivityAt: last,
        inactivityDays: 30,
      }),
    ),
    "Due",
  );
});

test("pipeline auto-archive: no cron chain; stuck due rows leave the index", () => {
  assert.equal(AUTO_ARCHIVE_CRON_ENABLED, false);
  assert.equal(shouldChainAutoArchiveSweep(64), false);
  assert.equal(shouldChainAutoArchiveSweep(0), false);
  assert.equal(AUTO_ARCHIVE_SWEEP_BATCH, 64);

  const last = Date.UTC(2026, 0, 1);
  const now = last + 40 * MS_PER_DAY;
  assert.deepEqual(
    dueIndexPatchWhenNotActuallyDue({
      now,
      lastActivityAt: last + 20 * MS_PER_DAY,
      inactivityDays: 30,
    }),
    { kind: "reschedule", autoArchiveAfterAt: last + 50 * MS_PER_DAY },
  );
  assert.deepEqual(
    dueIndexPatchWhenNotActuallyDue({
      now,
      lastActivityAt: 0,
      inactivityDays: 30,
    }),
    { kind: "clear" },
  );
});

test("durable job backup sweeps are 15 minutes, not every minute", () => {
  assert.equal(DURABLE_JOB_BACKUP_SWEEP_MINUTES, 15);
});

test("fileTaskOutcomeHeadline: complete and delete prefixes", () => {
  assert.equal(
    fileTaskOutcomeHeadline("complete", "  Call borrower  "),
    "Completed task: Call borrower",
  );
  assert.equal(
    fileTaskOutcomeHeadline("delete", ""),
    "Deleted task: Untitled task",
  );
});

test("formatFileTaskOutcomeNote: empty / whitespace → null", () => {
  assert.equal(formatFileTaskOutcomeNote("complete", "Call borrower"), null);
  assert.equal(formatFileTaskOutcomeNote("delete", "Call borrower", "   "), null);
  assert.equal(formatFileTaskOutcomeNote("complete", "Call borrower", null), null);
});

test("formatFileTaskOutcomeNote: prefixes user note for file Notes block", () => {
  assert.equal(
    formatFileTaskOutcomeNote("complete", "Call borrower", "Left voicemail"),
    "Completed task: Call borrower\n\nLeft voicemail",
  );
  assert.equal(
    formatFileTaskOutcomeNote("delete", "Send LOI", "  Duplicate  "),
    "Deleted task: Send LOI\n\nDuplicate",
  );
});

test("mergePartialCoverOnPatch: undefined/null patch → undefined", () => {
  assert.equal(mergePartialCoverOnPatch({ a: 1 }, undefined), undefined);
  assert.equal(mergePartialCoverOnPatch({ a: 1 }, null), undefined);
});

test("mergePartialCoverOnPatch: non-object patch replaces", () => {
  assert.deepEqual(mergePartialCoverOnPatch({ a: 1 }, "x" as unknown), "x");
});

test("mergePartialCoverOnPatch: shallow merge preserves keys", () => {
  assert.deepEqual(mergePartialCoverOnPatch({ fundingAmount: "100", note: "n" }, { fundingAmount: "200" }), {
    fundingAmount: "200",
    note: "n",
  });
  assert.deepEqual(mergePartialCoverOnPatch(undefined, { x: 1 }), { x: 1 });
});

test("mergePartialSubjectPropertyOnPatch: string → address", () => {
  assert.deepEqual(mergePartialSubjectPropertyOnPatch({}, "  123 Main  "), {
    address: "123 Main",
  });
});

test("mergePartialSubjectPropertyOnPatch: object merge + empty existing", () => {
  assert.deepEqual(
    mergePartialSubjectPropertyOnPatch(null, { city: "Austin", address: "1" }),
    { city: "Austin", address: "1" },
  );
});

test("mergePatchIntoDeal: rapid overlay last-wins", () => {
  let base: Record<string, unknown> = { x: 1 };
  for (let i = 0; i < 500; i += 1) {
    base = mergePatchIntoDeal(base, { x: i, y: i % 7 });
  }
  assert.equal(base.x, 499);
  assert.equal(base.y, 499 % 7);
});

test("derivePrimaryFundingAmountFromDealPayload: missing → undefined", () => {
  assert.equal(derivePrimaryFundingAmountFromDealPayload({}), undefined);
});

test("derivePrimaryFundingAmountFromDealPayload: cover / commercial / HM / business / scenario / loans", () => {
  assert.equal(
    derivePrimaryFundingAmountFromDealPayload({ cover: { fundingAmount: "$350,000" } }),
    350_000,
  );
  assert.equal(
    derivePrimaryFundingAmountFromDealPayload({ commercial: { fundingAmount: "not-money" } }),
    undefined,
  );
  assert.equal(
    derivePrimaryFundingAmountFromDealPayload({
      hardMoney: { initialLoan: "100k", rehabHoldback: "50,000" },
    }),
    100 + 50_000,
  );
  assert.equal(
    derivePrimaryFundingAmountFromDealPayload({
      hardMoney: { initialLoan: "100000", rehabHoldback: "50000" },
    }),
    150_000,
  );
  assert.equal(
    derivePrimaryFundingAmountFromDealPayload({ business: { requestedAmount: "250000" } }),
    250_000,
  );
  assert.equal(
    derivePrimaryFundingAmountFromDealPayload({ scenario: { proposedLoanAmount: "400000" } }),
    400_000,
  );
  assert.equal(
    derivePrimaryFundingAmountFromDealPayload({
      loans: [{ fundingAmount: "125000" }, { fundingAmount: "999" }],
    }),
    125_000,
  );
});

test("derivePrimaryFundingAmountFromDealPayload: rejects non-positive and NaN strings", () => {
  assert.equal(derivePrimaryFundingAmountFromDealPayload({ cover: { fundingAmount: "0" } }), undefined);
  assert.equal(derivePrimaryFundingAmountFromDealPayload({ cover: { fundingAmount: "-5" } }), undefined);
  assert.equal(derivePrimaryFundingAmountFromDealPayload({ cover: { fundingAmount: "nope" } }), undefined);
});

test("derivePrimaryFundingAmountFromDealPayload: ignores legacy cover loanAmount key", () => {
  assert.equal(
    derivePrimaryFundingAmountFromDealPayload({
      cover: { fundingAmount: "", loanAmount: "450000" },
    }),
    undefined,
  );
});

test("isEmbeddedDealDataPresent", () => {
  assert.equal(isEmbeddedDealDataPresent(null), false);
  assert.equal(isEmbeddedDealDataPresent([]), false);
  assert.equal(isEmbeddedDealDataPresent({}), true);
});

test("embeddedDealPayloadIsSubstantive", () => {
  assert.equal(embeddedDealPayloadIsSubstantive(null), false);
  assert.equal(embeddedDealPayloadIsSubstantive({}), false);
  assert.equal(embeddedDealPayloadIsSubstantive({ updatedAt: 1 }), false);
  assert.equal(
    embeddedDealPayloadIsSubstantive({ updatedAt: 1, fundingType: "DSCR" }),
    true,
  );
  assert.equal(embeddedDealPayloadIsSubstantive({ clientName: "x" }), true);
});

test("intakeRowToDealPayload strips Convex metadata", () => {
  const row = {
    _id: "k123" as never,
    _creationTime: 1,
    leadId: "L1",
  };
  const p = intakeRowToDealPayload(row as never);
  assert.equal("_id" in p, false);
  assert.equal("_creationTime" in p, false);
  assert.equal(p.leadId, "L1");
});

test("toNumber / parseRate: empty and garbage", () => {
  assert.equal(toNumber(""), 0);
  assert.equal(toNumber(undefined), 0);
  assert.equal(toNumber("—$1,234.50xx"), 1234.5);
  assert.equal(parseRate(""), 0);
  assert.equal(parseRate("6.5%"), 0.065);
  assert.equal(parseRate("0.065"), 0.065);
  assert.equal(parseRate("not"), 0);
});

test("monthlyPayment: zero principal / zero rate / zero months", () => {
  assert.equal(monthlyPayment(0, 0.06, 360), 0);
  assert.equal(monthlyPayment(100_000, 0, 360), 100_000 / 360);
  assert.equal(monthlyPayment(100_000, 0.06, 0), 0);
});

test("formatUSD / formatPct: non-finite", () => {
  assert.equal(formatUSD(Number.NaN), "—");
  assert.equal(formatPct(Number.POSITIVE_INFINITY), "—");
});

test("buildAmortization: caps at maxRows under heavy principal", () => {
  const { rows } = buildAmortization({
    fundingAmount: 1_000_000,
    annualRate: 0.07,
    periodYears: 30,
    maxRows: 50,
  });
  assert.equal(rows.length <= 50, true);
});

test("computeDtiMetrics: empty incomes / missing debts", () => {
  const m = computeDtiMetrics({
    incomes: [],
    debts: {},
    purchasePrice: "",
    downPaymentPct: "",
    fundingAmount: "",
    termMonths: "",
    interestRate: "",
    propertyTaxRate: "",
    propertyTaxesMonthly: "",
    homeownersInsuranceMonthly: "",
    hoa: "",
    fhaMiMonthly: "",
  } as Parameters<typeof computeDtiMetrics>[0]);
  assert.equal(m.grossIncome, 0);
  assert.equal(m.frontDti, 0);
  assert.equal(m.backDti, 0);
  assert.ok(Number.isFinite(m.pi));
});

test("computeComparisonLoanSideMetrics: partial inputs", () => {
  const a = computeComparisonLoanSideMetrics({});
  assert.equal(a.loan, 0);
  assert.equal(a.months, 360);
  const b = computeComparisonLoanSideMetrics({
    fundingAmount: "x",
    ratePct: "",
    termMonths: "0",
  });
  assert.equal(b.loan, 0);
  assert.equal(b.months, 360);
});

test("moneyAggregates: large row arrays", () => {
  const n = 20_000;
  const rows = Array.from({ length: n }, (_, i) => ({
    monthlyAmount: String(i % 1000),
    estimatedValue: String((i * 7) % 500000),
    monthlyPayment: String(i % 500),
    balance: String(i % 200000),
  }));
  const inc = sumIncomeRowsMonthly(rows);
  const ast = sumAssetsEstimatedValue(rows);
  const liq = sumLiabilitiesMonthlyPayments(rows);
  const bal = sumLiabilitiesBalances(rows);
  assert.ok(Number.isFinite(inc) && inc >= 0);
  assert.ok(Number.isFinite(ast) && ast >= 0);
  assert.ok(Number.isFinite(liq) && liq >= 0);
  assert.ok(Number.isFinite(bal) && bal >= 0);
});

test("weighted interest: empty and unbalanced", () => {
  assert.equal(computeWeightedAverageRateByBalance([]), 0);
  assert.equal(computeWeightedAverageRateByBalance([{ balance: "0", ratePct: "5%" }]), 0);
  assert.equal(sumWeightedInterestMonthlyPayments([{ monthlyPayment: "" }]), 0);
});

test("business debt totals exclude inactive rows", () => {
  const totals = computeBusinessDebtScheduleTotals([
    {
      account: "MCA Co",
      originalAmount: "100000",
      balance: "80000",
      monthlyPayment: "4000",
      include: true,
    },
    {
      account: "Old LOC",
      originalAmount: "50000",
      balance: "20000",
      monthlyPayment: "500",
      include: false,
    },
  ]);
  assert.equal(totals.originalAmount, 100000);
  assert.equal(totals.presentBalance, 80000);
  assert.equal(totals.monthlyPayment, 4000);
});

test("business debt Other type label and completeness", () => {
  assert.equal(
    formatBusinessDebtTypeLabel({ debtType: "Other", debtTypeOther: "Factor" }),
    "Other — Factor",
  );
  assert.equal(
    businessDebtRowIsComplete({
      account: "Bank",
      debtType: "Term Loan",
      originalAmount: "250000",
      originationDate: "2024-01-01",
      balance: "180000",
      ratePct: "9.5",
      maturityDate: "2028-01-01",
      monthlyPayment: "3200",
    }),
    true,
  );
  assert.equal(
    businessDebtRowIsComplete({
      account: "Vendor X",
      debtType: "Other",
      originalAmount: "10000",
      originationDate: "2024-01-01",
      balance: "8000",
      ratePct: "1.2",
      maturityDate: "2025-01-01",
      monthlyPayment: "900",
    }),
    false,
  );
});

test("business debt copy-to-file keeps destination rows and block assignees", () => {
  const plan = planBusinessDebtCopy({
    mode: "block",
    sourceRows: [
      { account: "MCA Co", balance: "80k", monthlyPayment: "4k", include: true },
    ],
    sourceMeta: { assignedContactIds: ["c1", "c1", "c2"] },
  });
  assert.equal(plan.copyBlockAssignees, true);
  assert.deepEqual(plan.meta.assignedContactIds, ["c1", "c2"]);
  const merged = applyBusinessDebtCopyPlan({
    targetRows: [{ account: "Existing", balance: "10", monthlyPayment: "1" }],
    targetMeta: { assignedContactIds: ["c9"] },
    plan,
  });
  assert.equal(merged.rows.length, 2);
  assert.equal(merged.rows[0]?.account, "Existing");
  assert.equal(merged.rows[1]?.account, "MCA Co");
  assert.ok(merged.rows[1]?.rowId);
  assert.equal(merged.rows[1]?.rowId, plan.rows[0]?.rowId);
  assert.deepEqual(merged.meta.assignedContactIds, ["c9", "c1", "c2"]);

  const rowPlan = planBusinessDebtCopy({
    mode: "rows",
    sourceRows: [
      { account: "A", balance: "1", monthlyPayment: "1" },
      { account: "B", balance: "2", monthlyPayment: "2" },
    ],
    rowIndexes: [1],
  });
  assert.equal(rowPlan.copyBlockAssignees, false);
  assert.equal(rowPlan.rows.length, 1);
  assert.equal(rowPlan.rows[0]?.account, "B");
});

test("sanitizeDealBusinessDebtRow keeps every schedule field and drops extras", () => {
  const row = sanitizeDealBusinessDebtRow({
    rowId: "bd-1",
    account: "MCA Co",
    debtType: "mca",
    debtTypeOther: "",
    originalAmount: 100000,
    originationDate: "01/15/2023",
    balance: "80000",
    ratePct: "1.29",
    maturityDate: "2025-06-01T00:00:00.000Z",
    monthlyPayment: "4200",
    note: "1st",
    include: true,
    assignedContactIds: ["c9", "c9"],
    ghost: true,
  });
  assert.equal(row.account, "MCA Co");
  assert.equal(row.debtType, "MCA");
  assert.equal(row.originalAmount, "100000");
  assert.equal(row.originationDate, "2023-01-15");
  assert.equal(row.balance, "80000");
  assert.equal(row.ratePct, "1.29");
  assert.equal(row.maturityDate, "2025-06-01");
  assert.equal(row.monthlyPayment, "4200");
  assert.equal(row.note, "1st");
  assert.equal(row.include, true);
  assert.deepEqual(row.assignedContactIds, ["c9"]);
  assert.equal((row as { ghost?: boolean }).ghost, undefined);
});

test("business debt Other fill-in persists and date inputs normalize", () => {
  assert.equal(normalizeBusinessDebtType("line of credit"), "Line of Credit");
  const other = sanitizeDealBusinessDebtRow({
    account: "Vendor X",
    debtType: "Other",
    debtTypeOther: "Factor advance",
    originalAmount: "10000",
    originationDate: "3/1/24",
    balance: "8000",
    ratePct: "1.2",
    maturityDate: "1/1/25",
    monthlyPayment: "900",
  });
  assert.equal(other.debtType, "Other");
  assert.equal(other.debtTypeOther, "Factor advance");
  assert.equal(toHtmlDateInputValue(other.originationDate), "2024-03-01");
  assert.equal(toHtmlDateInputValue(other.maturityDate), "2025-01-01");
  assert.equal(businessDebtRowIsComplete(other), true);
  assert.equal(
    businessDebtRowIsComplete({ ...other, debtTypeOther: "" }),
    false,
  );
});

test("ensureDealBusinessDebtRowId is stable", () => {
  const a = ensureDealBusinessDebtRowId({ account: "Bank", rowId: "bd-keep" });
  assert.equal(ensureDealBusinessDebtRowId(a).rowId, "bd-keep");
});

test("business debt CRM round-trip keeps type, dates, rate, and amounts", () => {
  const deal = sanitizeDealBusinessDebtRow({
    account: "SBA Lender",
    debtType: "sba",
    originalAmount: "500000",
    originationDate: "06/01/2023",
    balance: "410000",
    ratePct: "11",
    maturityDate: "6/1/2030",
    monthlyPayment: "6200",
    note: "1st",
  });
  const shape = businessDebtRowToScheduleShape(deal, 0);
  const back = businessDebtScheduleToDealRow(shape);
  assert.equal(shape.creditor, "SBA Lender");
  assert.equal(shape.debtType, "SBA");
  assert.equal(shape.originalAmount, "500000");
  assert.equal(shape.originationDate, "2023-06-01");
  assert.equal(shape.ratePct, "11");
  assert.equal(shape.maturityDate, "2030-06-01");
  assert.equal(shape.position, "1st");
  assert.equal(back.account, "SBA Lender");
  assert.equal(back.debtType, "SBA");
  assert.equal(back.originationDate, "2023-06-01");
  assert.equal(back.maturityDate, "2030-06-01");
  assert.equal(back.include, true);
});

test("business debt CRM shape maps new schedule fields", () => {
  const shape = businessDebtRowToScheduleShape(
    {
      account: "SBA Lender",
      debtType: "SBA",
      originalAmount: "500000",
      originationDate: "2023-06-01",
      balance: "410000",
      ratePct: "11",
      maturityDate: "2030-06-01",
      monthlyPayment: "6200",
      note: "1st",
    },
    0,
  );
  assert.equal(shape.creditor, "SBA Lender");
  assert.equal(shape.debtType, "SBA");
  assert.equal(shape.originalAmount, "500000");
  assert.equal(shape.originationDate, "2023-06-01");
  assert.equal(shape.ratePct, "11");
  assert.equal(shape.maturityDate, "2030-06-01");
  assert.equal(shape.position, "1st");
});

test("parseDealWorkspaceLayoutFromUnknown: null / junk / duplicate ids", () => {
  const a = parseDealWorkspaceLayoutFromUnknown(null);
  assert.equal(a.v, 1);
  assert.ok(a.order.length > 3);
  const b = parseDealWorkspaceLayoutFromUnknown({
    v: 1,
    order: ["cover", "cover", "not-a-tab", 99],
    hidden: ["cover", "not-a-tab"],
    expanded: { cover: true, bogus: true, scenario: "no" as unknown as boolean },
  });
  assert.ok(b.order.includes("cover"));
  assert.equal(b.order.filter((x) => x === "cover").length, 1);
});

test("moveDealWorkspaceTab: bounds", () => {
  const order: DealTabId[] = ["cover", "scenario", "overview"];
  assert.deepEqual(moveDealWorkspaceTab(order, "cover", -1), order);
  assert.deepEqual(moveDealWorkspaceTab(order, "overview", 1), order);
  const swapped = moveDealWorkspaceTab(order, "scenario", -1);
  assert.deepEqual(swapped, ["scenario", "cover", "overview"]);
});

test("mergeIntakeDraftWithServer: null prev seeds incoming", () => {
  const inc = { a: 1, b: 2 };
  assert.deepEqual(mergeIntakeDraftWithServer(null, inc, new Set()), inc);
});

test("mergeIntakeDraftWithServer: pending keys preserved on server push", () => {
  const prev = { notes: "local", leadId: "A" };
  const incoming = { notes: "server", leadId: "B" };
  const pending = new Set(["notes"]);
  const out = mergeIntakeDraftWithServer(prev, incoming, pending);
  assert.equal(out.notes, "local");
  assert.equal(out.leadId, "B");
});

test("mergeIntakeDraftWithServer: no change returns same reference", () => {
  const prev = { x: 1 };
  const incoming = { x: 1 };
  assert.equal(mergeIntakeDraftWithServer(prev, incoming, new Set()), prev);
});

test("mergeIntakeDraftWithServer: stress interleaved server updates", () => {
  type Row = { v: number; meta: string };
  let draft: Row | null = null;
  for (let i = 0; i < 1000; i += 1) {
    const pending = i % 3 === 0 ? new Set<string>(["v"]) : new Set<string>();
    const server: Row = { v: i, meta: `s${i}` };
    draft = mergeIntakeDraftWithServer(draft, server, pending);
  }
  assert.ok(draft && typeof draft.v === "number");
});

test("isDealBackedPipelineRow: preview boolean OR linked id OR raw dealData", () => {
  assert.equal(isDealBackedPipelineRow({ hasEmbeddedDealData: false, intakeSheetId: "k1" as never }), true);
  assert.equal(isDealBackedPipelineRow({ hasEmbeddedDealData: true }), true);
  assert.equal(isDealBackedPipelineRow({ dealData: { x: 1 }, intakeSheetId: undefined }), true);
  assert.equal(isDealBackedPipelineRow({ dealData: {}, intakeSheetId: undefined }), false);
  assert.equal(isDealBackedPipelineRow({ dealData: {}, intakeSheetId: "k1" as never }), true);
  assert.equal(isDealBackedPipelineRow({ dealData: null, intakeSheetId: undefined }), false);
});

test("buildSubjectAddressDisplay + buildDealCommitRow alignment", () => {
  const pipeline = {
    _id: "p1" as never,
    propertyAddress: "Legacy line",
  };
  const intake = {
    subjectProperty: { address: "1 Main", city: "Austin", state: "TX", zip: "78701" },
  } as never;
  assert.equal(
    buildSubjectAddressDisplay(intake, pipeline as never),
    "1 Main, Austin, TX 78701",
  );
  const row = buildDealCommitRow(
    { ...pipeline, dealData: { cover: {} } } as never,
    null,
  );
  assert.equal(subjectAddressEditorValue(row), "Legacy line");
});

test("resolvePipelineTableFundingAmount: cover + scenario chain then pipeline", () => {
  const pipeline = { fundingAmount: 99_000 };
  const intakeBase = {
    cover: {},
    scenario: { proposedLoanAmount: "450000" },
    loans: [],
    borrowers: [],
    incomeRows: [],
    assets: [],
    liabilities: [],
    workflow: [],
    clientName: "A",
    projectName: "B",
  };
  assert.equal(resolvePipelineTableFundingAmount(intakeBase as never, pipeline as never), 450_000);
  const intakeCover = { ...intakeBase, cover: { fundingAmount: "320000" } };
  assert.equal(resolvePipelineTableFundingAmount(intakeCover as never, pipeline as never), 320_000);
  assert.equal(resolvePipelineTableFundingAmount(null, { fundingAmount: 12 }), 12);
  const intakeCoverWins = { ...intakeBase, cover: { fundingAmount: "300000" } };
  assert.equal(
    resolvePipelineTableFundingAmount(intakeCoverWins as never, { fundingAmount: 45 } as never),
    300_000,
  );
  const intakeClearedCover = { ...intakeBase, cover: { fundingAmount: "" } };
  assert.equal(
    resolvePipelineTableFundingAmount(intakeClearedCover as never, pipeline as never),
    0,
  );
  const intakeExplicitZero = { ...intakeBase, cover: { fundingAmount: "0" } };
  assert.equal(
    resolvePipelineTableFundingAmount(intakeExplicitZero as never, pipeline as never),
    0,
  );
});

test("pickIntakeShapedPreviewPayload: prefers newer snapshot when both exist", () => {
  type P = { updatedAt?: number; _creationTime: number };
  const older: P = { updatedAt: 100, _creationTime: 1 };
  const newer: P = { updatedAt: 200, _creationTime: 2 };
  assert.equal(pickIntakeShapedPreviewPayload(older, newer, 999), newer);
  assert.equal(pickIntakeShapedPreviewPayload(newer, older, 999), newer);
  const newest: P = { updatedAt: 300, _creationTime: 1 };
  const mid: P = { updatedAt: 200, _creationTime: 2 };
  assert.equal(pickIntakeShapedPreviewPayload(newest, mid, 999), newest);
});

test("pickIntakeShapedPreviewPayload: tie prefers linked (canonical row)", () => {
  const a = { updatedAt: 100, _creationTime: 1 };
  const b = { updatedAt: 100, _creationTime: 2 };
  assert.equal(pickIntakeShapedPreviewPayload(a, b, 999), b);
  assert.equal(pickIntakeShapedPreviewPayload(b, a, 999), a);
});

test("pickIntakeShapedPreviewPayload: embedded without updatedAt uses _creationTime not pipeline row", () => {
  type P = { updatedAt?: number; _creationTime: number };
  const embedded: P = { _creationTime: 1 };
  const linked: P = { updatedAt: 50, _creationTime: 2 };
  assert.equal(
    pickIntakeShapedPreviewPayload(embedded, linked, 100),
    linked,
  );
  assert.equal(
    pickIntakeShapedPreviewPayload(embedded, linked, 40),
    linked,
  );
  const newerEmbedded: P = { updatedAt: 200, _creationTime: 1 };
  assert.equal(
    pickIntakeShapedPreviewPayload(newerEmbedded, linked, 999),
    newerEmbedded,
  );
});

test("pickIntakeShapedPreviewPayload: single side", () => {
  type P = { updatedAt?: number; _creationTime: number };
  const a: P = { updatedAt: 1, _creationTime: 0 };
  assert.equal(pickIntakeShapedPreviewPayload(a, null, 0), a);
  assert.equal(pickIntakeShapedPreviewPayload(null, a, 0), a);
  assert.equal(pickIntakeShapedPreviewPayload(null, null, 0), null);
});

test("parseConvexPublicUrl: local http, hosted https, reject bad", () => {
  const local = parseConvexPublicUrl("http://127.0.0.1:3210");
  assert.equal(local.ok, true);
  if (local.ok) {
    assert.equal(local.kind, "local");
    assert.equal(local.href, "http://127.0.0.1:3210");
    assert.equal(convexHttpActionsBaseUrl(local.href), local.href);
  }
  const localSlash = parseConvexPublicUrl("http://127.0.0.1:3210/");
  assert.equal(localSlash.ok, true);
  if (localSlash.ok) {
    assert.equal(localSlash.href, "http://127.0.0.1:3210");
  }
  const loc2 = parseConvexPublicUrl("http://localhost:9999");
  assert.equal(loc2.ok, true);
  if (loc2.ok) assert.equal(loc2.kind, "local");

  const cloud = parseConvexPublicUrl("https://happy-animal-123.convex.cloud");
  assert.equal(cloud.ok, true);
  if (cloud.ok) {
    assert.equal(cloud.kind, "remote");
    assert.equal(cloud.href, "https://happy-animal-123.convex.cloud");
    assert.equal(
      convexHttpActionsBaseUrl(cloud.href),
      "https://happy-animal-123.convex.site",
    );
  }

  assert.equal(parseConvexPublicUrl(undefined).ok, false);
  assert.equal(parseConvexPublicUrl("").ok, false);
  assert.equal(parseConvexPublicUrl("   ").ok, false);
  assert.equal(parseConvexPublicUrl("not-a-url").ok, false);
  assert.equal(parseConvexPublicUrl("http://evil.com").ok, false);
  assert.equal(parseConvexPublicUrl("javascript:alert(1)").ok, false);
});

// ---------- Parallel block rendering (pre–UI-replace validation) ----------

test("parallel blocks: every registry id resolves via getPipelineBlock", () => {
  for (const id of PIPELINE_BLOCK_IDS) {
    const b = getPipelineBlock(id);
    assert.equal(b.blockId, id);
    assert.ok(b.label.length > 0);
    assert.ok(b.componentReference.startsWith("components/"));
  }
});

test("getActivePipelineBlockIdsForFile: matches layout order minus hidden", () => {
  const layout = defaultPipelineDrawerLayout();
  const active = getActivePipelineBlockIdsForFile({
    layout,
    disabledBlockIds: undefined,
  });
  const expected = layout.order.filter((x) => !layout.hidden.includes(x));
  assert.deepEqual(active, expected);
  const uniq = new Set(active);
  assert.equal(uniq.size, active.length);
});

test("getActivePipelineBlockIdsForFile: hidden sections omitted", () => {
  const layout = normalizePipelineDrawerLayout({
    v: 1,
    order: [...DEFAULT_PIPELINE_DRAWER_ORDER],
    hidden: ["archive", "dangerZone"],
    expanded: {},
  });
  const active = getActivePipelineBlockIdsForFile({
    layout,
    disabledBlockIds: [],
  });
  assert.ok(!active.includes("archive"));
  assert.ok(!active.includes("dangerZone"));
});

test("getActivePipelineBlockIdsForFile: global disable filters", () => {
  const layout = defaultPipelineDrawerLayout();
  const active = getActivePipelineBlockIdsForFile({
    layout,
    disabledBlockIds: ["contacts", "tasks"],
  });
  assert.ok(!active.includes("contacts"));
  assert.ok(!active.includes("tasks"));
  assert.ok(active.includes("fileDetails"));
});

test("getActivePipelineBlockIdsForFile: all blocks disabled → empty list", () => {
  const layout = defaultPipelineDrawerLayout();
  const active = getActivePipelineBlockIdsForFile({
    layout,
    disabledBlockIds: [...PIPELINE_BLOCK_IDS],
  });
  assert.deepEqual(active, []);
});

test("extractDrawerVisibilitySignals: root dealType and fundingType precedence", () => {
  assert.deepEqual(extractDrawerVisibilitySignals({}), {
    dealTypeNorm: "",
    fundingTypeNorm: "",
  });
  assert.deepEqual(
    extractDrawerVisibilitySignals({
      dealType: "Refinance",
      fundingType: "conv",
    }),
    { dealTypeNorm: "refinance", fundingTypeNorm: "conv" },
  );
  assert.deepEqual(
    extractDrawerVisibilitySignals({ scenario: { fundingType: "Investor" } }),
    { dealTypeNorm: "", fundingTypeNorm: "investor" },
  );
  assert.deepEqual(
    extractDrawerVisibilitySignals({ cover: { fundingType: " DSCR " } }),
    { dealTypeNorm: "", fundingTypeNorm: "dscr" },
  );
  assert.deepEqual(
    extractDrawerVisibilitySignals({
      fundingType: "primary",
      scenario: { fundingType: "ignored" },
    }),
    { dealTypeNorm: "", fundingTypeNorm: "primary" },
  );
});

test("blockMeetsVisibilitySpec: all vs any", () => {
  const sig = { dealTypeNorm: "refinance", fundingTypeNorm: "conventional" };
  const specAll: PipelineBlockVisibilitySpec = {
    match: "all",
    conditions: [
      { path: "dealType", op: "containsIgnoreCase", value: "refin" },
      { path: "fundingType", op: "equalsIgnoreCase", value: "conventional" },
    ],
  };
  assert.equal(blockMeetsVisibilitySpec(specAll, sig), true);
  assert.equal(
    blockMeetsVisibilitySpec(specAll, { ...sig, fundingTypeNorm: "other" }),
    false,
  );
  const specAny: PipelineBlockVisibilitySpec = {
    match: "any",
    conditions: [
      { path: "dealType", op: "equalsIgnoreCase", value: "purchase" },
      { path: "fundingType", op: "startsWithIgnoreCase", value: "conv" },
    ],
  };
  assert.equal(blockMeetsVisibilitySpec(specAny, sig), true);
});

test("listHiddenBlocksEligibleToShow: skips blocks that fail contextual visibility", () => {
  const layout = normalizePipelineDrawerLayout({
    v: 1,
    order: [...DEFAULT_PIPELINE_DRAWER_ORDER],
    hidden: ["generateTerms", "fileDetails"],
    expanded: {},
  });
  const eligiblePurchase = listHiddenBlocksEligibleToShow({
    layout,
    visibilitySignals: {
      dealTypeNorm: "purchase",
      fundingTypeNorm: "conventional",
    },
  });
  assert.ok(!eligiblePurchase.includes("generateTerms"));
  const eligibleRefi = listHiddenBlocksEligibleToShow({
    layout,
    visibilitySignals: {
      dealTypeNorm: "refinance",
      fundingTypeNorm: "",
    },
  });
  assert.ok(eligibleRefi.includes("generateTerms"));
});

test("sanitizeDtiAiPatch: strips unknown keys", () => {
  const p = sanitizeDtiAiPatch({
    termMonths: "360",
    evil: "x",
    debts: { cars: "100", hack: "1" },
  });
  assert.ok(p);
  assert.equal(p!.termMonths, "360");
  assert.equal((p!.debts as { cars?: string }).cars, "100");
  assert.equal((p as { evil?: string }).evil, undefined);
});

test("sanitizeLenderCriteriaAiPatch: ownerOccupied enum", () => {
  const p = sanitizeLenderCriteriaAiPatch({
    ficoText: "720",
    ownerOccupied: "Investor",
  });
  assert.ok(p);
  assert.equal(p!.ficoText, "720");
  assert.equal(p!.ownerOccupied, "Investor");
});

test("buildLocalDealBlockSuggestions: dti back-end flag", () => {
  const s = buildLocalDealBlockSuggestions("dti", {
    grossIncome: 10_000,
    frontDti: 0.25,
    backDti: 0.5,
  });
  assert.ok(s.some((x) => x.suggestionKind === "insight"));
});

test("buildDtiToolAlerts: high back-end DTI", () => {
  const a = buildDtiToolAlerts({
    grossIncome: 5000,
    frontDti: 0.35,
    backDti: 0.48,
  });
  assert.ok(a.some((x) => x.id === "dti-back-high"));
});

test("buildCoverScenarioFundingAlerts: mismatch", () => {
  const a = buildCoverScenarioFundingAlerts({
    coverFunding: 400_000,
    scenarioProposed: 500_000,
  });
  assert.ok(a.some((x) => x.id === "funding-cover-scenario-mismatch"));
});

test("buildContactFileAlerts: empty file", () => {
  const a = buildContactFileAlerts({
    legacyContactCount: 0,
    linkedContactCount: 0,
  });
  assert.equal(a.length, 1);
  assert.equal(a[0]?.id, "contacts-missing");
});

test("buildPipelineFundingMirrorAlerts: drift", () => {
  const a = buildPipelineFundingMirrorAlerts({
    dealBacked: true,
    pipelineFunding: 400_000,
    resolvedFromDeal: 500_000,
  });
  assert.ok(a.length >= 1);
});

test("computeRuleBasedDrawerBlockSuggestions: refinance + hidden generateTerms", () => {
  const layout = normalizePipelineDrawerLayout({
    v: 1,
    order: [...DEFAULT_PIPELINE_DRAWER_ORDER],
    hidden: ["generateTerms"],
    expanded: {},
  });
  const candidates = listHiddenBlocksEligibleToShow({
    layout,
    visibilitySignals: {
      dealTypeNorm: "rate/term refinance",
      fundingTypeNorm: "conventional",
    },
  });
  const s = computeRuleBasedDrawerBlockSuggestions({
    dealData: { dealType: "Residential Mortgage", cover: { purpose: "Rate / Term" } },
    lenderCount: 0,
    legacyContactCount: 0,
    pipelineScenarioLine: "",
    candidates,
    focusedFieldPaths: [],
    topExpandedBlocks: [],
  });
  assert.ok(s.some((x) => x.blockId === "generateTerms"));
});

test("getActivePipelineBlockIdsForFile: visibilitySignals filters registry visibilityWhen", () => {
  const layout = defaultPipelineDrawerLayout();
  assert.ok(layout.order.includes("generateTerms"));
  assert.ok(layout.order.includes("feesSplits"));
  const purchaseConv = {
    dealTypeNorm: "purchase",
    fundingTypeNorm: "conventional",
  };
  const activeHidden = getActivePipelineBlockIdsForFile({
    layout,
    visibilitySignals: purchaseConv,
  });
  assert.ok(!activeHidden.includes("generateTerms"));
  assert.ok(!activeHidden.includes("feesSplits"));

  const refin = getActivePipelineBlockIdsForFile({
    layout,
    visibilitySignals: {
      dealTypeNorm: "cash-out refinance",
      fundingTypeNorm: "",
    },
  });
  assert.ok(refin.includes("generateTerms"));
  assert.ok(!refin.includes("feesSplits"));

  const investor = getActivePipelineBlockIdsForFile({
    layout,
    visibilitySignals: {
      dealTypeNorm: "purchase",
      fundingTypeNorm: "non-qm investor",
    },
  });
  assert.ok(investor.includes("feesSplits"));
});

test("getActivePipelineBlockIdsForFile: omitting visibilitySignals keeps conditional blocks", () => {
  const layout = defaultPipelineDrawerLayout();
  const active = getActivePipelineBlockIdsForFile({ layout });
  assert.ok(active.includes("generateTerms"));
  assert.ok(active.includes("feesSplits"));
});

test("sanitizeActivePipelineBlockIdsForRender: dedupes and drops unknown", () => {
  const raw = [
    "fileDetails",
    "fileDetails",
    "not-a-real-block",
    "dealWorkspace",
  ];
  assert.deepEqual(sanitizeActivePipelineBlockIdsForRender(raw), [
    "fileDetails",
    "dealWorkspace",
  ]);
});

test("normalizeFileSharedState: sparse pipeline-like row (multiple data states)", () => {
  const a = normalizeFileSharedStateFromPipeline({
    fundingAmount: undefined,
    rate: 6.5,
    term: "15 yr",
    notes: undefined,
    updatedAt: 100,
    fileSharedState: undefined,
  });
  assert.deepEqual(a, {
    fundingAmount: 0,
    interestRate: 6.5,
    term: "15 yr",
    notes: "",
    commission: 0,
    netRevenue: 0,
    updatedAt: 100,
  });

  const b = normalizeFileSharedStateFromPipeline({
    fundingAmount: 1_000_000,
    rate: 0,
    term: "",
    notes: "hello",
    updatedAt: 200,
    fileSharedState: {
      fundingAmount: 2_000_000,
      interestRate: 7,
      term: "30 yr",
      notes: "bus",
      updatedAt: 50,
    },
  });
  assert.equal(b.fundingAmount, 2_000_000);
  assert.equal(b.interestRate, 7);
  assert.equal(b.term, "30 yr");
  assert.equal(b.notes, "bus");
  assert.equal(b.updatedAt, 50);
  assert.equal(b.commission, 0);
  assert.equal(b.netRevenue, 0);

  const c = normalizeFileSharedStateFromPipeline({
    fundingAmount: 100,
    rate: 5,
    term: "t",
    notes: "",
    commission: 1,
    netRevenue: 2,
    updatedAt: 300,
    fileSharedState: {
      commission: 5000,
      netRevenue: 4000,
      updatedAt: 400,
    },
  });
  assert.equal(c.commission, 5000);
  assert.equal(c.netRevenue, 4000);
  assert.equal(c.updatedAt, 400);
});

test("normalizeFileSharedState: heals bus stuck at 0 when top-level mirror is set", () => {
  const healed = normalizeFileSharedStateFromPipeline({
    fundingAmount: 7_500_000,
    rate: 7.25,
    term: "30 yr fixed",
    notes: "note",
    commission: 12_000,
    netRevenue: 9_500,
    updatedAt: 100,
    fileSharedState: {
      fundingAmount: 0,
      interestRate: 0,
      term: "",
      notes: "",
      commission: 0,
      netRevenue: 0,
      updatedAt: 50,
    },
  });
  assert.equal(healed.fundingAmount, 7_500_000);
  assert.equal(healed.interestRate, 7.25);
  assert.equal(healed.term, "30 yr fixed");
  assert.equal(healed.notes, "note");
  assert.equal(healed.commission, 12_000);
  assert.equal(healed.netRevenue, 9_500);
});

test("materializeFileSharedStateOnPatch: in-flight top-level mirrors beat stale bus", () => {
  const existingBus = {
    fundingAmount: 0,
    interestRate: 0,
    term: "",
    notes: "",
    commission: 0,
    netRevenue: 0,
    updatedAt: 10,
  };
  const patch: {
    fundingAmount?: number;
    rate?: number;
    commission?: number;
    netRevenue?: number;
    term?: string;
    fileSharedState?: {
      fundingAmount?: number;
      interestRate?: number;
      term?: string;
      notes?: string;
      commission?: number;
      netRevenue?: number;
      updatedAt: number;
    };
  } = {
    fundingAmount: 7_500_000,
    rate: 7.25,
    commission: 12_000,
    netRevenue: 9_500,
    term: "30 yr fixed",
  };
  const merged = {
    fundingAmount: patch.fundingAmount,
    rate: patch.rate!,
    term: patch.term!,
    notes: "",
    commission: patch.commission,
    netRevenue: patch.netRevenue,
    updatedAt: 99,
    fileSharedState: existingBus,
  };
  materializeFileSharedStateOnPatch(patch, merged, 500);
  assert.ok(patch.fileSharedState);
  assert.equal(patch.fileSharedState!.fundingAmount, 7_500_000);
  assert.equal(patch.fileSharedState!.interestRate, 7.25);
  assert.equal(patch.fileSharedState!.commission, 12_000);
  assert.equal(patch.fileSharedState!.netRevenue, 9_500);
  assert.equal(patch.fileSharedState!.term, "30 yr fixed");
  assert.equal(patch.fileSharedState!.updatedAt, 500);

  const revenue = revenueTotalsFromPipelineRow({
    ...merged,
    fileSharedState: patch.fileSharedState,
  });
  assert.equal(revenue.fundingAmount, 7_500_000);
  assert.equal(revenue.commission, 12_000);
  assert.equal(revenue.netRevenue, 9_500);
});

test("patchWithConflictRetry: retries once without expectedUpdatedAt", async () => {
  let calls = 0;
  const result = await patchWithConflictRetry(
    { id: "p1", term: "30", expectedUpdatedAt: 100 },
    async (args) => {
      calls += 1;
      if (calls === 1) {
        assert.equal(args.expectedUpdatedAt, 100);
        throw new Error(
          "[CONVEX M(pipeline:patch)] [Request ID: 7bfb56523352ca45] Server Error\nUncaught Error: CONFLICT_DATA_CHANGED\n",
        );
      }
      assert.equal(args.expectedUpdatedAt, undefined);
      assert.equal(args.term, "30");
      return { ok: true as const };
    },
  );
  assert.equal(calls, 2);
  assert.equal(result.ok, true);
});

test("patchWithConflictRetry: retries production-redacted Server Error", async () => {
  let calls = 0;
  const result = await patchWithConflictRetry(
    { id: "p1", scenario: "Exit Strategy", expectedUpdatedAt: 42 },
    async (args) => {
      calls += 1;
      if (calls === 1) {
        assert.equal(args.expectedUpdatedAt, 42);
        // Production redacts Uncaught Error — only this wrapper reaches the client.
        throw new Error(
          "[CONVEX M(pipeline:patch)] [Request ID: db69a3097b0139b5] Server Error",
        );
      }
      assert.equal(args.expectedUpdatedAt, undefined);
      return { ok: true as const };
    },
  );
  assert.equal(calls, 2);
  assert.equal(result.ok, true);
});

test("patchWithConflictRetry: retries ConvexError conflict data", async () => {
  let calls = 0;
  const result = await patchWithConflictRetry(
    { id: "p1", scenario: "x", expectedUpdatedAt: 7 },
    async (args) => {
      calls += 1;
      if (calls === 1) {
        const err = new Error(
          "[CONVEX M(pipeline:patch)] [Request ID: x] Server Error",
        ) as Error & { data?: { code: string } };
        err.data = { code: "CONFLICT_DATA_CHANGED" };
        throw err;
      }
      assert.equal(args.expectedUpdatedAt, undefined);
      return { ok: true as const };
    },
  );
  assert.equal(calls, 2);
  assert.equal(result.ok, true);
});

test("patchWithConflictRetry: does not retry non-conflict errors", async () => {
  let calls = 0;
  await assert.rejects(
    () =>
      patchWithConflictRetry({ id: "p1", expectedUpdatedAt: 1 }, async () => {
        calls += 1;
        throw new Error("fundingAmount must be a non-negative number");
      }),
    /fundingAmount must be a non-negative number/,
  );
  assert.equal(calls, 1);
});

test("isTermOptionsOnlyPipelinePatch", () => {
  assert.equal(
    isTermOptionsOnlyPipelinePatch({
      id: "x",
      termOptions: [],
      preferencesAccountId: "a",
    }),
    true,
  );
  assert.equal(
    isTermOptionsOnlyPipelinePatch({ id: "x", term: "30", termOptions: [] }),
    false,
  );
  assert.equal(
    isTermOptionsOnlyPipelinePatch({
      id: "x",
      term: "12months",
      preferencesAccountId: "a",
      memberUserKey: "a",
    }),
    false,
  );
});

test("patchWithConflictRetry: term free-text survives redacted Server Error", async () => {
  let calls = 0;
  const result = await patchWithConflictRetry(
    { id: "p1", term: "12months", expectedUpdatedAt: 99 },
    async (args) => {
      calls += 1;
      if (calls === 1) {
        throw new Error(
          "[CONVEX M(pipeline:patch)] [Request ID: 0e56365204c62ef1] Server Error",
        );
      }
      assert.equal(args.expectedUpdatedAt, undefined);
      assert.equal(args.term, "12months");
      return { ok: true as const };
    },
  );
  assert.equal(calls, 2);
  assert.equal(result.ok, true);
});

test("convexClientErrorMessage: extracts CONFLICT_DATA_CHANGED", () => {
  const msg = convexClientErrorMessage(
    new Error(
      "[CONVEX M(pipeline:patch)] [Request ID: 7bfb56523352ca45] Server Error\nUncaught Error: CONFLICT_DATA_CHANGED\nCalled by client",
    ),
  );
  assert.match(msg, /updated elsewhere/i);
});

test("convexClientErrorMessage: extracts ArgumentValidationError", () => {
  const msg = convexClientErrorMessage(
    new Error(
      "[CONVEX M(pipeline:remove)] [Request ID: abc] Server Error\nArgumentValidationError: Object contains extra field `memberUserKey` that is not in the validator.\nCalled by client",
    ),
  );
  assert.match(msg, /memberUserKey/i);
  assert.doesNotMatch(msg, /Couldn't save/i);
});

test("convexClientErrorMessage: extracts ownership delete denial", () => {
  const msg = convexClientErrorMessage(
    new Error(
      "[CONVEX M(pipeline:remove)] [Request ID: abc] Server Error\nUncaught Error: Only the file owner can delete this file.\nCalled by client",
    ),
  );
  assert.match(msg, /Only the file owner/i);
});

test("materializeFileSharedStateOnPatch: preserves untouched bus fields", () => {
  const patch: {
    rate?: number;
    fileSharedState?: {
      fundingAmount?: number;
      interestRate?: number;
      term?: string;
      notes?: string;
      commission?: number;
      netRevenue?: number;
      updatedAt: number;
    };
  } = { rate: 6.5 };
  materializeFileSharedStateOnPatch(
    patch,
    {
      fundingAmount: 100_000,
      rate: 6.5,
      term: "15 yr",
      notes: "keep",
      commission: 1_000,
      netRevenue: 800,
      updatedAt: 20,
      fileSharedState: {
        fundingAmount: 250_000,
        interestRate: 0,
        term: "15 yr",
        notes: "keep",
        commission: 1_000,
        netRevenue: 800,
        updatedAt: 15,
      },
    },
    30,
  );
  assert.equal(patch.fileSharedState!.interestRate, 6.5);
  assert.equal(patch.fileSharedState!.fundingAmount, 250_000);
  assert.equal(patch.fileSharedState!.commission, 1_000);
});

// ---------- Customization system (preferences, block template, sync flags) ----------

const MIN_NEW_FILE_PIPELINE_BODY = {
  fileName: "Validation",
  status: "confirm_interest",
  fundingAmount: 0,
  rate: 0,
  term: "",
  lenders: [],
  contacts: [],
} as Omit<Doc<"pipeline">, "_id" | "_creationTime" | "createdAt" | "updatedAt">;

test("parseBlockSyncBehavior: null/empty → defaults", () => {
  const d = parseBlockSyncBehavior(null);
  assert.equal(d.autoSyncSharedAcrossBlocks, true);
  assert.equal(d.allowOverrides, true);
  assert.equal(parseBlockSyncBehavior({}).autoSyncSharedAcrossBlocks, true);
});

test("parseBlockSyncBehavior: flat behaviorSettings booleans", () => {
  const p = parseBlockSyncBehavior({
    [BLOCK_SYNC_BEHAVIOR_KEYS.autoSyncShared]: false,
    [BLOCK_SYNC_BEHAVIOR_KEYS.allowOverrides]: false,
  });
  assert.equal(p.autoSyncSharedAcrossBlocks, false);
  assert.equal(p.allowOverrides, false);
});

test("mergeBlockSyncBehaviorIntoSettings: writes known keys only", () => {
  const next = mergeBlockSyncBehaviorIntoSettings(
    { other: 1 },
    { autoSyncSharedAcrossBlocks: false },
  );
  assert.equal(next.other, 1);
  assert.equal(next[BLOCK_SYNC_BEHAVIOR_KEYS.autoSyncShared], false);
  assert.equal(next[BLOCK_SYNC_BEHAVIOR_KEYS.allowOverrides], undefined);
});

test("mergeUserPreferencesPatch: newFileDrawerSettings", () => {
  const base = getDefaultUserPreferences();
  const next = mergeUserPreferencesPatch(base, {
    newFileDrawerSettings: { fileNotes: { rows: 11 } },
  });
  assert.equal((next.newFileDrawerSettings.fileNotes as { rows: number }).rows, 11);
});

test("mergeServerUserPreferences: missing newFileDrawerSettings → {}", () => {
  const m = mergeServerUserPreferences({
    _id: "pref1" as never,
    _creationTime: 0,
    accountId: "acct",
    updatedAt: 1,
    formatVersion: 1,
    defaultBlocks: ["fileDetails"],
    blockOrder: [],
    collapseBehavior: "smart",
    displaySettings: {},
    behaviorSettings: {},
  } as never);
  assert.deepEqual(m.newFileDrawerSettings, {});
});

test("mergeServerUserPreferences: favoriteFileBlocks filters unknown ids + dupes", () => {
  const m = mergeServerUserPreferences({
    _id: "pref1" as never,
    _creationTime: 0,
    accountId: "acct",
    updatedAt: 1,
    formatVersion: 1,
    defaultBlocks: [],
    blockOrder: [],
    collapseBehavior: "smart",
    displaySettings: {},
    behaviorSettings: {},
    favoriteFileBlocks: ["fileNotes", "notARealBlock", "fileNotes", "pfs"],
  } as never);
  assert.deepEqual(m.favoriteFileBlocks, ["fileNotes", "pfs"]);
});

test("mergeUserPreferencesPatch: favoriteFileBlocks replace + preserve", () => {
  const base = getDefaultUserPreferences();
  const withFavs = mergeUserPreferencesPatch(base, {
    favoriteFileBlocks: ["tasks", "pfs"],
  });
  assert.deepEqual(withFavs.favoriteFileBlocks, ["tasks", "pfs"]);
  const untouched = mergeUserPreferencesPatch(withFavs, {
    collapseBehavior: "all_open",
  });
  assert.deepEqual(untouched.favoriteFileBlocks, ["tasks", "pfs"]);
});

test("coerceUserDrawerPreferenceLists: injects effective mandatory into lists", () => {
  const eff = getEffectiveMandatoryPipelineBlockIds(["scenarioMatch"]);
  const coerced = coerceUserDrawerPreferenceLists(eff, {
    defaultBlocks: ["fileDetails", "dealWorkspace"],
    blockOrder: ["fileDetails", "dealWorkspace"],
  });
  assert.ok(coerced.defaultBlocks.includes("scenarioMatch"));
  assert.ok(coerced.blockOrder.includes("scenarioMatch"));
});

test("coerceUserDrawerPreferenceLists: no-op when user did not customize lists", () => {
  const eff = getEffectiveMandatoryPipelineBlockIds(["lenders"]);
  const coerced = coerceUserDrawerPreferenceLists(eff, {
    defaultBlocks: [],
    blockOrder: [],
  });
  assert.deepEqual(coerced.defaultBlocks, []);
  assert.deepEqual(coerced.blockOrder, []);
});

test("applyUserPreferencesToNewFileDrawerLayout: merges block settings over base", () => {
  const base = normalizePipelineDrawerLayout({
    v: 1,
    order: [...DEFAULT_PIPELINE_DRAWER_ORDER],
    hidden: [],
    expanded: {},
    settings: { fileNotes: { rows: 4 } },
  });
  const prefs = mergeUserPreferencesPatch(getDefaultUserPreferences(), {
    defaultBlocks: ["fileDetails", "dealWorkspace", "fileNotes"],
    newFileDrawerSettings: { fileNotes: { rows: 9 } },
  });
  const metrics = buildNewFilePipelineMetricsContext({
    body: MIN_NEW_FILE_PIPELINE_BODY,
  });
  const out = applyUserPreferencesToNewFileDrawerLayout(base, prefs, metrics, {
    effectiveMandatoryBlockIds: getMandatoryPipelineBlockIds(),
  });
  assert.ok(!out.hidden.includes("fileDetails"));
  assert.ok(!out.hidden.includes("dealWorkspace"));
  assert.ok(!out.hidden.includes("fileNotes"));
  assert.equal(out.settings?.fileNotes?.rows, 9);
});

test("applyUserPreferencesToNewFileDrawerLayout: workspace-required stays visible", () => {
  const base = normalizePipelineDrawerLayout({
    v: 1,
    order: [...DEFAULT_PIPELINE_DRAWER_ORDER],
    hidden: [],
    expanded: {},
  });
  const prefs = mergeUserPreferencesPatch(getDefaultUserPreferences(), {
    defaultBlocks: ["fileDetails", "dealWorkspace"],
    blockOrder: [],
  });
  const metrics = buildNewFilePipelineMetricsContext({
    body: MIN_NEW_FILE_PIPELINE_BODY,
  });
  const out = applyUserPreferencesToNewFileDrawerLayout(base, prefs, metrics, {
    effectiveMandatoryBlockIds: getEffectiveMandatoryPipelineBlockIds([
      "scenarioMatch",
    ]),
  });
  assert.ok(!out.hidden.includes("scenarioMatch"));
});

test("applyUserPreferencesToNewFileDrawerLayout: null prefs preserves base shape", () => {
  const base = normalizePipelineDrawerLayout({
    v: 1,
    order: ["fileDetails"],
    hidden: [],
    expanded: {},
  });
  const metrics = buildNewFilePipelineMetricsContext({
    body: MIN_NEW_FILE_PIPELINE_BODY,
  });
  const out = applyUserPreferencesToNewFileDrawerLayout(base, null, metrics);
  assert.ok(out.order.includes("fileDetails"));
});

test("applyCatalogFileTemplateToLayout: basic deal hides scenarioMatch", () => {
  const base = normalizePipelineDrawerLayout({
    v: 1,
    order: [...DEFAULT_PIPELINE_DRAWER_ORDER],
    hidden: [],
    expanded: {},
    settings: { fileNotes: { rows: 2 } },
  });
  const template = getPipelineFileTemplate("basic-deal");
  assert.ok(template);
  const eff = getMandatoryPipelineBlockIds();
  const out = applyCatalogFileTemplateToLayout(base, template!, eff);
  assert.ok(out.hidden.includes("scenarioMatch"));
  assert.ok(!out.hidden.includes("fileDetails"));
  assert.equal(out.settings?.fileNotes?.rows, 4);
});

test("getPipelineFileTemplate: unknown id", () => {
  assert.equal(getPipelineFileTemplate("nope"), null);
});

test("pipeline automation: contact rule matches only new links with deal data", () => {
  const rule = PIPELINE_BLOCK_AUTOMATION_RULES.find(
    (r) => r.id === "contact.linked.unhide_workspace_tab",
  );
  assert.ok(rule);
  assert.ok(
    triggerMatchesEvent(rule!, {
      type: "contact_linked",
      role: "Borrower",
      isNewLink: true,
    }),
  );
  assert.ok(
    evaluateAutomationCondition(rule!.condition, {
      hasDealData: true,
      scenarioEmpty: true,
      contactIsNewLink: true,
      contactRoleNorm: "borrower",
    }),
  );
  assert.ok(
    !evaluateAutomationCondition(rule!.condition, {
      hasDealData: true,
      scenarioEmpty: true,
      contactIsNewLink: false,
      contactRoleNorm: "borrower",
    }),
  );
});

test("unhideDealWorkspaceTabInDealData: unhides borrowers for borrower role", () => {
  const dealData = {
    dealWorkspaceLayout: { v: 1, order: ["cover"], hidden: ["borrowers"], expanded: {} },
  };
  const out = unhideDealWorkspaceTabInDealData(
    dealData,
    "primary borrower",
    "overview",
  ) as { dealWorkspaceLayout: { hidden: string[] } };
  assert.ok(!out.dealWorkspaceLayout.hidden.includes("borrowers"));
});

test("buildLenderScenarioSeed: prefers programs", () => {
  const s = buildLenderScenarioSeed(
    { programs: "DSCR 1.1+", primaryNiche: "niche" },
    100,
  );
  assert.equal(s, "DSCR 1.1+");
});

test("evaluateFileHealthTier: empty is strong", () => {
  const { healthTier } = evaluateFileHealthTier([]);
  assert.equal(healthTier, "strong");
});

test("evaluateFileHealthTier: one non-critical warning is needs_attention", () => {
  const { healthTier } = evaluateFileHealthTier([
    {
      id: "contacts-missing",
      category: "alert",
      severity: "warning",
      title: "x",
    },
  ]);
  assert.equal(healthTier, "needs_attention");
});

test("evaluateFileHealthTier: critical id is at_risk", () => {
  const { healthTier } = evaluateFileHealthTier([
    {
      id: "missing-client",
      category: "alert",
      severity: "warning",
      title: "x",
    },
  ]);
  assert.equal(healthTier, "at_risk");
});

test("evaluateFileHealthTier: three warnings is at_risk", () => {
  const { healthTier } = evaluateFileHealthTier([
    {
      id: "a",
      category: "alert",
      severity: "warning",
      title: "1",
    },
    {
      id: "b",
      category: "alert",
      severity: "warning",
      title: "2",
    },
    {
      id: "c",
      category: "alert",
      severity: "warning",
      title: "3",
    },
  ]);
  assert.equal(healthTier, "at_risk");
});

test("userWorkflowTriggerMatches: basic", () => {
  assert.ok(
    userWorkflowTriggerMatches(
      { type: "file_created" },
      { type: "file_created" },
    ),
  );
  assert.ok(
    !userWorkflowTriggerMatches(
      { type: "lender_selected" },
      { type: "file_created" },
    ),
  );
});

test("sanitizeUserSimpleWorkflowRules: drops dangerZone action", () => {
  const out = sanitizeUserSimpleWorkflowRules([
    {
      id: "a",
      enabled: true,
      trigger: { type: "file_created" },
      action: { type: "show_drawer_block", blockId: "dangerZone" },
    },
  ]);
  assert.equal(out.length, 0);
});

test("drawerLayoutAuditTargetsChanged: ignores expanded-only", () => {
  const prev: PipelineDrawerLayoutV1 = {
    v: 1,
    order: ["fileDetails", "tasks"],
    hidden: [],
    expanded: { fileDetails: false },
  };
  const next: PipelineDrawerLayoutV1 = {
    ...prev,
    expanded: { fileDetails: true },
  };
  assert.ok(!drawerLayoutAuditTargetsChanged(prev, next));
});

test("drawerLayoutAuditTargetsChanged: detects hidden change", () => {
  const prev: PipelineDrawerLayoutV1 = {
    v: 1,
    order: ["fileDetails", "tasks"],
    hidden: [],
    expanded: {},
  };
  const next: PipelineDrawerLayoutV1 = {
    ...prev,
    hidden: ["tasks"],
  };
  assert.ok(drawerLayoutAuditTargetsChanged(prev, next));
});

test("resolveDrawerLayoutForHydration: server wins, else local, else collapsed", () => {
  const local = normalizePipelineDrawerLayout({
    v: 1,
    order: [...DEFAULT_PIPELINE_DRAWER_ORDER],
    hidden: [],
    expanded: { fileDetails: true, dealMessages: true },
  });
  const server = { v: 1, order: ["fileDetails"], hidden: [], expanded: { tasks: true } };
  const fromServer = resolveDrawerLayoutForHydration(server, local);
  assert.equal(fromServer.expanded.tasks, true);
  assert.equal(fromServer.expanded.fileDetails, undefined);

  const fromLocal = resolveDrawerLayoutForHydration(undefined, local);
  assert.equal(fromLocal.expanded.fileDetails, true);

  const fresh = resolveDrawerLayoutForHydration(undefined, null);
  assert.deepEqual(fresh.expanded, {});
});

test("parsePipelineFileExpandUxRules: v1 and defaults", () => {
  assert.equal(parsePipelineFileExpandUxRules(null), null);
  assert.equal(parsePipelineFileExpandUxRules({ v: 2, expandFirstVisibleBlock: true }), null);
  assert.equal(parsePipelineFileExpandUxRules({ v: 1 }), null);
  assert.deepEqual(parsePipelineFileExpandUxRules({ v: 1, expandFirstVisibleBlock: true }), {
    v: 1,
    expandFirstVisibleBlock: true,
  });
});

test("readPipelineFileExpandUxRules: behaviorSettings key", () => {
  const r = readPipelineFileExpandUxRules({
    [PIPELINE_FILE_EXPAND_UX_KEY]: { v: 1, expandBlocksWithActionSignals: true },
  });
  assert.ok(r?.expandBlocksWithActionSignals);
});

test("applyPipelineFileExpandUxToExpanded: first block and action signals", () => {
  const pipeline = {
    _id: "k_pipe_expandux" as Id<"pipeline">,
    intakeSheetId: "k_intake_expandux" as Id<"intakeSheets">,
    lenders: [],
    scenario: "Office refi",
    scenarioCriteria: {},
    fundingAmount: 0,
  } as unknown as Doc<"pipeline">;
  const ctx = buildPipelineDrawerMetricsContext({
    pipeline,
    termOptions: [],
    licenseLo: "",
    licenseBroker: "",
    linkedTasks: [],
    associatedContactLinkCount: 0,
    dealSheet: null,
  });
  const withScenario = applyPipelineFileExpandUxToExpanded(
    {},
    { v: 1, expandBlocksWithActionSignals: true },
    {
      visibleBlockIds: ["scenarioMatch", "fileDetails"],
      metricsCtx: ctx,
      actionHints: null,
    },
  );
  assert.equal(withScenario.scenarioMatch, true);

  const firstOnly = applyPipelineFileExpandUxToExpanded(
    {},
    { v: 1, expandFirstVisibleBlock: true },
    {
      visibleBlockIds: ["tasks", "fileDetails"],
      metricsCtx: ctx,
    },
  );
  assert.equal(firstOnly.tasks, true);
  assert.equal(firstOnly.fileDetails, undefined);
});

passed += 1;
console.log("vault zip path hierarchy");
{
  type Folder = {
    _id: string;
    name: string;
    parentFolderId?: string;
  };
  const folders: Folder[] = [
    { _id: "f1", name: "Tax Returns" },
    { _id: "f2", name: "2024", parentFolderId: "f1" },
    { _id: "f3", name: "W-2s", parentFolderId: "f2" },
  ];
  const path = buildVaultDocumentZipPath(
    folders as Parameters<typeof buildVaultDocumentZipPath>[0],
    "f3" as Parameters<typeof buildVaultDocumentZipPath>[1],
    "john-w2.pdf",
  );
  assert.equal(path, "Tax Returns/2024/W-2s/john-w2.pdf");
  assert.equal(sanitizeZipPathSegment('bad/name'), "bad_name");

  assert.equal(
    buildVaultFolderSubtreeZipPath(
      folders as Parameters<typeof buildVaultFolderSubtreeZipPath>[0],
      "f1" as Parameters<typeof buildVaultFolderSubtreeZipPath>[1],
      "f3" as Parameters<typeof buildVaultFolderSubtreeZipPath>[2],
      "john-w2.pdf",
    ),
    "Tax Returns/2024/W-2s/john-w2.pdf",
  );
  assert.equal(
    buildVaultFolderSubtreeZipPath(
      folders as Parameters<typeof buildVaultFolderSubtreeZipPath>[0],
      "f2" as Parameters<typeof buildVaultFolderSubtreeZipPath>[1],
      "f3" as Parameters<typeof buildVaultFolderSubtreeZipPath>[2],
      "john-w2.pdf",
    ),
    "2024/W-2s/john-w2.pdf",
  );
  assert.equal(
    buildVaultFolderSubtreeZipPath(
      folders as Parameters<typeof buildVaultFolderSubtreeZipPath>[0],
      "f1" as Parameters<typeof buildVaultFolderSubtreeZipPath>[1],
      "f1" as Parameters<typeof buildVaultFolderSubtreeZipPath>[2],
      "summary.pdf",
    ),
    "Tax Returns/summary.pdf",
  );

  const used = new Set<string>();
  assert.equal(dedupeZipPath("a.pdf", used), "a.pdf");
  assert.equal(dedupeZipPath("a.pdf", used), "a (1).pdf");
  assert.equal(dedupeZipPath("a.pdf", used), "a (2).pdf");
  assert.equal(dedupeZipPath("Tax Returns/a.pdf", used), "Tax Returns/a.pdf");
  assert.equal(
    dedupeZipPath("Tax Returns/a.pdf", used),
    "Tax Returns/a (1).pdf",
  );

  const zip = new JSZip();
  zip.file("Tax Returns/2024/doc-a.pdf", "a");
  zip.file("Tax Returns/2024/doc-b.pdf", "b");
  zip.file("General/loi.pdf", "c");
  const names = Object.keys(zip.files).filter((k) => !k.endsWith("/"));
  assert.equal(names.includes("Tax Returns/2024/doc-a.pdf"), true);
  assert.equal(names.includes("General/loi.pdf"), true);
  assert.equal(
    names.filter((n) => n.startsWith("Tax Returns/2024/")).length,
    2,
  );
}

test("created vault HTML docs default download format to PDF", () => {
  assert.equal(
    isCreatedVaultHtmlDocument({
      latestContentType: "text/html",
      latestFileName: "Term Sheet.html",
      title: "Term Sheet",
    }),
    true,
  );
  assert.equal(
    isCreatedVaultHtmlDocument({
      latestContentType: "application/pdf",
      latestFileName: "W-2.pdf",
      title: "W-2",
    }),
    false,
  );
  assert.equal(
    defaultVaultDownloadFormat({
      latestContentType: "text/html",
      latestFileName: "Term Sheet.html",
      title: "Acme Term Sheet",
    }),
    "pdf",
  );
  assert.equal(
    defaultVaultDownloadFormat({
      latestContentType: "application/pdf",
      latestFileName: "bank-stmt.pdf",
      title: "Bank statement",
    }),
    "original",
  );
  assert.equal(
    vaultOutboundPdfFileName("Acme Term Sheet", "Term Sheet.html"),
    "Acme Term Sheet.pdf",
  );
});

console.log(`\ncore-edge-tests: ${passed} cases passed.\n`);
