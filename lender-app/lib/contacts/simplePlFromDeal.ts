/** Intake Simple P&L instance ↔ CRM `contactSimplePlStatements`. */
import {
  normalizeSimplePlStatement,
  type SimplePlPeriodKind,
  type SimplePlStatement,
} from "@/lib/simplePl/simplePlModel";
import {
  newSimplePlInstanceId,
  simplePlInstanceDisplayName,
  type SimplePlInstance,
} from "@/lib/simplePl/simplePlInstances";

export type ContactSimplePlStatementShape = {
  sortOrder: number;
  name?: string;
  periodKind?: SimplePlPeriodKind;
  companyName?: string;
  periodEnded?: string;
  salesRevenue?: string;
  otherRevenue?: string;
  salesDiscounts?: string;
  salesReturnsAllowances?: string;
  costOfRawMaterials?: string;
  costOfPartsUsed?: string;
  directLaborCosts?: string;
  overheadCosts?: string;
  automobile?: string;
  rentedEquipment?: string;
  insurance?: string;
  jobExpenses?: string;
  legalAndProfessionalFees?: string;
  maintenanceAndRepair?: string;
  meals?: string;
  officeExpenses?: string;
  rentOrLease?: string;
  utilities?: string;
  vehicleExpenses?: string;
  miscellaneousExpenses?: string;
  notes?: string;
};

