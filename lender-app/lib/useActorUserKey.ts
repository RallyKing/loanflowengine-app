"use client";

import { useViewer } from "@/lib/sessionContext";
import { useUserPreferences } from "@/lib/userPreferencesContext";

/**
 * Convex `userKey` / `memberUserKey`: signed-in viewer's userKey when present,
 * else falls back to the browser-local accountId so anonymous flows still work.
 */
export function useActorUserKey(): string {
  const viewer = useViewer();
  const { accountId } = useUserPreferences();
  if (viewer?.userKey) return viewer.userKey;
  return accountId.trim();
}
