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
import { mergeIntakeDraftWithServer } from "../lib/share/mergeIntakeDraftWithServer";
import { embeddedDealPayloadIsSubstantive } from "../lib/file/embeddedDealPresence";
import {
  buildVaultDocumentZipPath,
  sanitizeZipPathSegment,
} from "../lib/library/vaultZipPaths";
import JSZip from "jszip";
import { isDealBackedPipelineRow } from "../lib/pipeline/dealBackedRow";
import {
  DC_AWARD_RADAR_CATEGORIES,
  PHASE2_DC_AWARD_SIGNAL_COUNT,
  PHASE2_DC_AWARD_SIGNAL_SEEDS,
  buildDcAwardSignalSourceKey,
  dcAwardCategoryUiLabel,
  dcAwardEmailUiLabel,
  dcAwardPhoneUiLabel,
  normalizeSourceUrl,
  dcAwardSafeHttpUrl,
  parseDcAwardRadarCategory,
  pickDefinedCampusFields,
  pickDefinedCategory,
  pickDefinedContactFields,
  prepareDcAwardRadarSeedRow,
  uniquePreparedPhase2SourceKeys,
} from "../lib/dcAwardRadar";
import {
  applyKnownCampusAndRemaps,
  DC21_P2_LEGACY_SOURCE_URL,
  DC21_P2_PROJECT,
  DC21_P2_SOURCE_URL,
  DC21_P2_STAGE,
  DC21_P3_SOURCE_URL,
  EQUINIX_DC17_CAMPUS_KEY,
  EQUINIX_DC17_PROJECT,
  EQUINIX_DC21_CAMPUS_KEY,
  groupDcAwardRadarSignals,
  legacySourceKeysForPrepared,
  NTT_VA6_CAMPUS_KEY,
  pickCampusGroupContact,
  VANTAGE_OH1_CAMPUS_KEY,
} from "../lib/dcAwardRadarCampus";
import {
  DEFAULT_DC_AWARD_GROUP_EXPANSION,
  areAllDcAwardCampusGroupsCollapsed,
  areAllDcAwardCampusGroupsExpanded,
  collapseAllDcAwardCampusGroups,
  expandAllDcAwardCampusGroups,
  isDcAwardCampusGroupExpanded,
  parseDcAwardRadarGroupExpansion,
  serializeDcAwardRadarGroupExpansion,
  toggleDcAwardCampusGroup,
} from "../lib/dcAwardRadarGroupExpansion";
import {
  dcAwardContactIdentityKey,
  summarizeDcAwardRadarLeads,
} from "../lib/dcAwardRadarStats";
import {
  collectUniqueDcAwardContacts,
  filterSignalsByContactFilters,
  uniqueContactHasGhlIdentity,
  uniqueContactMatchesFilters,
  type DcAwardRadarUniqueContact,
} from "../lib/dcAwardRadarContacts";
import {
  DC_AWARD_RADAR_GHL_CHUNK_SIZE,
  DC_AWARD_RADAR_GHL_SOURCE,
  DC_AWARD_RADAR_GHL_TAG,
  buildDcAwardGhlTags,
  buildDcAwardGhlUpsertBody,
  chunkDcAwardGhlContacts,
  describeDcAwardGhlSendBatch,
  ghlSerializedBodyIsAllowlisted,
  ghlUpsertBodyHasForbiddenKeys,
  ghlUpsertBodyKeys,
  isDcAwardGhlConfigured,
  selectDcAwardGhlContactBatch,
  serializeDcAwardGhlAddTagsBody,
  serializeDcAwardGhlUpsertBody,
  summarizeDcAwardGhlPushOutcome,
} from "../lib/dcAwardRadarGhl";
import {
  DC_AWARD_RADAR_CONTACT_CSV_HEADERS,
  buildDcAwardRadarContactsCsv,
  buildDcAwardRadarGhlHandoffCsv,
  dcAwardRadarGhlHandoffCsvFilename,
} from "../lib/export/dcAwardRadarContactsExport";
import {
  DC_AWARD_OPERATOR_UPSERT_MAX_ROWS,
  assertBoundedOperatorRows,
  chunkOperatorRows,
  parseBoundedDcAwardRadarNationwidePayload,
  parseDcAwardRadarContactPayload,
  parseDcAwardRadarNationwidePayload,
} from "../lib/dcAwardRadarPayload";
import {
  buildDealCommitRow,
  subjectAddressEditorValue,
} from "../lib/pipeline/pipelineTableCommits";
import { buildSubjectAddressDisplay } from "../lib/pipeline/subjectAddressDisplay";
import { resolvePipelineTableFundingAmount } from "../lib/pipeline/resolvePipelineTableFundingAmount";
import { convexHttpActionsBaseUrl, parseConvexPublicUrl } from "../lib/convexPublicUrl";
import { normalizeFileSharedStateFromPipeline } from "../lib/fileSharedFields";
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

console.log("dc award radar phase 2 seed uniqueness");
{
  assert.equal(PHASE2_DC_AWARD_SIGNAL_COUNT, 29);
  assert.equal(PHASE2_DC_AWARD_SIGNAL_SEEDS.length, 29);
  const keys = uniquePreparedPhase2SourceKeys();
  assert.equal(keys.length, 29);
  const again = PHASE2_DC_AWARD_SIGNAL_SEEDS.map(
    (row) => prepareDcAwardRadarSeedRow(row).sourceKey,
  );
  assert.deepEqual(again, PHASE2_DC_AWARD_SIGNAL_SEEDS.map(
    (row) => prepareDcAwardRadarSeedRow(row).sourceKey,
  ));
  assert.equal(
    normalizeSourceUrl(
      "https://mlq.ai/permit-filings/usa/virginia/loudoun-county/bldc-2025-046039/",
    ),
    "https://mlq.ai/permit-filings/usa/virginia/loudoun-county/bldc-2025-046039",
  );
  const sharedUrlRows = PHASE2_DC_AWARD_SIGNAL_SEEDS.filter(
    (row) =>
      normalizeSourceUrl(row.sourceUrl) ===
      normalizeSourceUrl(
        "https://newalbanyohio.org/community-development/project-updates",
      ),
  );
  assert.ok(sharedUrlRows.length > 1);
  const sharedKeys = new Set(
    sharedUrlRows.map((row) => prepareDcAwardRadarSeedRow(row).sourceKey),
  );
  assert.equal(sharedKeys.size, sharedUrlRows.length);
}
passed += 1;

