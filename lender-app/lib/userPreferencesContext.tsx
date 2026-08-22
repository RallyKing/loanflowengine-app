"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  useMutation,
  useQueries,
  type RequestForQueries,
} from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { getOrCreateAccountId } from "@/lib/userAccountIdentity";
import { useViewer } from "@/lib/sessionContext";
import {
  getDefaultUserPreferences,
  mergeServerUserPreferences,
  mergeUserPreferencesPatch,
  type UserPreferencesV1,
} from "@/lib/userPreferencesModel";
import {
  applyUiDisplayColorsToElement,
  parseUiDisplayColors,
} from "@/lib/uiDisplaySettings";
import { applyUiDensityToElement } from "@/lib/m3/uiDensity";
import { appendPriorityDebugClientLog } from "@/lib/debugClientLog";

export type UserPreferencesSyncOptions = {
  /** When set, server enforces `settings.access` for this org (RBAC). */
  rbacOrganizationId?: Id<"organizations">;
};

export type UserPreferencesContextValue = {
  /** Opaque account key (empty = storage unavailable; Convex sync skipped). */
  accountId: string;
  /** Merged server row + defaults; safe to read before `ready`. */
  preferences: UserPreferencesV1;
  /** True after account id is known and the Convex query has settled (or sync skipped). */
  ready: boolean;
  /** Replace the full preferences document on the server (no pipeline file writes). */
  replacePreferences: (
    next: UserPreferencesV1,
    opts?: UserPreferencesSyncOptions,
  ) => Promise<void>;
  /** Shallow merge patch then persist. */
  updatePreferences: (
    patch: Partial<UserPreferencesV1>,
    opts?: UserPreferencesSyncOptions,
  ) => Promise<void>;
};

const UserPreferencesContext = createContext<UserPreferencesContextValue | null>(
  null,
);

export function UserPreferencesProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const viewer = useViewer();
  const [browserAccountId, setBrowserAccountId] = useState<string | null>(null);

  useLayoutEffect(() => {
    setBrowserAccountId(getOrCreateAccountId());
  }, []);

  /**
   * Identity priority: signed-in viewer (cookie session) > browser-local UUID.
   * When signed in we expose the viewer's `userKey` as `accountId` so every
   * component that builds Convex args from `useUserPreferences().accountId`
   * naturally sends the canonical org-member key (instead of leaking a
   * browser UUID into `memberUserKey`, which used to break every org-scoped
   * query for newly-signed-in users with no localStorage).
   */
  const sessionUserKey = viewer?.userKey?.trim() ?? "";
  const hasSessionViewer = sessionUserKey.length > 0;

  const resolvedAccountId = viewer?.userKey?.trim()
    ? viewer.userKey
    : (browserAccountId ?? "");
  const canSync = resolvedAccountId.length > 0;

  const userPrefsQueries = useMemo((): RequestForQueries => {
    if (!canSync) return {};
    return {
      serverDoc: {
        query: api.userPreferences.getByAccountId,
        args: { accountId: resolvedAccountId },
      },
    };
  }, [canSync, resolvedAccountId]);

  const userPrefsResults = useQueries(userPrefsQueries);
  const serverDocRaw = userPrefsResults.serverDoc;

  useEffect(() => {
    if (!(serverDocRaw instanceof Error)) return;
    appendPriorityDebugClientLog({
      sessionId: "f25461",
      runId: "user-preferences",
      hypothesisId: "H_user_prefs_subscription_error",
      location: "userPreferencesContext.tsx:serverDoc",
      message: serverDocRaw.message,
      data: {
        name: serverDocRaw.name,
        accountIdLen: resolvedAccountId.length,
      },
      timestamp: Date.now(),
    });
  }, [serverDocRaw, resolvedAccountId]);

  const serverDoc = useMemo(() => {
    if (!canSync) return null;
    if (serverDocRaw === undefined) return undefined;
    if (serverDocRaw instanceof Error) return null;
    return serverDocRaw;
  }, [canSync, serverDocRaw]);

  const ready = useMemo(() => {
    if (!hasSessionViewer && browserAccountId === null) return false;
    if (!canSync) return true;
    return serverDocRaw !== undefined;
  }, [hasSessionViewer, browserAccountId, canSync, serverDocRaw]);

  const preferences = useMemo(() => {
    if (!canSync) return getDefaultUserPreferences();
    if (serverDoc === undefined) return getDefaultUserPreferences();
    return mergeServerUserPreferences(serverDoc);
  }, [canSync, serverDoc]);

  const upsert = useMutation(api.userPreferences.upsert);

  const replacePreferences = useCallback(
    async (next: UserPreferencesV1, opts?: UserPreferencesSyncOptions) => {
      if (!canSync || !ready) return;
      await upsert({
        accountId: resolvedAccountId,
        defaultBlocks: next.defaultBlocks,
        blockOrder: next.blockOrder,
        collapseBehavior: next.collapseBehavior,
        displaySettings: next.displaySettings,
        behaviorSettings: next.behaviorSettings,
        newFileDrawerSettings: next.newFileDrawerSettings,
        favoriteFileBlocks: next.favoriteFileBlocks,
        gettingStartedDismissed: next.gettingStartedDismissed,
        gettingStartedComplete: next.gettingStartedComplete,
        gettingStartedSkipped: next.gettingStartedSkipped,
        rbacOrganizationId: opts?.rbacOrganizationId,
      });
    },
    [canSync, ready, resolvedAccountId, upsert],
  );

  const updatePreferences = useCallback(
    async (
      patch: Partial<UserPreferencesV1>,
      opts?: UserPreferencesSyncOptions,
    ) => {
      if (!canSync || !ready) return;
      const next = mergeUserPreferencesPatch(preferences, patch);
      await replacePreferences(next, opts);
    },
    [canSync, ready, preferences, replacePreferences],
  );

  const value = useMemo(
    (): UserPreferencesContextValue => ({
      accountId: resolvedAccountId,
      preferences,
      ready,
      replacePreferences,
      updatePreferences,
    }),
    [
      preferences,
      ready,
      replacePreferences,
      resolvedAccountId,
      updatePreferences,
    ],
  );

  const preferencesRef = useRef(preferences);
  preferencesRef.current = preferences;
  const displaySettingsKey = useMemo(
    () => JSON.stringify(preferences.displaySettings ?? {}),
    [preferences.displaySettings],
  );

  useLayoutEffect(() => {
    if (typeof document === "undefined") return;
    const root = document.documentElement;
    const p = preferencesRef.current;
    applyUiDisplayColorsToElement(
      root,
      parseUiDisplayColors(p.displaySettings),
    );
    applyUiDensityToElement(root, p.displaySettings);
  }, [displaySettingsKey]);

  return (
    <UserPreferencesContext.Provider value={value}>
      {children}
    </UserPreferencesContext.Provider>
  );
}

export function useUserPreferences(): UserPreferencesContextValue {
  const c = useContext(UserPreferencesContext);
  if (!c) {
    throw new Error("useUserPreferences must be used within UserPreferencesProvider");
  }
  return c;
}

/** Public-portal safe: defaults when outside UserPreferencesProvider. */
export function useUserPreferencesOptional(): UserPreferencesContextValue & {
  isProvided: boolean;
} {
  const c = useContext(UserPreferencesContext);
  if (c) return { ...c, isProvided: true };
  const preferences = getDefaultUserPreferences();
  return {
    accountId: "",
    preferences,
    ready: true,
    replacePreferences: async () => {},
    updatePreferences: async () => {},
    isProvided: false,
  };
}
