/**
 * Maps Schedule of Real Estate Owned → BlockPdfExportSpec (same fillable PDF
 * pipeline as Personal Financial Statement).
 */
import {
  computeReoRow,
  computeReoScheduleTotals,
  formatReoLtv,
  formatReoUsd,
  type DealReoRow,
  type ReoBlockMeta,
} from "@/lib/reo/scheduleOfReoModel";
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

export function buildReoBlockPdfSpec(
  rows: readonly DealReoRow[],
  opts?: {
    fileName?: string;
    assignedContactNames?: string[];
    blockMeta?: ReoBlockMeta | null;
    rowAssigneeNames?: Array<string[]>;
  },
): BlockPdfExportSpec {
  const totals = computeReoScheduleTotals(rows);
  const assigneeLine =
    (opts?.assignedContactNames ?? []).filter((n) => n.trim()).join(", ") ||
    "";
  const scheduleRows = rows.map((row, i) => {
    const c = computeReoRow(row);
    const names = (opts?.rowAssigneeNames?.[i] ?? []).filter((n) => n.trim());
    return {
      num: String(i + 1),
      purchased: row.purchasedDate,
      state: row.state,
      use: row.usage,
      address: row.address,
      type: row.propertyType,
      market: row.marketValue,
      zillowUrl: row.zillowUrl,
      pos: row.position,
      balance: row.balance,
      pmt: row.mortgagePayment,
      rate: row.rate,
      taxes: row.taxes,
      ins: row.insurance,
      hoa: row.hoa,
      escrow: formatReoUsd(c.escrow),
      gross: row.grossRent,
      net: formatReoUsd(c.netRent),
      equity: formatReoUsd(c.equity),
      ltv: formatReoLtv(c.ltv),
      apn: row.apn,
      invested: row.invested,
      latLong: row.latLong,
      lotSf: row.lotSf,
      propSf: row.propSf,
      recent: row.mostRecent,
      assignees: names.join(", "),
    };
  });

  return {
    blockId: "reo",
    title: "Schedule of Real Estate Owned",
    subtitle:
      "Complete every property the borrower owns. Escrow = taxes + insurance + HOA. Net rent = gross rent − (taxes + insurance + HOA + mortgage payment).",
    fileName: opts?.fileName ?? "Schedule_of_Real_Estate_Owned.pdf",
    footerNote:
      "I certify that this schedule is true and complete to the best of my knowledge. Totals and derived escrow / net rent / equity / LTV follow the DLC Schedule of REO workbook.",
    sections: [
      {
        id: "header",
        title: "Schedule header",
        fields: [
          textField("reo.assignees", "Assigned contacts", assigneeLine, {
            fullWidth: true,
          }),
          textField(
            "reo.propertyCount",
            "Properties on schedule",
            String(rows.length),
            { readonly: true },
          ),
        ],
      },
      {
        id: "schedule",
        title: "Real estate owned",
        description:
          "Row-by-row schedule. Present market values, balances, payments, taxes, insurance, HOA, rents, and invested capital.",
        minRows: Math.max(8, rows.length),
        columns: [
          { id: "num", label: "#", weight: 0.4 },
          { id: "purchased", label: "Purchased", weight: 0.85 },
          { id: "state", label: "ST", weight: 0.4 },
          { id: "use", label: "Use", weight: 0.7 },
          { id: "address", label: "Address", weight: 1.6 },
          { id: "type", label: "Type", weight: 0.55 },
          { id: "market", label: "Market value", weight: 0.9, kind: "money" },
          { id: "zillowUrl", label: "Zillow / listing URL", weight: 1.4 },
          { id: "pos", label: "Pos", weight: 0.45 },
          { id: "balance", label: "Balance", weight: 0.85, kind: "money" },
          { id: "pmt", label: "Mort pmt", weight: 0.8, kind: "money" },
          { id: "rate", label: "Rate %", weight: 0.55 },
          { id: "taxes", label: "Taxes", weight: 0.7, kind: "money" },
          { id: "ins", label: "Ins", weight: 0.65, kind: "money" },
          { id: "hoa", label: "HOA", weight: 0.6, kind: "money" },
          { id: "escrow", label: "Escrow (calc)", weight: 0.8, kind: "readonly" },
          { id: "gross", label: "Gross rent", weight: 0.8, kind: "money" },
          { id: "net", label: "Net rent (calc)", weight: 0.85, kind: "readonly" },
          { id: "equity", label: "Equity (calc)", weight: 0.8, kind: "readonly" },
          { id: "ltv", label: "LTV (calc)", weight: 0.55, kind: "readonly" },
          { id: "apn", label: "APN", weight: 0.7 },
          { id: "invested", label: "Invested", weight: 0.8, kind: "money" },
          { id: "latLong", label: "Lat/Long", weight: 0.9 },
          { id: "lotSf", label: "Lot SF", weight: 0.6 },
          { id: "propSf", label: "Prop SF", weight: 0.6 },
          { id: "recent", label: "Most recent", weight: 0.85 },
          { id: "assignees", label: "Assigned to", weight: 1.1 },
        ],
        rows: scheduleRows,
      },
      {
        id: "totals",
        title: "Totals",
        fields: [
          textField(
            "totals.marketValue",
            "Market value",
            formatReoUsd(totals.marketValue),
            { readonly: true },
          ),
          textField(
            "totals.balance",
            "Balance",
            formatReoUsd(totals.balance),
            { readonly: true },
          ),
          textField(
            "totals.mortgage",
            "Mortgage payment",
            formatReoUsd(totals.mortgagePayment),
            { readonly: true },
          ),
          textField(
            "totals.taxes",
            "Taxes",
            formatReoUsd(totals.taxes),
            { readonly: true },
          ),
          textField(
            "totals.insurance",
            "Insurance",
            formatReoUsd(totals.insurance),
            { readonly: true },
          ),
          textField(
            "totals.hoa",
            "HOA",
            formatReoUsd(totals.hoa),
            { readonly: true },
          ),
          textField(
            "totals.escrow",
            "Escrow",
            formatReoUsd(totals.escrow),
            { readonly: true },
          ),
          textField(
            "totals.grossRent",
            "Gross rent",
            formatReoUsd(totals.grossRent),
            { readonly: true },
          ),
          textField(
            "totals.netRent",
            "Net rent",
            formatReoUsd(totals.netRent),
            { readonly: true },
          ),
          textField(
            "totals.invested",
            "Invested",
            formatReoUsd(totals.invested),
            { readonly: true },
          ),
          textField(
            "totals.equity",
            "Equity",
            formatReoUsd(totals.equity),
            { readonly: true, fullWidth: true },
          ),
        ],
      },
    ],
  };
}
