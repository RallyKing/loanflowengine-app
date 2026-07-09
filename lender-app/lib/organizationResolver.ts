"use client";

/**
 * Client helpers for GodMode organization resolution (`convex/organizationResolver.ts`).
 */
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useAuth } from "@/lib/sessionUiClient";

export function useListAllOrganizationsForGlobalAdmin() {
  const { isSignedIn, isGlobalAdmin, userId } = useAuth();
  return useQuery(
    api.organizationResolver.listAllOrganizations,
    isSignedIn && isGlobalAdmin && userId
      ? { memberUserKey: userId }
      : "skip",
  );
}
