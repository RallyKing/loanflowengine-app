/**
 * Simple P&L model — mirrors `Simple P&L Template(Simple P&L).csv`.
 *
 * Formula map (template → computed):
 * - totalRevenue            = Sales Revenue + Other Revenue + Sales Discounts
 *                             + Sales Returns, allowances and others
 * - totalCogs               = Cost of raw materials + Cost of parts used
 *                             + Direct labor costs + Overhead costs
 * - grossProfitLoss         = TOTAL REVENUE − TOTAL CoGS
 * - totalExpenses           = Automobile + Rented Equipment + Insurance
 *                             + Job expenses + Legal and Professional Fees
 *                             + Maintenance and Repair + Meals + Office Expenses
 *                             + Rent or Lease + Utilities
 * - netOperatingProfitLoss  = GROSS PROFIT/LOSS − TOTAL EXPENSES
 * - totalOtherExpenses      = Vehicle Expenses + Miscellaneous Expenses
 * - netProfitLoss           = NET OPERATING PROFIT/LOSS − TOTAL OTHER EXPENSES
 *
 * Discounts / returns are typed as signed amounts (template sample uses negatives).
 */

export const SIMPLE_PL_VERSION = 1 as const;

export const SIMPLE_PL_PERIOD_KINDS = [
  "year_to_date",
  "prior_year",
  "custom",
] as const;

export type SimplePlPeriodKind = (typeof SIMPLE_PL_PERIOD_KINDS)[number];

export const SIMPLE_PL_PERIOD_KIND_LABELS: Record<SimplePlPeriodKind, string> = {
  year_to_date: "Year-to-date",
  prior_year: "Past year",
  custom: "Named period",
};

export type SimplePlMoney = string;

export type SimplePlHeader = {
  companyName?: string;
  periodEnded?: string;
};

export type SimplePlRevenueInputs = {
  salesRevenue?: SimplePlMoney;
  otherRevenue?: SimplePlMoney;
  salesDiscounts?: SimplePlMoney;
  salesReturnsAllowances?: SimplePlMoney;
};

export type SimplePlCogsInputs = {
  costOfRawMaterials?: SimplePlMoney;
  costOfPartsUsed?: SimplePlMoney;
  directLaborCosts?: SimplePlMoney;
  overheadCosts?: SimplePlMoney;
};

export type SimplePlExpenseInputs = {
  automobile?: SimplePlMoney;
  rentedEquipment?: SimplePlMoney;
  insurance?: SimplePlMoney;
  jobExpenses?: SimplePlMoney;
  legalAndProfessionalFees?: SimplePlMoney;
  maintenanceAndRepair?: SimplePlMoney;
  meals?: SimplePlMoney;
  officeExpenses?: SimplePlMoney;
  rentOrLease?: SimplePlMoney;
  utilities?: SimplePlMoney;
};

export type SimplePlOtherExpenseInputs = {
  vehicleExpenses?: SimplePlMoney;
  miscellaneousExpenses?: SimplePlMoney;
};

export type SimplePlStatement = {
  v: typeof SIMPLE_PL_VERSION;
  periodKind?: SimplePlPeriodKind;
  header: SimplePlHeader;
  revenue: SimplePlRevenueInputs;
  cogs: SimplePlCogsInputs;
  expenses: SimplePlExpenseInputs;
  otherExpenses: SimplePlOtherExpenseInputs;
  notes?: string;
  clientPortalNotes?: string;
};

export type SimplePlLineKey =
  | keyof SimplePlRevenueInputs
  | keyof SimplePlCogsInputs
  | keyof SimplePlExpenseInputs
  | keyof SimplePlOtherExpenseInputs;

export type SimplePlCatalogLine = {
  key: SimplePlLineKey;
  section: "revenue" | "cogs" | "expenses" | "otherExpenses";
  label: string;
};

export const SIMPLE_PL_REVENUE_LINES: readonly SimplePlCatalogLine[] = [
  { key: "salesRevenue", section: "revenue", label: "Sales Revenue" },
  { key: "otherRevenue", section: "revenue", label: "Other Revenue" },
  { key: "salesDiscounts", section: "revenue", label: "Sales Discounts" },
  {
    key: "salesReturnsAllowances",
    section: "revenue",
    label: "Sales Returns, allowances and others",
  },
];

