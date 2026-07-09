import { query } from "./_generated/server";
import {
  extractLenderContacts,
  normEmailKey,
  normNameKey,
  normPhoneDigits,
  type ExtractedLenderContactRow,
} from "./lenderContactExtract";

/** Read-only analysis for migrating lender contact blobs → Contacts + contactLenderLinks. Does not write. */

const MAX_ROWS_PER_GROUP = 40;
const MAX_GROUPS_EMAIL = 400;
const MAX_GROUPS_PHONE = 400;
const MAX_GROUPS_NAME = 400;

/** Order-independent token key (weak handling of word order). */
function nameTokenSortKey(name: string): string {
  const parts = normNameKey(name)
    .split(/\s+/)
    .filter((p) => p.length > 0);
  if (parts.length === 0) return "";
  return [...parts].sort().join(" ");
}

export const analyzeReadiness = query({
  args: {},
  handler: async (ctx) => {
    const lenders = await ctx.db.query("lenders").collect();
    const generatedAt = Date.now();

    const rows: ExtractedLenderContactRow[] = [];
    for (const L of lenders) {
      rows.push(...extractLenderContacts(L));
    }

    let withEmail = 0;
    let withPhone = 0;
    let withName = 0;
    let primaryCount = 0;
    let additionalCount = 0;
    let phoneNumberCount = 0;
    for (const r of rows) {
      if (r.email) withEmail++;
      if (r.phone) withPhone++;
      if (r.name && r.name !== "(no name)") withName++;
      if (r.source === "primary") primaryCount++;
      else if (r.source === "additional") additionalCount++;
      else phoneNumberCount++;
    }

    const byEmail = new Map<string, ExtractedLenderContactRow[]>();
    for (const r of rows) {
      const k = normEmailKey(r.email);
      if (!k) continue;
      if (!byEmail.has(k)) byEmail.set(k, []);
      byEmail.get(k)!.push(r);
    }
    const emailDupesAll = [...byEmail.entries()].filter(([, arr]) => arr.length > 1);
    emailDupesAll.sort((a, b) => b[1].length - a[1].length);

    const byPhone = new Map<string, ExtractedLenderContactRow[]>();
    for (const r of rows) {
      const d = normPhoneDigits(r.phone);
      if (d.length < 7) continue;
      if (!byPhone.has(d)) byPhone.set(d, []);
      byPhone.get(d)!.push(r);
    }
    const phoneDupesAll = [...byPhone.entries()].filter(([, arr]) => arr.length > 1);
    phoneDupesAll.sort((a, b) => b[1].length - a[1].length);

    const byNameTokens = new Map<string, ExtractedLenderContactRow[]>();
    for (const r of rows) {
      if (r.source === "phoneNumber") continue;
      const k = nameTokenSortKey(r.name === "(no name)" ? "" : r.name);
      if (!k || k.length < 3) continue;
      if (!byNameTokens.has(k)) byNameTokens.set(k, []);
      byNameTokens.get(k)!.push(r);
    }
    const nameLikelyAll = [...byNameTokens.entries()].filter(
      ([, arr]) => arr.length > 1
    );
    nameLikelyAll.sort((a, b) => b[1].length - a[1].length);

    function sliceGroup<T>(arr: T[], max: number): { items: T[]; truncated: boolean } {
      if (arr.length <= max) return { items: arr, truncated: false };
      return { items: arr.slice(0, max), truncated: true };
    }

    const emailDuplicateGroups = emailDupesAll.slice(0, MAX_GROUPS_EMAIL).map(([emailKey, arr]) => {
      const { items, truncated } = sliceGroup(arr, MAX_ROWS_PER_GROUP);
      return {
        emailKey,
        rowCount: arr.length,
        rowsTruncated: truncated,
        rows: items,
      };
    });

    const phoneDuplicateGroups = phoneDupesAll.slice(0, MAX_GROUPS_PHONE).map(([digits, arr]) => {
      const { items, truncated } = sliceGroup(arr, MAX_ROWS_PER_GROUP);
      return {
        phoneDigits: digits,
        rowCount: arr.length,
        rowsTruncated: truncated,
        rows: items,
      };
    });

    const likelyNameMatchGroups = nameLikelyAll.slice(0, MAX_GROUPS_NAME).map(([tokenSortKey, arr]) => {
      const { items, truncated } = sliceGroup(arr, MAX_ROWS_PER_GROUP);
      return {
        nameTokenSortKey: tokenSortKey,
        rowCount: arr.length,
        rowsTruncated: truncated,
        rows: items,
      };
    });

    const uniqueEmails = byEmail.size;
    const uniquePhones7 = [...byPhone.keys()].length;

    const risks: string[] = [];
    if (rows.length > 5000) {
      risks.push(
        "Large extracted row count — migration should batch and may need Convex action with pagination."
      );
    }
    if (emailDupesAll.length > 0) {
      risks.push(
        "Duplicate emails across lenders require dedupe strategy (single Contact per email vs per-lender copies)."
      );
    }
    if (phoneDupesAll.length > 0) {
      risks.push(
        "Shared phone digits may be main office lines — avoid auto-merging people without human review."
      );
    }
    risks.push(
      "phoneNumber rows are company-level lines; mapping them to person Contacts may be inappropriate — consider skipping or separate contact type."
    );
    risks.push(
      "Token-sorted name groups can false-positive (common names); use only as review hints, not sole merge key."
    );

    const recommendedSteps: string[] = [
      "Define canonical Contact identity: prefer email match, then normalized name+phone, with manual review queue for ambiguous groups.",
      "Migrate primary + additional rows first; optionally exclude or tag phoneNumber-derived rows.",
      "For each lender row, create contactLenderLinks with role derived from titleRole / source (primary vs additional).",
      "Preserve raw lender.contactName / contacts / phoneNumbers until UI and workflows fully cut over.",
      "Run dry-run counts in staging; compare extracted row totals to new contacts + links created.",
    ];

    return {
      version: 1 as const,
      generatedAt,
      summary: {
        lenderTableRowCount: lenders.length,
        extractedRowCount: rows.length,
        primaryContactRows: primaryCount,
        additionalContactRows: additionalCount,
        phoneNumberRows: phoneNumberCount,
        rowsWithNonEmptyEmail: withEmail,
        rowsWithNonEmptyPhone: withPhone,
        rowsWithNonPlaceholderName: withName,
        uniqueNormalizedEmails: uniqueEmails,
        uniquePhoneKeysMin7Digits: uniquePhones7,
        duplicateEmailGroupCount: emailDupesAll.length,
        duplicatePhoneGroupCount: phoneDupesAll.length,
        likelyNameMatchGroupCount: nameLikelyAll.length,
        emailGroupsReturned: emailDuplicateGroups.length,
        phoneGroupsReturned: phoneDuplicateGroups.length,
        nameGroupsReturned: likelyNameMatchGroups.length,
      },
      dataSourcesExplained: {
        primary: "lenders.contactName, email, phone, titleRole",
        additional: "lenders.contacts[]",
        phoneNumber: "lenders.phoneNumbers[] (company lines — not always a person)",
      },
      duplicateGroups: {
        byEmail: emailDuplicateGroups,
        byPhone: phoneDuplicateGroups,
      },
      likelyNameMatches: {
        byTokenSortKey: likelyNameMatchGroups,
      },
      risks,
      recommendedSteps,
    };
  },
});