console.log("dc award radar contacts + nationwide payload");
{
  const base = PHASE2_DC_AWARD_SIGNAL_SEEDS[0];
  assert.ok(base);
  const withoutContact = prepareDcAwardRadarSeedRow(base);
  const withContact = prepareDcAwardRadarSeedRow({
    ...base,
    contactName: "Jane Operator",
    contactTitle: "BD Lead",
    email: "jane@example.com",
    emailType: "direct",
    phone: "555-0100",
    phoneType: "cell",
    linkedinUrl: "https://www.linkedin.com/in/jane",
    companyWebsite: "https://example.com",
    contactNotes: "Hermes: permit applicant; med confidence",
  });
  assert.equal(withoutContact.sourceKey, withContact.sourceKey);
  assert.equal(
    withContact.sourceKey,
    buildDcAwardSignalSourceKey({
      sourceUrl: base.sourceUrl,
      projectOrCampus: base.projectOrCampus,
      stageSignal: base.stageSignal,
    }),
  );
  assert.equal(withContact.contactName, "Jane Operator");
  assert.equal(withContact.phoneType, "cell");
  assert.equal(withContact.emailType, "direct");
  assert.equal(dcAwardPhoneUiLabel("cell"), "Cell (likely)");
  assert.equal(dcAwardPhoneUiLabel(undefined), "Cell (likely)");
  assert.equal(dcAwardEmailUiLabel("direct"), "Direct email");
  assert.equal(dcAwardEmailUiLabel("generic"), "Generic / company email");
  assert.deepEqual(pickDefinedContactFields(base), {});
  assert.deepEqual(pickDefinedContactFields({ phone: "  555-0100  " }), {
    phone: "555-0100",
  });

  const csv = [
    "market,project_or_campus,stage_signal,trade_focus,company,role_if_known,signal_date,source_url,source_type,confidence,why_it_matters_for_DLC,notes,contact_name,email,email_type,phone,phone_type,contact_notes",
    "Phoenix AZ,Example Campus,Permit Issued,Electrical,Acme GC,GC,2026-09-01,https://example.com/permit/1,County permit,high,New market signal,n,Pat Contact,pat@example.com,direct,480-555-0199,cell,Hermes mobile on LinkedIn; high — not switchboard",
  ].join("\n");
  const nationwide = parseDcAwardRadarNationwidePayload(csv);
  assert.equal(nationwide.format, "csv");
  assert.equal(nationwide.rows[0]?.market, "Phoenix AZ");
  assert.equal(nationwide.rows[0]?.contactName, "Pat Contact");
  assert.equal(nationwide.rows[0]?.phone, "480-555-0199");
  assert.equal(nationwide.rows[0]?.phoneType, "cell");
  assert.equal(nationwide.rows[0]?.emailType, "direct");
  const preparedNationwide = prepareDcAwardRadarSeedRow(nationwide.rows[0]!);
  assert.equal(preparedNationwide.market, "Phoenix AZ");

  const contactCsv = [
    "source_url,project_or_campus,stage_signal,contact_name,email",
    `${base.sourceUrl},${base.projectOrCampus},${base.stageSignal},Pat Contact,pat@example.com`,
  ].join("\n");
  const contacts = parseDcAwardRadarContactPayload(contactCsv);
  assert.equal(contacts.rows[0]?.contactName, "Pat Contact");
  assert.equal(
    buildDcAwardSignalSourceKey({
      sourceUrl: contacts.rows[0]!.sourceUrl!,
      projectOrCampus: contacts.rows[0]!.projectOrCampus!,
      stageSignal: contacts.rows[0]!.stageSignal!,
    }),
    withoutContact.sourceKey,
  );

  assert.equal(DC_AWARD_OPERATOR_UPSERT_MAX_ROWS, 100);
  assert.equal(chunkOperatorRows(new Array(120).fill(0)).length, 2);
  assert.throws(
    () => assertBoundedOperatorRows(101, "Import nationwide refresh"),
    /100-row one-shot cap/,
  );
  assert.throws(
    () =>
      parseBoundedDcAwardRadarNationwidePayload(
        JSON.stringify(
          new Array(101).fill(null).map((_, i) => ({
            market: "Phoenix AZ",
            projectOrCampus: `Campus ${i}`,
            stageSignal: "Permit Issued",
            tradeFocus: "Electrical",
            company: "Acme",
            roleIfKnown: "GC",
            signalDate: "2026-09-01",
            sourceUrl: `https://example.com/p/${i}`,
            sourceType: "County permit",
            confidence: "high",
            whyItMattersForDlc: "x",
            notes: "y",
          })),
        ),
      ),
    /100-row one-shot cap/,
  );
}
passed += 1;

