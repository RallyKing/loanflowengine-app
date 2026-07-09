"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useOrgPermissions } from "@/lib/useOrgPermissions";
import { useActorUserKey } from "@/lib/useActorUserKey";
import { useViewer } from "@/lib/sessionContext";
import { NAV_PREFERENCES_STORAGE_KEY } from "@/lib/navigation/navPreferences";
import {
  catalogIdForPath,
  readNavRecencyMap,
  recordNavRecencyTouch,
} from "@/lib/navigation/navRecency";
import { buildResponsiveNavRegistry } from "@/lib/navigation/responsiveNavRegistry";
import {
  useConvexSubMountTrace,
  useConvexSubQueryArgsTrace,
} from "@/lib/convexSubDiagnosticsHooks";
import {
  defaultResolvedConfig,
  isNavigationPreset,
  normalizeResolvedNavigationConfig,
  resolvedNavigationConfigEquals,
  type NavItemOverride,
  type NavLayoutMode,
  type NavigationPreset,
  type NavQuickAction,
  type NavSyncScope,
  type OrgNavPolicy,
  type ResolvedNavigationConfig,
} from "@/lib/navigation/navigationResolve";

import type { NavCatalogEntry } from "@/lib/navigation/navigationCatalog";
import { ConvexQueryBoundary } from "@/components/ConvexQueryBoundary";

const LS_KEY_LEGACY = "dlc-nav-config-v1";

type NavigationConfigContextValue = {
  config: ResolvedNavigationConfig;
  resolvedItems: NavCatalogEntry[];
  resolvedQuickActions: NavQuickAction[];
  ready: boolean;
  orgPolicy: OrgNavPolicy | null;
  setPreset: (p: NavigationPreset) => void;
  setOverrides: (overrides: NavItemOverride[]) => void;
  replaceConfig: (next: ResolvedNavigationConfig) => void;
  setQuickActions: (actions: NavQuickAction[]) => void;
  setSyncScope: (scope: NavSyncScope) => void;
  setNavLayoutMode: (mode: NavLayoutMode) => void;
  resetToDefaults: () => void;
  persistRemote: () => Promise<void>;
  /** Global admin: when set, cloud load/save targets this `accountId` instead of the signed-in user. */
  globalAdminNavEditAccountId: string | null;
  setGlobalAdminNavEditAccountId: (id: string | null) => void;
  isGlobalAdmin: boolean;
};

const NavigationConfigContext = createContext<
  NavigationConfigContextValue | undefined
>(undefined);

function readLocal(): ResolvedNavigationConfig | null {
  if (typeof window === "undefined") return null;
  try {
    const raw =
      window.localStorage.getItem(NAV_PREFERENCES_STORAGE_KEY) ??
      window.localStorage.getItem(LS_KEY_LEGACY);
    if (!raw) return null;
    const p = JSON.parse(raw) as Partial<ResolvedNavigationConfig> & {
      overrides: NavItemOverride[];
      preset: NavigationPreset;
    };
    if (!p || typeof p !== "object" || !Array.isArray(p.overrides)) return null;
    if (!isNavigationPreset(String(p.preset))) return null;
    return normalizeResolvedNavigationConfig({
      formatVersion: p.formatVersion,
      preset: p.preset,
      overrides: p.overrides,
      quickActions: p.quickActions,
      syncScope: p.syncScope,
      navLayoutMode: p.navLayoutMode,
    });
  } catch {
    return null;
  }
}

function writeLocal(cfg: ResolvedNavigationConfig) {
  try {
    window.localStorage.setItem(
      NAV_PREFERENCES_STORAGE_KEY,
      JSON.stringify(cfg),
    );
  } catch {
    /* private mode */
  }
}

