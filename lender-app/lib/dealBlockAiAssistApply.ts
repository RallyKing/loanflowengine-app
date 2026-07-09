import type { DtiStateInput } from "./intake/dtiCompute";
import type { DealWorkspaceSheet } from "./file/dealSectionTypes";
import {
  sanitizeCoverAiPatch,
  sanitizeDtiAiPatch,
  sanitizeScenarioAiPatch,
} from "./dealBlockAiAssistModel";

export function mergeDtiFromSanitizedPatch(
  current: DtiStateInput,
  rawPatch: Record<string, unknown>,
): DtiStateInput {
  const patch = sanitizeDtiAiPatch(rawPatch);
  if (!patch) return current;
  const next: DtiStateInput = { ...current };
  const debts = { ...(current.debts ?? {}) };
  for (const [k, v] of Object.entries(patch)) {
    if (k === "debts") continue;
    if (typeof v === "string") {
      (next as Record<string, unknown>)[k] = v;
    }
  }
  if (patch.debts && typeof patch.debts === "object" && !Array.isArray(patch.debts)) {
    for (const [dk, dv] of Object.entries(
      patch.debts as Record<string, unknown>,
    )) {
      if (typeof dv === "string") {
        (debts as Record<string, unknown>)[dk] = dv;
      }
    }
  }
  next.debts = debts;
  return next;
}

export function mergeScenarioFromSanitizedPatch(
  current: NonNullable<DealWorkspaceSheet["scenario"]>,
  rawPatch: Record<string, unknown>,
): NonNullable<DealWorkspaceSheet["scenario"]> {
  const patch = sanitizeScenarioAiPatch(rawPatch);
  if (!patch) return current;
  return { ...current, ...patch } as NonNullable<DealWorkspaceSheet["scenario"]>;
}

export function mergeCoverFromSanitizedPatch(
  current: NonNullable<DealWorkspaceSheet["cover"]>,
  rawPatch: Record<string, unknown>,
): NonNullable<DealWorkspaceSheet["cover"]> {
  const patch = sanitizeCoverAiPatch(rawPatch);
  if (!patch) return current;
  return { ...current, ...patch } as NonNullable<DealWorkspaceSheet["cover"]>;
}
