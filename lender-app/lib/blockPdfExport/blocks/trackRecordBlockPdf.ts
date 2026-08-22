/**
 * Maps Investment Property Track Record → BlockPdfExportSpec (same fillable PDF
 * pipeline as PFS / Schedule of REO).
 */
import {
  computeTrackRecordExperience,
  computeTrackRecordScheduleTotals,
  formatTrackRecordUsd,
  type DealTrackRecordRow,
  type TrackRecordBlockMeta,
} from "@/lib/trackRecord/trackRecordModel";
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

export function buildTrackRecordBlockPdfSpec(
  rows: readonly DealTrackRecordRow[],
  opts?: {
    fileName?: string;
    assignedContactNames?: string[];
    blockMeta?: TrackRecordBlockMeta | null;
    rowAssigneeNames?: Array<string[]>;
  },
): BlockPdfExportSpec {
  const totals = computeTrackRecordScheduleTotals(rows);
  const experience = computeTrackRecordExperience(rows, opts?.blockMeta);
  const assigneeLine =
    (opts?.assignedContactNames ?? []).filter((n) => n.trim()).join(", ") || "";
  const scheduleRows = rows.map((row, i) => {
    const names = (opts?.rowAssigneeNames?.[i] ?? []).filter((n) => n.trim());
    return {
      num: String(i + 1),
      address: row.address,
      city: row.city,
      state: row.state,
      zip: row.zip,
      type: row.propertyType,
      g1: row.ownedByGuarantor1,
      g2: row.ownedByGuarantor2,
      g3: row.ownedByGuarantor3,
      g4: row.ownedByGuarantor4,
      title: row.titleHeldInName,
      acquired: row.acquisitionDate,
      price: row.acquisitionPrice,
      project: row.projectType,
      rehab: row.rehabOrConstructionAmount,
      exit: row.exitType,
      sold: row.dateSoldOrLeased,
      sale: row.salePriceOrRentAmount,
      assignees: names.join(", "),
    };
  });

  return {
    blockId: "trackRecord",
    title: "Investment Property Track Record",
    subtitle:
      "List investment properties owned over the last three years that were constructed/renovated and sold or leased. Rehab / new-construction counts follow the Track Record workbook.",
    fileName: opts?.fileName ?? "Investment_Property_Track_Record.pdf",
    footerNote:
      "Track Record Rev 06.01.2025. Qualifying experience is the individual guarantor with the highest rehab + new-construction count. Hidden helper columns (rehab / new construction flags) are calculated, not typed.",
    sections: [
      {
        id: "header",
        title: "Block header",
        fields: [
          textField("tr.assignees", "Assigned contacts", assigneeLine, {
            fullWidth: true,
          }),
          textField(
            "tr.propertyCount",
            "Properties on schedule",
            String(totals.propertyCount),
            { readonly: true },
          ),
        ],
      },
      {
        id: "experience",
        title: "Experience",
        description:
          "Rehab count = properties marked Rehab or Extensive Rehab and owned by that guarantor. New construction = New Construction + owned. Total = rehab + new construction. Qualifying = MAX across guarantors.",
        fields: experience.guarantors.flatMap((g, i) => [
          textField(`exp.g${i + 1}.name`, `Guarantor #${i + 1} name`, g.name),
          textField(
            `exp.g${i + 1}.rehab`,
            `Guarantor #${i + 1} rehab`,
            String(g.rehabCount),
            { readonly: true },
          ),
          textField(
            `exp.g${i + 1}.new`,
            `Guarantor #${i + 1} new construction`,
            String(g.newConstructionCount),
            { readonly: true },
          ),
          textField(
            `exp.g${i + 1}.total`,
            `Guarantor #${i + 1} total`,
            String(g.total),
            { readonly: true },
          ),
        ]).concat([
          textField(
            "exp.qualifying.rehab",
            "Qualifying rehab",
            String(experience.qualifyingRehab),
            { readonly: true },
          ),
          textField(
            "exp.qualifying.new",
            "Qualifying new construction",
            String(experience.qualifyingNewConstruction),
            { readonly: true },
          ),
          textField(
            "exp.qualifying.total",
            "Qualifying total",
            String(experience.qualifyingTotal),
            { readonly: true },
          ),
        ]),
      },
      {
        id: "schedule",
        title: "Investment properties",
        description:
          "Row-by-row track record. Owned-by flags drive rehab / new-construction experience counts.",
        minRows: Math.max(8, rows.length),
        columns: [
          { id: "num", label: "#", weight: 0.4 },
          { id: "address", label: "Property address", weight: 1.8 },
          { id: "city", label: "City", weight: 1 },
          { id: "state", label: "ST", weight: 0.4 },
          { id: "zip", label: "Zip", weight: 0.6 },
          { id: "type", label: "Property type", weight: 0.9 },
          { id: "g1", label: "G#1", weight: 0.45 },
          { id: "g2", label: "G#2", weight: 0.45 },
          { id: "g3", label: "G#3", weight: 0.45 },
          { id: "g4", label: "G#4", weight: 0.45 },
          { id: "title", label: "Title held in name", weight: 1.2 },
          { id: "acquired", label: "Acquisition date", weight: 0.9 },
          { id: "price", label: "Acquisition price", weight: 0.9, kind: "money" },
          { id: "project", label: "Project type", weight: 1 },
          {
            id: "rehab",
            label: "Rehab / construction $",
            weight: 1,
            kind: "money",
          },
          { id: "exit", label: "Exit", weight: 0.6 },
          { id: "sold", label: "Date sold / leased", weight: 1 },
          {
            id: "sale",
            label: "Sale price / rent",
            weight: 0.95,
            kind: "money",
          },
          { id: "assignees", label: "Assigned to", weight: 1.1 },
        ],
        rows: scheduleRows,
      },
      {
        id: "totals",
        title: "Totals",
        fields: [
          textField(
            "totals.acquisition",
            "Acquisition price",
            formatTrackRecordUsd(totals.acquisitionPrice),
            { readonly: true },
          ),
          textField(
            "totals.rehab",
            "Rehab / construction amount",
            formatTrackRecordUsd(totals.rehabOrConstructionAmount),
            { readonly: true },
          ),
          textField(
            "totals.sale",
            "Sale price / rent amount",
            formatTrackRecordUsd(totals.salePriceOrRentAmount),
            { readonly: true },
          ),
        ],
      },
    ],
  };
}