console.log("dc award radar optional category vertical");
{
  const base = PHASE2_DC_AWARD_SIGNAL_SEEDS[0];
  assert.ok(base);
  const withoutCategory = prepareDcAwardRadarSeedRow(base);
  assert.equal(withoutCategory.category, undefined);
  assert.deepEqual(pickDefinedCategory(withoutCategory), {});
  assert.deepEqual(pickDefinedCategory({}), {});

  const withHospital = prepareDcAwardRadarSeedRow({
    ...base,
    category: "hospital",
  });
  assert.equal(withHospital.category, "hospital");
  assert.equal(withHospital.sourceKey, withoutCategory.sourceKey);
  assert.deepEqual(pickDefinedCategory(withHospital), { category: "hospital" });

  assert.equal(parseDcAwardRadarCategory("dot_civil"), "dot_civil");
  assert.equal(parseDcAwardRadarCategory("DOT Civil"), "dot_civil");
  assert.equal(parseDcAwardRadarCategory("DOT / Civil"), "dot_civil");
  assert.equal(parseDcAwardRadarCategory("industrial-warehouse"), "industrial_warehouse");
  assert.equal(parseDcAwardRadarCategory("data_center"), "data_center");
  assert.equal(parseDcAwardRadarCategory("k12_higher_ed"), "k12_higher_ed");
  assert.equal(parseDcAwardRadarCategory("K-12 / higher ed"), "k12_higher_ed");
  assert.equal(parseDcAwardRadarCategory("multifamily"), "multifamily");
  assert.equal(parseDcAwardRadarCategory("Multi Family"), "multifamily");
  assert.equal(parseDcAwardRadarCategory("Multi-Family"), "multifamily");
  assert.equal(
    parseDcAwardRadarCategory("hospitality_mixed_use"),
    "hospitality_mixed_use",
  );
  assert.equal(
    parseDcAwardRadarCategory("Hospitality / Mixed Use"),
    "hospitality_mixed_use",
  );
  assert.equal(
    parseDcAwardRadarCategory("Hospitality Mixed-Use"),
    "hospitality_mixed_use",
  );
  assert.equal(
    parseDcAwardRadarCategory("federal_municipal"),
    "federal_municipal",
  );
  assert.equal(
    parseDcAwardRadarCategory("Federal / Municipal"),
    "federal_municipal",
  );
  assert.equal(parseDcAwardRadarCategory("Federal Municipal"), "federal_municipal");
  assert.equal(
    parseDcAwardRadarCategory("energy_renewables"),
    "energy_renewables",
  );
  assert.equal(
    parseDcAwardRadarCategory("Energy / Renewables"),
    "energy_renewables",
  );
  assert.equal(
    parseDcAwardRadarCategory("Energy Renewables"),
    "energy_renewables",
  );
  assert.equal(parseDcAwardRadarCategory("renewables"), "energy_renewables");
  assert.throws(() => parseDcAwardRadarCategory("retail"), /Invalid category/);
  assert.equal(dcAwardCategoryUiLabel(undefined), "Data center (uncategorized)");
  assert.equal(dcAwardCategoryUiLabel("hospital"), "Hospital");
  assert.equal(dcAwardCategoryUiLabel("k12_higher_ed"), "K-12 / higher ed");
  assert.equal(dcAwardCategoryUiLabel("multifamily"), "Multifamily");
  assert.equal(
    dcAwardCategoryUiLabel("hospitality_mixed_use"),
    "Hospitality / Mixed Use",
  );
  assert.equal(
    dcAwardCategoryUiLabel("federal_municipal"),
    "Federal / Municipal",
  );
  assert.equal(
    dcAwardCategoryUiLabel("energy_renewables"),
    "Energy / renewables",
  );

  assert.ok(DC_AWARD_RADAR_CATEGORIES.includes("multifamily"));
  assert.ok(DC_AWARD_RADAR_CATEGORIES.includes("hospitality_mixed_use"));
  assert.ok(DC_AWARD_RADAR_CATEGORIES.includes("federal_municipal"));
  assert.ok(DC_AWARD_RADAR_CATEGORIES.includes("energy_renewables"));

  const withK12 = prepareDcAwardRadarSeedRow({
    ...base,
    category: "k12_higher_ed",
  });
  assert.equal(withK12.category, "k12_higher_ed");
  assert.deepEqual(pickDefinedCategory(withK12), {
    category: "k12_higher_ed",
  });

  const withHospitality = prepareDcAwardRadarSeedRow({
    ...base,
    category: "hospitality_mixed_use",
  });
  assert.equal(withHospitality.category, "hospitality_mixed_use");
  assert.deepEqual(pickDefinedCategory(withHospitality), {
    category: "hospitality_mixed_use",
  });
  assert.deepEqual(pickDefinedCategory({ category: undefined }), {});

  const withEnergy = prepareDcAwardRadarSeedRow({
    ...base,
    category: "energy_renewables",
  });
  assert.equal(withEnergy.category, "energy_renewables");
  assert.deepEqual(pickDefinedCategory(withEnergy), {
    category: "energy_renewables",
  });
  assert.deepEqual(pickDefinedCategory({ category: undefined }), {});

  const categoryCsv = [
    "market,project_or_campus,stage_signal,trade_focus,company,role_if_known,signal_date,source_url,source_type,confidence,why_it_matters_for_DLC,notes,category",
    "Phoenix AZ,Hospital Wing,Permit Issued,MEP,Acme GC,GC,2026-09-01,https://example.com/permit/h1,County permit,high,Hospital vertical,n,hospital",
  ].join("\n");
  const parsedHospital = parseDcAwardRadarNationwidePayload(categoryCsv);
  assert.equal(parsedHospital.rows[0]?.category, "hospital");
  assert.equal(
    prepareDcAwardRadarSeedRow(parsedHospital.rows[0]!).category,
    "hospital",
  );

  const k12Csv = [
    "market,project_or_campus,stage_signal,trade_focus,company,role_if_known,signal_date,source_url,source_type,confidence,why_it_matters_for_DLC,notes,category",
    "Austin TX,Campus Expansion,Awarded,GC,Acme GC,GC,2026-09-01,https://example.com/permit/k12,County permit,high,K12 vertical,n,k12_higher_ed",
  ].join("\n");
  const parsedK12 = parseDcAwardRadarNationwidePayload(k12Csv);
  assert.equal(parsedK12.rows[0]?.category, "k12_higher_ed");
  assert.equal(
    prepareDcAwardRadarSeedRow(parsedK12.rows[0]!).category,
    "k12_higher_ed",
  );

  const hospitalityCsv = [
    "market,project_or_campus,stage_signal,trade_focus,company,role_if_known,signal_date,source_url,source_type,confidence,why_it_matters_for_DLC,notes,category",
    'Los Angeles CA,Hotel Mixed,Permit Issued,GC,Acme GC,GC,2026-09-01,https://example.com/permit/hm1,County permit,high,CA hospitality,n,"Hospitality / Mixed Use"',
  ].join("\n");
  const parsedHospitality = parseDcAwardRadarNationwidePayload(hospitalityCsv);
  assert.equal(parsedHospitality.rows[0]?.category, "hospitality_mixed_use");

  const multifamilyCsv = [
    "market,project_or_campus,stage_signal,trade_focus,company,role_if_known,signal_date,source_url,source_type,confidence,why_it_matters_for_DLC,notes,category",
    "San Diego CA,Apartments,Awarded,MEP,Acme GC,GC,2026-09-01,https://example.com/permit/mf1,County permit,med,CA multifamily,n,Multi-Family",
  ].join("\n");
  const parsedMultifamily = parseDcAwardRadarNationwidePayload(multifamilyCsv);
  assert.equal(parsedMultifamily.rows[0]?.category, "multifamily");

  const federalCsv = [
    "market,project_or_campus,stage_signal,trade_focus,company,role_if_known,signal_date,source_url,source_type,confidence,why_it_matters_for_DLC,notes,category",
    "Sacramento CA,City Hall,Bid,Civil,Acme GC,GC,2026-09-01,https://example.com/permit/fm1,County permit,high,CA municipal,n,Federal / Municipal",
  ].join("\n");
  const parsedFederal = parseDcAwardRadarNationwidePayload(federalCsv);
  assert.equal(parsedFederal.rows[0]?.category, "federal_municipal");

  const energyCsv = [
    "market,project_or_campus,stage_signal,trade_focus,company,role_if_known,signal_date,source_url,source_type,confidence,why_it_matters_for_DLC,notes,category",
    'Bakersfield CA,Solar Farm,Awarded,Electrical,Acme GC,GC,2026-09-01,https://example.com/permit/er1,County permit,high,CA energy,n,"Energy / Renewables"',
  ].join("\n");
  const parsedEnergy = parseDcAwardRadarNationwidePayload(energyCsv);
  assert.equal(parsedEnergy.rows[0]?.category, "energy_renewables");

  const renewablesAliasCsv = [
    "market,project_or_campus,stage_signal,trade_focus,company,role_if_known,signal_date,source_url,source_type,confidence,why_it_matters_for_DLC,notes,category",
    "Fresno CA,Wind Project,Bid,Civil,Acme GC,GC,2026-09-01,https://example.com/permit/er2,County permit,med,CA renewables,n,renewables",
  ].join("\n");
  const parsedRenewables = parseDcAwardRadarNationwidePayload(renewablesAliasCsv);
  assert.equal(parsedRenewables.rows[0]?.category, "energy_renewables");

  const blankCategoryCsv = [
    "market,project_or_campus,stage_signal,trade_focus,company,role_if_known,signal_date,source_url,source_type,confidence,why_it_matters_for_DLC,notes,category",
    "Phoenix AZ,Legacy DC,Permit Issued,Electrical,Acme GC,GC,2026-09-01,https://example.com/permit/dc1,County permit,high,Legacy blank category,n,",
  ].join("\n");
  const parsedBlank = parseDcAwardRadarNationwidePayload(blankCategoryCsv);
  assert.equal(parsedBlank.rows[0]?.category, undefined);
  assert.equal(
    prepareDcAwardRadarSeedRow(parsedBlank.rows[0]!).category,
    undefined,
  );

  const verticalAliasCsv = [
    "market,project_or_campus,stage_signal,trade_focus,company,role_if_known,signal_date,source_url,source_type,confidence,why_it_matters_for_DLC,notes,vertical",
    "Phoenix AZ,Warehouse A,Permit Issued,Civil,Acme GC,GC,2026-09-01,https://example.com/permit/w1,County permit,med,Warehouse vertical,n,industrial_warehouse",
  ].join("\n");
  const parsedVertical = parseDcAwardRadarNationwidePayload(verticalAliasCsv);
  assert.equal(parsedVertical.rows[0]?.category, "industrial_warehouse");
}
passed += 1;

