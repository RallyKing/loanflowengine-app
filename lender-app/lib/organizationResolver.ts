"use client";

/**
 * Client helpers for GodMode organization resolution (`convex/organizationResolver.ts`).
 *
 * Uses `useQueries` (not `useQuery`) so a server error returns `Error` instead of
 * throwing during render and white-screening the signed-in shell.
 */
import { useMemo } from "react";
import { useQueries, type RequestForQueries } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useAuth } from "@/lib/sessionUiClient";

export type ListedOrganization = {
  _id: Id<"organizations">;
  name: string;
  updatedAt: number;
};

export function useListAllOrganizationsForGlobalAdmin(): {
  organizations: ListedOrganization[] | undefined;
  error: Error | null;
  loading: boolean;
} {
  const { isSignedIn, isGlobalAdmin, userId } = useAuth();
  const enabled = Boolean(isSignedIn && isGlobalAdmin && userId);

  const requests = useMemo((): RequestForQueries => {
    if (!enabled || !userId) return {};
    return {
      orgs: {
        query: api.organizationResolver.listAllOrganizations,
        args: { memberUserKey: userId },
      },
    };
  }, [enabled, userId]);

  const results = useQueries(requests);
  const raw = enabled ? results.orgs : undefined;

  if (raw instanceof Error) {
    return { organizations: [], error: raw, loading: false };
  }
  if (!enabled) {
    return { organizations: undefined, error: null, loading: false };
  }
  if (raw === undefined) {
    return { organizations: undefined, error: null, loading: true };
  }
  return {
    organizations: raw as ListedOrganization[],
    error: null,
    loading: false,
  };
}
