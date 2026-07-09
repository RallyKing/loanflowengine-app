"use client";

import { useCallback, useMemo } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  canonicalDisplayUsername,
  opaqueUserKeyFallback,
} from "@/lib/auth/canonicalDisplayUsername";

/**
 * Resolve org member userKeys to canonical auth usernames for display.
 */
export function useOrgMemberDisplayLabel(
  organizationId: Id<"organizations"> | null | undefined,
  memberUserKey: string | undefined,
) {
  const members = useQuery(
    api.organizations.listMembers,
    organizationId && memberUserKey?.trim()
      ? { organizationId, memberUserKey: memberUserKey.trim() }
      : "skip",
  );

  const map = useMemo(() => {
    const m = new Map<string, string>();
    for (const row of members ?? []) {
      const label =
        row.canonicalDisplayUsername?.trim() ||
        canonicalDisplayUsername(row.displayUsername) ||
        opaqueUserKeyFallback(row.userKey);
      m.set(row.userKey, label);
    }
    return m;
  }, [members]);

  const labelFor = useCallback(
    (
      userKey: string | undefined | null,
      opts?: { youKey?: string; youLabel?: string },
    ) => {
      const k = userKey?.trim() ?? "";
      if (!k) return "";
      const youKey = opts?.youKey?.trim();
      if (youKey && k === youKey) return opts?.youLabel ?? "You";
      const hit = map.get(k);
      if (hit) return hit;
      if (k.includes("@")) return canonicalDisplayUsername(k);
      return opaqueUserKeyFallback(k);
    },
    [map],
  );

  return { members, labelFor, ready: members !== undefined };
}
