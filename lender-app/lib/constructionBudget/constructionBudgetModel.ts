/**
 * Construction Budget model — mirrors
 * `Construction Budget Template (1).xlsx` sheet **Budget** (Rev 06.01.2025).
 *
 * Formula map (spreadsheet → computed):
 * - plansSubtotal        = Σ H25:H29
 * - siteworkSubtotal     = Σ H33:H64
 * - buildingSubtotal     = Σ H68:H87
 * - mechanicalSubtotal   = Σ O25:O36
 * - interiorSubtotal     = Σ O40:O65
 * - contractorFeesSubtotal = Σ O70:O71
 * - projectSubtotal      = H30+H65+H88+O37+O65
 * - totalProjectCosts    = O67+O72
 *
 * Dropdowns (data validation):
 * - Project Type: Rehab, New Construction
 * - Repair/Replace: Repair, Replace
 * - Unit of Measure: square feet, linear feet, cubic yards, squares, tons, pounds, each, gallons
 * - Completion Timeframe: decimal 1.0–12.0 (months from closing)
 */

export const CONSTRUCTION_BUDGET_TEMPLATE_REV = "06.01.2025" as const;

export const CONSTRUCTION_BUDGET_PROJECT_TYPES = [
  "Rehab",
  "New Construction",
] as const;

export type ConstructionBudgetProjectType =
  (typeof CONSTRUCTION_BUDGET_PROJECT_TYPES)[number];

export const CONSTRUCTION_BUDGET_REPAIR_REPLACE = [
  "Repair",
  "Replace",
] as const;

export type ConstructionBudgetRepairReplace =
  (typeof CONSTRUCTION_BUDGET_REPAIR_REPLACE)[number];

export const CONSTRUCTION_BUDGET_UNITS = [
  "square feet",
  "linear feet",
  "cubic yards",
  "squares",
  "tons",
  "pounds",
  "each",
  "gallons",
] as const;

export type ConstructionBudgetUnit =
  (typeof CONSTRUCTION_BUDGET_UNITS)[number];

export type ConstructionBudgetSectionId =
  | "plans"
  | "sitework"
  | "building"
  | "mechanical"
  | "interior"
  | "contractorFees";

export type ConstructionBudgetLineKind = "amount_only" | "qty_measure";

export type ConstructionBudgetCatalogLine = {
  key: string;
  excelCode: string;
  label: string;
  kind: ConstructionBudgetLineKind;
};

export type ConstructionBudgetCatalogSection = {
  id: ConstructionBudgetSectionId;
  excelCode: string;
  title: string;
  kind: ConstructionBudgetLineKind;
  lines: readonly ConstructionBudgetCatalogLine[];
};

export type ConstructionBudgetHeader = {
  applicantName?: string;
  propertyAddress?: string;
  contractor?: string;
  projectType?: ConstructionBudgetProjectType | "";
  plannedSummary?: string;
  qualityOfFinishes?: string;
  completionTimeframeMonths?: string;
};

export type ConstructionBudgetLineValues = {
  repairReplace?: ConstructionBudgetRepairReplace | "";
  quantity?: string;
  unitOfMeasure?: ConstructionBudgetUnit | "";
  budgetAmount?: string;
};

export type ConstructionBudgetLegacyStatus =
  | "planned"
  | "in_progress"
  | "complete"
  | "on_hold";

/** Unmatched / pre-template rows preserved after migration. */
export type ConstructionBudgetCustomLine = {
  id: string;
  category: string;
  description?: string;
  budgetAmount?: string;
  spentAmount?: string;
  drawNumber?: string;
  status?: ConstructionBudgetLegacyStatus;
};

export type ConstructionBudgetWorkbookInput = {
  header: ConstructionBudgetHeader;
  /** Values keyed by catalog `key`. */
  lines: Record<string, ConstructionBudgetLineValues>;
  customLines?: readonly ConstructionBudgetCustomLine[];
};

export type ConstructionBudgetComputed = {
  plansSubtotal: number;
  siteworkSubtotal: number;
  buildingSubtotal: number;
  mechanicalSubtotal: number;
  interiorSubtotal: number;
  contractorFeesSubtotal: number;
  projectSubtotal: number;
  totalProjectCosts: number;
  customBudgetTotal: number;
  customSpentTotal: number;
  filledLineCount: number;
};

