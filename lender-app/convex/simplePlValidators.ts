import { v } from "convex/values";

/** Structured Simple P&L matching `Simple P&L Template(Simple P&L).csv`. */
export const simplePlStatementV = v.object({
  v: v.literal(1),
  periodKind: v.optional(
    v.union(
      v.literal("year_to_date"),
      v.literal("prior_year"),
      v.literal("custom"),
    ),
  ),
  header: v.optional(
    v.object({
      companyName: v.optional(v.string()),
      periodEnded: v.optional(v.string()),
    }),
  ),
  revenue: v.optional(
    v.object({
      salesRevenue: v.optional(v.string()),
      otherRevenue: v.optional(v.string()),
      salesDiscounts: v.optional(v.string()),
      salesReturnsAllowances: v.optional(v.string()),
    }),
  ),
  cogs: v.optional(
    v.object({
      costOfRawMaterials: v.optional(v.string()),
      costOfPartsUsed: v.optional(v.string()),
      directLaborCosts: v.optional(v.string()),
      overheadCosts: v.optional(v.string()),
    }),
  ),
  expenses: v.optional(
    v.object({
      automobile: v.optional(v.string()),
      rentedEquipment: v.optional(v.string()),
      insurance: v.optional(v.string()),
      jobExpenses: v.optional(v.string()),
      legalAndProfessionalFees: v.optional(v.string()),
      maintenanceAndRepair: v.optional(v.string()),
      meals: v.optional(v.string()),
      officeExpenses: v.optional(v.string()),
      rentOrLease: v.optional(v.string()),
      utilities: v.optional(v.string()),
    }),
  ),
  otherExpenses: v.optional(
    v.object({
      vehicleExpenses: v.optional(v.string()),
      miscellaneousExpenses: v.optional(v.string()),
    }),
  ),
  notes: v.optional(v.string()),
  clientPortalNotes: v.optional(v.string()),
});

/**
 * First-class Simple P&L timeframe on a pipeline file (YTD, past year, named).
 * Legacy `dealData.simplePl` remains the mirror of the first instance.
 */
export const simplePlInstanceV = v.object({
  id: v.string(),
  name: v.string(),
  periodKind: v.optional(
    v.union(
      v.literal("year_to_date"),
      v.literal("prior_year"),
      v.literal("custom"),
    ),
  ),
  assignedContactIds: v.optional(v.array(v.string())),
  /** Document Vault `block_assignment` task for this instance. */
  vaultFileTaskId: v.optional(v.string()),
  data: simplePlStatementV,
});

export const contactSimplePlStatementFieldsV = {
  name: v.optional(v.string()),
  periodKind: v.optional(
    v.union(
      v.literal("year_to_date"),
      v.literal("prior_year"),
      v.literal("custom"),
    ),
  ),
  companyName: v.optional(v.string()),
  periodEnded: v.optional(v.string()),
  salesRevenue: v.optional(v.string()),
  otherRevenue: v.optional(v.string()),
  salesDiscounts: v.optional(v.string()),
  salesReturnsAllowances: v.optional(v.string()),
  costOfRawMaterials: v.optional(v.string()),
  costOfPartsUsed: v.optional(v.string()),
  directLaborCosts: v.optional(v.string()),
  overheadCosts: v.optional(v.string()),
  automobile: v.optional(v.string()),
  rentedEquipment: v.optional(v.string()),
  insurance: v.optional(v.string()),
  jobExpenses: v.optional(v.string()),
  legalAndProfessionalFees: v.optional(v.string()),
  maintenanceAndRepair: v.optional(v.string()),
  meals: v.optional(v.string()),
  officeExpenses: v.optional(v.string()),
  rentOrLease: v.optional(v.string()),
  utilities: v.optional(v.string()),
  vehicleExpenses: v.optional(v.string()),
  miscellaneousExpenses: v.optional(v.string()),
  notes: v.optional(v.string()),
};
