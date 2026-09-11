/**
 * Maps Construction Budget workbook → BlockPdfExportSpec (same fillable PDF
 * pipeline as Personal Financial Statement / Schedule of REO).
 */
import {
  CONSTRUCTION_BUDGET_SECTIONS,
  CONSTRUCTION_BUDGET_TEMPLATE_REV,
  computeConstructionBudget,
  formatConstructionBudgetMoney,
  type ConstructionBudgetWorkbookInput,
} from "@/lib/constructionBudget/constructionBudgetModel";
import type { BlockPdfExportSpec, BlockPdfField } from "../types";

function textField(
  id: string,
  label: string,
  value: string | undefined,
  opts?: { fullWidth?: boolean; readonly?: boolean; multiline?: boolean },
): BlockPdfField {
  return {
    id,
    label,
    value: value ?? "",
    kind: opts?.readonly
      ? "readonly"
      : opts?.multiline
        ? "multiline"
        : "text",
    fullWidth: opts?.fullWidth,
  };
}

export function buildConstructionBudgetBlockPdfSpec(
  workbook: ConstructionBudgetWorkbookInput,
  opts?: { fileName?: string },
): BlockPdfExportSpec {
  const computed = computeConstructionBudget(workbook);
  const h = workbook.header;
  const sections = CONSTRUCTION_BUDGET_SECTIONS.map((section) => {
    const rows = section.lines.map((line) => {
      const v = workbook.lines[line.key] ?? {};
      return {
        code: line.excelCode,
        item: line.label,
        repair: section.kind === "qty_measure" ? (v.repairReplace ?? "") : "",
        qty: section.kind === "qty_measure" ? (v.quantity ?? "") : "",
        uom: section.kind === "qty_measure" ? (v.unitOfMeasure ?? "") : "",
        amount: v.budgetAmount ?? "",
      };
    });
    return {
      id: section.id,
      title: `${section.excelCode} ${section.title}`,
      description:
        section.kind === "qty_measure"
          ? "Repair/Replace, Quantity, Unit of Measure, and Budget Amount."
          : "Budget Amount.",
      columns:
        section.kind === "qty_measure"
          ? [
              { id: "code", label: "#", weight: 0.45 },
              { id: "item", label: "Item", weight: 2.2 },
              { id: "repair", label: "Repair/Replace", weight: 0.9 },
              { id: "qty", label: "Quantity", weight: 0.7 },
              { id: "uom", label: "Unit of Measure", weight: 1 },
              { id: "amount", label: "Budget Amount", weight: 0.95, kind: "money" as const },
            ]
          : [
              { id: "code", label: "#", weight: 0.45 },
              { id: "item", label: "Item", weight: 3.4 },
              { id: "amount", label: "Budget Amount", weight: 1, kind: "money" as const },
            ],
      rows,
      minRows: rows.length,
    };
  });

  const customRows = (workbook.customLines ?? []).map((line, i) => ({
    num: String(i + 1),
    category: line.category,
    description: line.description ?? "",
    budget: line.budgetAmount ?? "",
    spent: line.spentAmount ?? "",
    draw: line.drawNumber ?? "",
    status: line.status ?? "",
  }));

  return {
    blockId: "constructionBudget",
    title: "Construction Budget",
    subtitle: `Budget Rev ${CONSTRUCTION_BUDGET_TEMPLATE_REV} — Construction Lender Services 2025 Page 1 of 1`,
    fileName: opts?.fileName ?? "Construction_Budget.pdf",
    footerNote:
      "I certify that this construction budget is true and complete to the best of my knowledge. Project Sub-Total = Plans + Sitework + Building + Mechanical + Interior. Total Project Costs = Project Sub-Total + Contractor Fees.",
    sections: [
      {
        id: "header",
        title: "Project",
        fields: [
          textField("header.applicantName", "Applicant Name", h.applicantName, {
            fullWidth: true,
          }),
          textField(
            "header.propertyAddress",
            "Property Address",
            h.propertyAddress,
            { fullWidth: true },
          ),
          textField("header.contractor", "Contractor", h.contractor, {
            fullWidth: true,
          }),
          textField("header.projectType", "Project Type", h.projectType),
          textField(
            "header.completionTimeframeMonths",
            "Completion Timeframe (in months from closing date)",
            h.completionTimeframeMonths,
          ),
          textField(
            "header.plannedSummary",
            "Summary of Planned Rehab or Construction",
            h.plannedSummary,
            { fullWidth: true, multiline: true },
          ),
          textField(
            "header.qualityOfFinishes",
            "Description of Quality of Finishes",
            h.qualityOfFinishes,
            { fullWidth: true, multiline: true },
          ),
        ],
      },
      ...sections,
      ...(customRows.length > 0
        ? [
            {
              id: "imported",
              title: "Imported / custom lines",
              description:
                "Pre-template budget rows that did not match a catalog item. Amounts are included in custom totals only.",
              columns: [
                { id: "num", label: "#", weight: 0.4 },
                { id: "category", label: "Category", weight: 1.4 },
                { id: "description", label: "Description", weight: 1.6 },
                { id: "budget", label: "Budget", weight: 0.9, kind: "money" as const },
                { id: "spent", label: "Spent", weight: 0.9, kind: "money" as const },
                { id: "draw", label: "Draw #", weight: 0.7 },
                { id: "status", label: "Status", weight: 0.8 },
              ],
              rows: customRows,
            },
          ]
        : []),
      {
        id: "totals",
        title: "Totals",
        fields: [
          textField(
            "subtotal.plans",
            "PLANS - PERMITS - CLOSING Subtotal",
            formatConstructionBudgetMoney(computed.plansSubtotal),
            { readonly: true },
          ),
          textField(
            "subtotal.sitework",
            "SITEWORK Subtotal",
            formatConstructionBudgetMoney(computed.siteworkSubtotal),
            { readonly: true },
          ),
          textField(
            "subtotal.building",
            "BUILDING Subtotal",
            formatConstructionBudgetMoney(computed.buildingSubtotal),
            { readonly: true },
          ),
          textField(
            "subtotal.mechanical",
            "MECHANICAL Subtotal",
            formatConstructionBudgetMoney(computed.mechanicalSubtotal),
            { readonly: true },
          ),
          textField(
            "subtotal.interior",
            "INTERIOR Subtotal",
            formatConstructionBudgetMoney(computed.interiorSubtotal),
            { readonly: true },
          ),
          textField(
            "subtotal.contractorFees",
            "CONTRACTOR FEES Subtotal",
            formatConstructionBudgetMoney(computed.contractorFeesSubtotal),
            { readonly: true },
          ),
          textField(
            "totals.projectSubtotal",
            "PROJECT SUB-TOTAL",
            formatConstructionBudgetMoney(computed.projectSubtotal),
            { readonly: true },
          ),
          textField(
            "totals.totalProjectCosts",
            "TOTAL PROJECT COSTS",
            formatConstructionBudgetMoney(computed.totalProjectCosts),
            { readonly: true, fullWidth: true },
          ),
          ...(computed.customBudgetTotal > 0 || computed.customSpentTotal > 0
            ? [
                textField(
                  "totals.customBudget",
                  "Imported / custom budget",
                  formatConstructionBudgetMoney(computed.customBudgetTotal),
                  { readonly: true },
                ),
                textField(
                  "totals.customSpent",
                  "Imported / custom spent",
                  formatConstructionBudgetMoney(computed.customSpentTotal),
                  { readonly: true },
                ),
              ]
            : []),
        ],
      },
    ],
  };
}