function NavigationConfigProviderConvex({
  accountId,
  children,
}: {
  accountId: string;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const viewer = useViewer();
  const isGlobalAdmin = viewer?.isGlobalAdmin === true;
  const memberUserKeyConvex = useActorUserKey().trim();
  const trimmed = accountId.trim();
  const [globalAdminNavEditAccountId, setGlobalAdminNavEditAccountId] =
    useState<string | null>(null);

  const effectiveRemoteAccount = useMemo(() => {
    if (isGlobalAdmin && globalAdminNavEditAccountId?.trim()) {
      return globalAdminNavEditAccountId.trim();
    }
    return trimmed;
  }, [isGlobalAdmin, globalAdminNavEditAccountId, trimmed]);

  const skipLocalPersist = Boolean(
    isGlobalAdmin &&
      globalAdminNavEditAccountId?.trim() &&
      globalAdminNavEditAccountId.trim() !== trimmed,
  );

  const persistLocalCopy = useCallback(
    (cfg: ResolvedNavigationConfig) => {
      if (skipLocalPersist) return;
      writeLocal(cfg);
    },
    [skipLocalPersist],
  );

  const { activeOrganizationId, effective } = useOrgPermissions();
  const grantedKey = useMemo(
    () =>
      JSON.stringify({
        phase:
          effective === undefined
            ? "pending"
            : effective === null
              ? "none"
              : "ok",
        perms: Array.isArray(effective?.permissions)
          ? [...effective.permissions].sort()
          : [],
      }),
    [effective],
  );
  const grantedStable = useMemo(():
    | readonly string[]
    | null
    | undefined => {
    const row = JSON.parse(grantedKey) as {
      phase: "pending" | "none" | "ok";
      perms: string[];
    };
    if (row.phase === "pending") return undefined;
    if (row.phase === "none") return null;
    return row.perms;
  }, [grantedKey]);

  const remoteQueryArgs = useMemo(():
    | { accountId: string; memberUserKey: string }
    | "skip" => {
    if (!effectiveRemoteAccount || !memberUserKeyConvex) return "skip";
    return {
      accountId: effectiveRemoteAccount,
      memberUserKey: memberUserKeyConvex,
    };
  }, [effectiveRemoteAccount, memberUserKeyConvex]);

  useConvexSubMountTrace("NavigationConfigProvider");
  useConvexSubQueryArgsTrace("NavigationConfigProvider:remote", remoteQueryArgs, {
    queryKey: "navigationConfig.getRemote",
    route: "shell",
  });
  const remote = useQuery(api.navigationUserConfig.getByAccountId, remoteQueryArgs);

  const orgPolicyQueryArgs = useMemo(():
    | { organizationId: Id<"organizations"> }
    | "skip" => {
    if (!activeOrganizationId) return "skip";
    return { organizationId: activeOrganizationId };
  }, [activeOrganizationId]);

  const orgPolicyRow = useQuery(
    api.navigationUserConfig.getOrgNavigationPolicy,
    orgPolicyQueryArgs,
  );
  const upsertRemote = useMutation(api.navigationUserConfig.upsert);

  const [config, setConfig] = useState<ResolvedNavigationConfig>(() =>
    readLocal() ?? defaultResolvedConfig(),
  );
  const [hydratedRemote, setHydratedRemote] = useState(false);

  const orgPolicyKey = useMemo(() => {
    const row = orgPolicyRow;
    if (!row) return "";
    const v = Array.isArray(row.enforcedVisibleIds)
      ? row.enforcedVisibleIds
      : [];
    const h = Array.isArray(row.enforcedHiddenIds)
      ? row.enforcedHiddenIds
      : [];
    return JSON.stringify({
      v: [...v].sort(),
      h: [...h].sort(),
    });
  }, [orgPolicyRow]);
  const orgPolicy = useMemo((): OrgNavPolicy | null => {
    if (!orgPolicyKey) return null;
    const parsed = JSON.parse(orgPolicyKey) as {
      v: string[];
      h: string[];
    };
    return {
      enforcedVisibleIds: new Set(parsed.v),
      enforcedHiddenIds: new Set(parsed.h),
    };
  }, [orgPolicyKey]);

  const [recencyMap, setRecencyMap] = useState(() => readNavRecencyMap());

  useEffect(() => {
    const id = catalogIdForPath(pathname ?? null);
    if (id) recordNavRecencyTouch(id);
    setRecencyMap(readNavRecencyMap());
  }, [pathname]);

  useEffect(() => {
    if (remote === undefined || !effectiveRemoteAccount) return;
    setHydratedRemote(true);

    const local = readLocal();
    if (local?.syncScope === "device" && !skipLocalPersist) {
      if (remote === null) return;
      setConfig((c) => {
        if (c.preset === remote.preset) return c;
        return { ...c, preset: remote.preset };
      });
      return;
    }

    if (remote === null) return;

    const next = normalizeResolvedNavigationConfig({
      formatVersion: remote.formatVersion,
      preset: remote.preset,
      overrides: remote.overrides as NavItemOverride[],
      quickActions: remote.quickActions as NavQuickAction[] | undefined,
      syncScope: remote.syncScope,
      navLayoutMode: remote.navLayoutMode,
    });
    setConfig((current) => {
      if (resolvedNavigationConfigEquals(current, next)) return current;
      persistLocalCopy(next);
      return next;
    });
  }, [remote, effectiveRemoteAccount, skipLocalPersist, persistLocalCopy]);

  const { primaryNav, quickActions: resolvedQuickActions } = useMemo(
    () =>
      buildResponsiveNavRegistry({
        config,
        grantedPermissions: grantedStable,
        orgPolicy,
        recency: recencyMap,
      }),
    [config, grantedStable, orgPolicy, recencyMap],
  );

  const resolvedItems = primaryNav;

  const setPreset = useCallback(
    (preset: NavigationPreset) => {
      setConfig((c) => {
        const next = { ...c, preset };
        persistLocalCopy(next);
        return next;
      });
    },
    [persistLocalCopy],
  );

  const setOverrides = useCallback(
    (overrides: NavItemOverride[]) => {
      setConfig((c) => {
        const next = { ...c, overrides };
        persistLocalCopy(next);
        return next;
      });
    },
    [persistLocalCopy],
  );

  const replaceConfig = useCallback(
    (next: ResolvedNavigationConfig) => {
      const norm = normalizeResolvedNavigationConfig({
        formatVersion: next.formatVersion,
        preset: next.preset,
        overrides: next.overrides,
        quickActions: next.quickActions,
        syncScope: next.syncScope,
        navLayoutMode: next.navLayoutMode,
      });
      setConfig(norm);
      persistLocalCopy(norm);
    },
    [persistLocalCopy],
  );

  const setQuickActions = useCallback(
    (actions: NavQuickAction[]) => {
      setConfig((c) => {
        const next = { ...c, quickActions: actions };
        persistLocalCopy(next);
        return next;
      });
    },
    [persistLocalCopy],
  );

  const setSyncScope = useCallback(
    (syncScope: NavSyncScope) => {
      setConfig((c) => {
        const next = { ...c, syncScope };
        persistLocalCopy(next);
        return next;
      });
    },
    [persistLocalCopy],
  );

  const setNavLayoutMode = useCallback(
    (navLayoutMode: NavLayoutMode) => {
      setConfig((c) => {
        const next = { ...c, navLayoutMode };
        persistLocalCopy(next);
        return next;
      });
    },
    [persistLocalCopy],
  );

  const resetToDefaults = useCallback(() => {
    const next = defaultResolvedConfig();
    setConfig(next);
    persistLocalCopy(next);
  }, [persistLocalCopy]);

  const persistRemote = useCallback(async () => {
    if (!effectiveRemoteAccount || !memberUserKeyConvex) return;
    if (config.syncScope === "device") return;
    await upsertRemote({
      accountId: effectiveRemoteAccount,
      memberUserKey: memberUserKeyConvex,
      preset: config.preset,
      overrides: config.overrides,
      quickActions: config.quickActions,
      syncScope: config.syncScope,
      navLayoutMode: config.navLayoutMode,
    });
  }, [
    effectiveRemoteAccount,
    memberUserKeyConvex,
    upsertRemote,
    config,
  ]);

  const setGlobalAdminNavEditAccountIdBounded = useCallback(
    (id: string | null) => {
      if (!isGlobalAdmin) return;
      setGlobalAdminNavEditAccountId(id?.trim() || null);
    },
    [isGlobalAdmin],
  );

  const value = useMemo(
    (): NavigationConfigContextValue => ({
      config,
      resolvedItems,
      resolvedQuickActions,
      ready: hydratedRemote || !effectiveRemoteAccount,
      orgPolicy,
      setPreset,
      setOverrides,
      replaceConfig,
      setQuickActions,
      setSyncScope,
      setNavLayoutMode,
      resetToDefaults,
      persistRemote,
      globalAdminNavEditAccountId,
      setGlobalAdminNavEditAccountId: setGlobalAdminNavEditAccountIdBounded,
      isGlobalAdmin,
    }),
    [
      config,
      resolvedItems,
      resolvedQuickActions,
      hydratedRemote,
      effectiveRemoteAccount,
      orgPolicy,
      setPreset,
      setOverrides,
      replaceConfig,
      setQuickActions,
      setSyncScope,
      setNavLayoutMode,
      resetToDefaults,
      persistRemote,
      globalAdminNavEditAccountId,
      setGlobalAdminNavEditAccountIdBounded,
      isGlobalAdmin,
    ],
  );

  return (
    <NavigationConfigContext.Provider value={value}>
      {children}
    </NavigationConfigContext.Provider>
  );
}

/**
 * Same as {@link NavigationConfigProviderConvex} but **does not** subscribe to
 * `navigationUserConfig` Convex queries (used when those subscriptions throw).
 */
function NavigationConfigProviderLocalOnly({
  accountId,
  children,
}: {
  accountId: string;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const viewer = useViewer();
  const isGlobalAdmin = viewer?.isGlobalAdmin === true;
  const memberUserKeyConvex = useActorUserKey().trim();
  const trimmed = accountId.trim();
  const [globalAdminNavEditAccountId, setGlobalAdminNavEditAccountId] =
    useState<string | null>(null);

  const effectiveRemoteAccount = useMemo(() => {
    if (isGlobalAdmin && globalAdminNavEditAccountId?.trim()) {
      return globalAdminNavEditAccountId.trim();
    }
    return trimmed;
  }, [isGlobalAdmin, globalAdminNavEditAccountId, trimmed]);

  const skipLocalPersist = Boolean(
    isGlobalAdmin &&
      globalAdminNavEditAccountId?.trim() &&
      globalAdminNavEditAccountId.trim() !== trimmed,
  );

  const persistLocalCopy = useCallback(
    (cfg: ResolvedNavigationConfig) => {
      if (skipLocalPersist) return;
      writeLocal(cfg);
    },
    [skipLocalPersist],
  );

  const { effective } = useOrgPermissions();
  const grantedKey = useMemo(
    () =>
      JSON.stringify({
        phase:
          effective === undefined
            ? "pending"
            : effective === null
              ? "none"
              : "ok",
        perms: Array.isArray(effective?.permissions)
          ? [...effective.permissions].sort()
          : [],
      }),
    [effective],
  );
  const grantedStable = useMemo(():
    | readonly string[]
    | null
    | undefined => {
    const row = JSON.parse(grantedKey) as {
      phase: "pending" | "none" | "ok";
      perms: string[];
    };
    if (row.phase === "pending") return undefined;
    if (row.phase === "none") return null;
    return row.perms;
  }, [grantedKey]);

  const upsertRemote = useMutation(api.navigationUserConfig.upsert);

  const [config, setConfig] = useState<ResolvedNavigationConfig>(() =>
    readLocal() ?? defaultResolvedConfig(),
  );
  const orgPolicy = null;

  const [recencyMap, setRecencyMap] = useState(() => readNavRecencyMap());

  useEffect(() => {
    const id = catalogIdForPath(pathname ?? null);
    if (id) recordNavRecencyTouch(id);
    setRecencyMap(readNavRecencyMap());
  }, [pathname]);

  const { primaryNav, quickActions: resolvedQuickActions } = useMemo(
    () =>
      buildResponsiveNavRegistry({
        config,
        grantedPermissions: grantedStable,
        orgPolicy,
        recency: recencyMap,
      }),
    [config, grantedStable, recencyMap],
  );

  const resolvedItems = primaryNav;

  const setPreset = useCallback(
    (preset: NavigationPreset) => {
      setConfig((c) => {
        const next = { ...c, preset };
        persistLocalCopy(next);
        return next;
      });
    },
    [persistLocalCopy],
  );

  const setOverrides = useCallback(
    (overrides: NavItemOverride[]) => {
      setConfig((c) => {
        const next = { ...c, overrides };
        persistLocalCopy(next);
        return next;
      });
    },
    [persistLocalCopy],
  );

  const replaceConfig = useCallback(
    (next: ResolvedNavigationConfig) => {
      const norm = normalizeResolvedNavigationConfig({
        formatVersion: next.formatVersion,
        preset: next.preset,
        overrides: next.overrides,
        quickActions: next.quickActions,
        syncScope: next.syncScope,
        navLayoutMode: next.navLayoutMode,
      });
      setConfig(norm);
      persistLocalCopy(norm);
    },
    [persistLocalCopy],
  );

  const setQuickActions = useCallback(
    (actions: NavQuickAction[]) => {
      setConfig((c) => {
        const next = { ...c, quickActions: actions };
        persistLocalCopy(next);
        return next;
      });
    },
    [persistLocalCopy],
  );

  const setSyncScope = useCallback(
    (syncScope: NavSyncScope) => {
      setConfig((c) => {
        const next = { ...c, syncScope };
        persistLocalCopy(next);
        return next;
      });
    },
    [persistLocalCopy],
  );

  const setNavLayoutMode = useCallback(
    (navLayoutMode: NavLayoutMode) => {
      setConfig((c) => {
        const next = { ...c, navLayoutMode };
        persistLocalCopy(next);
        return next;
      });
    },
    [persistLocalCopy],
  );

  const resetToDefaults = useCallback(() => {
    const next = defaultResolvedConfig();
    setConfig(next);
    persistLocalCopy(next);
  }, [persistLocalCopy]);

  const persistRemote = useCallback(async () => {
    if (!effectiveRemoteAccount || !memberUserKeyConvex) return;
    if (config.syncScope === "device") return;
    await upsertRemote({
      accountId: effectiveRemoteAccount,
      memberUserKey: memberUserKeyConvex,
      preset: config.preset,
      overrides: config.overrides,
      quickActions: config.quickActions,
      syncScope: config.syncScope,
      navLayoutMode: config.navLayoutMode,
    });
  }, [
    effectiveRemoteAccount,
    memberUserKeyConvex,
    upsertRemote,
    config,
  ]);

  const setGlobalAdminNavEditAccountIdBounded = useCallback(
    (id: string | null) => {
      if (!isGlobalAdmin) return;
      setGlobalAdminNavEditAccountId(id?.trim() || null);
    },
    [isGlobalAdmin],
  );

  const value = useMemo(
    (): NavigationConfigContextValue => ({
      config,
      resolvedItems,
      resolvedQuickActions,
      ready: true,
      orgPolicy,
      setPreset,
      setOverrides,
      replaceConfig,
      setQuickActions,
      setSyncScope,
      setNavLayoutMode,
      resetToDefaults,
      persistRemote,
      globalAdminNavEditAccountId,
      setGlobalAdminNavEditAccountId: setGlobalAdminNavEditAccountIdBounded,
      isGlobalAdmin,
    }),
    [
      config,
      resolvedItems,
      resolvedQuickActions,
      orgPolicy,
      setPreset,
      setOverrides,
      replaceConfig,
      setQuickActions,
      setSyncScope,
      setNavLayoutMode,
      resetToDefaults,
      persistRemote,
      globalAdminNavEditAccountId,
      setGlobalAdminNavEditAccountIdBounded,
      isGlobalAdmin,
    ],
  );

  return (
    <NavigationConfigContext.Provider value={value}>
      {children}
    </NavigationConfigContext.Provider>
  );
}

export function NavigationConfigProvider({
  accountId,
  children,
}: {
  accountId: string;
  children: ReactNode;
}) {
  const { activeOrganizationId } = useOrgPermissions();
  const trimmed = accountId.trim();
  return (
    <ConvexQueryBoundary
      recoverOnKeys={[trimmed, activeOrganizationId ?? ""]}
      fallback={
        <NavigationConfigProviderLocalOnly accountId={accountId}>
          {children}
        </NavigationConfigProviderLocalOnly>
      }
    >
      <NavigationConfigProviderConvex accountId={accountId}>
        {children}
      </NavigationConfigProviderConvex>
    </ConvexQueryBoundary>
  );
}

export function useNavigationConfig(): NavigationConfigContextValue {
  const ctx = useContext(NavigationConfigContext);
  if (!ctx) {
    throw new Error("useNavigationConfig requires NavigationConfigProvider");
  }
  return ctx;
}

/** Safe when provider may be absent (e.g. tests) — returns defaults. */
export function useNavigationConfigOptional():
  | NavigationConfigContextValue
  | undefined {
  return useContext(NavigationConfigContext);
}
