import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { embeddedDealPayloadIsSubstantive } from "../lib/file/embeddedDealPresence";
import { appendPctFeeRecomputeForLoanChange } from "./pipelineFeeRecompute";
import { sanitizeDbPatch } from "./sanitizeConvexPatch";

/**
 * True when `pipeline.dealData` holds the embedded intake-shaped document
 * (canonical store for the file deal workspace).
 */
export function isEmbeddedDealDataPresent(dealData: unknown): boolean {
  return (
    dealData != null &&
    typeof dealData === "object" &&
    !Array.isArray(dealData)
  );
}

/** Drop Convex table metadata so a row can be stored as `dealData` JSON. */
export function intakeRowToDealPayload(
  row: Doc<"intakeSheets">
): Record<string, unknown> {
  const { _id, _creationTime, ...rest } = row;
  void _id;
  void _creationTime;
  return { ...rest } as Record<string, unknown>;
}

/**
 * Merge autosave / patch fields into the current embedded deal snapshot.
 * Caller should set `updatedAt` on the result before persisting.
 */
export function mergePatchIntoDeal(
  base: Record<string, unknown>,
  cleaned: Record<string, unknown>
): Record<string, unknown> {
  return { ...base, ...cleaned };
}

/** True when every cleaned key (except updatedAt) already matches `deal`. */
export function dealPatchIsNoOp(
  deal: Record<string, unknown>,
  cleaned: Record<string, unknown>,
): boolean {
  for (const [key, next] of Object.entries(cleaned)) {
    if (key === "updatedAt") continue;
    if (next === undefined) continue;
    try {
      if (JSON.stringify(deal[key]) !== JSON.stringify(next)) return false;
    } catch {
      if (deal[key] !== next) return false;
    }
  }
  return true;
}

/**
 * Shallow `cover` patches must merge into the existing coversheet so a client
 * can send only changed keys (e.g. table inline edit of `fundingAmount`) without
 * wiping the rest of `cover`.
 */
export function mergePartialCoverOnPatch(
  existingCover: unknown,
  patchCover: unknown
): Record<string, unknown> | undefined {
  if (patchCover === undefined) return undefined;
  if (patchCover === null) return undefined;
  if (typeof patchCover !== "object" || Array.isArray(patchCover)) {
    return patchCover as Record<string, unknown>;
  }
  const prev =
    existingCover != null &&
    typeof existingCover === "object" &&
    !Array.isArray(existingCover)
      ? (existingCover as Record<string, unknown>)
      : {};
  return { ...prev, ...(patchCover as Record<string, unknown>) };
}

/**
 * Shallow-merge `subjectProperty` patches into the existing property record
 * (same idea as `mergePartialCoverOnPatch`). Supports a string patch as
 * `{ address: patch }` for one-line editors.
 */
export function mergePartialSubjectPropertyOnPatch(
  existingSubject: unknown,
  patchSubject: unknown
): Record<string, unknown> | undefined {
  if (patchSubject === undefined) return undefined;
  if (patchSubject === null) return undefined;
  const prev =
    existingSubject != null &&
    typeof existingSubject === "object" &&
    !Array.isArray(existingSubject)
      ? (existingSubject as Record<string, unknown>)
      : {};
  if (typeof patchSubject === "string") {
    return { ...prev, address: patchSubject.trim() };
  }
  if (typeof patchSubject === "object" && !Array.isArray(patchSubject)) {
    return { ...prev, ...(patchSubject as Record<string, unknown>) };
  }
  return undefined;
}

function asDealRecord(v: unknown): Record<string, unknown> | null {
  if (v != null && typeof v === "object" && !Array.isArray(v)) {
    return v as Record<string, unknown>;
  }
  return null;
}

function parseMoneyLoose(raw: unknown): number | undefined {
  if (typeof raw === "number" && Number.isFinite(raw) && raw >= 0) {
    return raw > 0 ? raw : undefined;
  }
  if (typeof raw !== "string") return undefined;
  const t = raw.replace(/[$,\s]/g, "").trim();
  if (!t) return undefined;
  const n = Number.parseFloat(t);
  if (!Number.isFinite(n) || n <= 0) return undefined;
  return n;
}

