import type { AuthBridgeErrorStage } from "./authStructuredError";

export function httpStatusForAuthBridgeStage(
  stage: AuthBridgeErrorStage,
  fields: Record<string, unknown>,
): number {
  switch (stage) {
    case "bridgeProofSign":
    case "bridgeProofVerify":
      return 503;
    case "loginLookup": {
      const reason = fields.reason;
      if (reason === "missing_password_hash") return 403;
      if (
        reason === "invalid_bridge_proof_hmac" ||
        reason === "auth_bridge_secret_too_short_or_missing"
      ) {
        return 503;
      }
      return 503;
    }
    case "verifyPassword":
      return 503;
    case "sessionIssue":
      return 503;
    case "membershipResolve":
      return 503;
    default:
      return 500;
  }
}

export function publicCodeForAuthBridgeStage(
  stage: AuthBridgeErrorStage,
  fields: Record<string, unknown>,
): string {
  switch (stage) {
    case "bridgeProofSign":
    case "bridgeProofVerify":
      return "BRIDGE_MISCONFIGURED";
    case "loginLookup":
      if (fields.reason === "missing_password_hash") return "ACCOUNT_DISABLED";
      return "BRIDGE_MISCONFIGURED";
    case "verifyPassword":
      return "CREDENTIAL_STORE_ERROR";
    case "sessionIssue":
      return "SESSION_UNAVAILABLE";
    case "membershipResolve":
      return "MEMBERSHIP_UNAVAILABLE";
    default:
      return "SERVER_ERROR";
  }
}

export function publicMessageForAuthBridgeStage(
  stage: AuthBridgeErrorStage,
  fields: Record<string, unknown>,
): string {
  switch (stage) {
    case "bridgeProofSign":
    case "bridgeProofVerify":
      return "Sign-in bridge is misconfigured. Contact support if this persists.";
    case "loginLookup":
      if (fields.reason === "missing_password_hash") {
        return "This account cannot sign in until a password is set.";
      }
      return "Sign-in bridge is misconfigured. Contact support if this persists.";
    case "verifyPassword":
      return "Stored credentials could not be verified. Contact support.";
    case "sessionIssue":
      return "Could not create a session. Try again shortly.";
    case "membershipResolve":
      return "Workspace membership could not be verified. Try again shortly.";
    default:
      return "Sign-in unavailable.";
  }
}
