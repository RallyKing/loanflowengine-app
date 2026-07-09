import type { LiveConnectionPhase } from "@/lib/connectionState";
import type { AuthMachineState, SessionInvalidReason } from "@/lib/auth/authTypes";
import { AUTH_DEGRADED_RETRY_THRESHOLD } from "@/lib/auth/authTypes";

export function deriveAuthMachineState(input: {
  viewerPresent: boolean;
  clientHydrated: boolean;
  sessionInvalid: SessionInvalidReason | null;
  convexPhase: LiveConnectionPhase;
  connectionRetries: number;
  browserOnline: boolean;
  isWebSocketConnected: boolean;
}): AuthMachineState {
  if (input.sessionInvalid === "expired") return "expired";
  if (input.sessionInvalid === "revoked") return "revoked";
  if (!input.viewerPresent) return "unauthenticated";

  if (!input.clientHydrated) return "loading";

  if (input.convexPhase === "reconnecting") {
    if (
      input.browserOnline &&
      input.connectionRetries >= AUTH_DEGRADED_RETRY_THRESHOLD
    ) {
      return "degraded";
    }
    return "reconnecting";
  }

  if (!input.isWebSocketConnected) {
    if (!input.browserOnline) return "degraded";
    if (input.convexPhase === "connecting") return "loading";
    if (input.connectionRetries >= AUTH_DEGRADED_RETRY_THRESHOLD)
      return "degraded";
    return "loading";
  }

  return "authenticated";
}
