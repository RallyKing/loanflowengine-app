import { defineTable } from "convex/server";
import { v } from "convex/values";

const borrower = v.object({
  /** Phase 39.2 — optional CRM hard-link (replaces heuristic borrower matching). */
  contactId: v.optional(v.id("contacts")),
  firstName: v.optional(v.string()),
  middleName: v.optional(v.string()),
  lastName: v.optional(v.string()),
  yearsInSchool: v.optional(v.string()),
  fico: v.optional(v.string()),
  bestTime: v.optional(v.string()),
  mobile: v.optional(v.string()),
  homePhone: v.optional(v.string()),
  altPhone: v.optional(v.string()),
  email: v.optional(v.string()),
  ssn: v.optional(v.string()),
  dob: v.optional(v.string()),
  employerName: v.optional(v.string()),
  employerPhone: v.optional(v.string()),
  employerTenure: v.optional(v.string()),
  position: v.optional(v.string()),
});

const propertyRecord = v.object({
  address: v.optional(v.string()),
  city: v.optional(v.string()),
  state: v.optional(v.string()),
  zip: v.optional(v.string()),
  estimatedValue: v.optional(v.string()),
  estCurrentMortgageBalance: v.optional(v.string()),
  timeInHouse: v.optional(v.string()),
  sqFt: v.optional(v.string()),
  lotSqFt: v.optional(v.string()),
  yearBuilt: v.optional(v.string()),
});

const loan = v.object({
  position: v.optional(v.string()), // "1st", "2nd", "Other"
  lenderName: v.optional(v.string()),
  loanNumber: v.optional(v.string()),
  purpose: v.optional(v.string()), // Purchase / Rate-Term / Cash-Out
  type: v.optional(v.string()), // FHA / Conv / VA / Other
  dateAcquired: v.optional(v.string()),
  beforeMay2009: v.optional(v.string()),
  currentPI: v.optional(v.string()),
  currentBalance: v.optional(v.string()),
  originalAmount: v.optional(v.string()),
  currentRate: v.optional(v.string()),
  rateType: v.optional(v.string()), // Fixed / ARM / I/O / NegAm
  pitia: v.optional(v.string()),
  taxes: v.optional(v.string()),
  insurance: v.optional(v.string()),
  hoa: v.optional(v.string()),
  pmi: v.optional(v.string()),
  impounds: v.optional(v.string()),
  notes: v.optional(v.string()),
});

const incomeRow = v.object({
  borrower: v.optional(v.string()), // "Borrower 1" / "Borrower 2"
  source: v.optional(v.string()), // W2/Self/1099/Retirement/Other
  description: v.optional(v.string()),
  monthlyAmount: v.optional(v.string()),
  notes: v.optional(v.string()),
});

const assetRow = v.object({
  description: v.optional(v.string()),
  estimatedValue: v.optional(v.string()),
  notes: v.optional(v.string()),
});

const liabilityRow = v.object({
  description: v.optional(v.string()),
  monthlyPayment: v.optional(v.string()),
  balance: v.optional(v.string()),
  notes: v.optional(v.string()),
});

const workflowItem = v.object({
  /** Stable id for automations / template sync — never reuse after delete. */
  id: v.optional(v.string()),
  label: v.string(),
  done: v.boolean(),
  date: v.optional(v.string()),
});

// ---------- Added sections ----------

const scenarioDebt = v.object({
  label: v.optional(v.string()),
  amount: v.optional(v.string()),
});

const dtiState = v.object({
  familySize: v.optional(v.string()),
  incomes: v.optional(v.array(v.object({ label: v.optional(v.string()), amount: v.optional(v.string()) }))),
  purchasePrice: v.optional(v.string()),
  downPaymentPct: v.optional(v.string()),
  fundingAmount: v.optional(v.string()),
  loanAmount: v.optional(v.string()),
  termMonths: v.optional(v.string()),
  interestRate: v.optional(v.string()),
  propertyTaxRate: v.optional(v.string()),
  propertyTaxesMonthly: v.optional(v.string()),
  homeownersInsuranceMonthly: v.optional(v.string()),
  hoa: v.optional(v.string()),
  fhaMiRate: v.optional(v.string()),
  fhaMiMonthly: v.optional(v.string()),
  debts: v.optional(
    v.object({
      cars: v.optional(v.string()),
      revolving: v.optional(v.string()),
      installment: v.optional(v.string()),
      other: v.optional(v.string()),
    }),
  ),
});