console.log("dc award radar campus grouping + remaps");
{
  const p2 = PHASE2_DC_AWARD_SIGNAL_SEEDS.find((row) =>
    row.projectOrCampus.includes("DC21-P2"),
  );
  const p3 = PHASE2_DC_AWARD_SIGNAL_SEEDS.find((row) =>
    row.projectOrCampus.includes("DC21-P3"),
  );
  const dc17 = PHASE2_DC_AWARD_SIGNAL_SEEDS.find((row) =>
    row.projectOrCampus.includes("DC17"),
  );
  assert.ok(p2 && p3 && dc17);
  assert.equal(p2.sourceUrl, DC21_P2_SOURCE_URL);
  assert.notEqual(normalizeSourceUrl(p2.sourceUrl), normalizeSourceUrl(p3.sourceUrl));
  assert.equal(
    normalizeSourceUrl(p3.sourceUrl),
    normalizeSourceUrl(DC21_P3_SOURCE_URL),
  );
  assert.equal(dc17.projectOrCampus, EQUINIX_DC17_PROJECT);
  assert.equal(
    PHASE2_DC_AWARD_SIGNAL_SEEDS.some((row) =>
      row.projectOrCampus.includes("Beaumeade Parcel C2"),
    ),
    false,
  );
  assert.equal(p2.campusKey, EQUINIX_DC21_CAMPUS_KEY);
  assert.equal(dc17.campusKey, EQUINIX_DC17_CAMPUS_KEY);
  assert.notEqual(p2.campusKey, dc17.campusKey);
  assert.equal(p3.isPrimaryInCampus, true);
  assert.equal(p2.isPrimaryInCampus, false);

  const nttKeys = new Set(
    PHASE2_DC_AWARD_SIGNAL_SEEDS.filter((row) =>
      row.projectOrCampus.includes("NTT/VA6"),
    ).map((row) => row.campusKey),
  );
  assert.deepEqual([...nttKeys], [NTT_VA6_CAMPUS_KEY]);

  const vantageKeys = new Set(
    PHASE2_DC_AWARD_SIGNAL_SEEDS.filter((row) =>
      row.projectOrCampus.toLowerCase().includes("vantage oh1"),
    ).map((row) => row.campusKey),
  );
  assert.deepEqual([...vantageKeys], [VANTAGE_OH1_CAMPUS_KEY]);

  const remappedP2 = applyKnownCampusAndRemaps({
    market: "Ashburn VA",
    projectOrCampus: DC21_P2_PROJECT,
    stageSignal: DC21_P2_STAGE,
    tradeFocus: "Electrical",
    company: "DPR Construction",
    roleIfKnown: "GC",
    signalDate: "2025-11-07",
    sourceUrl: DC21_P2_LEGACY_SOURCE_URL,
    sourceType: "County permit (MLQ.ai)",
    confidence: "high",
    whyItMattersForDlc: "x",
    notes: "Permit BLDC-2025-030931",
  });
  assert.equal(normalizeSourceUrl(remappedP2.sourceUrl), normalizeSourceUrl(DC21_P2_SOURCE_URL));
  assert.equal(remappedP2.campusKey, EQUINIX_DC21_CAMPUS_KEY);

  const remappedDc17 = applyKnownCampusAndRemaps({
    ...dc17,
    projectOrCampus: "Beaumeade Parcel C2 (44710 Performance Cir)",
    campusKey: undefined,
    campusName: undefined,
    isPrimaryInCampus: undefined,
  });
  assert.equal(remappedDc17.projectOrCampus, EQUINIX_DC17_PROJECT);
  assert.equal(remappedDc17.campusKey, EQUINIX_DC17_CAMPUS_KEY);

  const preparedP2 = prepareDcAwardRadarSeedRow(p2);
  const legacyKeys = legacySourceKeysForPrepared(preparedP2);
  assert.ok(legacyKeys.length >= 1);
  assert.ok(
    legacyKeys.includes(
      buildDcAwardSignalSourceKey({
        sourceUrl: DC21_P2_LEGACY_SOURCE_URL,
        projectOrCampus: DC21_P2_PROJECT,
        stageSignal: DC21_P2_STAGE,
      }),
    ),
  );

  const grouped = groupDcAwardRadarSignals([
    {
      _id: "p3",
      market: "Ashburn VA",
      projectOrCampus: p3.projectOrCampus,
      stageSignal: p3.stageSignal,
      tradeFocus: p3.tradeFocus,
      company: "DPR Construction",
      roleIfKnown: "GC",
      signalDate: p3.signalDate,
      sourceUrl: p3.sourceUrl,
      sourceType: p3.sourceType,
      confidence: "high",
      whyItMattersForDlc: p3.whyItMattersForDlc,
      notes: p3.notes,
      campusKey: EQUINIX_DC21_CAMPUS_KEY,
      campusName: "Equinix DC21 (22175 Beaumeade Cir)",
      isPrimaryInCampus: true,
      contactName: "George Pfeffer",
      contactTitle: "CEO",
    },
    {
      _id: "p2",
      market: "Ashburn VA",
      projectOrCampus: p2.projectOrCampus,
      stageSignal: p2.stageSignal,
      tradeFocus: p2.tradeFocus,
      company: "DPR Construction",
      roleIfKnown: "GC",
      signalDate: p2.signalDate,
      sourceUrl: p2.sourceUrl,
      sourceType: p2.sourceType,
      confidence: "high",
      whyItMattersForDlc: p2.whyItMattersForDlc,
      notes: p2.notes,
      campusKey: EQUINIX_DC21_CAMPUS_KEY,
      campusName: "Equinix DC21 (22175 Beaumeade Cir)",
      isPrimaryInCampus: false,
      contactName: "George Pfeffer",
    },
    {
      _id: "dc17",
      market: "Ashburn VA",
      projectOrCampus: dc17.projectOrCampus,
      stageSignal: dc17.stageSignal,
      tradeFocus: dc17.tradeFocus,
      company: "DPR Construction",
      roleIfKnown: "GC",
      signalDate: dc17.signalDate,
      sourceUrl: dc17.sourceUrl,
      sourceType: dc17.sourceType,
      confidence: "high",
      whyItMattersForDlc: dc17.whyItMattersForDlc,
      notes: dc17.notes,
      campusKey: EQUINIX_DC17_CAMPUS_KEY,
      campusName: "Equinix DC17 (44710 Performance Cir)",
      isPrimaryInCampus: true,
      contactName: "George Pfeffer",
    },
  ]);
  assert.equal(grouped.length, 2);
  const dc21Group = grouped.find((g) => g.campusKey === EQUINIX_DC21_CAMPUS_KEY);
  const dc17Group = grouped.find((g) => g.campusKey === EQUINIX_DC17_CAMPUS_KEY);
  assert.ok(dc21Group && dc17Group);
  assert.equal(dc21Group.signals.length, 2);
  assert.equal(dc17Group.signals.length, 1);
  assert.equal(dc21Group.contact.contactName, "George Pfeffer");
  assert.equal(dc17Group.contact.contactName, "George Pfeffer");

  const primaryWins = pickCampusGroupContact([
    {
      ...grouped[0]!.signals[0]!,
      _id: "empty",
      isPrimaryInCampus: false,
      contactName: undefined,
      email: undefined,
      phone: undefined,
      linkedinUrl: undefined,
    },
    {
      ...grouped[0]!.signals[0]!,
      _id: "secondary",
      isPrimaryInCampus: false,
      contactName: "Other Person",
    },
    {
      ...grouped[0]!.signals[0]!,
      _id: "primary",
      isPrimaryInCampus: true,
      contactName: "Preferred Contact",
    },
  ]);
  assert.equal(primaryWins.contactName, "Preferred Contact");

  const companyFallback = groupDcAwardRadarSignals([
    {
      _id: "a1",
      market: "Phoenix AZ",
      projectOrCampus: "Campus A",
      stageSignal: "Permit Issued",
      tradeFocus: "Electrical",
      company: "Acme Construction",
      roleIfKnown: "GC",
      signalDate: "2026-01-01",
      sourceUrl: "https://example.com/a1",
      sourceType: "County permit",
      confidence: "high",
      whyItMattersForDlc: "x",
      notes: "n",
      contactName: "Pat Contact",
    },
    {
      _id: "a2",
      market: "Phoenix AZ",
      projectOrCampus: "Campus B",
      stageSignal: "Permit Issued",
      tradeFocus: "Electrical",
      company: "Acme Construction",
      roleIfKnown: "GC",
      signalDate: "2026-02-01",
      sourceUrl: "https://example.com/a2",
      sourceType: "County permit",
      confidence: "med",
      whyItMattersForDlc: "x",
      notes: "n",
    },
    {
      _id: "b1",
      market: "Phoenix AZ",
      projectOrCampus: "Other",
      stageSignal: "Permit Issued",
      tradeFocus: "Electrical",
      company: "Beta GC",
      roleIfKnown: "GC",
      signalDate: "2026-03-01",
      sourceUrl: "https://example.com/b1",
      sourceType: "County permit",
      confidence: "low",
      whyItMattersForDlc: "x",
      notes: "n",
    },
  ]);
  assert.equal(companyFallback.length, 2);
  const acme = companyFallback.find((g) => g.campusName === "Acme Construction");
  assert.ok(acme);
  assert.equal(acme.signals.length, 2);
  assert.equal(acme.contact.contactName, "Pat Contact");

  const campusCsv = [
    "market,project_or_campus,stage_signal,trade_focus,company,role_if_known,signal_date,source_url,source_type,confidence,why_it_matters_for_DLC,notes,campus_key,campus_name,is_primary_in_campus",
    "Phoenix AZ,Example Campus,Permit Issued,Electrical,Acme GC,GC,2026-09-01,https://example.com/permit/2,County permit,high,New market signal,n,custom-campus,Custom Campus,true",
  ].join("\n");
  const campusParsed = parseDcAwardRadarNationwidePayload(campusCsv);
  assert.equal(campusParsed.rows[0]?.campusKey, "custom-campus");
  assert.equal(campusParsed.rows[0]?.campusName, "Custom Campus");
  assert.equal(campusParsed.rows[0]?.isPrimaryInCampus, true);
  assert.deepEqual(pickDefinedCampusFields({ campusKey: "  keep-me  " }), {
    campusKey: "keep-me",
  });
  assert.deepEqual(pickDefinedCampusFields({}), {});

  const unstamped = groupDcAwardRadarSignals([
    {
      _id: "p3-raw",
      market: "Ashburn VA",
      projectOrCampus: p3.projectOrCampus,
      stageSignal: p3.stageSignal,
      tradeFocus: p3.tradeFocus,
      company: "DPR Construction",
      roleIfKnown: "GC",
      signalDate: p3.signalDate,
      sourceUrl: p3.sourceUrl,
      sourceType: p3.sourceType,
      confidence: "high",
      whyItMattersForDlc: p3.whyItMattersForDlc,
      notes: p3.notes,
    },
    {
      _id: "dc17-raw",
      market: "Ashburn VA",
      projectOrCampus: dc17.projectOrCampus,
      stageSignal: dc17.stageSignal,
      tradeFocus: dc17.tradeFocus,
      company: "DPR Construction",
      roleIfKnown: "GC",
      signalDate: dc17.signalDate,
      sourceUrl: dc17.sourceUrl,
      sourceType: dc17.sourceType,
      confidence: "high",
      whyItMattersForDlc: dc17.whyItMattersForDlc,
      notes: dc17.notes,
    },
  ]);
  assert.equal(unstamped.length, 2);
  assert.ok(unstamped.some((g) => g.campusKey === EQUINIX_DC21_CAMPUS_KEY));
  assert.ok(unstamped.some((g) => g.campusKey === EQUINIX_DC17_CAMPUS_KEY));

  assert.equal(
    dcAwardSafeHttpUrl("https://mlq.ai/permit-filings/x"),
    "https://mlq.ai/permit-filings/x",
  );
  assert.equal(dcAwardSafeHttpUrl("javascript:alert(1)"), undefined);
  assert.equal(
    dcAwardSafeHttpUrl("javascript://example.com/%0aalert(1)"),
    undefined,
  );
  assert.throws(
    () =>
      prepareDcAwardRadarSeedRow({
        ...p2,
        sourceUrl: "javascript:alert(1)",
      }),
    /sourceUrl must be http/,
  );
}
passed += 1;

