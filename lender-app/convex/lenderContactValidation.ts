import { query } from "./_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import {
  extractLenderContacts,
  migrationRowMarker,
  normEmailKey,
  normPhoneDigits,
  trimStr,
  type ExtractedLenderContactRow,
} from "./lenderContactExtract";

const MARKER_INNER_RE = /\[migrated-row:([^\]]+)\]/g;

type SnapshotPayload = {
  lenderId?: string;
  source?: string;
  contactIndex?: number;
  phoneIndex?: number;
  extracted?: {
    name?: string;
    email?: string;
    phone?: string;
    titleRole?: string;
    phoneLabel?: string;
  };
};

function parseMarkerInner(inner: string): {
  lenderId: string;
  source: ExtractedLenderContactRow["source"];
  contactIndex?: number;
  phoneIndex?: number;
} | null {
  const parts = inner.split(":");
  if (parts.length < 2) return null;
  const lenderId = parts[0] as Id<"lenders"> as unknown as string;
  const kind = parts[1];
  if (kind === "primary" && parts.length === 2) {
    return { lenderId, source: "primary" };
  }
  if (kind === "additional" && parts.length === 3) {
    const idx = Number(parts[2]);
    if (!Number.isFinite(idx)) return null;
    return { lenderId, source: "additional", contactIndex: idx };
  }
  if (kind === "phoneNumber" && parts.length === 3) {
    const idx = Number(parts[2]);
    if (!Number.isFinite(idx)) return null;
    return { lenderId, source: "phoneNumber", phoneIndex: idx };
  }
  return null;
}

function parseSnapshotAfterMarker(notes: string, markerEnd: number): SnapshotPayload | null {
  const tail = notes.slice(markerEnd);
  for (const line of tail.split("\n")) {
    const t = line.trim();
    if (!t.startsWith("{")) continue;
    try {
      return JSON.parse(t) as SnapshotPayload;
    } catch {
      return null;
    }
  }
  return null;
}

function collectMarkersFromNotes(notes: string | undefined): Array<{
  marker: string;
  inner: string;
  parsed: NonNullable<ReturnType<typeof parseMarkerInner>>;
  payload: SnapshotPayload | null;
}> {
  if (!notes) return [];
  const out: Array<{
    marker: string;
    inner: string;
    parsed: NonNullable<ReturnType<typeof parseMarkerInner>>;
    payload: SnapshotPayload | null;
  }> = [];
  let m: RegExpExecArray | null;
  const re = new RegExp(MARKER_INNER_RE);
  while ((m = re.exec(notes)) !== null) {
    const marker = m[0];
    const inner = m[1] ?? "";
    const parsed = parseMarkerInner(inner);
    if (!parsed) continue;
    const payload = parseSnapshotAfterMarker(notes, m.index + marker.length);
    out.push({ marker, inner, parsed, payload });
  }
  return out;
}

function findExpectedRow(
  lender: Doc<"lenders">,
  parsed: { source: ExtractedLenderContactRow["source"]; contactIndex?: number; phoneIndex?: number }
): ExtractedLenderContactRow | undefined {
  return extractLenderContacts(lender).find(
    (r) =>
      r.source === parsed.source &&
      (parsed.source === "primary" ||
        (parsed.source === "additional" && r.contactIndex === parsed.contactIndex) ||
        (parsed.source === "phoneNumber" && r.phoneIndex === parsed.phoneIndex))
  );
}

function extractedMatchesSnapshot(
  row: ExtractedLenderContactRow,
  snap: NonNullable<SnapshotPayload["extracted"]>
): boolean {
  const e1 = normEmailKey(trimStr(row.email));
  const e2 = normEmailKey(trimStr(snap.email));
  if (e1 !== e2) return false;
  const p1 = normPhoneDigits(row.phone);
  const p2 = normPhoneDigits(trimStr(snap.phone));
  if (p1 !== p2) return false;
  return trimStr(row.name) === trimStr(snap.name);
}

/**
 * Validates migrated lender ↔ contact relationships against current lender rows.
 * Use before trusting bulk migration: checks marker coverage, duplicates, orphans,
 * and snapshot drift. Does not mutate data.
 */