/**
 * Primary funding amount from an intake-shaped deal payload (cover,
 * scenario, or first loan row). Used to keep `pipeline.fundingAmount` aligned with
 * the file workspace and for pipeline table previews.
 */
export function derivePrimaryFundingAmountFromDealPayload(
  deal: Record<string, unknown>
): number | undefined {
  const cover = asDealRecord(deal.cover);
  const fromCover = parseMoneyLoose(cover?.fundingAmount);
  if (fromCover != null) return fromCover;

  const commercial = asDealRecord(deal.commercial);
  const fromCommercial = parseMoneyLoose(commercial?.fundingAmount);
  if (fromCommercial != null) return fromCommercial;

  const hm = asDealRecord(deal.hardMoney);
  const hmInitial = parseMoneyLoose(hm?.initialLoan);
  const hmRehab = parseMoneyLoose(hm?.rehabHoldback);
  const hmTotal = (hmInitial ?? 0) + (hmRehab ?? 0);
  if (hmTotal > 0) return hmTotal;

  const business = asDealRecord(deal.business);
  const fromBusiness = parseMoneyLoose(business?.requestedAmount);
  if (fromBusiness != null) return fromBusiness;

  const scenario = asDealRecord(deal.scenario);
  const fromScenario = parseMoneyLoose(scenario?.proposedLoanAmount);
  if (fromScenario != null) return fromScenario;

  const loans = deal.loans;
  if (Array.isArray(loans) && loans.length > 0) {
    const first = asDealRecord(loans[0]);
    const fromFirstRow =
      parseMoneyLoose(first?.fundingAmount) ??
      parseMoneyLoose(first?.originalAmount);
    if (fromFirstRow != null) return fromFirstRow;
  }
  return undefined;
}

/**
 * Resolve the base embedded document for a patch: existing `dealData`, or a
 * full copy of the linked intake row when `dealData` is still empty.
 */
export async function resolveDealBaseForPipelinePatch(
  ctx: Pick<MutationCtx, "db">,
  p: Doc<"pipeline">
): Promise<Record<string, unknown>> {
  if (embeddedDealPayloadIsSubstantive(p.dealData)) {
    return { ...(p.dealData as Record<string, unknown>) };
  }
  if (p.intakeSheetId) {
    const leg = await ctx.db.get(p.intakeSheetId);
    if (!leg) throw new Error("Linked intake not found");
    return intakeRowToDealPayload(leg);
  }
  return {};
}

/**
 * After an `intakeSheets` row is patched (authenticated `patch`, share
 * `patchByToken`, etc.), copy the **full** updated intake row onto every linked
 * pipeline file's embedded `dealData`. The row has already been patched in the
 * DB, so this avoids stale merges when `dealData` lagged behind `intakeSheets`.
 */
export async function syncLinkedPipelineDealDataAfterIntakeChange(
  ctx: MutationCtx,
  intakeSheetId: Id<"intakeSheets">,
  cleaned: Record<string, unknown>
): Promise<void> {
  void cleaned;
  const linkedPipelines = await ctx.db
    .query("pipeline")
    .withIndex("by_intakeSheetId", (q) => q.eq("intakeSheetId", intakeSheetId))
    .collect();
  if (linkedPipelines.length === 0) return;

  const fresh = await ctx.db.get(intakeSheetId);
  if (!fresh) return;
  const syncAt = Date.now();
  const freshPayload = intakeRowToDealPayload(fresh);
  for (const pipe of linkedPipelines) {
    const merged = {
      ...freshPayload,
      updatedAt: syncAt,
    };
    const patch: Partial<Doc<"pipeline">> = {
      dealData: merged,
      updatedAt: syncAt,
    };
    const derived = derivePrimaryFundingAmountFromDealPayload(merged);
    if (
      derived != null &&
      Number.isFinite(derived) &&
      derived >= 0 &&
      derived !== pipe.fundingAmount
    ) {
      appendPctFeeRecomputeForLoanChange(pipe, patch, derived, {
        now: syncAt,
      });
    }
    await ctx.db.patch(
      pipe._id,
      sanitizeDbPatch(patch as unknown as Record<string, unknown>) as Partial<
        Doc<"pipeline">
      >,
    );
  }
}