console.log("dc award radar campus group collapse / expand all");
{
  const keys = ["equinix-dc21", "equinix-dc17", "ntt-va6"];
  const expanded = DEFAULT_DC_AWARD_GROUP_EXPANSION;
  assert.equal(areAllDcAwardCampusGroupsExpanded(keys, expanded), true);
  assert.equal(areAllDcAwardCampusGroupsCollapsed(keys, expanded), false);
  assert.equal(isDcAwardCampusGroupExpanded("equinix-dc21", expanded), true);

  const collapsed = collapseAllDcAwardCampusGroups();
  assert.equal(areAllDcAwardCampusGroupsCollapsed(keys, collapsed), true);
  assert.equal(areAllDcAwardCampusGroupsExpanded(keys, collapsed), false);
  assert.equal(isDcAwardCampusGroupExpanded("equinix-dc21", collapsed), false);
  assert.equal(isDcAwardCampusGroupExpanded("equinix-dc17", collapsed), false);

  const oneOpened = toggleDcAwardCampusGroup("equinix-dc21", collapsed);
  assert.equal(isDcAwardCampusGroupExpanded("equinix-dc21", oneOpened), true);
  assert.equal(isDcAwardCampusGroupExpanded("equinix-dc17", oneOpened), false);
  assert.equal(areAllDcAwardCampusGroupsCollapsed(keys, oneOpened), false);
  assert.equal(areAllDcAwardCampusGroupsExpanded(keys, oneOpened), false);

  const reexpanded = expandAllDcAwardCampusGroups();
  assert.equal(areAllDcAwardCampusGroupsExpanded(keys, reexpanded), true);
  assert.equal(isDcAwardCampusGroupExpanded("equinix-dc17", reexpanded), true);

  const oneClosed = toggleDcAwardCampusGroup("ntt-va6", reexpanded);
  assert.equal(isDcAwardCampusGroupExpanded("ntt-va6", oneClosed), false);
  assert.equal(isDcAwardCampusGroupExpanded("equinix-dc21", oneClosed), true);

  assert.equal(areAllDcAwardCampusGroupsCollapsed([], collapsed), false);
  assert.equal(areAllDcAwardCampusGroupsExpanded([], expanded), false);

  const persisted = parseDcAwardRadarGroupExpansion(
    serializeDcAwardRadarGroupExpansion(oneOpened),
  );
  assert.equal(persisted.collapsedByDefault, true);
  assert.equal(isDcAwardCampusGroupExpanded("equinix-dc21", persisted), true);
  assert.equal(isDcAwardCampusGroupExpanded("equinix-dc17", persisted), false);
  assert.deepEqual(parseDcAwardRadarGroupExpansion(null), expanded);
  assert.deepEqual(parseDcAwardRadarGroupExpansion({ version: 2 }), expanded);
  assert.deepEqual(
    parseDcAwardRadarGroupExpansion({
      version: 1,
      collapsedByDefault: true,
      exceptions: ["", 12, "keep-me"],
    }),
    { collapsedByDefault: true, exceptions: new Set(["keep-me"]) },
  );
}
passed += 1;

