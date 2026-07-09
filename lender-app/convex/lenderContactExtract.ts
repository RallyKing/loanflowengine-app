import type { Doc, Id } from "./_generated/dataModel";

export type LenderContactSource = "primary" | "additional" | "phoneNumber";

export type ExtractedLenderContactRow = {
  lenderId: Id<"lenders">;
  company: string;
  source: LenderContactSource;
  contactIndex?: number;
  phoneIndex?: number;
  name: string;
  email: string;
  phone: string;
  titleRole?: string;
  phoneLabel?: string;
};

/** Stable idempotency token written into migration notes (must match migration). */
export function migrationRowMarker(row: ExtractedLenderContactRow): string {
  if (row.source === "primary") return `[migrated-row:${row.lenderId}:primary]`;
  if (row.source === "additional")
    return `[migrated-row:${row.lenderId}:additional:${row.contactIndex ?? 0}]`;
  return `[migrated-row:${row.lenderId}:phoneNumber:${row.phoneIndex ?? 0}]`;
}

export function trimStr(s: string | undefined): string {
  return (s ?? "").trim();
}

export function normEmailKey(s: string): string {
  return s.trim().toLowerCase();
}

export function normPhoneDigits(s: string): string {
  return s.replace(/\D/g, "");
}

/** Lowercase, collapse spaces, strip most punctuation for name dedupe keys. */
export function normNameKey(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s]/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function extractLenderContacts(L: Doc<"lenders">): ExtractedLenderContactRow[] {
  const company = trimStr(L.company) || "(no company)";
  const out: ExtractedLenderContactRow[] = [];

  const pName = trimStr(L.contactName);
  const pEmail = trimStr(L.email);
  const pPhone = trimStr(L.phone);
  const pTitle = trimStr(L.titleRole);
  if (pName || pEmail || pPhone) {
    out.push({
      lenderId: L._id,
      company,
      source: "primary",
      name: pName || "(no name)",
      email: pEmail,
      phone: pPhone,
      titleRole: pTitle || undefined,
    });
  }

  (L.contacts ?? []).forEach((c, i) => {
    const n = trimStr(c.name);
    const e = trimStr(c.email);
    const p = trimStr(c.phone);
    const t = trimStr(c.titleRole);
    if (n || e || p) {
      out.push({
        lenderId: L._id,
        company,
        source: "additional",
        contactIndex: i,
        name: n || "(no name)",
        email: e,
        phone: p,
        titleRole: t || undefined,
      });
    }
  });

  (L.phoneNumbers ?? []).forEach((pn, i) => {
    const p = trimStr(pn.phone);
    if (!p) return;
    const label = trimStr(pn.label);
    out.push({
      lenderId: L._id,
      company,
      source: "phoneNumber",
      phoneIndex: i,
      name: label ? `Phone (${label})` : "Company phone",
      email: "",
      phone: p,
      phoneLabel: label || undefined,
    });
  });

  return out;
}