const PLANS_LINES: readonly ConstructionBudgetCatalogLine[] = [
  {
    key: "plans.architect",
    excelCode: "1.01",
    label:
      "Consultant Fees: Architect (10% max if funded) (Invoices Required)",
    kind: "amount_only",
  },
  {
    key: "plans.engineer",
    excelCode: "1.02",
    label:
      "Consultant Fees: Engineer (10% max if funded) (Invoices Required)",
    kind: "amount_only",
  },
  {
    key: "plans.surveyor",
    excelCode: "1.03",
    label:
      "Consultant Fees: Surveyor (10% max if funded) (Invoices Required)",
    kind: "amount_only",
  },
  {
    key: "plans.testing",
    excelCode: "1.04",
    label: "Consultant Fees: Testing (10% max if funded) (Invoices Required)",
    kind: "amount_only",
  },
  {
    key: "plans.permits",
    excelCode: "1.05",
    label: "Permits (Invoices Required)",
    kind: "amount_only",
  },
];

const SITEWORK_LINES: readonly ConstructionBudgetCatalogLine[] = [
  {
    key: "sitework.erosionControl",
    excelCode: "2.01",
    label: "Mobilization: Erosion Control",
    kind: "qty_measure",
  },
  {
    key: "sitework.temporaryUtilities",
    excelCode: "2.02",
    label: "Temporary Utilities",
    kind: "qty_measure",
  },
  {
    key: "sitework.siteClearing",
    excelCode: "2.03",
    label: "Site Prep: Site Clearing",
    kind: "qty_measure",
  },
  {
    key: "sitework.demolition",
    excelCode: "2.04",
    label: "Site Prep: Demolition",
    kind: "qty_measure",
  },
  {
    key: "sitework.gradingExcavation",
    excelCode: "2.05",
    label: "Site Prep: Grading/Excavation",
    kind: "qty_measure",
  },
  {
    key: "sitework.dumpsters",
    excelCode: "2.06",
    label: "Site Prep: Dumpsters",
    kind: "qty_measure",
  },
  {
    key: "sitework.securityFencing",
    excelCode: "2.07",
    label: "Site Prep: Security Fencing",
    kind: "qty_measure",
  },
  {
    key: "sitework.sitePrepOther",
    excelCode: "2.08",
    label: "Site Prep: Other",
    kind: "qty_measure",
  },
  {
    key: "sitework.foundationWalls",
    excelCode: "2.09",
    label: "Foundation/Structural: Concrete, Walls",
    kind: "qty_measure",
  },
  {
    key: "sitework.foundationRepairs",
    excelCode: "2.10",
    label: "Foundation Repairs / Waterproofing",
    kind: "qty_measure",
  },
  {
    key: "sitework.concreteGarage",
    excelCode: "2.11",
    label: "Concrete (garage)",
    kind: "qty_measure",
  },
  {
    key: "sitework.concreteSlabs",
    excelCode: "2.12",
    label: "Concrete Slabs/Foundation",
    kind: "qty_measure",
  },
  {
    key: "sitework.concreteDriveway",
    excelCode: "2.13",
    label: "Concrete (driveway)",
    kind: "qty_measure",
  },
  {
    key: "sitework.concreteWalks",
    excelCode: "2.14",
    label: "Concrete (walks)",
    kind: "qty_measure",
  },
  {
    key: "sitework.patios",
    excelCode: "2.15",
    label: "Patios",
    kind: "qty_measure",
  },
  {
    key: "sitework.decks",
    excelCode: "2.16",
    label: "Decks",
    kind: "qty_measure",
  },
  {
    key: "sitework.waterSewer",
    excelCode: "2.17",
    label:
      "Water/Sewer (includes well, septic and city): Connections, Rough-in, System",
    kind: "qty_measure",
  },
  {
    key: "sitework.miscFlatwork",
    excelCode: "2.18",
    label: "Misc. Flatwork",
    kind: "qty_measure",
  },
  {
    key: "sitework.poolSpaDig",
    excelCode: "2.19",
    label: "Pool/Spa Dig Hole",
    kind: "qty_measure",
  },
  {
    key: "sitework.poolSpa",
    excelCode: "2.20",
    label: "Pool/Spa",
    kind: "qty_measure",
  },
  {
    key: "sitework.poolSpaDecking",
    excelCode: "2.21",
    label: "Pool/Spa Decking/Finish",
    kind: "qty_measure",
  },
  {
    key: "sitework.irrigation",
    excelCode: "2.22",
    label: "Irrigation/Sprinklers",
    kind: "qty_measure",
  },
  {
    key: "sitework.landscaping",
    excelCode: "2.23",
    label: "Landscaping",
    kind: "qty_measure",
  },
  {
    key: "sitework.hardscaping",
    excelCode: "2.24",
    label: "Hardscaping",
    kind: "qty_measure",
  },
  {
    key: "sitework.fencing",
    excelCode: "2.25",
    label: "Fencing",
    kind: "qty_measure",
  },
  {
    key: "sitework.wellWaterPump",
    excelCode: "2.26",
    label: "Well/Water/Pump",
    kind: "qty_measure",
  },
  {
    key: "sitework.sewerSeptic",
    excelCode: "2.27",
    label: "Sewer/Septic",
    kind: "qty_measure",
  },
  {
    key: "sitework.undergroundUtilities",
    excelCode: "2.28",
    label: "Underground Utilities",
    kind: "qty_measure",
  },
  {
    key: "sitework.equipmentRental",
    excelCode: "2.29",
    label: "Equipment Rental",
    kind: "qty_measure",
  },
  {
    key: "sitework.tapFees",
    excelCode: "2.30",
    label: "Tap Fees",
    kind: "qty_measure",
  },
  {
    key: "sitework.otherExteriorStructures",
    excelCode: "2.31",
    label: "Other Exterior Structures",
    kind: "qty_measure",
  },
  {
    key: "sitework.other",
    excelCode: "2.32",
    label: "Other",
    kind: "qty_measure",
  },
];

