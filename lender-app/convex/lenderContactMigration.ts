import { mutation } from "./_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";

type LenderLinkRow = Doc<"contactLenderLinks">;
import {
  extractLenderContacts,
  migrationRowMarker,
  normEmailKey,
  normNameKey,
  normPhoneDigits,
  trimStr,
  type ExtractedLenderContactRow,
} from "./lenderContactExtract";
import {
  allContactEmailStrings,
  allContactPhoneStrings,
  contactMethodsToConvexFields,
  mergeScalarsIntoContactMethods,
  normalizeContactMethods,
} from "../lib/contact/contactMethods";
import { normalizeEmailKey } from "../lib/crmRelationship";
import { DEFAULT_CONTACT_ROLE_IDS } from "../lib/contact/contactRoles";
import { refreshContactGlobalSearchText } from "./globalSearchSync";

const MIGRATION_LABEL = "lender contact";

const rowMarker = migrationRowMarker;

function roleForRow(row: ExtractedLenderContactRow): string {
  if (row.source === "phoneNumber") {
    const label = trimStr(row.phoneLabel);
    return label ? label : "Company phone";
  }
  const t = trimStr(row.titleRole);
  if (t) return t.replace(/\s+/g, " ");
  if (row.source === "primary") return "Primary contact";
  return "Lender contact";
}

function displayName(row: ExtractedLenderContactRow): string {
  if (row.name && row.name !== "(no name)") return row.name.trim();
  const e = trimStr(row.email);
  if (e) {
    const local = e.split("@")[0]?.trim();
    if (local) return local;
  }
  const p = trimStr(row.phone);
  if (p) return row.source === "phoneNumber" ? row.name.trim() || "Company phone" : `Phone ${p}`;
  return "Lender contact";
}

function snapshotPayload(row: ExtractedLenderContactRow, lender: Doc<"lenders">) {
  return {
    lenderId: row.lenderId,
    company: row.company,
    source: row.source,
    contactIndex: row.contactIndex,
    phoneIndex: row.phoneIndex,
    extracted: {
      name: row.name,
      email: row.email,
      phone: row.phone,
      titleRole: row.titleRole,
      phoneLabel: row.phoneLabel,
    },
    lenderPrimaryFields: {
      contactName: lender.contactName,
      titleRole: lender.titleRole,
      phone: lender.phone,
      email: lender.email,
    },
  };
}

function contactNoteBlock(row: ExtractedLenderContactRow, lender: Doc<"lenders">): string {
  return [
    "--- lender-contact-migration ---",
    rowMarker(row),
    JSON.stringify(snapshotPayload(row, lender)),
  ].join("\n");
}

function linkNoteBlock(row: ExtractedLenderContactRow, lender: Doc<"lenders">): string {
  return [
    "--- lender-contact-migration (link) ---",
    rowMarker(row),
    JSON.stringify(snapshotPayload(row, lender)),
  ].join("\n");
}

function findExistingContact(
  byEmail: Map<string, Doc<"contacts">>,
  byName: Map<string, Doc<"contacts">>,
  byPhone: Map<string, Doc<"contacts">>,
  row: ExtractedLenderContactRow
): Doc<"contacts"> | undefined {
  const ek = normEmailKey(row.email);
  if (ek) {
    const c = byEmail.get(ek);
    if (c) return c;
  }
  if (row.source === "phoneNumber") {
    const d = normPhoneDigits(row.phone);
    if (d.length >= 7) return byPhone.get(d);
    return undefined;
  }
  const rawName = row.name === "(no name)" ? "" : row.name;
  const nk = normNameKey(rawName);
  if (nk) {
    const c = byName.get(nk);
    if (c) return c;
  }
  const d = normPhoneDigits(row.phone);
  if (d.length >= 7) return byPhone.get(d);
  return undefined;
}

function registerContactOnMaps(
  byEmail: Map<string, Doc<"contacts">>,
  byName: Map<string, Doc<"contacts">>,
  byPhone: Map<string, Doc<"contacts">>,
  doc: Doc<"contacts">,
) {
  for (const e of allContactEmailStrings(doc)) {
    const ek = normEmailKey(e);
    if (ek) byEmail.set(ek, doc);
  }
  const nk = normNameKey(doc.name);
  if (nk) byName.set(nk, doc);
  for (const p of allContactPhoneStrings(doc)) {
    const d = normPhoneDigits(p);
    if (d.length >= 7) byPhone.set(d, doc);
  }
}

