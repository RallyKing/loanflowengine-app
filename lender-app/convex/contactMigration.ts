import { mutation } from "./_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import {
  allContactEmailStrings,
  contactMethodsToConvexFields,
  normalizeContactMethods,
} from "../lib/contact/contactMethods";
import { normalizeEmailKey } from "../lib/crmRelationship";
import { resolveContactRoleIdFromLegacyDoc } from "../lib/contact/contactRoles";

type Candidate = {
  name: string;
  email?: string;
  phone?: string;
  role: string;
  notes?: string;
  label?: string;
};

function norm(s: string | undefined): string {
  return (s ?? "").trim();
}

function normLower(s: string | undefined): string {
  return norm(s).toLowerCase();
}

function collapseWs(s: string): string {
  return s.trim().replace(/\s+/g, " ");
}

function personNameFromBorrowerRow(row: unknown): string {
  if (!row || typeof row !== "object") return "";
  const rec = row as Record<string, unknown>;
  const first = typeof rec.firstName === "string" ? rec.firstName : "";
  const middle = typeof rec.middleName === "string" ? rec.middleName : "";
  const last = typeof rec.lastName === "string" ? rec.lastName : "";
  return collapseWs([first, middle, last].filter(Boolean).join(" "));
}

function inferRoleFromLegacyContact(c: {
  name: string;
  company?: string;
}): string {
  const blob = `${c.name} ${c.company ?? ""}`.toLowerCase();
  if (/(co[-\s]?sign|co[-\s]?borrow)/i.test(blob)) return "co-signer";
  if (/(referral|partner|broker|lender)/i.test(blob)) return "referral partner";
  return "client";
}

function parseCoverBorrowers(raw: unknown): string[] {
  if (typeof raw !== "string") return [];
  const t = raw.trim();
  if (!t) return [];
  return t
    .split(/,|&| and /gi)
    .map((s) => collapseWs(s))
    .filter(Boolean);
}

function pushCandidate(list: Candidate[], c: Candidate) {
  const name = collapseWs(c.name);
  if (!name) return;
  const email = norm(c.email) || undefined;
  const phone = norm(c.phone) || undefined;
  const key = `${name.toLowerCase()}|${(email ?? "").toLowerCase()}|${c.role.toLowerCase()}`;
  if (
    list.some(
      (x) =>
        `${x.name.toLowerCase()}|${(x.email ?? "").toLowerCase()}|${x.role.toLowerCase()}` ===
        key
    )
  ) {
    return;
  }
  list.push({
    name,
    email,
    phone,
    role: collapseWs(c.role),
    notes: norm(c.notes) || undefined,
    label: norm(c.label) || undefined,
  });
}