export const SIMPLE_PL_COGS_LINES: readonly SimplePlCatalogLine[] = [
  { key: "costOfRawMaterials", section: "cogs", label: "Cost of raw materials" },
  { key: "costOfPartsUsed", section: "cogs", label: "Cost of parts used" },
  { key: "directLaborCosts", section: "cogs", label: "Direct labor costs" },
  { key: "overheadCosts", section: "cogs", label: "Overhead costs" },
];

export const SIMPLE_PL_EXPENSE_LINES: readonly SimplePlCatalogLine[] = [
  { key: "automobile", section: "expenses", label: "Automobile" },
  { key: "rentedEquipment", section: "expenses", label: "Rented Equipment" },
  { key: "insurance", section: "expenses", label: "Insurance" },
  { key: "jobExpenses", section: "expenses", label: "Job expenses" },
  {
    key: "legalAndProfessionalFees",
    section: "expenses",
    label: "Legal and Professional Fees",
  },
  {
    key: "maintenanceAndRepair",
    section: "expenses",
    label: "Maintenance and Repair",
  },
  { key: "meals", section: "expenses", label: "Meals" },
  { key: "officeExpenses", section: "expenses", label: "Office Expenses" },
  { key: "rentOrLease", section: "expenses", label: "Rent or Lease" },
  { key: "utilities", section: "expenses", label: "Utilities" },
];

export const SIMPLE_PL_OTHER_EXPENSE_LINES: readonly SimplePlCatalogLine[] = [
  {
    key: "vehicleExpenses",
    section: "otherExpenses",
    label: "Vehicle Expenses",
  },
  {
    key: "miscellaneousExpenses",
    section: "otherExpenses",
    label: "Miscellaneous Expenses",
  },
];

export type SimplePlComputed = {
  totalRevenue: number;
  totalCogs: number;
  grossProfitLoss: number;
  totalExpenses: number;
  netOperatingProfitLoss: number;
  totalOtherExpenses: number;
  netProfitLoss: number;
  filledLineCount: number;
};