function strField(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

function normKey(s: string | undefined): string {
  return (s ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

export function simplePlFingerprintFromInstance(instance: SimplePlInstance): string {
  const data = instance.data;
  return [
    instance.periodKind ?? data.periodKind ?? "",
    instance.name,
    data.header.companyName,
    data.header.periodEnded,
  ]
    .map((v) => normKey(v))
    .join("|");
}

export function simplePlFingerprintFromProfileShape(
  row: ContactSimplePlStatementShape,
): string {
  return [
    row.periodKind ?? "",
    row.name,
    row.companyName,
    row.periodEnded,
  ]
    .map((v) => normKey(v))
    .join("|");
}

export function simplePlFingerprintFromStored(row: {
  periodKind?: string;
  name?: string;
  companyName?: string;
  periodEnded?: string;
}): string {
  return [row.periodKind ?? "", row.name, row.companyName, row.periodEnded]
    .map((v) => normKey(v))
    .join("|");
}

export function simplePlInstanceToProfileShape(
  instance: SimplePlInstance,
  sortOrder: number,
): ContactSimplePlStatementShape {
  const data = normalizeSimplePlStatement(instance.data);
  return {
    sortOrder,
    ...(strField(instance.name) !== undefined
      ? { name: strField(instance.name) }
      : {}),
    ...(instance.periodKind || data.periodKind
      ? { periodKind: instance.periodKind ?? data.periodKind }
      : {}),
    ...(strField(data.header.companyName) !== undefined
      ? { companyName: strField(data.header.companyName) }
      : {}),
    ...(strField(data.header.periodEnded) !== undefined
      ? { periodEnded: strField(data.header.periodEnded) }
      : {}),
    ...(strField(data.revenue.salesRevenue) !== undefined
      ? { salesRevenue: strField(data.revenue.salesRevenue) }
      : {}),
    ...(strField(data.revenue.otherRevenue) !== undefined
      ? { otherRevenue: strField(data.revenue.otherRevenue) }
      : {}),
    ...(strField(data.revenue.salesDiscounts) !== undefined
      ? { salesDiscounts: strField(data.revenue.salesDiscounts) }
      : {}),
    ...(strField(data.revenue.salesReturnsAllowances) !== undefined
      ? { salesReturnsAllowances: strField(data.revenue.salesReturnsAllowances) }
      : {}),
    ...(strField(data.cogs.costOfRawMaterials) !== undefined
      ? { costOfRawMaterials: strField(data.cogs.costOfRawMaterials) }
      : {}),
    ...(strField(data.cogs.costOfPartsUsed) !== undefined
      ? { costOfPartsUsed: strField(data.cogs.costOfPartsUsed) }
      : {}),
    ...(strField(data.cogs.directLaborCosts) !== undefined
      ? { directLaborCosts: strField(data.cogs.directLaborCosts) }
      : {}),
    ...(strField(data.cogs.overheadCosts) !== undefined
      ? { overheadCosts: strField(data.cogs.overheadCosts) }
      : {}),
    ...(strField(data.expenses.automobile) !== undefined
      ? { automobile: strField(data.expenses.automobile) }
      : {}),
    ...(strField(data.expenses.rentedEquipment) !== undefined
      ? { rentedEquipment: strField(data.expenses.rentedEquipment) }
      : {}),
    ...(strField(data.expenses.insurance) !== undefined
      ? { insurance: strField(data.expenses.insurance) }
      : {}),
    ...(strField(data.expenses.jobExpenses) !== undefined
      ? { jobExpenses: strField(data.expenses.jobExpenses) }
      : {}),
    ...(strField(data.expenses.legalAndProfessionalFees) !== undefined
      ? { legalAndProfessionalFees: strField(data.expenses.legalAndProfessionalFees) }
      : {}),
    ...(strField(data.expenses.maintenanceAndRepair) !== undefined
      ? { maintenanceAndRepair: strField(data.expenses.maintenanceAndRepair) }
      : {}),
    ...(strField(data.expenses.meals) !== undefined
      ? { meals: strField(data.expenses.meals) }
      : {}),
    ...(strField(data.expenses.officeExpenses) !== undefined
      ? { officeExpenses: strField(data.expenses.officeExpenses) }
      : {}),
    ...(strField(data.expenses.rentOrLease) !== undefined
      ? { rentOrLease: strField(data.expenses.rentOrLease) }
      : {}),
    ...(strField(data.expenses.utilities) !== undefined
      ? { utilities: strField(data.expenses.utilities) }
      : {}),
    ...(strField(data.otherExpenses.vehicleExpenses) !== undefined
      ? { vehicleExpenses: strField(data.otherExpenses.vehicleExpenses) }
      : {}),
    ...(strField(data.otherExpenses.miscellaneousExpenses) !== undefined
      ? { miscellaneousExpenses: strField(data.otherExpenses.miscellaneousExpenses) }
      : {}),
    ...(strField(data.notes) !== undefined ? { notes: strField(data.notes) } : {}),
  };
}

export function simplePlProfileShapeToStatement(
  row: ContactSimplePlStatementShape,
): SimplePlStatement {
  return normalizeSimplePlStatement({
    v: 1,
    periodKind: row.periodKind,
    header: {
      companyName: row.companyName,
      periodEnded: row.periodEnded,
    },
    revenue: {
      salesRevenue: row.salesRevenue,
      otherRevenue: row.otherRevenue,
      salesDiscounts: row.salesDiscounts,
      salesReturnsAllowances: row.salesReturnsAllowances,
    },
    cogs: {
      costOfRawMaterials: row.costOfRawMaterials,
      costOfPartsUsed: row.costOfPartsUsed,
      directLaborCosts: row.directLaborCosts,
      overheadCosts: row.overheadCosts,
    },
    expenses: {
      automobile: row.automobile,
      rentedEquipment: row.rentedEquipment,
      insurance: row.insurance,
      jobExpenses: row.jobExpenses,
      legalAndProfessionalFees: row.legalAndProfessionalFees,
      maintenanceAndRepair: row.maintenanceAndRepair,
      meals: row.meals,
      officeExpenses: row.officeExpenses,
      rentOrLease: row.rentOrLease,
      utilities: row.utilities,
    },
    otherExpenses: {
      vehicleExpenses: row.vehicleExpenses,
      miscellaneousExpenses: row.miscellaneousExpenses,
    },
    notes: row.notes,
  });
}

export function simplePlProfileShapeToInstance(
  row: ContactSimplePlStatementShape,
  assignedContactIds: readonly string[],
): SimplePlInstance {
  const data = simplePlProfileShapeToStatement(row);
  return {
    id: newSimplePlInstanceId(),
    name:
      strField(row.name) ||
      simplePlInstanceDisplayName({
        id: "tmp",
        name: "",
        periodKind: row.periodKind,
        data,
      }),
    periodKind: row.periodKind ?? data.periodKind,
    ...(assignedContactIds.length > 0
      ? { assignedContactIds: [...assignedContactIds] }
      : {}),
    data,
  };
}
