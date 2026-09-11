/**
 * Maps Schedule of Business Debt → BlockPdfExportSpec (same fillable PDF
 * pipeline as Personal Financial Statement / Schedule of REO).
 */
import {
  computeBusinessDebtScheduleTotals,
  formatBusinessDebtTypeLabel,
  formatBusinessDebtUsd,
  type BusinessDebtBlockMeta,
  type DealBusinessDebtRow,
} from "@/lib/businessDebt/scheduleOfBusinessDebtModel";
import type { BlockPdfExportSpec, BlockPdfField } from "../types";

function textField(
  id: string,
  label: string,
  value: string | undefined,
  opts?: { fullWidth?: boolean; readonly?: boolean },
): BlockPdfField {
  return {
    id,
    label,
    value: value ?? "",
    kind: opts?.readonly ? "readonly" : "text",
    fullWidth: opts?.fullWidth,
  };
}

export function buildBusinessDebtBlockPdfSpec(
  rows: readonly DealBusinessDebtRow[],
  opts?: {
    fileName?: string;
    assignedContactNames?: string[];
    blockMeta?: BusinessDebtBlockMeta | null;
    rowAssigneeNames?: Array<string[]>;
  },
): BlockPdfExportSpec {
  const totals = computeBusinessDebtScheduleTotals(rows);
  const assigneeLine =
    (opts?.assignedContactNames ?? []).filter((n) => n.trim()).join(", ") ||
    "";
  const scheduleRows = rows.map((row, i) => {
    const names = (opts?.rowAssigneeNames?.[i] ?? []).filter((n) => n.trim());
    return {
      num: String(i + 1),
      active: row.include === false ? "No" : "Yes",
      creditor: row.account,
      debtType: formatBusinessDebtTypeLabel(row),
      original: row.originalAmount,
      originated: row.originationDate,
      balance: row.balance,
      rate: row.ratePct,
      maturity: row.maturityDate,
      payment: row.monthlyPayment,
      note: row.note,
      assignees: names.join(", "),
    };
  });

  return {
    blockId: "business_debt",
    title: "Schedule of Business Debt",
    subtitle:
      "Corporate liabilities and MCAs for stacking analysis. Complete creditor, type, original amount, dates, present balance, rate/factor, maturity, and monthly payment.",
    fileName: opts?.fileName ?? "Schedule_of_Business_Debt.pdf",
    footerNote:
      "I certify that this schedule is true and complete to the best of my knowledge. Totals include only active (included) debts: original amount, present balance, and monthly payment.",
    sections: [
      {
        id: "header",
        title: "Schedule header",
        fields: [
          textField("bd.assignees", "Assigned contacts", assigneeLine, {
            fullWidth: true,
          }),
          textField(
            "bd.debtCount",
            "Debts on schedule",
            String(rows.length),
            { readonly: true },
          ),
        ],
      },
      {
        id: "schedule",
        title: "Business debts",
        description:
          "Row-by-row corporate liability / MCA schedule. Include all required fields for stacking.",
        minRows: Math.max(8, rows.length),
        columns: [
          { id: "num", label: "#", weight: 0.4 },
          { id: "active", label: "Active", weight: 0.5 },
          { id: "creditor", label: "Creditor", weight: 1.4 },
          { id: "debtType", label: "Debt type", weight: 1.1 },
          { id: "original", label: "Original amount", weight: 0.95, kind: "money" },
          { id: "originated", label: "Origination date", weight: 0.9 },
          { id: "balance", label: "Present balance", weight: 0.95, kind: "money" },
          { id: "rate", label: "Rate / factor", weight: 0.8 },
          { id: "maturity", label: "Maturity date", weight: 0.9 },
          { id: "payment", label: "Monthly payment", weight: 0.95, kind: "money" },
          { id: "note", label: "Position / note", weight: 1 },
          { id: "assignees", label: "Assigned to", weight: 1.1 },
        ],
        rows: scheduleRows,
      },
      {
        id: "totals",
        title: "Totals (active debts)",
        fields: [
          textField(
            "totals.originalAmount",
            "Original debt amount",
            formatBusinessDebtUsd(totals.originalAmount),
            { readonly: true },
          ),
          textField(
            "totals.presentBalance",
            "Present balance",
            formatBusinessDebtUsd(totals.presentBalance),
            { readonly: true },
          ),
          textField(
            "totals.monthlyPayment",
            "Monthly payment",
            formatBusinessDebtUsd(totals.monthlyPayment),
            { readonly: true, fullWidth: true },
          ),
        ],
      },
    ],
  };
}
