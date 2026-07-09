export type AuthBridgeErrorStage =
  | "loginLookup"
  | "verifyPassword"
  | "bridgeProofSign"
  | "bridgeProofVerify"
  | "sessionIssue"
  | "membershipResolve";

export function authBridgeStructuredError(
  stage: AuthBridgeErrorStage,
  fields: Record<string, unknown>,
): Error {
  return new Error(
    JSON.stringify({
      stage,
      ...fields,
    }),
  );
}

export function tryParseAuthBridgeStructuredError(
  err: unknown,
): Record<string, unknown> | null {
  if (!(err instanceof Error)) return null;
  try {
    const o = JSON.parse(err.message) as unknown;
    if (o && typeof o === "object" && "stage" in (o as object)) {
      return o as Record<string, unknown>;
    }
    return null;
  } catch {
    return null;
  }
}
