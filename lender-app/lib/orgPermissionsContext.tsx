"use client";

import { useQueries, type RequestForQueries } from "convex/react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useAuthStateOptional } from "@/lib/auth/authStateContext";
import {
  getStoredActiveOrganizationId,
  setStoredActiveOrganizationId,
  subscribeStoredActiveOrganizationId,
} from "@/lib/activeOrganizationId";
import {
  clearClientLenderHostOrgCookie,
  readHostMappedOrganizationIdFromDocument,
} from "@/lib/hostOrgCookie";
import { parseOrganizationId } from "@/lib/orgIdValidation";
import { hasOrgPermission, type OrgPermission } from "@/lib/orgRbac";
import { installOrgRbacDebugWindowApi } from "@/lib/orgRbacRuntimeSnapshot";
import { getOrCreateClientTraceId } from "@/lib/observability/clientTraceId";
import { useActorUserKey } from "@/lib/useActorUserKey";
import { useConvexOrgQueryReady } from "@/lib/useConvexOrgQueryReady";
import { useViewer } from "@/lib/sessionContext";
import { reconcileActiveOrgWithSession } from "@/lib/invariants/authRecovery";
import { reconcileActiveOrganizationWithMemberships } from "@/lib/invariants/reconcileActiveOrganizationWithMemberships";
import {
  MASTER_PLATFORM_MEMBERSHIP_FALLBACK,
  MASTER_PLATFORM_ORGANIZATION_ID,
  resolveMasterOrganizationFallback,
} from "@/lib/invariants/masterOrganizationFallback";
import type { FunctionReturnType } from "convex/server";
import { appendPriorityDebugClientLog, debugAgentLogPostUrl } from "@/lib/debugClientLog";

type EffectivePermissions = FunctionReturnType<
  typeof api.organizations.effectivePermissions
>;

/** Stable identity for Convex `effectivePermissions` payloads (ignores array order noise). */
function stableEffectiveKey(
  e: EffectivePermissions | null | undefined,
): string {
  /** Convex `useQuery`: skipped/pending vs loaded `null` must not share one key or context snapshots stick on `undefined`. */
  if (e === undefined) return "\0__pending__";
  if (e === null) return "\0__none__";
  const perms = e.permissions;
  const p = Array.isArray(perms) ? [...perms].sort().join("\u0001") : "";
  return JSON.stringify({
    p,
    t: e.tenantRole ?? null,
    rk: e.productRoleKey ?? "",
    rl: e.productRoleLabel ?? "",
  });
}

export type OrgPermissionsContextValue = {
  activeOrganizationId: Id<"organizations"> | null;
  effective: EffectivePermissions | undefined;
  isRbacActive: boolean;
  can: (permission: OrgPermission) => boolean;
};

const OrgPermissionsContext = createContext<OrgPermissionsContextValue | null>(
  null,
);

/**
 * Single source of truth for active org + effective Convex permissions.
 * Mount once under `UserPreferencesProvider` (needs `useActorUserKey`).
 */