export function parseSimplePlMoney(raw: string | undefined | null): number {
  if (raw == null) return 0;
  const t = String(raw).trim();
  if (!t || /^n\/?a$/i.test(t)) return 0;
  const n = Number.parseFloat(t.replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

export function formatSimplePlMoney(n: number): string {
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function moneyField(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  const t = raw.trim();
  return t ? t : undefined;
}

function textField(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  const t = raw.trim();
  return t ? t : undefined;
}

function asRecord(v: unknown): Record<string, unknown> | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  return v as Record<string, unknown>;
}

export function isSimplePlPeriodKind(
  raw: unknown,
): raw is SimplePlPeriodKind {
  return (
    typeof raw === "string" &&
    (SIMPLE_PL_PERIOD_KINDS as readonly string[]).includes(raw)
  );
}

export function createEmptySimplePlStatement(input?: {
  periodKind?: SimplePlPeriodKind;
  companyName?: string;
  periodEnded?: string;
}): SimplePlStatement {
  return {
    v: SIMPLE_PL_VERSION,
    periodKind: input?.periodKind ?? "year_to_date",
    header: {
      ...(input?.companyName?.trim()
        ? { companyName: input.companyName.trim() }
        : {}),
      ...(input?.periodEnded?.trim()
        ? { periodEnded: input.periodEnded.trim() }
        : {}),
    },
    revenue: {},
    cogs: {},
    expenses: {},
    otherExpenses: {},
  };
}

function normalizeMoneyGroup<T extends Record<string, SimplePlMoney | undefined>>(
  raw: unknown,
  keys: readonly (keyof T)[],
): T {
  const rec = asRecord(raw) ?? {};
  const out = {} as T;
  for (const key of keys) {
    const value = moneyField(rec[String(key)]);
    if (value !== undefined) out[key] = value as T[keyof T];
  }
  return out;
}

export function normalizeSimplePlStatement(raw: unknown): SimplePlStatement {
  const rec = asRecord(raw);
  const headerRec = asRecord(rec?.header) ?? rec ?? {};
  const periodKind = isSimplePlPeriodKind(rec?.periodKind)
    ? rec.periodKind
    : "year_to_date";
  return {
    v: SIMPLE_PL_VERSION,
    periodKind,
    header: {
      ...(textField(headerRec.companyName)
        ? { companyName: textField(headerRec.companyName) }
        : {}),
      ...(textField(headerRec.periodEnded)
        ? { periodEnded: textField(headerRec.periodEnded) }
        : textField(headerRec.yearEnded)
          ? { periodEnded: textField(headerRec.yearEnded) }
          : {}),
    },
    revenue: normalizeMoneyGroup<SimplePlRevenueInputs>(rec?.revenue ?? rec, [
      "salesRevenue",
      "otherRevenue",
      "salesDiscounts",
      "salesReturnsAllowances",
    ]),
    cogs: normalizeMoneyGroup<SimplePlCogsInputs>(rec?.cogs ?? rec, [
      "costOfRawMaterials",
      "costOfPartsUsed",
      "directLaborCosts",
      "overheadCosts",
    ]),
    expenses: normalizeMoneyGroup<SimplePlExpenseInputs>(
      rec?.expenses ?? rec,
      [
        "automobile",
        "rentedEquipment",
        "insurance",
        "jobExpenses",
        "legalAndProfessionalFees",
        "maintenanceAndRepair",
        "meals",
        "officeExpenses",
        "rentOrLease",
        "utilities",
      ],
    ),
    otherExpenses: normalizeMoneyGroup<SimplePlOtherExpenseInputs>(
      rec?.otherExpenses ?? rec,
      ["vehicleExpenses", "miscellaneousExpenses"],
    ),
    ...(textField(rec?.notes) ? { notes: textField(rec?.notes) } : {}),
    ...(textField(rec?.clientPortalNotes)
      ? { clientPortalNotes: textField(rec?.clientPortalNotes) }
      : {}),
  };
}

function sumGroup(
  group: Record<string, SimplePlMoney | undefined>,
  keys: readonly string[],
): number {
  return keys.reduce((acc, key) => acc + parseSimplePlMoney(group[key]), 0);
}

export function computeSimplePl(statement: SimplePlStatement): SimplePlComputed {
  const revenueKeys = SIMPLE_PL_REVENUE_LINES.map((l) => l.key);
  const cogsKeys = SIMPLE_PL_COGS_LINES.map((l) => l.key);
  const expenseKeys = SIMPLE_PL_EXPENSE_LINES.map((l) => l.key);
  const otherKeys = SIMPLE_PL_OTHER_EXPENSE_LINES.map((l) => l.key);

  const totalRevenue = sumGroup(statement.revenue, revenueKeys);
  const totalCogs = sumGroup(statement.cogs, cogsKeys);
  const grossProfitLoss = totalRevenue - totalCogs;
  const totalExpenses = sumGroup(statement.expenses, expenseKeys);
  const netOperatingProfitLoss = grossProfitLoss - totalExpenses;
  const totalOtherExpenses = sumGroup(statement.otherExpenses, otherKeys);
  const netProfitLoss = netOperatingProfitLoss - totalOtherExpenses;

  const filledLineCount = [
    ...revenueKeys.map((k) => statement.revenue[k as keyof SimplePlRevenueInputs]),
    ...cogsKeys.map((k) => statement.cogs[k as keyof SimplePlCogsInputs]),
    ...expenseKeys.map((k) => statement.expenses[k as keyof SimplePlExpenseInputs]),
    ...otherKeys.map(
      (k) => statement.otherExpenses[k as keyof SimplePlOtherExpenseInputs],
    ),
  ].filter((v) => String(v ?? "").trim()).length;

  return {
    totalRevenue,
    totalCogs,
    grossProfitLoss,
    totalExpenses,
    netOperatingProfitLoss,
    totalOtherExpenses,
    netProfitLoss,
    filledLineCount,
  };
}

export function simplePlHasContent(statement: SimplePlStatement): boolean {
  const computed = computeSimplePl(statement);
  return (
    computed.filledLineCount > 0 ||
    Boolean(statement.header.companyName?.trim()) ||
    Boolean(statement.header.periodEnded?.trim()) ||
    Boolean(statement.notes?.trim())
  );
}
