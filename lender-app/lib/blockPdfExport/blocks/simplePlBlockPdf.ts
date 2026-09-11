/**
 * Maps Simple P&L data → BlockPdfExportSpec (same fillable PDF pipeline as
 * Personal Financial Statement / Construction Budget).
 */
import {
  SIMPLE_PL_COGS_LINES,
  SIMPLE_PL_EXPENSE_LINES,
  SIMPLE_PL_OTHER_EXPENSE_LINES,
  SIMPLE_PL_PERIOD_KIND_LABELS,
  SIMPLE_PL_REVENUE_LINES,
  computeSimplePl,
  formatSimplePlMoney,
  type SimplePlPeriodKind,
  type SimplePlStatement,
} from "@/lib/simplePl/simplePlModel";
import type { BlockPdfExportSpec, BlockPdfField } from "../types";

function moneyField(
  id: string,
  label: string,
  value: string | undefined,
  opts?: { readonly?: boolean; fullWidth?: boolean },
): BlockPdfField {
  return {
    id,
    label,
    value: value ?? "",
    kind: opts?.readonly ? "readonly" : "money",
    fullWidth: opts?.fullWidth,
  };
}

function textField(
  id: string,
  label: string,
  value: string | undefined,
  opts?: { fullWidth?: boolean; multiline?: boolean },
): BlockPdfField {
  return {
    id,
    label,
    value: value ?? "",
    kind: opts?.multiline ? "multiline" : "text",
    fullWidth: opts?.fullWidth,
  };
}

function groupFields(
  prefix: string,
  lines: readonly { key: string; label: string }[],
  values: Record<string, string | undefined>,
): BlockPdfField[] {
  return lines.map((line) =>
    moneyField(`${prefix}.${line.key}`, line.label, values[line.key]),
  );
}

export function buildSimplePlBlockPdfSpec(
  statement: SimplePlStatement,
  opts?: {
    fileName?: string;
    instanceName?: string;
    periodKind?: SimplePlPeriodKind;
    assignedContactNames?: readonly string[];
  },
): BlockPdfExportSpec {
  const computed = computeSimplePl(statement);
  const periodKind = opts?.periodKind ?? statement.periodKind;
  const periodLabel = periodKind
    ? SIMPLE_PL_PERIOD_KIND_LABELS[periodKind]
    : undefined;
  const assignees = (opts?.assignedContactNames ?? []).filter((n) => n.trim());

  return {
    blockId: "simplePl",
    title: "Profit and Loss Statement",
    subtitle: [
      opts?.instanceName?.trim(),
      periodLabel,
      statement.header.periodEnded
        ? `For the period ended ${statement.header.periodEnded}`
        : "For the Year Ended MM/DD/YYYY",
    ]
      .filter(Boolean)
      .join(" · "),
    fileName: opts?.fileName ?? "Simple_Profit_and_Loss.pdf",
    footerNote:
      "Totals follow the Simple P&L template: TOTAL REVENUE, TOTAL CoGS, GROSS PROFIT/LOSS = revenue − CoGS, TOTAL EXPENSES, NET OPERATING PROFIT/LOSS = gross − expenses, TOTAL OTHER EXPENSES, NET PROFIT/LOSS = operating − other expenses. Sales discounts and returns are signed amounts.",
    sections: [
      {
        id: "header",
        title: "Company",
        fields: [
          textField(
            "header.companyName",
            "YOUR COMPANY NAME",
            statement.header.companyName,
            { fullWidth: true },
          ),
          textField(
            "header.periodEnded",
            "For the Year Ended MM/DD/YYYY",
            statement.header.periodEnded,
          ),
          textField("header.periodKind", "Timeframe", periodLabel),
          textField(
            "pl.assignees",
            "Assigned contacts",
            assignees.join(", "),
            { fullWidth: true },
          ),
        ],
      },
      {
        id: "revenue",
        title: "REVENUE",
        fields: [
          ...groupFields("revenue", SIMPLE_PL_REVENUE_LINES, statement.revenue),
          moneyField(
            "totals.totalRevenue",
            "TOTAL REVENUE",
            formatSimplePlMoney(computed.totalRevenue),
            { readonly: true, fullWidth: true },
          ),
        ],
      },
      {
        id: "cogs",
        title: "COST OF GOODS SOLD",
        fields: [
          ...groupFields("cogs", SIMPLE_PL_COGS_LINES, statement.cogs),
          moneyField(
            "totals.totalCogs",
            "TOTAL CoGS",
            formatSimplePlMoney(computed.totalCogs),
            { readonly: true, fullWidth: true },
          ),
          moneyField(
            "totals.grossProfitLoss",
            "GROSS PROFIT/LOSS",
            formatSimplePlMoney(computed.grossProfitLoss),
            { readonly: true, fullWidth: true },
          ),
        ],
      },
      {
        id: "expenses",
        title: "EXPENSES",
        fields: [
          ...groupFields("expenses", SIMPLE_PL_EXPENSE_LINES, statement.expenses),
          moneyField(
            "totals.totalExpenses",
            "TOTAL EXPENSES",
            formatSimplePlMoney(computed.totalExpenses),
            { readonly: true, fullWidth: true },
          ),
          moneyField(
            "totals.netOperatingProfitLoss",
            "NET OPERATING PROFIT/LOSS",
            formatSimplePlMoney(computed.netOperatingProfitLoss),
            { readonly: true, fullWidth: true },
          ),
        ],
      },
      {
        id: "otherExpenses",
        title: "OTHER EXPENSES",
        fields: [
          ...groupFields(
            "otherExpenses",
            SIMPLE_PL_OTHER_EXPENSE_LINES,
            statement.otherExpenses,
          ),
          moneyField(
            "totals.totalOtherExpenses",
            "TOTAL OTHER EXPENSES",
            formatSimplePlMoney(computed.totalOtherExpenses),
            { readonly: true, fullWidth: true },
          ),
        ],
      },
      {
        id: "net",
        title: "NET PROFIT/LOSS",
        fields: [
          moneyField(
            "totals.netProfitLoss",
            "NET PROFIT/LOSS",
            formatSimplePlMoney(computed.netProfitLoss),
            { readonly: true, fullWidth: true },
          ),
          textField("notes.general", "Notes", statement.notes, {
            fullWidth: true,
            multiline: true,
          }),
        ],
      },
    ],
  };
}