function registerExtractedRowOnMaps(
  byEmail: Map<string, Doc<"contacts">>,
  byName: Map<string, Doc<"contacts">>,
  byPhone: Map<string, Doc<"contacts">>,
  row: ExtractedLenderContactRow,
  doc: Doc<"contacts">,
) {
  registerContactOnMaps(byEmail, byName, byPhone, doc);
  const ek = normEmailKey(row.email);
  if (ek) byEmail.set(ek, doc);
  if (row.source === "phoneNumber") {
    const d = normPhoneDigits(row.phone);
    if (d.length >= 7) byPhone.set(d, doc);
    return;
  }
  const rawName = row.name === "(no name)" ? "" : row.name;
  const nk = normNameKey(rawName);
  if (nk) byName.set(nk, doc);
  else {
    const d = normPhoneDigits(row.phone);
    if (d.length >= 7) byPhone.set(d, doc);
  }
}

/**
 * Copies lender primary / additional / phoneNumbers into global `contacts` +
 * `contactLenderLinks`. Does **not** remove or modify embedded lender fields.
 *
 * Dedupe: normalized email first; then normalized person name (phoneNumber rows
 * use 7+ digit phone key instead of generic display names). Re-runs are
 * idempotent per extracted row via `[migrated-row:...]` markers on links.
 */