const reoRow = v.object({
  /** Stable client id for copy / selection (optional on legacy rows). */
  rowId: v.optional(v.string()),
  purchasedDate: v.optional(v.string()),
  state: v.optional(v.string()),
  usage: v.optional(v.string()), // Primary / Rental / 2nd Home / Commercial
  address: v.optional(v.string()),
  propertyType: v.optional(v.string()),
  marketValue: v.optional(v.string()),
  /** Zillow / listing URL for this property (additive). */
  zillowUrl: v.optional(v.string()),
  position: v.optional(v.string()), // 1st / 2nd / 3rd / HELOC
  balance: v.optional(v.string()),
  mortgagePayment: v.optional(v.string()),
  rate: v.optional(v.string()),
  taxes: v.optional(v.string()),
  insurance: v.optional(v.string()),
  hoa: v.optional(v.string()),
  escrow: v.optional(v.string()),
  grossRent: v.optional(v.string()),
  netRent: v.optional(v.string()),
  apn: v.optional(v.string()),
  invested: v.optional(v.string()),
  latLong: v.optional(v.string()),
  lotSf: v.optional(v.string()),
  propSf: v.optional(v.string()),
  mostRecent: v.optional(v.string()),
  /** Row-level multi-contact assignees (Convex contact ids as strings). */
  assignedContactIds: v.optional(v.array(v.string())),
});

/** Block-level Schedule of REO assignees + notes (additive on deal/intake). */
const reoBlockMeta = v.object({
  assignedContactIds: v.optional(v.array(v.string())),
});

const comparisonSide = v.object({
  fundingAmount: v.optional(v.string()),
  loanAmount: v.optional(v.string()),
  ratePct: v.optional(v.string()),
  termMonths: v.optional(v.string()),
  escrowMonthly: v.optional(v.string()),
});

const comparisonState = v.object({
  preparedFor: v.optional(v.string()),
  asOfDate: v.optional(v.string()),
  current: v.optional(comparisonSide),
  proposed: v.optional(comparisonSide),
  notes: v.optional(v.string()),
});

const weightedInterestRow = v.object({
  /** Stable client id for copy / selection (optional on legacy rows). */
  rowId: v.optional(v.string()),
  account: v.optional(v.string()),
  balance: v.optional(v.string()),
  ratePct: v.optional(v.string()),
  monthlyPayment: v.optional(v.string()),
  note: v.optional(v.string()),
  include: v.optional(v.boolean()),
  debtType: v.optional(v.string()),
  debtTypeOther: v.optional(v.string()),
  originalAmount: v.optional(v.string()),
  originationDate: v.optional(v.string()),
  maturityDate: v.optional(v.string()),
  /** Row-level multi-contact assignees (Convex contact ids as strings). */
  assignedContactIds: v.optional(v.array(v.string())),
});

/** Block-level Schedule of Business Debt assignees (additive on deal/intake). */
const businessDebtBlockMeta = v.object({
  assignedContactIds: v.optional(v.array(v.string())),
});

const trackRecordGuarantorSlot = v.object({
  name: v.optional(v.string()),
  contactId: v.optional(v.string()),
});

