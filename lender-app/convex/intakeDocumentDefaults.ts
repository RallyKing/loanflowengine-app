const DEFAULT_WORKFLOW: { label: string; done: boolean }[] = [
  { label: "Intro Email", done: false },
  { label: "EDU Emails", done: false },
  { label: "Scenario Email", done: false },
  { label: "Needs List Email", done: false },
  { label: "OL & PD", done: false },
  { label: "Velocify", done: false },
  { label: "Property Profile", done: false },
  { label: "Intake Attached", done: false },
  { label: "DTI Calculator", done: false },
  { label: "Declarations", done: false },
  { label: "FNMA 3.2 & PCF", done: false },
  { label: "Credit Report", done: false },
  { label: "PDF Proposal", done: false },
];

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