const BUILDING_LINES: readonly ConstructionBudgetCatalogLine[] = [
  {
    key: "building.framing",
    excelCode: "3.01",
    label: "Framing",
    kind: "qty_measure",
  },
  {
    key: "building.structuralSteel",
    excelCode: "3.02",
    label: "Structural Steel",
    kind: "qty_measure",
  },
  {
    key: "building.subfloors",
    excelCode: "3.03",
    label: "Subfloors/Underfloors",
    kind: "qty_measure",
  },
  {
    key: "building.engineeredTrusses",
    excelCode: "3.04",
    label: "Engineered Trusses",
    kind: "qty_measure",
  },
  {
    key: "building.roofing",
    excelCode: "3.05",
    label: "Roofing",
    kind: "qty_measure",
  },
  {
    key: "building.sheathing",
    excelCode: "3.06",
    label: "Sheathing",
    kind: "qty_measure",
  },
  {
    key: "building.exteriorFinish",
    excelCode: "3.07",
    label: "Exterior Finish (Brick, Siding, Stucco, etc.)",
    kind: "qty_measure",
  },
  {
    key: "building.soffitFascia",
    excelCode: "3.08",
    label: "Soffit/Fascia",
    kind: "qty_measure",
  },
  {
    key: "building.exteriorTrim",
    excelCode: "3.09",
    label: "Exterior Trim",
    kind: "qty_measure",
  },
  {
    key: "building.gutters",
    excelCode: "3.10",
    label: "Gutters/Downspouts",
    kind: "qty_measure",
  },
  {
    key: "building.windowFrames",
    excelCode: "3.11",
    label: "Window Frames/ Glazing",
    kind: "qty_measure",
  },
  {
    key: "building.windowsSkylights",
    excelCode: "3.12",
    label: "Windows/Skylights",
    kind: "qty_measure",
  },
  {
    key: "building.doorsExterior",
    excelCode: "3.13",
    label: "Doors Exterior",
    kind: "qty_measure",
  },
  {
    key: "building.entryDoor",
    excelCode: "3.14",
    label: "Entry Door",
    kind: "qty_measure",
  },
  {
    key: "building.fireplaceInsert",
    excelCode: "3.15",
    label: "Fireplace/Firebox Insert",
    kind: "qty_measure",
  },
  {
    key: "building.exteriorPainting",
    excelCode: "3.16",
    label: "Exterior Painting",
    kind: "qty_measure",
  },
  {
    key: "building.exteriorStairs",
    excelCode: "3.17",
    label: "Exterior Stairs/Railings",
    kind: "qty_measure",
  },
  {
    key: "building.garageDoors",
    excelCode: "3.18",
    label: "Garage Doors",
    kind: "qty_measure",
  },
  {
    key: "building.rollUpDoor",
    excelCode: "3.19",
    label: "Roll-Up Door",
    kind: "qty_measure",
  },
  {
    key: "building.other",
    excelCode: "3.20",
    label: "Other",
    kind: "qty_measure",
  },
];