const trackRecordRow = v.object({
  rowId: v.optional(v.string()),
  address: v.optional(v.string()),
  city: v.optional(v.string()),
  state: v.optional(v.string()),
  zip: v.optional(v.string()),
  propertyType: v.optional(v.string()),
  ownedByGuarantor1: v.optional(v.string()),
  ownedByGuarantor2: v.optional(v.string()),
  ownedByGuarantor3: v.optional(v.string()),
  ownedByGuarantor4: v.optional(v.string()),
  titleHeldInName: v.optional(v.string()),
  acquisitionDate: v.optional(v.string()),
  acquisitionPrice: v.optional(v.string()),
  projectType: v.optional(v.string()),
  rehabOrConstructionAmount: v.optional(v.string()),
  exitType: v.optional(v.string()),
  dateSoldOrLeased: v.optional(v.string()),
  salePriceOrRentAmount: v.optional(v.string()),
  assignedContactIds: v.optional(v.array(v.string())),
});

const trackRecordBlockMeta = v.object({
  assignedContactIds: v.optional(v.array(v.string())),
  guarantors: v.optional(v.array(trackRecordGuarantorSlot)),
});

/** Per-instance payload for weighted-interest tool (rows live under `data`). */
const weightedInterestInstanceData = v.object({
  rows: v.array(weightedInterestRow),
});

export const analysisInstance = <T extends ReturnType<typeof v.object>>(
  data: T,
) =>
  v.object({
    id: v.string(),
    name: v.string(),
    data,
  });

const payoffState = v.object({
  fundingAmount: v.optional(v.string()),
  annualRatePct: v.optional(v.string()),
  periodYears: v.optional(v.string()),
  startDate: v.optional(v.string()),
  extraPayment: v.optional(v.string()),
  preparedFor: v.optional(v.string()),
});

const dayCounterPair = v.object({
  label: v.optional(v.string()),
  date1: v.optional(v.string()),
  date2: v.optional(v.string()),
});

/** Single definition for day-counter section + per-instance tool data. */
const dayCounterDocumentState = v.object({
  noteDate: v.optional(dayCounterPair),
  firstPaymentDate: v.optional(dayCounterPair),
  additional: v.optional(dayCounterPair),
});

const coverLender = v.object({
  name: v.optional(v.string()),
  submission: v.optional(v.string()),
  approval: v.optional(v.string()),
  appraisal: v.optional(v.string()),
  ctc: v.optional(v.string()),
  docsOut: v.optional(v.string()),
  funded: v.optional(v.string()),
});

const coverState = v.object({
  loanOfficer: v.optional(v.string()),
  loNmls: v.optional(v.string()),
  brokerCompanyName: v.optional(v.string()),
  brokerNmls: v.optional(v.string()),
  brokerAgreementDate: v.optional(v.string()),
  recourse: v.optional(v.string()),
  prepayStructure: v.optional(v.string()),
  subDate: v.optional(v.string()),
  estCOE: v.optional(v.string()),
  borrowers: v.optional(v.string()),
  primaryPhone: v.optional(v.string()),
  email: v.optional(v.string()),
  subjectProperty: v.optional(v.string()),
  purchasePrice: v.optional(v.string()),
  occupancy: v.optional(v.string()),
  paymentType: v.optional(v.string()),
  purpose: v.optional(v.string()),
  /** Coversheet product category (FHA, Conv, VA, etc.); root `fundingType` is file-level category. */
  fundingType: v.optional(v.string()),
  propertyType: v.optional(v.string()),
  escrowWaiver: v.optional(v.string()),
  prepayPenalty: v.optional(v.string()),
  grossCompPct: v.optional(v.string()),
  brokerCompPct: v.optional(v.string()),
  flatFee: v.optional(v.string()),
  compType: v.optional(v.string()),
  lenderCompPlan: v.optional(v.string()),
  currentLender: v.optional(v.string()),
  program: v.optional(v.string()),
  /** Coversheet “Funding amount ($)” — canonical string field. */
  fundingAmount: v.optional(v.string()),
  /** Legacy / import alias for loan size (some rows predate `fundingAmount`). */
  loanAmount: v.optional(v.string()),
  ratePct: v.optional(v.string()),
  fhaCase: v.optional(v.string()),
  lockDate1: v.optional(v.string()),
  lockExpires1: v.optional(v.string()),
  lockDate2: v.optional(v.string()),
  lockExpires2: v.optional(v.string()),
  lenders: v.optional(v.array(coverLender)),
  notes: v.optional(v.string()),
  borrowerGoals: v.optional(v.string()),
});