export function OrgPermissionsProvider({ children }: { children: ReactNode }) {
  const auth = useAuthStateOptional();
  const actorKey = useActorUserKey();
  const viewer = useViewer();
  const viewerOrgId = viewer?.organizationId ?? null;
  const prevUserKeyRef = useRef<string | undefined>(viewer?.userKey);
  const actorTrimmed = actorKey.trim();
  const orgQueryReady = useConvexOrgQueryReady();
  const membershipQueries = useMemo((): RequestForQueries => {
    if (!actorTrimmed || !orgQueryReady) return {};
    return {
      memberships: {
        query: api.organizations.listMyMemberships,
        args: { userKey: actorTrimmed },
      },
    };
  }, [actorTrimmed, orgQueryReady]);
  const membershipQueryResults = useQueries(membershipQueries);
  const membershipRowsRaw = actorTrimmed
    ? membershipQueryResults.memberships
    : undefined;
  const membershipQueryFailed = membershipRowsRaw instanceof Error;
  const membershipRows = membershipQueryFailed
    ? MASTER_PLATFORM_MEMBERSHIP_FALLBACK
    : membershipRowsRaw;
  const [activeOrganizationId, setActiveOrganizationId] = useState<
    Id<"organizations"> | null
  >(
    () =>
      parseOrganizationId(viewerOrgId ?? null) ??
      MASTER_PLATFORM_ORGANIZATION_ID,
  );

  useEffect(() => {
    if (viewer?.impersonation?.targetOrganizationId) {
      const impOrg = parseOrganizationId(viewer.impersonation.targetOrganizationId);
      if (impOrg) {
        setStoredActiveOrganizationId(impOrg);
        setActiveOrganizationId(impOrg);
      }
      return;
    }
    reconcileActiveOrgWithSession(
      viewerOrgId ? { organizationId: viewerOrgId } : null,
    );
  }, [viewerOrgId, viewer?.impersonation?.targetOrganizationId]);

  useEffect(() => {
    if (!actorTrimmed) return;
    if (membershipQueryFailed) {
      const fallback = resolveMasterOrganizationFallback(viewerOrgId);
      setStoredActiveOrganizationId(fallback);
      setActiveOrganizationId((prev) => (prev === fallback ? prev : fallback));
      return;
    }
    if (membershipRows === undefined) return;
    const next = reconcileActiveOrganizationWithMemberships({
      memberships: membershipRows,
      sessionOrganizationId: viewerOrgId,
      isGlobalAdmin: viewer?.isGlobalAdmin === true,
    });
    setActiveOrganizationId((prev) => (prev === next ? prev : next));
  }, [
    actorTrimmed,
    membershipRows,
    membershipQueryFailed,
    viewerOrgId,
    viewer?.isGlobalAdmin,
  ]);

  /**
   * Middleware may set `lender_host_org` when the request host is not the canonical
   * app hostname. If that cookie disagrees with the signed-in session’s default
   * workspace, Convex org-scoped queries target the wrong tenant (empty hub). Prefer
   * the session org and clear the client-readable cookie so `resolve()` can match.
   */
  useEffect(() => {
    if (typeof window === "undefined") return;
    const host = parseOrganizationId(
      readHostMappedOrganizationIdFromDocument(),
    );
    const v = parseOrganizationId(viewerOrgId ?? null);
    if (!host || !v || host === v) return;
    clearClientLenderHostOrgCookie();
    setStoredActiveOrganizationId(v);
    setActiveOrganizationId((prev) => (prev === v ? prev : v));
  }, [viewerOrgId]);

  useEffect(() => {
    const prev = prevUserKeyRef.current;
    const next = viewer?.userKey;
    if (prev && next && prev !== next) {
      const v = parseOrganizationId(viewer?.organizationId ?? null);
      if (v) setStoredActiveOrganizationId(v);
    }
    prevUserKeyRef.current = next;
  }, [viewer?.userKey, viewer?.organizationId]);

  useEffect(() => {
    const resolve = (): Id<"organizations"> | null => {
      const hostRaw = readHostMappedOrganizationIdFromDocument();
      const host = parseOrganizationId(hostRaw);
      if (host) return host;
      const stored = getStoredActiveOrganizationId();
      if (stored) return stored;
      const viewerParsed = parseOrganizationId(viewerOrgId ?? null);
      if (viewerParsed) return viewerParsed;
      return MASTER_PLATFORM_ORGANIZATION_ID;
    };
    const resolved = resolve();
    setActiveOrganizationId((prev) => (prev === resolved ? prev : resolved));
    if (resolved && parseOrganizationId(viewerOrgId ?? null) === resolved) {
      queueMicrotask(() => {
        if (!getStoredActiveOrganizationId()) {
          setStoredActiveOrganizationId(resolved);
        }
      });
    }
    return subscribeStoredActiveOrganizationId(() => {
      const next = resolve();
      setActiveOrganizationId((prev) => (prev === next ? prev : next));
    });
  }, [viewerOrgId]);

  useEffect(() => {
    installOrgRbacDebugWindowApi();
  }, []);

  const effectiveQueryArgs = useMemo(() => {
    const trimmed = actorKey.trim();
    const sessionBroken =
      auth?.state === "expired" ||
      auth?.state === "revoked" ||
      auth?.state === "unauthenticated";
    if (!trimmed || sessionBroken || !orgQueryReady) return "skip" as const;
    const orgId = activeOrganizationId ?? MASTER_PLATFORM_ORGANIZATION_ID;
    return {
      organizationId: orgId,
      userKey: trimmed,
      clientTraceId: getOrCreateClientTraceId() || undefined,
    };
  }, [activeOrganizationId, actorKey, auth?.state, orgQueryReady]);

  const effectivePermissionsQueries = useMemo((): RequestForQueries => {
    if (effectiveQueryArgs === "skip") return {};
    const traceId = effectiveQueryArgs.clientTraceId;
    return {
      effectivePermissions: {
        query: api.organizations.effectivePermissions,
        args: {
          organizationId: effectiveQueryArgs.organizationId,
          userKey: effectiveQueryArgs.userKey,
          ...(traceId ? { clientTraceId: traceId } : {}),
        },
      },
    };
  }, [effectiveQueryArgs]);

  const effectiveQueryResults = useQueries(effectivePermissionsQueries);
  const effectiveRaw = effectiveQueryResults.effectivePermissions;

  useEffect(() => {
    if (!(effectiveRaw instanceof Error)) return;
    appendPriorityDebugClientLog({
      sessionId: "f25461",
      runId: "effective-permissions",
      hypothesisId: "H_effective_subscription_error",
      location: "orgPermissionsContext.tsx:effectiveRaw",
      message: effectiveRaw.message,
      data: {
        name: effectiveRaw.name,
        stack: effectiveRaw.stack?.slice(0, 500) ?? null,
        querySkipped: effectiveQueryArgs === "skip",
        activeOrganizationId: activeOrganizationId ?? null,
        nextPublicConvexUrl:
          typeof process !== "undefined"
            ? process.env.NEXT_PUBLIC_CONVEX_URL ?? null
            : null,
      },
      timestamp: Date.now(),
    });
  }, [effectiveRaw, effectiveQueryArgs, activeOrganizationId]);

  /** Convex `useQuery` throws on server errors; `useQueries` returns `Error` so the shell can degrade gracefully. */
  const effective: EffectivePermissions | undefined | null =
    effectiveRaw instanceof Error
      ? effectiveRaw.message === "Unauthorized"
        ? undefined
        : null
      : effectiveRaw === undefined
        ? undefined
        : effectiveRaw;

  const effectiveRef = useRef(effective);
  effectiveRef.current = effective;

  /** Ignore referential churn and unordered permission lists from Convex. */
  const effectiveDataKey = useMemo(
    () => stableEffectiveKey(effective),
    [effective],
  );

  const effectiveKeyThrashRef = useRef<{
    lastKey: string;
    windowStart: number;
    transitions: number;
  }>({ lastKey: "", windowStart: 0, transitions: 0 });
  useEffect(() => {
    const now = Date.now();
    const r = effectiveKeyThrashRef.current;
    if (r.lastKey === effectiveDataKey) return;
    if (r.lastKey === "" || now - r.windowStart > 2000) {
      r.windowStart = now;
      r.transitions = 1;
    } else {
      r.transitions += 1;
    }
    r.lastKey = effectiveDataKey;
    if (r.transitions < 10) return;
    // #region agent log
    appendPriorityDebugClientLog({
      sessionId: "f25461",
      runId: "eff-key-thrash",
      hypothesisId: "H185_effective_key_flap",
      location: "orgPermissionsContext.tsx:effectiveDataKey",
      message: "effectiveDataKey changed >=10x within 2s",
      data: {
        transitions: r.transitions,
        keySample: effectiveDataKey.slice(0, 240),
        activeOrganizationId: activeOrganizationId ?? null,
        querySkipped: effectiveQueryArgs === "skip",
      },
      timestamp: now,
    });
    void fetch(debugAgentLogPostUrl(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: "f25461",
        runId: "eff-key-thrash",
        hypothesisId: "H185_effective_key_flap",
        location: "orgPermissionsContext.tsx:effectiveDataKey",
        message: "effectiveDataKey changed >=10x within 2s",
        data: {
          transitions: r.transitions,
          keySample: effectiveDataKey.slice(0, 240),
          activeOrganizationId: activeOrganizationId ?? null,
          querySkipped: effectiveQueryArgs === "skip",
        },
        timestamp: now,
      }),
      keepalive: true,
    }).catch(() => {});
    // #endregion
    r.transitions = 0;
    r.windowStart = now;
  }, [effectiveDataKey, activeOrganizationId, effectiveQueryArgs]);

  const effectiveForContext = useMemo(
    () => effectiveRef.current,
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `effectiveDataKey` is the intentional invalidation gate (stable permission semantics; avoids Convex referential churn).
    [effectiveDataKey],
  );

  const can = useCallback(
    (permission: OrgPermission): boolean => {
      const orgId = activeOrganizationId ?? MASTER_PLATFORM_ORGANIZATION_ID;
      if (!orgId) return false;
      /** Session-backed GodMode: full product access unless impersonating (tenant view). */
      if (viewer?.isGlobalAdmin === true && !viewer?.impersonation) return true;
      const perms = effective?.permissions;
      if (!Array.isArray(perms)) return false;
      try {
        return hasOrgPermission(perms, permission);
      } catch {
        return false;
      }
    },
    [activeOrganizationId, viewer?.isGlobalAdmin, viewer?.impersonation, effective],
  );

  const debugPrevStableKeyRef = useRef<string | null>(null);
  useEffect(() => {
    const prevK = debugPrevStableKeyRef.current;
    const keyUnchanged = prevK === effectiveDataKey;
    debugPrevStableKeyRef.current = effectiveDataKey;
    // #region agent log
    const payload = {
      sessionId: "f25461",
      runId: "verify-stable-key",
      hypothesisId: "H1_perm_order_churn",
      location: "orgPermissionsContext.tsx:stableKey",
      message: "effective tick vs stable key",
      data: {
        keyUnchanged,
        effUndefined: effective === undefined,
        effIsNull: effective === null,
        querySkipped: effectiveQueryArgs === "skip",
        keyLen: effectiveDataKey.length,
      },
      timestamp: Date.now(),
    };
    const body = JSON.stringify(payload);
    void (async () => {
      try {
        const r = await fetch(debugAgentLogPostUrl(), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body,
        });
        if (process.env.NODE_ENV === "development" && !r.ok) {
          console.warn("[debug-agent-log]", r.status, await r.text());
        }
      } catch (e) {
        if (process.env.NODE_ENV === "development") {
          console.warn("[debug-agent-log] fetch failed", e);
        }
      }
      if (process.env.NODE_ENV === "development") {
        fetch("http://127.0.0.1:7412/ingest/32d854df-a7db-4c6f-bb28-ee2545e32c91", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Debug-Session-Id": "f25461",
          },
          body,
        }).catch(() => {});
      }
    })();
    // #endregion
  }, [effective, effectiveDataKey, effectiveQueryArgs]);

  const value = useMemo(
    (): OrgPermissionsContextValue => ({
      activeOrganizationId,
      effective: effectiveForContext,
      isRbacActive: Boolean(activeOrganizationId),
      can,
    }),
    [activeOrganizationId, effectiveForContext, can],
  );

  return (
    <OrgPermissionsContext.Provider value={value}>
      {children}
    </OrgPermissionsContext.Provider>
  );
}

export function useOrgPermissions(): OrgPermissionsContextValue {
  const v = useContext(OrgPermissionsContext);
  if (!v) {
    throw new Error(
      "useOrgPermissions requires OrgPermissionsProvider (signed-in shell with preferences).",
    );
  }
  return v;
}