console.log("dc award radar lead-count uniqueness");
{
  const empty = summarizeDcAwardRadarLeads([], 0);
  assert.equal(empty.signalCount, 0);
  assert.equal(empty.uniqueContactCount, 0);
  assert.equal(empty.contactsWithPhone, 0);

  const campusChildren = summarizeDcAwardRadarLeads(
    [
      {
        company: "DPR Construction",
        confidence: "high",
        contactName: "George Pfeffer",
        phone: "(703) 555-0100",
        phoneType: "cell",
        email: "george@dpr.com",
      },
      {
        company: "DPR Construction",
        confidence: "high",
        contactName: "  George   Pfeffer  ",
        linkedinUrl: "https://www.linkedin.com/in/george-pfeffer",
      },
      {
        company: "DPR Construction",
        confidence: "med",
        contactName: "George Pfeffer",
      },
    ],
    1,
  );
  assert.equal(campusChildren.signalCount, 3);
  assert.equal(campusChildren.campusGroupCount, 1);
  assert.equal(campusChildren.uniqueContactCount, 1);
  assert.equal(campusChildren.contactsWithPhone, 1);
  assert.equal(campusChildren.contactsWithEmail, 1);
  assert.equal(campusChildren.contactsWithLinkedIn, 1);
  assert.equal(campusChildren.contactsWithCell, 1);
  assert.equal(campusChildren.highConfidenceSignalCount, 2);
  assert.equal(
    dcAwardContactIdentityKey({
      company: "DPR Construction",
      contactName: "George Pfeffer",
    }),
    "company-name:dpr construction|george pfeffer",
  );

  const splitCompanies = summarizeDcAwardRadarLeads(
    [
      {
        company: "DPR Construction",
        confidence: "high",
        contactName: "George Pfeffer",
        phone: "7035550100",
      },
      {
        company: "HITT Contracting",
        confidence: "low",
        contactName: "George Pfeffer",
        email: "other@hitt.com",
      },
    ],
    2,
  );
  assert.equal(splitCompanies.uniqueContactCount, 2);
  assert.equal(splitCompanies.contactsWithPhone, 1);
  assert.equal(splitCompanies.contactsWithEmail, 1);

  const identityFallback = summarizeDcAwardRadarLeads(
    [
      {
        company: "Unknown GC",
        confidence: "med",
        email: "ops@example.com",
      },
      {
        company: "Unknown GC",
        confidence: "low",
        email: "OPS@example.com",
        phone: "415-555-0199",
        phoneType: "direct",
      },
      {
        company: "No Identity LLC",
        confidence: "high",
      },
    ],
    2,
  );
  assert.equal(identityFallback.uniqueContactCount, 1);
  assert.equal(identityFallback.contactsWithEmail, 1);
  assert.equal(identityFallback.contactsWithPhone, 1);
  assert.equal(identityFallback.contactsWithCell, 0);
  assert.equal(identityFallback.highConfidenceSignalCount, 1);
  assert.equal(
    dcAwardContactIdentityKey({
      company: "Unknown GC",
      email: "ops@example.com",
    }),
    "email:ops@example.com",
  );
  assert.equal(
    dcAwardContactIdentityKey({
      company: "No Identity LLC",
    }),
    null,
  );
}
passed += 1;

