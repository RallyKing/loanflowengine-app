"use client";

import { useConvexAuth } from "convex/react";
import { useAuth } from "@/lib/sessionUiClient";
import { useActorUserKey } from "@/lib/useActorUserKey";

/**
 * True when Convex has applied a workspace RS256 JWT (`tokenProbe === "ready"`).
 */
export function useConvexJwtReady(): boolean {
  const { isLoading, isAuthenticated } = useConvexAuth();
  return !isLoading && isAuthenticated;
}

/**
 * True when org-scoped Convex queries may run.
 * Signed-in session + actor key is enough — backend accepts verified workspace
 * members via `memberUserKey` (JWT preferred when attached).
 */
export function useConvexOrgQueryReady(): boolean {
  const { isLoaded, isSignedIn } = useAuth();
  const memberKey = useActorUserKey().trim();
  return isLoaded && isSignedIn && memberKey.length > 0;
}
