import type { Doc } from "@/convex/_generated/dataModel";
import { getPipelineStatusInfo } from "@/lib/pipelineStatus";

/** Same shape as `LedgerListEntry` from `api.ledger.list` (kept local for client bundles). */
export type LedgerExportRow = {
  ledger: Doc<"ledger">;
  file: Doc<"pipeline"> | null;
  payments: Doc<"payments">[];
  receivedGross: number;
  receivedNet: number;
  paymentCount: number;
  lastPaymentDate: number | null;
  canEditFile: boolean;
};
import {
  flattenForTsv,
  joinCsvDocument,
  joinCsvLine,
  joinTsvDocument,
  joinTsvLine,
} from "@/lib/export/csvEscape";

type PaymentMode = "lump_sum" | "scheduled" | "monthly";

function modeOf(l: LedgerExportRow["ledger"]): PaymentMode {
  return l.paymentMode ?? "lump_sum";
}

const MODE_LABEL: Record<PaymentMode, string> = {
  lump_sum: "Lump sum",
  scheduled: "Scheduled",
  monthly: "Monthly",
};

/** Full detail CSV: one funding row plus one row per payment (matches prior UI). */
export function buildLedgerCsv(rows: LedgerExportRow[]): string {
  const header = [
    "Type",
    "Funded date",
    "File",
    "Status",
    "Property",
    "Mode",
    "Expected gross",
    "Expected net",
    "Received gross",
    "Received net",
    "Balance gross",
    "Method",
    "Paid by",
    "Funding amount",
    "Rate",
    "Term",
    "Notes",
  ];
  const lines = [joinCsvLine(header)];
  for (const r of rows) {
    const m = modeOf(r.ledger);
    lines.push(
      joinCsvLine([
        "Funding",
        new Date(r.ledger.date).toISOString().slice(0, 10),
        r.file?.fileName ?? "(deleted file)",
        r.file ? getPipelineStatusInfo(r.file.status).label : "",
        r.file?.propertyAddress ?? "",
        MODE_LABEL[m],
        r.ledger.gross.toFixed(2),
        r.ledger.net.toFixed(2),
        r.receivedGross.toFixed(2),
        r.receivedNet.toFixed(2),
        Math.max(0, r.ledger.gross - r.receivedGross).toFixed(2),
        r.ledger.paymentMethod ?? "",
        r.ledger.paidBy ?? "",
        r.file?.fundingAmount ?? "",
        r.file?.rate ?? "",
        r.file?.term ?? "",
        r.ledger.notes ?? "",
      ])
    );
    for (const p of r.payments) {
      lines.push(
        joinCsvLine([
          "Payment",
          new Date(p.date).toISOString().slice(0, 10),
          r.file?.fileName ?? "(deleted file)",
          "",
          "",
          "",
          "",
          "",
          "",
          p.gross.toFixed(2),
          p.net.toFixed(2),
          "",
          p.method ?? "",
          p.paidBy ?? "",
          "",
          "",
          "",
          p.notes ?? "",
        ])
      );
    }
  }
  return joinCsvDocument(lines);
}

export function buildLedgerTsv(rows: LedgerExportRow[]): string {
  const header = [
    "Type",
    "Funded date",
    "File",
    "Mode",
    "Expected gross",
    "Expected net",
    "Received gross",
    "Received net",
    "Balance gross",
    "Method",
    "Paid by",
    "Notes",
  ];
  const lines = [header.map(flattenForTsv).join("\t")];
  for (const r of rows) {
    const m = modeOf(r.ledger);
    lines.push(
      joinTsvLine([
        "Funding",
        new Date(r.ledger.date).toISOString().slice(0, 10),
        r.file?.fileName ?? "(deleted file)",
        MODE_LABEL[m],
        r.ledger.gross.toFixed(2),
        r.ledger.net.toFixed(2),
        r.receivedGross.toFixed(2),
        r.receivedNet.toFixed(2),
        Math.max(0, r.ledger.gross - r.receivedGross).toFixed(2),
        r.ledger.paymentMethod ?? "",
        r.ledger.paidBy ?? "",
        r.ledger.notes ?? "",
      ])
    );
    for (const p of r.payments) {
      lines.push(
        joinTsvLine([
          "Payment",
          new Date(p.date).toISOString().slice(0, 10),
          r.file?.fileName ?? "(deleted file)",
          "",
          "",
          "",
          p.gross.toFixed(2),
          p.net.toFixed(2),
          "",
          p.method ?? "",
          p.paidBy ?? "",
          p.notes ?? "",
        ])
      );
    }
  }
  return joinTsvDocument(lines);
}

export function buildLedgerJson(rows: LedgerExportRow[]): string {
  const exportedAt = new Date().toISOString();
  return JSON.stringify(
    {
      exportVersion: 1,
      exportedAt,
      rowCount: rows.length,
      rows: rows.map((r) => ({
        ledger: r.ledger,
        file: r.file
          ? {
              _id: r.file._id,
              fileName: r.file.fileName,
              status: r.file.status,
              propertyAddress: r.file.propertyAddress,
              fundingAmount: r.file.fundingAmount,
              rate: r.file.rate,
              term: r.file.term,
            }
          : null,
        payments: r.payments,
        receivedGross: r.receivedGross,
        receivedNet: r.receivedNet,
        paymentCount: r.paymentCount,
        lastPaymentDate: r.lastPaymentDate,
      })),
    },
    null,
    2
  );
}

/** Clipboard-friendly TSV (no BOM). */
export function ledgerClipboardTsv(rows: LedgerExportRow[]): string {
  return buildLedgerTsv(rows);
}
