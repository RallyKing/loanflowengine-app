import {
  getAtomicPortalBlock,
  isAtomicPortalBlockId,
  type AtomicPortalBlockId,
} from "@/lib/atomicPortalBlockRegistry";
import { SECTION_KEYS } from "@/convex/shareSections";
import type { DealWorkspaceSheet } from "@/lib/file/dealSectionTypes";

function pickKeys(
  source: Record<string, unknown>,
  allowed: readonly string[],
): Record<string, unknown> {
  const allowedSet = new Set(allowed);
  const out: Record<string, unknown> = {};
  for (const key of allowed) {
    if (source[key] !== undefined) out[key] = source[key];
  }
  for (const [key, raw] of Object.entries(source)) {
    if (!allowedSet.has(key)) continue;
    if (raw == null) continue;
    out[key] = raw;
  }
  return out;
}

/** Build the mutation payload for one atomic block from the local portal draft sheet. */
export function extractFormDataForAtomicBlock(
  blockId: AtomicPortalBlockId,
  draft: DealWorkspaceSheet,
  moduleDraft?: Record<string, unknown>,
): Record<string, unknown> {
  const def = getAtomicPortalBlock(blockId);
  const sheetRecord = draft as unknown as Record<string, unknown>;

  if (def.kind === "dealSection" && def.dealSectionId) {
    return pickKeys(sheetRecord, SECTION_KEYS[def.dealSectionId]);
  }
  if (def.kind === "calculator" && def.calculatorId) {
    return pickKeys(sheetRecord, SECTION_KEYS[def.calculatorId]);
  }

  if (moduleDraft && Object.keys(moduleDraft).length > 0) {
    return { ...moduleDraft };
  }

  switch (blockId) {
    case "file_details":
    case "contacts": {
      const borrowers = Array.isArray(draft.borrowers) ? draft.borrowers : [];
      const primary = (borrowers[0] ?? {}) as Record<string, unknown>;
      return pickKeys(primary, [
        "firstName",
        "lastName",
        "email",
        "phone",
        "notes",
        "clientPortalNotes",
        "address",
        "city",
        "state",
        "zip",
      ]);
    }
    case "file_notes":
    case "deal_notes":
      return pickKeys(sheetRecord, [
        "clientPortalNotes",
        "notes",
        "primaryObjective",
        "additionalNotes",
      ]);
    case "pfs_statement":
      return pickKeys(sheetRecord, ["assets", "liabilities", "pfs"]);
    case "construction_budget":
    case "investor_experience":
      return moduleDraft ?? {};
    default:
      return pickKeys(sheetRecord, def.dealDataKeys);
  }
}

export function hasSubstantivePortalSubmission(
  blockId: string,
  formData: Record<string, unknown>,
): boolean {
  if (!isAtomicPortalBlockId(blockId)) return false;
  for (const value of Object.values(formData)) {
    if (value == null) continue;
    if (typeof value === "string" && value.trim()) return true;
    if (Array.isArray(value) && value.length > 0) return true;
    if (typeof value === "object" && Object.keys(value as object).length > 0) {
      return true;
    }
    if (typeof value === "number" && Number.isFinite(value)) return true;
  }
  return false;
}
