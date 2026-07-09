import type { Doc } from "../../convex/_generated/dataModel";

/** True when `pipeline.dealData` holds the embedded intake-shaped document. */
export function isEmbeddedDealDocument(
  dealData: unknown
): dealData is Record<string, unknown> {
  return (
    dealData != null &&
    typeof dealData === "object" &&
    !Array.isArray(dealData)
  );
}

/** Keys that alone do not constitute a materialized deal snapshot. */
const EMBEDDED_DEAL_NON_PAYLOAD_KEYS = new Set(["updatedAt"]);

/**
 * True when `dealData` carries at least one real intake field (not only
 * `updatedAt` or an empty object). Legacy rows sometimes stored `{}` or
 * `{ updatedAt }` while the canonical payload still lived on `intakeSheets`;
 * readers must fall back to the linked row in that case.
 */
export function embeddedDealPayloadIsSubstantive(dealData: unknown): boolean {
  if (!isEmbeddedDealDocument(dealData)) return false;
  for (const key of Object.keys(dealData)) {
    if (!EMBEDDED_DEAL_NON_PAYLOAD_KEYS.has(key)) return true;
  }
  return false;
}

export function asIntakeShapedSheet(
  dealData: Record<string, unknown>
): Doc<"intakeSheets"> {
  return dealData as Doc<"intakeSheets">;
}