// ---------- Business / Commercial / Hard Money additions ----------

const businessOwner = v.object({
  name: v.optional(v.string()),
  title: v.optional(v.string()),
  ownershipPct: v.optional(v.string()),
  ssn: v.optional(v.string()),
  fico: v.optional(v.string()),
});

const businessState = v.object({
  legalName: v.optional(v.string()),
  dba: v.optional(v.string()),
  entityType: v.optional(v.string()),
  ein: v.optional(v.string()),
  stateOfFormation: v.optional(v.string()),
  formationDate: v.optional(v.string()),
  industry: v.optional(v.string()),
  naics: v.optional(v.string()),
  address: v.optional(v.string()),
  phone: v.optional(v.string()),
  website: v.optional(v.string()),
  employees: v.optional(v.string()),
  annualRevenue: v.optional(v.string()),
  annualNetProfit: v.optional(v.string()),
  avgMonthlyDeposits: v.optional(v.string()),
  monthlyNSF: v.optional(v.string()),
  useOfFunds: v.optional(v.string()),
  useOfFundsNotes: v.optional(v.string()),
  fundingProduct: v.optional(v.string()),
  requestedAmount: v.optional(v.string()),
  requestedTermMonths: v.optional(v.string()),
  paynet: v.optional(v.string()),
  dnbScore: v.optional(v.string()),
  experianIntelliScore: v.optional(v.string()),
  personalGuaranteeRequired: v.optional(v.string()),
  hasExistingMCA: v.optional(v.string()),
  existingMCACount: v.optional(v.string()),
  existingMCABalance: v.optional(v.string()),
  mcaPaymentsPerMonth: v.optional(v.string()),
  monthlyCardVolume: v.optional(v.string()),
  owners: v.optional(v.array(businessOwner)),
  notes: v.optional(v.string()),
});

const commercialState = v.object({
  propertyClass: v.optional(v.string()),
  propertySubType: v.optional(v.string()),
  units: v.optional(v.string()),
  rentableSqFt: v.optional(v.string()),
  yearBuilt: v.optional(v.string()),
  yearRenovated: v.optional(v.string()),
  occupancyPct: v.optional(v.string()),
  grossScheduledRent: v.optional(v.string()), // annual
  vacancyPct: v.optional(v.string()),
  otherIncome: v.optional(v.string()), // annual
  opExTaxes: v.optional(v.string()),
  opExInsurance: v.optional(v.string()),
  opExManagement: v.optional(v.string()),
  opExRepairs: v.optional(v.string()),
  opExUtilities: v.optional(v.string()),
  opExOther: v.optional(v.string()),
  fundingAmount: v.optional(v.string()),
  ratePct: v.optional(v.string()),
  amortizationYears: v.optional(v.string()),
  termMonths: v.optional(v.string()),
  recourse: v.optional(v.string()),
  prepayStructure: v.optional(v.string()),
  sponsorLiquidity: v.optional(v.string()),
  sponsorNetWorth: v.optional(v.string()),
  exitStrategy: v.optional(v.string()),
  notes: v.optional(v.string()),
});

const rehabLine = v.object({
  category: v.optional(v.string()),
  description: v.optional(v.string()),
  amount: v.optional(v.string()),
  draw: v.optional(v.string()),
});