const MECHANICAL_LINES: readonly ConstructionBudgetCatalogLine[] = [
  {
    key: "mechanical.roughPlumbing",
    excelCode: "4.01",
    label: "Rough Plumbing",
    kind: "qty_measure",
  },
  {
    key: "mechanical.finishPlumbing",
    excelCode: "4.02",
    label: "Finish Plumbing",
    kind: "qty_measure",
  },
  {
    key: "mechanical.fixturesPlumbing",
    excelCode: "4.03",
    label: "Fixtures Plumbing",
    kind: "qty_measure",
  },
  {
    key: "mechanical.waterHeaters",
    excelCode: "4.04",
    label: "Water Heater(s)",
    kind: "qty_measure",
  },
  {
    key: "mechanical.roughElectrical",
    excelCode: "4.05",
    label: "Rough Electrical",
    kind: "qty_measure",
  },
  {
    key: "mechanical.finishElectrical",
    excelCode: "4.06",
    label: "Finish Electrical",
    kind: "qty_measure",
  },
  {
    key: "mechanical.fixturesElectrical",
    excelCode: "4.07",
    label: "Fixtures Electrical",
    kind: "qty_measure",
  },
  {
    key: "mechanical.hvacRough",
    excelCode: "4.08",
    label: "HVAC Rough",
    kind: "qty_measure",
  },
  {
    key: "mechanical.hvacFinish",
    excelCode: "4.09",
    label: "HVAC Finish (furnace, condenser)",
    kind: "qty_measure",
  },
  {
    key: "mechanical.fireProtection",
    excelCode: "4.10",
    label: "Fire Protection",
    kind: "qty_measure",
  },
  {
    key: "mechanical.securitySystem",
    excelCode: "4.11",
    label: "Security System",
    kind: "qty_measure",
  },
  {
    key: "mechanical.other",
    excelCode: "4.12",
    label: "Other",
    kind: "qty_measure",
  },
];