export const validateLenderContactMigration = query({
  args: {
    maxSamples: v.optional(v.number()),
  },
  handler: async (ctx, { maxSamples }) => {
    const cap = Math.max(5, Math.min(80, Math.floor(maxSamples ?? 40)));
    const generatedAt = Date.now();

    const lenders = await ctx.db.query("lenders").collect();
    const blockingIssues: string[] = [];
    const warnings: string[] = [];
    const lenderSamples: Array<{
      lenderId: Id<"lenders">;
      company: string;
      problems: string[];
    }> = [];

    let totalExpectedRows = 0;
    let totalLinks = 0;
    let totalMigratedMarkers = 0;
    let lendersWithAnyMigrationMarker = 0;
    let lendersExpectedButNotMigrated = 0;
    let lendersPartialMigration = 0;
    let lendersDuplicateMarkerAcrossLinks = 0;
    let orphanLinks = 0;
    let wrongLenderInMarker = 0;
    let snapshotMismatch = 0;
    let suspiciousLinkDensity = 0;

    const pushSample = (lenderId: Id<"lenders">, company: string, msg: string) => {
      let row = lenderSamples.find((s) => s.lenderId === lenderId);
      if (!row) {
        if (lenderSamples.length >= cap) return;
        row = { lenderId, company, problems: [] };
        lenderSamples.push(row);
      }
      if (row.problems.length < 8) row.problems.push(msg);
    };

    const contactCache = new Map<Id<"contacts">, Doc<"contacts"> | null>();

    for (const lender of lenders) {
      const expected = extractLenderContacts(lender);
      totalExpectedRows += expected.length;

      const links = await ctx.db
        .query("contactLenderLinks")
        .withIndex("by_lender", (q) => q.eq("lenderId", lender._id))
        .collect();
      totalLinks += links.length;

      if (expected.length > 0 && links.length > Math.max(80, expected.length * 4)) {
        suspiciousLinkDensity += 1;
        pushSample(
          lender._id,
          lender.company,
          `Unusually high link count (${links.length}) vs extracted rows (${expected.length}).`
        );
      }

      const expectedMarkers = expected.map((r) => migrationRowMarker(r));
      const expectedSet = new Set(expectedMarkers);
      const markerToLinkIds = new Map<string, Id<"contactLenderLinks">[]>();

      let lenderHasMigration = false;
      const blobs = links.map((l) => ({ link: l, markers: collectMarkersFromNotes(l.notes) }));

      for (const { link, markers } of blobs) {
        const note = link.notes ?? "";
        const rawMarkers = [...note.matchAll(/\[migrated-row:[^\]]+\]/g)].map((x) => x[0]);
        const perNoteCounts = new Map<string, number>();
        for (const mk of rawMarkers) {
          perNoteCounts.set(mk, (perNoteCounts.get(mk) ?? 0) + 1);
        }
        for (const [mk, c] of perNoteCounts) {
          if (c > 1) {
            blockingIssues.push(
              `Lender ${lender.company}: link ${link._id} contains duplicate marker ${mk} (${c}×).`
            );
            pushSample(lender._id, lender.company, "Duplicate migration marker text on one link.");
          }
        }

        for (const { marker, parsed, payload } of markers) {
          lenderHasMigration = true;
          totalMigratedMarkers += 1;
          if (parsed.lenderId !== String(link.lenderId)) {
            wrongLenderInMarker += 1;
            blockingIssues.push(
              `Link ${link._id}: marker lender ${parsed.lenderId} ≠ link lender ${link.lenderId}.`
            );
            pushSample(lender._id, lender.company, "Marker lenderId mismatch on a link.");
          }
          if (parsed.lenderId === String(link.lenderId) && !expectedSet.has(marker)) {
            warnings.push(
              `Lender ${lender.company} (${lender._id}): link has migration marker ${marker} that does not match any current extract row (stale migration or edited lender).`
            );
            pushSample(lender._id, lender.company, "Extra / stale migration marker vs current extract.");
          }
          const arr = markerToLinkIds.get(marker) ?? [];
          arr.push(link._id);
          markerToLinkIds.set(marker, arr);

          let contact = contactCache.get(link.contactId);
          if (contact === undefined) {
            contact = await ctx.db.get(link.contactId);
            contactCache.set(link.contactId, contact);
          }
          if (!contact) {
            orphanLinks += 1;
            blockingIssues.push(`Orphan link ${link._id} → missing contact ${link.contactId}.`);
            pushSample(lender._id, lender.company, "Link points at deleted contact.");
          }

          if (payload && payload.extracted) {
            const row = findExpectedRow(lender, parsed);
            if (row && !extractedMatchesSnapshot(row, payload.extracted)) {
              snapshotMismatch += 1;
              warnings.push(
                `Lender ${lender.company} (${lender._id}): snapshot for ${marker} no longer matches current embedded contact row (data may have changed post-migration).`
              );
              pushSample(lender._id, lender.company, "Snapshot JSON drift vs current lender extract.");
            }
          }
        }
      }

      if (lenderHasMigration) lendersWithAnyMigrationMarker += 1;

      let dupThisLender = false;
      for (const [, ids] of markerToLinkIds) {
        const distinctLinks = new Set(ids).size;
        if (distinctLinks > 1) {
          dupThisLender = true;
          blockingIssues.push(
            `Lender ${lender.company} (${lender._id}): same migration marker appears on ${distinctLinks} distinct links (duplicate explosion risk).`
          );
        }
      }
      if (dupThisLender) {
        lendersDuplicateMarkerAcrossLinks += 1;
        pushSample(lender._id, lender.company, "Same migration marker on multiple links.");
      }

      if (lenderHasMigration) {
        let missing = 0;
        for (const m of expectedMarkers) {
          const ids = markerToLinkIds.get(m);
          if (!ids?.length) missing += 1;
        }
        if (missing > 0) {
          lendersPartialMigration += 1;
          blockingIssues.push(
            `Lender ${lender.company} (${lender._id}): incomplete migration — ${missing} of ${expectedMarkers.length} expected rows lack a migration marker on any link.`
          );
          pushSample(lender._id, lender.company, `Missing ${missing} expected migration marker(s).`);
        }
      } else if (expected.length > 0 && links.length === 0) {
        lendersExpectedButNotMigrated += 1;
        warnings.push(
          `Lender ${lender.company} (${lender._id}) has ${expected.length} extractable contact row(s) but no contact links (migration not run for this lender).`
        );
      }
    }

    const uiNotes = [
      "The lender drawer surfaces people and numbers through the “Lender contacts” panel (global Contacts + contactLenderLinks). Legacy CSV columns (contactName, phone, email, etc.) and embedded arrays still exist on the lender document for browse/search/imports until a future schema cleanup — they are not edited in the drawer UI.",
      "Run `lenderContactMigration:migrateLenderContacts` in batches until `isDone`, then re-run this validation.",
    ];

    const ok = blockingIssues.length === 0;

    if (suspiciousLinkDensity > 0 && ok) {
      warnings.push(
        `${suspiciousLinkDensity} lender(s) have very high link counts relative to extracted contact rows — review for duplicate linking.`
      );
    }

    return {
      version: 1 as const,
      generatedAt,
      ok,
      blockingIssues: blockingIssues.slice(0, 200),
      warnings: warnings.slice(0, 200),
      summary: {
        lenderCount: lenders.length,
        totalExpectedExtractedRows: totalExpectedRows,
        totalContactLenderLinks: totalLinks,
        totalMigrationMarkersFound: totalMigratedMarkers,
        lendersWithAnyMigrationMarker,
        lendersExpectedButNotMigrated,
        lendersPartialMigration,
        lendersDuplicateMarkerAcrossLinks,
        orphanLinks,
        wrongLenderInMarker,
        snapshotMismatchWarnings: snapshotMismatch,
        suspiciousHighLinkDensityLenders: suspiciousLinkDensity,
      },
      lenderIssueSamples: lenderSamples,
      uiNotes,
    };
  },
});