const hardMoneyState = v.object({
  product: v.optional(v.string()), // Bridge / Fix&Flip / DSCR / Construction / Land / Commercial Bridge
  purchasePrice: v.optional(v.string()),
  rehabBudget: v.optional(v.string()),
  asIsValue: v.optional(v.string()),
  arv: v.optional(v.string()),
  initialLoan: v.optional(v.string()),
  rehabHoldback: v.optional(v.string()),
  termMonths: v.optional(v.string()),
  ratePct: v.optional(v.string()),
  points: v.optional(v.string()),
  exitFee: v.optional(v.string()),
  extensionMonths: v.optional(v.string()),
  extensionFee: v.optional(v.string()),
  interestReserveMonths: v.optional(v.string()),
  drawFee: v.optional(v.string()),
  prepayPenalty: v.optional(v.string()),
  exitStrategy: v.optional(v.string()),
  projectedSale: v.optional(v.string()),
  projectedHoldMonths: v.optional(v.string()),
  sellingCostsPct: v.optional(v.string()),
  monthlyHoldingCosts: v.optional(v.string()),
  experienceFlips24: v.optional(v.string()),
  experienceFlips36: v.optional(v.string()),
  rentalsOwned: v.optional(v.string()),
  volumeLifetime: v.optional(v.string()),
  rehabScope: v.optional(v.string()),
  rehabLines: v.optional(v.array(rehabLine)),
  notes: v.optional(v.string()),
});

const guarantor = v.object({
  /** Phase 39.2 — optional CRM hard-link. */
  contactId: v.optional(v.id("contacts")),
  name: v.optional(v.string()),
  role: v.optional(v.string()),
  ownershipPct: v.optional(v.string()),
  fico: v.optional(v.string()),
  liquidAssets: v.optional(v.string()),
  netWorth: v.optional(v.string()),
  yearsExperience: v.optional(v.string()),
  ssn: v.optional(v.string()),
  dob: v.optional(v.string()),
  mobile: v.optional(v.string()),
  email: v.optional(v.string()),
  address: v.optional(v.string()),
  citizenship: v.optional(v.string()),
  notes: v.optional(v.string()),
});

const feesState = v.object({
  broker: v.optional(
    v.object({
      origination: v.optional(v.string()),
      processing: v.optional(v.string()),
      underwriting: v.optional(v.string()),
      flatFee: v.optional(v.string()),
    }),
  ),
  lender: v.optional(
    v.object({
      origination: v.optional(v.string()),
      discount: v.optional(v.string()),
      underwriting: v.optional(v.string()),
      processing: v.optional(v.string()),
      docPrep: v.optional(v.string()),
      admin: v.optional(v.string()),
      funding: v.optional(v.string()),
      pointsPct: v.optional(v.string()),
    }),
  ),
  thirdParty: v.optional(
    v.object({
      appraisal: v.optional(v.string()),
      environmental: v.optional(v.string()),
      inspection: v.optional(v.string()),
      titleInsurance: v.optional(v.string()),
      escrow: v.optional(v.string()),
      recording: v.optional(v.string()),
      legal: v.optional(v.string()),
      survey: v.optional(v.string()),
    }),
  ),
  prepaids: v.optional(
    v.object({
      perDiemDays: v.optional(v.string()),
      taxReserve: v.optional(v.string()),
      insuranceReserve: v.optional(v.string()),
      hoa: v.optional(v.string()),
    }),
  ),
  wireFee: v.optional(v.string()),
  creditsToBorrower: v.optional(v.string()),
  notes: v.optional(v.string()),
});

const scenarioState = v.object({
  loanPurpose: v.optional(v.string()),
  /** Legacy / UI alias (some stored intakes use `loanType` alongside `fundingType`). */
  loanType: v.optional(v.string()),
  /** Scenario product category (FHA, Conv, …); mirrors coversheet `cover.fundingType`. */
  fundingType: v.optional(v.string()),
  propertyType: v.optional(v.string()),
  propertyOwnership: v.optional(v.string()),
  propertyAddress: v.optional(v.string()),
  propertyValue: v.optional(v.string()),
  currentLoan1: v.optional(v.string()),
  currentLoan2: v.optional(v.string()),
  proposedLoanAmount: v.optional(v.string()),
  loanTermYears: v.optional(v.string()),
  cashOutAmount: v.optional(v.string()),
  age: v.optional(v.string()),
  creditScore: v.optional(v.string()),
  bkForeclosureLate: v.optional(v.string()),
  income1: v.optional(v.string()),
  income2: v.optional(v.string()),
  propertyTaxesMonthly: v.optional(v.string()),
  homeownersInsuranceMonthly: v.optional(v.string()),
  hoaMonthly: v.optional(v.string()),
  oldPI: v.optional(v.string()),
  oldPITIA: v.optional(v.string()),
  newPI: v.optional(v.string()),
  newPITIA: v.optional(v.string()),
  debts: v.optional(v.array(scenarioDebt)),
  propertyCounts: v.optional(
    v.object({
      primary: v.optional(v.string()),
      commercial: v.optional(v.string()),
      rental: v.optional(v.string()),
    }),
  ),
  notes: v.optional(v.string()),
});

