"use client";

import { useViewer } from "@/lib/sessionContext";

/**
 * Cookie-backed workspace session (Convex DB session or legacy HMAC cookie).
 */
export function useSession() {
  const viewer = useViewer();
  return {
    isLoaded: true as const,
    isAuthenticated: !!viewer,
    viewer,
    userKey: viewer?.userKey ?? null,
    organizationId: viewer?.organizationId ?? null,
  };
}