export const migratePipelineContactsToStandalone = mutation({
  args: {
    dryRun: v.optional(v.boolean()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { dryRun, limit }) => {
    const runDry = dryRun ?? false;
    const max = Math.max(1, Math.min(5000, Math.floor(limit ?? 1000)));
    const now = Date.now();

    const [pipelineRows, allContacts] = await Promise.all([
      ctx.db.query("pipeline").collect(),
      ctx.db.query("contacts").collect(),
    ]);
    const rows = pipelineRows.slice(0, max);

    const byEmail = new Map<string, Doc<"contacts">>();
    const byName = new Map<string, Doc<"contacts">>();
    for (const c of allContacts) {
      for (const e of allContactEmailStrings(c)) {
        if (e && !byEmail.has(e)) byEmail.set(e, c);
      }
      const n = normLower(c.name);
      if (n && !byName.has(n)) byName.set(n, c);
    }

    const lenderCache = new Map<Id<"lenders">, Doc<"lenders"> | null>();

    let scannedFiles = 0;
    let extractedCandidates = 0;
    let createdContacts = 0;
    let matchedContacts = 0;
    let createdLinks = 0;
    let wouldCreateContacts = 0;
    let wouldCreateLinks = 0;
    let skippedLinks = 0;

    for (const p of rows) {
      scannedFiles += 1;
      const candidates: Candidate[] = [];
      const deal = (p.dealData ?? null) as Record<string, unknown> | null;

      // 1) Client name from canonical deal payload.
      const clientName =
        deal && typeof deal.clientName === "string" ? deal.clientName : "";
      if (clientName.trim()) {
        pushCandidate(candidates, {
          name: clientName,
          role: "client",
          label: "client",
          notes: "Migrated from file clientName",
        });
      }

      // 2) Co-signer info from additional borrowers in deal payload.
      const borrowersRaw = deal && Array.isArray(deal.borrowers) ? deal.borrowers : [];
      const borrowerNames = borrowersRaw
        .map((b) => personNameFromBorrowerRow(b))
        .filter(Boolean);
      borrowerNames.forEach((name, idx) => {
        pushCandidate(candidates, {
          name,
          role: idx === 0 ? "client" : "co-signer",
          label: idx === 0 ? "client" : "co-signer",
          notes: "Migrated from deal borrowers[]",
        });
      });

      // 3) Coversheet borrowers string fallback (comma/and-delimited).
      const coverBorrowersRaw =
        deal &&
        typeof deal.cover === "object" &&
        deal.cover &&
        !Array.isArray(deal.cover)
          ? (deal.cover as Record<string, unknown>).borrowers
          : undefined;
      const coverBorrowers = parseCoverBorrowers(coverBorrowersRaw);
      coverBorrowers.forEach((name, idx) => {
        pushCandidate(candidates, {
          name,
          role: idx === 0 ? "client" : "co-signer",
          label: idx === 0 ? "client" : "co-signer",
          notes: "Migrated from cover.borrowers",
        });
      });

      // 4) Legacy per-file contacts array.
      for (const c of p.contacts ?? []) {
        const role = inferRoleFromLegacyContact(c);
        pushCandidate(candidates, {
          name: c.name,
          email: c.email,
          phone: c.phone,
          role,
          label: role,
          notes: "Migrated from pipeline.contacts[]",
        });
      }

      // 5) Referral partner names from linked lenders on the file.
      for (const lenderId of p.lenders ?? []) {
        let lender = lenderCache.get(lenderId);
        if (lender === undefined) {
          lender = await ctx.db.get(lenderId);
          lenderCache.set(lenderId, lender);
        }
        if (!lender) continue;
        pushCandidate(candidates, {
          name: lender.contactName || lender.company,
          email: lender.email || undefined,
          phone: lender.phone || undefined,
          role: "referral partner",
          label: "referral partner",
          notes: "Migrated from linked lender",
        });
      }

      extractedCandidates += candidates.length;

      for (const candidate of candidates) {
        const emailKey = normLower(candidate.email);
        const nameKey = normLower(candidate.name);
        let contact =
          (emailKey ? byEmail.get(emailKey) : undefined) ?? byName.get(nameKey);

        if (!contact) {
          if (runDry) {
            wouldCreateContacts += 1;
            wouldCreateLinks += 1;
            continue;
          }
          const contactRoleId = resolveContactRoleIdFromLegacyDoc({
            labels: candidate.label ? [candidate.label] : undefined,
          });
          const methods = normalizeContactMethods(
            {
              legacyEmail: candidate.email,
              legacyPhone: candidate.phone,
            },
            (e) => normalizeEmailKey(e),
          );
          const methodFields = contactMethodsToConvexFields(methods);
          const id = await ctx.db.insert("contacts", {
            name: candidate.name,
            ...methodFields,
            notes: candidate.notes ?? "",
            contactRoleId,
            createdAt: now,
            updatedAt: now,
          });
          const created = await ctx.db.get(id);
          if (!created) continue;
          contact = created;
          createdContacts += 1;
          if (emailKey) byEmail.set(emailKey, contact);
          byName.set(nameKey, contact);
        } else {
          matchedContacts += 1;
        }

        if (runDry) continue;

        const existing = await ctx.db
          .query("contactFileLinks")
          .withIndex("by_contact_file", (q) =>
            q.eq("contactId", contact._id).eq("fileId", p._id)
          )
          .first();
        if (existing) {
          skippedLinks += 1;
          continue;
        }

        await ctx.db.insert("contactFileLinks", {
          contactId: contact._id,
          fileId: p._id,
          role: candidate.role,
          notes: candidate.notes,
          contactRoleId: resolveContactRoleIdFromLegacyDoc({
            labels: candidate.label ? [candidate.label] : undefined,
          }),
          createdAt: now,
          updatedAt: now,
        });
        createdLinks += 1;
      }
    }

    return {
      dryRun: runDry,
      scannedFiles,
      extractedCandidates,
      createdContacts,
      wouldCreateContacts,
      matchedContacts,
      createdLinks,
      wouldCreateLinks,
      skippedLinks,
    };
  },
});
