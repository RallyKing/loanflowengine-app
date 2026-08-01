import type { AssignedBlockEntry } from "@/lib/documentVaultTaskTypes";
import {
  ATOMIC_PORTAL_BLOCK_IDS,
  atomicPortalBlockDescription,
  atomicPortalBlockLabel,
  getAtomicPortalBlock,
  isAtomicPortalBlockId,
  normalizeToAtomicBlockIds,
  sanitizeAtomicAssignedBlockEntries,
  type AtomicPortalBlockId,
} from "@/lib/atomicPortalBlockRegistry";

/** @deprecated Use ATOMIC_PORTAL_BLOCK_IDS */
export const CLIENT_PORTAL_ASSIGNABLE_BLOCK_IDS = ATOMIC_PORTAL_BLOCK_IDS;

export type ClientPortalAssignableBlockId = AtomicPortalBlockId;

const ASSIGNABLE_SET = new Set<string>(ATOMIC_PORTAL_BLOCK_IDS);

export function isClientPortalAssignableBlock(
  blockId: string,
): blockId is AtomicPortalBlockId {
  if (ASSIGNABLE_SET.has(blockId)) return true;
  return normalizeToAtomicBlockIds(blockId).length > 0;
}

export function clientPortalBlockLabel(blockId: string): string {
  if (isAtomicPortalBlockId(blockId)) {
    return atomicPortalBlockLabel(blockId);
  }
  const atoms = normalizeToAtomicBlockIds(blockId);
  if (atoms.length === 1) return atomicPortalBlockLabel(atoms[0]!);
  return blockId;
}

export function clientPortalBlockDescription(
  blockId: string,
): string | undefined {
  if (isAtomicPortalBlockId(blockId)) {
    return atomicPortalBlockDescription(blockId);
  }
  const atoms = normalizeToAtomicBlockIds(blockId);
  if (atoms.length === 1) return atomicPortalBlockDescription(atoms[0]!);
  return undefined;
}

/** @deprecated Use sanitizeAtomicAssignedBlockEntries */
export function sanitizeAssignedBlocks(blockIds: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const id of blockIds) {
    for (const atom of normalizeToAtomicBlockIds(id, true)) {
      if (seen.has(atom)) continue;
      seen.add(atom);
      out.push(atom);
    }
  }
  return out;
}

export function sanitizeAssignedBlockEntries(
  entries: AssignedBlockEntry[],
): AssignedBlockEntry[] {
  return sanitizeAtomicAssignedBlockEntries(entries);
}

function asRecord(value: unknown): Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringField(
  record: Record<string, unknown>,
  key: string,
): string | undefined {
  const val = record[key];
  if (typeof val === "string" && val.trim()) return val.trim();
  return undefined;
}

/** Extract client-facing prefill values from live pipeline deal data per atomic block. */
export function prefillValuesForPortalBlock(
  blockId: string,
  dealData: Record<string, unknown> | null | undefined,
): Record<string, string> {
  const deal = dealData ?? {};
  const out: Record<string, string> = {};
  const atoms = isAtomicPortalBlockId(blockId)
    ? [blockId]
    : normalizeToAtomicBlockIds(blockId, true);

  for (const atom of atoms) {
    if (!isAtomicPortalBlockId(atom)) continue;
    const def = getAtomicPortalBlock(atom);
    for (const key of def.dealDataKeys) {
      const raw = deal[key];
      if (raw == null) continue;
      if (typeof raw === "string" && raw.trim()) {
        out[key] = raw.trim();
        continue;
      }
      if (Array.isArray(raw) && raw.length > 0) {
        out[key] = `${raw.length} row(s)`;
        continue;
      }
      if (typeof raw === "object") {
        const text = JSON.stringify(raw);
        if (text.length < 200) out[key] = text;
      }
    }

    if (atom === "file_details") {
      const cover = asRecord(deal.cover);
      const subject = asRecord(deal.subjectProperty);
      const borrowers = Array.isArray(deal.borrowers) ? deal.borrowers : [];
      const primary = asRecord(borrowers[0]);
      if (stringField(cover, "fileName")) {
        out.fileName = stringField(cover, "fileName")!;
      }
      if (stringField(subject, "address")) {
        out.propertyAddress = stringField(subject, "address")!;
      }
      for (const k of ["firstName", "lastName", "email", "phone"] as const) {
        if (stringField(primary, k)) out[k] = stringField(primary, k)!;
      }
    }

    if (atom === "file_notes" || atom === "deal_notes") {
      const notes = deal.clientPortalNotes ?? deal.notes ?? deal.primaryObjective;
      if (typeof notes === "string" && notes.trim()) out.notes = notes.trim();
    }

    if (atom === "pfs_statement") {
      const pfs = asRecord(deal.pfs);
      for (const k of [
        "totalAssets",
        "totalLiabilities",
        "netWorth",
        "liquidAssets",
        "annualIncome",
        "notes",
      ] as const) {
        if (stringField(pfs, k)) out[k] = stringField(pfs, k)!;
      }
    }
  }

  return out;
}

export function formatPrefillAsNotes(
  prefill: Record<string, string>,
): string {
  const parts = Object.entries(prefill)
    .filter(([, v]) => v.trim())
    .map(([k, v]) => `${k}: ${v}`);
  return parts.join("\n");
}
