import type { SemanticSurfaceRole } from "@/lib/platform-framework/semanticSurfaces";

/**
 * Shared validation architecture — UI-agnostic result shape consumed by `FinanceField`
 * and server adapters. Map Zod/issue messages into `FieldValidationState` at boundaries.
 */

export type FieldValidationSeverity = "error" | "warning" | "info";

export type FieldValidationState = {
  message: string;
  severity: FieldValidationSeverity;
  /** Optional hint for assistive tech / diagnostics */
  code?: string;
};

export function validationToSemanticRole(
  severity: FieldValidationSeverity,
): SemanticSurfaceRole {
  switch (severity) {
    case "error":
      return "error";
    case "warning":
      return "warning";
    case "info":
    default:
      return "info";
  }
}

/** Merge multiple states — errors win over warnings over info. */
export function combineFieldValidation(
  states: FieldValidationState[],
): FieldValidationState | null {
  if (states.length === 0) return null;
  const err = states.find((s) => s.severity === "error");
  if (err) return err;
  const warn = states.find((s) => s.severity === "warning");
  if (warn) return warn;
  return states[0] ?? null;
}

export function fieldAriaDescribedBy(
  hintId: string | undefined,
  errorId: string | undefined,
): string | undefined {
  const parts = [hintId, errorId].filter(Boolean);
  if (parts.length === 0) return undefined;
  return parts.join(" ");
}
