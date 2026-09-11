function legacyWorkflowId(label: string, index: number): string {
  const slug = label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return slug ? `iwf_legacy_${slug}` : `iwf_legacy_${index}`;
}

const DEFAULT_WORKFLOW_LABELS = [
  "Intro Email",
  "EDU Emails",
  "Scenario Email",
  "Needs List Email",
  "OL & PD",
  "Velocify",
  "Property Profile",
  "Intake Attached",
  "DTI Calculator",
  "Declarations",
  "FNMA 3.2 & PCF",
  "Credit Report",
  "PDF Proposal",
] as const;

const DEFAULT_WORKFLOW: { id: string; label: string; done: boolean }[] =
  DEFAULT_WORKFLOW_LABELS.map((label, index) => ({
    id: legacyWorkflowId(label, index),
    label,
    done: false,
  }));

/**
 * New intake-shaped document (matches `intakeSheets` insert body) for
 * `intakeSheets.create` and `pipeline` rows with embedded `dealData`.
 */
export function buildInitialIntakeDocument(args: {
  clientName: string;
  projectName: string;
  ownerName?: string;
  fileName?: string;
}): Record<string, unknown> {
  const trimmedClient = args.clientName.trim();
  const trimmedProject = args.projectName.trim();
  const fileName =
    args.fileName?.trim() || `${trimmedClient} – ${trimmedProject}`;
  return {
    clientName: trimmedClient,
    projectName: trimmedProject,
    ownerName: args.ownerName?.trim() || undefined,
    fileName,
    borrowers: [],
    loans: [{ position: "1st" }, { position: "2nd" }],
    incomeRows: [
      { borrower: "Borrower 1", source: "W2" },
      { borrower: "Borrower 2", source: "W2" },
    ],
    assets: [
      { description: "Home Estimated Value" },
      { description: "Other Real Estate" },
      { description: "Automobile" },
      { description: "Checking Account" },
      { description: "Savings / Money Market" },
      { description: "IRA Account" },
      { description: "401K / ESOP" },
      { description: "Stocks / Bonds / CDs" },
    ],
    liabilities: [
      { description: "Credit Card 1" },
      { description: "Credit Card 2" },
      { description: "Credit Card 3" },
      { description: "Personal Bank Loans" },
      { description: "Student Loans" },
      { description: "Alimony / Child Support" },
      { description: "Water / Trash / Sewer" },
      { description: "Gas / Electric" },
      { description: "Cable / Internet" },
    ],
    workflow: DEFAULT_WORKFLOW,
    workflowTemplateId: "builtin:default-broker",
    subjectProperty: {},
    primaryProperty: {},

    scenario: {
      debts: [{ label: "Debt 1" }, { label: "Debt 2" }, { label: "Debt 3" }],
      propertyCounts: {},
    },
    dti: {
      incomes: [
        { label: "Income 1" },
        { label: "Income 2" },
        { label: "Income 3" },
      ],
      debts: {},
    },
    reo: [
      { usage: "Primary", position: "1st" },
      { usage: "Rental", position: "1st" },
    ],
    comparison: { current: {}, proposed: {} },
    weightedInterest: [
      { account: "Debt 1" },
      { account: "Debt 2" },
      { account: "Debt 3" },
    ],
    payoff: { periodYears: "30" },
    dayCounter: {
      noteDate: { label: "From note date (VA 210-day wait)" },
      firstPaymentDate: { label: "From first payment date" },
      additional: { label: "Additional" },
    },
    cover: {
      lenders: [
        { name: "Lender 1" },
        { name: "Lender 2" },
        { name: "Lender 3" },
      ],
    },

    business: {
      owners: [{ title: "Managing Member" }, { title: "Member" }],
    },
    commercial: {},
    hardMoney: {
      rehabLines: [
        { category: "Kitchen" },
        { category: "Bathrooms" },
        { category: "Flooring" },
        { category: "Roof" },
        { category: "HVAC" },
        { category: "Contingency" },
      ],
    },
    guarantors: [],
    fees: {
      broker: {},
      lender: {},
      thirdParty: {},
      prepaids: {},
    },

    updatedAt: Date.now(),
  };
}
