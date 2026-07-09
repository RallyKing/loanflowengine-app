import type { Doc } from "@/convex/_generated/dataModel";
import type { ContactBusinessDebtShape } from "@/lib/contacts/businessDebtFromDeal";
import type { DealBusinessDebtRow } from "@/lib/contacts/businessDebtFromDeal";
import type { DealReoRow } from "@/lib/contacts/reoFromDeal";
import type { ContactReoPropertyShape } from "@/lib/contacts/reoFromDeal";

export function contactPiiToDealStringFields(
  contact: Pick<Doc<"contacts">, "fico" | "ssn" | "dob">,
): { fico?: string; ssn?: string; dob?: string } {
  return {
    ...(contact.fico != null && Number.isFinite(contact.fico)
      ? { fico: String(contact.fico) }
      : {}),
    ...(contact.ssn?.trim() ? { ssn: contact.ssn.trim() } : {}),
    ...(contact.dob?.trim() ? { dob: contact.dob.trim() } : {}),
  };
}

export function reoProfileShapeToDealRow(
  row: ContactReoPropertyShape,
): DealReoRow {
  return {
    ...(row.propertyAddress ? { address: row.propertyAddress } : {}),
    ...(row.propertyType ? { propertyType: row.propertyType } : {}),
    ...(row.usage ? { usage: row.usage } : {}),
    ...(row.state ? { state: row.state } : {}),
    ...(row.purchasedDate ? { purchasedDate: row.purchasedDate } : {}),
    ...(row.marketValue ? { marketValue: row.marketValue } : {}),
    ...(row.mortgageBalance ? { balance: row.mortgageBalance } : {}),
    ...(row.monthlyPayment ? { mortgagePayment: row.monthlyPayment } : {}),
    ...(row.rate ? { rate: row.rate } : {}),
    ...(row.position ? { position: row.position } : {}),
    ...(row.taxes ? { taxes: row.taxes } : {}),
    ...(row.insurance ? { insurance: row.insurance } : {}),
    ...(row.hoa ? { hoa: row.hoa } : {}),
    ...(row.escrow ? { escrow: row.escrow } : {}),
    ...(row.grossRent ? { grossRent: row.grossRent } : {}),
    ...(row.netRent ? { netRent: row.netRent } : {}),
    ...(row.apn ? { apn: row.apn } : {}),
    ...(row.invested ? { invested: row.invested } : {}),
    ...(row.latLong ? { latLong: row.latLong } : {}),
  };
}

export function businessDebtScheduleToDealRow(
  row: ContactBusinessDebtShape,
): DealBusinessDebtRow {
  return {
    ...(row.creditor ? { account: row.creditor } : {}),
    ...(row.balance ? { balance: row.balance } : {}),
    ...(row.monthlyPayment ? { monthlyPayment: row.monthlyPayment } : {}),
    ...(row.position ? { note: row.position } : {}),
    include: true,
  };
}

export function dealRowPiiToContactPatch(
  row: unknown,
): Partial<Pick<Doc<"contacts">, "fico" | "ssn" | "dob">> {
  if (!row || typeof row !== "object") return {};
  const rec = row as { fico?: string; ssn?: string; dob?: string };
  const patch: Partial<Pick<Doc<"contacts">, "fico" | "ssn" | "dob">> = {};
  const ficoStr = (rec.fico ?? "").trim();
  if (ficoStr) {
    const parsed = Number.parseFloat(ficoStr);
    if (Number.isFinite(parsed)) patch.fico = parsed;
  }
  const ssn = (rec.ssn ?? "").trim();
  if (ssn) patch.ssn = ssn;
  const dob = (rec.dob ?? "").trim();
  if (dob) patch.dob = dob;
  return patch;
}