/** Intake sheet + share link table defs merged into the main `schema.ts`. */
export const intakeSheetsTable = defineTable({
    // Identity
    clientName: v.string(),
    projectName: v.string(),
    ownerName: v.optional(v.string()), // optional display label for creator

    // File / pipeline
    fileName: v.optional(v.string()),
    leadId: v.optional(v.string()),
    sourceType: v.optional(v.string()),
    /**
     * Canonical **funding type** for the file (pipeline table column). User-set
     * on the deal document — not inferred from `dealType` or product tabs.
     */
    fundingType: v.optional(v.string()),
    accountExecutive: v.optional(v.string()),
    startDate: v.optional(v.string()),
    fundedDate: v.optional(v.string()),

    // Property
    occupancy: v.optional(v.string()), // Primary / Investment / 2nd Home / Other
    occupancyOther: v.optional(v.string()),
    propertiesOwned: v.optional(v.string()),
    subjectProperty: v.optional(propertyRecord),
    primaryProperty: v.optional(propertyRecord),

    // Borrowers (typically 1 or 2 but allow more)
    borrowers: v.array(borrower),

    // Loans (1st, 2nd, other)
    loans: v.array(loan),

    // Borrower flags / hardship
    citizenship: v.optional(v.string()), // US Citizen / Foreign National / Permanent Resident
    defaultJudgments: v.optional(v.string()),
    bkHistory: v.optional(v.string()),
    bkDate: v.optional(v.string()),
    latePaymentsLast12: v.optional(v.string()),

    // Income
    incomeRows: v.array(incomeRow),

    // Assets & Liabilities
    assets: v.array(assetRow),
    liabilities: v.array(liabilityRow),
    /** Optional structured PFS (SBA-style); additive for older sheets. */
    pfs: v.optional(v.any()),
    /** First-class per-borrower PFS documents; additive for older sheets. */
    pfsInstances: v.optional(v.any()),
    /** Simple P&L (CSV template); additive for older sheets. */
    simplePl: v.optional(v.any()),
    /** First-class per-timeframe Simple P&L documents; additive. */
    simplePlInstances: v.optional(v.any()),

    // Household
    dependentsCount: v.optional(v.string()),
    dependentsAges: v.optional(v.string()),

    // Workflow checklist (intro email, EDU, scenario, needs list, OL & PD, Velocify, etc.)
    workflow: v.array(workflowItem),
    /** Active org internal-workflow template applied to this file (optional). */
    workflowTemplateId: v.optional(v.string()),

    // Notes
    primaryObjective: v.optional(v.string()),
    additionalNotes: v.optional(v.string()),

    // Added sections
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

    // Business / Commercial / Hard Money
    dealType: v.optional(v.string()),
    business: v.optional(businessState),
    commercial: v.optional(commercialState),
    hardMoney: v.optional(hardMoneyState),
    guarantors: v.optional(v.array(guarantor)),
    fees: v.optional(feesState),

    /** File workspace: section order / visibility (v1 object). */
    dealWorkspaceLayout: v.optional(v.any()),
    /** Analysis tab: calculator tool order / visibility (v1 object). */
    dealAnalysisLayout: v.optional(v.any()),
    /** Tab 3 Deal Workspace: Sub-Tab A section order / visibility (v1 object). */
    dealWorkspaceTab3Layout: v.optional(v.any()),
    /** Tab 2 Deal Info: section order / visibility (v1 object). */
    dealInfoTabLayout: v.optional(v.any()),
    /** Deal Info command center: unified block order / visibility (v1 object). */
    dealInfoCommandCenterLayout: v.optional(v.any()),
    /** Tab 1 File Overview: section expand/collapse (v1 object). */
    overviewTabLayout: v.optional(v.any()),
    /** Tab 5 Client Portal: section order / visibility (v1 object). */
    clientPortalTabLayout: v.optional(v.any()),
    /** Portals & Progress: unified block order / visibility (v1 object). */
    portalsProgressTabLayout: v.optional(v.any()),

    // Bookkeeping
    updatedAt: v.optional(v.number()),
  })
  .index("by_owner_updated", ["ownerName"])
  .index("by_client", ["clientName"]);