const INTERIOR_LINES: readonly ConstructionBudgetCatalogLine[] = [
  {
    key: "interior.insulation",
    excelCode: "5.01",
    label: "Insulation",
    kind: "qty_measure",
  },
  {
    key: "interior.drywallPlaster",
    excelCode: "5.02",
    label: "Interior walls and ceilings (Drywall/Plaster)",
    kind: "qty_measure",
  },
  {
    key: "interior.interiorPaint",
    excelCode: "5.03",
    label: "Interior Paint",
    kind: "qty_measure",
  },
  {
    key: "interior.kitchenCabinets",
    excelCode: "5.04",
    label: "Kitchen Cabinets",
    kind: "qty_measure",
  },
  {
    key: "interior.kitchenCountertops",
    excelCode: "5.05",
    label: "Kitchen Countertops",
    kind: "qty_measure",
  },
  {
    key: "interior.appliances",
    excelCode: "5.06",
    label: "Appliances",
    kind: "qty_measure",
  },
  {
    key: "interior.bathVanities",
    excelCode: "5.07",
    label: "Bath Vanities",
    kind: "qty_measure",
  },
  {
    key: "interior.hardwareMirrors",
    excelCode: "5.08",
    label: "Hardware and Mirrors",
    kind: "qty_measure",
  },
  {
    key: "interior.wallTileShower",
    excelCode: "5.09",
    label: "Wall Tile/Shower Surround",
    kind: "qty_measure",
  },
  {
    key: "interior.showerPansTub",
    excelCode: "5.10",
    label: "Shower Pans/Tub Set",
    kind: "qty_measure",
  },
  {
    key: "interior.tileFloors",
    excelCode: "5.11",
    label: "Tile Floors",
    kind: "qty_measure",
  },
  {
    key: "interior.hardwoodFloors",
    excelCode: "5.12",
    label: "Hardwood Floors",
    kind: "qty_measure",
  },
  {
    key: "interior.carpet",
    excelCode: "5.13",
    label: "Carpet",
    kind: "qty_measure",
  },
  {
    key: "interior.vinylFloors",
    excelCode: "5.14",
    label: "Vinyl Floors",
    kind: "qty_measure",
  },
  {
    key: "interior.interiorDoors",
    excelCode: "5.15",
    label: "Interior Doors",
    kind: "qty_measure",
  },
  {
    key: "interior.finishCarpentry",
    excelCode: "5.16",
    label: "Finish Carpentry",
    kind: "qty_measure",
  },
  {
    key: "interior.baseboards",
    excelCode: "5.17",
    label: "Baseboards",
    kind: "qty_measure",
  },
  {
    key: "interior.doorTrim",
    excelCode: "5.18",
    label: "Door Trim",
    kind: "qty_measure",
  },
  {
    key: "interior.interiorTrim",
    excelCode: "5.19",
    label: "Interior Trim",
    kind: "qty_measure",
  },
  {
    key: "interior.securityAv",
    excelCode: "5.20",
    label: "Security & AV",
    kind: "qty_measure",
  },
  {
    key: "interior.lowVoltageWiring",
    excelCode: "5.21",
    label: "Low Voltage Wiring",
    kind: "qty_measure",
  },
  {
    key: "interior.fireplaceMantel",
    excelCode: "5.22",
    label: "Fireplace Face/Mantel",
    kind: "qty_measure",
  },
  {
    key: "interior.windowCoverings",
    excelCode: "5.23",
    label: "Window Coverings",
    kind: "qty_measure",
  },
  {
    key: "interior.showerDoors",
    excelCode: "5.24",
    label: "Shower Doors",
    kind: "qty_measure",
  },
  {
    key: "interior.finalCleanup",
    excelCode: "5.25",
    label: "Final Clean-up",
    kind: "qty_measure",
  },
  {
    key: "interior.other",
    excelCode: "5.27",
    label: "Other",
    kind: "qty_measure",
  },
];

const CONTRACTOR_FEE_LINES: readonly ConstructionBudgetCatalogLine[] = [
  {
    key: "contractorFees.builderGcFee",
    excelCode: "6.01",
    label: "Builder / GC Fee (15% max)",
    kind: "amount_only",
  },
  {
    key: "contractorFees.contingency",
    excelCode: "6.02",
    label: "Contingency (10% req)",
    kind: "amount_only",
  },
];

export const CONSTRUCTION_BUDGET_SECTIONS: readonly ConstructionBudgetCatalogSection[] =
  [
    {
      id: "plans",
      excelCode: "1.00",
      title: "PLANS - PERMITS - CLOSING",
      kind: "amount_only",
      lines: PLANS_LINES,
    },
    {
      id: "sitework",
      excelCode: "2.00",
      title: "SITEWORK",
      kind: "qty_measure",
      lines: SITEWORK_LINES,
    },
    {
      id: "building",
      excelCode: "3.00",
      title: "BUILDING",
      kind: "qty_measure",
      lines: BUILDING_LINES,
    },
    {
      id: "mechanical",
      excelCode: "4.00",
      title: "MECHANICAL",
      kind: "qty_measure",
      lines: MECHANICAL_LINES,
    },
    {
      id: "interior",
      excelCode: "5.00",
      title: "INTERIOR",
      kind: "qty_measure",
      lines: INTERIOR_LINES,
    },
    {
      id: "contractorFees",
      excelCode: "6.00",
      title: "CONTRACTOR FEES",
      kind: "amount_only",
      lines: CONTRACTOR_FEE_LINES,
    },
  ];

