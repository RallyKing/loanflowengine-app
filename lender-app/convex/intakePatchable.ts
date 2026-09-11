import { v } from "convex/values";
import {
  analysisInstance,
  assetRow,
  borrower,
  businessState,
  commercialState,
  comparisonState,
  coverState,
  dayCounterDocumentState,
  dtiState,
  feesState,
  guarantor,
  hardMoneyState,
  incomeRow,
  liabilityRow,
  loan,
  payoffState,
  propertyRecord,
  reoBlockMeta,
  reoRow,
  trackRecordBlockMeta,
  trackRecordRow,
  scenarioState,
  businessDebtBlockMeta,
  weightedInterestInstanceData,
  weightedInterestRow,
  workflowItem,
} from "./intakeSchemaPart";
import {
  personalFinancialStatementV,
  pfsInstanceV,
} from "./pfsStatementValidators";
import { simplePlInstanceV, simplePlStatementV } from "./simplePlValidators";

/**
 * Top-level fields allowed on intake-shaped documents (standalone `intakeSheets`
 * rows and `pipeline.dealData`). Shared by `intakeSheets.patch` and
 * `pipeline.patchDeal`.
 *
 * Nested shapes match `intakeSheets` / `intakeSchemaPart` — avoid `v.any()` here
 * so API and DB stay aligned with the File workspace model.
 */
export const intakePatchableFields = {
  clientName: v.optional(v.string()),
  projectName: v.optional(v.string()),
  ownerName: v.optional(v.string()),
  fileName: v.optional(v.string()),
  leadId: v.optional(v.string()),
  sourceType: v.optional(v.string()),
  accountExecutive: v.optional(v.string()),
  startDate: v.optional(v.string()),
  fundedDate: v.optional(v.string()),
  occupancy: v.optional(v.string()),
  occupancyOther: v.optional(v.string()),
  propertiesOwned: v.optional(v.string()),
  subjectProperty: v.optional(propertyRecord),
  primaryProperty: v.optional(propertyRecord),
  borrowers: v.optional(v.array(borrower)),
  loans: v.optional(v.array(loan)),
  citizenship: v.optional(v.string()),
  defaultJudgments: v.optional(v.string()),
  bkHistory: v.optional(v.string()),
  bkDate: v.optional(v.string()),
  latePaymentsLast12: v.optional(v.string()),
  incomeRows: v.optional(v.array(incomeRow)),
  assets: v.optional(v.array(assetRow)),
  liabilities: v.optional(v.array(liabilityRow)),
  /** SBA-style Personal Financial Statement (pipeline PFS block). */
  pfs: v.optional(personalFinancialStatementV),
  /** First-class per-borrower PFS documents on this file. */
  pfsInstances: v.optional(v.array(pfsInstanceV)),
  /** Simple P&L matching the CSV template (pipeline Simple P&L block). */
  simplePl: v.optional(simplePlStatementV),
  /** First-class per-timeframe Simple P&L documents on this file. */
  simplePlInstances: v.optional(v.array(simplePlInstanceV)),
  dependentsCount: v.optional(v.string()),
  dependentsAges: v.optional(v.string()),
  workflow: v.optional(v.array(workflowItem)),
  workflowTemplateId: v.optional(v.string()),
  primaryObjective: v.optional(v.string()),
  additionalNotes: v.optional(v.string()),

  scenario: v.optional(scenarioState),
  dti: v.optional(dtiState),
  dtiInstances: v.optional(v.array(analysisInstance(dtiState))),
  reo: v.optional(v.array(reoRow)),
  reoMeta: v.optional(reoBlockMeta),
  trackRecord: v.optional(v.array(trackRecordRow)),
  trackRecordMeta: v.optional(trackRecordBlockMeta),
  comparison: v.optional(comparisonState),
  comparisonInstances: v.optional(v.array(analysisInstance(comparisonState))),
  weightedInterest: v.optional(v.array(weightedInterestRow)),
  businessDebtMeta: v.optional(businessDebtBlockMeta),
  weightedInterestInstances: v.optional(
    v.array(analysisInstance(weightedInterestInstanceData)),
  ),
  payoff: v.optional(payoffState),
  payoffInstances: v.optional(v.array(analysisInstance(payoffState))),
  dayCounter: v.optional(dayCounterDocumentState),
  dayCounterInstances: v.optional(
    v.array(analysisInstance(dayCounterDocumentState)),
  ),
  cover: v.optional(coverState),

  dealType: v.optional(v.string()),
  business: v.optional(businessState),
  commercial: v.optional(commercialState),
  hardMoney: v.optional(hardMoneyState),
  guarantors: v.optional(v.array(guarantor)),
  fees: v.optional(feesState),

  /** Order / visibility / collapse for deal sections in the file workspace. */
  dealWorkspaceLayout: v.optional(v.any()),
  /** Order / visibility / collapse for calculators inside the Analysis section. */
  dealAnalysisLayout: v.optional(v.any()),
  /** Tab 3 Sub-Tab A: section visibility toggles (gear menu). */
  dealWorkspaceTab3Layout: v.optional(v.any()),
  /** Tab 2 Deal Info: section order / visibility (v1 object). */
  dealInfoTabLayout: v.optional(v.any()),
  /** Deal Info command center — unified block order / visibility (v1 object). */
  dealInfoCommandCenterLayout: v.optional(v.any()),
  /** Tab 1 File Overview: section expand/collapse (v1 object). */
  overviewTabLayout: v.optional(v.any()),
  /** Tab 5 Client Portal: section order / visibility (v1 object). */
  clientPortalTabLayout: v.optional(v.any()),
  /** Portals & Progress: unified block order / visibility (v1 object). */
  portalsProgressTabLayout: v.optional(v.any()),
};

/**
 * Patch args for deal-shaped documents. `fundingType` is **not** on
 * `intakePatchableFields` so it is only introduced via this `v.object({ … })`
 * literal (avoids spread overwriting / bundlers omitting the key).
 */
export const intakePatchableChangesValidator = v.object({
  fundingType: v.optional(v.string()),
  ...intakePatchableFields,
});