export const migrateLenderContacts = mutation({
  args: {
    dryRun: v.optional(v.boolean()),
    /** Lenders to process in this call (default 200, max 500). */
    limit: v.optional(v.number()),
    /** Pass `continueCursor` from the previous run until `isDone` is true. */
    cursor: v.optional(v.union(v.string(), v.null())),
  },
  handler: async (ctx, { dryRun, limit, cursor }) => {
    const runDry = dryRun ?? false;
    const batchSize = Math.max(1, Math.min(500, Math.floor(limit ?? 200)));
    const now = Date.now();

    const page = await ctx.db.query("lenders").paginate({
      numItems: batchSize,
      cursor: cursor ?? null,
    });

    const allContacts = await ctx.db.query("contacts").collect();
    const byEmail = new Map<string, Doc<"contacts">>();
    const byName = new Map<string, Doc<"contacts">>();
    const byPhone = new Map<string, Doc<"contacts">>();
    for (const c of allContacts) {
      registerContactOnMaps(byEmail, byName, byPhone, c);
    }

    let lendersProcessed = 0;
    let extractedRows = 0;
    let skippedAlreadyMigrated = 0;
    let createdContacts = 0;
    let reusedContacts = 0;
    let createdLinks = 0;
    let updatedLinks = 0;
    let wouldCreateContacts = 0;
    let wouldCreateLinks = 0;
    let wouldUpdateLinks = 0;

    for (const lender of page.page) {
      lendersProcessed += 1;
      const rows = extractLenderContacts(lender);
      const lenderLinkState: LenderLinkRow[] = await ctx.db
        .query("contactLenderLinks")
        .withIndex("by_lender", (q) => q.eq("lenderId", lender._id))
        .collect();

      for (const row of rows) {
        extractedRows += 1;

        const marker = rowMarker(row);
        const already = lenderLinkState.some((L) => L.notes?.includes(marker));
        if (already) {
          skippedAlreadyMigrated += 1;
          continue;
        }

        let contact = findExistingContact(byEmail, byName, byPhone, row);
        const snapContact = contactNoteBlock(row, lender);
        const snapLink = linkNoteBlock(row, lender);
        const role = roleForRow(row);
        const nameForDoc = displayName(row);

        if (!contact) {
          if (runDry) {
            wouldCreateContacts += 1;
            const fakeId = `sim_${row.lenderId}_${extractedRows}` as unknown as Id<"contacts">;
            const simDoc = {
              _id: fakeId,
              _creationTime: now,
              name: nameForDoc,
              email: trimStr(row.email),
              phone: trimStr(row.phone),
              notes: snapContact,
              contactRoleId: DEFAULT_CONTACT_ROLE_IDS.lenderRep,
              createdAt: now,
              updatedAt: now,
            } as Doc<"contacts">;
            registerExtractedRowOnMaps(byEmail, byName, byPhone, row, simDoc);
            const simPair = lenderLinkState.find((L) => L.contactId === simDoc._id);
            if (simPair) wouldUpdateLinks += 1;
            else {
              wouldCreateLinks += 1;
              lenderLinkState.push({
                _id: `simlink_${row.lenderId}_${extractedRows}` as unknown as Id<"contactLenderLinks">,
                _creationTime: now,
                contactId: simDoc._id,
                lenderId: lender._id,
                role,
                notes: snapLink,
                createdAt: now,
                updatedAt: now,
              } as LenderLinkRow);
            }
            continue;
          }

          const methods = normalizeContactMethods(
            {
              legacyEmail: trimStr(row.email),
              legacyPhone: trimStr(row.phone),
            },
            (e) => normalizeEmailKey(e),
          );
          const id = await ctx.db.insert("contacts", {
            name: nameForDoc,
            ...contactMethodsToConvexFields(methods),
            notes: snapContact,
            contactRoleId: DEFAULT_CONTACT_ROLE_IDS.lenderRep,
            createdAt: now,
            updatedAt: now,
          });
          const created = await ctx.db.get(id);
          if (!created) continue;
          contact = created;
          createdContacts += 1;
          await refreshContactGlobalSearchText(ctx, id);
          registerExtractedRowOnMaps(byEmail, byName, byPhone, row, contact);
        } else {
          reusedContacts += 1;
          if (!runDry) {
            const methods = mergeScalarsIntoContactMethods(
              contact,
              { email: trimStr(row.email), phone: trimStr(row.phone) },
              (e) => normalizeEmailKey(e),
            );
            await ctx.db.patch(contact._id, {
              ...contactMethodsToConvexFields(methods),
              notes: contact.notes ? `${contact.notes}\n\n${snapContact}` : snapContact,
              ...(!contact.contactRoleId
                ? { contactRoleId: DEFAULT_CONTACT_ROLE_IDS.lenderRep }
                : {}),
              updatedAt: now,
            });
            const refreshed = await ctx.db.get(contact._id);
            if (refreshed) {
              contact = refreshed;
              await refreshContactGlobalSearchText(ctx, contact._id);
              registerExtractedRowOnMaps(byEmail, byName, byPhone, row, refreshed);
            }
          }
        }

        if (runDry) {
          const pairLink = lenderLinkState.find((L) => L.contactId === contact._id);
          if (pairLink) wouldUpdateLinks += 1;
          else {
            wouldCreateLinks += 1;
            lenderLinkState.push({
              _id: `simlink_${row.lenderId}_${extractedRows}` as unknown as Id<"contactLenderLinks">,
              _creationTime: now,
              contactId: contact._id,
              lenderId: lender._id,
              role,
              notes: snapLink,
              createdAt: now,
              updatedAt: now,
            } as LenderLinkRow);
          }
          continue;
        }

        const pairLink = lenderLinkState.find((L) => L.contactId === contact._id);

        if (pairLink) {
          const mergedNotes = pairLink.notes
            ? `${pairLink.notes}\n\n${snapLink}`
            : snapLink;
          const a = pairLink.role.trim();
          const b = role.trim();
          const mergedRole =
            !a ? b : !b ? a : a.toLowerCase() === b.toLowerCase() ? a : `${a}; ${b}`;
          await ctx.db.patch(pairLink._id, {
            notes: mergedNotes,
            role: mergedRole,
            updatedAt: now,
          });
          pairLink.notes = mergedNotes;
          pairLink.role = mergedRole;
          pairLink.updatedAt = now;
          updatedLinks += 1;
        } else {
          const linkId = await ctx.db.insert("contactLenderLinks", {
            contactId: contact._id,
            lenderId: lender._id,
            role,
            notes: snapLink,
            contactRoleId: DEFAULT_CONTACT_ROLE_IDS.lenderRep,
            createdAt: now,
            updatedAt: now,
          });
          const inserted = await ctx.db.get(linkId);
          if (inserted) lenderLinkState.push(inserted);
          createdLinks += 1;
        }
      }
    }

    return {
      dryRun: runDry,
      lendersProcessed,
      extractedRows,
      skippedAlreadyMigrated,
      createdContacts,
      reusedContacts,
      createdLinks,
      updatedLinks,
      wouldCreateContacts,
      wouldCreateLinks,
      wouldUpdateLinks,
      isDone: page.isDone,
      continueCursor: page.continueCursor ?? null,
    };
  },
});