export const CONSTRUCTION_BUDGET_CATALOG_BY_KEY: ReadonlyMap<
  string,
  ConstructionBudgetCatalogLine & { sectionId: ConstructionBudgetSectionId }
> = new Map(
  CONSTRUCTION_BUDGET_SECTIONS.flatMap((section) =>
    section.lines.map((line) => [
      line.key,
      { ...line, sectionId: section.id },
    ]),
  ),
);

const LABEL_TO_KEY: ReadonlyMap<string, string> = new Map(
  CONSTRUCTION_BUDGET_SECTIONS.flatMap((section) =>
    section.lines.map((line) => [normalizeBudgetLabel(line.label), line.key]),
  ),
);

export function normalizeBudgetLabel(raw: string | undefined | null): string {
  return String(raw ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function parseConstructionBudgetMoney(
  raw: string | undefined | null,
): number {
  if (raw == null) return 0;
  const t = String(raw).trim();
  if (!t || /^n\/?a$/i.test(t)) return 0;
  const n = Number.parseFloat(t.replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

export function formatConstructionBudgetMoney(n: number): string {
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function parseCompletionTimeframeMonths(
  raw: string | undefined | null,
): number | null {
  if (raw == null) return null;
  const t = String(raw).trim();
  if (!t) return null;
  const n = Number.parseFloat(t.replace(/[^0-9.-]/g, ""));
  if (!Number.isFinite(n)) return null;
  return n;
}

export function isValidCompletionTimeframeMonths(
  raw: string | undefined | null,
): boolean {
  const n = parseCompletionTimeframeMonths(raw);
  if (n == null) return true;
  return n >= 1 && n <= 12;
}

export function isConstructionBudgetProjectType(
  value: string | undefined | null,
): value is ConstructionBudgetProjectType {
  return CONSTRUCTION_BUDGET_PROJECT_TYPES.includes(
    value as ConstructionBudgetProjectType,
  );
}

export function isConstructionBudgetRepairReplace(
  value: string | undefined | null,
): value is ConstructionBudgetRepairReplace {
  return CONSTRUCTION_BUDGET_REPAIR_REPLACE.includes(
    value as ConstructionBudgetRepairReplace,
  );
}

export function isConstructionBudgetUnit(
  value: string | undefined | null,
): value is ConstructionBudgetUnit {
  return CONSTRUCTION_BUDGET_UNITS.includes(value as ConstructionBudgetUnit);
}

export function createEmptyConstructionBudgetHeader(): ConstructionBudgetHeader {
  return {};
}

export function createEmptyConstructionBudgetWorkbook(): ConstructionBudgetWorkbookInput {
  return { header: {}, lines: {}, customLines: [] };
}

function sumSection(
  sectionId: ConstructionBudgetSectionId,
  lines: Record<string, ConstructionBudgetLineValues>,
): number {
  const section = CONSTRUCTION_BUDGET_SECTIONS.find((s) => s.id === sectionId);
  if (!section) return 0;
  return section.lines.reduce(
    (sum, line) =>
      sum + parseConstructionBudgetMoney(lines[line.key]?.budgetAmount),
    0,
  );
}

export function computeConstructionBudget(
  input: ConstructionBudgetWorkbookInput,
): ConstructionBudgetComputed {
  const plansSubtotal = sumSection("plans", input.lines);
  const siteworkSubtotal = sumSection("sitework", input.lines);
  const buildingSubtotal = sumSection("building", input.lines);
  const mechanicalSubtotal = sumSection("mechanical", input.lines);
  const interiorSubtotal = sumSection("interior", input.lines);
  const contractorFeesSubtotal = sumSection("contractorFees", input.lines);
  const projectSubtotal =
    plansSubtotal +
    siteworkSubtotal +
    buildingSubtotal +
    mechanicalSubtotal +
    interiorSubtotal;
  const totalProjectCosts = projectSubtotal + contractorFeesSubtotal;
  const customLines = input.customLines ?? [];
  const customBudgetTotal = customLines.reduce(
    (sum, line) => sum + parseConstructionBudgetMoney(line.budgetAmount),
    0,
  );
  const customSpentTotal = customLines.reduce(
    (sum, line) => sum + parseConstructionBudgetMoney(line.spentAmount),
    0,
  );
  let filledLineCount = 0;
  for (const section of CONSTRUCTION_BUDGET_SECTIONS) {
    for (const line of section.lines) {
      const v = input.lines[line.key];
      if (!v) continue;
      if (
        (v.budgetAmount && v.budgetAmount.trim()) ||
        (v.quantity && v.quantity.trim()) ||
        (v.repairReplace && v.repairReplace.trim()) ||
        (v.unitOfMeasure && v.unitOfMeasure.trim())
      ) {
        filledLineCount += 1;
      }
    }
  }
  filledLineCount += customLines.length;
  return {
    plansSubtotal,
    siteworkSubtotal,
    buildingSubtotal,
    mechanicalSubtotal,
    interiorSubtotal,
    contractorFeesSubtotal,
    projectSubtotal,
    totalProjectCosts,
    customBudgetTotal,
    customSpentTotal,
    filledLineCount,
  };
}

export type ConstructionBudgetPersistedLine = {
  _id?: string;
  templateKey?: string;
  category: string;
  description?: string;
  budgetAmount?: string;
  spentAmount?: string;
  drawNumber?: string;
  repairReplace?: string;
  quantity?: string;
  unitOfMeasure?: string;
  status?: ConstructionBudgetLegacyStatus;
};

/**
 * Map persisted rows onto the Excel catalog. Matching is label-based so
 * pre-rebuild budget rows keep their amounts when the category/description
 * equals a template line. Unmatched rows stay as custom/imported lines.
 */
export function mapPersistedLinesToWorkbook(
  rows: readonly ConstructionBudgetPersistedLine[],
): {
  lines: Record<string, ConstructionBudgetLineValues>;
  customLines: ConstructionBudgetCustomLine[];
  matchedLegacyIds: string[];
} {
  const lines: Record<string, ConstructionBudgetLineValues> = {};
  const customLines: ConstructionBudgetCustomLine[] = [];
  const matchedLegacyIds: string[] = [];
  const usedKeys = new Set<string>();

  for (const row of rows) {
    const explicitKey =
      row.templateKey && CONSTRUCTION_BUDGET_CATALOG_BY_KEY.has(row.templateKey)
        ? row.templateKey
        : undefined;
    const labelKey =
      LABEL_TO_KEY.get(normalizeBudgetLabel(row.category)) ??
      LABEL_TO_KEY.get(normalizeBudgetLabel(row.description));
    const key = explicitKey ?? (labelKey && !usedKeys.has(labelKey) ? labelKey : undefined);

    if (key && !usedKeys.has(key)) {
      usedKeys.add(key);
      if (row._id && !explicitKey) matchedLegacyIds.push(row._id);
      lines[key] = {
        repairReplace: isConstructionBudgetRepairReplace(row.repairReplace)
          ? row.repairReplace
          : "",
        quantity: row.quantity ?? "",
        unitOfMeasure: isConstructionBudgetUnit(row.unitOfMeasure)
          ? row.unitOfMeasure
          : "",
        budgetAmount: row.budgetAmount ?? "",
      };
      continue;
    }

    customLines.push({
      id: row._id ?? `custom-${customLines.length}`,
      category: row.category,
      description: row.description,
      budgetAmount: row.budgetAmount,
      spentAmount: row.spentAmount,
      drawNumber: row.drawNumber,
      status: row.status,
    });
  }

  return { lines, customLines, matchedLegacyIds };
}

export function headerHasContent(header: ConstructionBudgetHeader): boolean {
  return Boolean(
    header.applicantName?.trim() ||
      header.propertyAddress?.trim() ||
      header.contractor?.trim() ||
      header.projectType?.trim() ||
      header.plannedSummary?.trim() ||
      header.qualityOfFinishes?.trim() ||
      header.completionTimeframeMonths?.trim(),
  );
}