/**
 * Validators shared with `intakePatchable` / `pipeline.patchDeal` so deal
 * workspace patches use the same shapes as `intakeSheets` (no parallel `v.any`
 * definitions).
 */
export {
  assetRow,
  borrower,
  businessState,
  commercialState,
  comparisonState,
  coverState,
  dayCounterDocumentState,
  dayCounterPair,
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
  scenarioDebt,
  scenarioState,
  businessDebtBlockMeta,
  weightedInterestInstanceData,
  weightedInterestRow,
  workflowItem,
};

/** Stage 2 — declarative intake form templates (file-bound or referral). */
export const intakeFormsTable = defineTable({
  organizationId: v.id("organizations"),
  /** Set for file-bound intake; omitted for org-level referral templates. */
  fileId: v.optional(v.id("pipeline")),
  /** `file_intake` hydrates an existing file; `referral` creates a new lead file. */
  formType: v.union(v.literal("file_intake"), v.literal("referral")),
  name: v.string(),
  /** Registry keys from `lib/intake/dealPartyFieldRegistry.ts`. */
  fieldKeys: v.array(v.string()),
  borrowerPartyType: v.union(
    v.literal("individual"),
    v.literal("entity"),
    v.literal("either"),
  ),
  /** Referral templates — partner attribution on created files. */
  referralPartnerContactId: v.optional(v.id("contacts")),
  /**
   * Origin of a generated PFS intake form (one per borrower PFS instance).
   * Additive — older forms omit these fields.
   */
  sourceKind: v.optional(v.literal("pfs_instance")),
  sourceInstanceId: v.optional(v.string()),
  createdByUserKey: v.string(),
  createdAt: v.number(),
  updatedAt: v.number(),
})
  .index("by_org", ["organizationId", "updatedAt"])
  .index("by_file", ["fileId", "updatedAt"])
  .index("by_file_source", ["fileId", "sourceKind", "sourceInstanceId"]);

/** Stage 2 — tokenized public URLs for intake forms. */
export const intakeFormLinksTable = defineTable({
  formId: v.id("intakeForms"),
  token: v.string(),
  label: v.optional(v.string()),
  createdAt: v.number(),
  expiresAt: v.optional(v.number()),
  revokedAt: v.optional(v.number()),
  lastOpenedAt: v.optional(v.number()),
  lastSubmittedAt: v.optional(v.number()),
  submissionCount: v.optional(v.number()),
})
  .index("by_token", ["token"])
  .index("by_form", ["formId", "createdAt"]);

export const shareLinksTable = defineTable({
    intakeId: v.id("intakeSheets"),
    // Legacy single-section field, kept for backward compat.
    section: v.optional(v.string()),
    // New: one link can now cover multiple sections.
    sections: v.optional(v.array(v.string())),
    // "view" | "edit"
    access: v.optional(v.string()),
    // "client" | "lender" | "partner" | "other"
    audience: v.optional(v.string()),
    token: v.string(),
    label: v.optional(v.string()),
    createdAt: v.number(),
    expiresAt: v.optional(v.number()),
    revokedAt: v.optional(v.number()),
    lastOpenedAt: v.optional(v.number()),
    lastSubmittedAt: v.optional(v.number()),
    submissionCount: v.optional(v.number()),
    allowEdit: v.optional(v.boolean()),
  })
  .index("by_token", ["token"])
  .index("by_intake", ["intakeId"]);
