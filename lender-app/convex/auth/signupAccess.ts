/**
 * Self-serve signup access gate (pending approval before product use).
 */
import type { Doc } from "../_generated/dataModel";
import { isE2ESandboxNormalizedUsername } from "../../lib/auth/e2eSandboxAuth";
import { authUserIsPrimaryPlatformAdmin } from "./primaryPlatformAdmin";

export type SignupAccessStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "disabled";

/** Effective status — legacy rows and primary platform admin are always approved. */
export function effectiveSignupAccessStatus(
  user: Doc<"authUsers"> | null | undefined,
): SignupAccessStatus {
  if (!user) return "disabled";
  if (authUserIsPrimaryPlatformAdmin(user)) return "approved";
  if (isE2ESandboxNormalizedUsername(user.normalizedUsername)) {
    return "approved";
  }
  const raw = user.accessStatus;
  if (
    raw === "pending" ||
    raw === "approved" ||
    raw === "rejected" ||
    raw === "disabled"
  ) {
    return raw;
  }
  return "approved";
}

export function signupAccessAllowsLogin(
  user: Doc<"authUsers"> | null | undefined,
): boolean {
  return effectiveSignupAccessStatus(user) === "approved";
}

export function signupAccessLoginBlockCode(
  user: Doc<"authUsers"> | null | undefined,
): "PENDING_APPROVAL" | "ACCOUNT_REJECTED" | "ACCOUNT_DISABLED" | null {
  const status = effectiveSignupAccessStatus(user);
  switch (status) {
    case "approved":
      return null;
    case "pending":
      return "PENDING_APPROVAL";
    case "rejected":
      return "ACCOUNT_REJECTED";
    case "disabled":
      return "ACCOUNT_DISABLED";
    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
}
