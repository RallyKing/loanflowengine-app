import type { Doc } from "@/convex/_generated/dataModel";
import { derivePrimaryFundingAmountFromDealPayload } from "@/convex/dealDataMerge";
import { deriveIntake } from "@/lib/intake/derivations";
import { toNumber } from "@/lib/intake/finance";

type PipelineFundingFields = Pick<Doc<"pipeline">, "fundingAmount">;

function pipelineRowStoredFunding(p: PipelineFundingFields): number {
  const f = p.fundingAmount;
  if (typeof f === "number" && Number.isFinite(f)) return f;
  return 0;
}

function coverHasFundingAmountKey(cover: unknown): boolean {
  return (
    cover != null &&
    typeof cover === "object" &&
    !Array.isArray(cover) &&
    Object.prototype.hasOwnProperty.call(cover, "fundingAmount")
  );
}

/**
 * File Overview / coversheet **`cover.fundingAmount`** as the pipeline table
 * sees it: empty or invalid input → **0** (user cleared the field); **0** is
 * kept (unlike `parseMoneyLoose` in `derivePrimaryFundingAmountFromDealPayload`,
 * which ignores non-positive cover values for cross-tab derivation).
 */
function numberFromCoverFundingAmount(raw: unknown): number {
  if (raw == null) return 0;
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return raw < 0 ? 0 : raw;
  }
  if (typeof raw !== "string") return 0;
  const t = raw.replace(/[$,\s]/g, "").trim();
  if (!t) return 0;
  const n = Number.parseFloat(t);
  if (!Number.isFinite(n) || n < 0) return 0;
  return n;
}

/**
 * Funding amount shown on the pipeline table and drawer metrics.
 *
 * **When `cover.fundingAmount` exists on the file payload** (including `""`
 * after a clear), that value is the **single source of truth** for the column —
 * no scenario/loan fall-through, so the table matches Overview.
 *
 * **When the key is absent** (legacy or cover never touched), use
 * **`derivePrimaryFundingAmountFromDealPayload`**, then **`scenario.proposedLoanAmount`**
 * via `deriveIntake`, then stored **`pipeline.fundingAmount`**.
 *
 * Callers pass the **live deal document** from `resolveDealPayloadForPreview`
 * (`pipeline.dealData` or linked `intakeSheets`) so UI stays tied to the file
 * workspace; the pipeline doc is only the numeric fallback.
 */
export function resolvePipelineTableFundingAmount(
  intake: Doc<"intakeSheets"> | null,
  pipeline: PipelineFundingFields,
): number {
  const pipeAmt = pipelineRowStoredFunding(pipeline);
  if (!intake) return pipeAmt;

  const cover = intake.cover;
  if (coverHasFundingAmountKey(cover)) {
    return numberFromCoverFundingAmount(
      (cover as Record<string, unknown>).fundingAmount,
    );
  }

  const derived = derivePrimaryFundingAmountFromDealPayload(
    intake as unknown as Record<string, unknown>,
  );
  if (derived != null && Number.isFinite(derived) && derived > 0) {
    return derived;
  }

  const di = deriveIntake(intake);
  const fallback = toNumber(di.proposedLoanAmount);
  if (fallback > 0) return fallback;

  return pipeAmt;
}
