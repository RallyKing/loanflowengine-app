/**
 * Smoke: PFS fillable PDF builds with AcroForm fields.
 * Run: npx tsx scripts/block-pdf-export-smoke.ts
 */
import { PDFDocument } from "pdf-lib";
import {
  buildBusinessDebtBlockPdfSpec,
  buildConstructionBudgetBlockPdfSpec,
  buildPfsBlockPdfSpec,
  buildReoBlockPdfSpec,
  buildSimplePlBlockPdfSpec,
  buildTrackRecordBlockPdfSpec,
  exportBlockToFillablePdf,
} from "../lib/blockPdfExport";
import { createEmptyPersonalFinancialStatement } from "../lib/pfs/personalFinancialStatementModel";
import { createEmptySimplePlStatement } from "../lib/simplePl/simplePlModel";

async function main() {
  const pfs = createEmptyPersonalFinancialStatement();
  pfs.header.names = "Jane Client";
  pfs.assets.cashOnHandAndBanks = "25000";
  const spec = buildPfsBlockPdfSpec(pfs);
  const result = await exportBlockToFillablePdf(spec);
  const doc = await PDFDocument.load(result.bytes);
  const form = doc.getForm();
  const fields = form.getFields();
  if (result.pageCount < 2) {
    throw new Error(`Expected multi-page PDF, got ${result.pageCount}`);
  }
  if (fields.length < 40) {
    throw new Error(`Expected many fillable fields, got ${fields.length}`);
  }
  const namesField = form.getTextField("header.names");
  if (namesField.getText() !== "Jane Client") {
    throw new Error("Prefill failed for header.names");
  }
  console.log(
    `OK PFS: ${result.fileName} pages=${result.pageCount} fields=${fields.length}`,
  );

  const reoSpec = buildReoBlockPdfSpec(
    [
      {
        address: "100 Main St",
        state: "PA",
        usage: "Rental",
        marketValue: "250000",
        zillowUrl: "https://www.zillow.com/homedetails/100-Main/1_zpid/",
        balance: "180000",
        taxes: "200",
        insurance: "80",
        hoa: "20",
        mortgagePayment: "1100",
        grossRent: "2200",
      },
    ],
    {
      assignedContactNames: ["Jane Client"],
      rowAssigneeNames: [["Jane Client"]],
    },
  );
  const reoResult = await exportBlockToFillablePdf(reoSpec);
  const reoDoc = await PDFDocument.load(reoResult.bytes);
  const reoForm = reoDoc.getForm();
  const reoFields = reoForm.getFields();
  if (reoFields.length < 20) {
    throw new Error(`Expected REO fillable fields, got ${reoFields.length}`);
  }
  const assigneeField = reoForm.getTextField("reo.assignees");
  if (assigneeField.getText() !== "Jane Client") {
    throw new Error("Prefill failed for reo.assignees");
  }
  const zillowField = reoForm.getTextField("schedule.r0.zillowUrl");
  if (
    zillowField.getText() !==
    "https://www.zillow.com/homedetails/100-Main/1_zpid/"
  ) {
    throw new Error("Prefill failed for schedule.r0.zillowUrl");
  }
  console.log(
    `OK REO: ${reoResult.fileName} pages=${reoResult.pageCount} fields=${reoFields.length}`,
  );

  const debtSpec = buildBusinessDebtBlockPdfSpec(
    [
      {
        account: "Fast Capital",
        debtType: "MCA",
        originalAmount: "150000",
        originationDate: "2025-01-15",
        balance: "90000",
        ratePct: "1.35",
        maturityDate: "2026-01-15",
        monthlyPayment: "8500",
        include: true,
      },
    ],
    { assignedContactNames: ["Acme Holdings"] },
  );
  const debtResult = await exportBlockToFillablePdf(debtSpec);
  const debtDoc = await PDFDocument.load(debtResult.bytes);
  const debtForm = debtDoc.getForm();
  const debtFields = debtForm.getFields();
  if (debtFields.length < 8) {
    throw new Error(
      `Expected fillable business debt fields, got ${debtFields.length}`,
    );
  }
  const originalTotal = debtForm.getTextField("totals.originalAmount");
  if (!originalTotal.getText()?.includes("150,000")) {
    throw new Error(
      `Prefill failed for totals.originalAmount: ${originalTotal.getText()}`,
    );
  }
  console.log(
    `OK BD: ${debtResult.fileName} pages=${debtResult.pageCount} fields=${debtFields.length}`,
  );

  const trSpec = buildTrackRecordBlockPdfSpec(
    [
      {
        address: "55 Flip Ln",
        city: "Austin",
        state: "TX",
        zip: "78701",
        propertyType: "SFR",
        ownedByGuarantor1: "Yes",
        projectType: "Rehab",
        acquisitionPrice: "220000",
        rehabOrConstructionAmount: "40000",
        exitType: "Sold",
        salePriceOrRentAmount: "310000",
      },
    ],
    { assignedContactNames: ["Pat Sponsor"] },
  );
  const trResult = await exportBlockToFillablePdf(trSpec);
  const trDoc = await PDFDocument.load(trResult.bytes);
  const trForm = trDoc.getForm();
  const trFields = trForm.getFields();
  if (trFields.length < 20) {
    throw new Error(`Expected Track Record fillable fields, got ${trFields.length}`);
  }
  const trAssignees = trForm.getTextField("tr.assignees");
  if (trAssignees.getText() !== "Pat Sponsor") {
    throw new Error("Prefill failed for tr.assignees");
  }
  const qualifying = trForm.getTextField("exp.qualifying.rehab");
  if (qualifying.getText() !== "1") {
    throw new Error(`Prefill failed for qualifying rehab: ${qualifying.getText()}`);
  }
  console.log(
    `OK TR: ${trResult.fileName} pages=${trResult.pageCount} fields=${trFields.length}`,
  );

  const budgetSpec = buildConstructionBudgetBlockPdfSpec(
    {
      header: {
        applicantName: "Acme Holdings",
        propertyAddress: "12 Rehab Ave",
        contractor: "BuildCo",
        projectType: "Rehab",
        plannedSummary: "Kitchen and bath rehab",
        qualityOfFinishes: "Mid-grade",
        completionTimeframeMonths: "6",
      },
      lines: {
        "plans.permits": { budgetAmount: "2500" },
        "building.framing": {
          repairReplace: "Replace",
          quantity: "1200",
          unitOfMeasure: "square feet",
          budgetAmount: "18000",
        },
        "contractorFees.contingency": { budgetAmount: "2050" },
      },
    },
    { fileName: "Construction-Budget-Acme.pdf" },
  );
  const budgetResult = await exportBlockToFillablePdf(budgetSpec);
  const budgetDoc = await PDFDocument.load(budgetResult.bytes);
  const budgetForm = budgetDoc.getForm();
  const budgetFields = budgetForm.getFields();
  if (budgetFields.length < 40) {
    throw new Error(
      `Expected fillable construction budget fields, got ${budgetFields.length}`,
    );
  }
  const applicant = budgetForm.getTextField("header.applicantName");
  if (applicant.getText() !== "Acme Holdings") {
    throw new Error("Prefill failed for header.applicantName");
  }
  const totalCosts = budgetForm.getTextField("totals.totalProjectCosts");
  if (!totalCosts.getText()?.includes("22,550")) {
    throw new Error(
      `Prefill failed for totals.totalProjectCosts: ${totalCosts.getText()}`,
    );
  }
  console.log(
    `OK CB: ${budgetResult.fileName} pages=${budgetResult.pageCount} fields=${budgetFields.length}`,
  );

  const pl = createEmptySimplePlStatement();
  pl.header.companyName = "Acme Holdings LLC";
  pl.header.periodEnded = "12/31/2025";
  pl.revenue.salesRevenue = "100000.00";
  pl.revenue.otherRevenue = "4737.00";
  pl.revenue.salesDiscounts = "-3160.00";
  pl.revenue.salesReturnsAllowances = "-3288.00";
  pl.cogs.costOfRawMaterials = "6064.00";
  pl.cogs.costOfPartsUsed = "7549.00";
  pl.cogs.directLaborCosts = "4964.00";
  pl.cogs.overheadCosts = "3428.00";
  pl.expenses.automobile = "4640.00";
  pl.expenses.rentedEquipment = "2082.00";
  pl.expenses.insurance = "3893.00";
  pl.expenses.jobExpenses = "3104.00";
  pl.expenses.legalAndProfessionalFees = "1018.00";
  pl.expenses.maintenanceAndRepair = "2580.00";
  pl.expenses.meals = "1943.00";
  pl.expenses.officeExpenses = "1761.00";
  pl.expenses.rentOrLease = "3744.00";
  pl.expenses.utilities = "1402.00";
  pl.otherExpenses.vehicleExpenses = "3563.00";
  pl.otherExpenses.miscellaneousExpenses = "1294.00";
  const plSpec = buildSimplePlBlockPdfSpec(pl, {
    fileName: "Simple-PL-Acme.pdf",
    instanceName: "YTD",
    periodKind: "year_to_date",
    assignedContactNames: ["Jane Client"],
  });
  const plResult = await exportBlockToFillablePdf(plSpec);
  const plDoc = await PDFDocument.load(plResult.bytes);
  const plForm = plDoc.getForm();
  const plFields = plForm.getFields();
  if (plFields.length < 20) {
    throw new Error(`Expected Simple P&L fillable fields, got ${plFields.length}`);
  }
  const company = plForm.getTextField("header.companyName");
  if (company.getText() !== "Acme Holdings LLC") {
    throw new Error("Prefill failed for header.companyName");
  }
  const totalRevenue = plForm.getTextField("totals.totalRevenue");
  if (!totalRevenue.getText()?.includes("98,289")) {
    throw new Error(
      `Prefill failed for totals.totalRevenue: ${totalRevenue.getText()}`,
    );
  }
  const netProfit = plForm.getTextField("totals.netProfitLoss");
  if (!netProfit.getText()?.includes("45,260")) {
    throw new Error(
      `Prefill failed for totals.netProfitLoss: ${netProfit.getText()}`,
    );
  }
  console.log(
    `OK PL: ${plResult.fileName} pages=${plResult.pageCount} fields=${plFields.length}`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