console.log("dc award radar contact filters + unique CSV + GHL tag-only");
{
  const rows = [
    {
      company: "DPR Construction",
      confidence: "high" as const,
      contactName: "George Pfeffer",
      phone: "(703) 555-0100",
      phoneType: "cell" as const,
      email: "george@dpr.com",
      market: "Ashburn VA",
      projectOrCampus: "Equinix DC21-P3",
      tradeFocus: "Electrical + Mechanical",
    },
    {
      company: "DPR Construction",
      confidence: "high" as const,
      contactName: "George Pfeffer",
      linkedinUrl: "https://www.linkedin.com/in/george-pfeffer",
      market: "Ashburn VA",
      projectOrCampus: "Equinix DC21-P2",
      tradeFocus: "Electrical",
    },
    {
      company: "HITT Contracting",
      confidence: "med" as const,
      contactName: "Pat Lead",
      email: "pat@hitt.com",
      market: "Ashburn VA",
      projectOrCampus: "NTT/VA6",
      tradeFocus: "Electrical",
    },
    {
      company: "No Identity LLC",
      confidence: "low" as const,
      market: "Phoenix AZ",
      projectOrCampus: "Campus X",
    },
  ];

  const unique = collectUniqueDcAwardContacts(rows);
  assert.equal(unique.length, 2);
  const george = unique.find((c) => c.contactName === "George Pfeffer");
  assert.ok(george);
  assert.equal(george.hasPhone, true);
  assert.equal(george.hasEmail, true);
  assert.equal(george.hasLinkedIn, true);
  assert.equal(george.hasCell, true);
  assert.deepEqual(george.projects, ["Equinix DC21-P2", "Equinix DC21-P3"]);
  assert.equal(uniqueContactHasGhlIdentity(george), true);

  const hasPhone = filterSignalsByContactFilters(rows, new Set(["hasPhone"]));
  assert.equal(hasPhone.length, 2);
  assert.ok(hasPhone.every((row) => row.contactName === "George Pfeffer"));

  const hasLinkedIn = filterSignalsByContactFilters(
    rows,
    new Set(["hasLinkedIn"]),
  );
  assert.equal(hasLinkedIn.length, 2);

  const missingPhone = filterSignalsByContactFilters(
    rows,
    new Set(["missingPhone"]),
  );
  assert.equal(missingPhone.length, 1);
  assert.equal(missingPhone[0]?.contactName, "Pat Lead");

  const contradictory = filterSignalsByContactFilters(
    rows,
    new Set(["hasPhone", "missingPhone"]),
  );
  assert.equal(contradictory.length, 0);

  const noFilters = filterSignalsByContactFilters(rows, new Set());
  assert.equal(noFilters.length, 4);

  assert.equal(
    uniqueContactMatchesFilters(george, new Set(["hasCell", "hasEmail"])),
    true,
  );
  assert.equal(
    uniqueContactMatchesFilters(george, new Set(["missingEmail"])),
    false,
  );

  const filteredForStats = filterSignalsByContactFilters(
    rows,
    new Set(["hasEmail"]),
  );
  const filteredGroups = groupDcAwardRadarSignals(
    filteredForStats.map((row, index) => ({
      _id: `row-${index}`,
      market: row.market ?? "",
      projectOrCampus: row.projectOrCampus ?? "",
      stageSignal: "stage",
      tradeFocus: row.tradeFocus ?? "",
      company: row.company,
      roleIfKnown: "GC",
      signalDate: "2026-01-01",
      sourceUrl: "https://example.com/src",
      sourceType: "test",
      confidence: row.confidence,
      whyItMattersForDlc: "test",
      notes: "",
      contactName: row.contactName,
      email: row.email,
      phone: row.phone,
      phoneType: row.phoneType,
      linkedinUrl: row.linkedinUrl,
    })),
  );
  const leadStats = summarizeDcAwardRadarLeads(
    filteredForStats,
    filteredGroups.length,
  );
  assert.equal(leadStats.uniqueContactCount, 2);
  assert.equal(leadStats.contactsWithEmail, 2);
  assert.equal(leadStats.signalCount, 3);

  const csv = buildDcAwardRadarContactsCsv(unique);
  for (const header of DC_AWARD_RADAR_CONTACT_CSV_HEADERS) {
    assert.ok(csv.includes(header), `CSV missing ${header}`);
  }
  assert.ok(csv.includes("George Pfeffer"));
  assert.ok(csv.includes("Equinix DC21-P2 | Equinix DC21-P3"));

  const fullEligibleBatch = selectDcAwardGhlContactBatch(unique);
  assert.equal(fullEligibleBatch.truncated, false);
  assert.equal(fullEligibleBatch.omitted, 0);
  assert.equal(fullEligibleBatch.sent, unique.length);
  assert.equal(fullEligibleBatch.total, unique.length);
  const ghlCsv = buildDcAwardRadarGhlHandoffCsv(
    fullEligibleBatch.batch,
    fullEligibleBatch,
  );
  assert.ok(ghlCsv.includes(DC_AWARD_RADAR_GHL_SOURCE));
  assert.ok(ghlCsv.includes(DC_AWARD_RADAR_GHL_TAG));
  assert.ok(ghlCsv.includes("exportNote"));
  assert.ok(ghlCsv.includes("all "));
  assert.ok(ghlCsv.includes("no send-size cap"));

  function fakeUnique(i: number, eligible: boolean): DcAwardRadarUniqueContact {
    return {
      identityKey: `k-${i}`,
      company: `Co ${i}`,
      contactName: `Name ${i}`,
      contactTitle: "",
      email: eligible ? `n${i}@ex.com` : "",
      phone: "",
      linkedinUrl: "",
      companyWebsite: "",
      markets: [],
      projects: [],
      trades: [],
      confidence: "med",
      hasPhone: false,
      hasEmail: eligible,
      hasLinkedIn: false,
      hasCell: false,
    };
  }
  const ineligibleFirst = Array.from({ length: 20 }, (_, i) =>
    fakeUnique(i, false),
  );
  const eligibleMany = Array.from({ length: 107 }, (_, i) =>
    fakeUnique(i + 20, true),
  );
  const fullSend = selectDcAwardGhlContactBatch([
    ...ineligibleFirst,
    ...eligibleMany,
  ]);
  assert.equal(fullSend.uniqueTotal, 127);
  assert.equal(fullSend.ineligible, 20);
  assert.equal(fullSend.total, 107);
  assert.equal(fullSend.sent, 107);
  assert.equal(fullSend.omitted, 0);
  assert.equal(fullSend.truncated, false);
  assert.equal(
    fullSend.chunkCount,
    Math.ceil(107 / DC_AWARD_RADAR_GHL_CHUNK_SIZE),
  );
  assert.ok(fullSend.batch.every((row) => row.email.includes("@")));
  assert.equal(fullSend.batch[0]?.email, "n20@ex.com");
  assert.equal(fullSend.batch.length, 107);

  const chunks = chunkDcAwardGhlContacts(fullSend.batch);
  assert.equal(chunks.length, fullSend.chunkCount);
  assert.equal(
    chunks.reduce((sum, chunk) => sum + chunk.length, 0),
    107,
  );
  assert.ok(chunks.every((chunk) => chunk.length <= DC_AWARD_RADAR_GHL_CHUNK_SIZE));
  assert.equal(chunks[0]?.length, DC_AWARD_RADAR_GHL_CHUNK_SIZE);
  assert.equal(chunks[chunks.length - 1]?.length, 107 % DC_AWARD_RADAR_GHL_CHUNK_SIZE);

  const fullCopy = describeDcAwardGhlSendBatch(fullSend);
  assert.equal(
    fullCopy.entityName,
    "sending all 107 GHL-eligible contacts",
  );
  assert.ok(fullCopy.confirmPrompt.includes("all 107"));
  assert.equal(fullCopy.truncationNote, undefined);
  assert.ok(fullCopy.chunkNote?.includes("internal chunks"));
  assert.ok(!fullCopy.confirmPrompt.includes("100 of 107"));
  assert.ok(!fullCopy.confirmPrompt.includes("one-shot cap"));

  const handoff = buildDcAwardRadarGhlHandoffCsv(fullSend.batch, fullSend);
  assert.ok(handoff.includes("all 107"));
  assert.ok(handoff.includes("no send-size cap"));
  assert.ok(!handoff.includes("first 100"));
  assert.equal(
    dcAwardRadarGhlHandoffCsvFilename(new Date("2026-09-15")),
    "dc-award-radar-ghl-tag-only-2026-09-15.csv",
  );
  assert.equal(
    summarizeDcAwardGhlPushOutcome({
      created: 0,
      updated: 0,
      skipped: 107,
      tagFailed: 0,
      configured: true,
      contactCount: 107,
    }).ok,
    false,
  );
  assert.equal(
    summarizeDcAwardGhlPushOutcome({
      created: 0,
      updated: 0,
      skipped: 107,
      tagFailed: 0,
      configured: true,
      contactCount: 107,
    }).reason,
    "all_skipped_or_failed",
  );
  assert.equal(
    summarizeDcAwardGhlPushOutcome({
      created: 2,
      updated: 1,
      skipped: 1,
      tagFailed: 0,
      configured: true,
      contactCount: 4,
    }).ok,
    true,
  );

  const tags = buildDcAwardGhlTags({
    markets: ["Ashburn VA"],
    trades: ["Electrical + Mechanical"],
  });
  assert.ok(tags.includes(DC_AWARD_RADAR_GHL_TAG));
  assert.ok(tags.includes(`${DC_AWARD_RADAR_GHL_TAG}-ashburn-va`));
  assert.ok(!tags.some((tag) => /sms|workflow|campaign/i.test(tag)));
  assert.deepEqual(Object.keys(serializeDcAwardGhlAddTagsBody(tags)), ["tags"]);

  const upsert = buildDcAwardGhlUpsertBody(
    {
      company: "DPR Construction",
      contactName: "George Pfeffer",
      email: "george@dpr.com",
      phone: "(703) 555-0100",
      companyWebsite: "https://www.dpr.com",
      markets: ["Ashburn VA"],
      trades: ["Electrical"],
    },
    "loc_test",
  );
  const serialized = serializeDcAwardGhlUpsertBody({
    ...upsert,
    // extra keys on the builder object must not survive serialize
    campaign: "nope",
    sms: "nope",
    workflow: "nope",
  } as typeof upsert);
  assert.equal(serialized.source, DC_AWARD_RADAR_GHL_SOURCE);
  assert.equal(serialized.firstName, "George");
  assert.equal(serialized.lastName, "Pfeffer");
  assert.equal(ghlSerializedBodyIsAllowlisted(serialized), true);
  assert.equal(ghlUpsertBodyHasForbiddenKeys(serialized), false);
  for (const key of ghlUpsertBodyKeys(serialized)) {
    assert.ok(
      [
        "locationId",
        "firstName",
        "lastName",
        "name",
        "email",
        "phone",
        "companyName",
        "website",
        "source",
      ].includes(key),
    );
  }
  assert.equal("tags" in serialized, false);
  assert.equal("campaign" in serialized, false);
  assert.equal("workflow" in serialized, false);
  assert.equal("sms" in serialized, false);
  assert.equal(
    isDcAwardGhlConfigured({ HIGHLEVEL_API_KEY: "k", HIGHLEVEL_LOCATION_ID: "l" }),
    true,
  );
  assert.equal(isDcAwardGhlConfigured({}), false);

  const collapsed = collapseAllDcAwardCampusGroups();
  assert.equal(
    areAllDcAwardCampusGroupsCollapsed(
      filteredGroups.map((g) => g.groupKey),
      collapsed,
    ),
    filteredGroups.length > 0,
  );
}
passed += 1;

console.log(`\ncore-edge-tests: ${passed} cases passed.\n`);
